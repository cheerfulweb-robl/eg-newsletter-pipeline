import React from 'react';

import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { 
  resolveUserRole, 
  ROLES, 
  canAccessSubmit, 
  canAccessWallet, 
  canAccessRedemption, 
  canAccessAdminTools 
} from './utils/roleAccess';

import Navbar from './components/Navbar.jsx';
import HeroGallery from './components/HeroGallery.jsx';
import MobileBottomNav from './components/MobileBottomNav.jsx';

// /admin lives outside the SPA (static staff portal), so leave React Router with a full page load.
function StaffPortalRedirect() {
  React.useEffect(() => { window.location.replace('/staff/admin-approvals.html'); }, []);
  return null;
}

// Hamper pages live outside the SPA under website/hamper/
function HamperRedirect({ to = '/hamper/' }) {
  React.useEffect(() => { window.location.replace(to); }, [to]);
  return null;
}
import Footer from './components/Footer.jsx';

import Home from './pages/Home.jsx';

import Privacy from './pages/Privacy.jsx';
import Contact from './pages/Contact.jsx';
import Advertise from './pages/Advertise.jsx';

import Terms from './pages/Terms.jsx';

import NewsletterArchive from './pages/NewsletterArchive.jsx';

import NewsletterSubscribe from './pages/NewsletterSubscribe.jsx';

import Pressroom from './pages/Pressroom.jsx';

import PressArticle from './pages/PressArticle.jsx';

import KnowledgeBase from './pages/KnowledgeBase.jsx';

import PortalLogin from './pages/PortalLogin.jsx';

import CreateAccount from './pages/CreateAccount.jsx';

import Sales from './pages/Sales.jsx';

import AllOffers from './pages/AllOffers.jsx';
import Directory from './pages/Directory.jsx';

import EventsCalendar from './pages/EventsCalendar.jsx';

import EventPartnerLogin from './pages/EventPartnerLogin.jsx';

import WeekendPlanner from './pages/WeekendPlanner.jsx';
import FeaturedEvents from './pages/FeaturedEvents.jsx';

import EventDetails from './pages/EventDetails.jsx';

import MultiSubmission from './pages/MultiSubmission.jsx';
import MerchantPortalRedirect from './pages/MerchantPortalRedirect.jsx';
import MySubmissions from './pages/MySubmissions.jsx';
import BusinessPage from './pages/BusinessPage.jsx';

import ResidentDiscovery from './pages/ResidentDiscovery.jsx';

import Newsroom from './pages/Newsroom.jsx';

import Corrections from './pages/Corrections.jsx';

import Dining from './pages/Dining.jsx';
import DiningDetails from './pages/DiningDetails.jsx';
import CommunityWeather from './pages/CommunityWeather.jsx';

import BugReportModal from './components/BugReportModal.jsx';
import ScrollToTop from './components/ScrollToTop.jsx';
import AskWgWidget from './components/AskWgWidget.jsx';




function ProtectedRoute({ children, checkPermission, fallbackPath = '/login' }) {
  const [loading, setLoading] = React.useState(true);
  const [allowed, setAllowed] = React.useState(false);
  const location = useLocation();

  React.useEffect(() => {
    let mounted = true;
    async function verify() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        let email = session?.user?.email || '';
        try {
          if (!email && typeof window !== 'undefined' && window.localStorage) {
            email = window.localStorage.getItem('wg_wallet_email') || window.localStorage.getItem('wg_user_email') || '';
          }
        } catch (_) {}

        let portalRole = '';
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            portalRole = window.localStorage.getItem('wg_user_role') || '';
          }
        } catch (_) {}

        let profileRole = '';
        if (session?.user?.id) {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('role')
            .eq('id', session.user.id)
            .maybeSingle();
          if (profile?.role) profileRole = profile.role;
        }

        const hasVerifiedSession = Boolean(session?.user?.email);
        const role = resolveUserRole(email, profileRole, portalRole, hasVerifiedSession);
        if (mounted) {
          const isPermitted = checkPermission ? checkPermission(role) : role !== ROLES.GUEST;
          setAllowed(isPermitted);
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setAllowed(false);
          setLoading(false);
        }
      }
    }
    verify();
    return () => { mounted = false; };
  }, [checkPermission]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00008b]"></div>
      </div>
    );
  }

  if (!allowed) {
    const target = fallbackPath.includes('?') 
      ? `${fallbackPath}&redirect=${encodeURIComponent(location.pathname)}` 
      : `${fallbackPath}?redirect=${encodeURIComponent(location.pathname)}`;
    return <Navigate to={target} replace />;
  }

  return children;
}

