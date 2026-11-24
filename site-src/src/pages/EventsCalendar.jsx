import React, { useState, useMemo, useEffect } from 'react';



import {



  Link, useSearchParams } from 'react-router-dom';
import { detailPath, PUBLIC_LISTING_COLUMNS, notEndedFilter } from '../utils/links';
import { GEORGINA_COMMUNITIES, OUT_OF_AREA, resolveCommunity, mapsQuery } from '../utils/communities';
import { CARD_SHELL_CLASS, getCardStripeClass } from '../utils/cardStyles';

const isNewsItem = (item) => {
  const cat = String(item?.category || '').toLowerCase();
  return cat === 'local_news' || cat === 'municipal_news' || cat === 'news' || (!item?.event_start_date && cat !== 'dining' && cat !== 'special_sale');
};



import {



  supabase } from '../supabaseClient';



import {



  Calendar as CalendarIcon, 



  Sparkles, 



  Tag, 



  MapPin, 



  Clock, 



  ExternalLink, 



  ChevronLeft, 



  ChevronRight, 



  AlertCircle,



  Building2,



  Users,



  Store,



  X,



  ArrowRight,



  Download,



  Filter



} from 'lucide-react';



import {

  formatDDMonthYYYY,
  formatEventScheduleDisplay,



  isThisWeekend, 



  parseToMidnight, 



  getTorontoTodayMidnight, 



  downloadEventIcs,



  formatCategoryLabel,



  parseEventOffsets,



  matchEventToCalendarDay,



  sortEventsForCalendarDay,



  getCategoryBadgeStyle,

  isOutOfAreaLocation,

  formatLocationDisplay



} from '../services/discoveryService';







// Curated Community & Town of East Gwillimbury Items (Dynamic only from Supabase vendor_events)



const CATEGORY_DISPLAY_MAP = {



  'library_events': 'East Gwillimbury Public Library',



  'chamber_events': 'Chamber of Commerce',



  'theatre_events': 'Concerts & Shows',



  'concerts_shows': 'Concerts & Shows',



  'live_music': 'Concerts & Shows',



  'upcoming_events': 'Town Event',



  'private_business_events': 'Local Venue / Business',



  'eventbrite_meetup': 'Local Gathering',



  'partner_deals': 'Featured Local Perk',



  'municipal_news': 'Town Notice',



  'news': 'Local News',



  'dining': 'Local Dining'



};







const CALENDAR_ITEMS = [];







const FALLBACK_WEEKEND_ACTIVITIES = [];







