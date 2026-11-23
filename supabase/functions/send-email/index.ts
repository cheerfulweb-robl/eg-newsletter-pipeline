import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const ADMIN_EMAIL = 'contact@welcomeeg.ca';
const DEFAULT_SUPABASE_URL = 'https://cyxomkhydsmttefanalx.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_o21_dFCXCHW2fvVJNS45Tw_sFVcprqw';

async function fetchLatestNewsletterHtml(edition: string, token: string): Promise<{ subject: string; html: string }> {
  const sbUrl = (Deno.env.get('SUPABASE_URL') || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
  const sbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || DEFAULT_SUPABASE_ANON_KEY;
  const targetEdition = edition === 'vendor' ? 'vendor' : 'reader';

  try {
    const resp = await fetch(
      `${sbUrl}/rest/v1/newsletter_editions?select=edition,subject,html_content&edition=eq.${targetEdition}&limit=1`,
      {
        headers: {
          'apikey': sbKey,
          'Authorization': `Bearer ${sbKey}`,
        },
      }
    );
    if (resp.ok) {
      const rows = await resp.json();
      if (Array.isArray(rows) && rows.length > 0 && rows[0].html_content) {
        const rawHtml = String(rows[0].html_content)
          .replace(/\{\{UNSUBSCRIBE_TOKEN\}\}/g, encodeURIComponent(token || ''))
          .replace(/href="\/go\.html/g, 'href="https://welcomeeg.ca/news/go.html')
          .replace(/href="\/portal\.html/g, 'href="https://welcomeeg.ca/news/portal.html')
          .replace(/href="\/unsubscribe\.html/g, 'href="https://welcomeeg.ca/news/unsubscribe.html')
          .replace(/u=%2Fportal\.html/g, 'u=https%3A%2F%2Fwelcomeeg.ca%2Fnews%2Fportal.html');
        return {
          subject: String(rows[0].subject || 'Welcome East Gwillimbury • Latest Community Edition'),
          html: rawHtml,
        };
      }
    }
  } catch (e) {
    console.error('Failed to fetch latest newsletter edition:', e);
  }

  return {
    subject: 'Welcome East Gwillimbury • Community News & Local Events',
    html: '',
  };
}

// Escape HTML entities to prevent XSS / HTML injection in emails
function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isValidEmail(email: unknown): boolean {
  if (typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && email.length <= 254;
}

// ----------------------------------------------------------------------------
// Added 2026-11-13: submission email verification + caller checks
// ----------------------------------------------------------------------------
const SITE_ORIGIN = 'https://welcomeeg.ca';
const ALLOWED_ORIGINS = new Set([
  'https://welcomeeg.ca',
  'https://www.welcomeeg.ca',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);
const VERIFY_TTL_HOURS = 48;

function corsOriginFor(req?: Request): string {
  const origin = req?.headers.get('origin') || '';
  return ALLOWED_ORIGINS.has(origin) ? origin : SITE_ORIGIN;
}

function json(body: unknown, status = 200, origin = SITE_ORIGIN): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' },
    status,
  });
}

function sbUrl(): string {
  return (Deno.env.get('SUPABASE_URL') || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
}
function serviceKey(): string {
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
}
function anonKey(): string {
  return Deno.env.get('SUPABASE_ANON_KEY') || DEFAULT_SUPABASE_ANON_KEY;
}

// Links placed in emails must point back to this site; anything else uses the fallback.
function safeSiteUrl(candidate: unknown, fallback: string): string {
  const raw = typeof candidate === 'string' ? candidate.trim() : '';
  return raw.startsWith(SITE_ORIGIN + '/') ? raw : fallback;
}

// REST / Auth-admin call as the service role (bypasses RLS). Throws on failure.
async function adminRest(path: string, init: RequestInit = {}): Promise<any> {
  const key = serviceKey();
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not available to this function');
  const headers: Record<string, string> = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) || {}),
  };
  const resp = await fetch(`${sbUrl()}${path}`, { ...init, headers });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Supabase ${resp.status} on ${path.split('?')[0]}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// One-click unsubscribe (CASL): every unsubscribe link that has no real token (an "?email=" link,
// an empty token or "manage") gets the recipient's own token from wg_unsubscribe_tokens_for
// (migration 20261206). Links that already carry a token are left alone. If the lookup fails the
// email still goes out; the unsubscribe page then tells the reader how to contact us.
const UNSUB_LINK = /(unsubscribe\.html)\?(?:email=[^"'<\s]*|token=(?:manage)?(?=["'<\s&]))/g;
async function signUnsubscribeLinks(toEmail: string, html: string, issue = issueUnsubscribeToken): Promise<string> {
  if (!html || !UNSUB_LINK.test(html)) return html;
  UNSUB_LINK.lastIndex = 0;
  let token = '';
  try {
    token = await issue(toEmail);
  } catch (e) {
    console.warn('Unsubscribe token lookup failed:', e);
  }
  if (!token) return html;
  return html.replace(UNSUB_LINK, `$1?token=${encodeURIComponent(token)}`);
}
async function issueUnsubscribeToken(email: string): Promise<string> {
  const key = String(email || '').trim().toLowerCase();
  const map = await adminRest('/rest/v1/rpc/wg_unsubscribe_tokens_for', {
    method: 'POST',
    body: JSON.stringify({ emails_input: [key] }),
  });
  return map && typeof map === 'object' ? String(map[key] || '') : '';
}

// Who is calling: the service key, a signed-in staff member, a signed-in visitor, or nobody.
async function getCaller(req: Request): Promise<{ service: boolean; staff: boolean; email: string; userId: string }> {
  const out = { service: false, staff: false, email: '', userId: '' };
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return out;
  const svc = serviceKey();
  if (svc && token === svc) {
    out.service = true;
    out.staff = true;
    return out;
  }
  if (token === anonKey()) return out;
  try {
    const resp = await fetch(`${sbUrl()}/auth/v1/user`, {
      headers: { 'apikey': anonKey(), 'Authorization': `Bearer ${token}` },
    });
    if (!resp.ok) return out;
    const user = await resp.json();
    out.email = String(user?.email || '').trim().toLowerCase();
    out.userId = String(user?.id || '');
    if (out.userId && svc) {
      // Staff = an active user_profiles row that is not a read-only "viewer".
      const rows = await adminRest(`/rest/v1/user_profiles?select=id,role&id=eq.${encodeURIComponent(out.userId)}&active=is.true&limit=1`);
      out.staff = Array.isArray(rows) && rows.length > 0 && String(rows[0].role || '').toLowerCase() !== 'viewer';
    }
  } catch (e) {
    console.warn('Caller lookup failed:', e);
  }
  return out;
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// One-time Supabase magic link that signs the submitter in and lands on redirectTo.
// If Auth refuses (e.g. sign-ups disabled), the plain landing URL still verifies the listing.
async function magicLinkFor(email: string, redirectTo: string): Promise<string> {
  try {
    const data = await adminRest('/auth/v1/admin/generate_link', {
      method: 'POST',
      body: JSON.stringify({ type: 'magiclink', email, options: { redirect_to: redirectTo } }),
    });
    if (data && typeof data.action_link === 'string' && data.action_link.startsWith('https://')) {
      return data.action_link;
    }
  } catch (e) {
    console.warn('generate_link failed, falling back to plain link:', e);
  }
  return redirectTo;
}

function listingTypeLabel(row: any): string {
  const cat = String(row?.category || '').toLowerCase().trim();
  if (['dining', 'restaurant', 'food_and_drink', 'dining_deals'].includes(cat)) return 'Dining';
  if (['sales', 'sale', 'sales_deal'].includes(cat) || String(row?.title || '').startsWith('[Sale]')) return 'Sale';
  return 'Event';
}

async function loadListing(filter: string): Promise<any | null> {
  const rows = await adminRest(`/rest/v1/vendor_events?select=*&${filter}&limit=1`);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

// The submit forms also sign the submitter up for the newsletter; a verified
// email counts as their confirmation. Never re-activates an unsubscribed address.
async function activateSubscriber(row: any): Promise<void> {
  const email = String(row?.submitter_email || '').trim().toLowerCase();
  if (!isValidEmail(email)) return;
  const firstName = String(row?.contact_name || '').trim().split(/\s+/)[0] || '';
  const now = new Date().toISOString();
  try {
    const rows = await adminRest(`/rest/v1/newsletter_subscribers?select=id,status&email=eq.${encodeURIComponent(email)}&limit=1`);
    const existing = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!existing) {
      await adminRest('/rest/v1/newsletter_subscribers', {
        method: 'POST',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({ email, first_name: firstName, audience_type: 'both', status: 'active', confirmed_at: now }),
      });
    } else if (existing.status === 'pending') {
      await adminRest(`/rest/v1/newsletter_subscribers?id=eq.${existing.id}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({ status: 'active', confirmed_at: now }),
      });
    }
  } catch (e) {
    console.warn('Subscriber activation skipped:', e);
  }
}

function buildVerificationEmail(row: any, link: string): { subject: string; html: string } {
  const type = listingTypeLabel(row);
  const cap = (v: unknown, n: number) => String(v || '').slice(0, n);
  const name = escapeHtml(cap(row.contact_name, 80) || 'Community Partner');
  const title = escapeHtml(cap(row.title, 120) || 'Community Listing');
  const email = String(row.submitter_email || '').trim().toLowerCase();
  const org = escapeHtml(cap(row.business_name, 100));
  const date = escapeHtml(cap(row.event_date_label, 120) || 'Upcoming');
  const loc = escapeHtml(cap(row.location, 160) || 'East Gwillimbury, ON');
  const safeLink = escapeHtml(link);
  const unsubscribeUrl = `${SITE_ORIGIN}/news/unsubscribe.html?email=${encodeURIComponent(email)}`;
  const subject = `Welcome East Gwillimbury: confirm your email to complete your ${type} submission`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; padding: 36px 30px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
      <div style="text-align: center; margin-bottom: 24px;">
        <img src="${SITE_ORIGIN}/welcome-eg-logo.png" alt="Welcome East Gwillimbury" style="max-width: 240px; height: auto;" />
      </div>
      <div style="text-align: center; margin-bottom: 20px;">
        <span style="display: inline-block; background-color: #fef3c7; color: #92400e; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; padding: 6px 14px; border-radius: 9999px; border: 1px solid #fcd34d;">
          One more step: confirm your email
        </span>
      </div>
      <h1 style="color: #00008b; text-align: center; font-size: 24px; font-weight: 900; margin: 0 0 16px 0;">Thank you, ${name}!</h1>
      <p style="color: #334155; font-size: 16px; line-height: 1.6; margin-bottom: 24px; text-align: center;">
        Your <strong>${type}</strong> submission <strong>${title}</strong> is saved but <strong>not yet complete</strong>.
        Click the button below to confirm your email address (<strong>${escapeHtml(email)}</strong>). That completes your submission,
        sends it to our editorial team for review, and signs you in to your submitter dashboard.
      </p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${safeLink}" style="background-color: #00008b; color: #ffffff; padding: 14px 34px; text-decoration: none; border-radius: 12px; font-weight: 800; font-size: 16px; display: inline-block;">
          &#10003; Confirm my email &amp; complete my submission
        </a>
      </div>
      <p style="margin: 0 0 24px 0; font-size: 12px; color: #64748b; text-align: center; line-height: 1.5;">
        Or copy and paste this link into your browser:<br>
        <a href="${safeLink}" style="color: #0284c7; word-break: break-all;">${safeLink}</a><br>
        This link works once and expires in ${VERIFY_TTL_HOURS} hours.
      </p>
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 24px 0; text-align: left;">
        <h3 style="color: #0f172a; margin: 0 0 12px 0; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">Submission summary</h3>
        <p style="margin: 6px 0; font-size: 14px; color: #334155;"><b>Title:</b> ${title}</p>
        ${org ? `<p style="margin: 6px 0; font-size: 14px; color: #334155;"><b>Organization / Business:</b> ${org}</p>` : ''}
        <p style="margin: 6px 0; font-size: 14px; color: #334155;"><b>Date &amp; Schedule:</b> ${date}</p>
        <p style="margin: 6px 0; font-size: 14px; color: #334155;"><b>Location:</b> ${loc}</p>
      </div>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 28px 0 20px 0;" />
      <div style="text-align: center; font-size: 12px; color: #64748b; line-height: 1.6;">
        <p style="margin: 0 0 8px 0;">You received this message because this address was used to submit a community listing on Welcome East Gwillimbury. If that wasn't you, simply ignore this email.</p>
        <p style="margin: 0;">Welcome East Gwillimbury &bull; East Gwillimbury, Ontario, Canada<br>
          <a href="${unsubscribeUrl}" style="color: #64748b; text-decoration: underline;">Unsubscribe</a></p>
      </div>
    </div>
  `;
  return { subject, html };
}

// ----------------------------------------------------------------------------
// Added 2026-11-15: Welcome Hamper (new residents, digital coupons)
// ----------------------------------------------------------------------------
const HAMPER_STATUS_LABEL: Record<string, string> = {
  unverified: 'Waiting for email confirmation',
  review: 'Received: staff are checking your proof of residence',
  approved: 'Approved: you are on the Spring 2027 waitlist',
  declined: 'Not approved',
};

async function loadHamperApplication(filter: string): Promise<any | null> {
  const rows = await adminRest(`/rest/v1/hamper_applications?select=*&${filter}&limit=1`);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function hamperEmail(badge: string, heading: string, bodyHtml: string, email: string): string {
  const unsubscribeUrl = `${SITE_ORIGIN}/news/unsubscribe.html?email=${encodeURIComponent(email)}`;
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; padding: 36px 30px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <img src="${SITE_ORIGIN}/welcome-eg-logo.png" alt="Welcome East Gwillimbury" style="max-width: 240px; height: auto;" />
      </div>
      <div style="text-align: center; margin-bottom: 20px;">
        <span style="display: inline-block; background-color: #ecfdf5; color: #065f46; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; padding: 6px 14px; border-radius: 9999px; border: 1px solid #6ee7b7;">${escapeHtml(badge)}</span>
      </div>
      <h1 style="color: #00008b; text-align: center; font-size: 24px; font-weight: 900; margin: 0 0 16px 0;">${escapeHtml(heading)}</h1>
      <div style="color: #334155; font-size: 16px; line-height: 1.6;">${bodyHtml}</div>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 28px 0 20px 0;" />
      <div style="text-align: center; font-size: 12px; color: #64748b; line-height: 1.6;">
        <p style="margin: 0 0 8px 0;">You received this message because this address was used to apply for the Welcome East Gwillimbury Welcome Hamper. If that wasn't you, simply ignore this email.</p>
        <p style="margin: 0;">Welcome East Gwillimbury &bull; East Gwillimbury, Ontario, Canada<br>
          <a href="${unsubscribeUrl}" style="color: #64748b; text-decoration: underline;">Unsubscribe</a></p>
      </div>
    </div>`;
}

function hamperButton(href: string, label: string): string {
  const safe = escapeHtml(href);
  return `<div style="text-align: center; margin: 28px 0;">
      <a href="${safe}" style="background-color: #00008b; color: #ffffff; padding: 14px 34px; text-decoration: none; border-radius: 12px; font-weight: 800; font-size: 16px; display: inline-block;">${label}</a>
    </div>
    <p style="margin: 0 0 16px 0; font-size: 12px; color: #64748b; text-align: center; line-height: 1.5;">
      Or copy and paste this link into your browser:<br>
      <a href="${safe}" style="color: #0284c7; word-break: break-all;">${safe}</a>
    </p>`;
}

// Newsletter opt-in on the hamper form: a confirmed email counts as confirmation.
// Never re-activates an unsubscribed address.
async function activateHamperSubscriber(app: any): Promise<void> {
  const email = String(app?.email || '').trim().toLowerCase();
  if (!app?.newsletter_opt_in || !isValidEmail(email)) return;
  const now = new Date().toISOString();
  try {
    const rows = await adminRest(`/rest/v1/newsletter_subscribers?select=id,status&email=eq.${encodeURIComponent(email)}&limit=1`);
    const existing = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!existing) {
      await adminRest('/rest/v1/newsletter_subscribers', {
        method: 'POST',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          email, first_name: String(app.first_name || ''), last_name: String(app.last_name || ''),
          audience_type: 'reader', community_area: String(app.community || 'East Gwillimbury'),
          status: 'active', confirmed_at: now, source: 'hamper_form',
        }),
      });
    } else if (existing.status === 'pending') {
      await adminRest(`/rest/v1/newsletter_subscribers?id=eq.${existing.id}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({ status: 'active', confirmed_at: now }),
      });
    }
  } catch (e) {
    console.warn('Hamper subscriber activation skipped:', e);
  }
}

serve(async (req) => {
  const reqOrigin = corsOriginFor(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': reqOrigin,
        'Vary': 'Origin',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
      }
    });
  }

  const respond = (body: unknown, status = 200) => json(body, status, reqOrigin);

  try {
    let payload: any;
    try {
      payload = await req.json();
    } catch {
      return respond({ error: 'Invalid JSON payload' }, 400);
    }
    const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY');
    if (!BREVO_API_KEY) {
      throw new Error("Missing BREVO_API_KEY environment variable");
    }

    const sender = {
      name: 'Welcome East Gwillimbury',
      email: 'no-reply@welcomeeg.ca'
    };

    // For steps that already saved their change: log a failed email instead of failing the request.
    const trySend = async (toEmail: string, subj: string, htmlBody: string): Promise<boolean> => {
      try {
        await sendEmail(toEmail, subj, htmlBody);
        return true;
      } catch (e) {
        console.error(`Email to ${toEmail === ADMIN_EMAIL ? 'staff' : 'user'} failed:`, e);
        return false;
      }
    };

    const sendEmail = async (toEmail: string, subj: string, htmlBody: string) => {
      const cleanSubj = String(subj || '').replace(/[\r\n]+/g, ' ').trim();
      htmlBody = await signUnsubscribeLinks(toEmail, htmlBody);
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': BREVO_API_KEY,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          sender: sender,
          to: [{ email: toEmail }],
          subject: cleanSubj,
          htmlContent: htmlBody
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Brevo Error: ${errorText}`);
      }
      return await response.json();
    };

    let toUser = '';
    let subject = '';
    let bodyUser = '';
    let bodyAdmin = '';
    let adminSubject = '';
    let verifiedListing: { id: string; title: string; email: string; type: string } | null = null;

    const caller = await getCaller(req);

    // ---- Limit for emails anyone can trigger ---------------------------------------------
    // public.wg_email_rate_allow (migration 20261201) decides in one step: at most `perInbox`
    // per inbox per hour (Gmail dots and "+tags" count as the same inbox) and an overall hourly
    // cap. Staff are not limited. Fails closed if the rate-limit check errors.
    const rateAllowed = async (recipient: string, type: string, perInbox = 3): Promise<boolean> => {
      if (caller.staff) return true;
      try {
        const ok = await adminRest('/rest/v1/rpc/wg_email_rate_allow', {
          method: 'POST',
          body: JSON.stringify({ recipient_input: recipient, form_type_input: type, per_recipient: perInbox }),
        });
        return ok !== false;
      } catch (rateErr) {
        console.warn('wg_email_rate_allow unavailable, failing closed:', rateErr);
        return false;
      }
    };
    const TOO_MANY = 'Too many emails were requested for this address. Please try again in an hour.';

    // 2026-11-16: the latest edition is no longer emailed on sign-up or on request (it used
    // too many sending credits). New subscribers get the next scheduled edition instead.
    if (['newsletter_confirmed', 'newsletter_resend'].includes(String(payload.formType))) {
      return json({ success: true, skipped: 'The latest edition is no longer emailed on sign-up.' });
    }

    if (['newsletter_signup', 'newsletter_confirmed', 'newsletter_resend'].includes(String(payload.formType)) && payload.record) {
      const recipient = String(payload.record.email || '').trim().toLowerCase();
      if (!isValidEmail(recipient)) return json({ error: 'Invalid email address' }, 400);
      if (payload.formType !== 'newsletter_signup' && !caller.staff) {
        // The latest edition is only re-sent to someone who is an active subscriber
        const subs = await adminRest(`/rest/v1/newsletter_subscribers?select=status&email=eq.${encodeURIComponent(recipient)}&limit=1`);
        if (!Array.isArray(subs) || !subs.length || subs[0].status !== 'active') {
          return json({ error: 'This address is not an active subscriber.' }, 403);
        }
      }
      if (!(await rateAllowed(recipient, String(payload.formType)))) return json({ error: TOO_MANY }, 429);
    }

    // ---- Submission verification (added 2026-11-13) ------------------------
    // Step 1: a listing was saved as 'pending_verification'; email its owner a one-time link.
    if (payload.formType === 'submission_verify_request' && payload.record) {
      const id = String(payload.record.id || '').trim();
      const email = String(payload.record.email || '').trim().toLowerCase();
      if (!/^[0-9a-f-]{36}$/i.test(id) || !isValidEmail(email)) return json({ error: 'Invalid request' }, 400);
      const row = await loadListing(`id=eq.${encodeURIComponent(id)}`);
      if (!row || String(row.submitter_email || '').trim().toLowerCase() !== email) return json({ error: 'Submission not found' }, 404);
      if (row.status !== 'pending_verification') return json({ error: 'This submission is already verified' }, 409);
      const sentAt = row.verify_sent_at ? Date.parse(row.verify_sent_at) : 0;
      if (sentAt && Date.now() - sentAt < 60_000 && !caller.staff) {
        return json({ error: 'A confirmation email was just sent. Please wait a minute before requesting another.' }, 429);
      }
      if (!(await rateAllowed(email, 'submission_verify_request'))) return json({ error: TOO_MANY }, 429);
      const token = randomToken();
      const expires = new Date(Date.now() + VERIFY_TTL_HOURS * 3600 * 1000).toISOString();
      await adminRest(`/rest/v1/vendor_events?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({ verify_token: token, verify_token_expires_at: expires, verify_sent_at: new Date().toISOString() }),
      });
      const landing = `${SITE_ORIGIN}/news/dashboard.html?verify=1&token=${encodeURIComponent(token)}`;
      const link = await magicLinkFor(email, landing);
      const mail = buildVerificationEmail(row, link);
      const result = await sendEmail(email, mail.subject, mail.html);
      return json({ success: true, result });
    }

    // Step 2: the link was used. Mark the listing verified, then send the receipt + staff alert
    // by falling through to the 'submission_received' template below.
    if (payload.formType === 'submission_verify' && payload.record) {
      const token = String(payload.record.token || '').trim();
      if (!/^[0-9a-f]{48}$/.test(token)) return json({ error: 'This link is not valid.' }, 400);
      const row = await loadListing(`verify_token=eq.${token}`);
      if (!row) return json({ error: 'This link is not valid or has already been used.' }, 404);
      if (row.status !== 'pending_verification') return json({ error: 'This submission is already verified.' }, 409);
      if (row.verify_token_expires_at && Date.parse(row.verify_token_expires_at) < Date.now()) {
        return json({ error: 'This link has expired. Please request a new confirmation email.' }, 410);
      }
      await adminRest(`/rest/v1/vendor_events?id=eq.${encodeURIComponent(row.id)}&status=eq.pending_verification`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({ status: 'pending', verified_at: new Date().toISOString(), verify_token: null, verify_token_expires_at: null }),
      });
      await activateSubscriber(row);
      verifiedListing = { id: row.id, title: row.title || '', email: String(row.submitter_email || '').toLowerCase(), type: listingTypeLabel(row) };
      payload = { formType: 'submission_received', record: { ...row, contact_email: row.submitter_email, type: verifiedListing.type } };
    }

    // Signed-in submitter whose session email matches the listing: no email step needed,
    // but staff must still be told. Only the owner of that email can trigger this.
    if (payload.formType === 'submission_notify' && payload.record) {
      const id = String(payload.record.id || '').trim();
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Invalid request' }, 400);
      const row = await loadListing(`id=eq.${encodeURIComponent(id)}`);
      if (!row || !caller.email || caller.email !== String(row.submitter_email || '').trim().toLowerCase()) {
        return json({ error: 'Not authorized' }, 403);
      }
      if (row.status !== 'pending' || row.verified_at) return json({ error: 'Already notified' }, 409);
      if (!(await rateAllowed(caller.email, 'submission_notify', 10))) return json({ error: 'Too many submissions in the last hour. Please try again later.' }, 429);
      await adminRest(`/rest/v1/vendor_events?id=eq.${encodeURIComponent(row.id)}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({ verified_at: new Date().toISOString() }),
      });
      verifiedListing = { id: row.id, title: row.title || '', email: caller.email, type: listingTypeLabel(row) };
      payload = { formType: 'submission_received', record: { ...row, contact_email: row.submitter_email, type: verifiedListing.type } };
    }

    // ---- Welcome Hamper (added 2026-11-15) ---------------------------------
    // Step 1: an application was saved as 'unverified'; email the applicant a one-time link.
    if (payload.formType === 'business_claim_verify' && payload.record) {
      const id = String(payload.record.id || '').trim();
      const email = String(payload.record.email || '').trim().toLowerCase();
      if (!/^[0-9a-f-]{36}$/i.test(id) || !isValidEmail(email)) return json({ error: 'Invalid request' }, 400);
      const claimRes = await adminRest(`/rest/v1/business_claims?id=eq.${encodeURIComponent(id)}&limit=1`);
      const claims = Array.isArray(claimRes) ? claimRes : [];
      const claim = claims[0];
      if (!claim || String(claim.claimant_email || '').trim().toLowerCase() !== email) {
        return json({ error: 'Claim not found' }, 404);
      }
      if (claim.status !== 'pending_verification') {
        return respond({ error: 'This claim is already verified' }, 409);
      }
      if (!claim.verify_token || (claim.verify_token_expires_at && Date.parse(claim.verify_token_expires_at) < Date.now())) {
        return respond({ error: 'This claim confirmation link has expired. Please submit a new claim.' }, 410);
      }
      const sentAt = claim.verify_sent_at ? Date.parse(claim.verify_sent_at) : 0;
      const sentCount = Number(claim.verify_send_count || 0);
      if (!caller.staff && sentAt && Date.now() - sentAt < 120_000) {
        return json({ error: 'A confirmation email was just sent. Please wait 2 minutes before requesting another.' }, 429);
      }
      if (!caller.staff && sentCount >= 5) {
        return json({ error: TOO_MANY }, 429);
      }
      if (!(await rateAllowed(email, 'business_claim_verify'))) return json({ error: TOO_MANY }, 429);
      await adminRest(`/rest/v1/business_claims?id=eq.${encodeURIComponent(id)}&status=eq.pending_verification`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          verify_sent_at: new Date().toISOString(),
          verify_send_count: sentCount + 1,
        }),
      });
      const link = `${SITE_ORIGIN}/directory?claim_token=${encodeURIComponent(String(claim.verify_token || ''))}`;
      const body = `
        <p style="text-align: center; margin: 0 0 8px 0;">Hello ${escapeHtml(claim.claimant_name)},</p>
        <p style="text-align: center; margin: 0;">You requested to claim <strong>${escapeHtml(claim.business_name)}</strong> on Welcome East Gwillimbury. Click the button below to confirm your email address (<strong>${escapeHtml(email)}</strong>) and send your claim to our team for verification.</p>
        ${hamperButton(link, '&#10003; Confirm my email &amp; submit claim')}
        <p style="text-align: center; font-size: 12px; color: #64748b; margin: 0;">If you did not request this, you can safely ignore this email.</p>`;
      const result = await sendEmail(email, `Welcome East Gwillimbury: confirm your claim for ${claim.business_name}`,
        hamperEmail('Confirm your business claim', 'One more step', body, email));
      return json({ success: true, result });
    }

    if (payload.formType === 'hamper_verify_request' && payload.record) {
      const id = String(payload.record.id || '').trim();
      const email = String(payload.record.email || '').trim().toLowerCase();
      if (!/^[0-9a-f-]{36}$/i.test(id) || !isValidEmail(email)) return json({ error: 'Invalid request' }, 400);
      const app = await loadHamperApplication(`id=eq.${encodeURIComponent(id)}`);
      if (!app || String(app.email || '').trim().toLowerCase() !== email) return json({ error: 'Application not found' }, 404);
      if (app.status !== 'unverified') return json({ error: 'This application is already confirmed' }, 409);
      // Limits per application (re-applying with the same email reuses the row, so these hold):
      // one email per 2 minutes and 5 in total, so the form can't be used to flood an inbox.
      const sentAt = app.verify_sent_at ? Date.parse(app.verify_sent_at) : 0;
      const sentCount = Number(app.verify_send_count || 0);
      if (!caller.staff && sentAt && Date.now() - sentAt < 120_000) {
        return json({ error: 'A confirmation email was just sent. Please wait 2 minutes before requesting another.' }, 429);
      }
      if (!caller.staff && sentCount >= 5) {
        return json({ error: 'Too many confirmation emails have been sent for this application. Please email contact@welcomeeg.ca for help.' }, 429);
      }
      if (!(await rateAllowed(email, 'hamper_verify_request'))) return json({ error: TOO_MANY }, 429);
      const token = randomToken();
      const expires = new Date(Date.now() + VERIFY_TTL_HOURS * 3600 * 1000).toISOString();
      await adminRest(`/rest/v1/hamper_applications?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({ verify_token: token, verify_token_expires_at: expires, verify_sent_at: new Date().toISOString(), verify_send_count: sentCount + 1 }),
      });
      const link = `${SITE_ORIGIN}/hamper/confirmed.html?token=${encodeURIComponent(token)}`;
      const body = `
        <p style="text-align: center; margin: 0 0 8px 0;">Thank you for applying for the <strong>Welcome Hamper</strong>, ${escapeHtml(app.first_name)}.</p>
        <p style="text-align: center; margin: 0;">Your application is saved but <strong>not yet complete</strong>. Click the button below to confirm your email address (<strong>${escapeHtml(email)}</strong>) and send your application to our team.</p>
        ${hamperButton(link, '&#10003; Confirm my email')}
        <p style="text-align: center; font-size: 12px; color: #64748b; margin: 0;">This link works once and expires in ${VERIFY_TTL_HOURS} hours.</p>`;
      const result = await sendEmail(email, 'Welcome East Gwillimbury: confirm your email to complete your Welcome Hamper application',
        hamperEmail('One more step: confirm your email', 'Almost done!', body, email));
      return json({ success: true, result });
    }

    // Step 2: the link was used. Mark the application ready for staff review,
    // send the applicant a receipt and staff an alert.
    if (payload.formType === 'hamper_verify' && payload.record) {
      const token = String(payload.record.token || '').trim();
      if (!/^[0-9a-f]{48}$/.test(token)) return json({ error: 'This link is not valid.' }, 400);
      const app = await loadHamperApplication(`verify_token=eq.${token}`);
      if (!app) return json({ error: 'This link is not valid or has already been used.' }, 404);
      if (app.status !== 'unverified') return json({ error: 'This application is already confirmed.' }, 409);
      if (app.verify_token_expires_at && Date.parse(app.verify_token_expires_at) < Date.now()) {
        return json({ error: 'This link has expired. Please apply again to receive a new confirmation email.' }, 410);
      }
      const now = new Date().toISOString();
      await adminRest(`/rest/v1/hamper_applications?id=eq.${encodeURIComponent(app.id)}&status=eq.unverified`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({ status: 'review', verified_at: now, updated_at: now, verify_token: null, verify_token_expires_at: null }),
      });
      await activateHamperSubscriber(app);
      const email = String(app.email || '').trim().toLowerCase();
      const receipt = `
        <p style="text-align: center; margin: 0 0 12px 0;">Thanks, ${escapeHtml(app.first_name)}. Your email is confirmed and your Welcome Hamper application is with our team.</p>
        <p style="text-align: center; margin: 0 0 12px 0;">We check every proof of residence by hand and will email you when your application is approved. The program opens in <strong>Spring 2027</strong>; approved households receive their coupons then.</p>
        ${hamperButton(`${SITE_ORIGIN}/hamper/wallet.html`, 'Check my application')}`;
      await trySend(email, 'Welcome East Gwillimbury: your Welcome Hamper application is received',
        hamperEmail('Application received', 'Welcome to East Gwillimbury!', receipt, email));
      const alert = `
        <p style="margin: 0 0 12px 0;">A new resident confirmed their Welcome Hamper application. Please check their proof of residence.</p>
        <p style="margin: 4px 0;"><b>Name:</b> ${escapeHtml(app.first_name)} ${escapeHtml(app.last_name)}</p>
        <p style="margin: 4px 0;"><b>Community:</b> ${escapeHtml(app.community)}</p>
        <p style="margin: 4px 0;"><b>Moved in:</b> ${escapeHtml(app.move_in_date || '')}</p>
        <p style="margin: 4px 0;"><b>Proof:</b> ${escapeHtml(String(app.proof_type || '').replace('_', ' '))}</p>
        ${hamperButton(`${SITE_ORIGIN}/hamper/admin.html`, 'Open Hamper admin')}`;
      await trySend(ADMIN_EMAIL, `New Welcome Hamper application: ${String(app.first_name || '')} ${String(app.last_name || '')} (${String(app.community || '')})`,
        hamperEmail('Staff alert', 'New Welcome Hamper application', alert, ADMIN_EMAIL));
      return json({ success: true, first_name: app.first_name || '' });
    }

    // ---- Business accounts (sponsors, /business/), added 2026-11-17 ---------------------
    // Staff create (or reuse) a login for the owner's email, link it to a directory business and
    // email a one-time "set your password" link. Staff never see or set passwords. The link step
    // (wg_admin_set_business_account) refuses staff emails: sponsors must never become staff.
    if (payload.formType === 'business_account_invite' && payload.record) {
      if (!caller.staff) return json({ error: 'Only signed-in staff can create business accounts.' }, 403);
      const email = String(payload.record.email || '').trim().toLowerCase();
      const businessId = String(payload.record.business_id || '').trim();
      if (!isValidEmail(email)) return json({ error: 'Enter a valid email address.' }, 400);
      if (!/^[0-9a-f-]{36}$/i.test(businessId)) return json({ error: 'Pick the business.' }, 400);
      const biz = await adminRest(`/rest/v1/directory_listings?select=id,name&id=eq.${encodeURIComponent(businessId)}&limit=1`);
      if (!Array.isArray(biz) || !biz.length) return json({ error: 'That business is not in the directory.' }, 400);

      try {
        await adminRest('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, email_confirm: true }) });
      } catch (e) {
        if (!/already|exists|registered/i.test(String(e))) throw e; // existing login: reuse it
      }
      const link = await adminRest('/rest/v1/rpc/wg_admin_set_business_account', {
        method: 'POST',
        body: JSON.stringify({ email_input: email, business_id_input: businessId }),
      });
      if (!link || !link.success) return json({ error: (link && link.error) || 'Could not link the account.' }, 400);

      const gen = await adminRest('/auth/v1/admin/generate_link', {
        method: 'POST',
        body: JSON.stringify({ type: 'recovery', email, options: { redirect_to: `${SITE_ORIGIN}/business/` } }),
      });
      const setLink = gen && typeof gen.action_link === 'string' && gen.action_link.startsWith('https://') ? gen.action_link : '';
      if (!setLink) return json({ error: 'The account is linked, but the set-password link could not be made. Try "Send invite" again.' }, 500);

      const bizName = String(biz[0].name || 'your business');
      const body = `
        <p style="text-align: center; margin: 0 0 12px 0;">Welcome East Gwillimbury has set up a business account for <strong>${escapeHtml(bizName)}</strong>.</p>
        <p style="text-align: center; margin: 0 0 12px 0;">Choose your password with the button below. Then sign in any time at
          <a href="${SITE_ORIGIN}/business/">welcomeeg.ca/business</a> to see how many people click your sponsored spots and listings.</p>
        ${hamperButton(setLink, 'Choose my password')}
        <p style="text-align: center; margin: 0; font-size: 12px; color: #64748b;">This link works once. If it has expired, ask Welcome East Gwillimbury to send a new one: ${ADMIN_EMAIL}</p>`;
      await sendEmail(email, `Welcome East Gwillimbury: your business account for ${bizName}`,
        hamperEmail('Business account', 'Your business account is ready', body, email));
      return json({ success: true, business: bizName });
    }

    // Staff-only status emails sent from /hamper/admin.html.
    if (payload.formType === 'hamper_notice' && payload.record) {
      if (!caller.staff) return json({ error: 'Not authorized' }, 403);
      const id = String(payload.record.id || '').trim();
      const kind = String(payload.record.kind || '');
      if (!/^[0-9a-f-]{36}$/i.test(id) || !['approved', 'declined', 'coupons'].includes(kind)) return json({ error: 'Invalid request' }, 400);
      const app = await loadHamperApplication(`id=eq.${encodeURIComponent(id)}`);
      if (!app) return json({ error: 'Application not found' }, 404);
      const email = String(app.email || '').trim().toLowerCase();
      const first = escapeHtml(app.first_name || '');
      let subj = '';
      let html = '';
      if (kind === 'approved') {
        if (app.status !== 'approved') return json({ error: 'Application is not approved' }, 409);
        subj = 'Welcome East Gwillimbury: your Welcome Hamper application is approved';
        html = hamperEmail('Approved', `You're on the list, ${String(app.first_name || '')}!`, `
          <p style="text-align: center; margin: 0 0 12px 0;">Good news, ${first}: we checked your proof of residence and your household is approved for the Welcome Hamper.</p>
          <p style="text-align: center; margin: 0 0 12px 0;">The program opens in <strong>Spring 2027</strong>. We will email you as soon as your digital coupons from local East Gwillimbury businesses are ready.</p>
          ${hamperButton(`${SITE_ORIGIN}/hamper/wallet.html`, 'View my Welcome Hamper')}`, email);
      } else if (kind === 'declined') {
        if (app.status !== 'declined') return json({ error: 'Application is not declined' }, 409);
        const reason = String(app.decline_reason || '').trim();
        subj = 'Welcome East Gwillimbury: about your Welcome Hamper application';
        html = hamperEmail('Application update', 'About your application', `
          <p style="text-align: center; margin: 0 0 12px 0;">Hello ${first}, thank you for applying for the Welcome Hamper. Unfortunately we could not approve your application.</p>
          ${reason ? `<p style="text-align: center; margin: 0 0 12px 0;"><b>Reason:</b> ${escapeHtml(reason)}</p>` : ''}
          <p style="text-align: center; margin: 0;">If you think this is a mistake, email <a href="mailto:${ADMIN_EMAIL}">${ADMIN_EMAIL}</a>.</p>`, email);
      } else {
        const coupons = await adminRest(`/rest/v1/hamper_coupons?select=id&application_id=eq.${encodeURIComponent(id)}&status=eq.available&limit=1`);
        if (!Array.isArray(coupons) || !coupons.length) return json({ error: 'No coupons have been issued yet' }, 409);
        subj = 'Welcome East Gwillimbury: your Welcome Hamper coupons are ready';
        html = hamperEmail('Coupons ready', `Your Welcome Hamper is here, ${String(app.first_name || '')}!`, `
          <p style="text-align: center; margin: 0 0 12px 0;">Your digital coupons from local East Gwillimbury businesses are ready. Each coupon has its own code and QR code and can be used once.</p>
          <p style="text-align: center; margin: 0 0 12px 0;">Sign in with this email address (<strong>${escapeHtml(email)}</strong>) to see them, then show the code or QR code at the business.</p>
          ${hamperButton(`${SITE_ORIGIN}/hamper/wallet.html`, 'Open my coupons')}`, email);
      }
      const result = await sendEmail(email, subj, html);
      return json({ success: true, result });
    }

    // These types send caller-chosen content or staff notifications: staff, the pipeline
    // (service key) or the verification steps above only. Closes the open-relay hole.
    // 'partner' and 'claim' build a sign-in style email to any address; the public forms that used
    // them are retired, so only staff may send them (stops branded phishing via this function).
    const STAFF_ONLY_TYPES = ['newsletter_dispatch', 'submission_received', 'submission_approved', 'partner', 'claim', 'wallet_activated'];
    if (STAFF_ONLY_TYPES.includes(String(payload.formType)) && !caller.staff && !verifiedListing) {
      return json({ error: 'Not authorized' }, 403);
    }

    // Structured, sanitized email generation (preferred)
    if (payload.formType === 'partner' && payload.record) {
      const r = payload.record;
      if (!isValidEmail(r.contact_email)) {
        return new Response(JSON.stringify({ error: "Invalid email address" }), { status: 400 });
      }
      toUser = r.contact_email.trim();
      subject = 'Welcome East Gwillimbury! This is your one-time secure link to sign in';

      const businessName = escapeHtml(r.business_name);
      const contactName = escapeHtml(r.contact_name);
      const contactEmail = escapeHtml(r.contact_email);
      const contactPhone = escapeHtml(r.contact_phone);
      const offer = escapeHtml(r.offer_details || 'N/A');
      const offerB2C = escapeHtml(r.offer_b2c || r.offer_details || 'N/A');
      const offerB2B = escapeHtml(r.offer_b2b || 'N/A');
      const description = escapeHtml(r.business_description || 'N/A');
      const tier = escapeHtml(r.tier || 'Community Supporter');
      const targetAudience = escapeHtml(r.target_audience || 'Both (B2C & B2B)');
      const newsletter = r.join_newsletter ? 'Yes' : 'No';

      // Only links on our own site, HTML-escaped
      const confirmUrl = escapeHtml(safeSiteUrl(r.confirm_url, `https://welcomeeg.ca/claim/confirmed?type=New+Business&email=${encodeURIComponent(r.contact_email.trim().toLowerCase())}`));
      const unsubscribeUrl = `https://welcomeeg.ca/news/unsubscribe.html?email=${encodeURIComponent(r.contact_email.trim().toLowerCase())}`;

      bodyUser = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; padding: 36px 30px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <div style="text-align: center; margin-bottom: 24px;">
            <img src="https://welcomeeg.ca/welcome-eg-logo.png" alt="Welcome East Gwillimbury" style="max-width: 240px; height: auto;" />
          </div>

          <div style="text-align: center; margin-bottom: 20px;">
            <span style="display: inline-block; background-color: #dbeafe; color: #1e40af; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; padding: 6px 14px; border-radius: 9999px; border: 1px solid #bfdbfe;">
              &#10003; Business Registration Received
            </span>
          </div>

          <h1 style="color: #00008b; text-align: center; font-size: 24px; font-weight: 900; margin: 0 0 16px 0;">
            Welcome East Gwillimbury!
          </h1>

          <p style="color: #334155; font-size: 16px; line-height: 1.6; margin-bottom: 24px; text-align: center;">
            Hi <b>${contactName}</b>, this is your one-time secure link to sign in and review your business account.
          </p>

          <div style="text-align: center; margin: 28px 0;">
            <a href="${confirmUrl}" style="background-color: #00008b; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 10px; font-weight: 800; font-size: 16px; display: inline-block;">
              Click here to Sign In
            </a>
          </div>

          <p style="color: #475569; font-size: 14px; line-height: 1.6; text-align: center; margin: 24px 0 0 0;">
            or copy paste this url:<br>
            <a href="${confirmUrl}" style="color: #0284c7; word-break: break-all; font-size: 13px;">${confirmUrl}</a>
          </p>

          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 28px 0 20px 0;">
            <h3 style="color: #0f172a; margin: 0 0 12px 0; font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">Registered Business Summary:</h3>
            <p style="margin: 6px 0; font-size: 14px; color: #334155;"><b>Business:</b> ${businessName}</p>
            <p style="margin: 6px 0; font-size: 14px; color: #334155;"><b>Contact:</b> ${contactName} (${contactPhone})</p>
            <p style="margin: 6px 0; font-size: 14px; color: #334155;"><b>Email:</b> ${contactEmail}</p>
            <p style="margin: 6px 0; font-size: 14px; color: #334155;"><b>Tier:</b> ${tier}</p>
            <p style="margin: 6px 0; font-size: 14px; color: #334155;"><b>Resident Offer (B2C):</b> ${offerB2C}</p>
            <p style="margin: 6px 0; font-size: 14px; color: #334155;"><b>Business Offer (B2B):</b> ${offerB2B}</p>
          </div>

          <p style="color: #64748b; font-size: 13px; line-height: 1.6; text-align: center; margin: 0 0 24px 0;">
            Our team is currently reviewing your registration. Once authorized by an administrator, your business will be enabled to redeem customer 6-character voucher codes via the Hamper Merchant Terminal.
          </p>

          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0 20px 0;" />

          <div style="text-align: center; font-size: 12px; color: #64748b; line-height: 1.6;">
            <p style="margin: 0 0 8px 0;">
              You're receiving this email because you registered a local business with Welcome East Gwillimbury.
            </p>
            <p style="margin: 0;">
              Welcome East Gwillimbury &bull; East Gwillimbury, Ontario, Canada<br>
              <a href="${unsubscribeUrl}" style="color: #64748b; text-decoration: underline;">
                Unsubscribe
              </a>
            </p>
          </div>
        </div>
      `;

      bodyAdmin = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border-left: 4px solid #00008b; background-color: #f9fafb;">
          <h2 style="color: #111827; margin-top: 0;">New Partner Registration</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Business:</td><td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #111827;">${businessName}</td></tr>
            <tr><td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Contact:</td><td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #111827;">${contactName}</td></tr>
            <tr><td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Email:</td><td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #111827;">${contactEmail}</td></tr>
            <tr><td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Phone:</td><td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #111827;">${contactPhone}</td></tr>
            <tr><td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Offer:</td><td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #111827;">${offer}</td></tr>
            <tr><td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Description:</td><td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #111827;">${description}</td></tr>
            <tr><td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Tier:</td><td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #111827;">${tier}</td></tr>
            <tr><td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Target Audience:</td><td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #111827;">${targetAudience}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280;">Newsletter Opt-in:</td><td style="padding: 8px 0; font-weight: bold; color: #111827;">${newsletter}</td></tr>
          </table>
          <div style="margin-top: 20px;">
            <a href="https://welcomeeg.ca/admin" style="background-color: #00008b; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Approve in Admin Portal</a>
          </div>
        </div>
      `;
    } else if (payload.formType === 'claim' && payload.record) {
      const r = payload.record;
      if (!isValidEmail(r.email)) {
        return new Response(JSON.stringify({ error: "Invalid email address" }), { status: 400 });
      }
      toUser = r.email.trim();
      subject = 'Welcome East Gwillimbury! This is your one-time secure link to sign in';

      // Only links on our own site, HTML-escaped
      const confirmUrl = escapeHtml(safeSiteUrl(r.confirm_url, `https://welcomeeg.ca/wallet?token=${encodeURIComponent(r.confirmation_token || '')}&email=${encodeURIComponent(r.email || '')}`));
      const unsubscribeUrl = `https://welcomeeg.ca/news/unsubscribe.html?email=${encodeURIComponent(r.email || '')}`;

      bodyUser = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; padding: 36px 30px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <div style="text-align: center; margin-bottom: 24px;">
            <img src="https://welcomeeg.ca/welcome-eg-logo.png" alt="Welcome East Gwillimbury" style="max-width: 240px; height: auto;" />
          </div>

          <h1 style="color: #00008b; text-align: center; font-size: 22px; font-weight: 900; margin: 0 0 16px 0;">
            Welcome East Gwillimbury!
          </h1>

          <p style="color: #334155; font-size: 16px; line-height: 1.6; margin-bottom: 24px; text-align: center;">
            This is your one-time secure link to sign in.
          </p>

          <div style="text-align: center; margin: 28px 0;">
            <a href="${confirmUrl}" style="background-color: #00008b; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 10px; font-weight: 800; font-size: 16px; display: inline-block;">
              Click here
            </a>
          </div>

          <p style="color: #475569; font-size: 14px; line-height: 1.6; text-align: center; margin: 24px 0 0 0;">
            or copy paste this url:<br>
            <a href="${confirmUrl}" style="color: #0284c7; word-break: break-all; font-size: 13px;">${confirmUrl}</a>
          </p>

          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 32px 0 20px 0;" />

          <div style="text-align: center; font-size: 12px; color: #64748b; line-height: 1.6;">
            <p style="margin: 0 0 8px 0;">
              You're receiving this email because you signed up for a Welcome East Gwillimbury Hamper.
            </p>
            <p style="margin: 0;">
              Welcome East Gwillimbury &bull; East Gwillimbury, Ontario, Canada<br>
              <a href="${unsubscribeUrl}" style="color: #64748b; text-decoration: underline;">
                Unsubscribe
              </a>
            </p>
          </div>
        </div>
      `;

      bodyAdmin = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border-left: 4px solid #00008b; background-color: #f9fafb;">
          <h2 style="color: #111827; margin-top: 0;">New Package Claim</h2>
          <p><strong>Name:</strong> ${escapeHtml(r.full_name)}</p>
          <p><strong>Email:</strong> ${escapeHtml(r.email)}</p>
          <p><strong>Type:</strong> ${escapeHtml(r.user_type || 'Newcomer')}</p>
          <p><strong>Address:</strong> ${escapeHtml(r.address || '')}</p>
          <div style="margin-top: 20px;">
            <a href="https://welcomeeg.ca/admin" style="background-color: #00008b; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">View in Admin Portal</a>
          </div>
        </div>
      `;
    } else if (payload.formType === 'wallet_activated' && payload.record) {
      const r = payload.record;
      if (!isValidEmail(r.email)) {
        return new Response(JSON.stringify({ error: "Invalid email address" }), { status: 400 });
      }
      toUser = r.email.trim();
      subject = 'Welcome East Gwillimbury! Your Digital Wallet is Activated & Offers are Ready to Redeem';

      const recipientName = escapeHtml(r.first_name || r.full_name?.split(' ')[0] || (r.user_type === 'New Business' ? 'Business Partner' : 'Neighbour'));
      const walletUrl = escapeHtml(safeSiteUrl(r.wallet_url, `https://welcomeeg.ca/wallet?email=${encodeURIComponent(r.email.trim().toLowerCase())}`));
      const unsubscribeUrl = `https://welcomeeg.ca/news/unsubscribe.html?email=${encodeURIComponent(r.email.trim().toLowerCase())}`;

      bodyUser = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; padding: 36px 30px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <div style="text-align: center; margin-bottom: 24px;">
            <img src="https://welcomeeg.ca/welcome-eg-logo.png" alt="Welcome East Gwillimbury" style="max-width: 240px; height: auto;" />
          </div>

          <div style="text-align: center; margin-bottom: 20px;">
            <span style="display: inline-block; background-color: #ecfdf5; color: #047857; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; padding: 6px 14px; border-radius: 9999px; border: 1px solid #a7f3d0;">
              &#10003; Verification Approved &bull; Wallet Activated
            </span>
          </div>

          <h1 style="color: #00008b; text-align: center; font-size: 24px; font-weight: 900; margin: 0 0 16px 0;">
            Welcome East Gwillimbury!
          </h1>

          <p style="color: #334155; font-size: 16px; line-height: 1.6; margin-bottom: 16px; text-align: center;">
            Hello ${recipientName},
          </p>

          <p style="color: #334155; font-size: 16px; line-height: 1.6; margin-bottom: 24px; text-align: center;">
            Great news! Your Welcome East Gwillimbury verification has been approved. Your <strong>Digital Perk Pass Wallet</strong> is officially activated and your exclusive local merchant offers are ready to redeem!
          </p>

          <div style="text-align: center; margin: 28px 0;">
            <a href="${walletUrl}" style="background-color: #00008b; color: #ffffff; padding: 14px 34px; text-decoration: none; border-radius: 12px; font-weight: 800; font-size: 16px; display: inline-block; box-shadow: 0 4px 8px rgba(0,0,139,0.25);">
              Access My Digital Wallet &rarr;
            </a>
          </div>

          <p style="color: #475569; font-size: 13px; line-height: 1.6; text-align: center; margin: 20px 0;">
            or copy and paste this URL into your browser:<br>
            <a href="${walletUrl}" style="color: #0284c7; word-break: break-all; font-size: 13px;">${walletUrl}</a>
          </p>

          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; margin: 28px 0; text-align: left;">
            <h3 style="color: #0f172a; font-size: 14px; font-weight: 800; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.5px;">
              How to Redeem In-Store:
            </h3>
            <ol style="margin: 0; padding-left: 20px; color: #475569; font-size: 13px; line-height: 1.6;">
              <li style="margin-bottom: 4px;">Visit any participating Welcome East Gwillimbury partner business.</li>
              <li style="margin-bottom: 4px;">Open your Digital Wallet and tap <strong>&ldquo;Present Offer&rdquo;</strong> on the voucher you wish to use.</li>
              <li>Present the 6-character code (e.g. <code>WG2345</code>, no hyphen) to the cashier to claim your perk.</li>
            </ol>
          </div>

          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 32px 0 20px 0;" />

          <div style="text-align: center; font-size: 12px; color: #64748b; line-height: 1.6;">
            <p style="margin: 0 0 8px 0;">
              You're receiving this email because you signed up for a Welcome East Gwillimbury Hamper.
            </p>
            <p style="margin: 0;">
              Welcome East Gwillimbury &bull; East Gwillimbury, Ontario, Canada<br>
              <a href="${unsubscribeUrl}" style="color: #64748b; text-decoration: underline;">
                Unsubscribe
              </a>
            </p>
          </div>
        </div>
      `;

      bodyAdmin = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border-left: 4px solid #10b981; background-color: #f9fafb;">
          <h2 style="color: #111827; margin-top: 0;">Wallet Activated &amp; Notification Dispatched</h2>
          <p><strong>Recipient:</strong> ${escapeHtml(r.full_name || recipientName)}</p>
          <p><strong>Email:</strong> ${escapeHtml(r.email)}</p>
          <p><strong>Type:</strong> ${escapeHtml(r.user_type || 'Resident')}</p>
          <p><strong>Vouchers Issued:</strong> ${escapeHtml(String(r.coupons_issued || 0))}</p>
        </div>
      `;
    } else if (payload.formType === 'newsletter_signup' && payload.record) {
      const r = payload.record;
      if (!isValidEmail(r.email)) {
        return new Response(JSON.stringify({ error: "Invalid email address" }), { status: 400 });
      }
      toUser = r.email.trim();
      const email = escapeHtml(r.email);
      // 2026-11-13: the confirmation token is looked up here, never taken from the browser.
      // 2026-11-17: so are the name, area and edition: text from the request never goes into the email.
      let token = '';
      let stored: any = {};
      try {
        const subRows = await adminRest(`/rest/v1/newsletter_subscribers?select=unsubscribe_token,first_name,community_area,audience_type&email=eq.${encodeURIComponent(toUser.toLowerCase())}&limit=1`);
        if (Array.isArray(subRows) && subRows.length) stored = subRows[0] || {};
        if (stored.unsubscribe_token) token = String(stored.unsubscribe_token);
      } catch (e) {
        console.warn('Subscriber token lookup failed:', e);
      }
      if (!token) return json({ error: 'Subscriber not found. Please sign up again.' }, 404);
      const firstName = escapeHtml(String(stored.first_name || '').slice(0, 80) || 'Neighbour');
      const area = escapeHtml(String(stored.community_area || '').slice(0, 80) || 'All East Gwillimbury');
      const audience = String(stored.audience_type || 'reader');
      const confirmUrl = `https://welcomeeg.ca/news/confirm.html?token=${encodeURIComponent(token)}`;

      subject = 'Confirm your subscription to the Welcome East Gwillimbury Newsletter';

      bodyUser = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 24px auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px 28px; text-align: center; box-shadow: 0 4px 12px rgba(15,23,42,0.06);">
          <div style="margin-bottom: 20px;">
            <img src="https://welcomeeg.ca/welcome-eg-logo.png" alt="Welcome East Gwillimbury" style="max-width: 220px; height: auto;" />
          </div>
          <div style="display: inline-block; background-color: #dbeafe; color: #1e40af; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; padding: 4px 10px; border-radius: 4px; margin-bottom: 12px;">
            Confirm Your Email Address
          </div>
          <h2 style="margin: 0 0 12px 0; color: #00008b; font-size: 24px;">Welcome to Welcome East Gwillimbury, ${firstName}!</h2>
          <p style="margin: 0 0 22px 0; color: #334155; font-size: 15px; line-height: 1.6;">
            Please click the button below to confirm your email address (<b>${email}</b>) and activate your subscription.
            Once you confirm, you will receive the <b>next edition of the Welcome East Gwillimbury Newsletter</b>.
          </p>
          <a href="${confirmUrl}" style="background-color: #00008b; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 15px; display: inline-block;">
            &#10003; Confirm My Email Address
          </a>
          <p style="margin: 18px 0 0 0; font-size: 12px; color: #64748b; line-height: 1.5;">
            Or copy and paste this link into your browser:<br>
            <a href="${confirmUrl}" style="color: #0284c7; word-break: break-all;">${confirmUrl}</a>
          </p>
        </div>
      `;

      // 2026-11-17: no staff notification on newsletter signup per Robert's request (saves inbox noise & credits).
    } else if ((payload.formType === 'newsletter_confirmed' || payload.formType === 'newsletter_resend') && payload.record) {
      const r = payload.record;
      if (!isValidEmail(r.email)) {
        return new Response(JSON.stringify({ error: "Invalid email address" }), { status: 400 });
      }
      toUser = r.email.trim();
      const firstName = escapeHtml(r.first_name || 'Neighbour');
      const audience = String(r.audience_type || 'reader');
      const token = String(r.token || r.unsubscribe_token || '');

      const editionToFetch = audience === 'vendor' ? 'vendor' : 'reader';
      const latest = await fetchLatestNewsletterHtml(editionToFetch, token);

      subject = latest.subject;

      const confirmedHeaderHtml = payload.formType === 'newsletter_confirmed' ? `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 16px auto 8px auto; background-color: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 14px 18px; text-align: center; color: #166534; font-size: 14px;">
          <b>&#10003; Subscription Confirmed!</b> Thank you, ${firstName} — here is the latest edition of the Welcome East Gwillimbury Newsletter.
        </div>
      ` : '';

      bodyUser = latest.html
        ? `${confirmedHeaderHtml}\n${latest.html}`
        : `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 24px auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 12px; text-align: center;">
            <h2 style="color: #00008b; margin-top: 0;">&#10003; Your Subscription is Confirmed!</h2>
            <p style="color: #334155; font-size: 15px; line-height: 1.6;">
              Thank you for confirming your email address, ${firstName}. You are now subscribed to both the Monday (Monday–Friday listings) and Thursday (this coming weekend & next weekend, Friday–Sunday listings) Welcome East Gwillimbury Newsletter editions!
            </p>
          </div>
        `;
    } else if (payload.formType === 'newsletter_dispatch' && payload.record) {
      const r = payload.record;
      if (!isValidEmail(r.email)) {
        return new Response(JSON.stringify({ error: "Invalid email address" }), { status: 400 });
      }
      toUser = r.email.trim();
      subject = String(r.subject || 'Welcome East Gwillimbury • Weekly Community Newsletter');
      bodyUser = String(r.html_body || '');
      if (!bodyUser) {
        return new Response(JSON.stringify({ error: "Missing html_body" }), { status: 400 });
      }
    } else if (payload.formType === 'submission_received' && payload.record) {
      const r = payload.record;
      const targetEmail = r.contact_email || r.submitter_email;
      if (!isValidEmail(targetEmail)) {
        return new Response(JSON.stringify({ error: "Invalid email address" }), { status: 400 });
      }
      toUser = targetEmail.trim();
      const contactName = escapeHtml(r.contact_name || 'Community Partner');
      const itemTitle = escapeHtml(r.title || 'Community Listing');
      const itemType = escapeHtml(r.type || 'Submission');
      const itemOrg = escapeHtml(r.business_name || '');
      const itemDate = escapeHtml(r.event_date_label || 'Upcoming');
      const itemLoc = escapeHtml(r.location || 'East Gwillimbury, ON');
      const unsubscribeUrl = `https://welcomeeg.ca/news/unsubscribe.html?email=${encodeURIComponent(toUser)}`;

      subject = `Thank you for your submission to Welcome East Gwillimbury! [${itemType} Received]`;

      bodyUser = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; padding: 36px 30px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <div style="text-align: center; margin-bottom: 24px;">
            <img src="https://welcomeeg.ca/welcome-eg-logo.png" alt="Welcome East Gwillimbury" style="max-width: 240px; height: auto;" />
          </div>

          <div style="text-align: center; margin-bottom: 20px;">
            <span style="display: inline-block; background-color: #dbeafe; color: #1e40af; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; padding: 6px 14px; border-radius: 9999px; border: 1px solid #bfdbfe;">
              &#10003; ${itemType} Received &bull; Verification Queue
            </span>
          </div>

          <h1 style="color: #00008b; text-align: center; font-size: 24px; font-weight: 900; margin: 0 0 16px 0;">
            Thank You, ${contactName}!
          </h1>

          <p style="color: #334155; font-size: 16px; line-height: 1.6; margin-bottom: 24px; text-align: center;">
            We have securely received your <strong>${itemType}</strong> submission for <strong>${itemTitle}</strong>. 
            Our community editorial team reviews all submissions to verify accuracy for local residents (typically within 1–2 business days).
          </p>

          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 24px 0; text-align: left;">
            <h3 style="color: #0f172a; margin: 0 0 12px 0; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">
              Submission Summary:
            </h3>
            <p style="margin: 6px 0; font-size: 14px; color: #334155;"><b>Title:</b> ${itemTitle}</p>
            ${itemOrg ? `<p style="margin: 6px 0; font-size: 14px; color: #334155;"><b>Organization / Business:</b> ${itemOrg}</p>` : ''}
            <p style="margin: 6px 0; font-size: 14px; color: #334155;"><b>Date &amp; Schedule:</b> ${itemDate}</p>
            <p style="margin: 6px 0; font-size: 14px; color: #334155;"><b>Location:</b> ${itemLoc}</p>
            <p style="margin: 6px 0; font-size: 14px; color: #334155;"><b>Status:</b> Queued for Verification</p>
          </div>

          <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 18px; margin: 24px 0; text-align: left;">
            <h4 style="color: #1e40af; margin: 0 0 6px 0; font-size: 14px; font-weight: 800;">
              What Happens Next:
            </h4>
            <p style="margin: 0; font-size: 13px; color: #1e3a8a; line-height: 1.5;">
              As soon as an administrator verifies and approves your listing, you will receive an approval email with your direct share link. 
              Your approved listing will also be scheduled for inclusion in our upcoming weekly Welcome East Gwillimbury newsletter!
            </p>
          </div>

          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 28px 0 20px 0;" />

          <div style="text-align: center; font-size: 12px; color: #64748b; line-height: 1.6;">
            <p style="margin: 0 0 8px 0;">
              You received this message because you submitted a community listing on Welcome East Gwillimbury.
            </p>
            <p style="margin: 0;">
              Welcome East Gwillimbury &bull; East Gwillimbury, Ontario, Canada<br>
              <a href="${unsubscribeUrl}" style="color: #64748b; text-decoration: underline;">Unsubscribe</a>
            </p>
          </div>
        </div>
      `;

      adminSubject = `[Staff Alert] New ${itemType} awaiting review: ${itemTitle}`;
      bodyAdmin = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border-left: 4px solid #00008b; background-color: #f9fafb;">
          <h2 style="color: #111827; margin-top: 0;">New ${itemType} Awaiting Review (email verified)</h2>
          <p><strong>Title:</strong> ${itemTitle}</p>
          <p><strong>Organization:</strong> ${itemOrg || 'N/A'}</p>
          <p><strong>Contact:</strong> ${contactName} (${escapeHtml(toUser)})</p>
          <p><strong>Date:</strong> ${itemDate}</p>
          <p><strong>Location:</strong> ${itemLoc}</p>
          <div style="margin-top: 20px;">
            <a href="https://welcomeeg.ca/staff/admin-approvals.html" style="background-color: #00008b; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Open the Approvals Queue</a>
          </div>
        </div>
      `;
    } else if (payload.formType === 'submission_approved' && payload.record) {
      const r = payload.record;
      const targetEmail = r.contact_email || r.submitter_email;
      if (!isValidEmail(targetEmail)) {
        return new Response(JSON.stringify({ error: "Invalid email address" }), { status: 400 });
      }
      toUser = targetEmail.trim();
      const contactName = escapeHtml(r.contact_name || 'Community Partner');
      const itemTitle = escapeHtml(r.title || 'Community Listing');
      const itemType = escapeHtml(r.type || 'Listing');
      const liveUrl = safeSiteUrl(r.live_url, `https://welcomeeg.ca/events/${encodeURIComponent(r.slug || '')}`);
      const unsubscribeUrl = `https://welcomeeg.ca/news/unsubscribe.html?email=${encodeURIComponent(toUser)}`;
      const hasImage = Boolean(r.image_url && !String(r.image_url).startsWith('pending:'));

      const encodedUrl = encodeURIComponent(liveUrl);
      const liveUrlHtml = escapeHtml(liveUrl);
      const shareTitle = encodeURIComponent(`Check out ${r.title} on Welcome East Gwillimbury!`);
      const fbShare = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
      const xShare = `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${shareTitle}`;
      const liShare = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
      const waShare = `https://api.whatsapp.com/send?text=${shareTitle}%20${encodedUrl}`;

      subject = `🎉 Your listing is live on Welcome East Gwillimbury! Here is your share link`;

      bodyUser = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; padding: 36px 30px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <div style="text-align: center; margin-bottom: 24px;">
            <img src="https://welcomeeg.ca/welcome-eg-logo.png" alt="Welcome East Gwillimbury" style="max-width: 240px; height: auto;" />
          </div>

          <div style="text-align: center; margin-bottom: 20px;">
            <span style="display: inline-block; background-color: #ecfdf5; color: #047857; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; padding: 6px 14px; border-radius: 9999px; border: 1px solid #a7f3d0;">
              &#10003; Verification Approved &bull; Published Live
            </span>
          </div>

          <h1 style="color: #00008b; text-align: center; font-size: 24px; font-weight: 900; margin: 0 0 16px 0;">
            Congratulations, ${contactName}!
          </h1>

          <p style="color: #334155; font-size: 16px; line-height: 1.6; margin-bottom: 24px; text-align: center;">
            Great news! Your <strong>${itemType}</strong> for <strong>${itemTitle}</strong> has been officially verified and published to the live Welcome East Gwillimbury directory and newsletter calendar!
          </p>

          <div style="text-align: center; margin: 28px 0;">
            <a href="${liveUrlHtml}" style="background-color: #00008b; color: #ffffff; padding: 14px 34px; text-decoration: none; border-radius: 12px; font-weight: 800; font-size: 16px; display: inline-block; box-shadow: 0 4px 8px rgba(0,0,139,0.25);">
              View My Published Listing &rarr;
            </a>
          </div>

          <p style="color: #475569; font-size: 13px; line-height: 1.6; text-align: center; margin: 16px 0;">
            Direct URL:<br>
            <a href="${liveUrlHtml}" style="color: #0284c7; word-break: break-all; font-size: 13px;">${liveUrlHtml}</a>
          </p>

          <!-- Social Media Share Box -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 22px; margin: 28px 0; text-align: center;">
            <h3 style="color: #0f172a; margin: 0 0 6px 0; font-size: 15px; font-weight: 800;">
              Share Your Listing on Social Media
            </h3>
            <p style="color: #64748b; font-size: 12px; margin: 0 0 16px 0;">
              ${hasImage 
                ? 'Your approved photo has been set as the social media preview card!' 
                : 'Your listing will automatically display the official Welcome East Gwillimbury community banner when shared!'}
            </p>

            <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
              <a href="${fbShare}" target="_blank" style="background-color: #1877f2; color: #ffffff; font-weight: 700; font-size: 12px; padding: 8px 16px; border-radius: 8px; text-decoration: none; display: inline-block;">Facebook</a>
              <a href="${xShare}" target="_blank" style="background-color: #000000; color: #ffffff; font-weight: 700; font-size: 12px; padding: 8px 16px; border-radius: 8px; text-decoration: none; display: inline-block;">X (Twitter)</a>
              <a href="${liShare}" target="_blank" style="background-color: #0a66c2; color: #ffffff; font-weight: 700; font-size: 12px; padding: 8px 16px; border-radius: 8px; text-decoration: none; display: inline-block;">LinkedIn</a>
              <a href="${waShare}" target="_blank" style="background-color: #25d366; color: #ffffff; font-weight: 700; font-size: 12px; padding: 8px 16px; border-radius: 8px; text-decoration: none; display: inline-block;">WhatsApp</a>
            </div>
          </div>

          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 28px 0 20px 0;" />

          <div style="text-align: center; font-size: 12px; color: #64748b; line-height: 1.6;">
            <p style="margin: 0 0 8px 0;">
              Welcome East Gwillimbury &bull; East Gwillimbury, Ontario, Canada
            </p>
            <p style="margin: 0;">
              <a href="${unsubscribeUrl}" style="color: #64748b; text-decoration: underline;">Unsubscribe</a>
            </p>
          </div>
        </div>
      `;
    } else {
      return new Response(JSON.stringify({ error: "Invalid email payload format" }), {
        headers: { "Content-Type": "application/json" },
        status: 400,
      });
    }

    if (verifiedListing) {
      // The listing is already confirmed (saved above): a failed email must not undo that for the user.
      await trySend(toUser, subject, bodyUser);
      if (bodyAdmin) await trySend(ADMIN_EMAIL, adminSubject || subject, bodyAdmin);
      return json({ success: true, verified: verifiedListing });
    }
    const userResult = await sendEmail(toUser, subject, bodyUser);
    const adminSent = bodyAdmin ? await trySend(ADMIN_EMAIL, adminSubject || subject, bodyAdmin) : null;

    return json({ success: true, userResult, adminSent, verified: verifiedListing });

  } catch (error) {
    // Details stay in the function log; callers get a plain message (no table or provider errors).
    console.error("Email Error:", error);
    return new Response(JSON.stringify({ error: 'The email could not be sent. Please try again later.' }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": reqOrigin, "Vary": "Origin" },
      status: 500,
    });
  }
});
