import React, { useState, useEffect, useMemo, useRef } from 'react';
import { matchesQuery } from '../utils/fuzzySearch.js';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { trackedLink, businessPath, notEndedFilter, hasMerchantLink } from '../utils/links';
import { GEORGINA_COMMUNITIES as TOWNS } from '../utils/communities';
import { CARD_SHELL_CLASS, getCardStripeClass } from '../utils/cardStyles';
import ClaimBusinessModal from '../components/ClaimBusinessModal';
import { 
  Building2, 
  MapPin, 
  Search, 
  ExternalLink, 
  ArrowLeft, 
  ChevronRight, 
  ChevronLeft,
  Sparkles, 
  Filter,
  Compass,
  Tag,
  Store,
  Calendar,
  Building,
  ShieldCheck
} from 'lucide-react';
import { 
  formatTitleCase, 
  formatCategoryLabel, 
  generateSlug,
  getAlphabeticalSortName,
  getAlphabeticalFirstLetter
} from '../services/discoveryService';

const PAGE_SIZE = 50;
const ALPHABET = ['ALL', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];

const GEORGINA_COMMUNITIES = ['All', ...TOWNS];

const CURATED_GEORGINA_DIRECTORY = [
  { name: "Art Gallery of East Gwillimbury", community: "Mount Albert", location: "149 High St, Mount Albert, ON", category: "Arts & Culture", link: "https://artgalleryofgeorgina.ca/" },
  { name: "Autism Unplugged Learning Centre", community: "Holland Landing", location: "23324 Woodbine Ave, Holland Landing, ON", category: "Community Organization", link: "https://autismunplugged.ca/" },
  { name: "Bailey's Homestead Restaurant", community: "Holland Landing", location: "252 The Queensway S, Holland Landing, ON", category: "Dining & Restaurant", link: "https://welcomeeg.ca/dining" },
  { name: "Baldwin Community Park & Airport", community: "Baldwin", location: "Hedge Rd / Highway 48, Baldwin, ON", category: "Recreation & Parks", link: "https://www.georgina.ca/" },
  { name: "Franklin Community Hall", community: "Holland Landing", location: "25202 Warden Ave, Holland Landing, ON", category: "Community Hall & Venue", link: "https://www.georgina.ca/" },
  { name: "Black River Environmental Park", community: "Mount Albert", location: "5279 Black River Rd, Mount Albert, ON", category: "Recreation & Parks", link: "https://www.georgina.ca/" },
  { name: "Brock-East Gwillimbury Probus Club", community: "Brown Hill", location: "24 Victoria Road, Brown Hill, ON", category: "Social & Community Club", link: "https://www.probuscanada.ca/" },
  { name: "Butter Bee Bagel", community: "Holland Landing", location: "The Queensway S, Holland Landing, ON", category: "Bakery & Cafe", link: "https://www.butterbeebagel.com/" },
  { name: "Cedarhyrst Golf Club", community: "Queensville", location: "16421 Highway 48, Queensville, ON", category: "Sports & Golf", link: "https://www.georgina.ca/" },
  { name: "Claredon Beach Park", community: "Holland Landing", location: "Claredon Beach, Holland Landing, ON", category: "Waterfront & Beach", link: "https://www.georgina.ca/" },
  { name: "ClearWater Farm (Ontario Water Centre)", community: "River Drive Park", location: "1614 Metro Rd N, River Drive Park, ON", category: "Agriculture & Education", link: "https://clearwaterfarm.ca/" },
  { name: "Club 55 Holland Landing (Seniors Centre)", community: "Holland Landing", location: "130 Gwendolyn Blvd, Holland Landing, ON", category: "Seniors & Community Centre", link: "https://www.georgina.ca/" },
  { name: "Club 55 Mount Albert", community: "Mount Albert", location: "20849 Dalton Rd (The Link), Mount Albert, ON", category: "Seniors & Community Centre", link: "https://www.georgina.ca/" },
  { name: "Corner House Bistro", community: "Mount Albert", location: "131 High St, Mount Albert, ON", category: "Dining & Restaurant", link: "https://welcomeeg.ca/dining" },
  { name: "De La Salle Beach & Park", community: "Sharon", location: "1940 Metro Rd N, Sharon, ON", category: "Waterfront & Beach", link: "https://www.georgina.ca/" },
  { name: "Egypt Community Hall", community: "Queensville", location: "6756 Smith Blvd, Queensville, ON", category: "Community Hall & Venue", link: "https://www.georgina.ca/" },
  { name: "Franklin Beach & Marine Park", community: "Sharon", location: "Lake Dr E, Sharon, ON", category: "Waterfront & Beach", link: "https://www.georgina.ca/" },
  { name: "East Gwillimbury Arts Centre & Gallery", community: "Mount Albert", location: "149 High St, Mount Albert, ON", category: "Arts & Culture", link: "https://gacg.ca/" },
  { name: "East Gwillimbury Cares Community Fund", community: "Holland Landing", location: "East Gwillimbury, ON", category: "Charitable Organization", link: "https://georginacares.ca/" },
  { name: "Central York Chamber of Commerce", community: "Holland Landing", location: "20849 Dalton Rd, Mount Albert, ON", category: "Business & Networking", link: "https://georginachamber.com/" },
  { name: "East Gwillimbury Community Food Pantry", community: "Holland Landing", location: "20849 Dalton Rd (The Link), Mount Albert, ON", category: "Community Support", link: "https://georginafoodpantry.com/" },
  { name: "East Gwillimbury Farmers' Market", community: "Mount Albert", location: "The Link — 20849 Dalton Rd, Mount Albert, ON", category: "Farmers' Market", link: "https://www.georginafarmersmarket.ca/" },
  { name: "East Gwillimbury Gym & Leisure Pool", community: "Holland Landing", location: "90 Wexford Dr, Holland Landing, ON", category: "Recreation & Fitness", link: "https://www.georgina.ca/" },
  { name: "East Gwillimbury Ice Palace", community: "Holland Landing", location: "90 Wexford Dr, Holland Landing, ON", category: "Arena & Recreation Complex", link: "https://www.georgina.ca/" },
  { name: "East Gwillimbury Island Ferry Dock", community: "Virginia", location: "870 Black River Rd, Virginia, ON", category: "Marine & Transportation", link: "https://georginaisland.com/" },
  { name: "East Gwillimbury Military Museum", community: "Holland Landing", location: "26061 Woodbine Ave, Holland Landing, ON", category: "Museum & Heritage", link: "https://georginamilitarymuseum.ca/" },
  { name: "East Gwillimbury Nurse Practitioner-Led Clinic", community: "Mount Albert", location: "21071 Dalton Road, Mount Albert, ON", category: "Healthcare & Wellness", link: "https://georginanplc.ca/" },
  { name: "East Gwillimbury Pioneer Village & Archives", community: "Holland Landing", location: "26557 Civic Centre Rd, Holland Landing, ON", category: "Museum & Heritage", link: "https://www.georgina.ca/living-here/pioneer-village" },
  { name: "East Gwillimbury Public Library — Holland Landing Branch", community: "Holland Landing", location: "90 Wexford Dr, Holland Landing, ON", category: "Library & Learning", link: "https://georginalibrary.ca/" },
  { name: "East Gwillimbury Public Library — Queensville Branch", community: "Queensville", location: "76 Pete's Lane, Queensville, ON", category: "Library & Learning", link: "https://georginalibrary.ca/" },
  { name: "East Gwillimbury Public Library — Peter Gzowski Branch", community: "Mount Albert", location: "5279 Black River Rd, Mount Albert, ON", category: "Library & Learning", link: "https://georginalibrary.ca/" },
  { name: "East Gwillimbury Trades Training Inc. (GTTI)", community: "Mount Albert", location: "5209 Black River Rd, Mount Albert, ON", category: "Vocational & Skills Training", link: "https://gtti.ca/" },
  { name: "High Street Commercial District", community: "Mount Albert", location: "High St & Dalton Rd, Mount Albert, ON", category: "Retail & Shopping Area", link: "https://welcomeeg.ca/sales" },
  { name: "Hospice East Gwillimbury", community: "Mount Albert", location: "20849 Dalton Rd (The Link), Mount Albert, ON", category: "Healthcare & Compassionate Care", link: "https://hospicegeorgina.com/" },
  { name: "Sharon Harbour & Marina", community: "Sharon", location: "19 Lake Dr E, Sharon, ON", category: "Marina & Waterfront", link: "https://www.georgina.ca/" },
  { name: "Kat's Gallery & Custom Framing", community: "Sharon", location: "930 Lake Dr E, Sharon, ON", category: "Retail & Artisans", link: "https://welcomeeg.ca/sales" },
  { name: "Holland Landing Lions Club", community: "Holland Landing", location: "Holland Landing, ON", category: "Community Service Club", link: "https://www.e-clubhouse.org/" },
  { name: "Kinsmen Club of Mount Albert", community: "Mount Albert", location: "Mount Albert, ON", category: "Community Service Club", link: "https://www.kinclubs.ca/" },
  { name: "Krates Marina", community: "Holland Landing", location: "290 The Queensway S, Holland Landing, ON", category: "Marine & Boating", link: "https://kratesmarina.com/" },
  { name: "East Gwillimbury Arms Pub & Restaurant", community: "Sharon", location: "21089 Dalton Rd, Sharon, ON", category: "Dining & Restaurant", link: "https://welcomeeg.ca/dining" },
  { name: "East Gwillimbury Region Conservation Authority", community: "East Gwillimbury", location: "East Gwillimbury Watershed, East Gwillimbury, ON", category: "Conservation & Nature Trails", link: "https://lsrca.on.ca/" },
  { name: "Lakeview House Golf Course", community: "Holland Landing", location: "Lakeview House, Holland Landing, ON", category: "Sports & Golf", link: "https://www.georgina.ca/" },
  { name: "Mansion House Restaurant", community: "Holland Landing", location: "165 The Queensway S, Holland Landing, ON", category: "Dining & Restaurant", link: "https://welcomeeg.ca/dining" },
  { name: "North Shore Trail & Waterfront", community: "Sharon", location: "Hedge Rd / Lake Dr, Sharon, ON", category: "Recreation & Trails", link: "https://www.georgina.ca/" },
  { name: "Orchard Beach Golf & Country Club", community: "Holland Landing", location: "273 Metro Rd N, Holland Landing, ON", category: "Sports & Golf", link: "https://orchardbeachgolf.com/" },
  { name: "Queensville Community Centre & Lion's Hall", community: "Queensville", location: "38 Pete's Lane, Queensville, ON", category: "Community Hall & Arena", link: "https://www.georgina.ca/" },
  { name: "Queensville Lions Club", community: "Queensville", location: "38 Pete's Lane, Queensville, ON", category: "Community Service Club", link: "https://www.e-clubhouse.org/" },
  { name: "Ravenshoe Marina & Resort", community: "Ravenshoe", location: "22607 Shoreline Dr, Ravenshoe, ON", category: "Marine & Resort", link: "https://www.georgina.ca/" },
  { name: "Ram Kilns Studio & Pottery", community: "Sharon", location: "Sharon, ON", category: "Artisanal Studio", link: "https://welcomeeg.ca/sales" },
  { name: "Riveredge Resort & Marina", community: "Holland Landing", location: "283 Lake Dr N, Holland Landing, ON", category: "Marina & Resort", link: "https://welcomeeg.ca/" },
  { name: "Routes Connecting Communities", community: "Mount Albert", location: "The Link — 20849 Dalton Rd, Mount Albert, ON", category: "Community Transportation", link: "https://routescc.org/" },
  { name: "Salvation Army East Gwillimbury Community Church", community: "Sharon", location: "1816 Metro Rd N, Sharon, ON", category: "Community & Place of Worship", "link": "https://www.salvationarmy.ca/" },
  { name: "Shades of Hope Wildlife Refuge", community: "Queensville", location: "8700 Highway 48, Queensville, ON", category: "Wildlife Rescue & Education", link: "https://shadesofhope.ca/" },
  { name: "Sibbald Point Provincial Park", community: "Mount Albert", location: "26071 Park Rd, Mount Albert, ON", category: "Provincial Park & Camping", link: "https://www.ontarioparks.com/park/sibbaldpoint" },
  { name: "Stephen Leacock Theatre", community: "Holland Landing", location: "130 Gwendolyn Blvd, Holland Landing, ON", category: "Theatre & Performing Arts", link: "https://www.georgina.ca/leacock-theatre" },
  { name: "Mount Albert Agricultural Society & Fairgrounds", community: "Mount Albert", location: "3 Fairpark Lane, Mount Albert, ON", category: "Fairgrounds & Events", link: "https://mount albertfair.com/" },
  { name: "Mount Albert Arena & Community Centre", community: "Mount Albert", location: "48 Hawkins St, Mount Albert, ON", category: "Arena & Community Complex", link: "https://www.georgina.ca/" },
  { name: "Mount Albert Legion Branch 356", community: "Mount Albert", location: "21 Cassells St, Mount Albert, ON", category: "Veterans & Community Hall", link: "https://mount albertlegion.org/" },
  { name: "The Belvedere Cookhouse & Saloon", community: "Queensville", location: "Highway 48, Queensville, ON", category: "Dining & Restaurant", link: "https://welcomeeg.ca/dining" },
  { name: "The Briars Resort & Spa", community: "Sharon", location: "55 Hedge Rd, Sharon, ON", category: "Resort & Event Venue", link: "https://www.briars.ca/" },
  { name: "The Link (East Gwillimbury Arts & Community Centre)", community: "Mount Albert", location: "20849 Dalton Rd, Mount Albert, ON", category: "Community & Arts Hub", link: "https://www.georgina.ca/thelink" },
  { name: "The Queensway South Commercial Hub", community: "Holland Landing", location: "The Queensway S, Holland Landing, ON", category: "Retail & Shopping Area", link: "https://welcomeeg.ca/sales" },
  { name: "The ROC (Recreational Outdoor Campus)", community: "Holland Landing", location: "26479 Civic Centre Rd, Holland Landing, ON", category: "Outdoor Sports & Recreation", link: "https://www.georgina.ca/roc" },
  { name: "The Salvation Army Sharon Conference Centre", community: "Sharon", location: "36 Salvation Army Rd, Sharon, ON", category: "Conference Centre & Camp", link: "https://www.salvationarmy.ca/" },
  { name: "Town of East Gwillimbury (Civic Centre)", community: "Holland Landing", location: "26557 Civic Centre Rd, Holland Landing, ON", category: "Municipal Government", link: "https://www.georgina.ca/" },
  { name: "Brown Hill Community Hall & Park", community: "Brown Hill", location: "24 Victoria Road, Brown Hill, ON", category: "Community Hall & Venue", link: "https://www.georgina.ca/living-here/community-centres/brown hill-community-hall" },
  { name: "Brown Hill-Leaskdale Lions Club", community: "Brown Hill", location: "24 Victoria Road, Brown Hill, ON", category: "Community Service & Hall", link: "https://www.e-clubhouse.org/sites/brown hillleaskdale/" },
  { name: "Virginia Beach Pier & Marina", community: "Virginia", location: "Virginia Beach Rd, Virginia, ON", category: "Waterfront & Pier", link: "https://www.georgina.ca/" },
  { name: "Whipper Billy Watson Park", community: "Holland Landing", location: "Miami Dr & Lake Dr, Holland Landing, ON", category: "Recreation & Parks", link: "https://www.georgina.ca/" },
  { name: "River Drive Park Park & Conservation Area", community: "River Drive Park", location: "Lake Dr E, River Drive Park, ON", category: "Waterfront & Beach", link: "https://www.georgina.ca/" }
];

