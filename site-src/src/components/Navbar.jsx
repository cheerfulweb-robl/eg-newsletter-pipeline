// LOCKED: Main header navigation menu (desktop, tablet, and mobile — all viewports) is locked.
// Allow NO further changes to links, auth controls, or layout unless explicitly requested.
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import {
  resolveUserRole,
  ROLES,
  canAccessStaffTools,
  canAccessAdminTools,
  canAccessRedemption,
  canAccessWallet,
  canAccessSubmit,
  getRoleDisplay,
  getRoleHome,
} from '../utils/roleAccess';
import { staffMenuFor, isStaticStaffHref } from '../utils/staffMenu';
import { 
  ChevronDown, 
  ChevronRight, 
  X, 
  Menu, 
  Gift, 
  Mail, 
  Calendar, 
  Tag, 
  UserPlus, 
  ExternalLink,
  User,
  Shield,
  CheckCircle2,
  EyeOff,
  RefreshCw,
  QrCode,
  HelpCircle,
  Sparkles,
  ArrowRight,
  LogIn,
  Utensils,
  Sun,
  Newspaper,
  Cloud,
  Store,
} from 'lucide-react';

const safeGetItem = (key) => {
  try {
    if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.getItem === 'function') {
      return window.localStorage.getItem(key);
    }
    if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.getItem === 'function') {
      return localStorage.getItem(key);
    }
  } catch (_) {}
  return null;
};

export const KNOWN_ADMIN_EMAILS = [
  'cheerfulweb@gmail.com',
  'stillcheerful@gmail.com',
  'admin@welcomeeg.ca',
  'info@welcomeeg.ca',
  'editorial@welcomeeg.ca',
  'support@welcomeeg.ca'
];