export default function EventsCalendar() {



  const [searchParams, setSearchParams] = useSearchParams();



  const initialView = searchParams.get('view') === 'today' || searchParams.get('timing') === 'today'
    ? 'today'
    : (searchParams.get('view') === 'weekend' 
      ? 'weekend' 
      : (searchParams.get('view') === '14-day' ? '14-day' : '6-week'));

  const [viewMode, setViewMode] = useState(initialView); // 'today', 'weekend', '14-day', '6-week'



  const [selectedDate, setSelectedDate] = useState(null);



  const [activeModalItems, setActiveModalItems] = useState([]);



  const [liveEvents, setLiveEvents] = useState([]);



  const [rawDbEvents, setRawDbEvents] = useState([]);
  const [mobileWeekFilter, setMobileWeekFilter] = useState('all'); // 'all', 'current', 'upcoming'







  // Weekend sub-filters



  const [weekendDayFilter, setWeekendDayFilter] = useState('All'); // 'All', 'Friday', 'Saturday', 'Sunday'



  const [weekendCommunityFilter, setWeekendCommunityFilter] = useState('All');







  // Sync viewMode with URL params



  useEffect(() => {



    const params = new URLSearchParams(searchParams);



    if (viewMode !== '6-week') {



      params.set('view', viewMode);



    } else {



      params.delete('view');



    }



    setSearchParams(params, { replace: true });



  }, [viewMode, setSearchParams]);







  // Fetch approved vendor events and sales dynamically from Supabase



  useEffect(() => {



    async function fetchLiveEvents() {



      try {



        const { data, error } = await supabase



          .from('vendor_events')



          .select(PUBLIC_LISTING_COLUMNS)



          .eq('status', 'approved').or(notEndedFilter());







        if (!error && data && data.length > 0) {



          // Rule: Exclude dining, retail sales, and news articles from the Events Calendar
          const nonDiningData = data.filter(evt => {
            const cat = (evt.category || '').toLowerCase().trim();
            const titleStr = String(evt.title || '');
            if (titleStr.startsWith('[Sale]')) return false;
            // Exclude dining & sales
            if (cat === 'dining' || cat === 'restaurant' || cat === 'food_and_drink' || cat === 'dining_deals' || cat === 'sale' || cat === 'partner_deals' || cat === 'special_sale') return false;
            // Exclude news articles and press releases (these belong in /news/newsroom.html)
            if (cat === 'local_news' || cat === 'municipal_news' || cat === 'news' || cat === 'press_release') return false;
            return true;
          });

          setRawDbEvents(nonDiningData);

          const todayMid = getTorontoTodayMidnight();

          const formatted = nonDiningData.map(evt => {
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

            return {
              id: evt.id,
              type: itemType,
              title: evt.title,
              organizer: evt.business_name,
              business_name: evt.business_name,
              area: formattedLoc,
              location: formattedLoc,
              isOutOfArea: outOfArea,
              time: formatEventScheduleDisplay(evt) || formatDDMonthYYYY(evt.event_date_label || evt.event_start_date) || (recurringDay !== null ? 'Weekly' : 'Ongoing / Drop-In'),
              event_date_label: formatEventScheduleDisplay(evt) || formatDDMonthYYYY(evt.event_date_label || evt.event_start_date) || 'See details',
              event_start_date: evt.event_start_date,
              expires_after: evt.expires_after,
              slug: evt.slug || '',
              dateOffsetDays: startOffset,
              startOffset: startOffset,
              endOffset: endOffset,
              recurringDay: recurringDay,
              recurringDays: recurringDays,
              monthlyRule: monthlyRule,
              exactDates: exactDates,
              isOngoing: isOngoing,
              isDateRange: isDateRange,
              category: catName,
              description: evt.summary || '',
              link: evt.link || 'https://welcomeeg.ca/events',
              isSponsored: true,
              isPaidMember: true,
              badge: badgeLabel
            };
          });

          setLiveEvents(formatted);



        }



      } catch (err) {



        console.warn('Events fetch notice:', err);



      }



    }



    fetchLiveEvents();



  }, []);







  // Compute 6-week window based on today:



  const today = useMemo(() => new Date(), []);







  // Generate calendar days for the 6 weeks (42 days)



  const calendarDays = useMemo(() => {



    const todayMid = getTorontoTodayMidnight();



    const todayDayOfWeek = todayMid.getDay(); // 0 is Sunday, 1 is Monday...



    // Start of current week (Sunday)



    const currentWeekStart = new Date(todayMid);



    currentWeekStart.setDate(todayMid.getDate() - todayDayOfWeek);



    currentWeekStart.setHours(0, 0, 0, 0);







    // Enhanced smart deduplication: collapses duplicate crawler/submitted entries
    const cleanEventTitleKey = (title) => {
      if (!title) return '';
      let t = String(title).trim().toLowerCase();
      t = t.replace(/^(the\s+)?town\s+of\s+georgina\s*[-:–—•]\s*/i, '');
      t = t.replace(/^explore\s+georgina\s*[-:–—•]\s*/i, '');
      t = t.replace(/^georgina\s+chamber\s+(of\s+commerce)?\s*[-:–—•]\s*/i, '');
      t = t.replace(/^georgina\s+public\s+library\s*[-:–—•]\s*/i, '');
      t = t.replace(/\bannual\b/gi, '');
      t = t.replace(/[^\w\s]/g, ' ');
      return t.split(/\s+/).filter(Boolean).join(' ');
    };

    const seenMap = new Map();
    for (const item of [...liveEvents, ...CALENDAR_ITEMS]) {
      const cleanTitle = cleanEventTitleKey(item.title);
      const dateKey = item.event_start_date || (item.startOffset !== null ? `offset_${item.startOffset}` : (item.event_date_label || 'undated'));
      const dedupKey = `${cleanTitle}_${dateKey}`;

      if (!seenMap.has(dedupKey)) {
        seenMap.set(dedupKey, item);
      } else {
        const existing = seenMap.get(dedupKey);
        // Retain the item with richer info (e.g. image, longer description, or specific link)
        if ((item.image_url && !existing.image_url) || ((item.description?.length || 0) > (existing.description?.length || 0))) {
          seenMap.set(dedupKey, item);
        }
      }
    }
    const allItems = Array.from(seenMap.values());

    const days = [];
    // Sunday to Saturday weeks: 45 days from today starting from the Sunday of the current week
    const totalDays = Math.ceil((todayDayOfWeek + 45) / 7) * 7;
    for (let i = 0; i < totalDays; i++) {
      const dayDate = new Date(currentWeekStart);
      dayDate.setDate(currentWeekStart.getDate() + i);
      dayDate.setHours(0, 0, 0, 0);

      const isCurrentWeek = i < 7;
      const isFutureWeek = i >= 7;
      const isToday = dayDate.getTime() === todayMid.getTime();
      const isPast = dayDate.getTime() < todayMid.getTime();
      const diffDays = Math.round((dayDate.getTime() - todayMid.getTime()) / 86400000);

      // For days that have passed, do not display any events
      const matchedItems = isPast
        ? []
        : sortEventsForCalendarDay(allItems.filter(item => matchEventToCalendarDay(item, dayDate, diffDays)), allItems);

      days.push({
        date: dayDate,
        dayNumber: dayDate.getDate(),
        dayName: dayDate.toLocaleDateString('en-US', { weekday: 'short' }),
        monthName: dayDate.toLocaleDateString('en-US', { month: 'short' }),
        isPast,
        isPastWeek: false,
        isCurrentWeek,
        isFutureWeek,
        isToday,
        items: matchedItems
      });
    }

    return days;



  }, [liveEvents]);

  // Group 42 calendar days into 6 distinct weeks
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
          days: slice,
        });
      }
    }
    return weeks;
  }, [calendarDays]);

  const visibleMobileWeeks = useMemo(() => {
    if (mobileWeekFilter === 'current') return calendarWeeks.filter(w => w.isCurrentWeek);
    if (mobileWeekFilter === 'upcoming') return calendarWeeks.filter(w => !w.isCurrentWeek);
    return calendarWeeks;
  }, [calendarWeeks, mobileWeekFilter]);

  const visibleCalendarDays = useMemo(() => {
    if (mobileWeekFilter === 'current') return calendarDays.slice(0, 7);
    if (mobileWeekFilter === 'upcoming') return calendarDays.slice(7);
    return calendarDays;
  }, [calendarDays, mobileWeekFilter]);







  // Compute 14-Day upcoming list



  const upcoming14Days = useMemo(() => {



    const todayMid = getTorontoTodayMidnight();







    const days = [];



    for (let i = 0; i < 14; i++) {



      const d = new Date(todayMid);



      d.setDate(todayMid.getDate() + i);



      const isToday = i === 0;







      const items = sortEventsForCalendarDay(liveEvents.filter(it => matchEventToCalendarDay(it, d, i)), liveEvents);







      days.push({



        date: d,



        dayLabel: isToday ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' }),



        fullDateStr: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),



        isToday,



        items



      });



    }



    return days;



  }, [liveEvents]);







    // Compute Weekend events (strictly this weekend: Friday, Saturday, Sunday - max 3 consecutive days)
  const weekendEvents = useMemo(() => {
    const weekendFilteredDb = rawDbEvents.filter(evt => {
      if (evt.event_start_date) {
        return isThisWeekend(evt.event_start_date);
      }
      const textCheck = (evt.event_date_label || '').toLowerCase();
      return textCheck.includes('friday') || textCheck.includes('saturday') || textCheck.includes('sunday') || textCheck.includes('weekend');
    });

    const combined = [...weekendFilteredDb];
    if (combined.length < 3) {
      combined.push(...FALLBACK_WEEKEND_ACTIVITIES);
    }

    // Sort strictly chronologically (earliest date first)
    combined.sort((a, b) => {
      const timeA = parseToMidnight(a.event_start_date)?.getTime() || 0;
      const timeB = parseToMidnight(b.event_start_date)?.getTime() || 0;
      return timeA - timeB;
    });







    const mapped = combined.map(it => {



      let day = it.day;



      if (!day) {



        if (it.event_start_date) {



          const d = parseToMidnight(it.event_start_date);



          if (d) {



            const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];



            day = names[d.getDay()] || 'Weekend';



          }



        }



        if (!day) {



          const text = (it.event_date_label || '').toLowerCase();



          if (text.includes('fri')) day = 'Friday';



          else if (text.includes('sat')) day = 'Saturday';



          else if (text.includes('sun')) day = 'Sunday';



          else day = 'Weekend';



        }



      }







      const comm = resolveCommunity(it.community, it.location);







      return {



        ...it,



        computedDay: day,



        computedCommunity: comm,



        location: it.location || 'East Gwillimbury, ON'



      };



    });







    return mapped.filter(evt => {



      if (weekendDayFilter !== 'All' && evt.computedDay !== weekendDayFilter && evt.computedDay !== 'Weekend') return false;



      if (weekendCommunityFilter !== 'All' && evt.computedCommunity !== weekendCommunityFilter) return false;



      return true;
    });
  }, [rawDbEvents, weekendDayFilter, weekendCommunityFilter]);

  // Today's events list (Full cards view)
  const todayEventsList = useMemo(() => {
    const todayMid = getTorontoTodayMidnight();
    const todayYMD = todayMid.toISOString().split('T')[0];
    const all = [...liveEvents, ...CALENDAR_ITEMS];
    const seen = new Set();
    const matches = [];

    all.forEach(item => {
      const d = item.date || item.event_start_date;
      if (d === todayYMD) {
        const key = item.id || item.title;
        if (!seen.has(key)) {
          seen.add(key);
          matches.push(item);
        }
      }
    });

    if (matches.length > 0) return matches;
    return all.slice(0, 4);
  }, [liveEvents]);







  // Handle day click for 45-day grid (disabled for past days)
  const handleDayClick = (day) => {
    if (day.isPast) return;
    setSelectedDate(day);
    const sortedItems = sortEventsForCalendarDay(day.items, liveEvents);
    setActiveModalItems(sortedItems);
  };







  // JSON-LD Structured Data



  const eventStructuredData = useMemo(() => {
    const seenMap = new Map();
    for (const item of [...liveEvents, ...CALENDAR_ITEMS]) {
      const cleanTitle = (item.title || '').trim().toLowerCase().replace(/[^\w\s]/g, ' ');
      const dateKey = item.event_start_date || (item.startOffset !== null ? `offset_${item.startOffset}` : (item.event_date_label || 'undated'));
      const key = `${cleanTitle}_${dateKey}`;
      if (!seenMap.has(key)) {
        seenMap.set(key, item);
      }
    }
    const allItems = Array.from(seenMap.values());
    const todayMid = getTorontoTodayMidnight();







    const elements = allItems.slice(0, 50).map((item, idx) => {



      let startDateIso = todayMid.toISOString();



      if (item.startOffset !== undefined && item.startOffset !== null) {



        const d = new Date(todayMid);



        d.setDate(todayMid.getDate() + item.startOffset);



        startDateIso = d.toISOString();



      }







      return {



        "@type": "ListItem",



        "position": idx + 1,



        "item": {



          "@type": "Event",



          "name": item.title,



          "description": item.description || `Community event in East Gwillimbury organized by ${item.organizer || 'Local Organization'}.`,



          "startDate": startDateIso,



          "eventStatus": "https://schema.org/EventScheduled",



          "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",



          "location": {



            "@type": "Place",



            "name": item.location || item.area || "East Gwillimbury, ON",



            "address": {



              "@type": "PostalAddress",



              "addressLocality": (item.area && item.area.includes("Holland Landing")) ? "Holland Landing" : ((item.area && item.area.includes("Mount Albert")) ? "Mount Albert" : "East Gwillimbury"),



              "addressRegion": "ON",



              "addressCountry": "CA"



            }



          },



          "organizer": {



            "@type": "Organization",



            "name": item.organizer || item.business_name || "East Gwillimbury Community Partner",



            "url": item.link || "https://welcomeeg.ca/events"



          },



          "url": "https://welcomeeg.ca/events"



        }



      };



    });







    return {



      "@context": "https://schema.org",



      "@type": "ItemList",



      "name": "East Gwillimbury Community Events & Activities Calendar",



      "description": "Comprehensive schedule of upcoming community events, recreation activities, performances, and public meetings across East Gwillimbury, ON.",



      "itemListElement": elements



    };



  }, [liveEvents]);







  return (



    <div className="max-w-[1440px] mx-auto w-full min-w-0 overflow-x-clip px-4 md:px-8 lg:px-12 py-10 flex flex-col gap-8">



      {/* JSON-LD Schema for Event Discovery */}



      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(eventStructuredData).replace(/</g, '\\u003c') }} />







      {/* Page Header */}



      {/* Page Header — Design B East Gwillimbury Atmospheric Sunset */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-lake-950 via-lake-800 to-indigo-950 text-white p-8 sm:p-10 md:p-14 shadow-lift border border-lake-700/50">
        {/* Atmospheric ambient glows */}
        <div className="absolute right-0 top-0 w-96 h-96 bg-sun-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 -bottom-10 w-80 h-80 bg-coral-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Subtle decorative East Gwillimbury wave contour */}
        <svg
          className="absolute -right-12 -bottom-16 w-[500px] h-[220px] text-white/[0.03] pointer-events-none select-none"
          viewBox="0 0 1440 320"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M0,192L48,197.3C96,203,192,213,288,192C384,171,480,117,576,122.7C672,128,768,192,864,208C960,224,1056,192,1152,165.3C1248,139,1344,117,1392,106.7L1440,96L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" />
        </svg>

        <div className="relative z-10 max-w-4xl">
          {/* Live Pulsing Event Count Pill matching Home */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-lake-900/80 border border-lake-600/70 text-sun-200 text-xs sm:text-sm font-bold mb-4 shadow-sm backdrop-blur-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-sun-400 animate-pulse" aria-hidden="true"></span>
            <span>Master Community Schedule &bull; East Gwillimbury &amp; Regional Events</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight font-display text-white leading-[1.1] mb-4">
            East Gwillimbury Community Calendar
          </h1>

          <p className="text-blue-100 text-sm sm:text-base md:text-lg leading-relaxed max-w-2xl font-medium">
            Every verified festival, weekend activity, live music performance, and regional gathering across Holland Landing, Mount Albert, Jackson&apos;s Point, and all 9 East Gwillimbury communities.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3 sm:gap-4">
            <a
              href="/submission?tab=events"
              className="inline-flex items-center gap-2 min-h-[46px] px-6 rounded-full bg-coral-600 hover:bg-sun-400 text-white hover:text-lake-950 font-black text-xs sm:text-sm uppercase tracking-wider shadow-pop-sm hover:-translate-y-0.5 transition-all"
            >
              <span>Submit Community Event Free</span>
              <span>&rarr;</span>
            </a>

            <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 text-xs font-bold text-blue-100">
              <CalendarIcon className="w-4 h-4 text-sun-300 shrink-0" aria-hidden="true" />
              <span>4 Interactive Timeline Views Below</span>
            </div>
          </div>
        </div>
      </div>







      {/* UNIFIED MASTER CALENDAR SELECTOR TABS — DESIGN B SEGMENTED PILLS (50% WIDTH ON MOBILE) */}
      <div className="bg-white p-2.5 sm:p-3 rounded-3xl border border-lake-100 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setViewMode('today')}
            className={`w-full sm:w-auto min-h-[44px] px-3 sm:px-5 py-2.5 sm:py-3 rounded-full font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-1.5 sm:gap-2 transition-all whitespace-nowrap ${
              viewMode === 'today'
                ? 'bg-lake-800 text-white shadow-pop-sm'
                : 'bg-lake-50/70 text-lake-900 hover:bg-lake-100 border border-lake-100/50'
            }`}
          >
            <Clock className={`w-4 h-4 shrink-0 ${viewMode === 'today' ? 'text-sun-300' : 'text-lake-600'}`} />
            <span>Today ({todayEventsList.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('weekend')}
            className={`w-full sm:w-auto min-h-[44px] px-3 sm:px-5 py-2.5 sm:py-3 rounded-full font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-1.5 sm:gap-2 transition-all whitespace-nowrap ${
              viewMode === 'weekend'
                ? 'bg-lake-800 text-white shadow-pop-sm'
                : 'bg-lake-50/70 text-lake-900 hover:bg-lake-100 border border-lake-100/50'
            }`}
          >
            <Sparkles className={`w-4 h-4 shrink-0 ${viewMode === 'weekend' ? 'text-sun-300' : 'text-lake-600'}`} />
            <span>This Weekend</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('14-day')}
            className={`w-full sm:w-auto min-h-[44px] px-3 sm:px-5 py-2.5 sm:py-3 rounded-full font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-1.5 sm:gap-2 transition-all whitespace-nowrap ${
              viewMode === '14-day'
                ? 'bg-lake-800 text-white shadow-pop-sm'
                : 'bg-lake-50/70 text-lake-900 hover:bg-lake-100 border border-lake-100/50'
            }`}
          >
            <CalendarIcon className={`w-4 h-4 shrink-0 ${viewMode === '14-day' ? 'text-sun-300' : 'text-lake-600'}`} />
            <span>14-Day Outlook</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('6-week')}
            className={`w-full sm:w-auto min-h-[44px] px-3 sm:px-5 py-2.5 sm:py-3 rounded-full font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-1.5 sm:gap-2 transition-all whitespace-nowrap ${
              viewMode === '6-week'
                ? 'bg-lake-800 text-white shadow-pop-sm'
                : 'bg-lake-50/70 text-lake-900 hover:bg-lake-100 border border-lake-100/50'
            }`}
          >
            <CalendarIcon className={`w-4 h-4 shrink-0 ${viewMode === '6-week' ? 'text-sun-300' : 'text-lake-600'}`} />
            <span>45-Day Master Grid</span>
          </button>
        </div>

        <div className="text-xs font-black text-lake-800 px-4 hidden lg:inline-flex items-center gap-1.5 uppercase tracking-wider">
          <span className="w-2 h-2 rounded-full bg-coral-500"></span>
          <span>{viewMode === 'today' ? "Today's Schedule" : (viewMode === 'weekend' ? 'Friday – Sunday Planner' : (viewMode === '14-day' ? 'Upcoming 2-Week Timeline' : '45-Day Sunday–Saturday Grid'))}</span>
        </div>
      </div>







      {/* ===================================================================== */}
      {/* VIEW: TODAY IN GEORGINA (ALL FULL EXPANDED EVENT CARDS) */}
      {/* ===================================================================== */}
      {viewMode === 'today' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-full">
                Today&apos;s East Gwillimbury Schedule
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight mt-1">
                Events &amp; Community Happenings Today
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Full event cards with locations, schedule times, and direct access links.
              </p>
            </div>
            <span className="text-xs font-bold text-lake-800 bg-blue-50 px-3.5 py-1.5 rounded-xl border border-blue-200">
              {todayEventsList.length} {todayEventsList.length === 1 ? 'Event Today' : 'Events Today'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {todayEventsList.map((item, idx) => (
              <div
                key={item.id || idx}
                className="p-6 rounded-3xl border border-lake-100 bg-white shadow-sm hover:shadow-lift hover:-translate-y-0.5 transition-all flex flex-col justify-between group min-w-0 max-w-full overflow-hidden"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2.5 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10.5px] font-black uppercase tracking-wider px-3 py-1 rounded-full bg-lake-50 text-lake-900 border border-lake-200">
                        {item.categoryLabel || item.category || 'Community Event'}
                      </span>
                      {(item.isOutOfArea || isOutOfAreaLocation(item.location)) && (
                        <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                          Out of Area
                        </span>
                      )}
                    </div>
                    {item.community && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-lake-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                        <MapPin className="w-3 h-3 text-coral-600" aria-hidden="true" />{item.community}
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl font-black text-slate-900 font-display group-hover:text-lake-800 transition-colors mb-2 leading-snug">
                    {item.title}
                  </h3>
                  <div className="flex items-center gap-2 text-xs font-bold text-lake-800 mb-2">
                    <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>{item.dateLabel || item.event_date_label || 'Today'}</span>
                  </div>
                  {item.location && (
                    <div className="flex items-center gap-2 text-xs text-gray-600 mb-3">
                      <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      <span>{item.location}</span>
                    </div>
                  )}
                  <p className="text-xs text-gray-600 leading-relaxed mb-4">
                    {item.description || item.summary}
                  </p>
                </div>

                <div className="pt-3.5 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-gray-500">
                    Host: <strong className="text-gray-700">{item.organizer || item.business_name || 'Town of East Gwillimbury'}</strong>
                  </span>
                  {item.link ? (
                    <Link
                      to={detailPath(item)}
                      className="px-4 py-2 rounded-full bg-lake-800 text-white text-xs font-black uppercase tracking-wider hover:bg-lake-700 shadow-pop-sm hover:-translate-y-0.5 transition-all inline-flex items-center gap-1.5"
                    >
                      <span>Event Info &rarr;</span>
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* VIEW A: THIS WEEKEND PLANNER */}
      {/* ===================================================================== */}
      {viewMode === 'weekend' && (



        <div className="space-y-6 animate-fadeIn">



          {/* Weekend Filter Controls */}



          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-wrap items-center justify-between gap-4">



            <div className="flex flex-wrap items-center gap-2">



              <span className="text-xs font-black uppercase text-gray-600 mr-1">Day:</span>



              {['All', 'Friday', 'Saturday', 'Sunday'].map(day => (



                <button



                  key={day}



                  type="button"



                  onClick={() => setWeekendDayFilter(day)}



                  className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${



                    weekendDayFilter === day



                      ? 'bg-lake-800 text-white font-black'



                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'



                  }`}



                >



                  {day}



                </button>



              ))}



            </div>







            <div className="flex items-center gap-2">



              <span className="text-xs font-black uppercase text-gray-600">Community:</span>



              <select



                value={weekendCommunityFilter}



                onChange={e => setWeekendCommunityFilter(e.target.value)}



                className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-bold text-gray-800 bg-gray-50 focus:outline-none"



              >



                {['All', ...GEORGINA_COMMUNITIES, OUT_OF_AREA].map(c => (



                  <option key={c} value={c}>{c}</option>



                ))}



              </select>



            </div>



          </div>







          {/* Weekend Cards Grid */}



          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">



            {weekendEvents.map(evt => {



              const addressQuery = encodeURIComponent(mapsQuery(evt.location));



              const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${addressQuery}`;







              return (



                <div



                  key={evt.id}
                  className={CARD_SHELL_CLASS}
                >
                  <div className={`h-2 ${getCardStripeClass(evt.category || evt.badge, 'lake')}`} aria-hidden="true" />
                  <div className="p-6 flex-1 flex flex-col justify-between min-w-0">
                  <div className="min-w-0">



                    <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">



                      <div className="flex items-center gap-1.5 flex-wrap">



                        <span className={`py-1 px-3 inline-flex items-center justify-center text-center leading-none text-[12.5px] font-medium uppercase whitespace-nowrap rounded ${getCategoryBadgeStyle(evt.category || evt.badge, evt.type)}`}>



                          {formatCategoryLabel(evt.category || evt.badge || 'Weekend')}



                        </span>



                        <span className="py-1 px-2.5 rounded-md bg-gray-100 text-gray-700 text-[12.5px] font-medium">



                          {evt.computedDay || 'Weekend'}



                        </span>



                      </div>



                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(evt.isOutOfArea || isOutOfAreaLocation(evt.location)) ? (
                          <span className="py-1 px-2.5 rounded-md bg-rose-100 text-rose-800 border border-rose-200 text-[12px] font-black uppercase tracking-wider">
                            Out of Area
                          </span>
                        ) : (
                          <span className="py-1 px-2.5 rounded-md bg-gray-100 text-gray-700 text-[12.5px] font-medium">
                            {evt.computedCommunity || 'East Gwillimbury'}
                          </span>
                        )}
                      </div>



                    </div>







                    <h3 className="font-display text-[22px] font-extrabold text-lake-950 leading-snug group-hover:text-lake-800 transition-colors">



                      {evt.title}



                    </h3>







                    {/* Clock & Physical Street Address with 1-click Google Maps Link (125% Enlarged to 15px) */}



                    <div className="space-y-2.5 mt-3.5 text-[18px] font-normal text-gray-700">



                      <div className="flex items-center gap-2">



                        <Clock className="w-4 h-4 text-coral-600 shrink-0" />



                        <span className="leading-snug">{formatDDMonthYYYY(evt.event_date_label || evt.time || 'Weekend Schedule')}</span>



                      </div>







                      <div className="flex items-start gap-2 pt-0.5">



                        <MapPin className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />



                        <a



                          href={gmapsUrl}



                          target="_blank"



                          rel="noopener noreferrer"



                          className="hover:text-green-900 hover:underline font-normal flex items-center gap-1 text-green-800 group/map leading-snug"



                          title="Open physical address in Google Maps"



                        >



                          <span>{evt.location}</span>



                          <ExternalLink className="w-3.5 h-3.5 text-green-800 group-hover/map:text-green-900 shrink-0 inline" />



                        </a>



                      </div>



                    </div>







                    {evt.summary && (



                      <p className="text-[18px] text-gray-600 font-normal mt-3.5 line-clamp-3 leading-relaxed">



                        {evt.summary}



                      </p>



                    )}



                  </div>







                  <div className="mt-6 px-6 py-3.5 -mx-6 -mb-6 bg-lake-50/60 border-t border-lake-100 flex items-center justify-between gap-2">



                    <button



                      type="button"



                      onClick={() => downloadEventIcs(evt)}



                      className="px-3.5 py-1.5 rounded-full bg-white hover:bg-lake-100 text-lake-900 border border-lake-200 text-[13px] font-bold transition-colors flex items-center gap-1.5"



                      title="Add to Google / Apple Calendar"



                    >



                      <Download className="w-3.5 h-3.5 text-lake-700" />



                      <span>.ICS</span>



                    </button>







                    <Link



                      to={detailPath(evt)}



                      className="px-4 py-2 rounded-full bg-lake-800 hover:bg-coral-600 text-white text-[13px] font-black uppercase tracking-wider transition-colors flex items-center gap-1.5 shadow-xs"



                    >



                      <span>{isNewsItem(evt) ? 'Read more' : 'Details & RSVP'}</span>



                      <ExternalLink className="w-3 h-3" />



                    </Link>



                  </div>
                  </div>



                </div>



              );



            })}



          </div>



        </div>



      )}







      {/* ===================================================================== */}
      {/* VIEW B: 14-DAY OUTLOOK */}
      {/* ===================================================================== */}
      {viewMode === '14-day' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
            <h2 className="text-xl font-black text-gray-900 tracking-tight">Next 14 Days at a Glance</h2>
            <span className="text-xs text-gray-500 font-bold">The Next 14 Days</span>
          </div>

          {/* One row per day on every screen size (desktop puts the day label on the left and the events beside it) */}
          <div className="grid grid-cols-1 gap-4">
            {upcoming14Days.map((day, idx) => (
              <div
                key={idx}
                className={`rounded-2xl border p-4 bg-white shadow-xs transition-all ${
                  day.isToday ? 'border-lake-800 ring-2 ring-blue-300' : 'border-gray-200 hover:border-blue-300'
                }`}
              >
                <div className="lg:flex lg:gap-5">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-3 lg:flex-col lg:items-start lg:justify-start lg:gap-2 lg:border-b-0 lg:border-r lg:pb-0 lg:mb-0 lg:pr-4 lg:w-44 lg:shrink-0">
                    <div>
                      <span className={`text-sm font-black uppercase tracking-wider ${day.isToday ? 'text-blue-900' : 'text-gray-900'}`}>
                        {day.dayLabel}
                      </span>
                      <span className="text-xs text-gray-600 font-bold ml-1.5">{day.fullDateStr}</span>
                    </div>
                    <span className="h-6 px-2.5 inline-flex items-center justify-center text-center leading-none text-xs font-black bg-blue-100 text-blue-950 rounded-full shadow-2xs">
                      {day.items.length}
                    </span>
                  </div>

                  {day.items.length === 0 ? (
                    <p className="text-[11px] text-gray-400 italic py-4 text-center lg:flex-1 lg:text-left lg:py-2">No scheduled events</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 lg:flex-1">
                      {day.items.map((it) => {
                        const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery(it.location))}`;
                        return (
                          <div key={it.id} className="p-3 rounded-xl bg-gray-50 border border-gray-200/80 text-left space-y-1.5 min-w-0 max-w-full overflow-hidden">
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className={`py-0.5 px-2.5 inline-flex items-center justify-center text-left leading-tight text-[10.5px] font-medium uppercase max-w-full whitespace-normal break-words rounded ${getCategoryBadgeStyle(it.category || it.badge, it.type)}`}>
                                {it.badge || 'Event'}
                              </span>
                              {(it.isOutOfArea || isOutOfAreaLocation(it.location)) && (
                                <span className="py-0.5 px-2 inline-flex items-center justify-center text-[10px] font-black uppercase rounded bg-rose-100 text-rose-800 border border-rose-200">
                                  Out of Area
                                </span>
                              )}
                            </div>
                            <h4 className="text-[16px] font-bold font-[700] text-gray-950 leading-snug break-words" style={{ fontWeight: 700 }} title={String(it.title || '')}>
                              {String(it.title || '').length > 52 ? String(it.title).slice(0, 51).trimEnd() + '…' : it.title}
                            </h4>
                            <div className="pt-0.5">
                              <a href={gmapsUrl} target="_blank" rel="noopener noreferrer" className="text-[14px] font-normal text-green-800 hover:text-green-900 hover:underline flex items-center gap-1.5 group/map truncate" title="Open physical address in Google Maps">
                                <MapPin className="w-3.5 h-3.5 text-green-800 shrink-0" />
                                <span className="truncate">{it.location}</span>
                              </a>
                            </div>
                            <Link to={detailPath(it)} className="text-xs font-black text-blue-800 hover:underline inline-flex items-center gap-1 pt-1">
                              <span>{isNewsItem(it) ? 'Read more' : 'Details & RSVP'}</span>
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* VIEW C: 45-DAY MASTER GRID */}
      {/* ===================================================================== */}
      {viewMode === '6-week' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Calendar Legend & Week Filter Controls */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-gray-700">
              <span className="text-gray-700 font-black uppercase text-[11px] tracking-wider">Legend &amp; Ordering:</span>
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-900 border border-blue-200">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                Local Business &amp; Venue Events
              </span>
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-950 border border-emerald-200">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                Community Events
              </span>
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                Out of Area (York Region)
              </span>
            </div>

            {/* Quick Filter: All Weeks / Current Week / Upcoming */}
            <div className="flex flex-wrap items-center gap-2 text-sm font-black w-full">
              <button
                type="button"
                onClick={() => setMobileWeekFilter('all')}
                className={`min-h-[44px] px-3.5 py-2 rounded-xl border transition-all cursor-pointer ${
                  mobileWeekFilter === 'all'
                    ? 'bg-lake-800 text-white border-lake-800 shadow-xs'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                All 45 Days
              </button>
              <button
                type="button"
                onClick={() => setMobileWeekFilter('current')}
                className={`min-h-[44px] px-3.5 py-2 rounded-xl border transition-all cursor-pointer ${
                  mobileWeekFilter === 'current'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-blue-50 text-blue-900 border-blue-200 hover:bg-blue-100'
                }`}
              >
                Current Week
              </button>
              <button
                type="button"
                onClick={() => setMobileWeekFilter('upcoming')}
                className={`min-h-[44px] px-3.5 py-2 rounded-xl border transition-all cursor-pointer ${
                  mobileWeekFilter === 'upcoming'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                Upcoming Weeks
              </button>
            </div>
          </div>

          {/* ================================================================= */}
          {/* MOBILE & TABLET VIEW: HORIZONTAL ROWS (1 ROW PER DAY) */}
          {/* ================================================================= */}
          <div className="xl:hidden space-y-6 w-full min-w-0">
            {visibleMobileWeeks.map((week) => (
              <div key={week.weekIndex} className="space-y-3 w-full min-w-0">
                {/* Week Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-1 pb-2 border-b border-gray-200">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
                    <span className="text-base sm:text-lg font-black uppercase tracking-tight text-gray-900">
                      {week.isCurrentWeek ? 'Current Week (Sun – Sat)' : `Week ${week.weekIndex + 1} (Sun – Sat)`}
                    </span>
                    <span className="text-sm sm:text-base font-bold text-gray-600">
                      ({week.startDate.monthName} {week.startDate.dayNumber} – {week.endDate.monthName} {week.endDate.dayNumber})
                    </span>
                  </div>
                  {week.isCurrentWeek && (
                    <span className="text-xs font-black uppercase tracking-wider bg-blue-100 text-blue-900 px-2.5 py-1 rounded-full shrink-0 whitespace-nowrap">
                      This Week
                    </span>
                  )}
                </div>

                {/* Daily Horizontal Rows */}
                <div className="space-y-3">
                  {week.days.filter((day) => !day.isPast).map((day, dIdx) => {
                    const hasBusiness = day.items.some(i => i.type === 'business_event');
                    const hasCommunity = day.items.some(i => i.type === 'community_event');

                    return (
                      <button
                        key={dIdx}
                        type="button"
                        disabled={day.isPast}
                        onClick={() => handleDayClick(day)}
                        className={`w-full p-3.5 sm:p-4 rounded-2xl border text-left transition-all flex items-center justify-between gap-3 sm:gap-4 group relative shadow-xs ${
                          day.isToday
                            ? 'bg-blue-50/80 border-blue-500 ring-2 ring-blue-500 shadow-md cursor-pointer'
                            : day.isPast
                            ? 'bg-gray-100/90 border-gray-200 opacity-75 cursor-default'
                            : day.isCurrentWeek
                            ? 'bg-white border-blue-200 hover:border-blue-400 hover:shadow-sm cursor-pointer'
                            : 'bg-white border-gray-200 hover:border-blue-400 hover:shadow-sm cursor-pointer'
                        }`}
                      >
                        {/* Day Date Block */}
                        <div className="flex items-center gap-2.5 shrink-0">
                          <div className={`w-16 sm:w-20 py-2.5 px-1.5 rounded-xl text-center flex flex-col items-center justify-center border transition-all ${
                            day.isToday
                              ? 'bg-lake-800 text-white border-lake-800 shadow-sm'
                              : day.isPast
                              ? 'bg-gray-200/70 text-gray-500 border-gray-300'
                              : 'bg-gray-50 text-gray-900 border-gray-200 group-hover:border-blue-300'
                          }`}>
                            <span className={`text-xs font-black uppercase tracking-wider ${day.isToday ? 'text-blue-100' : 'text-gray-600'}`}>
                              {day.dayName}
                            </span>
                            <span className="text-2xl sm:text-3xl font-black leading-none my-1">
                              {day.dayNumber}
                            </span>
                            <span className={`text-xs font-bold ${day.isToday ? 'text-blue-100' : 'text-gray-600'}`}>
                              {day.monthName}
                            </span>
                          </div>
                        </div>

                        {/* Day Details: Badges & Title preview */}
                        <div className="flex-1 min-w-0 py-0.5">
                          {day.isPast ? (
                            <div className="py-1">
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-200 text-slate-700 text-sm font-black tracking-wide">
                                You missed it!
                              </span>
                            </div>
                          ) : (
                            <>
                              <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                                {day.isToday && (
                                  <span className="text-xs font-black uppercase tracking-wider bg-blue-600 text-white px-2.5 py-0.5 rounded-full shadow-xs whitespace-nowrap shrink-0">
                                    Today
                                  </span>
                                )}
                                {hasBusiness && (
                                  <span className="text-xs font-bold bg-blue-100 text-blue-900 px-2.5 py-0.5 rounded-md inline-flex items-center gap-1 whitespace-nowrap shrink-0">
                                    <Building2 className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                                    <span>Business Event</span>
                                  </span>
                                )}
                                {hasCommunity && (
                                  <span className="text-xs font-bold bg-emerald-100 text-emerald-950 px-2.5 py-0.5 rounded-md inline-flex items-center gap-1 whitespace-nowrap shrink-0">
                                    <Users className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                                    <span>Community Event</span>
                                  </span>
                                )}
                                {day.items.length === 0 && (
                                  <span className="text-sm text-gray-500 italic">No scheduled listings</span>
                                )}
                              </div>

                              {day.items.length > 0 && (
                                <p className="text-base sm:text-lg font-black text-gray-900 leading-snug line-clamp-2">
                                  {day.items[0].title}
                                  {day.items.length > 1 && (
                                    <span className="text-sm text-gray-600 font-bold ml-2 whitespace-nowrap">
                                      +{day.items.length - 1} more
                                    </span>
                                  )}
                                </p>
                              )}
                            </>
                          )}
                        </div>

                        {/* Action / Count Indicator */}
                        {!day.isPast && (
                          <div className="flex items-center gap-1 text-right shrink-0 whitespace-nowrap">
                            <span className={`text-sm font-black ${
                              day.items.length > 0 ? 'text-lake-800' : 'text-gray-500'
                            }`}>
                              {day.items.length > 0 ? `${day.items.length} active` : 'View day'}
                            </span>
                            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* ================================================================= */}
          {/* DESKTOP VIEW: 7-COLUMN MASTER GRID (SCREENS >= 1280PX) */}
          {/* ================================================================= */}
          <div className="hidden xl:block space-y-4">
            {/* Week Header Days */}
            <div className="grid grid-cols-7 gap-3 text-center text-xs font-black uppercase tracking-wider text-gray-500 px-2">
              <div>Sun</div>
              <div>Mon</div>
              <div>Tue</div>
              <div>Wed</div>
              <div>Thu</div>
              <div>Fri</div>
              <div>Sat</div>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-3">
              {visibleCalendarDays.map((day, idx) => {
                const hasBusiness = day.items.some(i => i.type === 'business_event');
                const hasCommunity = day.items.some(i => i.type === 'community_event');

                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={day.isPast}
                    onClick={() => handleDayClick(day)}
                    className={`min-h-[120px] p-3 rounded-2xl border text-left transition-all flex flex-col justify-between group relative overflow-hidden ${
                      day.isToday
                        ? 'bg-blue-50/70 border-blue-500 ring-2 ring-blue-500 shadow-md cursor-pointer'
                        : day.isPast
                        ? 'bg-gray-100/90 border-gray-200 opacity-75 cursor-default'
                        : day.isCurrentWeek
                        ? 'bg-white border-blue-200 hover:border-blue-400 hover:shadow-md cursor-pointer'
                        : 'bg-white border-gray-200 hover:border-blue-400 hover:shadow-md cursor-pointer'
                    }`}
                  >
                    {/* Day Number and Week Marker */}
                    <div className="flex items-center justify-between w-full">
                      <span className={`text-base font-black ${
                        day.isToday ? 'text-blue-900' : day.isPast ? 'text-gray-400' : 'text-gray-900'
                      }`}>
                        {day.dayNumber}
                        <span className="text-[10px] text-gray-500 font-bold ml-1">{day.monthName}</span>
                      </span>

                      {day.isToday && (
                        <span className="text-[9px] font-black uppercase tracking-wider bg-blue-600 text-white px-2 py-0.5 rounded-full shadow-xs">
                          Today
                        </span>
                      )}

                      {day.isCurrentWeek && idx === 0 && !day.isPast && (
                        <span className="text-[9px] font-black uppercase tracking-wider text-blue-900 bg-blue-100 px-1.5 py-0.5 rounded">
                          Current Week
                        </span>
                      )}
                    </div>

                    {/* Day Item Badges or Past Message */}
                    {day.isPast ? (
                      <div className="my-auto py-2 text-center w-full">
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-200 text-slate-700 text-xs font-black tracking-wide">
                          You missed it!
                        </span>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-1 w-full my-1">
                          {hasBusiness && (
                            <div className="text-[10px] font-bold bg-blue-100 text-blue-900 px-1.5 py-0.5 rounded truncate flex items-center gap-1">
                              <Building2 className="w-2.5 h-2.5 shrink-0 text-blue-700" />
                              <span className="truncate">Business Event</span>
                            </div>
                          )}
                          {hasCommunity && (
                            <div className="text-[10px] font-bold bg-emerald-100 text-emerald-950 px-1.5 py-0.5 rounded truncate flex items-center gap-1">
                              <Users className="w-2.5 h-2.5 shrink-0 text-emerald-700" />
                              <span className="truncate">Community Event</span>
                            </div>
                          )}
                          {day.items.length === 0 && (
                            <span className="text-[11px] text-gray-400 font-medium italic inline">
                              No listings
                            </span>
                          )}
                        </div>

                        {/* Bottom Quick Indicator */}
                        <div className="text-[10px] font-bold text-gray-500 flex items-center justify-between w-full pt-1 border-t border-gray-100">
                          <span>{day.items.length > 0 ? `${day.items.length} active` : 'View day'}</span>
                          <span className="text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">&rarr;</span>
                        </div>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}


      {selectedDate && (



        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center overflow-y-auto pt-6 pb-8 px-4 animate-fadeIn" onClick={() => setSelectedDate(null)}>



          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl border border-gray-200 p-6 md:p-8 space-y-6" onClick={e => e.stopPropagation()}>



            <div className="flex items-start justify-between border-b border-gray-200 pb-4">



              <div>



                <span className={`text-[11px] font-black uppercase tracking-wider px-3 py-1 rounded-full ${
                  selectedDate.isToday
                    ? 'bg-blue-100 text-blue-900'
                    : selectedDate.isPast
                    ? 'bg-gray-100 text-gray-600'
                    : 'bg-emerald-100 text-emerald-900'
                }`}>
                  {selectedDate.isToday ? 'Happening Today!' : selectedDate.isPast ? 'Earlier This Week' : 'Upcoming Schedule'}
                </span>



                <h3 className="text-2xl font-black text-gray-900 mt-2">



                  {selectedDate.dayName}, {selectedDate.monthName} {selectedDate.dayNumber}, {selectedDate.date.getFullYear()}



                </h3>



                <p className="text-xs text-gray-500 font-bold mt-0.5">



                  Showing active events and sales in strict priority order (Business &rarr; Sales &rarr; Community)



                </p>



              </div>







              <button



                type="button"



                onClick={() => setSelectedDate(null)}



                className="p-2 text-gray-600 hover:text-gray-900 rounded-xl hover:bg-gray-100 transition-colors"



                aria-label="Close day detail modal"



              >



                <X className="w-6 h-6" />



              </button>



            </div>







            {/* Modal Items List */}



            {activeModalItems.length === 0 ? (



              <div className="p-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-300 space-y-3">



                <CalendarIcon className="w-10 h-10 text-gray-500 mx-auto" />



                <h4 className="text-base font-black text-gray-800">No scheduled activities for this date yet</h4>



                <p className="text-xs text-gray-500 max-w-md mx-auto">



                  Local business owners, markets, and community organizers can submit upcoming events and sales directly.



                </p>



                <a



                  href="/submission?tab=events"



                  className="inline-block bg-lake-800 text-white font-black text-xs uppercase px-5 py-2.5 rounded-xl shadow-sm hover:bg-lake-700"



                >



                  Submit Community Event Free &rarr;



                </a>



              </div>



            ) : (



              <div className="space-y-4">



                {activeModalItems.map((item) => {



                  const addressQuery = encodeURIComponent(mapsQuery(item.location || item.area || ''));



                  const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${addressQuery}`;







                  return (



                    <div



                      key={item.id}



                      className={`p-5 rounded-2xl border transition-all ${



                        item.type === 'business_event'



                          ? 'bg-blue-50/50 border-blue-300'



                          : item.type === 'sale'



                          ? item.isPaidMember



                            ? 'bg-amber-50/70 border-amber-400 ring-2 ring-amber-300 shadow-sm'



                            : 'bg-orange-50/40 border-orange-200'



                          : 'bg-emerald-50/50 border-emerald-300'



                      }`}



                    >



                      {/* Item Badge & Priority Indicator */}
                      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md ${getCategoryBadgeStyle(item.category || item.badge, item.type)}`}>
                            {formatCategoryLabel(item.category || item.badge || (item.type === 'sale' ? 'special_sale' : item.type === 'business_event' ? 'business_event' : 'community_events'))}
                          </span>
                          {(item.isOutOfArea || isOutOfAreaLocation(item.location)) && (
                            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-200">
                              Out of Area
                            </span>
                          )}
                        </div>







                        {/* Physical Street Address with 1-click Google Maps Link */}



                        {(item.location || item.area) && (



                          <a



                            href={gmapsUrl}



                            target="_blank"



                            rel="noopener noreferrer"



                            className="text-[11px] font-bold text-green-800 hover:text-green-900 hover:underline flex items-center gap-1 group/map"



                            title="Open location in Google Maps"



                          >



                            <MapPin className="w-3 h-3 text-green-800 shrink-0" />



                            <span>{item.location || item.area}</span>



                            <ExternalLink className="w-2.5 h-2.5 text-green-800 group-hover/map:text-green-900 shrink-0" />



                          </a>



                        )}



                      </div>







                      {/* Title & Discount/Time */}



                      <div className="flex items-baseline justify-between gap-4">



                        <h4 className="text-lg font-black text-gray-900">{item.title}</h4>



                        {item.discount && (



                          <span className="shrink-0 text-xs font-black bg-rose-600 text-white px-2.5 py-1 rounded-lg">



                            {item.discount}



                          </span>



                        )}



                      </div>







                      {/* Organizer / Business */}



                      <p className="text-xs font-bold text-gray-700 mt-1">



                        {item.organizer ? `By ${item.organizer}` : `Merchant: ${item.business_name}`}



                        {item.time && ` • ${item.time}`}



                      </p>







                      {/* Description */}



                      <p className="text-xs text-gray-600 mt-2 leading-relaxed">



                        {item.description}



                      </p>







                      {/* Action Links */}



                      <div className="mt-4 pt-3 border-t border-gray-200/80 flex items-center justify-between">



                        <Link



                          to={detailPath(item)}



                          className="text-xs font-black text-blue-700 hover:text-blue-900 flex items-center gap-1 group"



                        >



                          <span>{isNewsItem(item) ? 'Read more' : 'Event Details & RSVP'}</span>



                          <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />



                        </Link>










                      </div>



                    </div>



                  );



                })}



              </div>



            )}







            {/* Modal Footer */}



            <div className="pt-4 border-t border-gray-200 flex items-center justify-between">



              <span className="text-xs text-gray-500 font-bold">



                WelcomeEG.ca



              </span>



              <button



                type="button"



                onClick={() => setSelectedDate(null)}



                className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-black text-xs uppercase px-5 py-2.5 rounded-xl transition-all"



              >



                Close Calendar



              </button>



            </div>



          </div>



        </div>



      )}



    </div>



  );



}



