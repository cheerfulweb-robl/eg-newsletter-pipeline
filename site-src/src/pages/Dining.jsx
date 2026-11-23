import React, { useState, useEffect, useMemo } from 'react';
import { matchesQuery } from '../utils/fuzzySearch.js';
import { PUBLIC_LISTING_COLUMNS, notEndedFilter } from '../utils/links';
import { CARD_SHELL_CLASS, getCardStripeClass } from '../utils/cardStyles';



import { Link, useSearchParams } from 'react-router-dom';



import { supabase } from '../supabaseClient';



import { 



  Utensils, 



  MapPin, 



  Phone, 



  Clock, 



  ExternalLink, 



  Calendar, 



  Sparkles, 



  Filter, 



  ArrowRight, 



  CheckCircle2, 



  AlertCircle, 



  X, 



  Search, 



  Share2, 



  ShoppingBag,



  Car,



  Bike,



  PlusCircle,



  Mail,



  Building2,



  ChevronRight



} from 'lucide-react';



import { GEORGINA_COMMUNITIES, OUT_OF_AREA, resolveCommunity, stripServiceTags, serviceTypesFor } from '../utils/communities';
import {
  formatDDMonthYYYY, generateSlug, isExpired, formatCategoryLabel, getCategoryBadgeStyle } from '../services/discoveryService';







// Baseline dining spots (Option B: strict clean slate - empty until submitted & approved)



const BASELINE_RESTAURANTS = [];







const COMMUNITIES = ['All East Gwillimbury', ...GEORGINA_COMMUNITIES, OUT_OF_AREA];







// Helper for auto-capitalizing first letter of each word (Title Case)



function formatTitleCase(str) {



  if (!str) return '';



  return str.replace(/(?:^|\s|-|\/)([a-z\u00C0-\u017F])/g, match => match.toUpperCase());



}







// Helper for dynamic phone formatting as (909) 555-5555



function formatPhoneNumber(val) {



  if (!val) return '';



  const digits = val.replace(/\D/g, '').slice(0, 10);



  if (digits.length === 0) return '';



  if (digits.length <= 3) return `(${digits}`;



  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;



  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;



}