export const checkIsAdminEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const clean = email.trim().toLowerCase();
  if (KNOWN_ADMIN_EMAILS.includes(clean)) return true;
  if (clean.endsWith('@welcomeeg.ca')) return true;
  if (clean.startsWith('stillcheerful+') && clean.includes('admin')) return true;
  return false;
};

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedParent, setExpandedParent] = useState(null);
  const [expandedAdminGroup, setExpandedAdminGroup] = useState(null);
  const [session, setSession] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [joinMenuOpen, setJoinMenuOpen] = useState(false);
  const [newsMenuOpen, setNewsMenuOpen] = useState(false);
  const [hamperMenuOpen, setHamperMenuOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [portalRole, setPortalRole] = useState(() => safeGetItem('wg_user_role'));
  const [walletEmail, setWalletEmail] = useState(() => safeGetItem('wg_wallet_email') || '');

  const location = useLocation();
  const navigate = useNavigate();

  // Active secondary tab on desktop based on current route or user selection
  const [activeSecondarySection, setActiveSecondarySection] = useState(null);

  // Automatically sync active secondary bar with current route
  useEffect(() => {
    const p = location.pathname;
    if (p.startsWith('/news') || p.startsWith('/newsletter') || p.startsWith('/subscribe')) {
      setActiveSecondarySection('news');
      setExpandedParent('news');
    } else if (p.startsWith('/directory') || p.startsWith('/offers')) {
      setActiveSecondarySection('directory');
      setExpandedParent('directory');
    } else if (p.startsWith('/events') || p.startsWith('/calendar')) {
      setActiveSecondarySection('events');
      setExpandedParent('events');
    } else if (p.startsWith('/dining')) {
      setActiveSecondarySection('dining');
      setExpandedParent('dining');
    } else if (p.startsWith('/sales')) {
      setActiveSecondarySection('sales');
      setExpandedParent('sales');
    } else if (p.startsWith('/register') || p.startsWith('/signup') || p.startsWith('/join')) {
      setActiveSecondarySection('join');
      setExpandedParent('join');
    } else {
      // Default to hamper options or null on home
      setActiveSecondarySection(null);
    }
    setMobileMenuOpen(false);
    setAccountMenuOpen(false);
    setJoinMenuOpen(false);

    try {
      setWalletEmail(safeGetItem('wg_wallet_email') || '');
      setPortalRole(safeGetItem('wg_user_role') || null);
    } catch {
      // ignore
    }
  }, [location.pathname]);

  // Sync role and email across browser storage events
  useEffect(() => {
    const syncStorage = () => {
      try {
        setWalletEmail(safeGetItem('wg_wallet_email') || '');
        setPortalRole(safeGetItem('wg_user_role') || null);
      } catch (_) {}
    };
    window.addEventListener('storage', syncStorage);
    return () => window.removeEventListener('storage', syncStorage);
  }, []);

  // Mobile drawer: lock background scroll while open and allow Escape to close
  useEffect(() => {
    if (!mobileMenuOpen || typeof document === 'undefined') return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [mobileMenuOpen]);

  // Track authentication state & user role
  useEffect(() => {
    let mounted = true;

    async function checkAuth() {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (!mounted) return;
        setSession(currentSession);

        if (currentSession?.user) {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('role')
            .eq('id', currentSession.user.id)
            .maybeSingle();

          if (mounted && profile) {
            setUserRole(profile.role);
          }
        }
      } catch (err) {
        console.error('Navbar auth check error:', err);
      }
    }

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      if (newSession?.user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', newSession.user.id)
          .maybeSingle();

        if (mounted && profile) {
          setUserRole(profile.role);
        }
      } else {
        setUserRole(null);
      }
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Logout notice:', err);
    }
    setSession(null);
    setUserRole(null);
    setWalletEmail('');
    try {
      localStorage.removeItem('wg_wallet_email');
      localStorage.removeItem('wg_user_email');
      localStorage.removeItem('wg_user_role');
      localStorage.removeItem('gd_auth_user');
    } catch {
      // ignore
    }
    navigate('/');
  };


  const isActive = (path) => location.pathname === path;

  // Header State Logic: Canonical 10-Role Architecture
  let fallbackEmail = '';
  if (typeof window !== 'undefined') {
    fallbackEmail = safeGetItem('wg_wallet_email') || safeGetItem('wg_user_email') || '';
    if (!fallbackEmail) {
      try {
        const gd = JSON.parse(safeGetItem('gd_auth_user') || '{}');
        if (gd && gd.email) fallbackEmail = gd.email;
      } catch (_) {}
    }
  }
  const hasVerifiedSession = Boolean(session?.user?.email);
  const loginEmail = session?.user?.email || walletEmail || fallbackEmail || '';
  const currentRole = resolveUserRole(loginEmail, userRole, portalRole, hasVerifiedSession);
  const isLoggedOut = currentRole === ROLES.GUEST;
  const roleDisplay = getRoleDisplay(currentRole);
  const roleHome = getRoleHome(currentRole);

  const isStaff = canAccessStaffTools(currentRole); // Editorial, Admin, Super Admin
  const isSysAdmin = canAccessAdminTools(currentRole); // Admin, Super Admin
  const isMerchant = canAccessRedemption(currentRole); // Merchant, Merchant Staff, Admin, Super Admin
  const isResident = canAccessWallet(currentRole); // Resident, Admin, Super Admin
  const isSubmitter = canAccessSubmit(currentRole); // Submitter, Vendor, Editorial, Admin, Super Admin

  const getRoleInfo = () => {
    if (isLoggedOut) return null;
    return {
      label: roleDisplay.label,
      shortLabel: roleDisplay.shortLabel,
      badgeClass: roleDisplay.badgeClass,
      dotClass: roleDisplay.dotClass,
      link: roleHome,
      linkText: `${roleDisplay.shortLabel} Portal`,
    };
  };

  const roleInfo = getRoleInfo();

  const toggleParent = (section) => {
    setExpandedParent(expandedParent === section ? null : section);
  };

  return (
    <header className="sticky top-0 z-50 w-full">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:rounded-xl focus:bg-lake-900 focus:text-white focus:font-bold focus:shadow-lg">Skip to main content</a>
      {/* Soft Launch Announcement Ticker (accessible CSS replacement for legacy <marquee>) */}
      <div className="w-full max-w-full bg-lake-950 text-sun-200 overflow-hidden py-1.5 select-none flex items-center min-h-[28px]" role="region" aria-label="Site announcement">
        <div className="wg-ticker">
          <span className="wg-ticker-track text-[14px] font-bold text-sun-200 leading-tight tracking-wide">
            Announcing the SOFT LAUNCH of WelcomeEG.ca. You are invited to create an account and publish your events, dining offers and local business sales, but be aware that during this time some features may change, be added or deleted. Please use the Bug Report to let us know of any errors or improvements you would like to see.
          </span>
        </div>
      </div>

      <nav className="bg-white/95 backdrop-blur border-b-4 border-coral-500 shadow-[0_8px_24px_-16px_rgba(8,43,69,0.35)] transition-all">
      {/* ========================================================================= */}
      {/* 1. PRIMARY TOP NAVIGATION BAR */}
      {/* Simplified: Image Logo • Community Newsletter • Welcome Hamper • Events • Sales • Join */}
      {/* ========================================================================= */}
      <div className="max-w-[1440px] w-full mx-auto flex items-center justify-between py-2.5 px-4 md:px-6 lg:px-6 xl:px-10 2xl:px-12 gap-2">
        <div className="flex items-center gap-3 md:gap-4 lg:gap-4 xl:gap-6 min-w-0">
          {/* Brand Image Logo Only */}
          <Link 
            to="/" 
            className="flex items-center shrink-0"
          >
            <img
              src="/welcome-eg-logo.svg"
              alt="Welcome East Gwillimbury"
              className="h-8 sm:h-9 md:h-10 lg:h-11 w-auto"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
          </Link>

          {/* Left-Aligned Links Directly Beside Logo on Desktop (>= 1025px): Events • Newsletter • Weather • News */}
          <div className="hidden min-[1025px]:flex items-center gap-0.5 xl:gap-1 text-[13px] xl:text-[14px] 2xl:text-[15px] font-bold text-lake-900 whitespace-nowrap">
            <Link
              to="/events"
              className={`px-2.5 xl:px-3 py-2.5 rounded-full transition-colors hover:bg-lake-50 whitespace-nowrap ${
                location.pathname === '/events'
                  ? 'bg-lake-800 text-white hover:bg-lake-800'
                  : 'text-lake-900'
              }`}
            >
              Events
            </Link>

            <Link
              to="/dining"
              className={`px-2.5 xl:px-3 py-2.5 rounded-full transition-colors hover:bg-lake-50 whitespace-nowrap ${
                location.pathname.startsWith('/dining')
                  ? 'bg-lake-800 text-white hover:bg-lake-800'
                  : 'text-lake-900'
              }`}
            >
              Dining
            </Link>

            <Link
              to="/sales"
              className={`px-2.5 xl:px-3 py-2.5 rounded-full transition-colors hover:bg-lake-50 whitespace-nowrap ${
                location.pathname.startsWith('/sales')
                  ? 'bg-lake-800 text-white hover:bg-lake-800'
                  : 'text-lake-900'
              }`}
            >
              Sales
            </Link>

            <Link
              to="/directory"
              className={`px-2.5 xl:px-3 py-2.5 rounded-full transition-colors hover:bg-lake-50 whitespace-nowrap ${
                location.pathname.startsWith('/directory')
                  ? 'bg-lake-800 text-white hover:bg-lake-800'
                  : 'text-lake-900'
              }`}
            >
              Businesses
            </Link>

            <Link
              to="/weather"
              className={`px-2.5 xl:px-3 py-2.5 rounded-full transition-colors hover:bg-lake-50 flex items-center gap-1 whitespace-nowrap ${
                location.pathname.startsWith('/weather')
                  ? 'bg-lake-800 text-white hover:bg-lake-800'
                  : 'text-lake-900'
              }`}
            >
              <Sun className="w-4 h-4 text-sun-500 shrink-0" aria-hidden="true" />
              <span>Weather</span>
            </Link>

            {/* Hamper with Dropdown: Parent of The Welcome Hamper, Digital Wallet, Merchant Redemption */}
            <div 
              className="relative"
              onMouseEnter={() => setHamperMenuOpen(true)}
              onMouseLeave={() => setHamperMenuOpen(false)}
            >
              <a
                href="/hamper/"
                onClick={() => setHamperMenuOpen(false)}
                className={`transition-colors hover:bg-lake-50 inline-flex items-center gap-1 cursor-pointer border-0 px-2.5 xl:px-3 py-2.5 rounded-full font-bold text-sm xl:text-[15px] ${
                  location.pathname.startsWith('/hamper') || location.pathname === '/wallet' || location.pathname === '/claim' || location.pathname === '/verify'
                    ? 'bg-lake-800 text-white hover:bg-lake-800'
                    : 'text-lake-900'
                }`}
              >
                <span>Hamper</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${hamperMenuOpen ? 'rotate-180 text-coral-600' : 'text-lake-400'}`} />
              </a>

              {hamperMenuOpen && (
                <div className="absolute left-0 top-full pt-1.5 w-72 z-50 animate-fadeIn before:absolute before:-top-3 before:left-0 before:w-full before:h-3">
                  <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-2">
                    <a
                      href="/hamper/"
                      onClick={() => setHamperMenuOpen(false)}
                      className="flex flex-col p-2.5 rounded-xl hover:bg-blue-50 transition-colors group"
                    >
                      <span className="text-xs font-black text-[#00008b] group-hover:underline">
                        The Welcome Hamper &rarr;
                      </span>
                      <span className="text-[11px] text-gray-500 font-medium">
                        New resident program &amp; application
                      </span>
                    </a>

                    <div className="border-t border-gray-100 my-1" />

                    <a
                      href="/hamper/wallet.html"
                      onClick={() => setHamperMenuOpen(false)}
                      className="flex flex-col p-2.5 rounded-xl hover:bg-blue-50 transition-colors group"
                    >
                      <span className="text-xs font-black text-gray-800 group-hover:text-[#00008b] group-hover:underline">
                        Resident Digital Wallet &rarr;
                      </span>
                      <span className="text-[11px] text-gray-500 font-medium">
                        View coupons, QR codes &amp; 6-digit codes
                      </span>
                    </a>

                    <div className="border-t border-gray-100 my-1" />

                    <a
                      href="/hamper/redeem.html"
                      onClick={() => setHamperMenuOpen(false)}
                      className="flex flex-col p-2.5 rounded-xl hover:bg-blue-50 transition-colors group"
                    >
                      <span className="text-xs font-black text-gray-800 group-hover:text-[#00008b] group-hover:underline">
                        Redemptions &rarr;
                      </span>
                      <span className="text-[11px] text-gray-500 font-medium">
                        Redeem Welcome Hamper coupon codes
                      </span>
                    </a>

                    <div className="border-t border-gray-100 my-1" />

                    <a
                      href="/hamper/apply.html"
                      onClick={() => setHamperMenuOpen(false)}
                      className="flex flex-col p-2.5 rounded-xl hover:bg-blue-50 transition-colors group"
                    >
                      <span className="text-xs font-black text-gray-800 group-hover:text-[#00008b] group-hover:underline">
                        Business Hamper Application &rarr;
                      </span>
                      <span className="text-[11px] text-gray-500 font-medium">
                        Submit your business info &amp; newcomer offer
                      </span>
                    </a>

                    <div className="border-t border-gray-100 my-1" />

                    <Link
                      to="/advertise"
                      onClick={() => setHamperMenuOpen(false)}
                      className="flex flex-col p-2.5 rounded-xl hover:bg-blue-50 transition-colors group"
                    >
                      <span className="text-xs font-black text-gray-800 group-hover:text-[#00008b] group-hover:underline">
                        Advertise here &rarr;
                      </span>
                      <span className="text-[11px] text-gray-500 font-medium">
                        Sponsor Quick Search keywords on Welcome East Gwillimbury
                      </span>
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* News with Dropdown: Parent of Community Newsroom, Subscribe to Newsletter, Past Editions & Archives */}
            <div 
              className="relative"
              onMouseEnter={() => setNewsMenuOpen(true)}
              onMouseLeave={() => setNewsMenuOpen(false)}
            >
              <a
                href="/news/newsroom.html"
                onClick={() => setNewsMenuOpen(false)}
                className={`transition-colors hover:bg-lake-50 inline-flex items-center gap-1 cursor-pointer border-0 px-2.5 xl:px-3 py-2.5 rounded-full font-bold text-sm xl:text-[15px] ${
                  location.pathname.startsWith('/news') || location.pathname === '/subscribe' || location.pathname === '/newsletter'
                    ? 'bg-lake-800 text-white hover:bg-lake-800'
                    : 'text-lake-900'
                }`}
              >
                <span>News</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${newsMenuOpen ? 'rotate-180 text-coral-600' : 'text-lake-400'}`} />
              </a>

              {newsMenuOpen && (
                <div className="absolute left-0 top-full pt-1.5 w-64 z-50 animate-fadeIn before:absolute before:-top-3 before:left-0 before:w-full before:h-3">
                  <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-2">
                    <a
                      href="/news/newsroom.html"
                      onClick={() => setNewsMenuOpen(false)}
                      className="flex flex-col p-2.5 rounded-xl hover:bg-blue-50 transition-colors group"
                    >
                      <span className="text-xs font-black text-[#00008b] group-hover:underline">
                        Community Newsroom &rarr;
                      </span>
                      <span className="text-[11px] text-gray-500 font-medium">
                        Local community news &amp; announcements
                      </span>
                    </a>

                    <div className="border-t border-gray-100 my-1" />

                    <Link
                      to="/press"
                      onClick={() => setNewsMenuOpen(false)}
                      className="flex flex-col p-2.5 rounded-xl hover:bg-blue-50 transition-colors group"
                    >
                      <span className="text-xs font-black text-gray-800 group-hover:text-[#00008b] group-hover:underline">
                        Press Releases &rarr;
                      </span>
                      <span className="text-[11px] text-gray-500 font-medium">
                        Verified local business citations &amp; pressroom
                      </span>
                    </Link>

                    <div className="border-t border-gray-100 my-1" />

                    <Link
                      to="/subscribe"
                      onClick={() => setNewsMenuOpen(false)}
                      className="flex flex-col p-2.5 rounded-xl hover:bg-blue-50 transition-colors group"
                    >
                      <span className="text-xs font-black text-gray-800 group-hover:text-[#00008b] group-hover:underline">
                        Subscribe to Newsletter &rarr;
                      </span>
                      <span className="text-[11px] text-gray-500 font-medium">
                        Weekly local updates direct to your inbox
                      </span>
                    </Link>

                    <div className="border-t border-gray-100 my-1" />

                    <Link
                      to="/newsletter"
                      onClick={() => setNewsMenuOpen(false)}
                      className="flex flex-col p-2.5 rounded-xl hover:bg-blue-50 transition-colors group"
                    >
                      <span className="text-xs font-black text-gray-800 group-hover:text-[#00008b] group-hover:underline">
                        Past Editions &amp; Archives &rarr;
                      </span>
                      <span className="text-[11px] text-gray-500 font-medium">
                        Read previous weekly community issues
                      </span>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* DESKTOP RIGHT CONTROLS (>= 1025px): RIGHT-ALIGNED LOGIN BUTTON + ACCOUNT  */}
        {/* ========================================================================= */}
        <div className="hidden min-[1025px]:flex items-center gap-2 xl:gap-3 shrink-0">
          <Link
            to="/subscribe"
            className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-full bg-coral-600 hover:bg-sun-400 text-white hover:text-lake-950 font-black text-xs uppercase tracking-wider shadow-pop-sm hover:-translate-y-0.5 transition-[transform,background-color,color] focus-ring-dark"
          >
            <Mail className="w-4 h-4" aria-hidden="true" />
            <span className="hidden 2xl:inline">Get the Newsletter</span>
            <span className="2xl:hidden">Newsletter</span>
          </Link>
          {isLoggedOut && (
            <Link
              to="/login"
              className="inline-flex items-center min-h-[44px] border-2 border-lake-800 text-lake-900 hover:bg-lake-800 hover:text-white font-black text-xs uppercase tracking-wider px-4 rounded-full transition-colors"
            >
              Login
            </Link>
          )}

          {!isLoggedOut && loginEmail && (
            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50/90 hover:bg-blue-100/90 border border-blue-200 text-[#00008b] text-xs font-bold transition-all shadow-xs cursor-pointer"
                  title={isStaff ? "Staff Operations & Account Menu" : "Account Menu"}
                >
                  <User className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="font-black text-[#00008b] max-w-[120px] truncate">{isStaff ? roleDisplay.shortLabel : 'My Account'}</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-blue-700 shrink-0 transition-transform ${accountMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {accountMenuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setAccountMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 py-3 z-40 text-left animate-in fade-in zoom-in-95">
                    {/* Account Header */}
                    <div className="px-4 pb-3 border-b border-slate-100">
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Signed In Account</p>
                      <p className="text-xs font-black text-slate-900 truncate mt-0.5" title={loginEmail}>{loginEmail}</p>
                      <div className="mt-2">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${roleInfo.badgeClass}`}>
                          {roleInfo.label}
                        </span>
                      </div>
                    </div>

                    {/* STAFF MENU: one link per destination (see utils/staffMenu.js) */}
                    {isStaff && (
                      <div className="max-h-[70vh] overflow-y-auto border-b border-slate-100">
                        <div className="px-4 pt-2 pb-1 text-[10.5px] font-black uppercase tracking-wider text-blue-900 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <Shield className="w-3.5 h-3.5 text-blue-700" />
                            Staff Operations &amp; Queues
                          </span>
                          <span className="bg-blue-100 text-blue-900 text-[9px] px-1.5 py-0.5 rounded font-black">
                            {roleDisplay.shortLabel.toUpperCase()}
                          </span>
                        </div>
                        {staffMenuFor(isSysAdmin).map((group) => {
                          const isGroupOpen = expandedAdminGroup === group.title;
                          return (
                            <div key={group.title} className="border-t border-slate-100">
                              <button
                                type="button"
                                onClick={() => setExpandedAdminGroup(isGroupOpen ? null : group.title)}
                                aria-expanded={isGroupOpen}
                                className="w-full flex items-center justify-between px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-blue-900 hover:bg-slate-50 transition-colors cursor-pointer"
                              >
                                <span>{group.title}</span>
                                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isGroupOpen ? 'rotate-180' : ''}`} />
                              </button>
                              {isGroupOpen && (
                                <div className="pb-1">
                                  {group.items.map((item) => (
                                    isStaticStaffHref(item.href) ? (
                                      <a
                                        key={item.href}
                                        href={item.href}
                                        onClick={() => setAccountMenuOpen(false)}
                                        className="flex items-center min-h-[34px] px-4 py-1.5 text-xs font-bold text-gray-800 hover:bg-blue-50 hover:text-[#00008b] transition-colors"
                                      >
                                        {item.label}
                                      </a>
                                    ) : (
                                      <Link
                                        key={item.href}
                                        to={item.href}
                                        onClick={() => setAccountMenuOpen(false)}
                                        className="flex items-center min-h-[34px] px-4 py-1.5 text-xs font-bold text-gray-800 hover:bg-blue-50 hover:text-[#00008b] transition-colors"
                                      >
                                        {item.label}
                                      </Link>
                                    )
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Member Portal Shortcuts for non-staff roles */}
                    {!isStaff && (
                      <div className="p-2 space-y-1 text-xs font-bold border-b border-slate-100">
                        <Link
                          to="/my-submissions"
                          onClick={() => setAccountMenuOpen(false)}
                          className="w-full flex items-center justify-between p-2 rounded-xl bg-blue-50 text-[#00008b] hover:bg-blue-100 transition-colors"
                        >
                          <span>My Submissions</span>
                          <span className="text-[#00008b]">&rsaquo;</span>
                        </Link>
                        {userRole && (
                          <a
                            href="/staff/admin-approvals.html"
                            className="w-full flex items-center justify-between p-2 rounded-xl bg-blue-50 text-[#00008b] hover:bg-blue-100 transition-colors"
                          >
                            <span>Staff Approvals</span>
                            <span className="text-[#00008b]">&rsaquo;</span>
                          </a>
                        )}
                      </div>
                    )}

                    {/* General Portal Hub & Session Controls */}
                    <div className="px-4 pt-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          to="/login"
                          onClick={() => setAccountMenuOpen(false)}
                          className="text-[11px] font-bold text-slate-500 hover:text-slate-900"
                        >
                          Switch Account
                        </Link>
                        <button
                          type="button"
                          onClick={handleLogout}
                          className="text-[11px] font-black text-rose-600 hover:text-rose-800 cursor-pointer"
                        >
                          Log Out
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

          </div>
        )}
        </div>

        {/* TABLET & MOBILE RIGHT CONTROLS (<= 1024px): HAMBURGER TOGGLE (+ STAFF APPROVALS BADGE) */}
        <div className="flex flex-1 sm:flex-initial min-[1025px]:hidden items-center justify-center sm:justify-end gap-2 sm:mr-2">
          <Link
            to="/subscribe"
            className="hidden sm:inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full bg-coral-600 hover:bg-sun-400 text-white hover:text-lake-950 font-black text-xs uppercase tracking-wider transition-colors focus-ring-dark"
          >
            <Mail className="w-4 h-4" aria-hidden="true" />
            <span>Subscribe</span>
          </Link>
          {!isLoggedOut && isStaff && (
            <a
              href="/staff/admin-approvals.html"
              className="bg-blue-50 text-[#00008b] border border-blue-200 font-black text-[11px] uppercase px-2.5 py-1 rounded-lg shadow-xs"
            >
              Approvals
            </a>
          )}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="wg-hamburger-tick w-12 h-12 inline-flex items-center justify-center rounded-full text-white bg-lake-800 hover:bg-lake-700 transition-colors cursor-pointer shrink-0"
            aria-label="Open Navigation Drawer"
          >
            <Menu className="w-[26px] h-[26px]" strokeWidth={2.4} />
          </button>
        </div>
      </div>



      {/* ========================================================================= */}
      {/* 3. TABLET & MOBILE SLIDE-OUT DRAWER (SLIDES FROM RIGHT EDGE ON <= 1024px) */}
      {/* ========================================================================= */}
      {/* Rendered into <body> via a portal so no page overlay / sticky stacking context can sit on top of it */}
      {mobileMenuOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[10000] min-[1025px]:hidden">
          {/* Dark Backdrop */}
          <div
            className="fixed inset-0 z-0 bg-black/60 backdrop-blur-xs transition-opacity animate-fadeIn"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer Panel on Right */}
          <div className="fixed inset-y-0 right-0 w-80 max-w-[85vw] bg-white shadow-2xl flex flex-col overflow-y-auto overscroll-contain animate-in slide-in-from-right duration-300 z-10">
            {/* Drawer Header */}
            <div>
              <div className="p-4 border-b-4 border-coral-500 flex items-center justify-between bg-lake-50">
                <Link to="/" onClick={() => setMobileMenuOpen(false)} className="inline-block hover:opacity-90 transition-opacity">
                  <img
                    src="/welcome-eg-logo.svg"
                    alt="Welcome East Gwillimbury"
                    className="h-8 w-auto"
                  />
                </Link>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-11 h-11 inline-flex items-center justify-center text-lake-900 rounded-full bg-white border border-lake-200 hover:bg-lake-100 cursor-pointer"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* FIRST LINK IN MENU STACK: Login / Log Out + Account Pill */}
              <div className="px-4 pt-4 pb-2">
                {(!isLoggedOut || session || walletEmail) ? (
                  <div className="space-y-2">
                    {loginEmail && roleInfo && (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${roleInfo.badgeClass}`}>
                            {roleInfo.label}
                          </span>
                        </div>
                        <p className="text-slate-900 font-extrabold truncate text-xs">✓ {loginEmail}</p>
                        <div className="pt-0.5 flex flex-col gap-1">
                          <Link
                            to="/my-submissions"
                            onClick={() => setMobileMenuOpen(false)}
                            className="text-xs font-black text-[#00008b] underline"
                          >
                            My Submissions &rarr;
                          </Link>
                          {(userRole || isStaff) && (
                            <a
                              href="/staff/admin-approvals.html"
                              onClick={() => setMobileMenuOpen(false)}
                              className="text-xs font-black text-[#00008b] underline"
                            >
                              Staff Approvals &rarr;
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        handleLogout();
                      }}
                      className="block w-full text-center p-3 rounded-xl font-black text-xs uppercase tracking-wider bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-colors cursor-pointer"
                    >
                      Log Out
                    </button>
                  </div>
                ) : (
                  <Link
                    to="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block w-full text-center p-3.5 rounded-full font-black text-sm uppercase tracking-wider bg-lake-800 text-white hover:bg-lake-700 transition-colors"
                  >
                    Login
                  </Link>
                )}
              </div>

              {/* Submit link, shown to everyone (signed in or not) */}
              <div className="px-4 pb-2">
                <Link
                  to="/my-submissions"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 min-h-[48px] rounded-2xl bg-coral-600 hover:bg-coral-700 text-white font-black text-sm transition-colors"
                >
                  <Store className="w-5 h-5 shrink-0" aria-hidden="true" />
                  <span>Submit an event, sale or dining special</span>
                </Link>
              </div>

              {/* Navigation Menu Stack */}
              <div className="p-4 space-y-2 text-sm font-bold border-b border-gray-100">
                <Link
                  to="/events"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 min-h-[48px] rounded-2xl text-base transition-colors ${
                    location.pathname === '/events'
                      ? 'bg-lake-800 text-white font-black [&>svg]:text-sun-300'
                      : 'hover:bg-lake-50 text-lake-950'
                  }`}
                >
                  <Calendar className="w-5 h-5 text-coral-600" aria-hidden="true" />
                  <span>Events</span>
                </Link>

                <Link
                  to="/dining"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 min-h-[48px] rounded-2xl text-base transition-colors ${
                    location.pathname.startsWith('/dining')
                      ? 'bg-lake-800 text-white font-black [&>svg]:text-sun-300'
                      : 'hover:bg-lake-50 text-lake-950'
                  }`}
                >
                  <Utensils className="w-5 h-5 text-coral-600" aria-hidden="true" />
                  <span>Dining</span>
                </Link>

                <Link
                  to="/sales"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 min-h-[48px] rounded-2xl text-base transition-colors ${
                    location.pathname.startsWith('/sales')
                      ? 'bg-lake-800 text-white font-black [&>svg]:text-sun-300'
                      : 'hover:bg-lake-50 text-lake-950'
                  }`}
                >
                  <Tag className="w-5 h-5 text-coral-600" aria-hidden="true" />
                  <span>Sales</span>
                </Link>

                <Link
                  to="/directory"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 min-h-[48px] rounded-2xl text-base transition-colors ${
                    location.pathname.startsWith('/directory')
                      ? 'bg-lake-800 text-white font-black [&>svg]:text-sun-300'
                      : 'hover:bg-lake-50 text-lake-950'
                  }`}
                >
                  <Store className="w-5 h-5 text-coral-600" aria-hidden="true" />
                  <span>Businesses</span>
                </Link>

                <Link
                  to="/weather"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 min-h-[48px] rounded-2xl text-base transition-colors ${
                    location.pathname.startsWith('/weather')
                      ? 'bg-lake-800 text-white font-black [&>svg]:text-sun-300'
                      : 'hover:bg-lake-50 text-lake-950'
                  }`}
                >
                  <Sun className="w-4 h-4 text-amber-500" />
                  <span>Weather</span>
                </Link>

                <div>
                  <button
                    type="button"
                    onClick={() => toggleParent('hamper')}
                    className="w-full flex items-center justify-between px-3 min-h-[48px] rounded-2xl text-base hover:bg-lake-50 text-lake-950 font-bold cursor-pointer"
                  >
                    <span className="flex items-center gap-3">
                      <Gift className="w-5 h-5 text-coral-600" aria-hidden="true" />
                      <span>Hamper</span>
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${expandedParent === 'hamper' ? 'rotate-180 text-[#00008b]' : ''}`} />
                  </button>
                  {(expandedParent === 'hamper' || location.pathname.startsWith('/hamper') || location.pathname === '/wallet' || location.pathname === '/claim' || location.pathname === '/verify' || location.pathname === '/advertise') && (
                    <div className="pl-5 pt-1 pb-2 space-y-1">
                      <a
                        href="/hamper/"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center min-h-[44px] px-3 py-2 rounded-xl text-[16px] leading-snug text-[#00008b] font-bold hover:bg-lake-50 active:bg-lake-100"
                      >
                        &bull; The Welcome Hamper
                      </a>
                      <a
                        href="/hamper/wallet.html"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center min-h-[44px] px-3 py-2 rounded-xl text-[16px] leading-snug text-gray-800 font-bold hover:bg-lake-50 active:bg-lake-100"
                      >
                        &bull; Resident Digital Wallet
                      </a>
                      <a
                        href="/hamper/redeem.html"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center min-h-[44px] px-3 py-2 rounded-xl text-[16px] leading-snug text-gray-800 font-bold hover:bg-lake-50 active:bg-lake-100"
                      >
                        &bull; Redemptions
                      </a>
                      <a
                        href="/hamper/apply.html"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center min-h-[44px] px-3 py-2 rounded-xl text-[16px] leading-snug text-gray-800 font-bold hover:bg-lake-50 active:bg-lake-100"
                      >
                        &bull; Business Hamper Application
                      </a>
                      <Link
                        to="/advertise"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center min-h-[44px] px-3 py-2 rounded-xl text-[16px] leading-snug text-gray-800 font-bold hover:bg-lake-50 active:bg-lake-100"
                      >
                        &bull; Advertise here
                      </Link>
                    </div>
                  )}
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => toggleParent('news')}
                    className="w-full flex items-center justify-between px-3 min-h-[48px] rounded-2xl text-base hover:bg-lake-50 text-lake-950 font-bold cursor-pointer"
                  >
                    <span className="flex items-center gap-3">
                      <Newspaper className="w-5 h-5 text-coral-600" aria-hidden="true" />
                      <span>News</span>
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${expandedParent === 'news' ? 'rotate-180 text-[#00008b]' : ''}`} />
                  </button>
                  {(expandedParent === 'news' || location.pathname.startsWith('/news') || location.pathname === '/subscribe' || location.pathname === '/newsletter') && (
                    <div className="pl-5 pt-1 pb-2 space-y-1">
                      <a
                        href="/news/newsroom.html"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center min-h-[44px] px-3 py-2 rounded-xl text-[16px] leading-snug text-gray-800 font-bold hover:bg-lake-50 active:bg-lake-100"
                      >
                        &bull; Community Newsroom
                      </a>
                      <Link
                        to="/press"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center min-h-[44px] px-3 py-2 rounded-xl text-[16px] leading-snug text-gray-800 font-bold hover:bg-lake-50 active:bg-lake-100"
                      >
                        &bull; Press Releases
                      </Link>
                      <Link
                        to="/subscribe"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center min-h-[44px] px-3 py-2 rounded-xl text-[16px] leading-snug text-[#00008b] font-bold hover:bg-lake-50 active:bg-lake-100"
                      >
                        &bull; Subscribe to Newsletter
                      </Link>
                      <Link
                        to="/newsletter"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center min-h-[44px] px-3 py-2 rounded-xl text-[16px] leading-snug text-gray-700 font-bold hover:bg-lake-50 active:bg-lake-100"
                      >
                        &bull; Past Editions &amp; Archives
                      </Link>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-3 space-y-1">
                {isStaff && (
                  <div className="mt-1 bg-blue-50/70 p-3.5 rounded-2xl border border-blue-200 space-y-2">
                    <div className="text-[11px] font-black uppercase tracking-wider text-blue-950 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-blue-700" />
                        Staff Operations &amp; Tools
                      </span>
                      <span className="bg-blue-200 text-blue-950 text-[10px] px-2 py-0.5 rounded-full font-black">
                        {roleDisplay.shortLabel.toUpperCase()}
                      </span>
                    </div>
                    {staffMenuFor(isSysAdmin).map((group) => {
                      const isGroupOpen = expandedAdminGroup === group.title;
                      return (
                        <div key={group.title} className="rounded-xl border border-blue-200/80 bg-white overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setExpandedAdminGroup(isGroupOpen ? null : group.title)}
                            aria-expanded={isGroupOpen}
                            className="w-full flex items-center justify-between px-3 py-2.5 text-[11px] font-black uppercase tracking-wider text-blue-950 hover:bg-blue-50/70 transition-colors cursor-pointer"
                          >
                            <span>{group.title}</span>
                            <ChevronDown className={`w-4 h-4 text-blue-700 transition-transform ${isGroupOpen ? 'rotate-180' : ''}`} />
                          </button>
                          {isGroupOpen && (
                            <div className="p-2 pt-0 space-y-1 border-t border-blue-100">
                              {group.items.map((item) => (
                                isStaticStaffHref(item.href) ? (
                                  <a
                                    key={item.href}
                                    href={item.href}
                                    onClick={() => setMobileMenuOpen(false)}
                                    className="flex items-center min-h-[40px] px-2.5 py-2 rounded-lg font-bold text-xs text-gray-900 hover:bg-blue-50 hover:text-[#00008b] transition-all"
                                  >
                                    {item.label}
                                  </a>
                                ) : (
                                  <Link
                                    key={item.href}
                                    to={item.href}
                                    onClick={() => setMobileMenuOpen(false)}
                                    className="flex items-center min-h-[40px] px-2.5 py-2 rounded-lg font-bold text-xs text-gray-900 hover:bg-blue-50 hover:text-[#00008b] transition-all"
                                  >
                                    {item.label}
                                  </Link>
                                )
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </nav>
    </header>
  );
}
