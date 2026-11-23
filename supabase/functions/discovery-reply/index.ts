// Ask WG: discovery-reply Edge Function (Admin-only, non-viewer)
// Sends an email reply to a discovery_leads inquiry and marks the lead/conversation as replied.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ALLOWED_ORIGINS = new Set([
  "https://welcomeeg.ca",
  "https://www.welcomeeg.ca",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

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

function anonKey(): string {
  return Deno.env.get("SUPABASE_ANON_KEY") || "";
}

async function getAdminCaller(req: Request): Promise<{ ok: boolean; email: string }> {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token || !sbUrl() || !anonKey() || token === anonKey()) return { ok: false, email: "" };
  try {
    const userResp = await fetch(`${sbUrl()}/auth/v1/user`, {
      headers: { apikey: anonKey(), Authorization: `Bearer ${token}` },
    });
    if (!userResp.ok) return { ok: false, email: "" };
    const user = await userResp.json();
    if (!user?.id) return { ok: false, email: "" };

    const profResp = await fetch(
      `${sbUrl()}/rest/v1/user_profiles?select=role,active&id=eq.${encodeURIComponent(user.id)}&limit=1`,
      { headers: { apikey: svcKey(), Authorization: `Bearer ${svcKey()}` } }
    );
    if (!profResp.ok) return { ok: false, email: "" };
    const rows = await profResp.json();
    const prof = rows?.[0];
    const role = String(prof?.role || "").toLowerCase();
    const ok = Boolean(prof?.active === true && ["admin", "super_admin"].includes(role));
    return { ok, email: String(user.email || "") };
  } catch {
    return { ok: false, email: "" };
  }
}

async function sbRest(path: string, init: RequestInit = {}): Promise<any> {
  const resp = await fetch(`${sbUrl()}${path}`, {
    ...init,
    headers: {
      apikey: svcKey(),
      Authorization: `Bearer ${svcKey()}`,
      "Content-Type": "application/json",
      ...((init.headers as Record<string, string>) || {}),
    },
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Supabase ${resp.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, req);

  const caller = await getAdminCaller(req);
  if (!caller.ok) return json({ error: "Admin authentication required." }, 403, req);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, req);
  }

  const leadId = String(body.lead_id || "").trim();
  const replyMessage = String(body.reply_message || "").trim().slice(0, 3000);
  const customSubject = String(body.subject || "").replace(/[\r\n]+/g, " ").trim().slice(0, 140);

  if (!/^[0-9a-f-]{36}$/i.test(leadId)) return json({ error: "Invalid lead ID" }, 400, req);
  if (replyMessage.length < 2) return json({ error: "Please enter a reply message." }, 400, req);

  try {
    const rows = await sbRest(`/rest/v1/discovery_leads?id=eq.${encodeURIComponent(leadId)}&limit=1`);
    const lead = rows?.[0];
    if (!lead) return json({ error: "Lead not found" }, 404, req);

    const subject = customSubject || `Re: Your Welcome East Gwillimbury Inquiry`;
    const htmlBody = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:14px;background:#ffffff;">
      <p style="margin:0 0 12px 0;color:#0f172a;">Hi ${escapeHtml(lead.name)},</p>
      <div style="color:#1e293b;line-height:1.6;margin:0 0 18px 0;">${escapeHtml(replyMessage).replace(/\n/g, "<br/>")}</div>
      <hr style="border:0;border-top:1px solid #e2e8f0;margin:18px 0;" />
      <p style="font-size:12px;color:#64748b;margin:0;">Welcome East Gwillimbury Team &bull; <a href="https://welcomeeg.ca" style="color:#00008b;">welcomeeg.ca</a></p>
    </div>`;

    const emailResp = await fetch(`${sbUrl()}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        apikey: svcKey(),
        Authorization: `Bearer ${svcKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        formType: "newsletter_dispatch",
        record: { email: lead.email, subject, html_body: htmlBody },
      }),
    });
    if (!emailResp.ok) {
      const txt = await emailResp.text().catch(() => "");
      console.error("discovery-reply send-email failed:", emailResp.status, txt.slice(0, 200));
      return json({ error: "Could not send reply email." }, 502, req);
    }

    const nowIso = new Date().toISOString();
    await sbRest(`/rest/v1/discovery_leads?id=eq.${encodeURIComponent(leadId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "replied",
        admin_reply: replyMessage,
        replied_at: nowIso,
        replied_by: caller.email,
      }),
    });

    if (lead.conversation_id) {
      await sbRest(`/rest/v1/discovery_conversations?id=eq.${encodeURIComponent(lead.conversation_id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "replied", replied_at: nowIso, updated_at: nowIso }),
      }).catch(() => {});
    }

    return json({ success: true }, 200, req);
  } catch (err) {
    console.error("discovery-reply error:", err);
    return json({ error: "Failed to send reply." }, 500, req);
  }
});
