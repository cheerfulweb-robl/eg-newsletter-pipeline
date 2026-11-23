import React, { useState, useEffect, useMemo } from 'react';
import { PUBLIC_LISTING_COLUMNS, notEndedFilter } from '../utils/links';
import { GEORGINA_COMMUNITIES, OUT_OF_AREA, resolveCommunity, mapsQuery } from '../utils/communities';
import { CARD_SHELL_CLASS, getCardStripeClass } from '../utils/cardStyles';



import {



  Link } from 'react-router-dom';



import {



  supabase } from '../supabaseClient';



import {



  Calendar, 



  MapPin, 



  Clock, 



  Sparkles, 



  Tag, 



  Bookmark, 



  Download, 



  ExternalLink, 



  Filter, 



  ArrowLeft,



  ChevronRight,



  Share2,



  DollarSign



} from 'lucide-react';



import {

  formatDDMonthYYYY,
  getWeekendRange,
  isThisWeekend,
  isNextWeekend, 



  parseToMidnight, 



  getTorontoTodayMidnight, 



  downloadEventIcs, 



  isItemSaved, 



  toggleSaveItem,



  generateSlug,



  formatCategoryLabel,



  getCategoryBadgeStyle



} from '../services/discoveryService';







// Verified community fallback events for weekend planning when database is populating



const FALLBACK_WEEKEND_ACTIVITIES = [



  {



    id: "wknd-1",



    title: "East Gwillimbury Indoor Community Market & Craft Fair",



    business_name: "East Gwillimbury Farmers' Market",



    organizer: "East Gwillimbury Farmers' Market",



    location: "The Link • 20849 Dalton Rd, Mount Albert",



    community: "Mount Albert",



    day: "Sunday",



    event_date_label: "Sunday 9:00 AM – 2:00 PM",



    price_text: "",



    category: "Markets",



    summary: "Fresh regional Ontario produce, artisanal baked breads, preserves, handmade soaps, cheeses, and hot prepared meals from local growers.",



    link: "https://www.georginafarmersmarket.ca/",



    is_fallback: true



  },



  {



    id: "wknd-2",



    title: "Public Skating & Family Leisure Skate",



    business_name: "Town of East Gwillimbury Recreation",



    organizer: "Town of East Gwillimbury Recreation",



    location: "East Gwillimbury Ice Palace • 90 Wexford Dr, Holland Landing",



    community: "Holland Landing",



    day: "Sunday",



    event_date_label: "Sunday 1:30 PM – 3:30 PM",



    price_text: "",



    category: "Sports & Recreation",



    summary: "All-ages public leisure skate and family hockey shinny sessions at the East Gwillimbury Ice Palace. Helmets strongly recommended.",



    link: "https://www.georgina.ca/living-here/events-calendar",



    is_fallback: true



  },



  {



    id: "wknd-3",



    title: "Guided East Gwillimbury Forest & Watershed Nature Walk",



    business_name: "East Gwillimbury Region Conservation Authority",



    organizer: "East Gwillimbury Region Conservation Authority",



    location: "East Gwillimbury Watershed Area • East Gwillimbury",



    community: "Sharon",



    day: "Saturday",



    event_date_label: "Saturday @ 10:00 AM",



    price_text: "",



    category: "Family Friendly",



    summary: "Interpreted educational nature hike identifying local wetlands, forest canopy, native wildlife tracking, and shoreline conservation.",



    link: "https://lsrca.on.ca/index.php/events/",



    is_fallback: true



  },



  {



    id: "wknd-4",



    title: "Friday Dinners & Community Meat Draw",



    business_name: "Mount Albert Legion Branch 356",



    organizer: "Mount Albert Legion Branch 356",



    location: "21 Cassells St, Mount Albert, ON",



    community: "Mount Albert",



    day: "Friday",



    event_date_label: "Friday @ 5:00 PM",



    price_text: "",



    category: "Food & Drink",



    summary: "Hot homemade kitchen dinner specials with popular meat draw rounds supporting community veterans and local charitable causes.",



    link: "https://mount albertlegion.org/events/",



    is_fallback: true



  }



];







