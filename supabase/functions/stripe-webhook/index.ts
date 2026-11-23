// Supabase Edge Function: stripe-webhook
// Handles Stripe Payment Link checkouts, recurring invoice renewals, and cancellations
// for "Quick Search Sponsored" ad space.
//
// Required Supabase Secrets:
//   STRIPE_WEBHOOK_SECRET  (whsec_... from Stripe Dashboard -> Developers -> Webhooks)
//   SUPABASE_URL           (automatically injected by Supabase)
//   SUPABASE_SERVICE_ROLE_KEY (automatically injected by Supabase)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const ADMIN_ALERT_EMAIL = Deno.env.get("ADMIN_ALERT_EMAIL") ?? "cheerfulweb@gmail.com";

const PLAN_AMOUNTS_CAD: Record<string, number> = {
  weekly: 700,
  monthly: 2500,
  gallery_weekly: 1000,
  gallery_monthly: 3500,
  newsletter_single: 500,
  newsletter_four_pack: 1700,
};

function escapeHtml(str: unknown): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sessionMatchesPlan(sessionObj: Record<string, unknown>, plan: string): boolean {
  if (String(sessionObj.payment_status || "").toLowerCase() !== "paid") return false;
  const expected = PLAN_AMOUNTS_CAD[plan];
  if (!expected) return false;
  const currency = String(sessionObj.currency || "cad").toLowerCase();
  if (currency !== "cad") return false;
  const paidCents = Number(sessionObj.amount_subtotal ?? sessionObj.amount_total ?? 0);
  return Number.isFinite(paidCents) && paidCents >= expected;
}

async function claimStripeEvent(eventId: string, eventType: string): Promise<boolean> {
  if (!eventId) return true;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/stripe_webhook_events`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ event_id: eventId, event_type: eventType }),
  });
  if (res.status === 409) return false;
  if (!res.ok) {
    const txt = await res.text();
    if (txt.includes("23505")) return false;
    console.warn("stripe_webhook_events insert warning:", res.status, txt.slice(0, 200));
  }
  return true;
}

async function notifyAdminPurchase(subject: string, htmlBody: string): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ADMIN_ALERT_EMAIL) return;
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        formType: "newsletter_dispatch",
        record: {
          email: ADMIN_ALERT_EMAIL,
          subject,
          html_body: htmlBody,
        },
      }),
    });
  } catch (err) {
    console.warn("Admin purchase alert email failed:", err);
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function verifyStripeSignature(rawBody: string, sigHeader: string, secret: string): Promise<boolean> {
  if (!sigHeader || !secret) return false;
  let timestamp = "";
  const v1Sigs: string[] = [];
  for (const kv of sigHeader.split(",")) {
    const idx = kv.indexOf("=");
    if (idx <= 0) continue;
    const k = kv.slice(0, idx).trim();
    const v = kv.slice(idx + 1).trim();
    if (k === "t" && !timestamp) timestamp = v;
    if (k === "v1" && v) v1Sigs.push(v);
  }
  if (!timestamp || v1Sigs.length === 0) return false;

  // Reject replay attacks older than 5 minutes
  const ageSec = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(ageSec) || ageSec > 300) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`));
  const hex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return v1Sigs.some((sig) => timingSafeEqual(hex, sig));
}

async function sbRest(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) {
    throw new Error(`Supabase ${method} ${path} failed (${res.status}): ${text}`);
  }
  return json;
}

function addDuration(start: Date, plan: string): Date {
  const end = new Date(start.getTime());
  if (plan === "monthly") {
    end.setMonth(end.getMonth() + 1);
  } else {
    end.setDate(end.getDate() + 7);
  }
  return end;
}

function slugify(text: string): string {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "georgina-business";
}

