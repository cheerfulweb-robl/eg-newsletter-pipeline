import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { GEORGINA_COMMUNITIES, OUT_OF_AREA } from '../utils/communities';
import { Mail, CheckCircle, ArrowRight, ShieldCheck, Newspaper, Store, Calendar } from 'lucide-react';

export default function NewsletterSubscribe() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const audience = 'reader';
  const [area, setArea] = useState('All East Gwillimbury');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubscribe = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    if (!firstName.trim() || !lastName.trim()) {
      setError('Please provide both First Name and Last Name.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const cleanEmail = email.trim().toLowerCase();
      const fName = firstName.trim();
      const lName = lastName.trim();
      const fullName = `${fName} ${lName}`;

      // Always subscribe to BOTH Monday and Thursday editions
      const { data: subData, error: rpcError } = await supabase.rpc('register_newsletter_subscriber', {
        email_input: cleanEmail,
        first_name_input: fName || 'Resident',
        area_input: area || 'All East Gwillimbury',
        audience_input: audience,
        thursday_input: true,
        monday_input: true
      });

      if (rpcError) {
        console.warn('Subscription RPC note:', rpcError);
        await supabase.from('newsletter_subscribers').upsert([{
          email: cleanEmail,
          first_name: fName || 'Resident',
          last_name: lName || '',
          name: fullName || 'Resident',
          audience_type: audience,
          community_area: area,
          wants_monday: true,
          wants_thursday: true,
          status: 'pending',
          source: 'subscribe_page'
        }], { onConflict: 'email' });
      } else if (lName) {
        await supabase.from('newsletter_subscribers').update({
          last_name: lName,
          name: fullName
        }).eq('email', cleanEmail);
      }

      const token = subData?.token || '';
      try {
        await supabase.functions.invoke('send-email', {
          body: {
            formType: 'newsletter_signup',
            record: {
              ...(subData || {}),
              email: cleanEmail,
              first_name: fName || 'Neighbour',
              last_name: lName || '',
              audience_type: audience,
              community_area: area,
              wants_monday: true,
              wants_thursday: true,
              token: token
            }
          }
        });
      } catch (fErr) {
        console.warn('Send-email function notice:', fErr);
      }

      setSuccess(true);
    } catch (err) {
      console.error('Newsletter subscribe error:', err);
      setError(err.message || 'Unable to complete subscription. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto w-full px-4 md:px-8 lg:px-12 py-8 md:py-10 flex flex-col gap-10">

      {/* Design B Lake & Sunset Atmospheric Hero */}
      <section className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-lake-950 via-lake-800 to-indigo-950 text-white p-6 sm:p-10 md:p-12 shadow-xl border border-lake-700/40">
        {/* Ambient East Gwillimbury Sunset Glow Orbs */}
        <div aria-hidden="true" className="pointer-events-none absolute -top-24 -left-16 w-72 h-72 rounded-full bg-coral-500/20 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-12 w-80 h-80 rounded-full bg-sun-400/20 blur-3xl" />
        <svg
          aria-hidden="true"
          viewBox="0 0 600 220"
          fill="none"
          className="absolute -right-12 -bottom-16 w-[500px] h-[220px] text-white/[0.04] pointer-events-none select-none"
        >
          <path d="M0 110 C120 40, 240 180, 360 110 C460 50, 540 150, 600 100 L600 220 L0 220 Z" fill="currentColor" />
        </svg>

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
          {/* Left Column: Headline & Twice-Weekly Schedule */}
          <div className="lg:col-span-7 space-y-5 pt-1">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-lake-900/80 border border-lake-600/70 text-sun-200 text-xs sm:text-sm font-black uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-sun-400 animate-pulse shrink-0" aria-hidden="true" />
              <span>Twice-Weekly Community Newsletter &bull; Monday &amp; Thursday</span>
            </div>

            <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight">
              Every East Gwillimbury Event, Dining Special &amp; Local Sale in One Free Subscription.
            </h1>

            <p className="text-blue-100 text-base sm:text-lg leading-relaxed max-w-2xl font-medium">
              One free sign-up delivers <strong className="text-white">both our Monday and Thursday newsletter editions</strong> straight to your inbox—covering {GEORGINA_COMMUNITIES.slice(0, -1).join(', ')}, and {GEORGINA_COMMUNITIES[GEORGINA_COMMUNITIES.length - 1]}.
            </p>

            {/* Clear Breakdown of Both Editions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 p-4 space-y-1">
                <div className="text-sun-300 text-xs font-black uppercase tracking-wider">Monday Edition</div>
                <div className="text-white font-black text-base">Monday to Friday Listings</div>
                <p className="text-blue-100 text-sm leading-relaxed">
                  Plan your week ahead with weekday community events, library programs, dining specials, and store sales.
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 p-4 space-y-1">
                <div className="text-sun-300 text-xs font-black uppercase tracking-wider">Thursday Edition</div>
                <div className="text-white font-black text-base">This Coming Weekend &amp; Next Weekend</div>
                <p className="text-blue-100 text-sm leading-relaxed">
                  Everything happening Friday, Saturday, and Sunday this coming weekend plus a preview of next weekend&apos;s Friday–Sunday listings.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                to="/newsletter"
                className="inline-flex items-center justify-center gap-2 min-h-[46px] px-6 py-2.5 rounded-full bg-white text-lake-950 hover:bg-sun-300 font-black text-sm transition-all shadow-md"
              >
                <span>Browse Past Editions</span>
                <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
              </Link>
              <Link
                to="/submission"
                className="inline-flex items-center justify-center gap-2 min-h-[46px] px-6 py-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white border border-white/25 font-bold text-sm transition-all"
              >
                <span>Own a Local Business? Submit Listings Free</span>
                <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
              </Link>
            </div>
          </div>

          {/* Right Column: Subscription Card */}
          <div className="lg:col-span-5">
            <div className="bg-white text-slate-900 rounded-3xl shadow-2xl border border-lake-200/80 p-6 sm:p-8">
              <div className="flex items-center gap-2.5 mb-1">
                <div className="w-10 h-10 rounded-2xl bg-coral-50 text-coral-600 flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5" aria-hidden="true" />
                </div>
                <h2 className="font-heading text-2xl font-black text-lake-950">
                  Join the Free Newsletter
                </h2>
              </div>
              <p className="text-sm text-slate-600 mb-5 leading-relaxed">
                Sign up once to receive <strong>both Monday and Thursday editions</strong>. 100% free, one-click unsubscribe anytime.
              </p>

              {success ? (
                <div className="text-center py-6 space-y-4 animate-in fade-in duration-300" role="status">
                  <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle className="w-8 h-8" aria-hidden="true" />
                  </div>
                  <h3 className="text-xl font-black text-slate-900">Check Your Inbox to Confirm!</h3>
                  <p className="text-sm text-slate-700 leading-relaxed max-w-sm mx-auto">
                    We just sent a confirmation link to <strong className="text-slate-950">{email}</strong>. Click it to activate both your Monday and Thursday editions.
                  </p>
                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 text-sm text-left space-y-1.5 max-w-sm mx-auto">
                    <p className="font-bold flex items-center gap-1.5">
                      <span aria-hidden="true">⚠️</span> Didn&apos;t see the email?
                    </p>
                    <p className="text-sm leading-relaxed text-amber-900">
                      Please check your <strong>Spam or Junk folder</strong> and mark it as <strong>&quot;Not Spam&quot;</strong> so both your Monday and Thursday editions land in your inbox.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSuccess(false);
                      setEmail('');
                      setFirstName('');
                      setLastName('');
                    }}
                    className="min-h-[44px] px-4 text-sm text-lake-800 font-black hover:underline cursor-pointer"
                  >
                    Subscribe another email &rarr;
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubscribe} className="space-y-4" noValidate>
                  {error && (
                    <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold">
                      {error}
                    </div>
                  )}

                  {/* First & Last Name */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="sub-first-name" className="block text-sm font-bold text-slate-800 mb-1">
                        First Name <span className="text-rose-600" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="sub-first-name"
                        type="text"
                        required
                        autoComplete="given-name"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="e.g. Sarah"
                        className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-lake-800 focus:border-transparent bg-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="sub-last-name" className="block text-sm font-bold text-slate-800 mb-1">
                        Last Name <span className="text-rose-600" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="sub-last-name"
                        type="text"
                        required
                        autoComplete="family-name"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="e.g. Smith"
                        className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-lake-800 focus:border-transparent bg-white"
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <label htmlFor="sub-email" className="block text-sm font-bold text-slate-800 mb-1">
                      Email Address <span className="text-rose-600" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="sub-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-lake-800 focus:border-transparent bg-white"
                    />
                  </div>

                  {/* Both Editions Included Notice */}
                  <div className="p-3.5 rounded-2xl bg-lake-50 border border-lake-200 text-sm text-lake-950 space-y-1">
                    <div className="font-black text-lake-900">
                      📬 Includes Both Editions (Monday &amp; Thursday)
                    </div>
                    <p className="text-sm text-lake-900/90 leading-snug">
                      <strong>Monday:</strong> Mon–Fri listings. <strong>Thursday:</strong> This coming weekend &amp; next weekend (Fri–Sun). Subscriptions include both editions together.
                    </p>
                  </div>

                  {/* Community Area */}
                  <div>
                    <label htmlFor="sub-area" className="block text-sm font-bold text-slate-800 mb-1">
                      Community Area
                    </label>
                    <select
                      id="sub-area"
                      value={area}
                      onChange={(e) => setArea(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-lake-800 bg-white"
                    >
                      <option value="All East Gwillimbury">All of East Gwillimbury</option>
                      {[...GEORGINA_COMMUNITIES, OUT_OF_AREA].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  {/* Submit Button (Design B Coral Pill CTA) */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full min-h-[48px] py-3.5 px-6 rounded-full bg-coral-600 hover:bg-sun-400 text-white hover:text-lake-950 font-black text-base transition-all shadow-md hover:shadow-lg disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      'Subscribing...'
                    ) : (
                      <>
                        <span>Subscribe to Both Editions</span>
                        <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
                      </>
                    )}
                  </button>

                  {/* Badges */}
                  <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                      <span>CASL Compliant &bull; 100% Free &bull; Unsubscribe anytime</span>
                    </div>
                    <Link to="/privacy" className="hover:underline text-slate-600 font-bold">
                      Privacy
                    </Link>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 3-Column Features Section (Design B rounded-3xl cards) */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-7 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-2xl bg-lake-50 text-lake-800 flex items-center justify-center mb-4">
            <Calendar className="w-6 h-6" aria-hidden="true" />
          </div>
          <h3 className="font-heading text-xl font-black text-lake-950 mb-2">1. Community Events &amp; Venues</h3>
          <p className="text-base text-slate-700 leading-relaxed">
            Live shows at Stephen Leacock Theatre, East Gwillimbury Public Library workshops, The Briars Resort,
            Hospice East Gwillimbury, local markets, and neighbourhood gatherings—grouped day by day.
          </p>
        </div>

        <div className="bg-white p-7 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-800 flex items-center justify-center mb-4">
            <Store className="w-6 h-6" aria-hidden="true" />
          </div>
          <h3 className="font-heading text-xl font-black text-lake-950 mb-2">2. Local Dining &amp; Store Sales</h3>
          <p className="text-base text-slate-700 leading-relaxed">
            Weekly restaurant specials, seasonal menus, and local East Gwillimbury merchant sales submitted directly by business owners across Holland Landing, Mount Albert, Jackson&apos;s Point, and Queensville.
          </p>
        </div>

        <div className="bg-white p-7 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-800 flex items-center justify-center mb-4">
            <Newspaper className="w-6 h-6" aria-hidden="true" />
          </div>
          <h3 className="font-heading text-xl font-black text-lake-950 mb-2">3. Twice-Weekly Rhythm</h3>
          <p className="text-base text-slate-700 leading-relaxed">
            Monday&apos;s edition covers Monday to Friday listings. Thursday&apos;s edition covers this coming weekend and the next weekend (Friday, Saturday, and Sunday)—plus a direct link to Local News on our website.
          </p>
        </div>
      </section>

      {/* Bottom Callout Banner (Design B) */}
      <section className="bg-gradient-to-r from-lake-50 via-sky-50 to-amber-50/60 border border-lake-200 rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <h2 className="font-heading text-2xl font-black text-lake-950">
              Small Business, Artisan, Farm, or Community Group?
            </h2>
            <p className="text-base text-slate-700 leading-relaxed">
              Submit your upcoming events, dining specials, and sales promotions for free to appear in our Monday and Thursday newsletter editions—and track how many readers click your listings!
            </p>
          </div>
          <div className="shrink-0">
            <Link
              to="/submission"
              className="inline-flex items-center justify-center gap-2 min-h-[48px] px-7 py-3.5 rounded-full bg-lake-800 hover:bg-lake-950 text-white font-black text-base shadow-md hover:shadow-lg transition-all"
            >
              <span>Submit a Free Listing</span>
              <ArrowRight className="w-4 h-4 text-sun-300 shrink-0" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
