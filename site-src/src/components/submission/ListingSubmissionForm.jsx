import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  Utensils,
  Tag,
  MapPin,
  ExternalLink,
  AlertCircle,
  ArrowLeft,
  Building2,
  Store,
  Mail,
  User,
  Phone,
  ShieldCheck
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { hasMerchantLink } from '../../utils/links';
import ImageUpload from '../ImageUpload';
import AgreementCheckboxes from '../AgreementCheckboxes';
import SchedulePicker from './SchedulePicker';
import { generateSlug, getTorontoTodayMidnight, formatPhoneNumber } from '../../services/discoveryService';
import { sendSubmissionVerificationEmail, getInitialSubmissionStatus } from '../../services/emailService';
import { subscribeReader } from '../../services/newsletter';
import DuplicateWarningModal from './DuplicateWarningModal';
import {
  COMMUNITY_OPTIONS,
  DINING_SERVICE_OPTIONS,
  EVENT_CATEGORIES,
  SALE_CATEGORIES,
  buildDuplicateCheckParams,
  buildPayload,
  cleanTitle,
  computeSchedule,
  emptySchedule,
  newsletterArea,
  validateFields
} from './submissionLogic';

const LABEL = 'block text-xs font-black uppercase tracking-wider text-gray-700 mb-1.5';
const INPUT = 'w-full min-w-0 px-4 py-3 rounded-xl border border-gray-300 text-sm font-semibold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#00008b] text-left';
const ICON_INPUT = 'w-full min-w-0 pl-10 pr-4 py-3 rounded-xl border border-gray-300 text-sm font-semibold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#00008b] text-left';
const ICON = 'w-4 h-4 text-gray-400 absolute left-3.5 top-3.5 pointer-events-none';
const CHECKBOX = 'mt-0.5 w-5 h-5 shrink-0 rounded border-gray-300 text-[#00008b] focus:ring-[#00008b]';
const REQ = <span className="text-rose-500">*</span>;
const OPT = <span className="text-gray-400 font-normal normal-case tracking-normal">(Optional)</span>;

