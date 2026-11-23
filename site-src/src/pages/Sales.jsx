import React, { useState, useEffect, useMemo } from 'react';
import { matchesQuery } from '../utils/fuzzySearch.js';



import { Link, useSearchParams } from 'react-router-dom';
import { detailPath, PUBLIC_LISTING_COLUMNS, notEndedFilter } from '../utils/links';
import { GEORGINA_COMMUNITIES, OUT_OF_AREA, resolveCommunity } from '../utils/communities';
import { SALE_CATEGORIES } from '../utils/saleCategories';
import { safeHref } from '../utils/links';
import { CARD_SHELL_CLASS, getCardStripeClass } from '../utils/cardStyles';



import { supabase } from '../supabaseClient';



import { 



  Sparkles, 



  ShoppingBag, 



  Utensils, 



  Wrench, 



  HeartPulse, 



  Briefcase, 



  Megaphone, 



  Car, 



  Anchor, 



  Compass, 



  Sprout, 



  Search, 



  Calendar, 



  MapPin, 



  Tag, 



  ExternalLink,



  Clock,



  Bookmark,



  ChevronLeft,



  ChevronRight,



  Filter,



  ArrowUpDown,



  AlertCircle,



  Percent,



  DollarSign



} from 'lucide-react';



import {

  formatDDMonthYYYY, 



  isEndingSoon, 



  isExpired, 



  isItemSaved, 



  toggleSaveItem,



  parseToMidnight,



  getTorontoTodayMidnight,



  formatCategoryLabel,



  getCategoryBadgeStyle



} from '../services/discoveryService';







const CATEGORIES = ['All', SALE_CATEGORIES[0], 'Dining', ...SALE_CATEGORIES.slice(1)];







// Listings store raw categories (retail_sale, sale, dining, ...). The filter pills use the labels
// above, so convert once here; otherwise picking a category hid every listing.
function saleCategoryLabel(raw) {
  const c = String(raw || '').toLowerCase().trim();
  if (!c || c === 'sale' || c === 'sales' || c === 'retail_sale' || c === 'special_sale' || c === 'local_sales' || c === 'retail') return 'Retail';
  if (['dining', 'restaurant', 'food_and_drink', 'dining_deals'].includes(c)) return 'Dining';
  const label = formatCategoryLabel(raw);
  const hit = CATEGORIES.find((k) => k !== 'All' && k.toLowerCase() === label.toLowerCase());
  return hit || label;
}

const COMMUNITIES = ['All East Gwillimbury', ...GEORGINA_COMMUNITIES, OUT_OF_AREA];