async function ensureBusinessAndAccount(order: Record<string, unknown>): Promise<string | null> {
  const email = String(order.contact_email || "").trim().toLowerCase();
  const sponsorName = String(order.sponsor_name || "").trim();
  const websiteUrl = order.website_url ? String(order.website_url).trim() : null;
  let businessId = order.business_id ? String(order.business_id) : null;

  // 1. Find or create an approved directory_listings page so clicks & views show up on /businesses/<slug> and /business/
  if (!businessId && sponsorName) {
    const existing = (await sbRest(
      `/rest/v1/directory_listings?select=id&name=ilike.${encodeURIComponent(sponsorName)}&limit=1`
    )) as Array<Record<string, unknown>>;
    if (existing && existing.length > 0) {
      businessId = String(existing[0].id);
    } else {
      const slug = `${slugify(sponsorName)}-${String(order.id || "").slice(0, 6)}`;
      const created = (await sbRest("/rest/v1/directory_listings", "POST", {
        name: sponsorName,
        slug,
        category: "Local Business",
        community: "East Gwillimbury",
        website: websiteUrl,
        email: email || null,
        status: "approved",
        description: `${sponsorName} — Welcome East Gwillimbury Quick Search Sponsor.`,
      })) as Array<Record<string, unknown>>;
      if (created && created.length > 0) {
        businessId = String(created[0].id);
      }
    }
  }

  // 2. Link or invite the advertiser's email in business_accounts so /business/index.html shows their impressions & clicks
  if (businessId && email) {
    try {
      const listRes = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=100`,
        {
          headers: {
            apikey: SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          },
        }
      );
      let userId: string | null = null;
      if (listRes.ok) {
        const listJson = await listRes.json();
        const found = (listJson?.users || []).find(
          (u: Record<string, unknown>) => String(u.email || "").toLowerCase() === email
        );
        if (found?.id) userId = String(found.id);
      }
      if (!userId) {
        const invRes = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
          method: "POST",
          headers: {
            apikey: SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            data: { business_name: sponsorName },
            redirect_to: "https://welcomeeg.ca/business/",
          }),
        });
        if (invRes.ok) {
          const invJson = await invRes.json();
          if (invJson?.id) userId = String(invJson.id);
          else if (invJson?.user?.id) userId = String(invJson.user.id);
        }
      }
      if (userId) {
        await sbRest("/rest/v1/business_accounts?on_conflict=user_id", "POST", {
          user_id: userId,
          business_id: businessId,
        });
      }
    } catch (acctErr) {
      console.warn("Could not auto-link business_accounts:", acctErr);
    }
  }

  return businessId;
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const rawBody = await req.text();
  const sigHeader = req.headers.get("stripe-signature") ?? "";

  if (!STRIPE_WEBHOOK_SECRET) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured.");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  const valid = await verifyStripeSignature(rawBody, sigHeader, STRIPE_WEBHOOK_SECRET);
  if (!valid) {
    return new Response("Invalid Stripe signature", { status: 400 });
  }

  const event = JSON.parse(rawBody);
  const type = String(event?.type || "");
  const obj = event?.data?.object || {};

  try {
    const eventId = String(event.id || "").trim();
    if (type === "checkout.session.completed") {
      if (String(obj.payment_status || "").toLowerCase() !== "paid") {
        return new Response(JSON.stringify({ received: true, skipped: "unpaid_session" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (!(await claimStripeEvent(eventId, type))) {
        return new Response(JSON.stringify({ received: true, duplicate_event: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      const orderId = String(obj.client_reference_id || "").trim();
      const sessionId = String(obj.id || "").trim();
      const customerId = obj.customer ? String(obj.customer) : null;
      const subscriptionId = obj.subscription ? String(obj.subscription) : null;

      if (!orderId) {
        console.log("checkout.session.completed without client_reference_id; skipping auto-activation.");
        return new Response(JSON.stringify({ received: true, skipped: "no_client_reference_id" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const orders = (await sbRest(
        `/rest/v1/search_sponsor_orders?id=eq.${encodeURIComponent(orderId)}&limit=1`
      )) as Array<Record<string, unknown>>;

      if (!orders || orders.length === 0) {
        // Check ad_orders (Photo Gallery Ads & Newsletter Sponsored Ads)
        const adOrders = (await sbRest(
          `/rest/v1/ad_orders?id=eq.${encodeURIComponent(orderId)}&limit=1`
        )) as Array<Record<string, unknown>>;

        if (adOrders && adOrders.length > 0) {
          const adOrder = adOrders[0];
          const matchedOrderId = String(adOrder.id || orderId);
          if (!sessionMatchesPlan(obj, String(adOrder.plan || ""))) {
            console.warn(`Payment mismatch on ad_order ${matchedOrderId} (plan=${adOrder.plan}, subtotal=${obj.amount_subtotal}, status=${obj.payment_status})`);
            return new Response(JSON.stringify({ received: true, skipped: "amount_or_plan_mismatch" }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          if (adOrder.status === "paid" || adOrder.status === "active") {
            return new Response(JSON.stringify({ received: true, already_active: true }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          const now = new Date();
          const nowIso = now.toISOString();
          const days = String(adOrder.plan || "").includes("monthly") || String(adOrder.plan || "").includes("four") ? 30 : 7;
          const endDate = new Date(now.getTime() + days * 86400000);
          const todayIso = nowIso.slice(0, 10);
          const endIso = endDate.toISOString().slice(0, 10);

          if (adOrder.ad_type === "newsletter") {
            await sbRest("/rest/v1/newsletter_ad_placements", "POST", {
              sponsor_name: adOrder.sponsor_name,
              headline: adOrder.headline || adOrder.sponsor_name,
              body_text: adOrder.body_text || null,
              image_url: adOrder.image_data_url || null,
              target_type: adOrder.target_type || "external",
              target_url: adOrder.target_url,
              edition: adOrder.edition || "both",
              insert_after_index: 1,
              sub_order: "a",
              start_date: todayIso,
              end_date: endIso,
              is_complimentary: false,
              active: true,
              stripe_subscription_id: subscriptionId,
              notes: `Stripe session ${String(obj.id || "")}`,
            });
          } else if (adOrder.ad_type === "gallery" && adOrder.image_data_url) {
            await sbRest("/rest/v1/home_gallery", "POST", {
              image_url: adOrder.image_data_url,
              thumb_url: adOrder.image_data_url,
              hover_text: String(adOrder.headline || adOrder.sponsor_name || "Featured Sponsor").slice(0, 140),
              link_url: adOrder.target_url,
              link_label: adOrder.sponsor_name,
              sponsor_name: adOrder.sponsor_name,
              is_sponsored: true,
              is_complimentary: false,
              active: true,
              starts_at: nowIso,
              ends_at: endDate.toISOString(),
              stripe_subscription_id: subscriptionId,
              sort_order: 5,
            });
          }

          await sbRest(`/rest/v1/ad_orders?id=eq.${encodeURIComponent(matchedOrderId)}`, "PATCH", {
            status: "paid",
            paid_at: nowIso,
            stripe_session_id: String(obj.id || ""),
            stripe_subscription_id: subscriptionId,
          });

          const staffLink = adOrder.ad_type === "gallery"
            ? "https://welcomeeg.ca/staff/gallery.html"
            : "https://welcomeeg.ca/staff/newsletter-ads.html";
          const adKindLabel = adOrder.ad_type === "gallery" ? "Photo Gallery Ad" : "Newsletter Sponsored Ad";
          await notifyAdminPurchase(
            `New Paid ${adKindLabel}: ${String(adOrder.sponsor_name || "Sponsor")}`,
            `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e2e8f0;border-radius:12px;">
              <h2 style="margin:0 0 12px 0;color:#00008b;">New Paid ${escapeHtml(adKindLabel)}</h2>
              <p style="margin:0 0 12px 0;color:#334155;">A Stripe purchase just completed and the ad has been created in your staff portal.</p>
              <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
                <tr><td style="padding:6px 0;color:#64748b;"><strong>Sponsor:</strong></td><td>${escapeHtml(adOrder.sponsor_name)}</td></tr>
                <tr><td style="padding:6px 0;color:#64748b;"><strong>Email:</strong></td><td>${escapeHtml(adOrder.contact_email)}</td></tr>
                <tr><td style="padding:6px 0;color:#64748b;"><strong>Plan:</strong></td><td>${escapeHtml(adOrder.plan)} (${todayIso} &rarr; ${endIso})</td></tr>
                <tr><td style="padding:6px 0;color:#64748b;"><strong>Headline:</strong></td><td>${escapeHtml(adOrder.headline || "—")}</td></tr>
                <tr><td style="padding:6px 0;color:#64748b;"><strong>Destination:</strong></td><td>${escapeHtml(adOrder.target_url)}</td></tr>
              </table>
              <a href="${staffLink}" style="display:inline-block;background:#00008b;color:#ffffff;font-weight:800;padding:10px 18px;border-radius:8px;text-decoration:none;">Review in Staff Portal &rarr;</a>
            </div>`
          );

          return new Response(JSON.stringify({ received: true, activated_ad_order: matchedOrderId }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        console.warn(`Order ${orderId} not found in search_sponsor_orders or ad_orders.`);
        return new Response(JSON.stringify({ received: true, skipped: "order_not_found" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const order = orders[0];
      if (!sessionMatchesPlan(obj, String(order.plan || ""))) {
        console.warn(`Payment mismatch on search_sponsor_order ${orderId} (plan=${order.plan}, subtotal=${obj.amount_subtotal}, status=${obj.payment_status})`);
        return new Response(JSON.stringify({ received: true, skipped: "amount_or_plan_mismatch" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (order.sponsor_id) {
        // Idempotent: already activated
        return new Response(JSON.stringify({ received: true, already_active: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const now = new Date();
      const endsAt = addDuration(now, String(order.plan || "weekly"));
      const linkedBusinessId = await ensureBusinessAndAccount(order);

      const inserted = (await sbRest("/rest/v1/search_sponsors", "POST", {
        keyword: order.keyword,
        sponsor_name: order.sponsor_name,
        target_kind: order.target_kind,
        website_url: order.website_url || null,
        business_id: linkedBusinessId || null,
        search_query: order.search_query || null,
        starts_at: now.toISOString(),
        ends_at: endsAt.toISOString(),
        active: true,
        priority: 10,
        notes: `Stripe self-serve (${order.plan}) • ${order.contact_email}`,
        stripe_subscription_id: subscriptionId,
        order_id: orderId,
      })) as Array<Record<string, unknown>>;

      const sponsorId = inserted?.[0]?.id ?? null;

      await sbRest(`/rest/v1/search_sponsor_orders?id=eq.${encodeURIComponent(orderId)}`, "PATCH", {
        status: "active",
        business_id: linkedBusinessId || null,
        stripe_session_id: sessionId || null,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        sponsor_id: sponsorId,
        paid_at: now.toISOString(),
        updated_at: now.toISOString(),
      });

      await notifyAdminPurchase(
        `New Paid Quick Search Sponsor: ${String(order.sponsor_name || "Sponsor")}`,
        `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e2e8f0;border-radius:12px;">
          <h2 style="margin:0 0 12px 0;color:#00008b;">New Paid Quick Search Sponsor</h2>
          <p style="margin:0 0 12px 0;color:#334155;">A Quick Search Sponsor Stripe checkout completed and is now active.</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
            <tr><td style="padding:6px 0;color:#64748b;"><strong>Sponsor:</strong></td><td>${escapeHtml(order.sponsor_name)}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;"><strong>Email:</strong></td><td>${escapeHtml(order.contact_email)}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;"><strong>Keyword:</strong></td><td>${escapeHtml(order.keyword)}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;"><strong>Plan:</strong></td><td>${escapeHtml(order.plan)} (${now.toISOString().slice(0, 10)} &rarr; ${endsAt.toISOString().slice(0, 10)})</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;"><strong>Destination:</strong></td><td>${escapeHtml(order.website_url || order.search_query || order.target_kind)}</td></tr>
          </table>
          <a href="https://welcomeeg.ca/staff/search-sponsors.html" style="display:inline-block;background:#00008b;color:#ffffff;font-weight:800;padding:10px 18px;border-radius:8px;text-decoration:none;">Review in Search Sponsors &rarr;</a>
        </div>`
      );
    } else if (type === "invoice.paid") {
      if (!(await claimStripeEvent(eventId, type))) {
        return new Response(JSON.stringify({ received: true, duplicate_event: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      // Extend subscription end date on recurring renewal cycles
      const billingReason = String(obj.billing_reason || "");
      const subscriptionId = obj.subscription ? String(obj.subscription) : "";
      if (subscriptionId && billingReason === "subscription_cycle") {
        const sponsors = (await sbRest(
          `/rest/v1/search_sponsors?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}&limit=1`
        )) as Array<Record<string, unknown>>;

        if (sponsors && sponsors.length > 0) {
          const sp = sponsors[0];
          const orders = sp.order_id
            ? ((await sbRest(
                `/rest/v1/search_sponsor_orders?id=eq.${encodeURIComponent(String(sp.order_id))}&limit=1`
              )) as Array<Record<string, unknown>>)
            : [];
          const plan = String(orders?.[0]?.plan || "weekly");
          const base = sp.ends_at && new Date(String(sp.ends_at)) > new Date()
            ? new Date(String(sp.ends_at))
            : new Date();
          const newEnd = addDuration(base, plan);

          await sbRest(`/rest/v1/search_sponsors?id=eq.${encodeURIComponent(String(sp.id))}`, "PATCH", {
            active: true,
            ends_at: newEnd.toISOString(),
          });
        }

        // Also extend recurring Photo Gallery or Newsletter Ad placements
        const adOrders = (await sbRest(
          `/rest/v1/ad_orders?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}&limit=1`
        )) as Array<Record<string, unknown>>;
        if (adOrders && adOrders.length > 0) {
          const ao = adOrders[0];
          const days = String(ao.plan || "").includes("monthly") || String(ao.plan || "").includes("four") ? 30 : 7;
          const newEnd = new Date(Date.now() + days * 86400000);
          if (ao.ad_type === "gallery") {
            await sbRest(`/rest/v1/home_gallery?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}`, "PATCH", {
              active: true,
              ends_at: newEnd.toISOString(),
            });
          } else if (ao.ad_type === "newsletter") {
            await sbRest(`/rest/v1/newsletter_ad_placements?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}`, "PATCH", {
              active: true,
              end_date: newEnd.toISOString().slice(0, 10),
            });
          }
        }
      }
    } else if (type === "customer.subscription.deleted") {
      const subscriptionId = obj.id ? String(obj.id) : "";
      if (subscriptionId) {
        await sbRest(
          `/rest/v1/search_sponsors?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}`,
          "PATCH",
          { active: false }
        );
        await sbRest(
          `/rest/v1/search_sponsor_orders?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}`,
          "PATCH",
          { status: "cancelled", updated_at: new Date().toISOString() }
        );
        await sbRest(
          `/rest/v1/home_gallery?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}`,
          "PATCH",
          { active: false }
        );
        await sbRest(
          `/rest/v1/newsletter_ad_placements?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}`,
          "PATCH",
          { active: false }
        );
        await sbRest(
          `/rest/v1/ad_orders?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}`,
          "PATCH",
          { status: "cancelled" }
        );
        await notifyAdminPurchase(
          `Ad Subscription Cancelled (${escapeHtml(subscriptionId)})`,
          `<p>Stripe subscription <code>${escapeHtml(subscriptionId)}</code> was cancelled by the client. The corresponding ad has been deactivated automatically.</p>`
        );
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("stripe-webhook error:", err);
    return new Response(JSON.stringify({ error: "Internal webhook error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