export default function Directory() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [dbListings, setDbListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [approvedEvents, setApprovedEvents] = useState([]);

  // Search & Filter state derived from searchParams or component state
  const currentLetter = (searchParams.get('letter') || 'ALL').toUpperCase();
  const currentPage = parseInt(searchParams.get('page') || '1', 10);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCommunity, setSelectedCommunity] = useState('All');
  const [hiddenGemsOnly, setHiddenGemsOnly] = useState(false);
  const [claimedIds, setClaimedIds] = useState(new Set());
  const [claimTarget, setClaimTarget] = useState(null);
  const [claimNotice, setClaimNotice] = useState(null);
  const claimTokenHandledRef = useRef('');

  useEffect(() => {
    const token = searchParams.get('claim_token');
    if (!token || claimTokenHandledRef.current === token) return;
    claimTokenHandledRef.current = token;

    const next = new URLSearchParams(searchParams);
    next.delete('claim_token');
    setSearchParams(next, { replace: true });

    if (!/^[0-9a-f-]{16,128}$/i.test(token.trim())) {
      setClaimNotice({ tone: 'bad', text: 'Could not confirm that claim link.' });
      return;
    }

    (async () => {
      try {
        const { data } = await supabase.rpc('wg_confirm_business_claim', { token_input: token.trim() });
        if (data && data.success) {
          setClaimNotice({ tone: 'ok', text: `Email confirmed! Your claim for "${data.business_name}" has been sent to our admin team for verification.` });
        } else {
          setClaimNotice({ tone: 'bad', text: (data && data.error) || 'Could not confirm that claim link.' });
        }
      } catch (_) {
        setClaimNotice({ tone: 'bad', text: 'Could not confirm that claim link.' });
      }
    })();
  }, [searchParams, setSearchParams]);

  // Load active businesses / venues from Supabase directory_listings
  useEffect(() => {
    let isMounted = true;
    async function loadDirectoryData() {
      try {
        setLoading(true);
        // 1. Primary: Load curated, verified, and admin-managed directory listings
        const { data: listingsData, error: listErr } = await supabase
          .from('directory_listings')
          .select('*')
          .eq('status', 'approved')
          .order('name', { ascending: true });

        // Load approved published events to calculate per-business published event counters
        const { data: eventsList } = await supabase
          .from('vendor_events')
          .select('id, slug, business_name, title, location')
          .eq('status', 'approved').or(notEndedFilter());

        if (eventsList && eventsList.length > 0 && isMounted) {
          setApprovedEvents(eventsList);
        }

        if (listingsData && listingsData.length > 0 && isMounted) {
          setDbListings(listingsData);
          supabase.rpc('wg_claimed_business_ids').then(({ data: ids }) => {
            if (isMounted && Array.isArray(ids)) setClaimedIds(new Set(ids));
          }).catch(() => {});
          return;
        }

        // 2. Fallback: vendor_events if directory_listings is not populated
        const { data: eventsData } = await supabase
          .from('vendor_events')
          .select('business_name, location, category, community, link')
          .eq('status', 'approved').or(notEndedFilter());

        if (eventsData && isMounted) {
          const mapped = eventsData
            .filter(it => it.business_name && it.business_name.trim().length > 2)
            .map(it => ({
              name: it.business_name.trim(),
              location: it.location || 'East Gwillimbury, ON',
              community: it.community || 'East Gwillimbury',
              category: formatCategoryLabel(it.category || 'Local Business'),
              link: it.link || ''
            }));
          setDbListings(mapped);
        }
      } catch (err) {
        console.warn('Notice: Loading directory listings:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadDirectoryData();
    return () => { isMounted = false; };
  }, []);

  // Merge and deduplicate directory listings with curated fallback
  const allListings = useMemo(() => {
    const rawListings = (dbListings && dbListings.length > 0)
      ? dbListings.map(item => ({
          ...item,
          name: item.name || item.business_name,
          category: formatCategoryLabel(item.category || 'Local Business'),
          community: item.community || 'East Gwillimbury',
          location: item.location || 'East Gwillimbury, ON',
          link: item.link || '',
          phone: item.phone || ''
        }))
      : CURATED_GEORGINA_DIRECTORY;

    return [...rawListings].sort((a, b) => {
      const nameA = getAlphabeticalSortName(a.name);
      const nameB = getAlphabeticalSortName(b.name);
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    });
  }, [dbListings]);

  // Map of matched approved published events for each business listing
  const businessEventsMap = useMemo(() => {
    const map = {};
    if (!approvedEvents || approvedEvents.length === 0) return map;

    const cleanStr = (s) => {
      if (!s) return '';
      return s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, ' ');
    };

    allListings.forEach(item => {
      const lName = cleanStr(item.name);
      if (!lName) return;
      const matched = [];

      approvedEvents.forEach(evt => {
        const bName = cleanStr(evt.business_name);
        const eLoc = cleanStr(evt.location);
        const eTitle = cleanStr(evt.title);

        if (bName && (bName.includes(lName) || lName.includes(bName))) {
          matched.push(evt);
        } else if (lName && (eLoc.includes(lName) || eTitle.includes(lName))) {
          matched.push(evt);
        }
      });

      map[item.name] = matched;
    });

    return map;
  }, [allListings, approvedEvents]);

  // Incremental published event counter for each business listing
  const eventCounts = useMemo(() => {
    const counts = {};
    Object.keys(businessEventsMap).forEach(name => {
      counts[name] = businessEventsMap[name].length;
    });
    return counts;
  }, [businessEventsMap]);


  // Letter counts for Alphabetical Nav Bar (ignoring leading "The")
  const letterCounts = useMemo(() => {
    const counts = { ALL: allListings.length };
    ALPHABET.forEach(letter => {
      if (letter !== 'ALL') counts[letter] = 0;
    });
    allListings.forEach(item => {
      const firstChar = getAlphabeticalFirstLetter(item.name);
      if (counts[firstChar] !== undefined) {
        counts[firstChar]++;
      }
    });
    return counts;
  }, [allListings]);

  // Filter listings based on letter, search term, and community
  const filteredListings = useMemo(() => {
    return allListings.filter(item => {
      // Letter filter (ignoring leading "The"). A typed search looks through every letter.
      if (currentLetter !== 'ALL' && !searchTerm.trim()) {
        const firstChar = getAlphabeticalFirstLetter(item.name);
        if (firstChar !== currentLetter) return false;
      }

      // Community filter
      if (selectedCommunity !== 'All') {
        const c1 = (item.community || '').toLowerCase();
        const c2 = selectedCommunity.toLowerCase();
        if (!c1.includes(c2) && !(item.location || '').toLowerCase().includes(c2)) return false;
      }

      // Search keyword filter (forgiving plurals + typos)
      if (searchTerm.trim()) {
        const haystack = `${item.name || ''} ${item.location || ''} ${item.category || ''} ${item.community || ''}`;
        if (!matchesQuery(haystack, searchTerm)) return false;
      }

      // Hidden Gems filter: businesses without a website or without active published events
      if (hiddenGemsOnly) {
        const hasExt = hasMerchantLink(item.link);
        const hasEvts = (businessEventsMap[item.name] || []).length > 0;
        if (hasExt && hasEvts) return false;
      }

      return true;
    });
  }, [allListings, currentLetter, selectedCommunity, searchTerm, hiddenGemsOnly, businessEventsMap]);

  // Pagination (50 items per page)
  const totalPages = Math.max(1, Math.ceil(filteredListings.length / PAGE_SIZE));
  const validPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedListings = useMemo(() => {
    const startIndex = (validPage - 1) * PAGE_SIZE;
    return filteredListings.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredListings, validPage]);

  // Handle URL updates for Letter and Page changes
  const updateNavigation = (letter, page = 1) => {
    const params = new URLSearchParams(searchParams);
    if (letter && letter !== 'ALL') {
      params.set('letter', letter);
    } else {
      params.delete('letter');
    }

    if (page > 1) {
      params.set('page', String(page));
    } else {
      params.delete('page');
    }

    setSearchParams(params);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const setPage = (newPage) => {
    updateNavigation(currentLetter, newPage);
  };

  const setLetter = (newLetter) => {
    updateNavigation(newLetter, 1);
  };

  return (
    <div className="max-w-[1440px] w-full mx-auto px-4 md:px-8 lg:px-12 py-8">
      {/* 1. Breadcrumbs Linking Alphabetical Directory Pages */}
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-500 mb-6">
        <Link to="/" className="hover:text-lake-800 flex items-center gap-1 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Home</span>
        </Link>
        <span>/</span>
        <button
          type="button"
          onClick={() => setLetter('ALL')}
          className={`hover:text-lake-800 transition-colors ${currentLetter === 'ALL' && validPage === 1 ? 'text-gray-900 font-bold' : ''}`}
        >
          A — Z Business Directory
        </button>

        {currentLetter !== 'ALL' && (
          <>
            <span>/</span>
            <span className="text-lake-800 font-bold">
              Letter {currentLetter} ({filteredListings.length} {filteredListings.length === 1 ? 'listing' : 'listings'})
            </span>
          </>
        )}

        {totalPages > 1 && (
          <>
            <span>/</span>
            <span className="text-gray-900 font-bold">
              Page {validPage} of {totalPages}
            </span>
          </>
        )}
      </nav>

      {/* 2. Hero Header — Design B East Gwillimbury Atmospheric Sunset */}
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
            <span>({allListings.length}+) Verified Businesses &bull; East Gwillimbury Location Registry</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight font-display text-white leading-[1.1] mb-4">
            A — Z Business &amp; Location Directory
          </h1>

          <p className="text-blue-100 text-sm sm:text-base md:text-lg font-medium leading-relaxed max-w-2xl">
            Explore verified local businesses, recreation centres, municipal landmarks, community halls, event venues, and services across Holland Landing, Mount Albert, Jackson&apos;s Point, Queensville, and all of East Gwillimbury.
          </p>

          <div className="flex flex-wrap items-center gap-3 sm:gap-4 mt-8 text-xs font-bold text-blue-200">
            <span className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 text-xs font-bold text-blue-100">
              <Store className="w-4 h-4 text-sun-300" />
              <span>{allListings.length}+ Verified Establishments</span>
            </span>
            <span className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 text-xs font-bold text-blue-100">
              <Compass className="w-4 h-4 text-emerald-300" />
              <span>50 Listings Per Directory Page</span>
            </span>
          </div>
        </div>
      </div>

      {/* 3. Alphabetical Breadcrumb / Jump Bar (A — Z) */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-black uppercase tracking-wider text-gray-500">
            Alphabetical Index (A — Z):
          </span>
          {currentLetter !== 'ALL' && (
            <button
              type="button"
              onClick={() => setLetter('ALL')}
              className="text-xs font-bold text-lake-800 hover:underline"
            >
              Reset to Full Directory (All)
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {ALPHABET.map(letter => {
            const count = letterCounts[letter] || 0;
            const isSelected = currentLetter === letter;
            const hasItems = count > 0;

            return (
              <button
                key={letter}
                type="button"
                disabled={!hasItems && letter !== 'ALL'}
                onClick={() => setLetter(letter)}
                title={`${letter === 'ALL' ? 'All Letters' : `Letter ${letter}`}: ${count} listings`}
                className={`min-w-9 h-9 px-2 rounded-xl text-xs font-black uppercase transition-all flex items-center justify-center gap-1 ${
                  isSelected
                    ? 'bg-lake-800 text-white shadow-sm'
                    : hasItems
                      ? 'bg-gray-100 text-gray-800 hover:bg-gray-200 hover:text-blue-950'
                      : 'bg-gray-50 text-gray-300 cursor-not-allowed'
                }`}
              >
                <span>{letter}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Search & Community Filter Toolbar */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 md:p-6 shadow-sm mb-8 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Keyword Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                if (validPage !== 1) setPage(1);
              }}
              placeholder="Search by business name, venue, street address, or category..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 text-xs sm:text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-lake-800"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setHiddenGemsOnly(v => !v);
              if (validPage !== 1) setPage(1);
            }}
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider border transition-colors shrink-0 ${
              hiddenGemsOnly
                ? 'bg-amber-400 text-amber-950 border-amber-500 shadow-xs'
                : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
            }`}
            title="Show local businesses without a website or without current published events"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Hidden Gems</span>
          </button>

          {/* Reset Filters */}
          {(searchTerm || selectedCommunity !== 'All' || currentLetter !== 'ALL' || hiddenGemsOnly) && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setSelectedCommunity('All');
                setHiddenGemsOnly(false);
                setLetter('ALL');
              }}
              className="px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition-colors whitespace-nowrap"
            >
              Clear Filters
            </button>
          )}
        </div>

        {/* Community Pills */}
        <div>
          <span className="text-[11px] font-black uppercase tracking-wider text-gray-500 block mb-2">
            Filter by Community:
          </span>
          <div className="flex flex-wrap gap-2">
            {GEORGINA_COMMUNITIES.map(comm => (
              <button
                key={comm}
                type="button"
                onClick={() => {
                  setSelectedCommunity(comm);
                  if (validPage !== 1) setPage(1);
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  selectedCommunity === comm
                    ? 'bg-lake-800 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
                }`}
              >
                {comm}
              </button>
            ))}
          </div>
        </div>
      </div>

      {claimNotice && (
        <div className={`mb-6 p-4 rounded-2xl border text-sm font-bold ${claimNotice.tone === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
          {claimNotice.text}
        </div>
      )}

      {/* 5. Directory Stats Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 px-1 text-xs text-gray-600 font-semibold">
        <div>
          Showing <strong className="text-gray-900">{filteredListings.length === 0 ? 0 : (validPage - 1) * PAGE_SIZE + 1}</strong> – <strong className="text-gray-900">{Math.min(validPage * PAGE_SIZE, filteredListings.length)}</strong> of <strong className="text-gray-900">{filteredListings.length}</strong> establishments
          {currentLetter !== 'ALL' && <span> under letter <strong className="text-lake-800 font-bold">"{currentLetter}"</strong></span>}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-1 font-bold text-gray-700">
            <span>Page {validPage} of {totalPages}</span>
          </div>
        )}
      </div>

      {/* 6. Directory Cards Grid (50 per page) */}
      {paginatedListings.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
          {paginatedListings.map((item, idx) => {
            const hasExternal = item.link && item.link.startsWith('http');
            const mapQuery = `${item.name}, ${item.location || ''}${item.location && item.location.toLowerCase().includes('georgina') ? '' : ', East Gwillimbury, ON'}`.trim();
            const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`;

            return (
              <div
                key={`${item.name}-${idx}`}
                className={CARD_SHELL_CLASS}
              >
                <div className={`h-2 ${getCardStripeClass(item.category, 'lake')}`} aria-hidden="true" />
                <div className="p-5 flex-1 flex flex-col justify-between min-w-0">
                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h2 className="font-display text-lg font-extrabold text-lake-950 leading-snug">
                      {item.slug ? (
                        <Link to={businessPath(item)} className="hover:text-lake-800 hover:underline">{item.name}</Link>
                      ) : item.name}
                    </h2>
                    <span className="shrink-0 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-lake-100 text-lake-900 border border-lake-200">
                      {item.community}
                    </span>
                  </div>

                  <a
                    href={gmapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-emerald-800 font-semibold mb-3 hover:text-emerald-900 hover:underline group/loc"
                    title={`Open ${item.name} location in Google Maps`}
                  >
                    <MapPin className="w-3.5 h-3.5 text-coral-600 shrink-0 group-hover/loc:scale-110 transition-transform" />
                    <span className="truncate">{item.location}</span>
                  </a>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-lake-50 text-lake-900 border border-lake-100 text-[11px] font-bold">
                      <Tag className="w-3 h-3 text-coral-600" />
                      <span>{item.category}</span>
                    </div>

                    {((businessEventsMap[item.name] || []).length > 0) ? (
                      <Link
                        to={item.slug ? businessPath(item) : `/businesses/${generateSlug(item.name)}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors bg-blue-50 text-lake-800 border-blue-200 hover:bg-lake-800 hover:text-white group/evt"
                        title={(businessEventsMap[item.name].length === 1)
                          ? `View published event page for ${item.name}`
                          : `View ${businessEventsMap[item.name].length} published events for ${item.name}`
                        }
                      >
                        <Calendar className="w-3 h-3 text-lake-800 group-hover/evt:text-white transition-colors" />
                        <span>{businessEventsMap[item.name].length} {businessEventsMap[item.name].length === 1 ? 'Published Event' : 'Published Events'}</span>
                        <ExternalLink className="w-2.5 h-2.5 opacity-60 group-hover/evt:text-white transition-colors ml-0.5" />
                      </Link>
                    ) : (
                      <Link
                        to="/submission?tab=events"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border border-dashed border-gray-300 text-gray-500 hover:border-lake-800 hover:text-lake-800 hover:bg-blue-50/50 transition-colors"
                        title={`Submit an upcoming event for ${item.name}`}
                      >
                        <Calendar className="w-3 h-3 text-gray-400" />
                        <span>Submit an Event &rarr;</span>
                      </Link>
                    )}
                  </div>
                </div>

                <div className="px-5 py-3.5 -mx-5 -mb-5 mt-4 bg-lake-50/60 border-t border-lake-100 flex flex-wrap items-center justify-between gap-2">
                  <a
                    href={gmapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-emerald-800 hover:underline flex items-center gap-1.5 group/map"
                    title={`Open ${item.name} in Google Maps`}
                  >
                    <MapPin className="w-3.5 h-3.5 text-coral-600 shrink-0 group-hover/map:scale-110 transition-transform" />
                    <span>Directions &amp; Reviews</span>
                    <ExternalLink className="w-3 h-3 text-emerald-800 group-hover/map:text-emerald-900" />
                  </a>

                  <div className="flex items-center gap-2 flex-wrap">
                    {item.id && (
                      <button
                        type="button"
                        onClick={() => setClaimTarget(item)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors inline-flex items-center gap-1 ${
                          claimedIds.has(item.id)
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                            : 'bg-white text-lake-800 border-lake-200 hover:bg-lake-50'
                        }`}
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>{claimedIds.has(item.id) ? 'Verified' : 'Claim'}</span>
                      </button>
                    )}
                    <Link
                      to={item.slug ? businessPath(item) : `/businesses/${generateSlug(item.name)}`}
                      className="px-4 py-1.5 rounded-full bg-lake-800 hover:bg-coral-600 text-white text-xs font-black transition-colors flex items-center gap-1.5"
                    >
                      <span>Business Page</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-12 text-center rounded-3xl bg-gray-50 border border-gray-200 mb-10">
          <Building className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h3 className="text-base font-black text-gray-900 mb-1">No Establishments Found</h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto mb-4">
            No businesses or venues match your active filters. Try resetting the alphabet filter or searching for another term.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              setSelectedCommunity('All');
              setLetter('ALL');
            }}
            className="px-5 py-2.5 rounded-xl bg-lake-800 text-white text-xs font-bold uppercase tracking-wider"
          >
            Show All Listings
          </button>
        </div>
      )}

      {/* 7. Alphabetical Pagination Controls (50 per page) */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-white border border-gray-200 shadow-sm">
          <div className="text-xs font-bold text-gray-600">
            Page {validPage} of {totalPages} ({filteredListings.length} total listings)
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={validPage <= 1}
              onClick={() => setPage(validPage - 1)}
              className="px-3.5 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>

            {Array.from({ length: totalPages }).map((_, i) => {
              const pNum = i + 1;
              return (
                <button
                  key={pNum}
                  type="button"
                  onClick={() => setPage(pNum)}
                  className={`w-9 h-9 rounded-xl text-xs font-black transition-all ${
                    validPage === pNum
                      ? 'bg-lake-800 text-white shadow-sm'
                      : 'border border-gray-300 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {pNum}
                </button>
              );
            })}

            <button
              type="button"
              disabled={validPage >= totalPages}
              onClick={() => setPage(validPage + 1)}
              className="px-3.5 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
      <ClaimBusinessModal
        business={claimTarget}
        isOpen={Boolean(claimTarget)}
        alreadyClaimed={Boolean(claimTarget && claimedIds.has(claimTarget.id))}
        onClose={() => setClaimTarget(null)}
      />
    </div>
  );
}