export default function Sales() {



  const [searchParams, setSearchParams] = useSearchParams();



  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || 'All');



  const [selectedCommunity, setSelectedCommunity] = useState(searchParams.get('community') || 'All East Gwillimbury');



  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');



  const [sortOrder, setSortOrder] = useState(searchParams.get('sort') || 'ending-soon'); // 'ending-soon', 'newest', 'a-z'



  const [activeView, setActiveView] = useState(searchParams.get('view') || 'list'); // 'list', 'calendar'



  const [salesList, setSalesList] = useState([]);



  const [loading, setLoading] = useState(true);



  const [selectedSale, setSelectedSale] = useState(null);



  const [savedUpdate, setSavedUpdate] = useState(0);







  // Sync state with URL params



  useEffect(() => {



    const params = new URLSearchParams();



    if (selectedCategory !== 'All') params.set('category', selectedCategory);



    if (selectedCommunity !== 'All East Gwillimbury') params.set('community', selectedCommunity);



    if (searchTerm.trim()) params.set('search', searchTerm.trim());



    if (sortOrder !== 'ending-soon') params.set('sort', sortOrder);



    if (activeView !== 'list') params.set('view', activeView);



    setSearchParams(params, { replace: true });



  }, [selectedCategory, selectedCommunity, searchTerm, sortOrder, activeView, setSearchParams]);







  // Fetch approved vendor sales and partner offers



  useEffect(() => {



    let isMounted = true;



    async function loadSales() {



      try {



        setLoading(true);







        // 1. Fetch approved vendor events with sale characteristics



        const { data: eventSales, error: evErr } = await supabase



          .from('vendor_events')



          .select(PUBLIC_LISTING_COLUMNS)



          .eq('status', 'approved').or(notEndedFilter());







        // 2. Fetch approved partner offers



        const { data: partnerOffers, error: partErr } = await supabase



          .from('partners')



          .select('*')



          .eq('status', 'Approved');







        if (!isMounted) return;







        const combined = [];







        // Map vendor events



        if (eventSales && eventSales.length > 0) {



          eventSales.forEach(it => {



            const cat = (it.category || '').toLowerCase().trim();



            // Strictly exclude news, municipal notices, library, and theatre



            if (cat === 'news' || cat === 'local_news' || cat === 'municipal_news' || cat === 'library_events' || cat === 'theatre_events') {



              return;



            }







            const rawTitle = (it.title || '').trim();



            const text = `${it.title || ''} ${it.summary || ''}`.toLowerCase();



            const isExplicitSaleCat = cat === 'sale' || cat === 'retail_sale' || cat === 'special_sale';



            const isSaleTagged = rawTitle.startsWith('[Sale]');



            const hasSaleKeywords = /\b(sale|sales|discount|discounts|store clearance|clearance sale|flash sale|\d+%(?:\s*off)?|dollar off|save \$\d+)\b/i.test(text);



            const isSale = isExplicitSaleCat || isSaleTagged || hasSaleKeywords;







            if (isSale) {



              // Exclude expired



              if (it.expires_after && isExpired(it.expires_after)) return;







              combined.push({



                id: it.id,



                business_name: it.business_name || 'Local Merchant',



                title: it.title,



                category: it.sale_category || saleCategoryLabel(it.category),



                discount: it.price_text || 'Special Deal',



                location: it.location || 'East Gwillimbury, ON',
                community: it.community || '',



                event_date: formatDDMonthYYYY(it.event_date_label || it.expires_after || 'Ongoing'),



                expires_after: it.expires_after || null,



                start_date: it.event_start_date || null,



                description: it.summary || '',



                link: it.link || 'https://welcomeeg.ca/sales',
                source: 'listing',
                slug: it.slug || '',



                badge: isEndingSoon(it.expires_after) ? 'Ending Soon' : 'Community Sale',



                is_exclusive: false,



                created_at: it.created_at



              });



            }



          });



        }







        // Map partner offers (strictly live approved, zero demo/example records)



        if (partnerOffers && partnerOffers.length > 0) {



          partnerOffers.forEach(p => {



            if (p.is_example === true || p.status !== 'Approved') return;



            combined.push({



              id: p.id,



              business_name: p.business_name || 'East Gwillimbury Partner',



              title: p.offer_details || p.offer_b2c || 'Local Merchant Offer',



              category: saleCategoryLabel(p.category),



              discount: p.tier === 'Hamper Sponsor' ? 'Featured Perk' : 'Merchant Special',



              location: p.location || 'East Gwillimbury, ON',



              event_date: 'Active Local Offer',



              expires_after: null,



              start_date: null,



              description: p.business_description || '',



              link: p.website_url || 'https://welcomeeg.ca/sales',
              source: 'partner',



              badge: p.tier === 'Hamper Sponsor' ? 'Sponsor Perk' : 'Welcome Perk',



              is_exclusive: p.target_audience === 'Residents Only',



              created_at: p.created_at



            });



          });



        }







        setSalesList(combined);



      } catch (err) {



        console.warn('Sales fetch error:', err);



      } finally {



        if (isMounted) setLoading(false);



      }



    }







    loadSales();



    return () => { isMounted = false; };



  }, []);







  // Filter & Sort



  const filteredAndSortedSales = useMemo(() => {



    let result = salesList.filter(sale => {



      // Exclude expired



      if (sale.expires_after && isExpired(sale.expires_after)) return false;







      // Category filter



      if (selectedCategory !== 'All' && sale.category !== selectedCategory) {



        return false;



      }







      // Community filter



      if (selectedCommunity !== 'All East Gwillimbury' && resolveCommunity(sale.community, sale.location) !== selectedCommunity) return false;







      // Keyword search (forgiving plurals + typos)
      if (searchTerm.trim()) {
        const haystack = `${sale.business_name} ${sale.title} ${sale.description} ${sale.location} ${sale.category}`;
        if (!matchesQuery(haystack, searchTerm)) return false;
      }







      return true;



    });







    // Sorting



    result.sort((a, b) => {



      if (sortOrder === 'ending-soon') {



        const aExp = a.expires_after ? new Date(a.expires_after).getTime() : Infinity;



        const bExp = b.expires_after ? new Date(b.expires_after).getTime() : Infinity;



        return aExp - bExp;



      }



      if (sortOrder === 'newest') {



        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;



        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;



        return bTime - aTime;



      }



      if (sortOrder === 'a-z') {



        return (a.business_name || '').localeCompare(b.business_name || '');



      }



      return 0;



    });







    return result;



  }, [salesList, selectedCategory, selectedCommunity, searchTerm, sortOrder]);







  // Schema.org Structured Data



  const jsonLdData = useMemo(() => {



    return {



      "@context": "https://schema.org",



      "@type": "ItemList",



      "name": "Local Sales & Special Deals in East Gwillimbury, Ontario",



      "description": "Verified discounts, clearance events, restaurant specials and merchant deals in Holland Landing, Mount Albert, Sharon & Queensville.",



      "itemListElement": filteredAndSortedSales.slice(0, 40).map((sale, idx) => ({



        "@type": "ListItem",



        "position": idx + 1,



        "item": {



          "@type": "SaleEvent",



          "name": sale.title,



          "description": sale.description || `${sale.discount} offered by ${sale.business_name}.`,



          "location": {



            "@type": "Place",



            "name": sale.business_name,



            "address": {



              "@type": "PostalAddress",



              "addressLocality": sale.location || "East Gwillimbury",



              "addressRegion": "ON",



              "addressCountry": "CA"



            }



          },



          "offers": {



            "@type": "Offer",



            "price": "0.00",



            "priceCurrency": "CAD",



            "description": sale.discount,



            "availability": "https://schema.org/InStock",



            "url": "https://welcomeeg.ca/sales"



          }



        }



      }))



    };



  }, [filteredAndSortedSales]);







  // 6-Week Calendar Grid Calculations for Sales Calendar View



  const calendarWeeks = useMemo(() => {



    const today = getTorontoTodayMidnight();



    const weeks = [];



    const currentDay = today.getDay(); // 0 = Sun, 1 = Mon ...



    const startOfCurrentWeek = new Date(today);



    startOfCurrentWeek.setDate(today.getDate() - currentDay); // Sunday







    for (let w = -1; w <= 4; w++) {



      const days = [];



      for (let d = 0; d < 7; d++) {



        const dateObj = new Date(startOfCurrentWeek);



        dateObj.setDate(startOfCurrentWeek.getDate() + (w * 7) + d);



        const dateStr = dateObj.toISOString().split('T')[0];







        // Find sales active on this day



        const daySales = filteredAndSortedSales.filter(s => {



          if (!s.expires_after && !s.start_date) return true; // Ongoing



          const sTime = s.start_date ? (parseToMidnight(s.start_date)?.getTime() ?? 0) : 0; // local midnight, not UTC



          const eTime = s.expires_after ? (parseToMidnight(s.expires_after)?.getTime() ?? Infinity) : Infinity;



          const curTime = dateObj.getTime();



          return curTime >= sTime && curTime <= eTime;



        });







        days.push({



          date: dateObj,



          dateStr,



          dayNum: dateObj.getDate(),



          isToday: dateObj.getTime() === today.getTime(),



          salesCount: daySales.length,



          sales: daySales



        });



      }



      weeks.push({ weekIndex: w, days });



    }



    return weeks;



  }, [filteredAndSortedSales]);







  const handleToggleSave = (item) => {



    toggleSaveItem(item);



    setSavedUpdate(c => c + 1);



  };







  return (



    <div className="max-w-[1440px] w-full mx-auto px-4 md:px-8 lg:px-12 py-8">



      {/* Schema.org Structured Data */}



      <script



        type="application/ld+json"



        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdData).replace(/</g, '\\u003c') }}



      />







      {/* Header Banner */}



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
            <span>({salesList.length || '30+'}) Verified Local Merchant Deals &bull; East Gwillimbury Savings Hub</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight font-display text-white leading-[1.1] mb-4">
            Local Deals &amp; Store Sales
          </h1>

          <p className="text-blue-100 text-sm sm:text-base md:text-lg font-medium leading-relaxed max-w-2xl">
            Support local East Gwillimbury merchants while discovering verified discounts, limited-time promotions, and seasonal clearances in Holland Landing, Mount Albert, Jackson&apos;s Point &amp; Queensville.
          </p>

          <div className="flex flex-wrap items-center gap-3 sm:gap-4 mt-8">
            <a
              href="/submission?tab=sales"
              className="inline-flex items-center gap-2 min-h-[46px] px-6 rounded-full bg-coral-600 hover:bg-sun-400 text-white hover:text-lake-950 font-black text-xs sm:text-sm uppercase tracking-wider shadow-pop-sm hover:-translate-y-0.5 transition-all"
            >
              <span>+ Post Your Sale or Special Deal</span>
              <ChevronRight className="w-4 h-4" />
            </a>

            <Link
              to="/events"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 text-xs font-bold text-blue-100 hover:bg-white/20 transition-all"
            >
              <span>Explore Community Calendar &rarr;</span>
            </Link>
          </div>
        </div>
      </div>







      {/* Filter and Search Controls */}



      <div className="bg-white rounded-2xl border border-gray-200 p-4 md:p-6 shadow-sm mb-8 space-y-4">



        {/* Search & View Switcher */}



        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">



          <div className="relative w-full sm:max-w-md">



            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />



            <input



              type="text"



              value={searchTerm}



              onChange={e => setSearchTerm(e.target.value)}



              placeholder="Search sales by store, item, or keyword..."



              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:border-[#00008b] bg-gray-50"



            />



            {searchTerm && (



              <button



                type="button"



                onClick={() => setSearchTerm('')}



                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-xs font-bold"



              >



                ✕



              </button>



            )}



          </div>







          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">



            {/* View Mode Toggle */}



            <div className="flex flex-wrap max-w-full rounded-xl bg-gray-100 p-1 border border-gray-200 text-xs font-black">



              <button



                type="button"



                onClick={() => setActiveView('list')}



                className={`px-3 py-1.5 rounded-lg transition-all ${activeView === 'list' ? 'bg-white text-[#00008b] shadow-xs' : 'text-gray-600'}`}



              >



                List View



              </button>



              <button



                type="button"



                onClick={() => setActiveView('calendar')}



                className={`px-3 py-1.5 rounded-lg transition-all ${activeView === 'calendar' ? 'bg-white text-[#00008b] shadow-xs' : 'text-gray-600'}`}



              >



                6-Week Deals Calendar



              </button>



            </div>



          </div>



        </div>







        {/* Filter Dropdowns */}



        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-gray-100">



          <div>



            <label className="text-[10.5px] font-black uppercase tracking-wider text-gray-500 block mb-1">



              Category:



            </label>



            <select



              value={selectedCategory}



              onChange={e => setSelectedCategory(e.target.value)}



              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-800 bg-gray-50 focus:outline-none focus:border-[#00008b]"



            >



              {CATEGORIES.map(c => (



                <option key={c} value={c}>{c}</option>



              ))}



            </select>



          </div>







          <div>



            <label className="text-[10.5px] font-black uppercase tracking-wider text-gray-500 block mb-1">



              Community:



            </label>



            <select



              value={selectedCommunity}



              onChange={e => setSelectedCommunity(e.target.value)}



              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-800 bg-gray-50 focus:outline-none focus:border-[#00008b]"



            >



              {COMMUNITIES.map(c => (



                <option key={c} value={c}>{c}</option>



              ))}



            </select>



          </div>







          <div>



            <label className="text-[10.5px] font-black uppercase tracking-wider text-gray-500 block mb-1">



              Sort By:



            </label>



            <select



              value={sortOrder}



              onChange={e => setSortOrder(e.target.value)}



              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-800 bg-gray-50 focus:outline-none focus:border-[#00008b]"



            >



              <option value="ending-soon">⏰ Ending Soon First</option>



              <option value="newest">✨ Newest Additions</option>



              <option value="a-z">🔤 Business Name (A-Z)</option>



            </select>



          </div>



        </div>



      </div>







      {/* VIEW A: LIST VIEW */}



      {activeView === 'list' && (



        <div className="mb-12">



          <div className="flex items-center justify-between mb-4">



            <h2 className="text-xl font-black text-gray-900 tracking-tight">



              Active Deals &amp; Store Promotions ({filteredAndSortedSales.length})



            </h2>



            {sortOrder === 'ending-soon' && (



              <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">



                Sorted by closest expiry date



              </span>



            )}



          </div>







          {filteredAndSortedSales.length === 0 ? (



            <div className="bg-white rounded-3xl p-12 text-center border border-gray-200">



              <ShoppingBag className="w-12 h-12 text-gray-400 mx-auto mb-3" />



              <h3 className="text-lg font-black text-gray-900">No active sales found</h3>



              <p className="text-xs text-gray-600 mt-1 max-w-md mx-auto">



                No promotions currently match your selected filters. Try broadening your category or location filters.



              </p>



              <button



                type="button"



                onClick={() => { setSelectedCategory('All'); setSelectedCommunity('All East Gwillimbury'); setSearchTerm(''); }}



                className="mt-4 px-4 py-2 bg-blue-50 text-[#00008b] rounded-xl text-xs font-black uppercase tracking-wider"



              >



                Reset All Filters



              </button>



            </div>



          ) : (



            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">



              {filteredAndSortedSales.map(sale => {



                const isEnding = sale.expires_after ? isEndingSoon(sale.expires_after) : false;



                const saved = isItemSaved(sale.id);







                return (



                  <div



                    key={sale.id}



                    className={`${CARD_SHELL_CLASS} relative`}
                  >
                    <div className={`h-2 ${getCardStripeClass(sale.category, 'sun')}`} aria-hidden="true" />
                    <div className="p-6 flex-1 flex flex-col justify-between min-w-0">






                    <div>



                      {/* Merchant Header, Badges & Bookmark */}



                      <div className="flex items-start justify-between gap-2 mb-3 min-w-0">



                        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">



                          <span className="inline-block text-left leading-snug text-[11px] font-medium uppercase tracking-wider text-blue-900 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100 max-w-full whitespace-normal break-words">



                            {sale.business_name}



                          </span>



                          {isEnding && (



                            <span className="inline-flex items-center justify-center text-center leading-none text-[10px] font-medium uppercase tracking-wider bg-rose-50 text-rose-700 px-2 py-0.5 rounded-md border border-rose-200 animate-pulse">



                              Ending Soon



                            </span>



                          )}



                          {sale.discount && (



                            <span className="inline-block text-left leading-snug text-[10.5px] font-medium uppercase tracking-wider bg-amber-50 text-amber-900 px-2.5 py-1 rounded-md border border-amber-200 max-w-full whitespace-normal break-words">



                              {sale.discount}



                            </span>



                          )}



                        </div>







                        <button



                          type="button"



                          onClick={() => handleToggleSave(sale)}



                          className={`p-2 rounded-xl transition-colors ${



                            saved ? 'bg-amber-100 text-amber-900' : 'bg-gray-50 text-gray-400 hover:text-gray-900 hover:bg-gray-100'



                          }`}



                          title={saved ? 'Remove from Saved' : 'Save Deal for Later'}



                        >



                          <Bookmark className="w-4 h-4 fill-current" />



                        </button>



                      </div>







                      <h3 className="text-xl font-bold font-[700] text-gray-900 leading-snug break-words group-hover:text-[#00008b] transition-colors" style={{ fontWeight: 700 }}>
                        {sale.title.replace(/^\[Sale\]\s*/i, '') || sale.title}
                      </h3>







                      <div className="space-y-2 mt-3.5 text-[16px] text-gray-700">



                        <div className="flex items-start gap-1.5 pt-0.5">



                          <MapPin className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />



                          {sale.location ? (
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${sale.business_name || ''} ${sale.location}`.trim())}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-green-800 hover:text-green-900 hover:underline font-normal flex items-center gap-1 leading-snug min-w-0 break-words group/map"
                              title="Open store location in Google Maps"
                            >
                              <span>{sale.location}</span>
                              <ExternalLink className="w-3 h-3 text-green-800 group-hover/map:text-green-900 shrink-0 inline" />
                            </a>
                          ) : (
                            <span className="text-gray-700 font-semibold">East Gwillimbury, ON</span>
                          )}
                        </div>

                        {sale.phone && (
                          <div className="flex items-center gap-1.5 pt-0.5">
                            <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <a
                              href={`tel:${sale.phone.replace(/[^0-9]/g, '')}`}
                              className="text-emerald-800 font-semibold hover:underline"
                              title="Call merchant"
                            >
                              {sale.phone}
                            </a>
                          </div>
                        )}



                        <div className="flex items-center gap-2">



                          <Clock className="w-3.5 h-3.5 text-blue-700 shrink-0" />



                          <span>



                            {sale.start_date && sale.expires_after && sale.start_date !== sale.expires_after
                              ? `${sale.event_date || `${formatDDMonthYYYY(sale.start_date)} – ${formatDDMonthYYYY(sale.expires_after)}`}`
                              : (sale.event_date || (sale.expires_after ? `Expires ${formatDDMonthYYYY(sale.expires_after)}` : 'Active Promotion'))}



                          </span>



                        </div>



                      </div>







                      {sale.description && (



                        <p className="text-[18px] text-gray-600 font-normal mt-3.5 line-clamp-3 leading-relaxed break-words">



                          {sale.description}



                        </p>



                      )}



                    </div>







                    {/* Bottom Action */}



                    <div className="mt-6 px-6 py-3.5 -mx-6 -mb-6 bg-sun-50/70 border-t border-lake-100 flex flex-wrap items-center justify-between gap-2">



                      <span className="text-[10.5px] font-medium text-gray-500 uppercase">



                        {formatCategoryLabel(sale.category).replace(/_/g, ' ')}



                      </span>







                      {sale.link && (



                        <>{sale.source === 'listing' ? (
                          <Link to={detailPath(sale)} className="px-4 py-2 rounded-full bg-lake-800 hover:bg-coral-600 text-white text-[13px] font-black uppercase tracking-wider transition-colors flex items-center gap-1.5 shadow-xs">



                          <span>View Offer Details</span>



                          <ExternalLink className="w-3 h-3" />



                        </Link>
                        ) : (
                        <a



                          href={safeHref(sale.link)}



                          target="_blank"



                          rel="noopener noreferrer"



                          className="px-4 py-2 rounded-full bg-lake-800 hover:bg-coral-600 text-white text-[13px] font-black uppercase tracking-wider transition-colors flex items-center gap-1.5 shadow-xs"



                        >



                          <span>Store Website / Offer</span>



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







      {/* VIEW B: 6-WEEK SALES CALENDAR */}



      {activeView === 'calendar' && (



        <div className="mb-12 bg-white rounded-3xl border border-gray-200 p-6 md:p-8 shadow-sm">



          <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">



            <div>



              <h2 className="text-xl font-black text-gray-900">



                6-Week Local Deals &amp; Promotions Calendar



              </h2>



              <p className="text-xs text-gray-500 font-medium mt-0.5">



                Overview of active durations, weekend clearances, and upcoming flash sales across East Gwillimbury.



              </p>



            </div>



          </div>







          <div className="overflow-x-auto">



            <div className="min-w-[700px]">



              {/* Day Headers */}



              <div className="grid grid-cols-7 gap-2 mb-2 text-center text-xs font-black uppercase tracking-wider text-gray-500">



                <div>Sun</div>



                <div>Mon</div>



                <div>Tue</div>



                <div>Wed</div>



                <div>Thu</div>



                <div>Fri</div>



                <div>Sat</div>



              </div>







              {/* Weeks */}



              <div className="space-y-2">



                {calendarWeeks.map(week => (



                  <div key={week.weekIndex} className="grid grid-cols-7 gap-2">



                    {week.days.map(day => (



                      <div



                        key={day.dateStr}



                        className={`p-2.5 rounded-2xl border min-h-[90px] flex flex-col justify-between transition-colors ${



                          day.isToday



                            ? 'bg-blue-50/80 border-[#00008b]'



                            : 'bg-gray-50/50 border-gray-100 hover:bg-gray-100/60'



                        }`}



                      >



                        <div className="flex items-center justify-between">



                          <span className={`text-xs font-black ${day.isToday ? 'text-[#00008b]' : 'text-gray-700'}`}>



                            {day.dayNum}



                          </span>



                          {day.isToday && (



                            <span className="text-[9px] font-black uppercase bg-[#00008b] text-white px-1.5 py-0.2 rounded-full">



                              Today



                            </span>



                          )}



                        </div>







                        {day.salesCount > 0 && (



                          <div className="mt-1">



                            <span className="text-[10px] font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md block text-center truncate">



                              {day.salesCount} {day.salesCount === 1 ? 'Deal Active' : 'Deals Active'}



                            </span>



                          </div>



                        )}



                      </div>



                    ))}



                  </div>



                ))}



              </div>



            </div>



          </div>



        </div>



      )}







      {/* Merchant CTA Banner */}



      <div className="rounded-3xl bg-amber-50 border-2 border-amber-300 p-6 md:p-8 flex flex-col sm:flex-row items-center justify-between gap-4">



        <div>



          <span className="text-[10px] font-black uppercase tracking-wider text-amber-900 bg-amber-200/80 px-2.5 py-1 rounded-md mb-2 inline-block">



            East Gwillimbury Merchant Network



          </span>



          <h3 className="text-base sm:text-lg font-black text-amber-950">



            Running a Store Sale, Restaurant Special, or Clearance Event?



          </h3>



          <p className="text-xs text-amber-900 font-medium mt-1 max-w-xl">



            Publish your promotion in under 2 minutes. Reach thousands of local residents and newcomers browsing for local shopping opportunities.



          </p>



        </div>



        <a
          href="/submission?tab=sales"
          className="shrink-0 px-6 py-3 rounded-xl bg-[#00008b] hover:bg-blue-900 text-white font-black text-xs uppercase tracking-wider shadow-md transition-all"
        >
          Post Your Sale / Deal &rarr;
        </a>



      </div>



    </div>



  );



}



