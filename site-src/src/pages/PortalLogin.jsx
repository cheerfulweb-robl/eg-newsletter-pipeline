import React, { useState, useEffect } from 'react';
import { Lock, Mail, ArrowRight, AlertCircle, Shield } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

export default function PortalLogin() {
  const navigate = useNavigate();
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [currentRole, setCurrentRole] = useState(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const handleDirectLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setMagicLinkSent(false);
    setLoginLoading(true);

    try {
      const cleanEmail = loginEmail.trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes('@')) {
        throw new Error('Please enter a valid email address.');
      }

      // One real Supabase sign-in link (works for new and returning emails). The old second
      // "magic link" email was only a plain link and did not sign anyone in, so it is gone.
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: { emailRedirectTo: `${window.location.origin}/news/dashboard.html`, shouldCreateUser: true },
      });
      if (otpError) {
        throw new Error(/rate|seconds|too many/i.test(otpError.message || '')
          ? 'A sign-in link was sent very recently. Please wait a minute, then try again.'
          : `Could not send the sign-in link: ${otpError.message}`);
      }

      setMagicLinkSent(true);
    } catch (err) {
      setLoginError(err.message || 'Unable to send Magic Sign-In Link.');
    } finally {
      setLoginLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!active || !session || !session.user) return;
        setCurrentUserEmail(session.user.email || '');
        const { data: prof } = await supabase
          .from('user_profiles')
          .select('role, active')
          .eq('id', session.user.id)
          .maybeSingle();
        if (active && prof && prof.active) {
          setCurrentRole(String(prof.role || '').toLowerCase());
        }
      } catch (_) {}
    })();
    return () => { active = false; };
  }, []);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      localStorage.removeItem('wg_wallet_email');
      localStorage.removeItem('wg_user_email');
      localStorage.removeItem('wg_user_role');
      localStorage.removeItem('gd_auth_user');
      sessionStorage.clear();
      window.dispatchEvent(new Event('storage'));
      setCurrentUserEmail('');
      setCurrentRole(null);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const isAdminUser = ['admin', 'super_admin', 'staff', 'editorial'].includes(String(currentRole || '').toLowerCase());

  const getRoleBadge = (role) => {
    if (isAdminUser) return 'Staff Administrator';
    if (role === 'vendor' || role === 'submitter' || role === 'publisher') return 'Event Organizer / Submitter';
    return 'Community Member';
  };

  return (
    <div className="max-w-[1440px] mx-auto w-full p-4 md:p-12">
      <div className="max-w-5xl mx-auto">
        {/* Breadcrumb */}
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">
          <Link to="/" className="text-slate-700 hover:text-[#00008b] font-bold">Home</Link>
          <span className="mx-2 text-slate-400">/</span>
          <span className="text-slate-900 font-extrabold">Member Portals &amp; Account Sign In</span>
        </div>

        {/* Active Session Notice if logged in */}
        {currentUserEmail && (
          <div className="mb-8 p-5 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-blue-900">
                  Currently Signed In: <span className="text-emerald-700">{getRoleBadge(currentRole)}</span>
                </p>
                <p className="text-sm font-black text-slate-900 mt-0.5 truncate max-w-md">
                  {currentUserEmail}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {isAdminUser ? (
                <>
                  <a
                    href="/staff/admin-approvals.html"
                    reloadDocument
                    className="px-4 py-2 rounded-xl bg-[#00008b] text-white text-xs font-black uppercase tracking-wider hover:bg-blue-900 transition-all shadow-sm flex items-center gap-1.5"
                  >
                    <span>Staff Admin Dashboard &rarr;</span>
                  </a>
                  <a
                    href="/staff/admin-approvals.html"
                    className="px-3.5 py-2 rounded-xl bg-white border border-blue-300 text-[#00008b] hover:bg-blue-50 text-xs font-black uppercase tracking-wider transition-all"
                  >
                    Approvals Queue ↗
                  </a>
                </>
              ) : (
                <a
                  href="/my-submissions"
                  className="px-4 py-2 rounded-xl bg-[#00008b] text-white text-xs font-black uppercase tracking-wider hover:bg-blue-900 transition-all shadow-sm"
                >
                  Go to Event Dashboard &rarr;
                </a>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="px-3.5 py-2 rounded-xl bg-white border border-rose-300 text-rose-600 hover:bg-rose-50 text-xs font-black uppercase tracking-wider transition-all"
              >
                Log Out
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="text-center mb-8">
          <span className="inline-block bg-blue-100 text-[#00008b] font-black text-xs uppercase px-3.5 py-1.5 rounded-full mb-3 tracking-wider border border-blue-200">
            Welcome East Gwillimbury Member Network
          </span>
          <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight">
            Account Sign In &amp; Portals
          </h1>
          <p className="text-slate-600 text-sm md:text-base mt-2 max-w-2xl mx-auto font-medium">
            Sign in below to access your resident digital wallet, merchant redemption terminal, or staff admin CRM.
          </p>
        </div>

        {/* MAGIC LINK SIGN IN FORM (SUBMITTERS & MEMBERS) */}
        {!currentUserEmail && (
          <div className="max-w-md mx-auto mb-14 bg-white rounded-3xl p-6 sm:p-8 border-2 border-slate-200 shadow-xl text-left">
            <div className="flex items-center gap-3 mb-5 pb-3 border-b border-slate-100">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#00008b] flex items-center justify-center font-black">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900 leading-tight">Event Submitter Magic Link Sign In</h2>
                <p className="text-xs text-slate-500 font-bold">Passwordless One-Click Email Sign-In</p>
              </div>
            </div>

            {loginError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2 text-rose-700 text-xs font-bold">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{loginError}</span>
              </div>
            )}

            {magicLinkSent && (
              <div className="mb-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold leading-relaxed">
                ✓ Magic Sign-In Link sent to <strong>{loginEmail}</strong>! Check your inbox and click the link to open your Event Submitter Dashboard.
              </div>
            )}

            <form onSubmit={handleDirectLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="organizer@egcommunity.ca"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#00008b] focus:ring-1 focus:ring-[#00008b]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-3 px-4 rounded-xl bg-[#00008b] hover:bg-blue-900 text-white font-black text-xs uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {loginLoading ? (
                  <span>Sending Magic Link...</span>
                ) : (
                  <>
                    <span>Send Magic Sign-In Link</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <a href="/news/login.html" className="font-bold text-[#00008b] hover:underline">
                Submitter Login (/news/login.html) &rarr;
              </a>
              <a href="/staff/login.html" className="font-black text-slate-700 hover:text-[#00008b] hover:underline">
                Staff Login &rarr;
              </a>
            </div>
          </div>
        )}

        {/* 2 Focused Primary Account Portals */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 text-left max-w-4xl mx-auto">
          {/* Card 1: Event Submitter & Organizer Hub */}
          <div className="bg-white rounded-3xl p-7 md:p-8 border-2 border-slate-300 hover:border-indigo-600 shadow-[0_10px_30px_rgba(0,0,0,0.06)] transition-all flex flex-col justify-between">
            <div>
              <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-900 flex items-center justify-center text-3xl font-black mb-5 shadow-xs border border-indigo-300">
                📅
              </div>

              <div className="flex items-center gap-2 mb-2">
                <span className="bg-indigo-100 text-indigo-950 text-[11px] font-black uppercase px-3 py-1 rounded-full tracking-wider border border-indigo-300">
                  Event Organizer &amp; Submitter Hub
                </span>
              </div>

              <h2 className="text-2xl font-black text-slate-900 mb-1">
                Community Events Submissions
              </h2>
              <p className="text-xs text-indigo-800 font-bold mb-4 uppercase tracking-wide">
                Upcoming Events &bull; Web Crawler URLs &bull; Reader Clicks
              </p>

              <p className="text-sm text-slate-700 font-medium mb-5 leading-relaxed">
                For local venues, non-profits, performers, and community organizers. Submit and manage your community events with live status tracking and web scraping.
              </p>

              <div className="space-y-2.5 mb-6 border-t-2 border-slate-100 pt-4 text-xs text-slate-800 font-bold">
                <div className="flex items-start gap-2">
                  <span className="text-indigo-700 font-black text-sm">&#10003;</span>
                  <span>Publish community events directly to the 45-day calendar</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-indigo-700 font-black text-sm">&#10003;</span>
                  <span>Connect your website URLs for automated weekly crawling</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-indigo-700 font-black text-sm">&#10003;</span>
                  <span>Track live reader clickthroughs from the Thursday newsletter</span>
                </div>
              </div>
            </div>

            <div>
              <a
                href="/my-submissions"
                className="block w-full text-center bg-indigo-700 hover:bg-indigo-800 text-white font-black text-xs sm:text-sm uppercase tracking-wider py-3.5 rounded-xl shadow-md transition-all hover:shadow-lg"
              >
                Open Event Submitter Dashboard ↗
              </a>
              <p className="text-center text-xs text-slate-600 mt-2.5 font-bold">
                Quick submission form? <Link to="/submission" className="text-indigo-800 font-black underline">Public Submission Form &rarr;</Link>
              </p>
            </div>
          </div>

          {/* Card 2: Staff & Editorial Operations */}
          <div className="bg-white rounded-3xl p-7 md:p-8 border-2 border-slate-300 hover:border-[#00008b] shadow-[0_10px_30px_rgba(0,0,0,0.06)] transition-all flex flex-col justify-between">
            <div>
              <div className="w-14 h-14 rounded-2xl bg-blue-100 text-[#00008b] flex items-center justify-center text-3xl font-black mb-5 shadow-xs border border-blue-300">
                🛡️
              </div>

              <div className="flex items-center gap-2 mb-2">
                <span className="bg-blue-100 text-blue-950 text-[11px] font-black uppercase px-3 py-1 rounded-full tracking-wider border border-blue-300">
                  Restricted Staff Area
                </span>
              </div>

              <h2 className="text-2xl font-black text-slate-900 mb-1">
                Staff Operations &amp; Moderation
              </h2>
              <p className="text-xs text-blue-800 font-bold mb-4 uppercase tracking-wide">
                Approvals Queue &bull; Pipeline Runner &bull; Blacklist Manager
              </p>

              <p className="text-sm text-slate-700 font-medium mb-5 leading-relaxed">
                Reserved exclusively for Welcome East Gwillimbury editors and administrators. Review submitted events, run crawl audits, and moderate content.
              </p>

              <div className="space-y-2.5 mb-6 border-t-2 border-slate-100 pt-4 text-xs text-slate-800 font-bold">
                <div className="flex items-start gap-2">
                  <span className="text-[#00008b] font-black text-sm">&#10003;</span>
                  <span>1-click approve, modify, or reject community event submissions</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[#00008b] font-black text-sm">&#10003;</span>
                  <span>Audit web crawler health across local York Region sources</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[#00008b] font-black text-sm">&#10003;</span>
                  <span>Special Edition Studio &amp; test newsletter dispatcher</span>
                </div>
              </div>
            </div>

            <div>
              <a
                href="/staff/login.html"
                className="block w-full text-center bg-[#00008b] hover:bg-blue-900 text-white font-black text-xs sm:text-sm uppercase tracking-wider py-3.5 rounded-xl shadow-md transition-all hover:shadow-lg"
              >
                Sign In to Staff Operations (/staff) &rarr;
              </a>
              <p className="text-center text-xs text-slate-600 mt-2.5 font-bold">
                Direct to Approvals? <a href="/staff/admin-approvals.html" className="text-[#00008b] font-black underline">Approvals Queue &rarr;</a>
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Helper Bar */}
        <div className="mt-12 text-center border-t-2 border-slate-200 pt-8 flex flex-col sm:flex-row items-center justify-center gap-6 text-xs text-slate-600 font-bold">
          <div>
            Want the weekly newsletter?{' '}
            <Link to="/newsletter#subscribe" className="text-blue-800 font-black hover:underline uppercase">
              Join Free Newsletter
            </Link>
          </div>
          <span className="hidden sm:inline text-slate-400">&bull;</span>
          <div>
            Need assistance or custom offer updates?{' '}
            <Link to="/knowledge-base" className="text-emerald-800 font-black hover:underline uppercase">
              Help &amp; Support
            </Link>
          </div>
          <span className="hidden sm:inline text-slate-400">&bull;</span>
          <div>
            Staff Operations &amp; Moderation?{' '}
            <a href="/staff/login.html" className="text-slate-900 font-black hover:underline uppercase">
              Staff Login (/staff)
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
