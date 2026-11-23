import React, { useCallback, useEffect, useState } from 'react';
import { GEORGINA_COMMUNITIES, OUT_OF_AREA, SERVICE_OPTIONS, serviceTypesFor } from '../utils/communities';
import { SALE_CATEGORIES } from '../utils/saleCategories';
import { Link } from 'react-router-dom';
import { Calendar, Utensils, Tag, Pencil, Trash2, Eye, Mail, Plus, LogOut, MousePointerClick, X, CheckCircle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { sendSubmissionVerificationEmail } from '../services/emailService';
import { detailPath, normalizeLink } from '../utils/links';
import ImageUpload from '../components/ImageUpload';
import SchedulePicker from '../components/submission/SchedulePicker';
import { computeSchedule, scheduleFromRow } from '../components/submission/submissionLogic';

// "My Submissions" (v60): replaces the old /news/dashboard.html hub.
// - Landing page for the submission confirmation email (?verify=1&token=...) and for
//   magic-link sign-in (the old dashboard address forwards here with the same ?query and #hash).
// - A signed-in submitter sees, edits and deletes their own events, dining specials and sales,
//   with page views and website clicks for each.
// Submitting new listings happens on /submission only.

const DINING = ['dining', 'restaurant', 'food_and_drink', 'dining_deals'];
const SALES = ['sale', 'sales', 'local_sales', 'special_sale', 'sales_deal'];
function typeOf(row) {
  const c = String(row.category || '').toLowerCase();
  if (DINING.includes(c)) return 'Dining';
  if (SALES.includes(c) || String(row.title || '').startsWith('[Sale]')) return 'Sale';
  return 'Event';
}
const TYPE_ICON = { Event: Calendar, Dining: Utensils, Sale: Tag };
const STATUS = {
  pending_verification: ['Confirm your email', 'bg-amber-100 text-amber-900 border-amber-200'],
  pending: ['Waiting for review', 'bg-blue-100 text-blue-900 border-blue-200'],
  approved: ['Live on the site', 'bg-emerald-100 text-emerald-900 border-emerald-200'],
  rejected: ['Not approved', 'bg-rose-100 text-rose-900 border-rose-200'],
};

function fmtDate(raw) {
  if (!raw) return '';
  const d = new Date(String(raw).length === 10 ? `${raw}T12:00:00` : raw);
  return isNaN(d) ? '' : d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

async function functionError(error, data) {
  let msg = (data && data.error) || (error && error.message) || 'Unknown error';
  try {
    if (error && error.context && typeof error.context.json === 'function') {
      const body = await error.context.json();
      if (body && body.error) msg = body.error;
    }
  } catch (_) { /* keep the first message */ }
  return msg;
}

const EDIT_FIELDS = [
  ['title', 'Title', 'text', 200],
  ['business_name', 'Business / organizer', 'text', 120],
  ['community', 'Community Area', 'community'],
  ['price_text', 'Deal / discount text', 'text', 120, 'Sale'],
  ['sale_category', 'Sale category', 'salecat', 0, 'Sale'],
  ['location', 'Location / address', 'text', 200],
  ['link', 'Website link (optional)', 'text', 500],
  ['summary', 'Description', 'textarea', 2000],
  ['contact_name', 'Contact name', 'text', 120],
  ['contact_phone', 'Contact phone', 'tel', 40],
];

export default function MySubmissions() {
  const [notice, setNotice] = useState(null); // { tone: 'ok'|'warn'|'bad', text }
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [linkSent, setLinkSent] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [editing, setEditing] = useState(null); // row being edited
  const [form, setForm] = useState({});

  const userEmail = String(session?.user?.email || '').trim().toLowerCase();

  // 1. Confirmation links (run once, before anything else).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') || '';
    if (!token) return;
    (async () => {
      if (/^[0-9a-f]{48}$/.test(token)) {
        const { data, error } = await supabase.functions.invoke('send-email', {
          body: { formType: 'submission_verify', record: { token } },
        });
        if (error) {
          setNotice({ tone: 'warn', text: `We couldn't confirm this link: ${await functionError(error, data)} If you are signed in, use "Resend confirmation email" below.` });
        } else {
          const v = (data && data.verified) || {};
          setNotice({ tone: 'ok', text: `Thank you! Your email is confirmed and your ${(v.type || 'listing').toLowerCase()} "${v.title || ''}" has been sent to our editorial team for review.` });
        }
      } else {
        const { error } = await supabase.rpc('confirm_newsletter_subscriber', { token_input: token });
        setNotice(error
          ? { tone: 'warn', text: "We couldn't confirm your newsletter subscription. The link may have expired." }
          : { tone: 'ok', text: 'Your email is confirmed. Welcome to the Welcome East Gwillimbury weekly newsletter!' });
      }
      // Remove the one-time token from the address bar.
      window.history.replaceState(null, '', window.location.pathname);
    })();
  }, []);

  // 2. Session (magic-link sign-in arrives as #access_token=... and is picked up by supabase-js).
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data ? data.session : null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const load = useCallback(async () => {
    if (!userEmail) return;
    setLoading(true);
    try {
      const [mine, counts] = await Promise.all([
        supabase.rpc('get_my_submissions', { email_input: userEmail }),
        supabase.rpc('wg_my_click_counts'),
      ]);
      if (mine.error) throw mine.error;
      setRows(mine.data || []);
      setStats(counts.data || {});
    } catch (err) {
      setNotice({ tone: 'bad', text: `Could not load your submissions: ${err.message || err}` });
    } finally {
      setLoading(false);
    }
  }, [userEmail]);

  useEffect(() => { load(); }, [load]);

  async function sendSignInLink(e) {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) { setNotice({ tone: 'warn', text: 'Please enter a valid email address.' }); return; }
    // The old dashboard address is an approved sign-in return address; it forwards here.
    const { error } = await supabase.auth.signInWithOtp({
      email: clean,
      // Same as the existing sign-in page: submitters may not have an account yet.
      options: { emailRedirectTo: `${window.location.origin}/news/dashboard.html`, shouldCreateUser: true },
    });
    if (error) {
      setNotice({ tone: 'warn', text: `Could not send the sign-in link: ${error.message}` });
      return;
    }
    setLinkSent(true);
    setNotice(null);
  }

  async function resend(row) {
    setBusyId(row.id);
    try {
      await sendSubmissionVerificationEmail({ contactEmail: row.submitter_email, id: row.id, status: 'pending_verification' });
      setNotice({ tone: 'ok', text: `Confirmation email sent to ${row.submitter_email}.` });
    } catch (err) {
      setNotice({ tone: 'bad', text: `Could not send the email: ${err.message || err}` });
    } finally {
      setBusyId(null);
    }
  }

  // Signed in = the address is proven, but someone else may have filed a listing under it, so
  // only the listing the owner picks is confirmed and sent to staff.
  async function confirmMine(row) {
    setBusyId(row.id);
    try {
      const { data, error } = await supabase.rpc('confirm_my_submissions', { ids_input: [row.id] });
      if (error) throw error;
      if (!Array.isArray(data) || !data.includes(row.id)) throw new Error('This listing could not be confirmed.');
      await sendSubmissionVerificationEmail({ contactEmail: userEmail, id: row.id, status: 'pending' });
      setNotice({ tone: 'ok', text: `Thank you! "${row.title}" is confirmed and has been sent to our team for review.` });
      load();
    } catch (err) {
      setNotice({ tone: 'bad', text: `Could not confirm: ${err.message || err}` });
    } finally {
      setBusyId(null);
    }
  }

  async function remove(row) {
    if (!window.confirm(`Delete "${row.title}"? It will be removed from Welcome East Gwillimbury. This cannot be undone.`)) return;
    setBusyId(row.id);
    const { data, error } = await supabase.rpc('delete_my_submission', { id_input: row.id, email_input: userEmail });
    setBusyId(null);
    if (error || !data || !data.success) {
      setNotice({ tone: 'bad', text: `Could not delete: ${error ? error.message : (data && data.error) || 'nothing changed'}` });
      return;
    }
    setNotice({ tone: 'ok', text: `"${row.title}" was deleted.` });
    load();
  }

  function openEdit(row) {
    const f = {};
    EDIT_FIELDS.forEach(([key]) => { f[key] = row[key] == null ? '' : String(row[key]); });
    // Tags such as "[Sale]" or "[Eat-In, Take-Out]" stay on the title but are not edited here.
    const tagMatch = (f.title || '').match(/^(?:\s*\[[^\]]*\]\s*)+/);
    f._titlePrefix = tagMatch ? tagMatch[0].trim() + ' ' : '';
    f.title = (f.title || '').slice(tagMatch ? tagMatch[0].length : 0).trim();
    f._services = serviceTypesFor(row);
    f._image = String(row.image_url || '').replace(/^pending:/, '');
    f._imageOrig = f._image;
    const schedKind = typeOf(row).toLowerCase();
    f._schedule = scheduleFromRow(row, schedKind);
    f._scheduleOrig = JSON.stringify(f._schedule);
    setForm(f);
    setEditing(row);
  }

  async function saveEdit(e) {
    e.preventDefault();
    const row = editing;
    const updates = {};
    const kind = typeOf(row);
    const schedKind = kind.toLowerCase();
    EDIT_FIELDS.forEach(([key, , , , onlyFor]) => {
      if (onlyFor && onlyFor !== kind) return;
      let v = String(form[key] ?? '').trim();
      if (key === 'title') {
        if (!v) { updates.title = ''; return; }
        v = `${form._titlePrefix || ''}${v}`;
      }
      if (v !== String(row[key] ?? '').trim()) updates[key] = v;
    });
    if (form._schedule && JSON.stringify(form._schedule) !== form._scheduleOrig) {
      const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const computed = computeSchedule(schedKind, form._schedule, todayStr);
      if (computed.error) {
        setNotice({ tone: 'warn', text: computed.error });
        return;
      }
      updates.date_type = computed.dateType;
      updates.recurrence_rule = computed.recurrenceRule || '';
      updates.event_start_date = computed.startDate || '';
      updates.expires_after = computed.expiresAfter || '';
      updates.event_date_label = computed.label;
    }
    if (kind === 'Dining') {
      const before = serviceTypesFor(row).join('|');
      const after = SERVICE_OPTIONS.filter(s => (form._services || []).includes(s));
      if (after.join('|') !== before) updates.service_options = after;
    }
    if ((form._image || '') !== (form._imageOrig || '')) updates.image_url = form._image || '';
    if (!Object.keys(updates).length) { setEditing(null); return; }
    if (updates.title === '') { setNotice({ tone: 'warn', text: 'The title cannot be empty.' }); return; }
    if ('link' in updates) {
      const cleanLink = normalizeLink(updates.link);
      if (cleanLink === null) { setNotice({ tone: 'warn', text: 'Please check the website link, for example https://yourbusiness.ca' }); return; }
      updates.link = cleanLink;
    }
    setBusyId(row.id);
    const { data, error } = await supabase.rpc('update_my_submission', { id_input: row.id, email_input: userEmail, updates });
    if (error || !data || !data.success) {
      setBusyId(null);
      setNotice({ tone: 'bad', text: `Could not save: ${error ? error.message : (data && data.error) || 'nothing changed'}` });
      return;
    }
    // Edits go back to staff for review. A listing that was still waiting for email
    // confirmation is now confirmed by this signed-in edit, so tell staff about it.
    if (row.status === 'pending_verification' || (row.status === 'pending' && !row.verified_at)) {
      try { await sendSubmissionVerificationEmail({ contactEmail: userEmail, id: row.id, status: 'pending' }); } catch (_) { /* staff still see it in the queue */ }
    }
    setBusyId(null);
    setEditing(null);
    setNotice({ tone: 'ok', text: `Saved. "${updates.title || row.title}" goes back to our team for a quick review before the changes appear.` });
    load();
  }

  async function signOut() {
    await supabase.auth.signOut();
    setRows([]);
    setStats({});
  }

  const toneClass = { ok: 'bg-emerald-50 border-emerald-200 text-emerald-900', warn: 'bg-amber-50 border-amber-200 text-amber-900', bad: 'bg-rose-50 border-rose-200 text-rose-900' };

  return (
    <div className="max-w-[1440px] mx-auto w-full px-4 md:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wider text-[#00008b]">Businesses &amp; organizers</p>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900">My Submissions</h1>
          <p className="text-sm text-gray-600 mt-1">See, edit or remove the events, dining specials and sales you submitted, and how many people clicked through to your website.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/submission" className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#00008b] hover:bg-blue-900 text-white text-xs font-black uppercase tracking-wider"><Plus className="w-4 h-4" />Submit an event</Link>
          <Link to="/submission?tab=dining" className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white border border-gray-200 hover:border-blue-300 text-gray-800 text-xs font-black uppercase tracking-wider">Dining special</Link>
          <Link to="/submission?tab=sales" className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white border border-gray-200 hover:border-blue-300 text-gray-800 text-xs font-black uppercase tracking-wider">Sale</Link>
        </div>
      </div>

      {notice && (
        <div role="status" className={`rounded-2xl border p-4 text-sm font-bold ${toneClass[notice.tone] || toneClass.ok}`}>{notice.text}</div>
      )}

      {session === undefined ? (
        <p className="text-sm text-gray-500">Loading&hellip;</p>
      ) : !session ? (
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 sm:p-8 max-w-xl">
          <h2 className="text-lg font-black text-gray-900 mb-1">Sign in to see your submissions</h2>
          <p className="text-sm text-gray-600 mb-4">Enter the email you submitted with. We'll email you a one-time sign-in link, no password needed.</p>
          {linkSent ? (
            <p className="text-sm font-bold text-emerald-800 flex items-center gap-2"><Mail className="w-4 h-4" />Check your inbox for the sign-in link.</p>
          ) : (
            <form onSubmit={sendSignInLink} className="flex flex-col sm:flex-row gap-3">
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.ca" autoComplete="email"
                className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              <button type="submit" className="px-5 py-3 rounded-xl bg-[#00008b] hover:bg-blue-900 text-white text-xs font-black uppercase tracking-wider">Email me a link</button>
            </form>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
            <span>Signed in as <strong className="text-gray-900">{userEmail}</strong></span>
            <button type="button" onClick={signOut} className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 hover:underline"><LogOut className="w-4 h-4" />Sign out</button>
          </div>

          {loading ? (
            <p className="text-sm text-gray-500">Loading your submissions&hellip;</p>
          ) : rows.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-gray-300 p-8 text-center text-gray-600">
              <p className="font-bold">You have no submissions yet.</p>
              <Link to="/submission" className="inline-block mt-2 text-sm font-black text-[#00008b] hover:underline">Submit your first event &rarr;</Link>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {rows.map((row) => {
                const type = typeOf(row);
                const Icon = TYPE_ICON[type];
                const [statusLabel, statusClass] = STATUS[row.status] || [row.status, 'bg-gray-100 text-gray-800 border-gray-200'];
                const s = stats[row.id] || {};
                return (
                  <article key={row.id} className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5 flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-gray-500"><Icon className="w-3.5 h-3.5" />{type}</span>
                      <span className={`px-2.5 py-1 rounded-full border text-[11px] font-black ${statusClass}`}>{statusLabel}</span>
                    </div>
                    <h3 className="text-lg font-black text-gray-900 leading-snug break-words">{row.title}</h3>
                    <p className="text-sm text-gray-600">{[row.event_date_label || fmtDate(row.event_start_date), row.location].filter(Boolean).join(' • ')}</p>
                    <div className="flex gap-4 text-xs font-bold text-gray-700">
                      <span className="inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{Number(s.views || row.view_count || 0)} views</span>
                      <span className="inline-flex items-center gap-1"><MousePointerClick className="w-3.5 h-3.5" />{Number(s.clicks || 0)} website clicks</span>
                    </div>
                    <p className="text-[11px] text-gray-400">Submitted {fmtDate(row.created_at)}</p>
                    <div className="mt-auto pt-3 border-t border-gray-100 flex flex-wrap gap-2">
                      {row.status === 'approved' && (
                        <Link to={detailPath(row)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-bold text-gray-800"><Eye className="w-3.5 h-3.5" />View</Link>
                      )}
                      {row.status === 'pending_verification' && (
                        <button type="button" disabled={busyId === row.id} onClick={() => confirmMine(row)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-xs font-bold text-emerald-900 disabled:opacity-60"><CheckCircle className="w-3.5 h-3.5" />Confirm, this is my listing</button>
                      )}
                      {row.status === 'pending_verification' && (
                        <button type="button" disabled={busyId === row.id} onClick={() => resend(row)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-xs font-bold text-amber-900 disabled:opacity-60"><Mail className="w-3.5 h-3.5" />Resend confirmation email</button>
                      )}
                      {row.status === 'rejected' ? (
                        <p className="w-full text-[11px] text-gray-500">This listing was not approved, so it can't be edited. Questions? Email <a href="mailto:contact@welcomeeg.ca" className="font-bold text-[#00008b] hover:underline">contact@welcomeeg.ca</a>.</p>
                      ) : (
                      <button type="button" disabled={busyId === row.id} onClick={() => openEdit(row)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-xs font-bold text-[#00008b] disabled:opacity-60"><Pencil className="w-3.5 h-3.5" />Edit</button>
                      )}
                      <button type="button" disabled={busyId === row.id} onClick={() => remove(row)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-xs font-bold text-rose-800 disabled:opacity-60"><Trash2 className="w-3.5 h-3.5" />Delete</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Edit submission">
          <form onSubmit={saveEdit} className="bg-white rounded-3xl w-full max-w-2xl my-8 p-6 sm:p-8 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-gray-900">Edit submission</h2>
                <p className="text-xs text-gray-500">You can change everything except your email address.</p>
              </div>
              <button type="button" onClick={() => setEditing(null)} aria-label="Close" className="p-2 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <div role="note" className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
              <strong>Please note:</strong> every change needs approval by our team before it goes live.
              {editing.status === 'approved'
                ? <> This listing is live now. Once you save, <strong>it is taken off the website until it is approved again</strong>.</>
                : <> Your listing will appear once it is approved.</>}
            </div>
            <p className="text-xs text-gray-600">Email address: <strong>{editing.submitter_email}</strong> (cannot be changed)</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <ImageUpload value={form._image || ''} onChange={(v) => setForm({ ...form, _image: v || '' })} label="Photo (optional)" />
                {form._image && (
                  <button type="button" onClick={() => setForm({ ...form, _image: '' })}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold">
                    <Trash2 className="w-3.5 h-3.5" /> Remove photo
                  </button>
                )}
                {(form._image || '') !== (form._imageOrig || '') && (
                  <p className="mt-1 text-xs text-gray-500">The new photo shows once our team approves it.</p>
                )}
              </div>
              {form._schedule && (
                <div className="sm:col-span-2">
                  <SchedulePicker
                    kind={typeOf(editing).toLowerCase()}
                    value={form._schedule}
                    onChange={(next) => setForm({ ...form, _schedule: next })}
                    idPrefix="my-sub-edit"
                  />
                </div>
              )}
              {EDIT_FIELDS.filter(([, , , , onlyFor]) => !onlyFor || onlyFor === typeOf(editing)).map(([key, label, type, max]) => (
                <label key={key} className={`block text-sm font-bold text-gray-800 ${type === 'textarea' || key === 'title' || key === 'link' ? 'sm:col-span-2' : ''}`}>
                  {label}
                  {type === 'community' ? (
                    <select value={form[key] || ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm font-normal bg-white">
                      <option value="" disabled>Choose your community…</option>
                      <option value="East Gwillimbury">All East Gwillimbury</option>
                      {[...GEORGINA_COMMUNITIES, OUT_OF_AREA].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : type === 'salecat' ? (
                    <select value={form[key] || ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm font-normal bg-white">
                      <option value="" disabled>Choose a category…</option>
                      {SALE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : type === 'textarea' ? (
                    <textarea rows={5} maxLength={max} value={form[key] || ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm font-normal" />
                  ) : (
                    <input type={type === 'url' ? 'text' : type} maxLength={max} value={form[key] || ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm font-normal" />
                  )}
                </label>
              ))}
              {typeOf(editing) === 'Dining' && (
                <fieldset className="sm:col-span-2 text-sm font-bold text-gray-800">
                  <legend>Service options (optional)</legend>
                  <div className="mt-1 flex flex-wrap gap-4 font-normal">
                    {SERVICE_OPTIONS.map(s => (
                      <label key={s} className="inline-flex items-center gap-2">
                        <input type="checkbox" checked={(form._services || []).includes(s)}
                          onChange={(e) => setForm({ ...form, _services: e.target.checked ? [...(form._services || []), s] : (form._services || []).filter(x => x !== s) })} />
                        {s}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-2.5 rounded-xl border border-gray-300 text-sm font-bold text-gray-700">Cancel</button>
              <button type="submit" disabled={busyId === editing.id} className="px-5 py-2.5 rounded-xl bg-[#00008b] hover:bg-blue-900 text-white text-sm font-black disabled:opacity-60">Save changes</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
