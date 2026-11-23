import React, { useState, useRef, useMemo, useEffect } from 'react';
import { PUBLIC_LISTING_COLUMNS, notEndedFilter } from '../utils/links';



import {



  Link, useNavigate } from 'react-router-dom';



import {



  MapContainer, TileLayer, Circle, Popup } from 'react-leaflet';



import {



  Search,



  ChevronLeft,



  ChevronRight,



  X,



  Sparkles,



  Calendar as CalendarIcon,



  MapPin,



  Clock,



  Tag,



  Users,



  PartyPopper,



  Store,



  Music,



  Trees,



  Utensils,



  ArrowRight,



  Bookmark,



  CheckCircle2,



  Gift,



  Percent,



  Flame,



  Compass,



  ExternalLink,
  CalendarDays,
  Landmark,
  Mail,
  Mailbox,
  Waves,
  Plus,
  ChevronDown,
  Archive,
  Baby,
  ShoppingBag,
  Dumbbell,
  Palette,
  HeartHandshake,
  Briefcase,
  CloudSun
} from 'lucide-react';
import { Reveal, Stagger, StaggerItem } from '../components/Reveal.jsx';
import ScrollSheen from '../components/ScrollSheen.jsx';
import { buildSearchSuggestions, mergeWithSponsors } from '../utils/searchSuggestions.js';
import { matchesQuery } from '../utils/fuzzySearch.js';
import { recordSponsorClick, recordSponsorImpressions } from '../utils/links.js';




import 'leaflet/dist/leaflet.css';



import {



  supabase } from '../supabaseClient';



import {

  formatDDMonthYYYY,



  isToday, 



  isThisWeekend, 



  isEndingSoon, 



  isExpired, 



  countNewListings, 



  getLastVisitTimestamp, 



  recordVisitTimestamp,



  isItemSaved,



  toggleSaveItem,



  generateSlug,



  parseToMidnight,



  getTorontoTodayMidnight,



  formatCategoryLabel,



  parseEventOffsets,



  matchEventToCalendarDay,



  sortEventsForCalendarDay,

  getCategoryBadgeStyle,

  isOutOfAreaLocation,

  formatLocationDisplay,
  DISCOVERY_CATEGORIES
} from '../services/discoveryService';







const EVENT_CATEGORIES = [



  'All',



  'Community',



  'Festivals & Markets',



  'Farms, Markets & Garage Sales',



  'Concerts & Shows',



  'Sports & Outdoors',



  'Food & Drink',



  'Kids & Family'



];







const GEORGINA_REGIONS = [
  { name: 'Holland Landing', center: [44.099, -79.489], radius: 2200, color: '#f43f5e' },
  { name: 'Queensville', center: [44.142, -79.450], radius: 2000, color: '#14b8a6' },
  { name: 'Sharon', center: [44.100, -79.434], radius: 1800, color: '#ec4899' },
  { name: 'Mount Albert', center: [44.141, -79.314], radius: 2200, color: '#8b5cf6' },
  { name: 'River Drive Park', center: [44.156, -79.502], radius: 1500, color: '#3b82f6' },
  { name: 'Holt', center: [44.146, -79.365], radius: 1500, color: '#10b981' },
  { name: 'Franklin', center: [44.186, -79.393], radius: 1500, color: '#06b6d4' },
  { name: 'Brown Hill', center: [44.195, -79.335], radius: 1500, color: '#a855f7' },
  { name: 'Ravenshoe', center: [44.206, -79.383], radius: 1500, color: '#fb923c' },
];

const BASE_EVENTS = [];

const NEIGHBORHOOD_DATA = {
  holland_landing: {
    name: 'Holland Landing',
    tagline: 'Riverfront Village',
    badgeClass: 'bg-blue-100 text-[#00008b]',
    venueCount: 18,
    desc: 'Historic river-side village with Anchor Park, Holland River trails, and community hubs.',
    weatherSlug: 'holland-landing',
    pins: [
      { name: 'Anchor Park', desc: 'Holland River • Waterfront & Boat Launch', color: 'bg-blue-400', query: 'Anchor Park, Holland Landing, ON' },
      { name: 'Holland Landing Community Centre', desc: '19513 Yonge St • Programs & Events', color: 'bg-rose-400', query: 'Holland Landing Community Centre, Holland Landing, ON' },
      { name: 'Holland River Trail', desc: 'Yonge St Corridor • Scenic Walking Trail', color: 'bg-emerald-400', query: 'Holland River Trail, Holland Landing, ON' }
    ]
  },
  queensville: {
    name: 'Queensville',
    tagline: 'Growing Hub',
    badgeClass: 'bg-teal-100 text-teal-800',
    venueCount: 14,
    desc: 'Known for new residential development and the Health and Active Living Plaza.',
    weatherSlug: 'queensville',
    pins: [
      { name: 'Health and Active Living Plaza', desc: 'Queensville • Library, Pool & Fitness', color: 'bg-teal-400', query: 'Health and Active Living Plaza, Queensville, ON' },
      { name: 'Queensville Park', desc: 'Queensville Side Rd • Sports & Trails', color: 'bg-blue-400', query: 'Queensville Park, Queensville, ON' },
      { name: 'Leslie Street Corridor', desc: 'Leslie St • Local Shops & Dining', color: 'bg-amber-400', query: 'Queensville, East Gwillimbury, ON' }
    ]
  },
  sharon: {
    name: 'Sharon',
    tagline: 'Arts & Heritage',
    badgeClass: 'bg-purple-100 text-purple-800',
    venueCount: 16,
    desc: 'Historic hamlet home to the Sharon Temple National Historic Site and the Civic Centre.',
    weatherSlug: 'sharon',
    pins: [
      { name: 'Sharon Temple National Historic Site', desc: '18974 Leslie St • Museum & Gardens', color: 'bg-purple-400', query: 'Sharon Temple, 18974 Leslie St, Sharon, ON' },
      { name: 'East Gwillimbury Civic Centre', desc: '19000 Leslie St • Music & Market Nights', color: 'bg-rose-400', query: '19000 Leslie St, Sharon, ON' },
      { name: 'East Gwillimbury Sports Complex', desc: '1914B Mount Albert Rd • Arena & Events', color: 'bg-blue-400', query: 'East Gwillimbury Sports Complex, Sharon, ON' }
    ]
  },
  mount_albert: {
    name: 'Mount Albert',
    tagline: 'Small-Town Charm',
    badgeClass: 'bg-amber-100 text-amber-900',
    venueCount: 12,
    desc: 'Small-town character with residential charm, Lions Community Centre, and local fairs.',
    weatherSlug: 'mount-albert',
    pins: [
      { name: 'Mount Albert Lions Community Centre', desc: '5057 Mount Albert Rd • Fairs & Gatherings', color: 'bg-amber-400', query: 'Mount Albert Lions Community Centre, Mount Albert, ON' },
      { name: 'Vivian Creek Park', desc: 'Mount Albert • Trails & Green Space', color: 'bg-emerald-400', query: 'Vivian Creek Park, Mount Albert, ON' },
      { name: 'Downtown Mount Albert', desc: 'Centre St • Local Cafes & Markets', color: 'bg-blue-400', query: 'Centre St, Mount Albert, ON' }
    ]
  }
};

// ---------------------------------------------------------------------------
// Design B presentation constants (UI only)
// ---------------------------------------------------------------------------
// Community picker: values match the hero <select> / handleSearchSubmit `community` param.
// x/y = position on the stylised East Gwillimbury SVG (viewBox -40 0 440 290).
const COMMUNITY_PICKER = [
  { value: 'east_gwillimbury', label: 'All East Gwillimbury' },
  { value: 'river_drive_park', label: 'River Drive Park', x: 35, y: 82, lx: 12, ly: 4, anchor: 'start' },
  { value: 'holland_landing', label: 'Holland Landing', x: 48, y: 222, lx: 12, ly: 5, anchor: 'start' },
  { value: 'ravenshoe', label: 'Ravenshoe', x: 185, y: 36, lx: 0, ly: -12, anchor: 'middle' },
  { value: 'brown_hill', label: 'Brown Hill', x: 305, y: 48, lx: 12, ly: 4, anchor: 'start' },
  { value: 'franklin', label: 'Franklin', x: 195, y: 92, lx: 12, ly: 4, anchor: 'start' },
  { value: 'queensville', label: 'Queensville', x: 145, y: 152, lx: -12, ly: 4, anchor: 'end' },
  { value: 'holt', label: 'Holt', x: 245, y: 146, lx: 12, ly: 4, anchor: 'start' },
  { value: 'sharon', label: 'Sharon', x: 155, y: 232, lx: 12, ly: 5, anchor: 'start' },
  { value: 'mount_albert', label: 'Mount Albert', x: 335, y: 170, lx: -12, ly: 22, anchor: 'middle' }
];

const WEEKEND_DAY_THEME = {
  friday: { block: 'bg-lake-600 text-white', stripe: 'bg-lake-500' },
  saturday: { block: 'bg-coral-600 text-white', stripe: 'bg-coral-600' },
  sunday: { block: 'bg-sun-400 text-lake-950', stripe: 'bg-sun-400' }
};

const CATEGORY_TILE_ICONS = {
  'Community Events': Users,
  'Family Friendly': Baby,
  'Food & Drink': Utensils,
  'Shopping': ShoppingBag,
  'Live Entertainment': Music,
  'Markets': Store,
  'Sports & Recreation': Dumbbell,
  'Arts & Culture': Palette,
  'Community': HeartHandshake,
  'Business & Networking': Briefcase
};

// Colour-shift on hover (no scale, so no layout shift). All pairs meet WCAG AA for large text.
const CATEGORY_TILE_PALETTES = [
  'bg-lake-800 text-white hover:bg-coral-600',
  'bg-coral-600 text-white hover:bg-sun-400 hover:text-lake-950',
  'bg-sun-400 text-lake-950 hover:bg-coral-600 hover:text-white',
  'bg-lake-100 text-lake-950 hover:bg-lake-800 hover:text-white',
  'bg-coral-100 text-lake-950 hover:bg-coral-600 hover:text-white'
];

const EXPLORE_TILES = [
  { to: '/directory', title: 'Local businesses', desc: 'Browse the A–Z directory', icon: Store },
  { to: '/dining', title: 'Dining specials', desc: 'Eat in, take out & deals', icon: Utensils },
  { to: '/sales', title: 'Sales & deals', desc: 'Garage sales & markdowns', icon: Tag },
  { to: '/weather', title: '7-day weather', desc: 'Forecasts by community', icon: CloudSun }
];

