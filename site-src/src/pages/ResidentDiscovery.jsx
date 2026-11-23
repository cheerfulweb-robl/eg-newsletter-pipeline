import React, { useState, useEffect, useMemo, useRef } from 'react';

import { safeHref, PUBLIC_LISTING_COLUMNS, detailPath, businessPath, notEndedFilter, recordSearchClick } from '../utils/links';
import { CARD_SHELL_CLASS, getCardStripeClass } from '../utils/cardStyles';

import { Link, useSearchParams } from 'react-router-dom';
import { matchesQuery, filterByQuery } from '../utils/fuzzySearch.js';

import { MapContainer, TileLayer, Circle, Marker, Popup } from 'react-leaflet';

import 'leaflet/dist/leaflet.css';

import QRCode from 'qrcode';

import { supabase } from '../supabaseClient';

import {

  Search,

  Calendar as CalendarIcon,

  MapPin,

  Clock,

  Sparkles,

  Tag,

  Bookmark,

  ExternalLink,

  ChevronRight,

  Filter,

  X,

  Share2,

  Gift,

  Percent,

  CheckCircle2,

  AlertCircle,

  Eye,

  SlidersHorizontal,

  Compass,

  ArrowRight,

  Building2,

  Newspaper,

  Phone,

  Utensils

} from 'lucide-react';

import {

  formatDDMonthYYYY,

  DISCOVERY_CATEGORIES,

  GEORGINA_COMMUNITIES,

  parseToMidnight,

  getTorontoTodayMidnight,

  isToday,

  isTomorrow,

  isThisWeekend,

  isNext7Days,

  isThisMonth,

  isEndingSoon,

  isExpired,
  isListingExpired,
  formatEventScheduleDisplay,

  generateSlug,

  isItemSaved,

  toggleSaveItem,

  getSavedItems,

  downloadEventIcs,

  formatCategoryLabel,

  formatPhoneNumber

} from '../services/discoveryService';



// Verified coordinates for East Gwillimbury map locations







const VENUE_COORDINATES = {







  'The Link': [44.301, -79.362],







  'East Gwillimbury Ice Palace': [44.225, -79.445],







  'Stephen Leacock Theatre': [44.229, -79.448],







  'Mount Albert Legion': [44.306, -79.358],







  'Mount Albert Fairgrounds': [44.304, -79.353],







  'Art Gallery of East Gwillimbury': [44.305, -79.356],







  'East Gwillimbury Civic Centre': [44.221, -79.420],







  'Holland Landing Waterfront': [44.228, -79.465],







  'Jackson\'s Point Harbor': [44.325, -79.340]

};



const CURATED_NEWS_ARCHIVE = [

  {

    id: "gp-nov08",

    title: "East Gwillimbury kids help inspire a global movement",

    business_name: "The NewmarketToday",

    event_date_label: "Nov 08, 2026",

    event_start_date: "2026-11-08",

    summary: "By Ewa Chwojko-Srawley: A real chicken, a group of curious campers and a question about the future helped spark an idea that is now reaching children around the world.",

    link: "https://georginapost.com/2026/11/08/georgina-kids-help-inspire-a-global-movement/",

    category: "Local News"

  },

  {

    id: "gp-nov05-1",

    title: "York Regional Police launches Project Fallback",

    business_name: "The NewmarketToday",

    event_date_label: "Nov 05, 2026",

    event_start_date: "2026-11-05",

    summary: "Community safety awareness initiative launched across East Gwillimbury and York Region to combat auto theft and promote residential crime prevention.",

    link: "https://georginapost.com",

    category: "Local News"

  },

  {

    id: "gp-nov05-2",

    title: "QuestBus out of service indefinitely after second fire destroys vehicle",

    business_name: "The NewmarketToday",

    event_date_label: "Nov 05, 2026",

    event_start_date: "2026-11-05",

    summary: "Community transit service for local seniors and youth temporarily halted after vehicle damage.",

    link: "https://georginapost.com",

    category: "Local News"

  },

  {

    id: "tg-oct29-1",

    title: "Marking Remembrance Day and more this November in East Gwillimbury",

    business_name: "Town of East Gwillimbury",

    event_date_label: "Oct 29, 2026",

    event_start_date: "2026-10-29",

    summary: "Town of East Gwillimbury municipal update on Remembrance Day ceremonies, municipal office closures, and seasonal recreation programs.",

    link: "https://georgina.ca",

    category: "Municipal News"

  }

];