const KINDS = {
  event: {
    badge: 'Community Calendar',
    badgeClass: 'bg-blue-100 text-[#00008b]',
    BadgeIcon: Calendar,
    heading: 'Submit Your East Gwillimbury Event',
    intro: 'Add your festival, market, concert, sporting event, workshop, or community gathering to the official Welcome East Gwillimbury calendar.',
    crumbTo: '/events',
    crumbLabel: 'Events',
    crumbCurrent: 'Submit Community Event',
    titleLabel: 'Event Title',
    titlePlaceholder: "e.g. Sharon Holiday Craft Market",
    businessLabel: 'Organization / Host Name',
    businessPlaceholder: 'e.g. East Gwillimbury Arts Council',
    BusinessIcon: Building2,
    locationLabel: 'Event Location / Street Address',
    locationPlaceholder: 'e.g. 20849 Dalton Rd (The Link)',
    linkPlaceholder: 'https://yourgroup.org/event or Eventbrite URL',
    descriptionLabel: 'Event Description & Details',
    descriptionPlaceholder: 'Tell residents what to expect: program highlights, activities, parking, accessibility and how to register...',
    photoLabel: 'Event Photo / Promotional Poster',
    submitLabel: 'Submit Event for Verification →',
    successHeading: 'Event Submitted!',
    successNoun: 'event',
    anotherLabel: 'Submit Another Event',
    errorFallback: 'Unable to submit event. Please check your information and try again.'
  },
  dining: {
    badge: 'East Gwillimbury Hospitality Hub',
    badgeClass: 'bg-orange-100 text-orange-800',
    BadgeIcon: Utensils,
    heading: 'Submit a Dining Special or Food Offer',
    intro: 'Share your weekly meal deals, chef specials, happy hours, or multi-day food features with local food lovers across East Gwillimbury.',
    crumbTo: '/dining',
    crumbLabel: 'Dining',
    crumbCurrent: 'Submit Dining Special',
    titleLabel: 'Dining Special Title',
    titlePlaceholder: 'e.g. Wednesday Wing Night & Half-Price Craft Pints',
    businessLabel: 'Restaurant / Business Name',
    businessPlaceholder: 'e.g. Lakeside Bistro & Grill',
    BusinessIcon: Store,
    locationLabel: 'Restaurant Location / Street Address',
    locationPlaceholder: 'e.g. 155 High St, Mount Albert',
    linkPlaceholder: 'https://yourrestaurant.ca/menu',
    descriptionLabel: 'Description & Details',
    descriptionPlaceholder: 'Describe featured dishes, prices, reservation requirements or dietary options...',
    photoLabel: 'Restaurant Photo / Dish Feature',
    submitLabel: 'Submit Dining Special for Verification →',
    successHeading: 'Dining Special Submitted!',
    successNoun: 'special',
    anotherLabel: 'Submit Another Special',
    errorFallback: 'Unable to submit dining special. Please check your information and try again.'
  },
  sale: {
    badge: 'Retail & Deals Directory',
    badgeClass: 'bg-emerald-100 text-emerald-800',
    BadgeIcon: Tag,
    heading: 'Submit a Retail Sale or Store Promotion',
    intro: 'Reach East Gwillimbury shoppers by sharing your seasonal sales, clearance events, BOGO deals, or resident discounts.',
    crumbTo: '/sales',
    crumbLabel: 'Local Deals',
    crumbCurrent: 'Submit Retail Promotion',
    titleLabel: 'Sale Headline',
    titlePlaceholder: 'e.g. End of Season Winter Apparel Clearance',
    businessLabel: 'Business / Store Name',
    businessPlaceholder: 'e.g. Lakeview Outfitter Co.',
    BusinessIcon: Store,
    locationLabel: 'Store Location / Street Address',
    locationPlaceholder: 'e.g. 250 The Queensway S, Holland Landing',
    linkPlaceholder: 'https://yourstore.ca/sale',
    descriptionLabel: 'Description & Sale Terms',
    descriptionPlaceholder: 'Outline what is on sale, eligibility, exclusions, coupon requirements or inventory limits...',
    photoLabel: 'Store Photo / Sale Flyer',
    submitLabel: 'Submit Sale for Verification →',
    successHeading: 'Promotion Submitted!',
    successNoun: 'promotion',
    anotherLabel: 'Submit Another Deal',
    errorFallback: 'Unable to submit sale offer. Please check your information and try again.'
  }
};

function emptyFields() {
  return {
    title: '',
    businessName: '',
    eventCategory: 'community_events',
    saleCategory: '',
    serviceOptions: [],
    priceText: '',
    location: '',
    community: '',
    link: '',
    summary: '',
    imageUrl: '',
    joinNewsletter: false,
    hamperContact: false,
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    agreePrivacy: false,
    agreeTerms: false
  };
}

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function FieldError({ show, message }) {
  if (!show || !message) return null;
  return <p className="mt-1.5 text-xs font-semibold text-rose-700" role="alert">{message}</p>;
}

function CheckRow({ checked, onChange, title, children }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer min-w-0">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className={CHECKBOX} />
      <span className="min-w-0 text-gray-900 text-xs sm:text-sm font-bold leading-snug">
        {title}
        {children && <span className="block text-xs font-normal text-gray-600 mt-0.5">{children}</span>}
      </span>
    </label>
  );
}

/**
 * The single public submission form for Events, Dining specials and Sales.
 * kind: 'event' | 'dining' | 'sale'
 */
