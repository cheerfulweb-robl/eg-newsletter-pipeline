// admin-press-release: AI Press Release Writer for /staff/pressroom.html
//
// An admin provides Business NAP (Name, Address, Phone, Website), optional source URL,
// and brief notes. This function calls Claude (using the existing ANTHROPIC_API_KEY secret)
// and returns a structured, AP-style press release draft ready for review and publishing.
//
// Deploy: npx supabase functions deploy admin-press-release --project-ref cyxomkhydsmttefanalx

import Anthropic from "npm:@anthropic-ai/sdk@1.8.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@1.8.0/helpers/zod";
import { z } from "npm:zod@4.6.7";

const MODEL = "claude-opus-5-5";
const FETCH_TIMEOUT_MS = 12_000;
const MAX_PAGE_BYTES = 1_000_000;
const MAX_PAGE_CHARS = 24_000;
const MAX_REDIRECTS = 4;

const ALLOWED_ORIGINS = new Set([
  "https://welcomeeg.ca",
  "https://www.welcomeeg.ca",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function corsHeadersFor(req?: Request): Record<string, string> {
  const origin = req?.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://welcomeeg.ca",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

function json(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
  });
}

async function callerIsAdmin(req: Request): Promise<boolean> {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const url = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!token || !url || !anon || token === anon) return false;
  try {
    const resp = await fetch(`${url}/rest/v1/rpc/is_admin`, {
      method: "POST",
      headers: {
        apikey: anon,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (!resp.ok) return false;
    const ok = await resp.json();
    return ok === true;
  } catch {
    return false;
  }
}

function isPrivateIpLiteral(ip: string): boolean {
  const s = ip.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (s.includes(":")) {
    return (
      s === "::" || s === "::1" || s.startsWith("::") ||
      s.startsWith("fe80:") || s.startsWith("fc") || s.startsWith("fd") ||
      s.startsWith("64:ff9b:") || s.startsWith("2002:") || s.startsWith("100:")
    );
  }
  const m = s.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  return false;
}

async function assertSafePublicUrl(raw: string): Promise<URL> {
  const u = new URL(raw);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Unsupported protocol");
  if (u.username || u.password) throw new Error("Credentials not allowed");
  if (u.port && u.port !== "80" && u.port !== "443") throw new Error("Port not allowed");
  const host = u.hostname.replace(/\.+$/, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Blocked host");
  }
  if (isPrivateIpLiteral(host)) throw new Error("Blocked private IP");
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host) && !host.includes(":")) {
    const ips: string[] = [];
    try { ips.push(...await Deno.resolveDns(host, "A")); } catch { /* ignore */ }
    try { ips.push(...await Deno.resolveDns(host, "AAAA")); } catch { /* ignore */ }
    if (ips.length === 0 || ips.some(isPrivateIpLiteral)) throw new Error("DNS blocked");
  }
  return u;
}

async function readBoundedText(resp: Response, maxBytes: number): Promise<string> {
  if (!resp.body) return "";
  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        chunks.push(value.subarray(0, value.byteLength - (total - maxBytes)));
        await reader.cancel().catch(() => {});
        break;
      }
      chunks.push(value);
    }
  }
  const merged = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

async function fetchSourceContext(rawUrl: string): Promise<string> {
  if (!rawUrl) return "";
  try {
    let current = rawUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const safe = await assertSafePublicUrl(current);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      const resp = await fetch(safe.toString(), {
        signal: ctrl.signal,
        redirect: "manual",
        headers: {
          "User-Agent": "WelcomeEGPressBot/1.0 (+https://welcomeeg.ca)",
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
        },
      });
      clearTimeout(timer);
      if (resp.status >= 300 && resp.status < 400) {
        const loc = resp.headers.get("location");
        await resp.body?.cancel().catch(() => {});
        if (!loc) return "";
        current = new URL(loc, safe).toString();
        continue;
      }
      if (!resp.ok) return "";
      const html = await readBoundedText(resp, MAX_PAGE_BYTES);
      return html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_PAGE_CHARS);
    }
    return "";
  } catch {
    return "";
  }
}

