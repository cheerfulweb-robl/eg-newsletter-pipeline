import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Search,
  Check,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Receipt,
  CreditCard,
  BarChart3,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Globe,
  Building2,
  Mail,
  FileText,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { STRIPE_LINKS, isConfiguredStripeUrl } from '../config/stripeLinks';
import ImageUpload from '../components/ImageUpload.jsx';

const MAX_KEYWORD_LEN = 22;

const FEATURES = [
  'Featured keyword pill above the Quick Search bar above the fold on the home page',
  'Route visitors to your website, your Welcome East Gwillimbury business page, or filtered search results',
  'Track impressions, clicks, and CTR in the Business Stats Portal',
  'Automatic tax calculation & PDF invoices via Stripe',
  'Cancel or switch billing anytime',
];

export default function Advertise() {
  const location = useLocation();
  const formRef = useRef(null);
  const _sp = new URLSearchParams(location.search);
  const isCheckoutSuccess = _sp.get('checkout') === 'success' || _sp.get('paid') === '1';

  // Photo Gallery Ad pre-checkout intake state
  const [galPlan, setGalPlan] = useState('gallery_weekly');
  const [galSponsor, setGalSponsor] = useState('');
  const [galEmail, setGalEmail] = useState('');
  const [galHover, setGalHover] = useState('');
  const [galImage, setGalImage] = useState('');
  const [galTargetType, setGalTargetType] = useState('external');
  const [galTargetUrl, setGalTargetUrl] = useState('');
  const [galError, setGalError] = useState('');
  const [galSubmitting, setGalSubmitting] = useState(false);

  // Newsletter Ad pre-checkout intake state
  const [nlPlan, setNlPlan] = useState('newsletter_single');
  const [nlSponsor, setNlSponsor] = useState('');
  const [nlEmail, setNlEmail] = useState('');
  const [nlHeadline, setNlHeadline] = useState('');
  const [nlBody, setNlBody] = useState('');
  const [nlEdition, setNlEdition] = useState('both');
  const [nlImage, setNlImage] = useState('');
  const [nlTargetType, setNlTargetType] = useState('external');
  const [nlTargetUrl, setNlTargetUrl] = useState('');
  const [nlError, setNlError] = useState('');
  const [nlSubmitting, setNlSubmitting] = useState(false);

  async function startAdOrderCheckout(opts) {
    const {
      adType, planKey, sponsor, email, targetType, targetUrl,
      headline, bodyText, imageDataUrl, edition, stripeUrl, setErr, setBusy,
    } = opts;
    setErr('');
    if (sponsor.trim().length < 2) { setErr('Please enter your business or sponsor name.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErr('Please enter a valid contact email.'); return; }
    if (adType === 'gallery' && !imageDataUrl) { setErr('Please upload your Photo Gallery Ad image (max 2 MB, auto-compressed to WebP).'); return; }
    if (adType === 'newsletter' && headline.trim().length < 2) { setErr('Please enter an ad headline.'); return; }
    let cleanDest = targetUrl.trim();
    if (/^www\./i.test(cleanDest)) cleanDest = `https://${cleanDest}`;
    if (!cleanDest) { setErr('Please enter a destination URL or Welcome East Gwillimbury path (e.g. /events/... or /businesses/...).'); return; }
    if (!/^(https?:\/\/|\/[^/])/i.test(cleanDest)) { setErr('Destination must start with https://, http://, or /.'); return; }
    if (!isConfiguredStripeUrl(stripeUrl)) { setErr('Stripe checkout link is not configured yet.'); return; }

    setBusy(true);
    try {
      const { data: orderId, error: rpcErr } = await supabase.rpc('wg_create_ad_order', {
        ad_type_input: adType,
        plan_input: planKey,
        sponsor_name_input: sponsor.trim(),
        contact_email_input: email.trim().toLowerCase(),
        target_type_input: targetType,
        target_url_input: cleanDest,
        headline_input: headline ? headline.trim() : null,
        body_text_input: bodyText ? bodyText.trim() : null,
        image_data_url_input: imageDataUrl || null,
        edition_input: edition || 'both',
      });
      if (rpcErr || !orderId) throw new Error(rpcErr?.message || 'Could not save your ad details.');
      const sep = stripeUrl.includes('?') ? '&' : '?';
      window.location.href = `${stripeUrl}${sep}client_reference_id=${encodeURIComponent(String(orderId))}&prefilled_email=${encodeURIComponent(email.trim().toLowerCase())}`;
    } catch (e) {
      setErr(e?.message || 'Unable to start checkout. Please try again.');
      setBusy(false);
    }
  }

  const [plan, setPlan] = useState('monthly'); // 'weekly' | 'monthly'
  const [keyword, setKeyword] = useState('');
  const [sponsorName, setSponsorName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [targetKind, setTargetKind] = useState('website'); // 'website' | 'business' | 'search'
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [businessId, setBusinessId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [businesses, setBusinesses] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Buy Ad Space • Quick Search Sponsored | Welcome East Gwillimbury';
  }, []);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('directory_listings')
      .select('id, name, slug')
      .eq('status', 'approved')
      .order('name', { ascending: true })
      .limit(2000)
      .then(({ data }) => {
        if (!cancelled && Array.isArray(data)) setBusinesses(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const choosePlan = (nextPlan) => {
    setPlan(nextPlan);
    setError('');
    if (formRef.current && typeof formRef.current.scrollIntoView === 'function') {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleContinueToStripe = async (e) => {
    e.preventDefault();
    setError('');

    const cleanKeyword = keyword.trim();
    const cleanName = sponsorName.trim();
    const cleanEmail = contactEmail.trim().toLowerCase();
    const cleanUrl = websiteUrl.trim();
    const cleanQuery = searchQuery.trim();

    if (cleanKeyword.length < 2 || cleanKeyword.length > MAX_KEYWORD_LEN) {
      setError(`Quick Search keyword must be between 2 and ${MAX_KEYWORD_LEN} characters.`);
      return;
    }
    if (!cleanName) {
      setError('Please enter your business or sponsor name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Please enter a valid contact email address.');
      return;
    }
    if (targetKind === 'website' && !/^https?:\/\//i.test(cleanUrl)) {
      setError('Please enter a valid website URL starting with https:// or http://.');
      return;
    }
    if (targetKind === 'business' && !businessId) {
      setError('Please select your Welcome East Gwillimbury business listing.');
      return;
    }

    const baseStripeUrl = plan === 'monthly' ? STRIPE_LINKS.quickSearchMonthly : STRIPE_LINKS.quickSearchWeekly;
    if (!isConfiguredStripeUrl(baseStripeUrl)) {
      setError('Stripe checkout link is not configured yet.');
      return;
    }

    setSubmitting(true);
    try {
      const { data: orderId, error: rpcErr } = await supabase.rpc('wg_create_sponsor_order', {
        plan_input: plan,
        keyword_input: cleanKeyword,
        sponsor_name_input: cleanName,
        contact_email_input: cleanEmail,
        target_kind_input: targetKind,
        website_url_input: targetKind === 'website' ? cleanUrl : null,
        business_id_input: targetKind === 'business' ? businessId : null,
        search_query_input: targetKind === 'search' ? (cleanQuery || cleanKeyword) : null,
      });

      if (rpcErr || !orderId) {
        throw new Error(rpcErr?.message || 'Could not create your sponsorship order. Please try again.');
      }

      const sep = baseStripeUrl.includes('?') ? '&' : '?';
      const checkoutUrl =
        `${baseStripeUrl}${sep}client_reference_id=${encodeURIComponent(String(orderId))}` +
        `&prefilled_email=${encodeURIComponent(cleanEmail)}`;

      window.location.href = checkoutUrl;
    } catch (err) {
      setError(err?.message || 'Unable to start checkout. Please try again.');
      setSubmitting(false);
    }
  };

  const portalReady = isConfiguredStripeUrl(STRIPE_LINKS.customerPortal);
  const selectedPriceLabel = plan === 'monthly' ? '$25.00 CAD / month' : '$7.00 CAD / week';

  return (
    <div className="min-h-screen bg-gradient-to-b from-lake-50/70 via-white to-gray-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        {isCheckoutSuccess && (
          <div className="mb-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 flex items-start gap-3 shadow-sm">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-black text-emerald-950">Payment received — your ad spot is activating!</h2>
              <p className="text-sm text-emerald-800 mt-1">
                Stripe has sent your receipt and PDF invoice to your email. Your ad will go live shortly and can be tracked in the{' '}
                <a href="/business/index.html" className="font-bold underline">Business Stats Portal</a>.
                {portalReady && (
                  <>
                    {' '}Need to update your card or cancel anytime?{' '}
                    <a href={STRIPE_LINKS.customerPortal} target="_blank" rel="noopener noreferrer" className="font-bold underline">
                      Manage or Cancel Subscription &rarr;
                    </a>
                  </>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-100 text-amber-900 text-xs font-black uppercase tracking-wider mb-4 border border-amber-200">
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span>Buy Ad Space • Sponsored Search</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-lake-950 tracking-tight">
            Quick Search Sponsored
          </h1>
          <p className="mt-3 text-base sm:text-lg text-gray-600 leading-relaxed">
            Put your business front and center when East Gwillimbury residents and visitors search for local dining, events, shopping, and services.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          {/* Tier 1: Weekly */}
          <div
            className={`bg-white rounded-3xl p-6 sm:p-8 flex flex-col justify-between min-w-0 transition-all ${
              plan === 'weekly'
                ? 'border-2 border-[#00008b] shadow-lg'
                : 'border border-gray-200 shadow-sm'
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-lake-50 text-lake-900 text-xs font-extrabold uppercase tracking-wider border border-lake-200">
                  <Search className="w-3.5 h-3.5" />
                  <span>Weekly Plan</span>
                </span>
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Default • Recurring</span>
              </div>

              <div className="flex items-baseline gap-1.5 mt-2">
                <span className="text-4xl font-black text-gray-900">$7.00</span>
                <span className="text-sm font-bold text-gray-500">CAD / week</span>
              </div>
              <p className="text-sm text-gray-600 mt-2">
                Great for short-term promos, weekend events, seasonal specials, or testing a keyword.
              </p>

              <ul className="mt-6 space-y-3 border-t border-gray-100 pt-5">
                {FEATURES.map((feat) => (
                  <li key={feat} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-8">
              <button
                type="button"
                onClick={() => choosePlan('weekly')}
                className={`w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-sm font-black tracking-wide transition-all shadow-sm ${
                  plan === 'weekly'
                    ? 'bg-[#00008b] text-white hover:bg-blue-900'
                    : 'bg-lake-900 text-white hover:bg-lake-800'
                }`}
              >
                <span>{plan === 'weekly' ? 'Selected: Weekly ($7 CAD/wk)' : 'Select Weekly ($7 CAD/wk)'}</span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>
            </div>
          </div>

          {/* Tier 2: Monthly (~18% Savings) */}
          <div
            className={`bg-white rounded-3xl p-6 sm:p-8 flex flex-col justify-between relative min-w-0 transition-all ${
              plan === 'monthly'
                ? 'border-2 border-[#00008b] shadow-lg'
                : 'border border-gray-200 shadow-sm'
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-[#00008b] text-xs font-extrabold uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Monthly Plan</span>
                </span>
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 text-xs font-black uppercase tracking-wider border border-emerald-200">
                  Save ~18% • Recurring
                </span>
              </div>

              <div className="flex items-baseline gap-1.5 mt-2">
                <span className="text-4xl font-black text-gray-900">$25.00</span>
                <span className="text-sm font-bold text-gray-500">CAD / month</span>
              </div>
              <p className="text-sm text-gray-600 mt-2">
                Best value for continuous visibility — save ~18% compared to paying $7.00/week.
              </p>

              <ul className="mt-6 space-y-3 border-t border-gray-100 pt-5">
                {FEATURES.map((feat) => (
                  <li key={feat} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-8">
              <button
                type="button"
                onClick={() => choosePlan('monthly')}
                className={`w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-sm font-black tracking-wide transition-all shadow-sm ${
                  plan === 'monthly'
                    ? 'bg-[#00008b] text-white hover:bg-blue-900'
                    : 'bg-lake-900 text-white hover:bg-lake-800'
                }`}
              >
                <span>{plan === 'monthly' ? 'Selected: Monthly ($25 CAD/mo)' : 'Select Monthly ($25 CAD/mo)'}</span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>
            </div>
          </div>
        </div>

        {/* Gateway Form */}
        <section
          ref={formRef}
          id="sponsor-gateway-form"
          className="bg-white rounded-3xl border border-gray-200 shadow-md p-6 sm:p-8 mb-10"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-5 border-b border-gray-100 mb-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-gray-900">
                Step 2: Enter Your Quick Search Keyword
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Tell us the keyword and link you want to feature, then continue to Stripe to complete payment.
              </p>
            </div>
            <div className="inline-flex rounded-xl bg-gray-100 p-1 border border-gray-200 shrink-0 self-start">
              <button
                type="button"
                onClick={() => setPlan('weekly')}
                className={`px-3.5 py-2 rounded-lg text-xs font-black transition-colors ${
                  plan === 'weekly' ? 'bg-[#00008b] text-white shadow-xs' : 'text-gray-700 hover:text-gray-900'
                }`}
              >
                Weekly ($7)
              </button>
              <button
                type="button"
                onClick={() => setPlan('monthly')}
                className={`px-3.5 py-2 rounded-lg text-xs font-black transition-colors ${
                  plan === 'monthly' ? 'bg-[#00008b] text-white shadow-xs' : 'text-gray-700 hover:text-gray-900'
                }`}
              >
                Monthly ($25)
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 flex items-start gap-2.5 text-sm text-rose-900">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleContinueToStripe} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="qs-keyword" className="block text-xs font-black uppercase tracking-wider text-gray-700">
                    Quick Search Keyword <span className="text-rose-500">*</span>
                  </label>
                  <span className={`text-xs font-bold ${keyword.length >= MAX_KEYWORD_LEN ? 'text-amber-700' : 'text-gray-500'}`}>
                    {keyword.length} / {MAX_KEYWORD_LEN} max
                  </span>
                </div>
                <input
                  id="qs-keyword"
                  type="text"
                  maxLength={MAX_KEYWORD_LEN}
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value.slice(0, MAX_KEYWORD_LEN))}
                  placeholder="e.g. Fresh Bagels"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#00008b]"
                />
                {keyword.trim().length > 0 && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                    <span>Preview:</span>
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-100 text-amber-900 font-bold border border-amber-300">
                      <Sparkles className="w-3 h-3 text-amber-600" />
                      {keyword.trim()}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="qs-sponsor-name" className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1.5">
                  Business / Sponsor Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="qs-sponsor-name"
                  type="text"
                  maxLength={120}
                  value={sponsorName}
                  onChange={(e) => setSponsorName(e.target.value)}
                  placeholder="e.g. East Gwillimbury Bakery"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#00008b]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label htmlFor="qs-email" className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1.5">
                  Contact Email (for Stripe receipt &amp; updates) <span className="text-rose-500">*</span>
                </label>
                <input
                  id="qs-email"
                  type="email"
                  maxLength={254}
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="you@yourbusiness.ca"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#00008b]"
                />
              </div>

              <div>
                <label htmlFor="qs-target-kind" className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1.5">
                  When Someone Clicks Your Keyword <span className="text-rose-500">*</span>
                </label>
                <select
                  id="qs-target-kind"
                  value={targetKind}
                  onChange={(e) => setTargetKind(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm font-semibold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#00008b]"
                >
                  <option value="website">Open my website URL</option>
                  <option value="business">Open my Welcome East Gwillimbury Business Page</option>
                  <option value="search">Show Welcome East Gwillimbury search results</option>
                </select>
              </div>
            </div>

            {targetKind === 'website' && (
              <div>
                <label htmlFor="qs-website" className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-gray-500" />
                    Destination Website URL <span className="text-rose-500">*</span>
                  </span>
                </label>
                <input
                  id="qs-website"
                  type="url"
                  maxLength={500}
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://yourbusiness.ca"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#00008b]"
                />
              </div>
            )}

            {targetKind === 'business' && (
              <div>
                <label htmlFor="qs-business" className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-gray-500" />
                    Select Your Welcome East Gwillimbury Business Page <span className="text-rose-500">*</span>
                  </span>
                </label>
                <select
                  id="qs-business"
                  value={businessId}
                  onChange={(e) => setBusinessId(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm font-semibold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#00008b]"
                >
                  <option value="">Choose a listed business…</option>
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {targetKind === 'search' && (
              <div>
                <label htmlFor="qs-search-query" className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1.5">
                  Search Query to Run (optional — defaults to your keyword)
                </label>
                <input
                  id="qs-search-query"
                  type="text"
                  maxLength={80}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={keyword.trim() || 'e.g. bakery'}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#00008b]"
                />
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-gray-100">
              <div className="text-sm text-gray-600">
                Selected plan: <strong className="text-gray-900">{selectedPriceLabel}</strong> (+ applicable tax at checkout)
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-[#00008b] text-white text-sm font-black tracking-wide hover:bg-blue-900 transition-colors shadow-md disabled:opacity-60"
              >
                <span>{submitting ? 'Preparing Checkout…' : `Continue to Stripe Checkout (${selectedPriceLabel})`}</span>
                <ExternalLink className="w-4 h-4 shrink-0" />
              </button>
            </div>
          </form>
        </section>

        {/* Trust / Checkout / Manage Subscription Row */}
        {/* Sitewide Photo Gallery Ads */}
        <div id="photo-gallery-ads" className="mb-10 bg-white rounded-3xl border border-gray-200 shadow-sm p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-extrabold uppercase tracking-wider border border-amber-200">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Sitewide Photo Gallery Ads</span>
              </span>
              <h2 className="text-2xl font-black text-gray-900 mt-2">
                Featured Shimmering Photo Strip Spot
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                25% larger photo frame with a bold, color-shifting shimmering border across every public page on Welcome East Gwillimbury — linked directly to your website, business page, or listing.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className={`rounded-2xl p-5 flex flex-col justify-between ${galPlan === 'gallery_weekly' ? 'border-2 border-[#00008b] bg-blue-50/40' : 'border border-gray-200 bg-slate-50/70'}`}>
              <div>
                <div className="text-xs font-extrabold uppercase tracking-wider text-gray-500">7-Day Photo Gallery Spot</div>
                <div className="flex items-baseline gap-1.5 mt-1.5">
                  <span className="text-3xl font-black text-gray-900">$10.00</span>
                  <span className="text-sm font-bold text-gray-500">CAD / week • Recurring</span>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  Great for weekend events, flash sales, or 7-day promotions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGalPlan('gallery_weekly')}
                className="mt-5 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#00008b] text-white text-sm font-black hover:bg-blue-900 transition-colors cursor-pointer"
              >
                <span>{galPlan === 'gallery_weekly' ? 'Selected: 7-Day Spot ($10/wk)' : 'Select 7-Day Spot ($10/wk)'}</span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>
            </div>

            <div className={`rounded-2xl p-5 flex flex-col justify-between ${galPlan === 'gallery_monthly' ? 'border-2 border-[#00008b] bg-blue-50/40' : 'border border-gray-200 bg-slate-50/70'}`}>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-[#00008b]">30-Day Photo Gallery Spot</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[11px] font-black uppercase">Best Value</span>
                </div>
                <div className="flex items-baseline gap-1.5 mt-1.5">
                  <span className="text-3xl font-black text-gray-900">$35.00</span>
                  <span className="text-sm font-bold text-gray-500">CAD / month • Recurring</span>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  Continuous sitewide visibility on every page for 30 days.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGalPlan('gallery_monthly')}
                className="mt-5 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#00008b] text-white text-sm font-black hover:bg-blue-900 transition-colors cursor-pointer"
              >
                <span>{galPlan === 'gallery_monthly' ? 'Selected: 30-Day Spot ($35/mo)' : 'Select 30-Day Spot ($35/mo)'}</span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>
            </div>
          </div>

          {/* Photo Gallery Ad Pre-Checkout Intake Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              startAdOrderCheckout({
                adType: 'gallery',
                planKey: galPlan,
                sponsor: galSponsor,
                email: galEmail,
                targetType: galTargetType,
                targetUrl: galTargetUrl,
                headline: galHover,
                imageDataUrl: galImage,
                stripeUrl: galPlan === 'gallery_monthly' ? STRIPE_LINKS.galleryMonthly : STRIPE_LINKS.galleryWeekly,
                setErr: setGalError,
                setBusy: setGalSubmitting,
              });
            }}
            className="mt-6 pt-6 border-t border-gray-200 space-y-4"
          >
            <h3 className="text-base font-black text-gray-900">Upload Your Photo Strip Ad &amp; Destination</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1">Sponsor / Business Name *</label>
                <input type="text" required value={galSponsor} onChange={(e) => setGalSponsor(e.target.value)} placeholder="e.g. Lakeview Bakery" className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1">Contact Email *</label>
                <input type="email" required value={galEmail} onChange={(e) => setGalEmail(e.target.value)} placeholder="you@business.ca" className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1">Hover Tooltip Text (Optional)</label>
                <input type="text" maxLength={140} value={galHover} onChange={(e) => setGalHover(e.target.value)} placeholder="Short tagline shown when hovered" className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1">Destination Type *</label>
                <select value={galTargetType} onChange={(e) => setGalTargetType(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm bg-white">
                  <option value="external">External Website (https://...)</option>
                  <option value="listing">Welcome East Gwillimbury Listing (/events/..., /dining/..., /sales/...)</option>
                  <option value="business_page">Welcome East Gwillimbury Business Page (/businesses/...)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1">Destination URL or Welcome East Gwillimbury Path *</label>
              <input type="text" required value={galTargetUrl} onChange={(e) => setGalTargetUrl(e.target.value)} placeholder={galTargetType === 'external' ? 'https://yourwebsite.ca' : '/events/your-event-slug or /businesses/your-business'} className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm" />
            </div>
            <ImageUpload value={galImage} onChange={setGalImage} label="Photo Strip Ad Image * (Max 2 MB, auto-compressed to WebP)" />
            {galError && <p className="text-xs font-bold text-rose-600">{galError}</p>}
            <button type="submit" disabled={galSubmitting} className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-[#00008b] text-white text-sm font-black hover:bg-blue-900 transition-colors cursor-pointer disabled:opacity-60">
              <span>{galSubmitting ? 'Saving & Opening Stripe...' : `Continue to Stripe Checkout (${galPlan === 'gallery_monthly' ? '$35/mo' : '$10/wk'})`}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Newsletter Sponsored Ads */}
        <div id="newsletter-ads" className="mb-10 bg-white rounded-3xl border border-gray-200 shadow-sm p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-[#00008b] text-xs font-extrabold uppercase tracking-wider border border-blue-200">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Newsletter Sponsored Ads</span>
              </span>
              <h2 className="text-2xl font-black text-gray-900 mt-2">
                In-Edition Sponsored Newsletter Card
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Placed directly between listings in our Monday (Mon–Fri) or Thursday (Fri–Sun) community newsletter editions — clearly badged Sponsored with tracked clicks to your website, business page, or listing.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className={`rounded-2xl p-5 flex flex-col justify-between ${nlPlan === 'newsletter_single' ? 'border-2 border-[#00008b] bg-blue-50/40' : 'border border-gray-200 bg-slate-50/70'}`}>
              <div>
                <div className="text-xs font-extrabold uppercase tracking-wider text-gray-500">Single Insertion</div>
                <div className="flex items-baseline gap-1.5 mt-1.5">
                  <span className="text-3xl font-black text-gray-900">$5.00</span>
                  <span className="text-sm font-bold text-gray-500">CAD / 1 insertion</span>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  Ideal for spotlighting a single upcoming event, weekend special, or promotion.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNlPlan('newsletter_single')}
                className="mt-5 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#00008b] text-white text-sm font-black hover:bg-blue-900 transition-colors cursor-pointer"
              >
                <span>{nlPlan === 'newsletter_single' ? 'Selected: 1 Insertion ($5)' : 'Select 1 Insertion ($5)'}</span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>
            </div>

            <div className={`rounded-2xl p-5 flex flex-col justify-between ${nlPlan === 'newsletter_four_pack' ? 'border-2 border-[#00008b] bg-blue-50/40' : 'border border-gray-200 bg-slate-50/70'}`}>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-[#00008b]">4-Insertion Pack</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[11px] font-black uppercase">Save 15%</span>
                </div>
                <div className="flex items-baseline gap-1.5 mt-1.5">
                  <span className="text-3xl font-black text-gray-900">$17.00</span>
                  <span className="text-sm font-bold text-gray-500">CAD / 4 insertions</span>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  Run across 4 newsletter editions (Monday and/or Thursday) for sustained local reach.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNlPlan('newsletter_four_pack')}
                className="mt-5 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#00008b] text-white text-sm font-black hover:bg-blue-900 transition-colors cursor-pointer"
              >
                <span>{nlPlan === 'newsletter_four_pack' ? 'Selected: 4-Insertion Pack ($17)' : 'Select 4-Insertion Pack ($17)'}</span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>
            </div>
          </div>

          {/* Newsletter Sponsored Ad Pre-Checkout Intake Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              startAdOrderCheckout({
                adType: 'newsletter',
                planKey: nlPlan,
                sponsor: nlSponsor,
                email: nlEmail,
                targetType: nlTargetType,
                targetUrl: nlTargetUrl,
                headline: nlHeadline,
                bodyText: nlBody,
                imageDataUrl: nlImage,
                edition: nlEdition,
                stripeUrl: nlPlan === 'newsletter_four_pack' ? STRIPE_LINKS.newsletterFourPack : STRIPE_LINKS.newsletterSingle,
                setErr: setNlError,
                setBusy: setNlSubmitting,
              });
            }}
            className="mt-6 pt-6 border-t border-gray-200 space-y-4"
          >
            <h3 className="text-base font-black text-gray-900">Enter Your Newsletter Ad Copy &amp; Destination</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1">Sponsor / Business Name *</label>
                <input type="text" required value={nlSponsor} onChange={(e) => setNlSponsor(e.target.value)} placeholder="e.g. Briars Resort & Spa" className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1">Contact Email *</label>
                <input type="email" required value={nlEmail} onChange={(e) => setNlEmail(e.target.value)} placeholder="you@business.ca" className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1">Ad Headline *</label>
                <input type="text" required maxLength={140} value={nlHeadline} onChange={(e) => setNlHeadline(e.target.value)} placeholder="e.g. Weekend Spa & Dining Special" className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1">Preferred Edition</label>
                <select value={nlEdition} onChange={(e) => setNlEdition(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm bg-white">
                  <option value="both">Both (Monday &amp; Thursday)</option>
                  <option value="monday">Monday Edition (Mon–Fri)</option>
                  <option value="thursday">Thursday Edition (Fri–Sun)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1">Destination Type *</label>
                <select value={nlTargetType} onChange={(e) => setNlTargetType(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm bg-white">
                  <option value="external">External Website (https://...)</option>
                  <option value="listing">Welcome East Gwillimbury Listing (/events/..., /dining/..., /sales/...)</option>
                  <option value="business_page">Welcome East Gwillimbury Business Page (/businesses/...)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1">Destination URL or Welcome East Gwillimbury Path *</label>
                <input type="text" required value={nlTargetUrl} onChange={(e) => setNlTargetUrl(e.target.value)} placeholder={nlTargetType === 'external' ? 'https://yourwebsite.ca' : '/events/your-event-slug or /businesses/your-business'} className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1">Ad Description / Copy (Optional)</label>
              <textarea rows={2} maxLength={500} value={nlBody} onChange={(e) => setNlBody(e.target.value)} placeholder="Short promotional message shown inside your Sponsored newsletter card..." className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm" />
            </div>
            <ImageUpload value={nlImage} onChange={setNlImage} label="Optional Ad Image (Max 2 MB, auto-compressed to WebP)" />
            {nlError && <p className="text-xs font-bold text-rose-600">{nlError}</p>}
            <button type="submit" disabled={nlSubmitting} className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-[#00008b] text-white text-sm font-black hover:bg-blue-900 transition-colors cursor-pointer disabled:opacity-60">
              <span>{nlSubmitting ? 'Saving & Opening Stripe...' : `Continue to Stripe Checkout (${nlPlan === 'newsletter_four_pack' ? '$17 / 4x' : '$5 / 1x'})`}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Press Release */}
        <div className="bg-white rounded-3xl border border-gray-200 p-6 sm:p-8 shadow-sm mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
            <div>
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-[#00008b] bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
                <FileText className="w-3.5 h-3.5" />
                Press Release
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-gray-900 mt-2">
                Sponsored Press Release
              </h2>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-3xl font-black text-gray-900">$250.00</span>
                <span className="text-sm font-bold text-gray-500">CAD / release</span>
              </div>
              <p className="text-sm text-gray-600 mt-2">
                We write and publish your press release in the Welcome East Gwillimbury Pressroom and contact you by email for all details and images.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <a
                href="mailto:contact@welcomeeg.ca?subject=Press%20Release%20Inquiry"
                className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-black border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 transition-colors"
              >
                <Mail className="w-4 h-4" />
                <span>Contact Us by Email</span>
              </a>
              {isConfiguredStripeUrl(STRIPE_LINKS.pressRelease) && (
                <a
                  href={STRIPE_LINKS.pressRelease}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-black bg-[#00008b] hover:bg-blue-900 text-white shadow-sm transition-colors"
                >
                  <span>Order Press Release</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>

          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-sm text-gray-700">
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>Written by our editorial team — no self-service form required</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>Includes header, body, footer, and multiple photos</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>We reach out by email after checkout to gather your info &amp; images</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>Published in the Welcome East Gwillimbury Pressroom with verified business citation</span>
            </li>
          </ul>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-[#00008b] shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-bold text-gray-900">Secure Stripe Checkout</p>
              <p className="text-gray-600 mt-0.5">Payments, recurring billing, and cards are handled directly on Stripe&apos;s hosted checkout.</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-start gap-3">
            <Receipt className="w-5 h-5 text-[#00008b] shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-bold text-gray-900">Automatic Tax &amp; Invoices</p>
              <p className="text-gray-600 mt-0.5">Applicable taxes are calculated automatically with instant PDF receipts for your books.</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-start gap-3">
            <CreditCard className="w-5 h-5 text-[#00008b] shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-bold text-gray-900">Manage Subscription</p>
              {portalReady ? (
                <p className="text-gray-600 mt-0.5">
                  Update your card, download invoices, or cancel anytime in the{' '}
                  <a
                    href={STRIPE_LINKS.customerPortal}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-[#00008b] underline hover:text-blue-900"
                  >
                    Stripe Customer Portal
                  </a>.
                </p>
              ) : (
                <p className="text-gray-600 mt-0.5">
                  Cancel or change your plan anytime via your Stripe receipt link or by emailing{' '}
                  <a href="mailto:contact@welcomeeg.ca" className="font-bold text-[#00008b] underline">
                    contact@welcomeeg.ca
                  </a>.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Already a sponsor? Stats link */}
        <div className="bg-lake-900 text-white rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <BarChart3 className="w-6 h-6 text-sun-300 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-black">Already running an ad on Welcome East Gwillimbury?</h2>
              <p className="text-sm text-lake-100 mt-0.5">
                View your live impressions and clicks, or cancel/manage your recurring ad subscription anytime.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <a
              href={portalReady ? STRIPE_LINKS.customerPortal : 'mailto:contact@welcomeeg.ca?subject=Cancel%20Ad%20Subscription'}
              target={portalReady ? '_blank' : undefined}
              rel={portalReady ? 'noopener noreferrer' : undefined}
              className="inline-flex items-center justify-center rounded-xl bg-white/15 hover:bg-white/25 text-white font-black text-xs sm:text-sm px-4 py-2.5 border border-white/25 transition-colors"
            >
              Manage / Cancel Subscription
            </a>
          </div>
          <a
            href="/business/index.html"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sun-400 text-lake-950 text-sm font-black hover:bg-sun-300 transition-colors shrink-0"
          >
            <span>Open Business Stats</span>
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