export default function ListingSubmissionForm({ kind = 'event' }) {
  const k = KINDS[kind] || KINDS.event;
  const [f, setF] = useState(emptyFields);
  const [schedule, setSchedule] = useState(() => emptySchedule(kind));
  const [submitting, setSubmitting] = useState(false);
  const [submittedData, setSubmittedData] = useState(null);
  // Confirmation email: null | 'sent' | 'failed' | 'sending', plus a short message for the success screen.
  const [verifyEmail, setVerifyEmail] = useState({ state: null, text: '' });

  async function emailErrorText(err) {
    if (!err) return '';
    try {
      const j = err.context && typeof err.context.json === 'function' ? await err.context.json() : null;
      if (j && j.error) return j.error;
    } catch (_) { /* not JSON */ }
    return err.message || '';
  }

  async function resendConfirmation() {
    if (!submittedData || !submittedData.id) return;
    setVerifyEmail({ state: 'sending', text: '' });
    const sent = await sendSubmissionVerificationEmail({
      contactEmail: submittedData.submitter_email, id: submittedData.id, status: 'pending_verification',
    });
    if (sent && sent.success) setVerifyEmail({ state: 'resent', text: '' });
    else setVerifyEmail({ state: 'failed', resendTried: true, text: (await emailErrorText(sent && sent.error)) || 'The email could not be sent. Please try again in a minute.' });
  }
  const [error, setError] = useState(null); // { message, field }
  const [duplicateWarning, setDuplicateWarning] = useState({
    isOpen: false,
    matchedListing: null,
    matchReasons: [],
    score: 0,
    pendingPayload: null
  });

  const [directoryBusinesses, setDirectoryBusinesses] = useState([]);
  const [matchedDirectoryBiz, setMatchedDirectoryBiz] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase
          .from('directory_listings')
          .select('id, name, location, community, phone, link')
          .or('status.eq.approved,status.is.null')
          .order('name', { ascending: true })
          .limit(1500);
        if (alive && Array.isArray(data)) setDirectoryBusinesses(data);
      } catch (_) {}
    })();
    return () => { alive = false; };
  }, []);

  const set = (key) => (val) => setF(prev => ({ ...prev, [key]: val }));
  const onInput = (key) => (e) => set(key)(e.target.value);
  const onBusinessNameChange = (e) => {
    const val = e.target.value;
    const norm = val.trim().toLowerCase();
    const match = norm ? directoryBusinesses.find(b => (b.name || '').trim().toLowerCase() === norm) : null;
    setMatchedDirectoryBiz(match || null);
    setF(prev => {
      const next = { ...prev, businessName: val };
      if (match) {
        if (match.location && !prev.location) next.location = match.location;
        if (match.community && !prev.community) next.community = match.community;
        if (match.phone && !prev.phone) next.phone = formatPhoneNumber(match.phone);
        if (match.link && hasMerchantLink(match.link) && !prev.link) next.link = match.link;
      }
      return next;
    });
  };
  const toggleService = (opt) =>
    setF(prev => ({
      ...prev,
      serviceOptions: prev.serviceOptions.includes(opt) ? prev.serviceOptions.filter(o => o !== opt) : [...prev.serviceOptions, opt]
    }));

  const fail = (message, field = null) => setError({ message, field });

  const finalizeSubmission = async (payload) => {
    setSubmitting(true);
    try {
      // Direct insert with return=minimal (avoids RLS SELECT restriction on pending records)
      const { error: insertError } = await supabase.from('vendor_events').insert([payload]);
      if (insertError) throw insertError;

      // Newsletter sign-up: always registers for BOTH Monday and Thursday editions
      if (f.joinNewsletter) {
        try {
          await subscribeReader({
            email: f.email,
            firstName: f.firstName,
            lastName: f.lastName,
            area: newsletterArea(payload.community)
          });
        } catch (subErr) {
          console.warn('Newsletter subscriber notice:', subErr);
        }
      }

      // Submission verification email (Email 1 of the sequence). A failure is shown on the
      // success screen (with a resend button) instead of being swallowed.
      try {
        const sent = await sendSubmissionVerificationEmail({ contactEmail: f.email.trim(), id: payload.id, status: payload.status });
        setVerifyEmail(sent && sent.success
          ? { state: 'sent', text: '' }
          : { state: 'failed', text: await emailErrorText(sent && sent.error) });
      } catch (emailErr) {
        console.warn('Submission verification email notice:', emailErr);
        setVerifyEmail({ state: 'failed', text: '' });
      }

      setSubmittedData(payload);
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error(`${kind} submission error:`, err);
      fail(err.message || k.errorFallback);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelDuplicate = () => {
    setDuplicateWarning({
      isOpen: false,
      matchedListing: null,
      matchReasons: [],
      score: 0,
      pendingPayload: null
    });
    setSubmitting(false);
  };

  const handleBypassDuplicate = async () => {
    if (!duplicateWarning.pendingPayload) return;
    const payload = {
      ...duplicateWarning.pendingPayload,
      is_suspected_duplicate: true,
      duplicate_match_id: duplicateWarning.matchedListing?.id || null,
      duplicate_score: duplicateWarning.score || null,
      duplicate_notes: (duplicateWarning.matchReasons || []).join('; ') || 'User bypassed duplicate warning'
    };
    setDuplicateWarning(prev => ({ ...prev, isOpen: false }));
    await finalizeSubmission(payload);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const todayStr = getTorontoTodayMidnight().toISOString().split('T')[0];

    // Check in on-screen order: title/business/category come before the schedule.
    const fieldProblem = validateFields(kind, f);
    const preSchedule = ['title', 'businessName', 'category', 'priceText'];
    if (fieldProblem && preSchedule.includes(fieldProblem.field)) return fail(fieldProblem.message, fieldProblem.field);
    const sched = computeSchedule(kind, schedule, todayStr);
    if (sched.error) return fail(sched.error, 'schedule');
    if (!sched.startDate) return fail('Please choose the date.', 'schedule');
    if (fieldProblem) return fail(fieldProblem.message, fieldProblem.field);

    setSubmitting(true);
    try {
      const title = cleanTitle(f.title);
      const slug = kind === 'event'
        ? generateSlug(title, f.community || f.location)
        : generateSlug(title, f.businessName.trim());
      const id = newId();
      const status = await getInitialSubmissionStatus(f.email);
      const payload = buildPayload({ kind, id, status, slug, fields: f, schedule: sched });

      // Duplicate pre-flight check
      try {
        const checkParams = buildDuplicateCheckParams(kind, f, sched);
        const { data: dupData, error: dupErr } = await supabase.rpc('wg_check_listing_duplicate', checkParams);
        if (!dupErr && dupData && dupData.has_duplicate) {
          if (dupData.confidence === 'high') {
            setSubmitting(false);
            setDuplicateWarning({
              isOpen: true,
              matchedListing: dupData.matched_listing,
              matchReasons: dupData.reasons || [],
              score: dupData.score || 0,
              pendingPayload: payload
            });
            return;
          } else if (dupData.confidence === 'medium') {
            payload.is_suspected_duplicate = true;
            payload.duplicate_match_id = dupData.matched_listing?.id || null;
            payload.duplicate_score = dupData.score || null;
            payload.duplicate_notes = (dupData.reasons || []).join('; ');
          }
        }
      } catch (dupCheckErr) {
        console.warn('Duplicate pre-check notice:', dupCheckErr);
      }

      await finalizeSubmission(payload);
    } catch (err) {
      console.error(`${kind} submission error:`, err);
      fail(err.message || k.errorFallback);
      setSubmitting(false);
    }
  };

  const handleAnother = () => {
    // Keep contact details, location and community (and the business for dining/sales).
    setF(prev => ({
      ...emptyFields(),
      firstName: prev.firstName,
      lastName: prev.lastName,
      email: prev.email,
      phone: prev.phone,
      location: prev.location,
      community: prev.community,
      businessName: kind === 'event' ? '' : prev.businessName
    }));
    setSchedule(emptySchedule(kind));
    setError(null);
    setSubmitting(false);
    setSubmittedData(null);
    setVerifyEmail({ state: null, text: '' });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const errField = error && error.field;
  const BusinessIcon = k.BusinessIcon;
  const BadgeIcon = k.BadgeIcon;

  return (
    <div className="max-w-[1440px] w-full mx-auto px-4 md:px-8 lg:px-12 py-8 min-w-0">
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-500 mb-6">
        <Link to="/" className="hover:text-[#00008b] flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Home</span>
        </Link>
        <span>/</span>
        <Link to={k.crumbTo} className="hover:text-[#00008b]">{k.crumbLabel}</Link>
        <span>/</span>
        <span className="text-gray-900 font-bold">{k.crumbCurrent}</span>
      </div>

      {submittedData ? (
        <div className="max-w-2xl mx-auto bg-white rounded-3xl border border-gray-200 p-6 sm:p-8 md:p-12 shadow-lg text-left">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-3xl font-black mx-auto mb-4">
            ✓
          </div>
          <h2 className="text-2xl font-black text-gray-900 mb-2 text-center">
            {k.successHeading}{submittedData.status === 'pending_verification' ? ' Please Check Your Email' : ''}
          </h2>
          <p className="text-gray-600 text-sm mb-4 leading-relaxed break-words">
            Thank you, <strong>{submittedData.contact_name}</strong>. Your {k.successNoun} <strong className="text-gray-900">"{submittedData.title}"</strong> for <strong>{submittedData.business_name}</strong> has been received by Welcome East Gwillimbury.
          </p>

          <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-left text-xs mb-6 break-words">
            {submittedData.status === 'pending_verification' ? (
              <>
                <p className="font-bold text-blue-900 mb-1">✉️ Action Required: Confirm Email Address</p>
                <p className="text-blue-800 leading-relaxed">
                  {verifyEmail.state === 'failed'
                    ? <>We could not send the confirmation email to <strong>{submittedData.submitter_email}</strong>{verifyEmail.text ? <> ({verifyEmail.text})</> : null}. Please use the button below to try again.</>
                    : <>We have sent a secure confirmation email to <strong>{submittedData.submitter_email}</strong>.</>}
                  {' '}Your submission is <strong>not complete</strong> until you click the link in that email. It confirms your address, sends your listing to our editors and signs you in to your dashboard.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={resendConfirmation}
                    disabled={verifyEmail.state === 'sending'}
                    className="inline-flex items-center min-h-[40px] px-4 rounded-xl bg-[#00008b] hover:bg-blue-900 disabled:opacity-60 text-white text-xs font-black transition-colors"
                  >
                    {verifyEmail.state === 'sending' ? 'Sending...' : 'Resend confirmation email'}
                  </button>
                  <span className="text-blue-800">A new email replaces the old link; only the newest link works. Check your spam folder too.</span>
                </div>
                {verifyEmail.state === 'resent' && <p className="mt-2 font-bold text-emerald-800">✓ A new confirmation email is on its way.</p>}
                {verifyEmail.state === 'failed' && verifyEmail.text && verifyEmail.resendTried && <p className="mt-2 font-bold text-rose-700">{verifyEmail.text}</p>}
              </>
            ) : (
              <>
                <p className="font-bold text-blue-900 mb-1">✓ Sent to our editors</p>
                <p className="text-blue-800 leading-relaxed">
                  You are signed in as <strong>{submittedData.submitter_email}</strong>, so no confirmation email is needed. You can review your submission in your dashboard.
                </p>
              </>
            )}
          </div>

          <dl className="p-4 rounded-2xl bg-gray-50 border border-gray-200 text-left text-xs space-y-2 mb-6">
            {submittedData.price_text && (
              <div className="flex flex-wrap justify-between gap-x-3">
                <dt className="font-semibold text-gray-500">Deal:</dt>
                <dd className="font-bold text-[#00008b] text-right break-words min-w-0">{submittedData.price_text}</dd>
              </div>
            )}
            <div className="flex flex-wrap justify-between gap-x-3">
              <dt className="font-semibold text-gray-500">Date &amp; Schedule:</dt>
              <dd className="font-bold text-gray-900 text-right break-words min-w-0">{submittedData.event_date_label}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-x-3">
              <dt className="font-semibold text-gray-500">Location:</dt>
              <dd className="font-bold text-gray-900 text-right break-words min-w-0">{submittedData.location}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-x-3">
              <dt className="font-semibold text-gray-500">Contact Verification:</dt>
              <dd className="font-bold text-gray-900 text-right break-all min-w-0">{submittedData.contact_phone} • {submittedData.submitter_email}</dd>
            </div>
          </dl>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href={`https://welcomeeg.ca/my-submissions?email=${encodeURIComponent(submittedData.submitter_email)}`}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#00008b] text-white text-xs font-black uppercase tracking-wider hover:bg-blue-900 transition-colors shadow-md text-center"
            >
              Open Submitter Dashboard &rarr;
            </a>
            <button
              type="button"
              onClick={handleAnother}
              className="w-full sm:w-auto px-6 py-3 rounded-xl border border-gray-300 text-gray-700 text-xs font-bold hover:bg-gray-50 transition-colors text-center"
            >
              {k.anotherLabel}
            </button>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-3xl mx-auto min-w-0">
          {/* Header */}
          <div className="mb-8">
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-3 ${k.badgeClass}`}>
              <BadgeIcon className="w-3.5 h-3.5" />
              <span>{k.badge}</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight break-words">{k.heading}</h1>
            {kind === 'event' && (
              <div className="flex flex-wrap gap-3 mt-4">
                <Link
                  to="/submission?tab=dining"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 text-white text-xs sm:text-sm font-bold hover:bg-orange-700 transition-colors shadow-sm"
                >
                  <Utensils className="w-4 h-4 shrink-0" />
                  <span>Submit a dining offer</span>
                </Link>
                <Link
                  to="/submission?tab=sales"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 text-white text-xs sm:text-sm font-bold hover:bg-amber-700 transition-colors shadow-sm"
                >
                  <Tag className="w-4 h-4 shrink-0" />
                  <span>Submit a store sale</span>
                </Link>
              </div>
            )}
            <p className="text-gray-600 text-sm sm:text-base mt-2">{k.intro}</p>
          </div>

          {kind === 'event' && (
            <div className="mb-8 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3 text-left">
              <Tag className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-bold">Why Prices May Not Be Displayed</p>
                <p className="mt-0.5 text-amber-800 leading-relaxed">
                  We do not automatically include prices in the listings. If you want to include prices, add them to the description. Please provide your official registration link below so attendees can view current admission rules, schedules, and RSVP details directly from the source. We are not responsible for errors or omissions
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="bg-white rounded-3xl border border-gray-200 p-4 sm:p-8 shadow-sm space-y-6 text-left min-w-0">
            {/* 1. Title */}
            <div>
              <label htmlFor={`${kind}-title`} className={LABEL}>{k.titleLabel} {REQ}</label>
              <input
                id={`${kind}-title`}
                type="text"
                required
                value={f.title}
                onChange={onInput('title')}
                onBlur={() => setF(prev => ({ ...prev, title: cleanTitle(prev.title) }))}
                placeholder={k.titlePlaceholder}
                className={INPUT}
              />
              <FieldError show={errField === 'title'} message={error && error.message} />
            </div>

            {/* 2. Business / host / organization */}
            <div>
              <label htmlFor={`${kind}-business`} className={LABEL}>{k.businessLabel} {REQ}</label>
              <div className="relative">
                <BusinessIcon className={ICON} />
                <input
                  id={`${kind}-business`}
                  type="text"
                  required
                  list={`${kind}-directory-businesses`}
                  value={f.businessName}
                  onChange={onBusinessNameChange}
                  placeholder={k.businessPlaceholder}
                  className={ICON_INPUT}
                />
                <datalist id={`${kind}-directory-businesses`}>
                  {directoryBusinesses.map(b => (
                    <option key={b.id} value={b.name} />
                  ))}
                </datalist>
              </div>
              {matchedDirectoryBiz && (
                <p className="mt-1 text-xs font-bold text-emerald-700">
                  &#10003; Connected to Business Directory ({matchedDirectoryBiz.name}) — address &amp; contact details prefilled where blank.
                </p>
              )}
              <FieldError show={errField === 'businessName'} message={error && error.message} />
            </div>

            {/* 3. Category (events and sales) */}
            {kind === 'event' && (
              <div>
                <label htmlFor="event-category" className={LABEL}>Category {REQ}</label>
                <select id="event-category" required value={f.eventCategory} onChange={onInput('eventCategory')} className={INPUT}>
                  {EVENT_CATEGORIES.map(cat => <option key={cat.value} value={cat.value}>{cat.label}</option>)}
                </select>
                <FieldError show={errField === 'category'} message={error && error.message} />
              </div>
            )}
            {kind === 'sale' && (
              <div>
                <label htmlFor="sale-category" className={LABEL}>Category {REQ}</label>
                <select id="sale-category" required value={f.saleCategory} onChange={onInput('saleCategory')} className={INPUT}>
                  <option value="" disabled>Choose a category…</option>
                  {SALE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <FieldError show={errField === 'category'} message={error && error.message} />
              </div>
            )}

            {/* Kind-specific extras */}
            {kind === 'dining' && (
              <fieldset className="min-w-0">
                <legend className={LABEL}>Service Options {OPT}</legend>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {DINING_SERVICE_OPTIONS.map(opt => (
                    <label key={opt} className="flex items-center gap-2 cursor-pointer text-sm font-bold text-gray-900">
                      <input
                        type="checkbox"
                        checked={f.serviceOptions.includes(opt)}
                        onChange={() => toggleService(opt)}
                        className="w-5 h-5 rounded border-gray-300 text-[#00008b] focus:ring-[#00008b]"
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {kind === 'sale' && (
              <div>
                <label htmlFor="sale-price-text" className={LABEL}>Discount / Deal Text {REQ}</label>
                <div className="relative">
                  <Tag className={ICON} />
                  <input id="sale-price-text" type="text" required value={f.priceText} onChange={onInput('priceText')} placeholder="e.g. 20% Off, BOGO, Free mitts with purchase" className={ICON_INPUT} />
                </div>
                <FieldError show={errField === 'priceText'} message={error && error.message} />
              </div>
            )}

            {/* 4. Schedule */}
            <div>
              <SchedulePicker kind={kind} value={schedule} onChange={setSchedule} idPrefix={`${kind}-sched`} />
              <FieldError show={errField === 'schedule'} message={error && error.message} />
            </div>

            {/* 5. Location */}
            <div>
              <label htmlFor={`${kind}-location`} className={LABEL}>{k.locationLabel} {REQ}</label>
              <div className="relative">
                <MapPin className={ICON} />
                <input id={`${kind}-location`} type="text" required value={f.location} onChange={onInput('location')} placeholder={k.locationPlaceholder} className={ICON_INPUT} />
              </div>
              <FieldError show={errField === 'location'} message={error && error.message} />
            </div>

            {/* 6. Community */}
            <div>
              <label htmlFor={`${kind}-community`} className={LABEL}>Community Area {REQ}</label>
              <select id={`${kind}-community`} required value={f.community} onChange={onInput('community')} className={INPUT}>
                <option value="" disabled>Choose your community…</option>
                {COMMUNITY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <FieldError show={errField === 'community'} message={error && error.message} />
            </div>

            {/* 7. Website link */}
            <div>
              <label htmlFor={`${kind}-link`} className={LABEL}>Website Link {OPT}</label>
              <div className="relative">
                <ExternalLink className={ICON} />
                <input id={`${kind}-link`} type="text" inputMode="url" autoComplete="url" value={f.link} onChange={onInput('link')} placeholder={k.linkPlaceholder} className={ICON_INPUT} />
              </div>
              <FieldError show={errField === 'link'} message={error && error.message} />
            </div>

            {/* Description */}
            <div>
              <label htmlFor={`${kind}-summary`} className={LABEL}>{k.descriptionLabel} {REQ}</label>
              <textarea id={`${kind}-summary`} required rows={4} value={f.summary} onChange={onInput('summary')} placeholder={k.descriptionPlaceholder} className={INPUT} />
              <FieldError show={errField === 'summary'} message={error && error.message} />
            </div>

            {/* 8. Photo */}
            <ImageUpload value={f.imageUrl} onChange={set('imageUrl')} label={k.photoLabel} />

            {/* 9 + 10. Newsletters and Welcome Hamper */}
            <div className="p-4 sm:p-5 rounded-2xl bg-blue-50/60 border border-blue-200/80 space-y-3.5 text-left">
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-[#00008b] block mb-1">Free Community Newsletters</span>
                <p className="text-xs text-gray-600 font-medium">Optional. You can unsubscribe at any time.</p>
              </div>
              <div className="space-y-3 pt-1">
                <CheckRow
                  checked={f.joinNewsletter}
                  onChange={set('joinNewsletter')}
                  title="Subscribe to both Monday and Thursday Welcome East Gwillimbury newsletter editions"
                >
                  One sign-up includes both the <strong>Monday newsletter</strong> (Monday to Friday listings) and the <strong>Thursday newsletter</strong> (this coming weekend and next weekend — Friday, Saturday and Sunday listings).
                </CheckRow>
                <CheckRow
                  checked={f.hamperContact}
                  onChange={set('hamperContact')}
                  title="Please send me information about the Welcome Hamper"
                >
                  Offer a coupon to new East Gwillimbury residents. <a href="/hamper/" target="_blank" rel="noopener noreferrer" className="underline text-[#00008b]">About the program</a>
                </CheckRow>
              </div>
            </div>

            {/* 11. Contact verification */}
            <div className="p-4 sm:p-5 rounded-2xl bg-blue-50/60 border border-blue-100 space-y-4 text-left">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#00008b] shrink-0" />
                <h2 className="text-sm font-black uppercase tracking-wider text-[#00008b]">Contact Verification Details</h2>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                Required for verification. Your personal contact details remain private and are never shown publicly.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="min-w-0">
                  <label htmlFor={`${kind}-first-name`} className={LABEL}>First Name {REQ}</label>
                  <div className="relative">
                    <User className={ICON} />
                    <input id={`${kind}-first-name`} type="text" required autoComplete="given-name" value={f.firstName} onChange={onInput('firstName')} placeholder="e.g. Shelley" className={ICON_INPUT} />
                  </div>
                </div>
                <div className="min-w-0">
                  <label htmlFor={`${kind}-last-name`} className={LABEL}>Last Name {REQ}</label>
                  <div className="relative">
                    <User className={ICON} />
                    <input id={`${kind}-last-name`} type="text" required autoComplete="family-name" value={f.lastName} onChange={onInput('lastName')} placeholder="e.g. Smith" className={ICON_INPUT} />
                  </div>
                </div>
              </div>
              <FieldError show={errField === 'name'} message={error && error.message} />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="min-w-0">
                  <label htmlFor={`${kind}-email`} className={LABEL}>Contact Email {REQ}</label>
                  <div className="relative">
                    <Mail className={ICON} />
                    <input id={`${kind}-email`} type="email" required autoComplete="email" value={f.email} onChange={onInput('email')} placeholder="you@example.ca" className={ICON_INPUT} />
                  </div>
                  <FieldError show={errField === 'email'} message={error && error.message} />
                </div>
                <div className="min-w-0">
                  <label htmlFor={`${kind}-phone`} className={LABEL}>Contact Phone Number {REQ}</label>
                  <div className="relative">
                    <Phone className={ICON} />
                    <input
                      id={`${kind}-phone`}
                      type="tel"
                      required
                      autoComplete="tel"
                      maxLength={14}
                      value={f.phone}
                      onChange={(e) => set('phone')(formatPhoneNumber(e.target.value))}
                      placeholder="(905) 999-1464"
                      className={ICON_INPUT}
                    />
                  </div>
                  <FieldError show={errField === 'phone'} message={error && error.message} />
                </div>
              </div>
            </div>

            {/* 12. Terms + Privacy */}
            <div>
              <AgreementCheckboxes
                agreePrivacy={f.agreePrivacy}
                setAgreePrivacy={set('agreePrivacy')}
                agreeTerms={f.agreeTerms}
                setAgreeTerms={set('agreeTerms')}
                disabled={submitting}
              />
              <FieldError show={errField === 'agreements'} message={error && error.message} />
            </div>

            {error && (
              <div className="p-4 rounded-xl bg-[#dc2626] border-2 border-[#b91c1c] text-white text-sm font-bold flex items-start gap-3 text-left shadow-md" role="alert">
                <AlertCircle className="w-5 h-5 text-white shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="font-black text-white uppercase tracking-wider text-xs">Submission Incomplete</p>
                  <p className="text-xs font-semibold text-white/95 mt-0.5 break-words">{error.message}</p>
                </div>
              </div>
            )}

            {/* 13. Submit */}
            <div className="pt-4 border-t border-gray-100 flex flex-wrap-reverse items-center justify-between gap-3">
              <Link to={k.crumbTo} className="text-xs font-bold text-gray-500 hover:text-gray-900">Cancel</Link>
              <button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto px-6 sm:px-8 py-3.5 rounded-xl bg-[#00008b] text-white font-bold text-sm hover:bg-blue-900 transition-colors shadow-md disabled:opacity-50 text-center"
              >
                {submitting ? 'Submitting...' : k.submitLabel}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Duplicate Alert Modal */}
      <DuplicateWarningModal
        isOpen={duplicateWarning.isOpen}
        matchedListing={duplicateWarning.matchedListing}
        matchReasons={duplicateWarning.matchReasons}
        score={duplicateWarning.score}
        onCancel={handleCancelDuplicate}
        onBypass={handleBypassDuplicate}
        isSubmitting={submitting}
      />
    </div>
  );
}