const PressReleaseDraft = z.object({
  title: z.string().describe("Compelling, factual AP-style press release headline (60-110 chars, no clickbait)."),
  slug_suggestion: z.string().describe("URL-friendly lowercase hyphenated slug, e.g. sammys-chicken-coop-opens-holland landing."),
  summary: z.string().describe("Concise 1-2 sentence summary (120-200 chars) for the Pressroom index card and meta description."),
  content_html: z.string().describe("Clean semantic HTML (<p>, <h2>, <blockquote>, <ul>, <li>) following standard press release layout: Dateline (GEORGINA, ON —), Lead paragraph (Who/What/When/Where/Why), 2-3 supporting paragraphs, a realistic attributed quote in <blockquote> if appropriate, and an 'About [Business Name]' boilerplate section including the exact NAP details."),
  image_alt: z.string().describe("Accessible, descriptive alt text for the press release hero photo mentioning the business and East Gwillimbury, ON."),
  image_caption: z.string().describe("Short editorial photo caption (1 sentence) suitable for NewsArticle ImageObject schema."),
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeadersFor(req) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, req);

  const isAdmin = await callerIsAdmin(req);
  if (!isAdmin) return json({ error: "Admin authentication required." }, 403, req);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "The AI key is not set up yet (ANTHROPIC_API_KEY secret in Supabase)." }, 500, req);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400, req);
  }

  const businessName = String(body.business_name || "").trim();
  const businessAddress = String(body.business_address || "").trim();
  const businessPhone = String(body.business_phone || "").trim();
  const businessWebsite = String(body.business_website || "").trim();
  const sourceUrl = String(body.source_url || "").trim();
  const notes = String(body.notes || "").trim();
  const tone = String(body.tone || "professional local news").trim();

  if (!businessName) return json({ error: "Business Name is required." }, 400, req);
  if (!notes && !sourceUrl) return json({ error: "Provide brief notes or a source URL so AI can draft the release." }, 400, req);

  const pageContext = sourceUrl ? await fetchSourceContext(sourceUrl) : "";

  const prompt = [
    "You are the Welcome East Gwillimbury Press Bureau editor writing an official local citation press release for East Gwillimbury, Ontario (Holland Landing, Mount Albert, Queensville, Sharon, Brown Hill, River Drive Park, Virginia, Ravenshoe).",
    "Write in clean, factual Canadian AP-style journalism. Never invent facts, prices, awards, or statistics not provided below.",
    "",
    `Business Name (N): ${businessName}`,
    `Business Address (A): ${businessAddress || "East Gwillimbury, ON"}`,
    `Business Phone (P): ${businessPhone || "Available on file"}`,
    `Business Website: ${businessWebsite || "Not provided"}`,
    `Desired Tone: ${tone}`,
    notes ? `\nAdmin Notes / Announcement Details:\n${notes}` : "",
    pageContext ? `\nReference Page Text (${sourceUrl}):\n${pageContext}` : "",
    "",
    "Formatting rules for content_html:",
    "- Start the first <p> with <strong>GEORGINA, ON &mdash;</strong> followed by the lead paragraph.",
    "- Include <h2> subheadings where helpful, and an <h2>About " + businessName + "</h2> boilerplate at the end that accurately repeats the business Name, Address, Phone, and Website.",
    "- Use only <p>, <h2>, <h3>, <ul>, <li>, <strong>, <em>, <blockquote>, <a> tags. Do not include <h1> or <script> tags.",
  ].filter(Boolean).join("\n");

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
      output_config: {
        format: zodOutputFormat(PressReleaseDraft, "press_release_draft"),
      },
    });
    const text = msg.content.find((b) => b.type === "text")?.text || "{}";
    const draft = JSON.parse(text);
    return json({ draft }, 200, req);
  } catch (e: unknown) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: "The AI service is busy. Wait a minute and try again." }, 429, req);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: "The AI key was rejected. Check the ANTHROPIC_API_KEY secret." }, 500, req);
    if (e instanceof Anthropic.APIError) return json({ error: `AI service error (${e.status ?? "network"}). Try again.` }, 502, req);
    console.error("admin-press-release error:", e);
    return json({ error: "Failed to draft press release." }, 500, req);
  }
});