function App() {

  return (

    <Router>
      <ScrollToTop />
      <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-900 w-full max-w-full overflow-x-clip pb-16 lg:pb-0">

        <Navbar />
        <HeroGallery />

        <main id="main-content" className="flex-1 w-full min-w-0 flex flex-col overflow-x-clip max-w-full">

          <Routes>

            <Route path="/" element={<Home />} />

            <Route path="/discovery" element={<ResidentDiscovery />} />

            <Route path="/explore" element={<ResidentDiscovery />} />

            <Route path="/this-weekend" element={<WeekendPlanner />} />
            <Route path="/weekend" element={<WeekendPlanner />} />
            <Route path="/spotlight" element={<FeaturedEvents />} />
            <Route path="/featured" element={<FeaturedEvents />} />
            <Route path="/featured-events" element={<FeaturedEvents />} />

            <Route path="/offers" element={<AllOffers />} />

            <Route path="/directory" element={<Directory />} />
            <Route path="/businesses" element={<Navigate to="/directory" replace />} />
            <Route path="/businesses/:slug" element={<BusinessPage />} />
            <Route path="/weather" element={<CommunityWeather />} />
            <Route path="/weather/:community" element={<CommunityWeather />} />

            <Route path="/sales" element={<Sales />} />
            <Route path="/sales/:slug" element={<EventDetails />} />

            <Route path="/dining" element={<Dining />} />
            <Route path="/dining/:slug" element={<DiningDetails />} />

            <Route path="/restaurant" element={<Dining />} />
            <Route path="/restaurant/:slug" element={<DiningDetails />} />

            <Route path="/restaurants" element={<Dining />} />

            <Route path="/events" element={<EventsCalendar />} />

            <Route path="/events/:slug" element={<EventDetails />} />

            <Route path="/events/login" element={<EventPartnerLogin />} />

            <Route path="/events/login.html" element={<EventPartnerLogin />} />

            {/* Primary Navigation Paths */}
            <Route path="/calendar" element={<EventsCalendar />} />

            {/* Central Universal Login */}
            <Route path="/login" element={<PortalLogin />} />
            <Route path="/portals" element={<Navigate to="/login" replace />} />
            <Route path="/account" element={<Navigate to="/login" replace />} />
            <Route path="/join" element={<CreateAccount />} />
            <Route path="/register" element={<CreateAccount />} />
            <Route path="/signup" element={<CreateAccount />} />

            {/* Merchant Account Page (/merchant) */}
            <Route path="/my-submissions" element={<MySubmissions />} />
            <Route path="/merchant" element={<MerchantPortalRedirect />} />
            <Route path="/news/dashboard.html" element={<MerchantPortalRedirect />} />

            {/* Welcome Hamper & Digital Wallet Routes */}
            <Route path="/hamper" element={<HamperRedirect to="/hamper/" />} />
            <Route path="/hamper/*" element={<HamperRedirect to="/hamper/" />} />
            <Route path="/hamper-perks" element={<HamperRedirect to="/hamper/" />} />
            <Route path="/claim" element={<HamperRedirect to="/hamper/" />} />
            <Route path="/claim/*" element={<HamperRedirect to="/hamper/" />} />
            <Route path="/partner" element={<Navigate to="/partner" replace />} />
            <Route path="/wallet" element={<HamperRedirect to="/hamper/wallet.html" />} />
            <Route path="/wallet/*" element={<HamperRedirect to="/hamper/wallet.html" />} />
            <Route path="/verify" element={<HamperRedirect to="/hamper/redeem.html" />} />
            <Route path="/verify/*" element={<HamperRedirect to="/hamper/redeem.html" />} />
            <Route path="/redeem" element={<HamperRedirect to="/hamper/redeem.html" />} />
            <Route path="/redemption" element={<HamperRedirect to="/hamper/redeem.html" />} />

            {/* Event Submission Routes */}
            <Route path="/submission" element={<MultiSubmission />} />
            <Route path="/submission/:tab" element={<MultiSubmission />} />
            <Route path="/submit" element={<Navigate to="/submission?tab=events" replace />} />
            <Route path="/submit/event" element={<Navigate to="/submission?tab=events" replace />} />
            <Route path="/submit/events" element={<Navigate to="/submission?tab=events" replace />} />
            <Route path="/submit-event" element={<Navigate to="/submission?tab=events" replace />} />
            <Route path="/post-listing" element={<Navigate to="/submission?tab=events" replace />} />

            <Route path="/newsletter" element={<NewsletterArchive />} />

            <Route path="/editions" element={<NewsletterArchive />} />

            <Route path="/subscribe" element={<NewsletterSubscribe />} />

            <Route path="/newsroom" element={<Newsroom />} />
            <Route path="/news/newsroom.html" element={<Newsroom />} />
            <Route path="/news/newsroom" element={<Newsroom />} />

            <Route path="/corrections" element={<Corrections />} />

            <Route path="/press" element={<Pressroom />} />

            <Route path="/press/:slug" element={<PressArticle />} />

            <Route path="/knowledge-base" element={<KnowledgeBase />} />

            <Route path="/advertise" element={<Advertise />} />
            <Route path="/sponsor-search" element={<Advertise />} />

            <Route path="/privacy" element={<Privacy />} />

            <Route path="/contact" element={<Contact />} />

            <Route path="/terms" element={<Terms />} />

            <Route path="/admin" element={<StaffPortalRedirect />} />

          </Routes>

        </main>



        {/* Sleek, Compact Footer with Mobile/Tablet Accordion */}
        <Footer />
        <MobileBottomNav />
        <BugReportModal />
        <AskWgWidget />

      </div>

    </Router>

  );

}



export default App;