export default function ResidentDiscovery() {







  const [searchParams, setSearchParams] = useSearchParams();















  // Primary State







  const activeTab = searchParams.get('tab') || 'events'; // 'events', 'sales', 'offers'







  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');







  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get('q') || '');

  // A search shows every match on one page (events and sales together), with no tabs to hide results.

  const searchMode = Boolean(debouncedSearch.trim()) && activeTab !== 'offers';







  const [selectedLocation, setSelectedLocation] = useState(searchParams.get('loc') || 'All East Gwillimbury');







  const [selectedDateFilter, setSelectedDateFilter] = useState(searchParams.get('date') || 'all');







  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('cat') || 'All');

  const [includePast, setIncludePast] = useState(searchParams.get('past') === '1');







  const [viewMode, setViewMode] = useState(searchParams.get('view') || 'list'); // 'list', 'calendar', 'map'







  const [showSavedDrawer, setShowSavedDrawer] = useState(false);















  // Data State

  const [eventsList, setEventsList] = useState([]);

  const [salesList, setSalesList] = useState([]);

  const [diningList, setDiningList] = useState([]);

  const [businessesList, setBusinessesList] = useState([]);

  const [newsList, setNewsList] = useState([]);

  const [walletCoupons, setWalletCoupons] = useState([]);

  const [wallet, setWallet] = useState(null);







  const [loading, setLoading] = useState(true);







  const [savedUpdate, setSavedUpdate] = useState(0);















  // Auth & Wallet Login State







  const [userEmail, setUserEmail] = useState(() => {







    try {







      return localStorage.getItem('wg_wallet_email') || '';







    } catch {







      return '';







    }







  });







  const [loginInputEmail, setLoginInputEmail] = useState('');







  const [loginSending, setLoginSending] = useState(false);







  const [loginNotice, setLoginNotice] = useState('');















  // Presentation Modal State (Wallet QR code)







  const [presentingCoupon, setPresentingCoupon] = useState(null);







  const [qrDataUrl, setQrDataUrl] = useState('');







  const [countdownSeconds, setCountdownSeconds] = useState(180);







  const timerRef = useRef(null);















  // Debounce search input (300ms)







  useEffect(() => {







    const handler = setTimeout(() => {







      setDebouncedSearch(searchTerm);







    }, 300);







    return () => clearTimeout(handler);







  }, [searchTerm]);

  const loggedSearchesRef = useRef(new Set());
  useEffect(() => {
    const q = debouncedSearch.trim();
    if (q.length < 2) return;
    const key = q.toLowerCase();
    if (loggedSearchesRef.current.has(key)) return;
    loggedSearchesRef.current.add(key);
    recordSearchClick(supabase, {
      query: q,
      title: `Search: ${q}`,
      business: 'Search Results',
      targetUrl: `/discovery?q=${encodeURIComponent(q)}`,
      page: 'discovery',
    });
  }, [debouncedSearch]);















  // Sync state to URL params







  useEffect(() => {







    const p = new URLSearchParams();







    if (activeTab !== 'events') p.set('tab', activeTab);







    if (debouncedSearch.trim()) p.set('q', debouncedSearch.trim());







    if (selectedLocation !== 'All East Gwillimbury') p.set('loc', selectedLocation);







    if (selectedDateFilter !== 'all') p.set('date', selectedDateFilter);







    if (selectedCategory !== 'All') p.set('cat', selectedCategory);







    if (viewMode !== 'list') p.set('view', viewMode);







    setSearchParams(p, { replace: true });







  }, [activeTab, debouncedSearch, selectedLocation, selectedDateFilter, selectedCategory, viewMode, setSearchParams]);















  // Fetch approved events & sales from Supabase







  useEffect(() => {







    let isMounted = true;







    async function loadDiscoveryData() {







      try {







        setLoading(true);















        // 1. Fetch businesses from directory_listings

        const { data: rawBusinesses } = await supabase

          .from('directory_listings')

          .select('*')

          .eq('status', 'approved')

          .order('name', { ascending: true });



        // 2. Fetch approved events, sales, dining, and news from vendor_events

        const { data: rawEvents } = await supabase

          .from('vendor_events')

          .select(PUBLIC_LISTING_COLUMNS)

          .eq('status', 'approved');



        // 3. Fetch published press articles

        const { data: rawPress } = await supabase

          .from('press_articles')

          .select('*')

          .eq('status', 'published')

          .order('published_at', { ascending: false });



        // 4. Fetch partner deals

        const { data: rawPartners } = await supabase

          .from('partners')

          .select('*')

          .in('status', ['Approved', 'is_example']);



        if (!isMounted) return;



        // Process Businesses

        let biz = [];

        if (rawBusinesses && rawBusinesses.length > 0) {

          biz = rawBusinesses.map(b => ({

            id: b.id,

            slug: b.slug,

            name: b.name || b.business_name || 'Local Business',

            category: b.category ? formatCategoryLabel(b.category) : 'Local Business',

            community: b.community || 'East Gwillimbury',

            location: b.location || (b.community ? `${b.community}, East Gwillimbury, ON` : 'East Gwillimbury, ON'),

            phone: b.phone || b.contact_phone || '',

            link: b.link || b.website || '',

            description: b.description || b.summary || ''

          }));

        } else if (rawEvents && rawEvents.length > 0) {

          const seen = new Set();

          (rawEvents || []).forEach(it => {

            const name = (it.business_name || '').trim();

            if (name && name.length > 2 && !seen.has(name.toLowerCase())) {

              seen.add(name.toLowerCase());

              biz.push({

                id: it.id,

                slug: it.slug || generateSlug(name, it.location),

                name: name,

                category: it.category ? formatCategoryLabel(it.category) : 'Local Business',

                community: it.community || 'East Gwillimbury',

                location: it.location || 'East Gwillimbury, ON',

                phone: it.contact_phone || '',

                link: it.link || '',

                description: it.summary || ''

              });

            }

          });

        }

        setBusinessesList(biz);



        // Process News

        const newsItems = [];

        const seenNewsTitles = new Set();



        (rawEvents || []).forEach(it => {

          const cat = String(it.category || '').toLowerCase().trim();

          if (['local_news', 'municipal_news', 'news', 'press_release'].includes(cat)) {

            const titleKey = (it.title || '').trim().toLowerCase();

            if (titleKey && !seenNewsTitles.has(titleKey)) {

              seenNewsTitles.add(titleKey);

              newsItems.push({

                id: it.id,

                title: it.title,

                business_name: it.business_name || 'Community News',

                location: it.location || 'East Gwillimbury, ON',

                event_date_label: it.event_date_label || 'Recent',

                event_start_date: it.event_start_date,

                summary: it.summary || '',

                link: it.link || '/news/newsroom.html',

                category: formatCategoryLabel(it.category || 'News')

              });

            }

          }

        });



        (rawPress || []).forEach(p => {

          const titleKey = (p.title || '').trim().toLowerCase();

          if (titleKey && !seenNewsTitles.has(titleKey)) {

            seenNewsTitles.add(titleKey);

            newsItems.push({

              id: p.id,

              title: p.title,

              business_name: p.business_name || 'Official Announcement',

              location: p.business_address || 'East Gwillimbury, ON',

              event_date_label: p.published_at ? new Date(p.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Official Press',

              event_start_date: p.published_at,

              summary: p.excerpt || p.content || '',

              link: `/press/${p.slug || p.id}`,

              category: 'Press Release'

            });

          }

        });



        // Add curated news stories from CURATED_NEWS_ARCHIVE

        (CURATED_NEWS_ARCHIVE || []).forEach(c => {

          const titleKey = (c.title || '').trim().toLowerCase();

          if (titleKey && !seenNewsTitles.has(titleKey)) {

            seenNewsTitles.add(titleKey);

            newsItems.push(c);

          }

        });



        setNewsList(newsItems);



        // Process Events, Dining, and Sales

        const evts = [];

        const dns = [];

        const sls = [];



        (rawEvents || []).forEach(item => {

          const cat = String(item.category || '').toLowerCase().trim();

          if (['local_news', 'municipal_news', 'news', 'press_release'].includes(cat)) return;

          const expired = isListingExpired(item);



          const isDining = ['dining', 'restaurant', 'food_and_drink', 'dining_deals'].includes(cat) || item.type === 'dining';

          const isSale = !isDining && (

            (item.title || item.summary || '').toLowerCase().includes('sale') ||

            (item.title || item.summary || '').toLowerCase().includes('discount') ||

            (item.title || item.summary || '').toLowerCase().includes('special') ||

            ['sale', 'sales', 'local_sales', 'special_sale', 'sales_deal'].includes(cat)

          );



          const formatted = {

            id: item.id,

            title: item.title,

            business_name: item.business_name || (isDining ? 'Local Restaurant' : 'Community Organizer'),

            organizer: item.business_name || (isDining ? 'Local Restaurant' : 'Community Organizer'),

            location: item.location || 'East Gwillimbury, ON',

            event_date_label: formatEventScheduleDisplay(item) || item.event_date_label || (isDining ? 'Dining Special' : 'See details'),
            is_expired: expired,

            event_start_date: item.event_start_date,

            expires_after: item.expires_after,

            category: item.category ? formatCategoryLabel(item.category) : (isDining ? 'Dining' : isSale ? 'Shopping' : 'Community'),

            price_text: isSale ? (item.price_text || 'Special Deal') : item.price_text || '',

            summary: item.summary || '',

            link: item.link || (isDining ? 'https://welcomeeg.ca/dining' : 'https://welcomeeg.ca'),

            source: 'listing',

            type: isDining ? 'dining' : isSale ? 'sale' : 'event',

            slug: item.slug || generateSlug(item.title, item.location),

            created_at: item.created_at

          };



          if (isDining) {

            dns.push(formatted);

          } else if (isSale) {

            sls.push(formatted);

          } else {

            evts.push(formatted);

          }

        });



        // Add partner deals to sales

        (rawPartners || []).forEach(p => {

          sls.push({

            id: p.id,

            title: p.offer_details || p.offer_b2c || 'Local Merchant Offer',

            business_name: p.business_name || 'Local Partner',

            organizer: p.business_name || 'Local Partner',

            location: p.location || 'East Gwillimbury, ON',

            event_date_label: 'Ongoing Welcome Offer',

            expires_after: null,

            category: p.category || 'Retail',

            price_text: p.tier === 'Hamper Sponsor' ? 'Featured Perk' : 'Merchant Special',

            summary: p.business_description || '',

            link: p.website_url || 'https://welcomeeg.ca/sales',

            source: 'partner',

            type: 'sale',

            slug: generateSlug(p.business_name, p.location),

            is_exclusive: p.target_audience === 'Residents Only',

            created_at: p.created_at

          });

        });



        setEventsList(evts);

        setDiningList(dns);

        setSalesList(sls);















        // Load wallet if user has email







        if (userEmail) {







          loadResidentWallet(userEmail);







        }







      } catch (err) {







        console.warn('Discovery load notice:', err);







      } finally {







        if (isMounted) setLoading(false);







      }







    }















    loadDiscoveryData();







    return () => { isMounted = false; };







  }, [userEmail]);















  // Load resident wallet & coupons







  const loadResidentWallet = async (email) => {







    try {







      const clean = email.toLowerCase().trim();







      const { data: wData } = await supabase







        .from('wallets')







        .select('*')







        .ilike('owner_email', clean)







        .maybeSingle();















      if (wData) {







        setWallet(wData);







        const { data: cData } = await supabase







          .from('coupons')







          .select('*')







          .eq('wallet_id', wData.id)







          .order('issued_at', { ascending: false });















        if (cData) {







          setWalletCoupons(cData);







        }







      }







    } catch (err) {







      console.warn('Wallet load notice:', err);







    }







  };















  const handleWalletLogin = async (e) => {







    e.preventDefault();







    if (!loginInputEmail.trim()) return;







    setLoginSending(true);







    setLoginNotice('');















    try {







      const clean = loginInputEmail.toLowerCase().trim();







      localStorage.setItem('wg_wallet_email', clean);







      setUserEmail(clean);







      await loadResidentWallet(clean);







      setLoginNotice(`âœ“ Signed in as ${clean}. Loaded resident perks.`);







    } catch (err) {







      console.error(err);







    } finally {







      setLoginSending(false);







    }







  };















  // Presentation Code Modal for resident wallet







  const handlePresentOffer = async (coupon) => {







    setPresentingCoupon(coupon);







    setCountdownSeconds(180);







    try {







      const { data: tokenResult } = await supabase.rpc('generate_presentation_token', {







        target_coupon_id: coupon.id







      });















      const code = tokenResult?.fallback_code || tokenResult?.token_code || `WG-${coupon.id.slice(0, 4).toUpperCase()}`;







      const qr = await QRCode.toDataURL(code, { width: 220, margin: 1, color: { dark: '#00008b' } });







      setQrDataUrl(qr);















      if (timerRef.current) clearInterval(timerRef.current);







      timerRef.current = setInterval(() => {







        setCountdownSeconds(prev => {







          if (prev <= 1) {







            clearInterval(timerRef.current);







            return 0;







          }







          return prev - 1;







        });







      }, 1000);







    } catch (err) {







      console.error(err);







    }







  };















  const closePresentation = () => {







    if (timerRef.current) clearInterval(timerRef.current);







    setPresentingCoupon(null);







    setQrDataUrl('');







  };















  // Filter items by search, location, date, category







  const applyFilters = (items, isSaleTab = false) => {







    const base = items.filter(it => {
      // 0. Exclude expired/past listings unless "Include past listings" is checked
      if (!includePast && it.is_expired) return false;







      // 1. Location







      if (selectedLocation !== 'All East Gwillimbury') {







        const loc = (it.location || '').toLowerCase();







        if (!loc.includes(selectedLocation.toLowerCase())) return false;







      }















      // 2. Category







      if (selectedCategory !== 'All') {







        if (selectedCategory === 'Free Events') {







          if (!(it.price_text || '').toLowerCase().includes('free')) return false;







        } else {







          const matchCat = (it.category || '').toLowerCase().includes(selectedCategory.toLowerCase()) ||







            (it.title || '').toLowerCase().includes(selectedCategory.toLowerCase());







          if (!matchCat) return false;







        }







      }















      // 3. Date Filter







      if (selectedDateFilter !== 'all') {







        if (selectedDateFilter === 'today' && !isToday(it.event_start_date)) return false;







        if (selectedDateFilter === 'tomorrow' && !isTomorrow(it.event_start_date)) return false;







        if (selectedDateFilter === 'weekend' && !isThisWeekend(it.event_start_date)) return false;







        if (selectedDateFilter === 'next7' && !isNext7Days(it.event_start_date)) return false;







        if (selectedDateFilter === 'month' && !isThisMonth(it.event_start_date)) return false;







      }
      return true;
    });
    if (!debouncedSearch.trim()) return base;
    return filterByQuery(base, debouncedSearch, (it) => `${it.title} ${it.business_name} ${it.organizer} ${it.summary} ${it.location} ${it.category}`);
  };















    const filteredEvents = useMemo(() => {

    const list = applyFilters(eventsList, false);

    // Sort earliest date first, to later dates (chronological ascending)

    return list.slice().sort((a, b) => {

      const dateA = parseToMidnight(a.event_start_date);

      const dateB = parseToMidnight(b.event_start_date);



      if (dateA && dateB) {

        if (dateA.getTime() !== dateB.getTime()) {

          return dateA.getTime() - dateB.getTime();

        }

        return (a.title || '').localeCompare(b.title || '');

      }

      if (dateA && !dateB) return -1;

      if (!dateA && dateB) return 1;

      return (a.title || '').localeCompare(b.title || '');

    });

  }, [eventsList, selectedLocation, selectedCategory, selectedDateFilter, debouncedSearch, includePast]);



  const filteredSales = useMemo(() => {

    const list = applyFilters(salesList, true);

    return list.slice().sort((a, b) => {

      const dateA = parseToMidnight(a.event_start_date);

      const dateB = parseToMidnight(b.event_start_date);



      if (dateA && dateB) {

        if (dateA.getTime() !== dateB.getTime()) {

          return dateA.getTime() - dateB.getTime();

        }

        return (a.title || '').localeCompare(b.title || '');

      }

      if (dateA && !dateB) return -1;

      if (!dateA && dateB) return 1;

      return (a.title || '').localeCompare(b.title || '');

    });

  }, [salesList, selectedLocation, selectedCategory, selectedDateFilter, debouncedSearch, includePast]);



  const filteredDining = useMemo(() => {

    const list = applyFilters(diningList, false);

    return list.slice().sort((a, b) => {

      const dateA = parseToMidnight(a.event_start_date);

      const dateB = parseToMidnight(b.event_start_date);

      if (dateA && dateB) {

        if (dateA.getTime() !== dateB.getTime()) {

          return dateA.getTime() - dateB.getTime();

        }

        return (a.title || '').localeCompare(b.title || '');

      }

      if (dateA && !dateB) return -1;

      if (!dateA && dateB) return 1;

      return (a.title || '').localeCompare(b.title || '');

    });

  }, [diningList, selectedLocation, selectedCategory, selectedDateFilter, debouncedSearch, includePast]);



  const filteredBusinesses = useMemo(() => {
    if (!debouncedSearch.trim()) return [];
    const byLoc = selectedLocation === 'All East Gwillimbury'
      ? businessesList
      : businessesList.filter(b => `${b.location} ${b.community}`.toLowerCase().includes(selectedLocation.toLowerCase()));
    return filterByQuery(byLoc, debouncedSearch, b => `${b.name} ${b.category} ${b.community} ${b.location} ${b.description}`);
  }, [businessesList, debouncedSearch, selectedLocation]);



  const filteredNews = useMemo(() => {
    if (!debouncedSearch.trim()) return [];
    return filterByQuery(newsList, debouncedSearch, n => `${n.title} ${n.business_name} ${n.summary} ${n.category}`);
  }, [newsList, debouncedSearch]);



  const totalMatches = filteredBusinesses.length + filteredEvents.length + filteredDining.length + filteredSales.length + filteredNews.length;















  const savedItems = useMemo(() => getSavedItems(), [savedUpdate]);















  const handleToggleBookmark = (item) => {







    toggleSaveItem(item);







    setSavedUpdate(c => c + 1);







  };















  const resetFilters = () => {







    setSearchTerm('');







    setDebouncedSearch('');







    setSelectedLocation('All East Gwillimbury');







    setSelectedDateFilter('all');
    setIncludePast(false);







    setSelectedCategory('All');







  };















  return (







    <div className="max-w-[1440px] w-full mx-auto px-4 md:px-8 lg:px-12 py-8">







      {/* ========================================================================= */}







      {/* 1. HEADER (AS SPECIFIED IN SECTION 2) */}







      {/* ========================================================================= */}







      {/* Header Banner — Design B East Gwillimbury Atmospheric Sunset */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-lake-950 via-lake-800 to-indigo-950 text-white p-8 sm:p-10 md:p-14 shadow-lift border border-lake-700/50 mb-8">
        <div className="absolute right-0 top-0 w-96 h-96 bg-sun-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 -bottom-10 w-80 h-80 bg-coral-500/10 rounded-full blur-3xl pointer-events-none" />

        <svg
          className="absolute -right-12 -bottom-16 w-[500px] h-[220px] text-white/[0.03] pointer-events-none select-none"
          viewBox="0 0 1440 320"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M0,192L48,197.3C96,203,192,213,288,192C384,171,480,117,576,122.7C672,128,768,192,864,208C960,224,1056,192,1152,165.3C1248,139,1344,117,1392,106.7L1440,96L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" />
        </svg>

        <div className="relative z-10 max-w-4xl">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-lake-900/80 border border-lake-600/70 text-sun-200 text-xs sm:text-sm font-bold mb-4 shadow-sm backdrop-blur-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-sun-400 animate-pulse" aria-hidden="true"></span>
            <span>Local Resident Discovery &bull; East Gwillimbury Community Hub</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight font-display text-white leading-[1.1] mb-4">
            Explore East Gwillimbury
          </h1>

          <p className="text-blue-100 text-sm sm:text-base md:text-lg font-medium leading-relaxed max-w-2xl">
            Discover more, shop local, and feel at home across Holland Landing, Mount Albert, Jackson&apos;s Point &amp; Queensville.
          </p>

          {/* Prominent Search Bar with Clear Button */}
          <div className={`relative mt-6 max-w-2xl ${activeTab === 'offers' ? 'hidden' : ''}`}>
            <Search className="w-5 h-5 text-lake-800 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search events, deals, dining, businesses in East Gwillimbury..."
              className="w-full h-14 pl-12 pr-12 rounded-2xl border-2 border-white/20 focus:border-sun-400 focus:ring-4 focus:ring-sun-400/20 text-sm md:text-base font-bold bg-white text-gray-900 shadow-lg transition-all"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>















      {/* ========================================================================= */}







      {/* 2. THREE PRIMARY TABS (EVENTS, LOCAL SALES, MY OFFERS) */}







      {/* ========================================================================= */}







      <div className={`flex border-b border-gray-200 mb-6 justify-center gap-2 sm:gap-6 ${searchMode ? 'hidden' : ''}`}>







        <button







          type="button"







          onClick={() => { const p = new URLSearchParams(searchParams); p.set('tab', 'events'); setSearchParams(p); }}







          className={`pb-4 px-4 sm:px-6 font-black text-sm sm:text-base border-b-2 transition-all flex items-center gap-2 ${







            activeTab === 'events'







              ? 'border-[#00008b] text-[#00008b]'







              : 'border-transparent text-gray-500 hover:text-gray-900'







          }`}







        >







          <CalendarIcon className="w-4 h-4" />







          <span>Events ({filteredEvents.length})</span>







        </button>















        <button







          type="button"







          onClick={() => { const p = new URLSearchParams(searchParams); p.set('tab', 'sales'); setSearchParams(p); }}







          className={`pb-4 px-4 sm:px-6 font-black text-sm sm:text-base border-b-2 transition-all flex items-center gap-2 ${







            activeTab === 'sales'







              ? 'border-[#00008b] text-[#00008b]'







              : 'border-transparent text-gray-500 hover:text-gray-900'







          }`}







        >







          <Percent className="w-4 h-4" />







          <span>Local Sales ({filteredSales.length})</span>







        </button>















        <button







          type="button"







          onClick={() => { const p = new URLSearchParams(searchParams); p.set('tab', 'offers'); setSearchParams(p); }}







          className={`pb-4 px-4 sm:px-6 font-black text-sm sm:text-base border-b-2 transition-all flex items-center gap-2 ${







            activeTab === 'offers'







              ? 'border-[#00008b] text-[#00008b]'







              : 'border-transparent text-gray-500 hover:text-gray-900'







          }`}







        >







          <Gift className="w-4 h-4" />







          <span>My Offers {walletCoupons.length > 0 && `(${walletCoupons.length})`}</span>







        </button>







      </div>















      {/* ========================================================================= */}







      {/* 3. FILTER CONTROLS & VIEW SWITCHER */}







      {/* ========================================================================= */}







      {activeTab !== 'offers' && (







        <div className="bg-white rounded-2xl border border-gray-200 p-4 md:p-5 shadow-xs mb-8 space-y-4">







          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">







            {/* Location Filter */}







            <div>







              <label className="text-[10.5px] font-black uppercase tracking-wider text-gray-500 block mb-1">







                Location Area:







              </label>







              <select







                value={selectedLocation}







                onChange={e => setSelectedLocation(e.target.value)}







                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-800 bg-gray-50 focus:outline-none focus:border-[#00008b]"







              >







                {GEORGINA_COMMUNITIES.map(c => (







                  <option key={c.name} value={c.name}>{c.name}</option>







                ))}







              </select>







            </div>















            {/* Date Filter */}







            <div>







              <label className="text-[10.5px] font-black uppercase tracking-wider text-gray-500 block mb-1">







                Date Range:







              </label>







              <select







                value={selectedDateFilter}







                onChange={e => setSelectedDateFilter(e.target.value)}







                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-800 bg-gray-50 focus:outline-none focus:border-[#00008b]"







              >







                <option value="all">Upcoming (Next 5 Weeks)</option>







                <option value="today">Today</option>







                <option value="tomorrow">Tomorrow</option>







                <option value="weekend">This Weekend</option>







                <option value="next7">Next 7 Days</option>







                <option value="month">This Month</option>







              </select>







            </div>















            {/* Category Filter */}







            <div>







              <label className="text-[10.5px] font-black uppercase tracking-wider text-gray-500 block mb-1">







                Category:







              </label>







              <select







                value={selectedCategory}







                onChange={e => setSelectedCategory(e.target.value)}







                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-800 bg-gray-50 focus:outline-none focus:border-[#00008b]"







              >







                {DISCOVERY_CATEGORIES.map(cat => (







                  <option key={cat} value={cat}>{cat}</option>







                ))}







              </select>







            </div>















            {/* View Switcher (List, Calendar, Map) */}







            <div>







              <label className="text-[10.5px] font-black uppercase tracking-wider text-gray-500 block mb-1">







                Viewing Mode:







              </label>







              <div className="flex rounded-xl bg-gray-100 p-1 border border-gray-200 text-xs font-black">







                <button







                  type="button"







                  onClick={() => setViewMode('list')}







                  className={`flex-1 py-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white text-[#00008b] shadow-xs' : 'text-gray-600'}`}







                >







                  List







                </button>







                <button







                  type="button"







                  onClick={() => setViewMode('calendar')}







                  className={`flex-1 py-1.5 rounded-lg transition-all ${viewMode === 'calendar' ? 'bg-white text-[#00008b] shadow-xs' : 'text-gray-600'}`}







                >







                  Calendar







                </button>







                <button







                  type="button"







                  onClick={() => setViewMode('map')}







                  className={`flex-1 py-1.5 rounded-lg transition-all ${viewMode === 'map' ? 'bg-white text-[#00008b] shadow-xs' : 'text-gray-600'}`}







                >







                  Map







                </button>







              </div>







            </div>







          </div>















          {/* Active Filter Chips and Reset */}







          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100 text-xs">







            <div className="flex flex-wrap items-center gap-2">







              <span className="text-[10.5px] font-bold text-gray-500">Active:</span>







              <span className="px-2.5 py-0.5 rounded-md bg-blue-50 text-[#00008b] font-bold">







                {selectedLocation}







              </span>







              {selectedDateFilter !== 'all' && (







                <span className="px-2.5 py-0.5 rounded-md bg-blue-50 text-[#00008b] font-bold">







                  Date: {selectedDateFilter}







                </span>







              )}







              {selectedCategory !== 'All' && (







                <span className="px-2.5 py-0.5 rounded-md bg-blue-50 text-[#00008b] font-bold">







                  {selectedCategory}







                </span>







              )}







            </div>















            <button







              type="button"







              onClick={resetFilters}







              className="text-[#00008b] font-bold hover:underline text-xs"







            >







              Reset All Filters







            </button>







          </div>







        </div>







      )}















      {/* ========================================================================= */}







      {/* 4. TAB CONTENT DISPLAY */}







      {/* ========================================================================= */}















            {/* ========================================================================= */}

      {/* UNIVERSAL SEARCH RESULTS (WHEN USER HAS TYPED A QUERY) */}

      {/* Searches Businesses, Events, Dining, Sales, News on a single page */}

      {/* ========================================================================= */}

      {searchMode ? (

        <div className="space-y-12">

          {/* Universal Search Header */}

          <div className="flex items-center justify-between pb-4 border-b border-gray-200 flex-wrap gap-3">

            <div>

              <h2 className="text-2xl font-black text-gray-900">

                Search Results for “{debouncedSearch.trim()}”

              </h2>

              <p className="text-xs text-gray-500 font-bold mt-1">

                Found {totalMatches} matching result{totalMatches === 1 ? '' : 's'} across businesses, events, dining, sales, and community news
              </p>
              <label className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-xs font-bold text-gray-800 cursor-pointer select-none hover:border-[#00008b]">
                <input
                  type="checkbox"
                  checked={includePast}
                  onChange={e => setIncludePast(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-[#00008b] focus:ring-[#00008b]"
                />
                <span>Include past listings</span>
              </label>

            </div>

            <button

              type="button"

              onClick={resetFilters}

              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer"

            >

              Clear Search

            </button>

          </div>



          {/* SECTION 1: BUSINESSES */}

          {filteredBusinesses.length > 0 && (

            <div>

              <div className="flex items-center justify-between mb-4">

                <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">

                  <Building2 className="w-5 h-5 text-blue-700" />

                  <span>Businesses ({filteredBusinesses.length})</span>

                </h3>

                <Link

                  to="/directory"

                  className="text-xs font-black text-[#00008b] hover:underline"

                >

                  View in Directory &rarr;

                </Link>

              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                {filteredBusinesses.map(b => (

                  <div

                    key={b.id || b.slug}

                    className={`${CARD_SHELL_CLASS} group`}

                  >
<div className="h-2 bg-gradient-to-r from-lake-800 via-lake-600 to-coral-500" aria-hidden="true" />
<div className="p-6 flex-1 flex flex-col justify-between min-w-0">

                    <div>

                      <div className="flex items-start justify-between gap-2 mb-2">

                        <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-blue-50 text-[#00008b] border border-blue-200">

                          {b.category}

                        </span>

                        {b.community && (

                          <span className="text-[11px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">

                            {b.community}

                          </span>

                        )}

                      </div>

                      <h4 className="text-base font-black text-gray-900 group-hover:text-[#00008b] transition-colors leading-snug">

                        {b.name}

                      </h4>

                      {b.description && (

                        <p className="text-xs text-gray-600 mt-2 line-clamp-2">

                          {b.description}

                        </p>

                      )}

                      <div className="mt-3 space-y-1.5 text-xs text-gray-600">

                        {b.location && (

                          <div className="flex items-center gap-1.5">

                            <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />

                            <span className="truncate">{b.location}</span>

                          </div>

                        )}

                        {b.phone && (

                          <div className="flex items-center gap-1.5">

                            <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />

                            <a href={`tel:${b.phone}`} className="hover:underline text-blue-900 font-semibold">{formatPhoneNumber(b.phone)}</a>

                          </div>

                        )}

                      </div>

                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">

                      <Link

                        to={`/businesses/${b.slug || b.id}`}

                        className="inline-flex items-center gap-1 text-xs font-black text-[#00008b] hover:underline"

                      >

                        <span>View Business Page</span>

                        <ArrowRight className="w-3.5 h-3.5" />

                      </Link>

                      {b.link && (

                        <a

                          href={safeHref(b.link)}

                          target="_blank"

                          rel="noopener noreferrer"

                          className="text-xs text-gray-400 hover:text-gray-700"

                          title="Visit Website"

                        >

                          <ExternalLink className="w-3.5 h-3.5" />

                        </a>

                      )}

                    </div>

                  </div>
</div>

                ))}

              </div>

            </div>

          )}



          {/* SECTION 2: EVENTS */}

          {filteredEvents.length > 0 && (

            <div>

              <div className="flex items-center justify-between mb-4">

                <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">

                  <CalendarIcon className="w-5 h-5 text-blue-700" />

                  <span>Events ({filteredEvents.length})</span>

                </h3>

                <Link

                  to="/events"

                  className="text-xs font-black text-[#00008b] hover:underline"

                >

                  View in Events &rarr;

                </Link>

              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                {filteredEvents.map(evt => {

                  const saved = isItemSaved(evt.id);

                  return (

                    <div

                      key={evt.id}

                      className={`${CARD_SHELL_CLASS} group`}

                    >
<div className="h-2 bg-gradient-to-r from-lake-800 via-lake-600 to-coral-500" aria-hidden="true" />
<div className="p-6 flex-1 flex flex-col justify-between min-w-0">

                      <div>

                        <div className="flex items-start justify-between gap-2 mb-3">

                          <div className="flex flex-wrap items-center gap-1.5">

                            <span className="px-3 py-1 bg-blue-50 text-[#00008b] border border-blue-200 rounded-full text-xs font-black uppercase tracking-wider">

                              {evt.category}

                            </span>

                            {evt.price_text && (

                              <span className="px-2.5 py-0.5 bg-gray-100 text-gray-700 rounded-full text-xs font-bold">

                                {evt.price_text}

                              </span>

                            )}

                          </div>

                          <button

                            type="button"

                            onClick={() => handleToggleBookmark(evt)}

                            className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-rose-500 transition-colors"

                            title={saved ? 'Remove from saved' : 'Save event'}

                          >

                            <Bookmark className={`w-4 h-4 ${saved ? 'fill-rose-500 text-rose-500' : ''}`} />

                          </button>

                        </div>

                        <h4 className="text-lg font-black text-gray-900 group-hover:text-[#00008b] transition-colors line-clamp-2 mb-2">

                          {evt.title}

                        </h4>

                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">

                          {evt.organizer || evt.business_name}

                        </p>

                        <div className="space-y-1.5 text-xs text-gray-600">

                          <div className="flex items-center gap-2">

                            <CalendarIcon className="w-4 h-4 text-gray-400 shrink-0" />

                            <span className="font-bold text-gray-800">{evt.event_date_label}</span>

                          </div>

                          <div className="flex items-center gap-2">

                            <MapPin className="w-4 h-4 text-gray-400 shrink-0" />

                            <span className="truncate">{evt.location}</span>

                          </div>

                        </div>

                        {evt.summary && (

                          <p className="text-xs text-gray-600 line-clamp-2 mt-3 pt-3 border-t border-gray-100">

                            {evt.summary}

                          </p>

                        )}

                      </div>

                      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">

                        <Link

                          to={detailPath(evt)}

                          className="inline-flex items-center gap-1 text-xs font-black text-[#00008b] hover:underline"

                        >

                          <span>View Details</span>

                          <ArrowRight className="w-3.5 h-3.5" />

                        </Link>

                      </div>

                    </div>
</div>

                  );

                })}

              </div>

            </div>

          )}



          {/* SECTION 3: DINING SPECIALS */}

          {filteredDining.length > 0 && (

            <div>

              <div className="flex items-center justify-between mb-4">

                <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">

                  <Utensils className="w-5 h-5 text-blue-700" />

                  <span>Dining Specials ({filteredDining.length})</span>

                </h3>

                <Link

                  to={`/dining?search=${encodeURIComponent(debouncedSearch.trim())}`}

                  className="text-xs font-black text-[#00008b] hover:underline"

                >

                  View in Dining &rarr;

                </Link>

              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                {filteredDining.map(d => (

                  <div

                    key={d.id}

                    className={`${CARD_SHELL_CLASS} group`}

                  >
<div className="h-2 bg-gradient-to-r from-lake-800 via-lake-600 to-coral-500" aria-hidden="true" />
<div className="p-6 flex-1 flex flex-col justify-between min-w-0">

                    <div>

                      <div className="flex items-start justify-between gap-2 mb-2">

                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-black uppercase tracking-wider bg-amber-50 text-amber-900 border border-amber-200 max-w-full whitespace-normal break-words text-left leading-snug">

                          <Utensils className="w-3 h-3 text-amber-700" />

                          <span>Dining</span>

                        </span>

                        {d.event_date_label && (

                          <span className="text-[11px] font-bold text-gray-500">

                            {d.event_date_label}

                          </span>

                        )}

                      </div>

                      <h4 className="text-base font-black text-gray-900 group-hover:text-[#00008b] transition-colors leading-snug">

                        {d.title}

                      </h4>

                      <p className="text-xs font-bold text-gray-700 mt-1">

                        {d.business_name}

                      </p>

                      {d.summary && (

                        <p className="text-xs text-gray-600 mt-2 line-clamp-2">

                          {d.summary}

                        </p>

                      )}

                      {d.location && (

                        <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-500">

                          <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />

                          <span className="truncate">{d.location}</span>

                        </div>

                      )}

                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">

                      <Link

                        to={detailPath(d)} onClick={() => recordSearchClick(supabase, { query: debouncedSearch, title: d.title, business: d.business_name, itemId: d.id, targetUrl: detailPath(d), page: 'search-results' })}

                        className="inline-flex items-center gap-1 text-xs font-black text-[#00008b] hover:underline"

                      >

                        <span>View Dining Offer</span>

                        <ArrowRight className="w-3.5 h-3.5" />

                      </Link>

                    </div>

                  </div>
</div>

                ))}

              </div>

            </div>

          )}



          {/* SECTION 4: SALES & DEALS */}

          {filteredSales.length > 0 && (

            <div>

              <div className="flex items-center justify-between mb-4">

                <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">

                  <Tag className="w-5 h-5 text-blue-700" />

                  <span>Sales &amp; Specials ({filteredSales.length})</span>

                </h3>

                <Link

                  to={`/sales?search=${encodeURIComponent(debouncedSearch.trim())}`}

                  className="text-xs font-black text-[#00008b] hover:underline"

                >

                  View in Sales &rarr;

                </Link>

              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                {filteredSales.map(sale => {

                  const saved = isItemSaved(sale.id);

                  return (

                    <div

                      key={sale.id}

                      className={`${CARD_SHELL_CLASS} group`}

                    >
<div className="h-2 bg-gradient-to-r from-lake-800 via-lake-600 to-coral-500" aria-hidden="true" />
<div className="p-6 flex-1 flex flex-col justify-between min-w-0">

                      <div>

                        <div className="flex items-start justify-between gap-2 mb-3">

                          <span className="px-3 py-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-full text-xs font-black uppercase tracking-wider">

                            {sale.price_text || 'Special Deal'}

                          </span>

                          <button

                            type="button"

                            onClick={() => handleToggleBookmark(sale)}

                            className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-rose-500 transition-colors"

                            title={saved ? 'Remove from saved' : 'Save deal'}

                          >

                            <Bookmark className={`w-4 h-4 ${saved ? 'fill-rose-500 text-rose-500' : ''}`} />

                          </button>

                        </div>

                        <h4 className="text-lg font-black text-gray-900 group-hover:text-[#00008b] transition-colors line-clamp-2 mb-2">

                          {sale.title}

                        </h4>

                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">

                          {sale.business_name}

                        </p>

                        {sale.summary && (

                          <p className="text-xs text-gray-600 line-clamp-2 mb-3">

                            {sale.summary}

                          </p>

                        )}

                        <div className="flex items-center gap-2 text-xs text-gray-500">

                          <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />

                          <span className="truncate">{sale.location}</span>

                        </div>

                      </div>

                      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">

                        <Link

                          to={detailPath(sale)} onClick={() => recordSearchClick(supabase, { query: debouncedSearch, title: sale.title, business: sale.business_name, itemId: sale.id, targetUrl: detailPath(sale), page: 'search-results' })}

                          className="inline-flex items-center gap-1 text-xs font-black text-[#00008b] hover:underline"

                        >

                          <span>View Offer Details</span>

                          <ArrowRight className="w-3.5 h-3.5" />

                        </Link>

                      </div>

                    </div>
</div>

                  );

                })}

              </div>

            </div>

          )}



          {/* SECTION 5: NEWS & MEDIA */}

          {filteredNews.length > 0 && (

            <div>

              <div className="flex items-center justify-between mb-4">

                <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">

                  <Newspaper className="w-5 h-5 text-blue-700" />

                  <span>News &amp; Media ({filteredNews.length})</span>

                </h3>

                <a

                  href="/news/newsroom.html"

                  className="text-xs font-black text-[#00008b] hover:underline"

                >

                  View in Newsroom &rarr;

                </a>

              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                {filteredNews.map(n => (

                  <div

                    key={n.id}

                    className={`${CARD_SHELL_CLASS} group`}

                  >
<div className="h-2 bg-gradient-to-r from-lake-800 via-lake-600 to-coral-500" aria-hidden="true" />
<div className="p-6 flex-1 flex flex-col justify-between min-w-0">

                    <div>

                      <div className="flex items-start justify-between gap-2 mb-2">

                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-rose-50 text-rose-800 border border-rose-200">

                          <Newspaper className="w-3 h-3 text-rose-600" />

                          <span>{n.business_name}</span>

                        </span>

                        {n.event_date_label && (

                          <span className="text-[11px] font-bold text-gray-500">

                            {n.event_date_label}

                          </span>

                        )}

                      </div>

                      <h4 className="text-base font-black text-gray-900 group-hover:text-[#00008b] transition-colors leading-snug">

                        {n.title}

                      </h4>

                      {n.summary && (

                        <p className="text-xs text-gray-600 mt-2 line-clamp-3">

                          {n.summary}

                        </p>

                      )}

                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">

                      <a

                        href={safeHref(n.link)}

                        target={n.link?.startsWith('http') ? "_blank" : undefined}

                        rel={n.link?.startsWith('http') ? "noopener noreferrer" : undefined}

                        className="inline-flex items-center gap-1 text-xs font-black text-[#00008b] hover:underline"

                      >

                        <span>Read Story</span>

                        <ExternalLink className="w-3.5 h-3.5" />

                      </a>

                    </div>

                  </div>
</div>

                ))}

              </div>

            </div>

          )}



          {/* UNIFIED NO RESULTS WHEN totalMatches === 0 */}

          {totalMatches === 0 && (

            <div className="bg-white rounded-3xl p-12 text-center border border-gray-200">

              <Search className="w-12 h-12 text-gray-400 mx-auto mb-3" />

              <h3 className="text-lg font-black text-gray-900">No results found matching “{debouncedSearch.trim()}”</h3>

              <p className="text-xs text-gray-600 mt-1 max-w-md mx-auto">

                No businesses, events, dining specials, sales, or news articles currently match your search. Try different keywords or clear your search to browse all categories.

              </p>

              <button

                type="button"

                onClick={resetFilters}

                className="mt-5 px-6 py-2.5 bg-[#00008b] hover:bg-blue-900 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer"

              >

                Clear Search &amp; Reset Filters

              </button>

              <div className="mt-8 pt-6 border-t border-gray-100 flex items-center justify-center gap-3 text-xs font-bold text-gray-600 flex-wrap">

                <span>Browse directory:</span>

                <Link to="/directory" className="text-[#00008b] underline">Businesses</Link>

                <span>&bull;</span>

                <Link to="/events" className="text-[#00008b] underline">Events</Link>

                <span>&bull;</span>

                <Link to="/dining" className="text-[#00008b] underline">Dining</Link>

                <span>&bull;</span>

                <Link to="/sales" className="text-[#00008b] underline">Sales</Link>

                <span>&bull;</span>

                <a href="/news/newsroom.html" className="text-[#00008b] underline">Newsroom</a>

              </div>

            </div>

          )}

        </div>

      ) : (

        <>

          {/* TAB A: EVENTS */}

          {activeTab === 'events' && (

            <div>







          {viewMode === 'list' && (







            <div>







              {loading && filteredEvents.length === 0 ? (

                <div role="status" className="bg-white rounded-3xl p-12 text-center border border-gray-200 text-sm font-bold text-gray-600">Loading listings...</div>

              ) : filteredEvents.length === 0 ? (







                <div className="bg-white rounded-3xl p-12 text-center border border-gray-200">







                  <CalendarIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />







                  <h3 className="text-lg font-black text-gray-900">No events found matching your criteria</h3>







                  <p className="text-xs text-gray-600 mt-1 max-w-md mx-auto">







                    Try adjusting your location or date filter to see more upcoming community activities.







                  </p>







                  <button







                    type="button"







                    onClick={resetFilters}







                    className="mt-4 px-4 py-2 bg-blue-50 text-[#00008b] rounded-xl text-xs font-black uppercase tracking-wider"







                  >







                    Reset Filters







                  </button>







                </div>







              ) : (







                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">







                  {filteredEvents.map(evt => {







                    const saved = isItemSaved(evt.id);







                    return (







                      <div







                        key={evt.id}







                        className={`${CARD_SHELL_CLASS} group`}







                      >
<div className="h-2 bg-gradient-to-r from-lake-800 via-lake-600 to-coral-500" aria-hidden="true" />
<div className="p-6 flex-1 flex flex-col justify-between min-w-0">







                        <div>







                          <div className="flex items-start justify-between gap-2 mb-3">







                            <div className="flex flex-wrap items-center gap-1.5">







                              <span className="px-2.5 py-1 rounded-md bg-blue-50 text-[#00008b] text-[10.5px] font-medium uppercase tracking-wider border border-blue-100">







                                {formatCategoryLabel(evt.category)}







                              </span>















                            </div>















                            <button







                              type="button"







                              onClick={() => handleToggleBookmark(evt)}







                              className={`p-2 rounded-xl transition-colors ${







                                saved ? 'bg-amber-100 text-amber-900' : 'bg-gray-50 text-gray-400 hover:text-gray-900 hover:bg-gray-100'







                              }`}







                              title={saved ? 'Saved' : 'Save for Later'}







                            >







                              <Bookmark className="w-4 h-4 fill-current" />







                            </button>







                          </div>















                          <h3 className="text-xl font-bold font-[700] text-gray-900 leading-snug group-hover:text-[#00008b] transition-colors" style={{ fontWeight: 700 }}>







                            {evt.title}







                          </h3>















                          <div className="space-y-2 mt-3.5 text-[16px] font-normal text-gray-700">







                            <div className="flex items-center gap-2">







                              <Clock className="w-3.5 h-3.5 text-blue-700 shrink-0" />







                              <span>{formatDDMonthYYYY(evt.event_date_label)}</span>







                            </div>







                            <div className="flex items-start gap-1.5 pt-0.5">







                              <MapPin className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />







                              {evt.location ? (







                                <a







                                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(evt.location + (evt.location.toLowerCase().includes('georgina') ? '' : ', East Gwillimbury, ON'))}`}







                                  target="_blank"







                                  rel="noopener noreferrer"







                                  className="text-green-800 hover:text-green-900 hover:underline font-normal flex items-center gap-1 group/map"







                                  title="Open in Google Maps"







                                >







                                  <span>{evt.location}</span>







                                  <ExternalLink className="w-3 h-3 text-green-800 group-hover/map:text-green-900 shrink-0 inline" />







                                </a>







                              ) : (







                                <span className="text-gray-700 font-semibold">East Gwillimbury, ON</span>







                              )}







                            </div>







                          </div>















                          {evt.summary && (







                            <p className="text-[16px] text-gray-600 font-normal mt-3.5 line-clamp-3 leading-relaxed">







                              {evt.summary}







                            </p>







                          )}







                        </div>















                        <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between gap-2">







                          <button







                            type="button"







                            onClick={() => downloadEventIcs(evt)}







                            className="text-xs font-bold text-gray-600 hover:text-gray-900"







                          >







                            + .ICS







                          </button>















                          <Link







                            to={`/events/${evt.slug || evt.id}`}







                            className="px-4 py-2 rounded-xl bg-[#00008b] hover:bg-blue-900 text-white text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1 shadow-xs"







                          >







                            <span>View Details</span>







                            <ChevronRight className="w-3.5 h-3.5" />







                          </Link>







                        </div>







                      </div>
</div>







                    );







                  })}







                </div>







              )}







            </div>







          )}















          {/* VIEW: MAP */}







          {viewMode === 'map' && (







            <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-sm h-[600px] relative">







              <MapContainer







                center={[44.275, -79.350]}







                zoom={12}







                scrollWheelZoom={false}







                style={{ height: '600px', width: '100%', zIndex: 0 }}







              >







                <TileLayer







                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'







                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"







                />















                {/* Draw verified community centers */}







                {GEORGINA_COMMUNITIES.filter(c => c.name !== 'All East Gwillimbury').map(c => (







                  <Circle







                    key={c.name}







                    center={c.center}







                    radius={2200}







                    pathOptions={{ color: '#00008b', fillColor: '#3b82f6', fillOpacity: 0.15, weight: 2 }}







                  >







                    <Popup className="font-bold">{c.name}</Popup>







                  </Circle>







                ))}















                {/* Event Markers with verified coordinates */}







                {filteredEvents.map(evt => {







                  let coords = null;







                  const loc = (evt.location || '').toLowerCase();







                  if (loc.includes('link')) coords = VENUE_COORDINATES['The Link'];







                  else if (loc.includes('ice palace')) coords = VENUE_COORDINATES['East Gwillimbury Ice Palace'];







                  else if (loc.includes('leacock')) coords = VENUE_COORDINATES['Stephen Leacock Theatre'];







                  else if (loc.includes('legion')) coords = VENUE_COORDINATES['Mount Albert Legion'];







                  else if (loc.includes('fairground')) coords = VENUE_COORDINATES['Mount Albert Fairgrounds'];







                  else if (loc.includes('holland landing')) coords = [44.225, -79.450];







                  else if (loc.includes('mount albert')) coords = [44.305, -79.355];







                  else if (loc.includes("jackson")) coords = VENUE_COORDINATES['Jackson\'s Point Harbor'];















                  if (!coords) return null;















                  return (







                    <Circle







                      key={evt.id}







                      center={coords}







                      radius={400}







                      pathOptions={{ color: '#e11d48', fillColor: '#f43f5e', fillOpacity: 0.8, weight: 2 }}







                    >







                      <Popup>







                        <div className="p-2 space-y-1">







                          <p className="text-xs font-black text-gray-900">{evt.title}</p>







                          <p className="text-[11px] text-gray-600">{formatDDMonthYYYY(evt.event_date_label)}</p>







                          <p className="text-[10px] text-gray-500">{evt.location}</p>







                          <Link







                            to={`/events/${evt.slug || evt.id}`}







                            className="inline-block mt-2 text-xs font-black text-[#00008b] underline"







                          >







                            View Details &rarr;







                          </Link>







                        </div>







                      </Popup>







                    </Circle>







                  );







                })}







              </MapContainer>







            </div>







          )}















          {/* VIEW: CALENDAR */}







          {viewMode === 'calendar' && (







            <div className="bg-white rounded-3xl border border-gray-200 p-8 text-center">







              <h3 className="text-xl font-black text-gray-900">







                Explore Events via 6-Week Interactive Calendar







              </h3>







              <p className="text-xs text-gray-600 mt-1 max-w-md mx-auto">







                Access recurring day mappings, weekly leisure skatings, and community programs.







              </p>







              <Link







                to="/events"







                className="mt-4 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#00008b] text-white text-xs font-black uppercase tracking-wider hover:bg-blue-900 transition-colors"







              >







                Open 6-Week Events Calendar &rarr;







              </Link>







            </div>







          )}







        </div>







      )}















            {/* TAB B: LOCAL SALES */}

      {activeTab === 'sales' && (

        <div>







          {loading && filteredSales.length === 0 ? (

                <div role="status" className="bg-white rounded-3xl p-12 text-center border border-gray-200 text-sm font-bold text-gray-600">Loading listings...</div>

              ) : filteredSales.length === 0 ? (







            <div className="bg-white rounded-3xl p-12 text-center border border-gray-200">







              <Tag className="w-12 h-12 text-gray-400 mx-auto mb-3" />







              <h3 className="text-lg font-black text-gray-900">No promotions found</h3>







              <p className="text-xs text-gray-600 mt-1 max-w-md mx-auto">







                No active sales currently match these filters.







              </p>







              <button







                type="button"







                onClick={resetFilters}







                className="mt-4 px-4 py-2 bg-blue-50 text-[#00008b] rounded-xl text-xs font-black uppercase tracking-wider"







              >







                Reset Filters







              </button>







            </div>







          ) : (







            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">







              {filteredSales.map(sale => {







                const isEnding = sale.expires_after ? isEndingSoon(sale.expires_after) : false;







                const saved = isItemSaved(sale.id);















                return (







                  <div







                    key={sale.id}







                    className={`${CARD_SHELL_CLASS} group`}







                  >
<div className="h-2 bg-gradient-to-r from-lake-800 via-lake-600 to-coral-500" aria-hidden="true" />
<div className="p-6 flex-1 flex flex-col justify-between min-w-0">







                    <div>







                      <div className="flex items-start justify-between gap-2 mb-3">







                        <div className="flex flex-wrap items-center gap-1.5">







                          <span className="text-[11px] font-medium uppercase tracking-wider text-blue-900 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100">







                            {sale.business_name}







                          </span>







                          {isEnding && (







                            <span className="text-[10px] font-medium uppercase tracking-wider bg-rose-50 text-rose-700 px-2 py-0.5 rounded-md border border-rose-200">







                              Ending Soon







                            </span>







                          )}







                          {sale.price_text && (







                            <span className="text-[10.5px] font-medium uppercase tracking-wider bg-amber-50 text-amber-900 px-2 py-0.5 rounded-md border border-amber-200">







                              {sale.price_text}







                            </span>







                          )}







                        </div>















                        <button







                          type="button"







                          onClick={() => handleToggleBookmark(sale)}







                          className={`p-2 rounded-xl transition-colors ${







                            saved ? 'bg-amber-100 text-amber-900' : 'bg-gray-50 text-gray-400 hover:text-gray-900 hover:bg-gray-100'







                          }`}







                          title={saved ? 'Saved' : 'Save Deal for Later'}







                        >







                          <Bookmark className="w-4 h-4 fill-current" />







                        </button>







                      </div>















                      <h3 className="text-xl font-bold text-gray-900 leading-snug">







                        {sale.title}







                      </h3>















                      <div className="space-y-2 mt-3.5 text-[16px] font-normal text-gray-700">







                        <div className="flex items-start gap-1.5 pt-0.5">







                          <MapPin className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />







                          {sale.location ? (







                            <a







                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(sale.location + (sale.location.toLowerCase().includes('georgina') ? '' : ', East Gwillimbury, ON'))}`}







                              target="_blank"







                              rel="noopener noreferrer"







                              className="text-green-800 hover:text-green-900 hover:underline font-normal flex items-center gap-1 group/map"







                              title="Open in Google Maps"







                            >







                              <span>{sale.location}</span>







                              <ExternalLink className="w-3 h-3 text-green-800 group-hover/map:text-green-900 shrink-0 inline" />







                            </a>







                          ) : (







                            <span className="text-gray-700 font-semibold">East Gwillimbury, ON</span>







                          )}







                        </div>







                        <div className="flex items-center gap-2">







                          <Clock className="w-3.5 h-3.5 text-blue-700 shrink-0" />







                          <span>{formatDDMonthYYYY(sale.event_date_label)}</span>







                        </div>







                      </div>















                      {sale.summary && (







                        <p className="text-xs text-gray-600 font-normal mt-3 line-clamp-3 leading-relaxed">







                          {sale.summary}







                        </p>







                      )}







                    </div>















                    <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between gap-2">







                      <span className="text-[10.5px] font-bold text-gray-500 uppercase">







                        {formatCategoryLabel(sale.category)}







                      </span>















                      {sale.link && (







                        <>{sale.source === 'listing' ? (

                        <Link to={detailPath(sale)} className="px-4 py-2 rounded-xl bg-[#00008b] hover:bg-blue-900 text-white text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5">







                          <span>View Deal Details</span>







                          <ExternalLink className="w-3 h-3" />







                        </Link>

                      ) : (

                        <a







                          href={safeHref(sale.link)}







                          target="_blank"







                          rel="noopener noreferrer"







                          className="px-4 py-2 rounded-xl bg-[#00008b] hover:bg-blue-900 text-white text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5"







                        >







                          <span>Store Deal</span>







                          <ExternalLink className="w-3 h-3" />







                        </a>

                      )}</>







                      )}







                    </div>







                  </div>
</div>







                );







              })}







            </div>







          )}







        </div>







      )}

      {/* TAB C: MY OFFERS (RESIDENT DIGITAL WALLET INTEGRATION) */}







      {activeTab === 'offers' && (







        <div className="max-w-4xl mx-auto">







          {!userEmail ? (







            /* Logged Out: Prompt resident to sign in without losing page */







            <div className="bg-white rounded-3xl border border-gray-200 p-8 md:p-12 text-center shadow-sm">







              <Gift className="w-16 h-16 text-[#00008b] mx-auto mb-4" />







              <span className="px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-blue-50 text-[#00008b] border border-blue-200">







                Exclusive Resident Welcome Passes







              </span>







              <h2 className="text-2xl md:text-3xl font-black text-gray-900 mt-3">







                Unlock Your Resident Offers &amp; Wallet







              </h2>







              <p className="text-sm text-gray-600 mt-2 max-w-md mx-auto leading-relaxed">







                Enter your registered resident email address to view exclusive local vouchers, active redemption codes, and saved perks.







              </p>















              <form onSubmit={handleWalletLogin} className="max-w-md mx-auto mt-6 space-y-3">







                <input







                  type="email"







                  required







                  value={loginInputEmail}







                  onChange={e => setLoginInputEmail(e.target.value)}







                  placeholder="Enter your email address..."







                  className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm font-semibold focus:outline-none focus:border-[#00008b]"







                />







                <button







                  type="submit"







                  disabled={loginSending}







                  className="w-full py-3.5 rounded-xl bg-[#00008b] hover:bg-blue-900 text-white text-xs font-black uppercase tracking-wider transition-all shadow-md"







                >







                  {loginSending ? 'Connecting...' : 'Access My Resident Wallet â†’'}







                </button>







              </form>















              <div className="mt-6 pt-4 border-t border-gray-100">







                <Link to="/events" className="text-xs font-black text-[#00008b] hover:underline">







                  Explore upcoming community events across East Gwillimbury &rarr;







                </Link>







              </div>







            </div>







          ) : (







            /* Logged In Wallet View */







            <div className="space-y-6">







              <div className="bg-white rounded-3xl border border-gray-200 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">







                <div>







                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full">







                    âœ“ Verified Resident Pass







                  </span>







                  <h2 className="text-xl font-black text-gray-900 mt-1">







                    Your Digital Welcome Perks







                  </h2>







                  <p className="text-xs text-gray-500 font-semibold mt-0.5">







                    Account: <strong className="text-gray-900">{userEmail}</strong>







                  </p>







                </div>







                <button







                  type="button"







                  onClick={() => { localStorage.removeItem('wg_wallet_email'); setUserEmail(''); setWallet(null); setWalletCoupons([]); }}







                  className="text-xs font-bold text-gray-500 hover:text-gray-900 underline"







                >







                  Switch Account







                </button>







              </div>















              {walletCoupons.length === 0 ? (







                <div className="bg-white rounded-3xl border border-gray-200 p-10 text-center">







                  <Gift className="w-12 h-12 text-gray-300 mx-auto mb-3" />







                  <h3 className="text-base font-black text-gray-900">No active vouchers issued yet</h3>







                  <p className="text-xs text-gray-600 mt-1">







                    Once your Welcome Hamper is authorized by our committee, your digital vouchers will appear here.







                  </p>







                  <Link







                    to="/events"







                    className="inline-block mt-4 px-5 py-2.5 bg-[#00008b] text-white text-xs font-black uppercase tracking-wider rounded-xl"







                  >







                    Check Events Calendar &rarr;







                  </Link>







                </div>







              ) : (







                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">







                  {walletCoupons.map(coupon => (







                    <div







                      key={coupon.id}







                      className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs flex flex-col justify-between"







                    >







                      <div>







                        <div className="flex items-center justify-between text-[11px] font-black uppercase mb-2">







                          <span className="text-blue-900 bg-blue-50 px-2 py-0.5 rounded">







                            {coupon.partner_name}







                          </span>







                          <span className={`px-2 py-0.5 rounded text-[10px] ${







                            coupon.status === 'available'







                              ? 'bg-emerald-100 text-emerald-900'







                              : 'bg-gray-100 text-gray-500'







                          }`}>







                            {coupon.status}







                          </span>







                        </div>







                        <h4 className="text-base font-black text-gray-900">







                          {coupon.offer_title}







                        </h4>







                        {coupon.offer_description && (







                          <p className="text-xs text-gray-600 mt-1 line-clamp-2">







                            {coupon.offer_description}







                          </p>







                        )}







                      </div>















                      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">







                        <span className="text-[10px] text-gray-500 font-bold">







                          Single Use Perk







                        </span>







                        {coupon.status === 'available' && (







                          <button







                            type="button"







                            onClick={() => handlePresentOffer(coupon)}







                            className="px-4 py-2 bg-[#00008b] hover:bg-blue-900 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-xs"







                          >







                            Present Code &rarr;







                          </button>







                        )}







                      </div>







                    </div>







                  ))}







                </div>







              )}







            </div>







          )}







        </div>







      )}















      {/* QR PRESENTATION MODAL */}







      {presentingCoupon && (







        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto pt-6 pb-8 px-4 bg-black/60 backdrop-blur-sm animate-fadeIn" onClick={closePresentation}>







          <div className="bg-white rounded-3xl max-w-sm w-full p-6 text-center shadow-2xl relative space-y-4" onClick={e => e.stopPropagation()}>







            <button







              type="button"







              onClick={closePresentation}







              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-700 rounded-full"







            >







              <X className="w-5 h-5" />







            </button>















            <span className="text-[10px] font-black uppercase tracking-wider bg-blue-50 text-[#00008b] px-3 py-1 rounded-full border border-blue-200 inline-block">







              Cashier Redemption Code







            </span>







            <h3 className="text-lg font-black text-gray-900">







              {presentingCoupon.offer_title}







            </h3>







            <p className="text-xs text-gray-600 font-medium">







              Present this rotating QR code or fallback code to the cashier at {presentingCoupon.partner_name}.







            </p>















            {qrDataUrl && (







              <div className="p-3 bg-gray-50 rounded-2xl border border-gray-200 inline-block mx-auto">







                <img src={qrDataUrl} alt="Redemption Code" className="w-48 h-48 mx-auto" />







              </div>







            )}















            <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-xs font-black text-amber-950">







              Fallback Code: WG-{presentingCoupon.id.slice(0, 4).toUpperCase()}







            </div>















            <p className="text-[11px] text-gray-500 font-bold">







              Expires in: {Math.floor(countdownSeconds / 60)}:{(countdownSeconds % 60).toString().padStart(2, '0')}







            </p>















            <button







              type="button"







              onClick={closePresentation}







              className="w-full py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold uppercase tracking-wider"







            >







              Done







            </button>







          </div>







        </div>







      )}
        </>
      )}















      {/* FLOATING ACTION: POST YOUR SALE OR EVENT */}







      <div className="mt-16 rounded-3xl bg-gradient-to-r from-blue-900 via-indigo-900 to-[#00008b] text-white p-8 md:p-10 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl">







        <div className="max-w-xl">







          <span className="px-3 py-1 rounded-full bg-amber-400 text-blue-950 text-[10.5px] font-black uppercase tracking-wider mb-2 inline-block">







            For Local East Gwillimbury Businesses







          </span>







          <h2 className="text-2xl md:text-3xl font-black tracking-tight">







            Own a East Gwillimbury Business? Post Your Sale or Event







          </h2>







          <p className="text-blue-100 text-xs md:text-sm font-medium mt-1 leading-relaxed">







            Reach thousands of local residents and newcomers browsing for community activities and shopping opportunities. Takes only 2 minutes.







          </p>







        </div>







        <Link







          to="/submit"







          className="shrink-0 px-8 py-4 rounded-2xl bg-amber-400 hover:bg-amber-300 text-blue-950 font-black text-xs uppercase tracking-wider shadow-lg transition-all"







        >







          Post Listing Free &rarr;







        </Link>







      </div>







    </div>







  );







}







