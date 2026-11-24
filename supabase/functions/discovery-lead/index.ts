// Ask WG: discovery-lead Edge Function
// Consented lead capture for residents, businesses, sponsors, and Welcome Hamper inquiries.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ALLOWED_ORIGINS = new Set([
  "https://welcomeeg.ca",
  "https://www.welcomeeg.ca",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

const VALID_LEAD_TYPES = new Set(["resident", "business", "sponsor", "hamper", "general"]);
const ADMIN_NOTIFY_EMAIL = Deno.env.get("ASK_WG_LEAD_EMAIL") || "contact@welcomeeg.ca";

function corsHeaders(req?: Request): Record<string, string> {
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
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

function escapeHtml(str: unknown): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sbUrl(): string {
  return (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
}

function svcKey(): string {
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}

async function sbRest(path: string, init: RequestInit = {}): Promise<any> {
  const key = svcKey();
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
  const resp = await fetch(`${sbUrl()}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...((init.headers as Record<string, string>) || {}),
    },
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Supabase ${resp.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

async function hashClientIp(req: Request): Promise<string> {
  const raw =
    req.headers.get("cf-connecting-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "unknown";
  const salt = Deno.env.get("ASK_WG_IP_SALT") || "wg-ask-salt-v1";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${raw}`));
  return Array.from(new Uint8Array(digest).slice(0, 12))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, req);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, req);
  }

  // Honeypot trap
  if (String(body.website_trap || "").trim()) {
    return json({ success: true }, 200, req);
  }

  const leadType = String(body.lead_type || "general").trim().toLowerCase();
  if (!VALID_LEAD_TYPES.has(leadType)) {
    return json({ error: "Invalid inquiry type." }, 400, req);
  }

  const name = String(body.name || "").trim().slice(0, 100);
  const email = String(body.email || "").trim().toLowerCase().slice(0, 254);
  const phone = String(body.phone || "").trim().slice(0, 30) || null;
  const businessName = String(body.business_name || "").trim().slice(0, 120) || null;
  const message = String(body.message || "").trim().slice(0, 1500);
  const consentToContact = body.consent_to_contact === true;
  const newsletterOptIn = body.newsletter_opt_in === true;
  const sourcePage = String(body.source_page || "").trim().slice(0, 200) || null;
  const rawSessionKey = String(body.session_key || "").trim();
  const sessionKey = /^[a-zA-Z0-9_-]{8,64}$/.test(rawSessionKey) ? rawSessionKey : "";

  if (name.length < 2) return json({ error: "Please enter your name." }, 400, req);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Please enter a valid email address." }, 400, req);
  if (message.length < 5) return json({ error: "Please include a short message." }, 400, req);
  if (!consentToContact) return json({ error: "Please confirm consent so our team can contact you." }, 400, req);

  const ipHash = await hashClientIp(req);
  try {
    const rate = await sbRest("/rest/v1/rpc/wg_discovery_rate_allow", {
      method: "POST",
      body: JSON.stringify({ ip_hash_input: `lead_${ipHash}`, max_per_hour: 10, daily_ai_cap: 10000 }),
    });
    if (rate && rate.allowed === false) {
      return json({ error: "Too many inquiries submitted. Please try again later." }, 429, req);
    }
  } catch {
    return json({ error: "Service busy. Please try again shortly." }, 503, req);
  }

  const nowIso = new Date().toISOString();
  try {
    let conversationId: string | null = null;
    if (sessionKey) {
      const convRows = await sbRest(`/rest/v1/discovery_conversations?session_key=eq.${encodeURIComponent(sessionKey)}&select=id&limit=1`).catch(() => null);
      if (Array.isArray(convRows) && convRows[0]?.id) {
        conversationId = String(convRows[0].id);
      }
    }

    const inserted = await sbRest("/rest/v1/discovery_leads", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        lead_type: leadType,
        name,
        email,
        phone,
        business_name: businessName,
        message,
        consent_to_contact: true,
        contact_consent_at: nowIso,
        newsletter_opt_in: newsletterOptIn,
        newsletter_consent_at: newsletterOptIn ? nowIso : null,
        source_page: sourcePage,
        conversation_id: conversationId,
        status: "new",
      }),
    });

    const leadId = inserted?.[0]?.id || null;
    if (conversationId && leadId) {
      await sbRest(`/rest/v1/discovery_conversations?id=eq.${encodeURIComponent(conversationId)}`, {
        method: "PATCH",
        body: JSON.stringify({ lead_id: leadId, updated_at: nowIso }),
      }).catch(() => {});
    }

    let emailSent = false;
    try {
      const emailResp = await fetch(`${sbUrl()}/functions/v1/send-email`, {
        method: "POST",
        headers: {
          apikey: svcKey(),
          Authorization: `Bearer ${svcKey()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          formType: "newsletter_dispatch",
          record: {
            email: ADMIN_NOTIFY_EMAIL,
            subject: `[Ask WEG Inquiry • ${leadType}] ${name}`,
            html_body: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e2e8f0;border-radius:12px;">
              <h2 style="margin:0 0 12px 0;color:#00008b;">New Ask WEG Inquiry (${escapeHtml(leadType)})</h2>
              <p><strong>Name:</strong> ${escapeHtml(name)}</p>
              <p><strong>Email:</strong> ${escapeHtml(email)}</p>
              ${phone ? `<p><strong>Phone:</strong> ${escapeHtml(phone)}</p>` : ""}
              ${businessName ? `<p><strong>Business:</strong> ${escapeHtml(businessName)}</p>` : ""}
              <p><strong>Message:</strong><br/>${escapeHtml(message).replace(/\n/g, "<br/>")}</p>
              <p style="font-size:12px;color:#64748b;">Contact consent recorded: ${nowIso} | Newsletter opt-in requested: ${newsletterOptIn ? "Yes (needs confirmation)" : "No"}</p>
            </div>`,
          },
        }),
      });
      if (!emailResp.ok) {
        const errTxt = await emailResp.text().catch(() => "");
        console.warn("Admin lead email non-200:", emailResp.status, errTxt.slice(0, 200));
      } else {
        emailSent = true;
      }
    } catch (e) {
      console.warn("Admin lead email failed:", e);
    }

    await sbRest("/rest/v1/rpc/wg_discovery_record_metric", {
      method: "POST",
      body: JSON.stringify({
        intent_input: `lead_${leadType}`,
        community_input: "all",
        result_count_input: 1,
        used_ai_input: false,
        is_lead_input: true,
        is_error_input: false,
        est_cost_input: 0,
      }),
    }).catch(() => {});

    return json({ success: true, lead_id: leadId, email_sent: emailSent }, 200, req);
  } catch (err) {
    console.error("discovery-lead insert error:", err);
    return json({ error: "Could not save your inquiry. Please email contact@welcomeeg.ca." }, 500, req);
  }
});