export default function WeekendPlanner() {



  const [dbEvents, setDbEvents] = useState([]);



  const [loading, setLoading] = useState(true);



  const [selectedWeekend, setSelectedWeekend] = useState('this'); // 'this' | 'next'
  const [selectedDay, setSelectedDay] = useState('All'); // 'All', 'Friday', 'Saturday', 'Sunday'



  const [selectedCommunity, setSelectedCommunity] = useState('All');



  const [selectedCategory, setSelectedCategory] = useState('All');



  const [savedUpdateCount, setSavedUpdateCount] = useState(0);







  // Fetch approved vendor events



  useEffect(() => {



    let isMounted = true;



    async function loadWeekendEvents() {



      try {



        const { data, error } = await supabase



          .from('vendor_events')



          .select(PUBLIC_LISTING_COLUMNS)



          .eq('status', 'approved').or(notEndedFilter());







        if (!error && data && isMounted) {
          setDbEvents(data);
        }



      } catch (err) {



        console.warn('Weekend events fetch notice:', err);



      } finally {



        if (isMounted) setLoading(false);



      }



    }



    loadWeekendEvents();



    return () => { isMounted = false; };



  }, []);







  // Sync saved items updates



  useEffect(() => {



    const handleSavedChange = () => setSavedUpdateCount(c => c + 1);



    window.addEventListener('wg_saved_items_changed', handleSavedChange);



    return () => window.removeEventListener('wg_saved_items_changed', handleSavedChange);



  }, []);







  // Calculate upcoming weekend dates for display



    // Compute weekend date range based on selectedWeekend ('this' vs 'next')
  const rangeInfo = useMemo(() => {
    return getWeekendRange(selectedWeekend);
  }, [selectedWeekend]);

  const weekendDateRangeLabel = rangeInfo.label;







  // Combined events pool



    // Combined events pool filtered for selected weekend & sorted chronologically
  const allWeekendEvents = useMemo(() => {
    const { startDate, endDate } = rangeInfo;
    const weekendFilteredDb = dbEvents.filter(evt => {
      if (evt.event_start_date) {
        const d = parseToMidnight(evt.event_start_date);
        if (d) {
          return d.getTime() >= startDate.getTime() && d.getTime() <= endDate.getTime();
        }
      }
      if (selectedWeekend === 'this') {
        const textCheck = (evt.event_date_label || '').toLowerCase();
        return textCheck.includes('friday') || textCheck.includes('saturday') || textCheck.includes('sunday') || textCheck.includes('weekend');
      }
      return false;
    });

    const combined = [...weekendFilteredDb];
    if (combined.length < 3 && selectedWeekend === 'this') {
      combined.push(...FALLBACK_WEEKEND_ACTIVITIES);
    }

    // Sort strictly chronologically (earliest first)
    combined.sort((a, b) => {
      const timeA = parseToMidnight(a.event_start_date)?.getTime() || 0;
      const timeB = parseToMidnight(b.event_start_date)?.getTime() || 0;
      return timeA - timeB;
    });

    return combined.map(it => {
      const day = it.day || (() => {
        const d = parseToMidnight(it.event_start_date);
        if (d) {
          const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          return names[d.getDay()] || 'Weekend';
        }
        const lbl = (it.event_date_label || '').toLowerCase();
        if (lbl.includes('fri')) return 'Friday';
        if (lbl.includes('sat')) return 'Saturday';
        if (lbl.includes('sun')) return 'Sunday';
        return 'Weekend';
      })();

      const community = resolveCommunity(it.community, it.location);

      return {
        ...it,
        computedDay: day,
        computedCommunity: community,
        slug: it.slug || generateSlug(it.title, community)
      };
    });
  }, [dbEvents, rangeInfo, selectedWeekend]);







  // Filtered by selected controls



  const filteredEvents = useMemo(() => {



    return allWeekendEvents.filter(evt => {



      if (selectedDay !== 'All' && evt.computedDay !== selectedDay) return false;



      if (selectedCommunity !== 'All' && evt.computedCommunity !== selectedCommunity) return false;



      if (selectedCategory !== 'All') {
        const catLower = String(evt.category || '').toLowerCase();
        if (selectedCategory === 'Concerts & Shows') {
          if (!catLower.includes('concert') && !catLower.includes('show') && !catLower.includes('live_music') && !catLower.includes('live music') && !catLower.includes('theatre') && !catLower.includes('leacock')) return false;
        } else if (evt.category !== selectedCategory) {
          return false;
        }
      }



      return true;



    });



  }, [allWeekendEvents, selectedDay, selectedCommunity, selectedCategory]);







  // Schema.org structured data



  const jsonLdData = useMemo(() => {



    return {



      "@context": "https://schema.org",



      "@type": "ItemList",



      "name": "This Weekend in East Gwillimbury Events & Activities",



      "description": `Curated local weekend events in East Gwillimbury for ${weekendDateRangeLabel}`,



      "itemListElement": filteredEvents.map((evt, idx) => ({



        "@type": "ListItem",



        "position": idx + 1,



        "item": {



          "@type": "Event",



          "name": evt.title,



          "description": evt.summary || evt.description,



          "location": {



            "@type": "Place",



            "name": evt.location || "East Gwillimbury, ON",



            "address": {



              "@type": "PostalAddress",



              "addressLocality": evt.computedCommunity || "East Gwillimbury",



              "addressRegion": "ON",



              "addressCountry": "CA"



            }



          },



          "organizer": {



            "@type": "Organization",



            "name": evt.business_name || evt.organizer || "Community Organizer"



          }



        }



      }))



    };



  }, [filteredEvents, weekendDateRangeLabel]);







  return (



    <div className="max-w-[1440px] w-full mx-auto px-4 md:px-8 lg:px-12 py-8">



      {/* Dynamic SEO JSON-LD */}



      <script



        type="application/ld+json"



        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdData).replace(/</g, '\\u003c') }}



      />







      {/* Breadcrumb Navigation */}



      <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 mb-6">



        <Link to="/" className="hover:text-[#00008b] flex items-center gap-1">



          <ArrowLeft className="w-3.5 h-3.5" />



          <span>Home</span>



        </Link>



        <span>/</span>



        <Link to="/events" className="hover:text-[#00008b]">Events</Link>



        <span>/</span>



        <span className="text-gray-900 font-bold">This Weekend in East Gwillimbury</span>



      </div>







      {/* Hero Header */}



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
            <span>📅 Weekend Planner &bull; {weekendDateRangeLabel}</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight font-display text-white leading-[1.1] mb-4">
            {selectedWeekend === 'this' ? 'This Weekend in East Gwillimbury' : 'Next Weekend in East Gwillimbury'}
          </h1>

          <p className="text-blue-100 text-sm sm:text-base md:text-lg font-medium leading-relaxed max-w-2xl mb-8">
            Discover community gatherings, live music, recreational skating, farmers' markets, and family entertainment happening this Friday through Sunday across Holland Landing, Mount Albert, Sharon &amp; Queensville.
          </p>

          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <a
              href="/submission?tab=events"
              className="inline-flex items-center gap-2 min-h-[46px] px-6 rounded-full bg-coral-600 hover:bg-sun-400 text-white hover:text-lake-950 font-black text-xs sm:text-sm uppercase tracking-wider shadow-pop-sm hover:-translate-y-0.5 transition-all"
            >
              <span>+ Post Weekend Event</span>
              <ChevronRight className="w-4 h-4" />
            </a>

            <Link
              to="/events"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 text-xs font-bold text-blue-100 hover:bg-white/20 transition-all"
            >
              <span>View Full 6-Week Calendar &rarr;</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}



      <div className="bg-white rounded-2xl border border-gray-200 p-4 md:p-6 shadow-sm mb-8 space-y-4">



        {/* Weekend Selector: This Weekend vs Next Weekend */}
        <div className="flex flex-wrap items-center gap-3 pb-4 border-b border-gray-100">
          <span className="text-[11px] font-black uppercase tracking-wider text-gray-500">
            Select Weekend:
          </span>
          <div className="inline-flex p-1 bg-gray-100 rounded-xl">
            <button
              type="button"
              onClick={() => { setSelectedWeekend('this'); setSelectedDay('All'); }}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                selectedWeekend === 'this'
                  ? 'bg-[#00008b] text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>This Weekend</span>
            </button>
            <button
              type="button"
              onClick={() => { setSelectedWeekend('next'); setSelectedDay('All'); }}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                selectedWeekend === 'next'
                  ? 'bg-[#00008b] text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 text-amber-500" />
              <span>Next Weekend</span>
            </button>
          </div>
        </div>

        {/* Day Tabs (Dynamic to currently active days) */}
        <div>
          <span className="text-[11px] font-black uppercase tracking-wider text-gray-500 block mb-2">
            Select Day:
          </span>
          <div className="flex flex-wrap gap-2">
            {rangeInfo.days.map(day => (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDay(day)}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                  selectedDay === day
                    ? 'bg-[#00008b] text-white shadow-sm'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {day === 'All' ? (selectedWeekend === 'this' ? 'Full Weekend' : 'Full Next Weekend') : day}
              </button>
            ))}
          </div>
        </div>







        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-100">



          {/* Community Filter */}



          <div>



            <label className="text-[11px] font-black uppercase tracking-wider text-gray-500 block mb-1.5">



              Community Area:



            </label>



            <select



              value={selectedCommunity}



              onChange={e => setSelectedCommunity(e.target.value)}



              className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-800 bg-gray-50 focus:outline-none focus:border-[#00008b]"



            >



              <option value="All">All East Gwillimbury Communities</option>
              {[...GEORGINA_COMMUNITIES, OUT_OF_AREA].map(c => <option key={c} value={c}>{c}</option>)}



            </select>



          </div>







          {/* Category Filter */}



          <div>



            <label className="text-[11px] font-black uppercase tracking-wider text-gray-500 block mb-1.5">



              Category:



            </label>



            <select



              value={selectedCategory}



              onChange={e => setSelectedCategory(e.target.value)}



              className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-800 bg-gray-50 focus:outline-none focus:border-[#00008b]"



            >



              <option value="All">All Categories</option>



              <option value="Markets">Markets &amp; Food</option>



              <option value="Sports & Recreation">Sports &amp; Recreation</option>



              <option value="Family Friendly">Family Friendly</option>



              <option value="Food & Drink">Food &amp; Dining</option>



              <option value="Concerts & Shows">Concerts &amp; Shows</option>



            </select>



          </div>



        </div>



      </div>







      {/* Listing Cards Grid */}



      <div className="mb-12">



        <div className="flex items-center justify-between mb-4">



          <h2 className="text-xl font-black text-gray-900 tracking-tight">



            Weekend Happenings ({filteredEvents.length})



          </h2>



          <span className="text-xs text-gray-500 font-semibold">



            America/Toronto Time



          </span>



        </div>







        {filteredEvents.length === 0 ? (



          <div className="bg-white rounded-3xl p-12 text-center border border-gray-200">



            <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-3" />



            <h3 className="text-lg font-black text-gray-900">No events match your selected filters</h3>



            <p className="text-xs text-gray-600 mt-1 max-w-md mx-auto">



              Try switching your day or community filter, or check the full community calendar.



            </p>



            <button



              type="button"



              onClick={() => { setSelectedDay('All'); setSelectedCommunity('All'); setSelectedCategory('All'); }}



              className="mt-4 px-4 py-2 bg-blue-50 text-[#00008b] rounded-xl text-xs font-black uppercase tracking-wider hover:bg-blue-100 transition-colors"



            >



              Reset All Filters



            </button>



          </div>



        ) : (



          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">



            {filteredEvents.map(event => {



              const saved = isItemSaved(event.id);



              return (



                <div



                  key={event.id}
                  className={CARD_SHELL_CLASS}
                >
                  <div className={`h-2 ${getCardStripeClass(event.category || event.badge, 'lake')}`} aria-hidden="true" />
                  <div className="p-6 flex-1 flex flex-col justify-between min-w-0">
                  <div className="min-w-0">



                    {/* Badges & Save Action */}



                    <div className="flex items-start justify-between gap-2 mb-3">



                      <div className="flex flex-wrap items-center gap-1.5">



                        <span className={`py-0.5 px-2.5 inline-flex items-center justify-center text-center leading-none text-[10.5px] font-medium uppercase whitespace-nowrap rounded ${getCategoryBadgeStyle(event.category || event.badge, event.type)}`}>



                          {formatCategoryLabel(event.category || event.badge || 'Weekend')}



                        </span>



                        <span className="py-1 px-2.5 rounded-md bg-gray-100 text-gray-700 text-[12.5px] font-medium">



                          {event.computedDay}



                        </span>



                        <span className="py-1 px-2.5 rounded-md bg-gray-100 text-gray-700 text-[12.5px] font-medium">



                          {event.computedCommunity}



                        </span>



                      </div>







                      <button



                        type="button"



                        onClick={() => toggleSaveItem(event)}



                        className={`p-2 rounded-xl transition-colors ${



                          saved ? 'bg-amber-100 text-amber-900' : 'bg-gray-50 text-gray-400 hover:text-gray-900 hover:bg-gray-100'



                        }`}



                        title={saved ? 'Remove from Saved' : 'Save for Later'}



                      >



                        <Bookmark className="w-4 h-4 fill-current" />



                      </button>



                    </div>







                    <h3 className="font-display text-[22px] font-extrabold text-lake-950 leading-snug group-hover:text-lake-800 transition-colors">



                      {event.title}



                    </h3>







                    <div className="space-y-2 mt-3.5 text-[16px] font-normal text-gray-700">



                      <div className="flex items-center gap-2">



                        <Clock className="w-4 h-4 text-coral-600 shrink-0" />



                        <span>{formatDDMonthYYYY(event.event_date_label) || 'Weekend Schedule'}</span>



                      </div>



                      <div className="flex items-start gap-1.5 pt-0.5">



                        <MapPin className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />



                        {event.location ? (



                          <a



                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery(event.location))}`}



                            target="_blank"



                            rel="noopener noreferrer"



                            className="text-green-800 hover:text-green-900 hover:underline font-normal flex items-center gap-1 group/map leading-snug"



                            title="Open venue in Google Maps"



                          >



                            <span>{event.location}</span>



                            <ExternalLink className="w-3 h-3 text-green-800 group-hover/map:text-green-900 shrink-0 inline" />



                          </a>



                        ) : (



                          <span className="text-gray-700 font-semibold">East Gwillimbury, ON</span>



                        )}



                      </div>



                    </div>







                    {event.summary && (



                      <p className="text-[18px] text-gray-600 font-normal mt-3.5 line-clamp-3 leading-relaxed">



                        {event.summary}



                      </p>



                    )}



                  </div>







                  {/* Actions Bar */}
                  <div className="mt-6 px-6 py-3.5 -mx-6 -mb-6 bg-lake-50/60 border-t border-lake-100 flex items-center justify-between gap-2">



                    <button



                      type="button"



                      onClick={() => downloadEventIcs(event)}



                      className="px-3.5 py-1.5 rounded-full bg-white hover:bg-lake-100 text-lake-900 border border-lake-200 text-xs font-bold transition-colors flex items-center gap-1.5"



                      title="Add to Google / Apple Calendar"



                    >



                      <Download className="w-3.5 h-3.5 text-lake-700" />



                      <span>.ICS</span>



                    </button>







                    <Link



                      to={`/events/${event.slug || event.id}`}



                      className="px-4 py-2 rounded-full bg-lake-800 hover:bg-coral-600 text-white text-xs font-black uppercase tracking-wider transition-colors flex items-center gap-1 shadow-xs"



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







      {/* Organizer Callout Banner */}



      <div className="rounded-3xl bg-blue-50 border border-blue-200 p-6 md:p-8 flex flex-col sm:flex-row items-center justify-between gap-4">



        <div>



          <h3 className="text-base font-black text-gray-900">



            Hosting an Event or Community Activity in East Gwillimbury?



          </h3>



          <p className="text-xs text-gray-600 font-medium mt-1">



            Publish your weekend gathering, fundraiser, or workshop in 2 minutes to reach local residents across town.



          </p>



        </div>



        <a



          href="/my-submissions"



          className="shrink-0 px-6 py-3 rounded-xl bg-[#00008b] hover:bg-blue-900 text-white font-black text-xs uppercase tracking-wider shadow-sm transition-all"



        >



          Post Community Event &rarr;



        </a>



      </div>



    </div>



  );



}