export default function Dining() {



  const [searchParams, setSearchParams] = useSearchParams();



  const [selectedService, setSelectedService] = useState(searchParams.get('service') || 'All'); // 'All', 'Eat In', 'Take Out', 'Delivery'



  const [selectedCommunity, setSelectedCommunity] = useState(searchParams.get('community') || 'All East Gwillimbury');



  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');



  const [dbDining, setDbDining] = useState([]);



  const [loading, setLoading] = useState(true);







  // Submit Modal State



















  // Form fields (Strict: submissions only, full verification fields required)








































  // Sync state with URL params



  useEffect(() => {



    const params = new URLSearchParams();



    if (selectedService !== 'All') params.set('service', selectedService);



    if (selectedCommunity !== 'All East Gwillimbury') params.set('community', selectedCommunity);



    if (searchTerm.trim()) params.set('search', searchTerm.trim());



    setSearchParams(params, { replace: true });



  }, [selectedService, selectedCommunity, searchTerm, setSearchParams]);







  // Load approved dining listings from Supabase vendor_events



  useEffect(() => {



    let isMounted = true;



    async function loadDining() {



      try {



        setLoading(true);



        const { data, error } = await supabase



          .from('vendor_events')



          .select(PUBLIC_LISTING_COLUMNS)



          .eq('status', 'approved').or(notEndedFilter());







        if (!error && data && isMounted) {



          // Strict clean slate: only explicit dining listings & merchant submissions



          const diningEvents = data.filter(evt => {



            const cat = (evt.category || "").toLowerCase().trim();



            if (cat === "library_events" || cat === "municipal_news" || cat === "theatre_events" || cat === "chamber_events" || cat === "news") {



              return false;



            }



            return cat === "dining" || cat === "restaurant" || cat === "food_and_drink" || cat === "dining_deals";



          });







          const formatted = diningEvents.map(evt => {



            const rawText = `${evt.title || ''} ${evt.summary || ''}`.toLowerCase();



            const sTypes = serviceTypesFor(evt);







            // Extract and format phone
            const phoneMatch = evt.summary?.match(/(?:📞|Phone:?)\s*([0-9\-\(\)\s\.\+]{7,})/i);
            const rawPhone = evt.contact_phone || (phoneMatch ? phoneMatch[1].trim() : '');
            const phone = formatPhoneNumber(rawPhone);

            // Extract community



            const loc = (evt.location || '').toLowerCase();



            const comm = resolveCommunity(evt.community, evt.location);







            return {
              id: evt.id,
              slug: evt.slug || evt.id,
              business_name: evt.business_name || 'Local Restaurant',



              title: evt.title || 'Dining Feature',



              category: 'Dining',



              service_types: sTypes,



              community: comm,



              location: evt.location || 'East Gwillimbury, ON',



              phone: phone,



              email: evt.submitter_email || '',



              event_start_date: evt.event_start_date,



              expires_after: evt.expires_after,



              event_date_label: evt.event_date_label || '',



              summary: evt.summary || '',
              image_url: evt.image_url ? evt.image_url.replace(/^pending:/, '') : null,
              contact_name: evt.contact_name || '',



              link: evt.link || '',



              is_verified: true



            };



          });







          setDbDining(formatted);



        }



      } catch (err) {



        console.warn('Dining fetch error:', err);



      } finally {



        if (isMounted) setLoading(false);



      }



    }



    loadDining();



    return () => { isMounted = false; };



  }, []);







  // Combined pool of restaurants: Supabase dynamic + baseline verified



  const allRestaurants = useMemo(() => {



    const map = new Map();



    // Dynamic approved first



    for (const r of dbDining) {



      const key = (r.business_name || '').toLowerCase().trim();



      if (key && !map.has(key)) map.set(key, r);



    }



    // Baseline next



    for (const r of BASELINE_RESTAURANTS) {



      const key = (r.business_name || '').toLowerCase().trim();



      if (!map.has(key)) map.set(key, r);



    }



    return Array.from(map.values());



  }, [dbDining]);







  // Filtered list



  const filteredRestaurants = useMemo(() => {



    return allRestaurants.filter(r => {



      // Expiration check: if stop date has passed, hide



      if (r.expires_after && isExpired(r.expires_after)) return false;







      // Service filter: Eat In, Take Out, Delivery



      if (selectedService !== 'All' && !r.service_types.includes(selectedService)) {



        return false;



      }







      // Community filter



      if (selectedCommunity !== 'All East Gwillimbury' && r.community !== selectedCommunity) {



        return false;



      }







      // Search term (forgiving plurals + typos)
      if (searchTerm.trim()) {
        const text = `${r.business_name} ${r.title} ${r.summary} ${r.location} ${r.service_types.join(' ')}`;
        if (!matchesQuery(text, searchTerm)) return false;
      }







      return true;



    });



  }, [allRestaurants, selectedService, selectedCommunity, searchTerm]);














  // Schema.org Structured Data for Local Dining & Restaurants



  const jsonLdData = useMemo(() => {



    return {



      "@context": "https://schema.org",



      "@type": "ItemList",



      "name": "Local Dining & Restaurants in East Gwillimbury, Ontario",



      "description": "Directory of verified local restaurants, bistros, pubs, diners, and take-out spots across Holland Landing, Mount Albert, Queensville, and Sharon.",



      "itemListElement": filteredRestaurants.slice(0, 40).map((r, idx) => ({



        "@type": "ListItem",



        "position": idx + 1,



        "item": {



          "@type": "Restaurant",



          "name": r.business_name,



          "description": r.summary || r.title,



          "telephone": r.phone || undefined,



          "address": {



            "@type": "PostalAddress",



            "streetAddress": r.location || "East Gwillimbury",



            "addressLocality": r.community || "East Gwillimbury",



            "addressRegion": "ON",



            "addressCountry": "CA"



          },



          "servesCuisine": r.title || "Local Dining",



          "url": r.link || "https://welcomeeg.ca/dining"



        }



      }))



    };



  }, [filteredRestaurants]);







  return (



    <div className="max-w-[1440px] mx-auto w-full px-4 md:px-8 lg:px-12 py-10 flex flex-col gap-8">



      {/* Schema.org Structured Data for Search Engines & Google Search Console */}



      <script



        type="application/ld+json"



        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdData).replace(/</g, '\\u003c') }}



      />



      {/* Page Header */}



      {/* Page Header — Design B East Gwillimbury Atmospheric Sunset */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-lake-950 via-lake-800 to-indigo-950 text-white p-8 sm:p-10 md:p-14 shadow-lift border border-lake-700/50">
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
            <span>({allRestaurants.length}) Verified Dining Spots &bull; Eat In &bull; Take Out &bull; Delivery</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight font-display text-white leading-[1.1] mb-4">
            Local Dining in East Gwillimbury
          </h1>

          <p className="text-blue-100 text-sm sm:text-base md:text-lg leading-relaxed max-w-2xl font-medium">
            Discover verified restaurants, diners, pubs, waterfront bistros, and cafes across Holland Landing, Mount Albert, Jackson&apos;s Point, and Queensville.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3 sm:gap-4">
            <a
              href="/submission?tab=dining"
              className="inline-flex items-center gap-2 min-h-[46px] px-6 rounded-full bg-coral-600 hover:bg-sun-400 text-white hover:text-lake-950 font-black text-xs sm:text-sm uppercase tracking-wider shadow-pop-sm hover:-translate-y-0.5 transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Submit Restaurant Listing</span>
              <span>&rarr;</span>
            </a>
          </div>
        </div>
      </div>

      {/* Filter Bar — Design B Pill Styling */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-lake-100 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Category / Service Selector: Eat In, Take Out, Delivery */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lake-900 font-black uppercase text-[11px] tracking-wider mr-1">Service:</span>
          {['All', 'Eat In', 'Take Out', 'Delivery'].map(service => (
            <button
              key={service}
              type="button"
              onClick={() => setSelectedService(service)}
              className={`px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                selectedService === service
                  ? 'bg-lake-800 text-white shadow-pop-sm'
                  : 'bg-lake-50/70 text-lake-900 hover:bg-lake-100 border border-lake-100/50'
              }`}



            >



              {service === 'Eat In' && <Utensils className="w-3.5 h-3.5 text-amber-400" />}



              {service === 'Take Out' && <Car className="w-3.5 h-3.5 text-emerald-400" />}



              {service === 'Delivery' && <Bike className="w-3.5 h-3.5 text-cyan-400" />}



              <span>{service === 'All' ? 'All Services' : service}</span>



            </button>



          ))}



        </div>







        {/* Community & Search Controls */}



        <div className="flex flex-wrap items-center gap-3">



          <select



            value={selectedCommunity}



            onChange={e => setSelectedCommunity(e.target.value)}



            className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-800 bg-gray-50 focus:outline-none focus:border-lake-800"



          >



            {COMMUNITIES.map(c => (



              <option key={c} value={c}>{c}</option>



            ))}



          </select>







          <div className="relative">



            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />



            <input



              type="text"



              placeholder="Search cuisine or dish..."



              value={searchTerm}



              onChange={e => setSearchTerm(e.target.value)}



              className="pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-800 bg-gray-50 focus:outline-none focus:border-lake-800 w-full sm:w-56"



            />



          </div>



        </div>



      </div>







      {/* Restaurant Cards Grid */}



      <div className="space-y-4">



        <div className="flex items-center justify-between">



          <h2 className="text-xl font-black text-gray-900 tracking-tight">



            Verified Restaurants &amp; Dining ({filteredRestaurants.length})



          </h2>



          <span className="text-xs text-gray-500 font-semibold">



            Submissions verified by phone &bull; East Gwillimbury



          </span>



        </div>







        {filteredRestaurants.length === 0 ? (



          <div className="bg-white rounded-3xl p-12 text-center border border-gray-200 space-y-4">



            <div className="w-16 h-16 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto text-lake-800">



              <Utensils className="w-8 h-8" />



            </div>



            <div className="space-y-1">



              <h3 className="text-xl font-black text-gray-900">



                {allRestaurants.length === 0 ? "No active dining listings yet" : "No restaurants match your current filter"}



              </h3>



              <p className="text-xs text-gray-600 max-w-md mx-auto leading-relaxed">



                {allRestaurants.length === 0



                  ? "We are currently accepting verified restaurant and dining submissions across East Gwillimbury. Are you a local owner? Post your dine-in hours, takeout specials, or delivery menus directly."



                  : "Try clearing your search term, changing communities, or resetting your service filters to view more local dining options."}



              </p>



            </div>



            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">



              <a
                href="/submission?tab=dining"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-lake-800 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-lake-700 transition-all shadow-sm"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Submit Restaurant Listing</span>
              </a>



              {allRestaurants.length > 0 && (



                <button



                  type="button"



                  onClick={() => { setSelectedService('All'); setSelectedCommunity('All East Gwillimbury'); setSearchTerm(''); }}



                  className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-gray-200 transition-all"



                >



                  Reset Filters



                </button>



              )}



            </div>



          </div>



        ) : (



          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">



            {filteredRestaurants.map(restaurant => {



              const addressQuery = restaurant.location ? encodeURIComponent(restaurant.location) : '';



              const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${addressQuery}`;







              return (



                <div



                  key={restaurant.id}



                  className={CARD_SHELL_CLASS}



                >



                  <div className={`h-2 ${getCardStripeClass('dining', 'coral')}`} aria-hidden="true" />
                  <div className="p-6 flex-1 flex flex-col justify-between min-w-0">
                  <div>



                    {/* Top Badges */}



                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">



                      <div className="flex flex-wrap items-center gap-1.5">



                        <span className={`py-0.5 px-2.5 inline-flex items-center justify-center text-center leading-none text-[10.5px] font-medium uppercase whitespace-nowrap rounded ${getCategoryBadgeStyle('dining', 'dining')}`}>



                          Local Dining



                        </span>



                        <span className="text-[11px] font-medium text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">



                          {restaurant.community}



                        </span>



                      </div>







                      {/* Service Category Badges */}



                      <div className="flex flex-wrap items-center gap-1">



                        {restaurant.service_types.map(st => (



                          <span



                            key={st}



                            className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded ${



                              st === 'Eat In'



                                ? 'bg-amber-400 text-slate-950 border border-amber-500'



                                : st === 'Take Out'



                                ? 'bg-emerald-700 text-white border border-emerald-800'



                                : 'bg-blue-700 text-white border border-blue-800'



                            }`}



                          >



                            {st}



                          </span>



                        ))}



                      </div>



                    </div>







                    {/* RESTAURANT NAME & OFFER HEADLINE */}
                    <div className="mt-1">
                      <div className="text-[11px] uppercase tracking-wider font-extrabold text-lake-800 mb-0.5">
                        Restaurant / Establishment
                      </div>
                      <h3 className="text-[22px] font-bold font-[700] text-slate-950 leading-snug group-hover:text-lake-800 transition-colors" style={{ fontWeight: 700 }}>
                        {restaurant.business_name}
                      </h3>
                      <p className="text-[16px] font-semibold text-amber-900 mt-1">
                        {stripServiceTags(restaurant.title) || restaurant.title}
                      </p>
                    </div>

                    {/* PHYSICAL ADDRESS, PHONE & SCHEDULE INFO */}
                    <div className="space-y-2.5 mt-4 text-[15px] font-normal text-slate-800">
                      
                      {/* Physical Address */}
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold text-slate-900">Address: </span>
                          <a
                            href={gmapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-green-900 hover:underline text-green-800 font-normal inline-flex items-center gap-1 leading-snug"
                            title="Open physical address in Google Maps"
                          >
                            <span>{restaurant.location}</span>
                            <ExternalLink className="w-3.5 h-3.5 text-green-800 shrink-0 inline" />
                          </a>
                        </div>
                      </div>

                      {/* Phone Number */}
                      {restaurant.phone ? (
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-emerald-600 shrink-0" />
                          <div>
                            <span className="font-semibold text-slate-900">Phone: </span>
                            <a
                              href={`tel:${restaurant.phone.replace(/[^0-9]/g, '')}`}
                              className="font-bold text-emerald-800 hover:underline"
                              title="Call restaurant"
                            >
                              {restaurant.phone}
                            </a>
                          </div>
                        </div>
                      ) : null}

                      {/* Dates & Schedule */}
                      {restaurant.event_date_label ? (
                        <div className="flex items-start gap-2 text-slate-700">
                          <Clock className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold text-slate-900">Dates: </span>
                            <span>
                              {restaurant.event_start_date && restaurant.expires_after && restaurant.event_start_date !== restaurant.expires_after
                                ? `Multi-Day Special: ${restaurant.event_date_label}`
                                : (restaurant.event_start_date ? `Special Date: ${restaurant.event_date_label}` : restaurant.event_date_label)}
                            </span>
                          </div>
                        </div>
                      ) : restaurant.expires_after ? (
                        <div className="flex items-start gap-2 text-slate-700">
                          <Clock className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold text-slate-900">Dates: </span>
                            <span>
                              {restaurant.event_start_date && restaurant.expires_after !== restaurant.event_start_date
                                ? `Multi-Day Special: ${restaurant.event_start_date} – ${restaurant.expires_after}`
                                : `Special Date: ${restaurant.expires_after}`}
                            </span>
                          </div>
                        </div>
                      ) : null}

                    </div>

                    {/* Description Snippet */}
                    {restaurant.summary && (
                      <div className="mt-3.5 pt-3 border-t border-slate-100">
                        <span className="text-[11px] uppercase tracking-wider font-extrabold text-slate-500 block mb-1">
                          Description
                        </span>
                        <p className="text-[15px] text-slate-700 font-normal line-clamp-3 leading-relaxed">
                          {restaurant.summary}
                        </p>
                      </div>
                    )}

                  </div>

                  {/* Bottom Action Links: Directions & Description Button */}
                  <div className="mt-6 px-6 py-3.5 -mx-6 -mb-6 bg-coral-50/50 border-t border-lake-100 flex items-center justify-between gap-2">
                    <a
                      href={gmapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-bold text-green-800 hover:text-green-900 flex items-center gap-1 py-2 px-1"
                    >
                      <MapPin className="w-3.5 h-3.5 text-green-800" />
                      <span>Directions &amp; Reviews</span>
                    </a>

                    <Link
                      to={`/dining/${restaurant.slug || restaurant.id}`}
                      className="px-4 py-2 rounded-full bg-lake-800 hover:bg-coral-600 text-white text-[13px] font-black uppercase tracking-wider transition-colors flex items-center gap-1.5 shadow-xs"
                    >
                      <span>Description</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                  </div>
                </div>
              );
            })}



          </div>



        )}



      </div>







      {/* Restaurant submission moved to dedicated full page: /submit/dining */}

    </div>



  );



}