function Home() {



  const navigate = useNavigate();



  const [searchTerm, setSearchTerm] = useState('');



  const [selectedCategory, setSelectedCategory] = useState('All');



  const [liveEvents, setLiveEvents] = useState([]);
  // Raw approved vendor_events rows (events + dining + sales) for "Try searching" suggestions
  const [suggestionRows, setSuggestionRows] = useState([]);
  // Paid "Try searching" keywords that are live right now (staff/search-sponsors.html)
  const [searchSponsors, setSearchSponsors] = useState([]);
  const [scheduledSpotlightId, setScheduledSpotlightId] = useState(null);
  const searchSuggestions = useMemo(
    () => mergeWithSponsors(searchSponsors, buildSearchSuggestions(suggestionRows, { rng: Math.random })),
    [searchSponsors, suggestionRows]
  );
  useEffect(() => {
    let alive = true;
    supabase.rpc('wg_active_search_sponsors').then(({ data, error }) => {
      if (alive && !error && Array.isArray(data)) setSearchSponsors(data);
    }).catch(() => {});
    // Admin-scheduled spotlight listing (staff/spotlight.html), shown in the Weekend Spotlight card
    supabase.rpc('wg_active_spotlight').then(({ data, error }) => {
      if (alive && !error && typeof data === 'string') setScheduledSpotlightId(data);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Record sponsor impressions once per page view for visible sponsored spots
  const recordedImpressionsRef = useRef(new Set());
  useEffect(() => {
    const sponsoredIds = searchSuggestions
      .filter((s) => s.kind === 'sponsored' && s.sponsorId)
      .map((s) => s.sponsorId)
      .filter((id) => !recordedImpressionsRef.current.has(id));

    if (sponsoredIds.length > 0) {
      sponsoredIds.forEach((id) => recordedImpressionsRef.current.add(id));
      recordSponsorImpressions(supabase, sponsoredIds, 'home-search');
    }
  }, [searchSuggestions]);



  const [liveSales, setLiveSales] = useState([]);



  const [selectedModalEvent, setSelectedModalEvent] = useState(null);



  const [selectedDayModal, setSelectedDayModal] = useState(null);



  const [newCount, setNewCount] = useState(0);



  const [savedUpdate, setSavedUpdate] = useState(0);


  const [searchCommunity, setSearchCommunity] = useState('east_gwillimbury');
  const [searchTiming, setSearchTiming] = useState('weekend');
  const [selectedInspectorDayIndex, setSelectedInspectorDayIndex] = useState(0);
  const [selectedNeighborhood, setSelectedNeighborhood] = useState('holland_landing');
  const [briefingFirstName, setBriefingFirstName] = useState('');
  const [briefingLastName, setBriefingLastName] = useState('');
  const [briefingEmail, setBriefingEmail] = useState('');
  const [isBriefingSubmitting, setIsBriefingSubmitting] = useState(false);
  const [briefingStatus, setBriefingStatus] = useState(null); // { success: boolean, msg: string }

  const handleBriefingSubscribe = async (e) => {
    e.preventDefault();
    if (!briefingFirstName.trim() || !briefingLastName.trim()) {
      setBriefingStatus({ success: false, msg: 'Please provide both First Name and Last Name.' });
      return;
    }
    if (!briefingEmail || !briefingEmail.includes('@')) {
      setBriefingStatus({ success: false, msg: 'Please enter a valid email address.' });
      return;
    }
    setIsBriefingSubmitting(true);
    try {
      const cleanEmail = briefingEmail.trim().toLowerCase();
      const fName = briefingFirstName.trim();
      const lName = briefingLastName.trim();
      const fullName = `${fName} ${lName}`;

      // Same flow as the /subscribe page: register as pending via secure RPC (double opt-in token)
      const { data: subData, error: rpcError } = await supabase.rpc('register_newsletter_subscriber', {
        email_input: cleanEmail,
        first_name_input: fName,
        area_input: 'All East Gwillimbury',
        audience_input: 'reader',
        thursday_input: true,
        monday_input: true
      });

      if (rpcError) {
        console.warn('Subscription RPC note:', rpcError);
        // Fallback upsert if RPC fails
        await supabase.from('newsletter_subscribers').upsert([{
          email: cleanEmail,
          first_name: fName,
          last_name: lName,
          name: fullName,
          audience_type: 'reader',
          community_area: 'All East Gwillimbury',
          status: 'pending',
          wants_monday: true,
          wants_thursday: true,
          source: 'home_briefing_band'
        }], { onConflict: 'email' });
      } else {
        await supabase.from('newsletter_subscribers').update({
          last_name: lName,
          name: fullName
        }).eq('email', cleanEmail);
      }

      // Dispatch double-opt-in confirmation email with token
      try {
        await supabase.functions.invoke('send-email', {
          body: {
            formType: 'newsletter_signup',
            record: {
              ...(subData || {}),
              email: cleanEmail,
              first_name: fName,
              last_name: lName,
              audience_type: 'reader',
              community_area: 'All East Gwillimbury',
              token: subData?.token || ''
            }
          }
        });
      } catch (fErr) {
        console.warn('Send-email function notice:', fErr);
      }

      setBriefingStatus({ success: true, msg: 'Thank you! Check your inbox (and Spam/Junk folder) and click the link to confirm your subscription to the Weekly Community Newsletter (Mondays and Thursdays at 7:00 AM).' });
      setBriefingFirstName('');
      setBriefingLastName('');
      setBriefingEmail('');
    } catch (err) {
      console.warn('Subscription notice:', err);
      setBriefingStatus({ success: false, msg: 'Unable to complete subscription. Please try again.' });
    } finally {
      setIsBriefingSubmitting(false);
    }
  };





  const categoryScrollRef = useRef(null);







  const CATEGORY_ICONS = {



    'All': Sparkles,



    'Community': Users,



    'Festivals & Markets': PartyPopper,



    'Farms, Markets & Garage Sales': Store,



    'Concerts & Shows': Music,



    'Sports & Outdoors': Trees,



    'Food & Drink': Utensils,



    'Kids & Family': Sparkles



  };







  const scrollCategories = (direction) => {



    if (!categoryScrollRef.current) return;



    const scrollAmount = 300;



    categoryScrollRef.current.scrollBy({



      left: direction === 'left' ? -scrollAmount : scrollAmount,



      behavior: 'smooth'



    });



  };







  // Record visit and calculate new listings count



  useEffect(() => {



    recordVisitTimestamp();



  }, []);

  // Tell floating buttons (Bug Reports) that the mobile tab bar is on screen
  useEffect(() => {
    document.documentElement.classList.add('wg-has-bottom-bar');
    return () => document.documentElement.classList.remove('wg-has-bottom-bar');
  }, []);







  // Fetch live approved vendor events and sales from Supabase



  useEffect(() => {



    let isMounted = true;



    async function fetchLiveEvents() {



      try {



        const { data, error } = await supabase



          .from('vendor_events')



          .select(PUBLIC_LISTING_COLUMNS)



          .eq('status', 'approved').or(notEndedFilter());







        if (!error && data && data.length > 0 && isMounted) {



          const todayMid = getTorontoTodayMidnight();







          const formattedEvents = [];



          const formattedSales = [];







          data.forEach(evt => {
            // Guard: Never broadcast undated vendor CTAs or promotional notices across calendar
            const cleanTitle = (evt.title || '').toLowerCase();
            if (cleanTitle.includes('submit your georgina business event') || cleanTitle.includes('auto-scrape your website')) {
              return;
            }

            // Exclude dining and retail sales from the Events set
            const catRaw = (evt.category || '').toLowerCase().trim();
            if (
              String(evt.title || '').startsWith('[Sale]') ||
              catRaw === 'dining' ||
              catRaw === 'restaurant' ||
              catRaw === 'food_and_drink' ||
              catRaw === 'dining_deals' ||
              catRaw === 'sale' ||
              catRaw === 'partner_deals' ||
              catRaw === 'special_sale'
            ) {
              return;
            }

            const { startOffset, endOffset, recurringDay, recurringDays, monthlyRule, exactDates, isOngoing, isDateRange } = parseEventOffsets(evt, todayMid);
            const rawCat = String(evt.category || '').toLowerCase().trim();
            const leacockText = `${evt.location || ''} ${evt.business_name || ''} ${evt.title || ''}`.toLowerCase();
            const isLeacock = leacockText.includes('leacock') || leacockText.includes('130 gwendolyn');
            const catName = formatCategoryLabel(evt.category);

            let badgeLabel = catName;
            if (monthlyRule) badgeLabel = `${catName} • Monthly`;
            else if (recurringDay !== null || (recurringDays && recurringDays.length > 0)) badgeLabel = `${catName} • Weekly`;
            else if (isOngoing) badgeLabel = `${catName} • Ongoing`;

            const isCommunity = evt.category === 'library_events' || evt.category === 'upcoming_events' || evt.category === 'eventbrite_meetup';
            const itemType = isCommunity ? 'community_event' : 'business_event';
            const rawLoc = evt.location || 'East Gwillimbury, ON';
            const formattedLoc = formatLocationDisplay(rawLoc);
            const outOfArea = isOutOfAreaLocation(formattedLoc);

            const item = {
              id: evt.id,
              type: itemType,
              title: evt.title,
              organizer: evt.business_name,
              business_name: evt.business_name,
              area: formattedLoc,
              location: formattedLoc,
              isOutOfArea: outOfArea,
              time: formatDDMonthYYYY(evt.event_date_label || evt.event_start_date) || (recurringDay !== null ? 'Weekly' : 'Ongoing / Drop-In'),
              event_date_label: formatDDMonthYYYY(evt.event_date_label || evt.event_start_date) || 'See details',
              event_start_date: evt.event_start_date,
              expires_after: evt.expires_after,
              dateOffsetDays: startOffset,
              startOffset: startOffset,
              endOffset: endOffset,
              recurringDay: recurringDay,
              recurringDays: recurringDays,
              monthlyRule: monthlyRule,
              exactDates: exactDates,
              isDateRange: isDateRange,
              isOngoing: isOngoing,
              category: catName,
              price_text: '',
              description: evt.summary || '',
              summary: evt.summary || '',
              link: evt.link || 'https://welcomeeg.ca/events',
              isSponsored: true,
              badge: badgeLabel,
              created_at: evt.created_at,
              slug: evt.slug || generateSlug(evt.title, evt.location)
            };

            formattedEvents.push(item);
          });







          setLiveEvents(formattedEvents);
          setSuggestionRows(data);



          setLiveSales(formattedSales);







          // Calculate "What's New Since Your Last Visit"



          const lastVisit = getLastVisitTimestamp();



          const fresh = countNewListings([...formattedEvents, ...formattedSales], lastVisit);



          setNewCount(fresh);



        }



      } catch (err) {



        console.warn('Events fetch notice on home:', err);



      }



    }



    fetchLiveEvents();



    return () => { isMounted = false; };



  }, []);







  // Combined master events list



  const allEvents = useMemo(() => {



    return [...BASE_EVENTS, ...liveEvents];



  }, [liveEvents]);







  // Primary Curated Discovery Sections from Live Content



  const happeningTodayEvents = useMemo(() => {



    return allEvents.filter(e => isToday(e.event_start_date)).slice(0, 3);



  }, [allEvents]);







  const thisWeekendEvents = useMemo(() => {
    return allEvents.filter(e => isThisWeekend(e.event_start_date)).slice(0, 4);
  }, [allEvents]);

  const featuredWeekendSpotlight = useMemo(() => {
    // 0. A listing an admin scheduled for right now (any kind: event, sale or dining)
    if (scheduledSpotlightId) {
      const scheduled = suggestionRows.find(e => e.id === scheduledSpotlightId);
      if (scheduled) return scheduled;
    }
    if (!allEvents || allEvents.length === 0) return null;
    // 1. Check if admin explicitly marked an event as featured (latest selection takes precedent)
    const featuredList = allEvents.filter(e => e.is_featured === true || e.featured === true || e.is_spotlight === true);
    if (featuredList.length > 0) {
      featuredList.sort((a, b) => {
        const da = a.featured_at || a.updated_at || a.created_at || '';
        const db = b.featured_at || b.updated_at || b.created_at || '';
        return db.localeCompare(da);
      });
      return featuredList[0];
    }
    // If admin unselected or cleared, do not force an unselected event
    return null;
  }, [allEvents, scheduledSpotlightId, suggestionRows]);







  const endingSoonDeals = useMemo(() => {



    return liveSales.filter(s => s.expires_after && isEndingSoon(s.expires_after)).slice(0, 3);



  }, [liveSales]);







  const freeEvents = useMemo(() => {



    return allEvents.filter(e => (e.price_text || '').toLowerCase().includes('free')).slice(0, 3);



  }, [allEvents]);







  const familyActivities = useMemo(() => {



    return allEvents.filter(e => {



      const text = `${e.title} ${e.summary} ${e.category}`.toLowerCase();



      return text.includes('family') || text.includes('skat') || text.includes('kids') || text.includes('market');



    }).slice(0, 3);



  }, [allEvents]);







  // 45-Day Sunday-to-Saturday Calendar Grid starting from the Sunday of the current week
  const calendarDays = useMemo(() => {
    const days = [];
    const today = getTorontoTodayMidnight();
    const todayDayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday...

    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - todayDayOfWeek);
    currentWeekStart.setHours(0, 0, 0, 0);

    const totalDays = Math.ceil((todayDayOfWeek + 45) / 7) * 7;

    for (let i = 0; i < totalDays; i++) {
      const d = new Date(currentWeekStart);
      d.setDate(currentWeekStart.getDate() + i);
      d.setHours(0, 0, 0, 0);

      const offset = Math.round((d.getTime() - today.getTime()) / 86400000);
      const isDayToday = offset === 0;
      const isPast = d.getTime() < today.getTime();
      const isCurrentWeek = i < 7;

      const weekday = d.toLocaleDateString('en-CA', { weekday: 'short' });
      const monthStr = d.toLocaleDateString('en-CA', { month: 'short' });
      const dayNum = d.getDate();

      days.push({
        index: i,
        offset,
        date: d,
        dateKey: d.toISOString().split('T')[0],
        dayName: weekday,
        dayNumber: dayNum,
        monthName: monthStr,
        dayLabel: isDayToday ? 'Today' : weekday,
        fullDateStr: `${monthStr} ${dayNum}`,
        isToday: isDayToday,
        isPast,
        isCurrentWeek
      });
    }

    return days;
  }, []);

  const calendarWeeks = useMemo(() => {
    const weeks = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      const slice = calendarDays.slice(i, i + 7);
      if (slice.length > 0) {
        weeks.push({
          weekIndex: Math.floor(i / 7),
          isCurrentWeek: i === 0,
          startDate: slice[0],
          endDate: slice[slice.length - 1],
          days: slice
        });
      }
    }
    return weeks;
  }, [calendarDays]);







  // Filter events per day (strictly in sync with /events master calendar)



  const getDayEvents = (dayOffset, dayDate) => {



    const dayMatches = allEvents.filter(evt => {



      // Rule: Exclude all dining events and submissions from the Calendar Grid (dining is on /dining and "This Weekend" only)



      const cat = (evt.category || '').toLowerCase().trim();



      if (cat === 'dining' || cat === 'restaurant' || cat === 'food_and_drink' || cat === 'dining_deals' || evt.type === 'dining') {



        return false;



      }







      if (!matchEventToCalendarDay(evt, dayDate, dayOffset)) return false;







      // Category filter



      if (selectedCategory !== 'All') {



        const matchesCategory = evt.category === selectedCategory ||



          (selectedCategory === 'Community' && evt.type === 'community_event') ||



          (selectedCategory === 'Farms, Markets & Garage Sales' && (evt.type === 'sale' || evt.category === 'Retail Sale'));



        if (!matchesCategory) return false;



      }







      // Search term filter



      if (searchTerm.trim()) {



        const term = searchTerm.toLowerCase();



        const matchesSearch = matchesQuery(`${evt.title || ''} ${evt.organizer || evt.business_name || ''} ${evt.area || ''} ${evt.description || ''}`, term);



        if (!matchesSearch) return false;



      }







      return true;



    });







    return sortEventsForCalendarDay(dayMatches, allEvents);
  };

  // Weekend days calculation (Friday, Saturday, Sunday) with strict past-day filtering
  const weekendDaysData = useMemo(() => {
    const today = getTorontoTodayMidnight();
    const dayOfWeek = today.getDay(); // 0 is Sun, 5 is Fri, 6 is Sat
    let friOffset = 5 - dayOfWeek;
    if (dayOfWeek === 0) friOffset = -2;
    const fri = new Date(today); fri.setDate(today.getDate() + friOffset);
    const sat = new Date(today); sat.setDate(today.getDate() + friOffset + 1);
    const sun = new Date(today); sun.setDate(today.getDate() + friOffset + 2);

    const isPastDate = (d) => d.getTime() < today.getTime();

    return {
      friday: { 
        date: fri, 
        offset: friOffset, 
        label: `Friday, ${fri.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}`, 
        isToday: fri.getTime() === today.getTime(),
        isPast: isPastDate(fri)
      },
      saturday: { 
        date: sat, 
        offset: friOffset + 1, 
        label: `Saturday, ${sat.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}`, 
        isToday: sat.getTime() === today.getTime(),
        isPast: isPastDate(sat)
      },
      sunday: { 
        date: sun, 
        offset: friOffset + 2, 
        label: `Sunday, ${sun.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}`, 
        isToday: sun.getTime() === today.getTime(),
        isPast: isPastDate(sun)
      },
    };
  }, []);

  const fridayEvents = useMemo(() => {
    return getDayEvents(weekendDaysData.friday.offset, weekendDaysData.friday.date);
  }, [allEvents, weekendDaysData]);

  const saturdayEvents = useMemo(() => {
    return getDayEvents(weekendDaysData.saturday.offset, weekendDaysData.saturday.date);
  }, [allEvents, weekendDaysData]);

  const sundayEvents = useMemo(() => {
    return getDayEvents(weekendDaysData.sunday.offset, weekendDaysData.sunday.date);
  }, [allEvents, weekendDaysData]);

  // Only show active and upcoming weekend days: on Saturday Friday is hidden, on Sunday Friday & Saturday are hidden
  const visibleWeekendColumns = useMemo(() => {
    const cols = [];
    if (!weekendDaysData.friday.isPast) {
      cols.push({
        id: 'friday',
        data: weekendDaysData.friday,
        events: fridayEvents,
        tagline: 'Kickoff Day',
        taglineColor: 'text-slate-400',
        emptyNotice: 'No public events scheduled for Friday kickoff.'
      });
    }
    if (!weekendDaysData.saturday.isPast) {
      cols.push({
        id: 'saturday',
        data: weekendDaysData.saturday,
        events: saturdayEvents,
        tagline: 'Prime Activities',
        taglineColor: 'text-blue-700',
        emptyNotice: 'No public events scheduled for Saturday prime.'
      });
    }
    if (!weekendDaysData.sunday.isPast) {
      cols.push({
        id: 'sunday',
        data: weekendDaysData.sunday,
        events: sundayEvents,
        tagline: 'Leisure & Ceremony',
        taglineColor: 'text-slate-400',
        emptyNotice: 'No public events scheduled for Sunday leisure.'
      });
    }
    return cols;
  }, [weekendDaysData, fridayEvents, saturdayEvents, sundayEvents]);

  const activeInspectorDay = calendarDays[selectedInspectorDayIndex] || calendarDays[0];
  const inspectorEvents = useMemo(() => {
    if (!activeInspectorDay) return [];
    return getDayEvents(activeInspectorDay.offset, activeInspectorDay.date);
  }, [activeInspectorDay, allEvents]);







  const handleSearchSubmit = (e) => {
    e.preventDefault();
    // Typed words: search on Discovery (events, sales and dining specials). /events only shows the
    // calendar and ignores q, which is why searches used to land on an unfiltered weekend view.
    const term = searchTerm.trim();
    if (term) {
      const dp = new URLSearchParams({ q: term });
      const area = COMMUNITY_PICKER.find((c) => c.value === searchCommunity);
      if (area && area.value !== 'all' && area.value !== 'east_gwillimbury') dp.set('loc', area.label);
      navigate(`/discovery?${dp.toString()}`);
      return;
    }
    const params = new URLSearchParams();
    if (searchTerm.trim()) params.set('q', searchTerm.trim());
    if (searchCommunity && searchCommunity !== 'east_gwillimbury' && searchCommunity !== 'all') {
      params.set('community', searchCommunity);
    }
    if (searchTiming === 'today') {
      params.set('view', 'today');
      navigate(`/events?${params.toString()}`);
    } else if (searchTiming === 'weekend') {
      params.set('view', 'weekend');
      navigate(`/events?${params.toString()}`);
    } else if (searchTiming === 'next_weekend') {
      params.set('view', 'weekend');
      params.set('weekend', 'next');
      navigate(`/events?${params.toString()}`);
    } else if (searchTiming === '14_days') {
      params.set('view', '14-day');
      navigate(`/events?${params.toString()}`);
    } else {
      if (searchTerm.trim()) {
        navigate(`/discovery?${params.toString()}`);
      } else {
        navigate(`/events?${params.toString()}`);
      }
    }
  };







  const handleToggleBookmark = (item) => {



    toggleSaveItem(item);



    setSavedUpdate(c => c + 1);



  };







  // Schema.org Structured Data for WebSite & Local Organization



  const siteStructuredData = useMemo(() => {



    return {



      "@context": "https://schema.org",



      "@graph": [



        {



          "@type": "WebSite",



          "@id": "https://welcomeeg.ca/#website",



          "url": "https://welcomeeg.ca/",



          "name": "Welcome East Gwillimbury",



          "description": "Connecting community, newcomers, and local businesses across East Gwillimbury in Keswick, Sutton, Jackson's Point, Pefferlaw, Ontario.",



          "potentialAction": {



            "@type": "SearchAction",



            "target": "https://welcomeeg.ca/discovery?q={search_term_string}",



            "query-input": "required name=search_term_string"



          }



        },



        {



          "@type": "Organization",



          "@id": "https://welcomeeg.ca/#organization",



          "name": "Welcome East Gwillimbury",



          "url": "https://welcomeeg.ca/",



          "logo": "https://welcomeeg.ca/welcome-eg-logo.png",



          "email": "contact@welcomeeg.ca",



          "address": {



            "@type": "PostalAddress",



            "addressLocality": "East Gwillimbury",



            "addressRegion": "ON",



            "addressCountry": "CA"



          },



          "areaServed": [



            "Keswick",



            "Sutton",



            "Jackson's Point",



            "Pefferlaw",



            "Udora",



            "East Gwillimbury"



          ]



        }



      ]



    };



  }, []);







  // ---------------------------------------------------------------------------
  // Design B (UI-only state): weekend carousel paging + collapsed 45-day calendar
  // ---------------------------------------------------------------------------
  const [showFullCalendar, setShowFullCalendar] = useState(false);
  const weekendScrollRef = useRef(null);
  const scrollWeekend = (direction) => {
    if (!weekendScrollRef.current) return;
    weekendScrollRef.current.scrollBy({ left: direction === 'left' ? -340 : 340, behavior: 'smooth' });
  };
  const selectedCommunityLabel = (COMMUNITY_PICKER.find((c) => c.value === searchCommunity) || COMMUNITY_PICKER[0]).label;
  const upcomingStripDays = calendarDays.filter((d) => !d.isPast).slice(0, 14);

  const renderCommunityPicker = () => (
    <Reveal delay={0.1} className="min-w-0 bg-lake-800/80 border-2 border-lake-600 rounded-[2rem] p-5 sm:p-6 shadow-lift">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-coral-300">Community picker</p>
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold leading-tight">Where in East Gwillimbury?</h2>
        </div>
        <Waves className="w-8 h-8 text-sun-300 shrink-0" aria-hidden="true" />
      </div>

      <svg viewBox="-40 0 440 290" className="hidden sm:block w-full h-auto rounded-2xl bg-lake-700 mb-4" aria-hidden="true">
        {/* Holland River winding along the western border */}
        <path d="M-10,15 C18,65 12,115 24,165 C34,208 26,248 42,290" stroke="#38BDF8" strokeWidth="14" strokeLinecap="round" fill="none" opacity="0.35" />
        <path d="M-10,15 C18,65 12,115 24,165 C34,208 26,248 42,290" stroke="#7DD3FC" strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.65" />
        {/* Subtle regional road grid (Ravenshoe Rd, Queensville Side Rd, Leslie St / Hwy 404) */}
        <g stroke="#6FAED6" strokeWidth="1.5" strokeDasharray="4 4" fill="none" opacity="0.35">
          <path d="M25 45 L360 55" />
          <path d="M20 155 L365 162" />
          <path d="M148 20 L156 270" />
        </g>
        <text x="-28" y="155" fill="#BAE6FD" fontSize="12" fontStyle="italic" fontWeight="700" transform="rotate(-78 -28 155)">Holland River</text>
        <text x="245" y="255" fill="#D6E9F5" fontSize="14" fontStyle="italic" fontWeight="700" opacity="0.7">East Gwillimbury</text>
        {COMMUNITY_PICKER.filter((c) => c.x !== undefined).map((c) => {
          const active = searchCommunity === c.value;
          return (
            <g key={c.value} onClick={() => setSearchCommunity(c.value)} className="cursor-pointer">
              {active && <circle cx={c.x} cy={c.y} r="15" fill="#FF6B52" opacity="0.35" />}
              <circle cx={c.x} cy={c.y} r={active ? 8 : 6} fill={active ? '#FF6B52' : '#FFD166'} stroke="#051B2E" strokeWidth="2" />
              <text
                x={c.x + c.lx}
                y={c.y + c.ly}
                textAnchor={c.anchor}
                fill="#FFFFFF"
                fontSize="13"
                fontWeight={active ? 900 : 700}
              >
                {c.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Choose a community">
        {COMMUNITY_PICKER.map((c) => {
          const active = searchCommunity === c.value;
          return (
            <button
              key={c.value}
              type="button"
              aria-pressed={active}
              onClick={() => setSearchCommunity(c.value)}
              className={`wg-shimmer min-h-[44px] px-3.5 rounded-full text-sm font-black border-2 transition-colors cursor-pointer ${
                active
                  ? 'bg-coral-600 border-coral-600 text-white'
                  : 'bg-lake-900 border-lake-600 text-white hover:border-sun-300 hover:text-sun-200'
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <button
        type="submit"
        form="hero-search"
        className="w-full min-h-[52px] px-5 rounded-2xl bg-sun-400 hover:bg-coral-600 text-lake-950 hover:text-white font-black text-base transition-colors flex items-center justify-center gap-2 cursor-pointer focus-ring-dark"
      >
        <span>See what&apos;s on in {selectedCommunityLabel}</span>
        <ArrowRight className="w-5 h-5" aria-hidden="true" />
      </button>
    </Reveal>
  );

  return (
    <div className="flex flex-col bg-white">
      <ScrollSheen />
      {/* Schema.org WebSite & Local Organization Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(siteStructuredData).replace(/</g, '\\u003c') }}
      />

      {/* ========================================================================= */}
      {/* 1. HERO — LAKE & SUNSET: SEARCH DOCK + COMMUNITY PICKER                    */}
      {/* ========================================================================= */}
      <section className="relative bg-lake-900 text-white overflow-hidden">
        {/* Sunset glow + shoreline waves (decorative, no images → fast LCP) */}
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_88%_8%,rgba(255,107,82,0.55),transparent_42%),radial-gradient(circle_at_70%_0%,rgba(255,182,39,0.35),transparent_35%)]" />
        <svg aria-hidden="true" className="absolute bottom-0 left-0 w-full h-24 sm:h-32 pointer-events-none" viewBox="0 0 1440 160" preserveAspectRatio="none" fill="none">
          <path d="M0 96C160 64 320 64 480 88C640 112 800 128 960 104C1120 80 1280 56 1440 72V160H0Z" fill="#0B3B5C" />
          <path d="M0 128C200 104 400 108 600 124C800 140 1000 140 1200 120C1300 110 1380 108 1440 112V160H0Z" fill="#051B2E" />
        </svg>

        {/* Clothesline photo strip (staff/gallery.html): between the header and the eyebrow */}


        <div className="relative max-w-[1440px] mx-auto px-4 md:px-12 pt-10 sm:pt-14 lg:pt-20 pb-28 sm:pb-36 grid lg:grid-cols-[1.15fr_0.85fr] gap-8 lg:gap-12 items-start">
          {/* Left: headline + search */}
          <div className="min-w-0">
            {/* Hero text renders immediately (no fade-in) so it can paint as the LCP element */}
            <div className="wg-shimmer inline-flex items-center gap-2 px-4 py-2 rounded-full bg-lake-800 border border-lake-600 text-sun-200 text-xs sm:text-sm font-bold mb-5">
              <span className="w-2.5 h-2.5 rounded-full bg-sun-400 animate-pulse" aria-hidden="true"></span>
              <span>({allEvents.length}) Verified community events &amp; listings in East Gwillimbury</span>
            </div>

            <h1 className="font-display font-extrabold text-[2.6rem] leading-[0.95] sm:text-6xl lg:text-7xl tracking-tight mb-4">
              What are you looking to do in <span className="text-sun-300">East Gwillimbury?</span>
            </h1>
            <p className="text-base sm:text-lg font-medium text-lake-100 max-w-2xl mb-5">
              Community events, live arts, markets and regional gatherings across East Gwillimbury including Holland Landing, Mount Albert, Queensville, Sharon, River Drive Park, Holt, Franklin, Brown Hill, and Ravenshoe.
            </p>

            {/* TAPPABLE SEARCH SUGGESTIONS: Quick Search button mosaic across all viewports */}
            {searchSuggestions.length > 0 && (
              <Reveal className="w-full min-w-0 mb-4 text-left">
                <div className="flex flex-wrap items-center justify-start gap-2 text-sm text-lake-100 w-full">
                  {searchSuggestions.map((s, i) => {
                    const brightBorders = [
                      'border-2 border-amber-300',
                      'border-2 border-cyan-300',
                      'border-2 border-rose-300',
                      'border-2 border-emerald-300',
                      'border-2 border-violet-300',
                    ];
                    const borderCls = brightBorders[i % brightBorders.length];
                    if (s.kind === 'sponsored') {
                      const cls = `wg-shimmer min-h-[42px] sm:min-h-[44px] max-w-full sm:max-w-[280px] inline-flex items-center px-3.5 py-2 rounded-xl bg-white/15 ${borderCls} hover:bg-white hover:text-lake-950 text-white font-bold text-sm leading-snug text-left transition-colors`;
                      const inner = (
                        <span className="line-clamp-2 break-words">{s.label}</span>
                      );
                      const style = { '--shimmer-delay': `${i * 0.875}s` };
                      return s.external ? (
                        <a key={`sp-${s.sponsorId}`} href={s.to} target="_blank" rel="sponsored noopener noreferrer" className={cls} style={style}
                           aria-label={`${s.label}, opens the sponsor's website`}>
                          {inner}
                        </a>
                      ) : (
                        <Link key={`sp-${s.sponsorId}`} to={s.to} className={cls} style={style}
                              onClick={() => recordSponsorClick(supabase, s.sponsorId, 'home-search')}
                              aria-label={`Search for ${s.label}`}>
                          {inner}
                        </Link>
                      );
                    }
                    const Icon = s.kind === 'dining' ? Utensils : s.kind === 'sales' ? Tag : CalendarIcon;
                    const where = s.kind === 'dining' ? 'dining' : s.kind === 'sales' ? 'sales' : 'events';
                    return (
                      <Link
                        key={`${s.kind}-${s.query}`}
                        to={s.to}
                        aria-label={`Search ${where} for ${s.label}`}
                        style={{ '--shimmer-delay': `${i * 0.875}s` }}
                        className={`wg-shimmer min-h-[42px] sm:min-h-[44px] max-w-full min-w-0 inline-flex items-center gap-1.5 px-3.5 rounded-xl bg-white/10 ${borderCls} hover:bg-white hover:text-lake-950 text-white font-bold text-sm transition-colors`}
                      >
                        <Icon className="w-3.5 h-3.5 opacity-70 shrink-0" aria-hidden="true" />
                        <span className="break-words">{s.label}</span>
                      </Link>
                    );
                  })}
                </div>
                <div className="text-left mt-1.5">
                  <Link
                    to="/advertise"
                    className="inline-flex items-center gap-1 max-w-full text-[11px] font-extrabold uppercase tracking-wider text-amber-200 hover:text-white hover:underline underline-offset-4 transition-colors"
                  >
                    <span>Quick Search Sponsored</span>
                    <span aria-hidden="true">&rarr;</span>
                  </Link>
                </div>
              </Reveal>
            )}

            {/* UNIFIED SEARCH DOCK (same submit logic as before) */}
            <Reveal delay={0.15} className="bg-white rounded-[1.75rem] p-2 border-4 border-lake-950 shadow-pop text-left mb-5">
              <form id="hero-search" onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="flex-1 flex items-center gap-3 px-3 min-h-[48px] min-w-0">
                  <Search className="w-5 h-5 text-lake-600 shrink-0" aria-hidden="true" />
                  <label htmlFor="hero-search-input" className="sr-only">Search events</label>
                  <input
                    id="hero-search-input"
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search events, live music, workshops, farm markets..."
                    className="w-full text-base font-bold text-lake-950 placeholder-slate-500 focus:outline-none bg-transparent min-w-0"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      aria-label="Clear search"
                      className="w-11 h-11 inline-flex items-center justify-center rounded-full text-slate-500 hover:text-lake-950 hover:bg-lake-50"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Location select (kept in sync with the community picker) */}
                <div className="flex items-center gap-1.5 border-t sm:border-t-0 sm:border-l-2 border-lake-100 px-3 min-h-[48px] min-w-0">
                  <MapPin className="w-4 h-4 text-coral-600 shrink-0" aria-hidden="true" />
                  <label htmlFor="hero-search-community" className="sr-only">Community</label>
                  <select
                    id="hero-search-community"
                    value={searchCommunity}
                    onChange={(e) => setSearchCommunity(e.target.value)}
                    className="text-sm font-black text-lake-950 bg-transparent focus:outline-none cursor-pointer py-2 w-full sm:w-auto truncate"
                  >
                    {COMMUNITY_PICKER.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  className="min-h-[48px] px-6 rounded-[1.25rem] bg-coral-600 hover:bg-sun-400 text-white hover:text-lake-950 font-black text-sm uppercase tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer shrink-0 focus-ring-dark"
                >
                  <span>Search</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </form>
            </Reveal>

            {/* QUICK FILTERS */}
            <Reveal delay={0.2} className="flex items-center gap-2 flex-wrap mb-4">
              <span className="sr-only">Quick filters:</span>
              <button
                type="button"
                onClick={() => {
                  setSearchTiming('today');
                  navigate('/events?view=today');
                }}
                className="wg-shimmer inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full text-sm font-black bg-lake-800 text-white border border-lake-600 hover:bg-sun-400 hover:text-lake-950 hover:border-sun-400 transition-colors cursor-pointer"
              >
                <CalendarIcon className="w-4 h-4" aria-hidden="true" /> Today
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearchTiming('weekend');
                  navigate('/events?view=weekend');
                }}
                className="wg-shimmer inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full text-sm font-black bg-sun-400 text-lake-950 border border-sun-400 hover:bg-coral-600 hover:border-coral-600 hover:text-white transition-colors cursor-pointer focus-ring-dark"
              >
                <PartyPopper className="w-4 h-4" aria-hidden="true" /> This Weekend
              </button>
              <Link
                to="/events?view=14-day"
                className="wg-shimmer inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full text-sm font-black bg-lake-800 text-white border border-lake-600 hover:bg-sun-400 hover:text-lake-950 hover:border-sun-400 transition-colors"
              >
                <CalendarDays className="w-4 h-4" aria-hidden="true" /> 14-Day Outlook
              </Link>
              <Link
                to="/events?view=6-week"
                className="wg-shimmer inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full text-sm font-black bg-lake-800 text-white border border-lake-600 hover:bg-sun-400 hover:text-lake-950 hover:border-sun-400 transition-colors"
              >
                <Landmark className="w-4 h-4" aria-hidden="true" /> 45-Day Master Grid
              </Link>
              <Link
                to="/subscribe"
                className="wg-shimmer inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full text-sm font-black bg-lake-800 text-white border border-lake-600 hover:bg-sun-400 hover:text-lake-950 hover:border-sun-400 transition-colors"
              >
                <Mail className="w-4 h-4" aria-hidden="true" /> Weekly Newsletter
              </Link>
            </Reveal>
          </div>

          {/* Right: community picker (stylised south-shore map + chips) — DESKTOP ONLY (>= lg) */}
          <div className="hidden lg:block min-w-0">
            {renderCommunityPicker()}
          </div>

          {/* DYNAMIC WEEKEND SPOTLIGHT CARD */}
          {featuredWeekendSpotlight && (
            <div className="lg:col-span-2 bg-coral-600 text-white rounded-[2rem] p-5 sm:p-6 border-4 border-lake-950 shadow-pop flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="wg-shimmer inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-lake-950 text-sun-300 text-[11px] font-black uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Featured Weekend Spotlight</span>
                </div>
                <h3 className="font-display text-xl sm:text-2xl font-extrabold leading-snug">
                  {featuredWeekendSpotlight.title} {featuredWeekendSpotlight.business_name && featuredWeekendSpotlight.business_name !== featuredWeekendSpotlight.title ? `• ${featuredWeekendSpotlight.business_name}` : ''}
                </h3>
                <p className="text-sm font-bold flex items-center gap-x-3 gap-y-1 flex-wrap">
                  <span className="inline-flex items-center gap-1.5"><CalendarIcon className="w-4 h-4" aria-hidden="true" />{featuredWeekendSpotlight.event_date_label || formatDDMonthYYYY(featuredWeekendSpotlight.event_start_date) || 'This Weekend'}{featuredWeekendSpotlight.time ? ` (${featuredWeekendSpotlight.time})` : ''}</span>
                  {featuredWeekendSpotlight.location && (
                    <span className="inline-flex items-center gap-1.5"><MapPin className="w-4 h-4" aria-hidden="true" />{featuredWeekendSpotlight.location}</span>
                  )}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch gap-2 shrink-0 self-stretch sm:self-auto">
                <Link
                  to={featuredWeekendSpotlight.slug ? `/events/${featuredWeekendSpotlight.slug}` : `/events/${featuredWeekendSpotlight.id}`}
                  className="wg-shimmer min-h-[44px] inline-flex items-center justify-center px-5 rounded-full bg-lake-950 hover:bg-lake-800 text-white font-black text-xs uppercase tracking-wider transition-colors"
                >
                  View Listing &rarr;
                </Link>
                <Link
                  to="/spotlight"
                  className="wg-shimmer min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 rounded-full border-2 border-white text-white hover:bg-lake-950 hover:border-lake-950 font-black text-xs transition-colors"
                  title="View History of Featured Events"
                >
                  <Archive className="w-4 h-4" aria-hidden="true" /> Past Spotlights
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Main Page Content Wrapper */}
      <div className="w-full flex flex-col pb-24 lg:pb-0">

        {/* ========================================================================= */}
        {/* 2. THIS WEEKEND IN GEORGINA — SCROLL-SNAP CAROUSEL                         */}
        {/* ========================================================================= */}
        <section id="weekend-events" className="bg-lake-950 text-white py-12 sm:py-16 overflow-hidden">
          <div className="max-w-[1440px] mx-auto px-4 md:px-12">
            <Reveal className="flex flex-col md:flex-row md:items-end justify-between gap-5 mb-8">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-coral-300 mb-2">Chronological itinerary</p>
                <h2 className="font-display text-[2.5rem] leading-none lg:text-6xl font-extrabold tracking-tight">
                  This Weekend in East Gwillimbury
                </h2>
                <p className="text-base text-lake-200 mt-3">
                  Verified community activities organized day by day.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to="/events?view=14-day"
                  className="wg-shimmer inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full border-2 border-lake-600 hover:border-sun-300 text-white text-xs font-black uppercase tracking-wider transition-colors"
                >
                  <CalendarDays className="w-4 h-4" aria-hidden="true" /> 14-Day Outlook
                </Link>
                <a
                  href="#calendar-grid"
                  className="wg-shimmer inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full border-2 border-lake-600 hover:border-sun-300 text-white text-xs font-black uppercase tracking-wider transition-colors"
                >
                  <Landmark className="w-4 h-4" aria-hidden="true" /> 45-Day Calendar
                </a>
                <Link
                  to="/this-weekend"
                  className="wg-shimmer inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full bg-sun-400 hover:bg-coral-600 text-lake-950 hover:text-white text-xs font-black uppercase tracking-wider transition-colors focus-ring-dark"
                >
                  Full Planner <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
                <div className="hidden md:flex items-center gap-2 ml-2">
                  <button type="button" onClick={() => scrollWeekend('left')} aria-label="Scroll weekend events left" className="w-11 h-11 inline-flex items-center justify-center rounded-full bg-lake-800 hover:bg-white hover:text-lake-950 transition-colors cursor-pointer">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button type="button" onClick={() => scrollWeekend('right')} aria-label="Scroll weekend events right" className="w-11 h-11 inline-flex items-center justify-center rounded-full bg-lake-800 hover:bg-white hover:text-lake-950 transition-colors cursor-pointer">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </Reveal>

            <div ref={weekendScrollRef} className="b-carousel gap-4 pb-4 -mb-4" tabIndex={0} aria-label="This weekend's events">
              <Stagger className="flex gap-4">
                {visibleWeekendColumns.map((col) => {
                  const theme = WEEKEND_DAY_THEME[col.id] || WEEKEND_DAY_THEME.friday;
                  const slides = [];
                  slides.push(
                    <StaggerItem
                      key={`${col.id}-head`}
                      className={`snap-start shrink-0 w-[70vw] max-w-[240px] sm:w-[240px] rounded-[2rem] p-6 flex flex-col justify-between min-h-[300px] ${theme.block}`}
                    >
                      <div>
                        {col.data.isToday && (
                          <span className="wg-shimmer inline-block mb-3 px-3 py-1 rounded-full bg-lake-950 text-sun-300 text-[11px] font-black uppercase tracking-wider">Today</span>
                        )}
                        <p className="text-xs font-black uppercase tracking-[0.18em] opacity-90">{col.tagline}</p>
                        <h3 className="font-display text-4xl font-extrabold leading-[0.95] mt-2">{col.data.label.replace(',', '')}</h3>
                      </div>
                      <p className="font-display text-6xl font-extrabold leading-none">
                        {col.events.length}
                        <span className="block text-sm font-sans font-black uppercase tracking-wider mt-1">{col.events.length === 1 ? 'Event' : 'Events'}</span>
                      </p>
                    </StaggerItem>
                  );
                  if (col.events.length === 0) {
                    slides.push(
                      <StaggerItem key={`${col.id}-empty`} className="snap-start shrink-0 w-[78vw] max-w-[300px] sm:w-[300px] rounded-[2rem] border-2 border-dashed border-lake-600 p-6 flex flex-col justify-center text-center min-h-[300px]">
                        <p className="text-sm font-bold text-lake-100">{col.emptyNotice}</p>
                        <Link to="/submission" className="mt-3 inline-flex items-center justify-center gap-1.5 min-h-[44px] text-sm text-sun-300 font-black hover:underline">
                          <Plus className="w-4 h-4" aria-hidden="true" /> Submit Event Free
                        </Link>
                      </StaggerItem>
                    );
                  }
                  col.events.forEach((evt, idx) => {
                    const addressQuery = encodeURIComponent(
                      (evt.location || evt.area || '') +
                      ((evt.location || evt.area || '').toLowerCase().includes('georgina') ? '' : ', East Gwillimbury, ON')
                    );
                    const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${addressQuery}`;
                    const outOfArea = evt.isOutOfArea || isOutOfAreaLocation(evt.location);
                    slides.push(
                      <StaggerItem
                        key={`${col.id}-${evt.id || idx}`}
                        as="article"
                        className="snap-start shrink-0 w-[78vw] max-w-[300px] sm:w-[300px] min-h-[300px] bg-white text-lake-950 rounded-[2rem] overflow-hidden flex flex-col border-2 border-white hover:-translate-y-1 hover:border-sun-300 hover:shadow-lift transition-[transform,box-shadow,border-color] duration-200"
                      >
                        <div className={`h-2.5 ${theme.stripe}`} aria-hidden="true" />
                        <div className="p-5 flex-1 flex flex-col">
                          <div className="flex items-center gap-1.5 flex-wrap mb-3">
                            <span className="wg-shimmer px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-lake-100 text-lake-900">
                              {evt.category || 'Event'}
                            </span>
                            {outOfArea && (
                              <span className="wg-shimmer px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-coral-100 text-coral-800">
                                Out of Area
                              </span>
                            )}
                          </div>
                          <h4 className="font-display text-xl font-extrabold leading-tight mb-3">{evt.title}</h4>
                          <p className="flex items-center gap-2 text-sm font-bold text-lake-800">
                            <Clock className="w-4 h-4 shrink-0 text-coral-600" aria-hidden="true" />
                            {evt.event_time || evt.time || 'Daytime'}
                          </p>
                          <p className="flex items-start gap-2 text-sm font-medium text-slate-600 mt-1.5">
                            <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-coral-600" aria-hidden="true" />
                            {evt.location || evt.area || 'East Gwillimbury, ON'}
                          </p>
                          <div className="mt-auto pt-4 flex items-center justify-between gap-2">
                            <a
                              href={gmapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 min-h-[44px] text-sm font-bold text-emerald-800 hover:underline"
                            >
                              <MapPin className="w-4 h-4" aria-hidden="true" />
                              <span>Directions &amp; Reviews</span>
                            </a>
                            <button
                              type="button"
                              onClick={() => setSelectedModalEvent(evt)}
                              className="wg-shimmer min-h-[44px] px-4 rounded-full bg-lake-800 hover:bg-coral-600 text-white text-sm font-black transition-colors cursor-pointer"
                            >
                              View Details
                            </button>
                          </div>
                        </div>
                      </StaggerItem>
                    );
                  });
                  return slides;
                })}
              </Stagger>
            </div>
          </div>
        </section>

        {/* Community picker: TABLET & MOBILE ONLY (< lg) — placed below This Weekend */}
        <section className="bg-lake-900 text-white py-12 sm:py-16 px-4 sm:px-6 md:px-12 lg:hidden overflow-hidden">
          <div className="max-w-[720px] mx-auto">
            {renderCommunityPicker()}
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 3. WEEKLY NEWSLETTER — BOLD CORAL COLOUR-BLOCK BAND (moved up)             */}
        {/* ========================================================================= */}
        <section id="newsletter-signup" className="bg-coral-600 text-white relative overflow-hidden">
          <svg aria-hidden="true" className="absolute -right-24 -top-24 w-[200px] h-[200px] md:w-[420px] md:h-[420px] opacity-90 pointer-events-none" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="100" fill="#FFB627" />
          </svg>
          <div className="relative max-w-[1440px] mx-auto px-4 md:px-12 py-12 sm:py-16 grid lg:grid-cols-[1fr_minmax(0,520px)] gap-8 lg:gap-12 items-center">
            <Reveal>
              <div className="wg-shimmer inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-lake-950 text-sun-300 text-xs font-black uppercase tracking-wider mb-4">
                <Mailbox className="w-4 h-4" aria-hidden="true" />
                <span>Weekly Community Newsletter (Mondays and Thursdays at 7:00 AM)</span>
              </div>
              <h2 className="font-display text-[2rem] leading-[0.95] sm:text-5xl lg:text-6xl font-extrabold tracking-tight">
                Get East Gwillimbury&apos;s Twice Weekly Community Newsletter Delivered Every Monday and Thursday Morning
              </h2>
              <p className="text-base sm:text-lg font-medium mt-4 max-w-xl">
                Two combined weekly editions featuring verified community events, local news, town council updates, and regional happenings delivered every Monday and Thursday before 7:00 AM.
              </p>
              <ul className="flex flex-col sm:flex-row sm:flex-wrap gap-x-6 gap-y-2 mt-5 text-sm font-black">
                <li className="inline-flex items-center gap-2"><CheckCircle2 className="w-5 h-5" aria-hidden="true" /> Two combined weekly editions</li>
                <li className="inline-flex items-center gap-2"><CheckCircle2 className="w-5 h-5" aria-hidden="true" /> East Gwillimbury &amp; Nearby events</li>
                <li className="inline-flex items-center gap-2"><CheckCircle2 className="w-5 h-5" aria-hidden="true" /> 100% spam-free, cancel anytime</li>
              </ul>
            </Reveal>

            <Reveal delay={0.1} className="bg-lake-950 text-white rounded-[2rem] p-6 sm:p-8 shadow-pop">
              <form onSubmit={handleBriefingSubscribe} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="briefing-first" className="block text-xs font-black uppercase tracking-wider text-lake-100 mb-1.5">First Name *</label>
                    <input
                      id="briefing-first"
                      type="text"
                      value={briefingFirstName}
                      onChange={(e) => setBriefingFirstName(e.target.value)}
                      placeholder="First Name *"
                      aria-label="First Name"
                      autoComplete="given-name"
                      required
                      className="w-full px-4 min-h-[48px] rounded-2xl bg-white text-lake-950 font-bold text-base focus:outline-none focus:ring-4 focus:ring-sun-400 placeholder-slate-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="briefing-last" className="block text-xs font-black uppercase tracking-wider text-lake-100 mb-1.5">Last Name *</label>
                    <input
                      id="briefing-last"
                      type="text"
                      value={briefingLastName}
                      onChange={(e) => setBriefingLastName(e.target.value)}
                      placeholder="Last Name *"
                      aria-label="Last Name"
                      autoComplete="family-name"
                      required
                      className="w-full px-4 min-h-[48px] rounded-2xl bg-white text-lake-950 font-bold text-base focus:outline-none focus:ring-4 focus:ring-sun-400 placeholder-slate-500"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="briefing-email" className="block text-xs font-black uppercase tracking-wider text-lake-100 mb-1.5">Email address *</label>
                  <input
                    id="briefing-email"
                    type="email"
                    value={briefingEmail}
                    onChange={(e) => setBriefingEmail(e.target.value)}
                    placeholder="Enter your email address..."
                    autoComplete="email"
                    required
                    className="w-full px-4 min-h-[48px] rounded-2xl bg-white text-lake-950 font-bold text-base focus:outline-none focus:ring-4 focus:ring-sun-400 placeholder-slate-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isBriefingSubmitting}
                  className="w-full min-h-[52px] px-6 rounded-2xl bg-sun-400 hover:bg-coral-600 disabled:opacity-70 text-lake-950 hover:text-white font-black text-sm uppercase tracking-wider transition-colors cursor-pointer inline-flex items-center justify-center gap-2 focus-ring-dark"
                >
                  {isBriefingSubmitting ? 'Joining...' : 'Subscribe Free'}
                  {!isBriefingSubmitting && <ArrowRight className="w-4 h-4" aria-hidden="true" />}
                </button>
                {briefingStatus && (
                  <p role="status" className={`text-sm font-bold pt-1 ${briefingStatus.success ? 'text-emerald-300' : 'text-coral-200'}`}>
                    {briefingStatus.msg}
                  </p>
                )}
              </form>
            </Reveal>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 4. BROWSE BY CATEGORY — COLOURFUL TILE CAROUSEL + EXPLORE BENTO            */}
        {/* ========================================================================= */}
        <section className="bg-white py-12 sm:py-16 overflow-hidden">
          <div className="max-w-[1440px] mx-auto px-4 md:px-12">
            <Reveal className="mb-8">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-coral-700 mb-2">Find your thing</p>
              <h2 className="font-display text-[2.5rem] leading-none lg:text-6xl font-extrabold tracking-tight text-lake-950">
                Browse by category
              </h2>
            </Reveal>

            <div className="b-carousel gap-4 pb-2" tabIndex={0} aria-label="Event categories">
              <Stagger className="flex gap-4">
                {DISCOVERY_CATEGORIES.filter((c) => c !== 'All').map((cat, i) => {
                  const Icon = CATEGORY_TILE_ICONS[cat] || Sparkles;
                  const palette = CATEGORY_TILE_PALETTES[i % CATEGORY_TILE_PALETTES.length];
                  return (
                    <StaggerItem key={cat} className="snap-start shrink-0">
                      <Link
                        to={`/discovery?cat=${encodeURIComponent(cat)}`}
                        className={`group w-[164px] h-[184px] sm:w-[196px] sm:h-[204px] rounded-[1.75rem] p-5 flex flex-col justify-between transition-[background-color,color,transform] duration-200 hover:-translate-y-1 ${palette}`}
                      >
                        <span className="w-12 h-12 rounded-2xl bg-white/90 text-lake-950 inline-flex items-center justify-center">
                          <Icon className="w-6 h-6" aria-hidden="true" />
                        </span>
                        <span>
                          <span className="block font-display text-xl sm:text-2xl font-extrabold leading-tight">{cat}</span>
                          <span className="mt-1 inline-flex items-center gap-1 text-xs font-black uppercase tracking-wider">
                            Explore <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                          </span>
                        </span>
                      </Link>
                    </StaggerItem>
                  );
                })}
              </Stagger>
            </div>

            <Stagger className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-8">
              {EXPLORE_TILES.map((tile) => {
                const Icon = tile.icon;
                return (
                  <StaggerItem key={tile.to}>
                    <Link
                      to={tile.to}
                      className="group h-full min-h-[132px] rounded-[1.75rem] border-2 border-lake-950 bg-lake-50 hover:bg-lake-800 hover:text-white text-lake-950 p-4 sm:p-5 flex flex-col justify-between gap-3 shadow-pop-sm transition-colors duration-200"
                    >
                      <Icon className="w-7 h-7 text-coral-600 group-hover:text-sun-300 transition-colors" aria-hidden="true" />
                      <span>
                        <span className="block font-display text-xl sm:text-2xl font-extrabold leading-tight">{tile.title}</span>
                        <span className="block text-sm font-medium opacity-90 mt-0.5">{tile.desc}</span>
                      </span>
                    </Link>
                  </StaggerItem>
                );
              })}
            </Stagger>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 5. 45-DAY CALENDAR — COMPACT STRIP, FULL GRID ON DEMAND                    */}
        {/* ========================================================================= */}
        <section id="calendar-grid" className="bg-lake-50 py-12 sm:py-16 overflow-hidden">
          <div className="max-w-[1440px] mx-auto px-4 md:px-12">
            <Reveal className="flex flex-col md:flex-row md:items-end justify-between gap-5 mb-6">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-coral-700 mb-2">Sunday – Saturday master schedule</p>
                <h2 className="font-display text-[2.5rem] leading-none lg:text-6xl font-extrabold tracking-tight text-lake-950">
                  45-Day Community Calendar
                </h2>
                <p className="text-base text-slate-700 mt-3 max-w-2xl">
                  The next two weeks at a glance. Tap a day to see what&apos;s on, or open the full calendar.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowFullCalendar((v) => !v)}
                  aria-expanded={showFullCalendar}
                  aria-controls="home-full-calendar"
                  className="wg-shimmer inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full border-2 border-lake-800 text-lake-900 hover:bg-lake-800 hover:text-white text-xs font-black uppercase tracking-wider transition-colors cursor-pointer"
                >
                  {showFullCalendar ? 'Hide 45-day grid' : 'Show all 45 days'}
                  <ChevronDown className={`w-4 h-4 transition-transform ${showFullCalendar ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                <Link
                  to="/events"
                  className="wg-shimmer inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full bg-lake-800 hover:bg-coral-600 text-white text-xs font-black uppercase tracking-wider transition-colors"
                >
                  Full Calendar View <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
              </div>
            </Reveal>

            {/* Compact 14-day strip */}
            <div className="b-carousel gap-2.5 pb-2" tabIndex={0} aria-label="Next 14 days">
              {upcomingStripDays.map((day) => {
                const dayMatches = getDayEvents(day.offset, day.date);
                const hasOutOfArea = dayMatches.some((e) => e.isOutOfArea || isOutOfAreaLocation(e.location));
                const busy = dayMatches.length > 0;
                return (
                  <button
                    key={day.dateKey}
                    type="button"
                    onClick={() => setSelectedDayModal({ day, items: dayMatches })}
                    aria-label={`${day.dayLabel} ${day.fullDateStr}: ${dayMatches.length} ${dayMatches.length === 1 ? 'event' : 'events'}`}
                    className={`shrink-0 w-[84px] min-h-[112px] rounded-2xl p-2.5 flex flex-col items-center justify-between text-center border-2 transition-colors cursor-pointer ${
                      day.isToday
                        ? 'bg-coral-600 border-lake-950 text-white focus-ring-dark'
                        : busy
                        ? 'bg-white border-lake-800 text-lake-950 hover:bg-sun-300'
                        : 'bg-white/60 border-lake-200 text-slate-600 hover:border-lake-800'
                    }`}
                  >
                    <span className="text-[11px] font-black uppercase tracking-wider">{day.isToday ? 'Today' : day.dayName}</span>
                    <span className="font-display text-3xl font-extrabold leading-none">{day.dayNumber}</span>
                    <span className="text-[11px] font-bold">{day.monthName}</span>
                    <span className={`mt-1 inline-flex items-center gap-1 text-[11px] font-black ${busy ? '' : 'opacity-80'}`}>
                      {busy ? `${dayMatches.length} on` : '—'}
                      {hasOutOfArea && <span className={`w-1.5 h-1.5 rounded-full ${day.isToday ? 'bg-white' : 'bg-coral-600'}`} title="Includes Out of Area event"></span>}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-4 text-xs font-bold">
              <span className="wg-shimmer inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-lake-900 border border-lake-200">
                <span className="w-2 h-2 rounded-full bg-lake-600"></span>
                East Gwillimbury Events
              </span>
              <span className="wg-shimmer inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-coral-800 border border-coral-200">
                <span className="w-2 h-2 rounded-full bg-coral-600"></span>
                Out of Area (York Region)
              </span>
            </div>

            {showFullCalendar && (
              <div id="home-full-calendar" className="mt-8">
                {/* DESKTOP & TABLET SUNDAY-TO-SATURDAY 7-COLUMN GRID */}
                <div className="hidden md:block space-y-3">
                  <div className="grid grid-cols-7 gap-3 text-center text-xs font-black uppercase tracking-wider text-lake-800 px-2">
                    <div>Sunday</div>
                    <div>Monday</div>
                    <div>Tuesday</div>
                    <div>Wednesday</div>
                    <div>Thursday</div>
                    <div>Friday</div>
                    <div>Saturday</div>
                  </div>
                  <div className="grid grid-cols-7 gap-3">
                    {calendarDays.map((day, idx) => {
                      const dayMatches = day.isPast ? [] : getDayEvents(day.offset, day.date);
                      const hasOutOfArea = dayMatches.some(e => e.isOutOfArea || isOutOfAreaLocation(e.location));
                      return (
                        <button
                          key={day.dateKey || idx}
                          type="button"
                          disabled={day.isPast}
                          onClick={() => {
                            if (day.isPast) return;
                            setSelectedDayModal({ day, items: dayMatches });
                          }}
                          className={`min-h-[120px] p-3 rounded-2xl border-2 text-left transition-colors flex flex-col justify-between group relative overflow-hidden ${
                            day.isToday
                              ? 'bg-coral-100 border-coral-600 cursor-pointer'
                              : day.isPast
                              ? 'bg-lake-100/60 border-transparent cursor-default'
                              : 'bg-white border-lake-100 hover:border-lake-800 cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className={`font-display text-lg font-extrabold ${day.isPast ? 'text-slate-500' : 'text-lake-950'}`}>
                              {day.dayNumber}
                              <span className="text-[11px] font-sans text-slate-600 font-bold ml-1">{day.monthName}</span>
                            </span>
                            {day.isToday && (
                              <span className="wg-shimmer text-[10px] font-black uppercase tracking-wider bg-coral-600 text-white px-2 py-0.5 rounded-full">
                                Today
                              </span>
                            )}
                          </div>
                          {day.isPast ? (
                            <span className="text-xs font-bold text-slate-600 mt-2">You missed it!</span>
                          ) : (
                            <>
                              <div className="space-y-1.5 w-full my-1.5">
                                {dayMatches.length > 0 ? (
                                  <>
                                    {dayMatches.slice(0, 2).map((evt, eIdx) => {
                                      const outArea = evt.isOutOfArea || isOutOfAreaLocation(evt.location);
                                      return (
                                        <div
                                          key={evt.id || eIdx}
                                          className={`text-[11px] font-bold px-2 py-1 rounded-lg truncate ${
                                            outArea ? 'bg-coral-50 text-coral-800' : 'bg-lake-50 text-lake-900'
                                          }`}
                                          title={`${evt.title} (${evt.location})`}
                                        >
                                          {evt.title}
                                        </div>
                                      );
                                    })}
                                    {dayMatches.length > 2 && (
                                      <span className="block text-[11px] font-black text-lake-700 pl-1">
                                        +{dayMatches.length - 2} more {dayMatches.length - 2 === 1 ? 'event' : 'events'}
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-[11px] text-slate-500 font-medium block py-2">No listings</span>
                                )}
                              </div>
                              <div className="text-[11px] font-bold text-slate-600 flex items-center justify-between w-full">
                                <span className="flex items-center gap-1">
                                  <span>{dayMatches.length > 0 ? `${dayMatches.length} active` : 'View day'}</span>
                                  {hasOutOfArea && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-coral-600" title="Includes Out of Area event"></span>
                                  )}
                                </span>
                                <ArrowRight className="w-3.5 h-3.5 text-lake-800 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
                              </div>
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* MOBILE VIEW: STACKED SUNDAY-TO-SATURDAY WEEKS */}
                <div className="md:hidden space-y-5">
                  {calendarWeeks.map((week) => (
                    <div key={week.weekIndex} className="space-y-2">
                      <div className="flex items-center justify-between px-1 pb-1 border-b-2 border-lake-200">
                        <span className="text-xs font-black uppercase tracking-wider text-lake-950">
                          {week.isCurrentWeek ? 'Current Week (Sun – Sat)' : `Week ${week.weekIndex + 1} (Sun – Sat)`}
                        </span>
                        <span className="text-xs font-bold text-slate-600">
                          {week.startDate.monthName} {week.startDate.dayNumber} – {week.endDate.monthName} {week.endDate.dayNumber}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {week.days.filter((day) => !day.isPast).map((day, dIdx) => {
                          const dayMatches = day.isPast ? [] : getDayEvents(day.offset, day.date);
                          return (
                            <button
                              key={day.dateKey || dIdx}
                              type="button"
                              disabled={day.isPast}
                              onClick={() => {
                                if (day.isPast) return;
                                setSelectedDayModal({ day, items: dayMatches });
                              }}
                              className={`w-full p-3 rounded-2xl border-2 text-left transition-colors flex items-center justify-between gap-3 ${
                                day.isToday ? 'bg-coral-100 border-coral-600' : 'bg-white border-lake-100 hover:border-lake-800'
                              }`}
                            >
                              <div className={`w-14 py-1.5 px-1 rounded-xl text-center flex flex-col items-center justify-center shrink-0 ${
                                day.isToday ? 'bg-coral-600 text-white' : 'bg-lake-50 text-lake-950'
                              }`}>
                                <span className="text-[10px] font-black uppercase">{day.dayName}</span>
                                <span className="font-display text-xl font-extrabold leading-none my-0.5">{day.dayNumber}</span>
                                <span className="text-[10px] font-bold">{day.monthName}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                {dayMatches.length > 0 ? (
                                  <div>
                                    <p className="text-sm font-black text-lake-950 truncate">{dayMatches[0].title}</p>
                                    <p className="text-xs font-medium text-slate-600 truncate">
                                      {dayMatches[0].location}
                                      {dayMatches.length > 1 ? ` • +${dayMatches.length - 1} more` : ''}
                                    </p>
                                  </div>
                                ) : (
                                  <span className="text-sm text-slate-500">No scheduled listings</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <span className="text-xs font-black text-lake-800">
                                  {dayMatches.length > 0 ? `${dayMatches.length}` : 'View'}
                                </span>
                                <ChevronRight className="w-4 h-4 text-lake-600" aria-hidden="true" />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {selectedDayModal && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto pt-6 pb-8 px-4 bg-lake-950/70 backdrop-blur-sm animate-fadeIn" onClick={() => setSelectedDayModal(null)}>
            <div role="dialog" aria-modal="true" aria-labelledby="day-modal-title" onClick={e => e.stopPropagation()} className="bg-white rounded-[2rem] max-w-lg w-full p-6 md:p-7 shadow-2xl border-t-8 border-coral-500 relative max-h-[85vh] flex flex-col">
              <button
                type="button"
                onClick={() => setSelectedDayModal(null)}
                className="absolute top-4 right-4 w-11 h-11 inline-flex items-center justify-center text-lake-800 rounded-full hover:bg-lake-50 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Day Header */}
              <div className="border-b border-lake-100 pb-4 pr-12">
                <div className="flex items-center gap-2 mb-1">
                  <span className="wg-shimmer text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-lake-100 text-lake-900">
                    Day Schedule
                  </span>
                  <span className="text-xs font-bold text-slate-600">
                    {selectedDayModal.items.length} {selectedDayModal.items.length === 1 ? 'event scheduled' : 'events scheduled'}
                  </span>
                </div>
                <h3 id="day-modal-title" className="font-display text-2xl md:text-3xl font-extrabold text-lake-950 leading-tight">
                  {selectedDayModal.day.dayLabel} • {selectedDayModal.day.fullDateStr}
                </h3>
              </div>

              {/* Scrollable Events List in Modal */}
              <div className="flex-1 overflow-y-auto space-y-3 py-4 pr-1">
                {selectedDayModal.items.map((evt) => (
                  <div
                    key={evt.id}
                    onClick={() => {
                      setSelectedDayModal(null);
                      setSelectedModalEvent(evt);
                    }}
                    className="p-4 rounded-2xl bg-lake-50 hover:bg-sun-100 border-2 border-transparent hover:border-lake-800 transition-colors cursor-pointer group text-left"
                  >
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span
                        className={`py-0.5 px-2.5 inline-flex items-center justify-center text-center leading-none text-[10.5px] font-black uppercase whitespace-nowrap rounded ${getCategoryBadgeStyle(evt.category, evt.type)}`}
                      >
                        {formatCategoryLabel(evt.category || 'Event')}
                      </span>
                      {(evt.isOutOfArea || isOutOfAreaLocation(evt.location)) && (
                        <span className="py-0.5 px-2 inline-flex items-center justify-center text-[10px] font-black uppercase rounded bg-coral-100 text-coral-800">
                          Out of Area
                        </span>
                      )}
                      {evt.area && (
                        <span className="text-xs text-slate-600 font-bold truncate">
                          {evt.area}
                        </span>
                      )}
                    </div>
                    <h4 className="font-display text-lg font-extrabold text-lake-950 leading-snug">
                      {evt.title}
                    </h4>
                    {evt.time && (
                      <p className="text-sm text-slate-700 font-medium mt-1.5 flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-coral-600 shrink-0" aria-hidden="true" />
                        <span>{evt.time}</span>
                      </p>
                    )}
                    {(evt.organizer || evt.business_name) && (
                      <p className="text-xs text-slate-600 font-semibold mt-1">
                        Host: {evt.organizer || evt.business_name}
                      </p>
                    )}
                    <div className="mt-2 text-xs font-black text-lake-800 group-hover:underline flex items-center gap-1">
                      <span>View details</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </div>
                  </div>
                ))}
              </div>

              {/* Modal Footer */}
              <div className="border-t border-lake-100 pt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedDayModal(null)}
                  className="wg-shimmer min-h-[44px] px-5 rounded-full bg-lake-50 hover:bg-lake-100 text-lake-900 font-black text-xs uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Event Detail Modal */}
        {selectedModalEvent && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto pt-6 pb-8 px-4 bg-lake-950/70 backdrop-blur-sm animate-fadeIn" onClick={() => setSelectedModalEvent(null)}>
            <div role="dialog" aria-modal="true" aria-labelledby="event-modal-title" onClick={e => e.stopPropagation()} className="bg-white rounded-[2rem] max-w-lg w-full p-6 md:p-8 shadow-2xl border-t-8 border-coral-500 relative space-y-4">
              <button
                type="button"
                onClick={() => setSelectedModalEvent(null)}
                className="absolute top-4 right-4 w-11 h-11 inline-flex items-center justify-center text-lake-800 rounded-full hover:bg-lake-50"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2 pr-12">
                <span className={`wg-shimmer text-[11px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full ${
                  selectedModalEvent.type === 'sale'
                    ? 'bg-sun-200 text-lake-950'
                    : 'bg-lake-100 text-lake-900'
                }`}>
                  {selectedModalEvent.type === 'sale' ? 'Local Sale / Deal' : formatCategoryLabel(selectedModalEvent.category || 'Event')}
                </span>
                {selectedModalEvent.isSponsored && (
                  <span className="wg-shimmer text-[11px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-coral-600 text-white">
                    Featured
                  </span>
                )}
              </div>

              <h3 id="event-modal-title" className="font-display text-2xl md:text-3xl font-extrabold text-lake-950 leading-tight">
                {selectedModalEvent.title}
              </h3>

              <div className="space-y-2 text-sm text-slate-700 bg-lake-50 p-4 rounded-2xl">
                {(selectedModalEvent.organizer || selectedModalEvent.business_name) && (
                  <p className="font-bold text-lake-950">
                    Host: {selectedModalEvent.organizer || selectedModalEvent.business_name}
                  </p>
                )}
                {selectedModalEvent.time && (
                  <p className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-coral-600" aria-hidden="true" />
                    <span>{selectedModalEvent.time}</span>
                  </p>
                )}
                {selectedModalEvent.area && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-coral-600 shrink-0" aria-hidden="true" />
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedModalEvent.area + (selectedModalEvent.area.toLowerCase().includes('georgina') ? '' : ', East Gwillimbury, ON'))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-800 hover:text-emerald-900 hover:underline font-semibold flex items-center gap-1 group/map"
                      title="Open in Google Maps"
                    >
                      <span>{selectedModalEvent.area}</span>
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    </a>
                  </div>
                )}
                {selectedModalEvent.type === 'sale' && selectedModalEvent.price_text && (
                  <p className="flex items-center gap-2 text-coral-800 font-black">
                    <Tag className="w-4 h-4" aria-hidden="true" />
                    <span>{selectedModalEvent.price_text}</span>
                  </p>
                )}
              </div>

              {selectedModalEvent.description && (
                <p className="text-base text-slate-700 leading-relaxed">
                  {selectedModalEvent.description}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <Link
                  to={`/events/${selectedModalEvent.slug || selectedModalEvent.id}`}
                  onClick={() => setSelectedModalEvent(null)}
                  className="wg-shimmer flex-1 min-h-[48px] inline-flex items-center justify-center text-center bg-lake-800 hover:bg-coral-600 text-white font-black text-xs uppercase tracking-wider px-4 rounded-full transition-colors"
                >
                  View Full Event Details &rarr;
                </Link>
                <button
                  type="button"
                  onClick={() => setSelectedModalEvent(null)}
                  className="wg-shimmer min-h-[48px] px-5 rounded-full bg-lake-50 hover:bg-lake-100 text-lake-900 font-black text-xs uppercase tracking-wider transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

export default Home;
