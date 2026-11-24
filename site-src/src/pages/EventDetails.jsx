import React, { useState, useEffect, useMemo } from 'react';
import { mapsQuery } from '../utils/communities';



import { useParams, Link, useNavigate } from 'react-router-dom';



import { supabase } from '../supabaseClient';
import { trackedLink, detailPath, slugOrAliasFilter, PUBLIC_LISTING_COLUMNS } from '../utils/links';
import BusinessPanel from '../components/BusinessPanel';
import { SomethingChangedButton } from '../components/SomethingChangedModal';



import { 



  Calendar, 



  Clock, 



  MapPin, 
  Map as MapIcon,



  Bookmark, 



  Download, 



  ExternalLink, 



  Share2, 



  ArrowLeft, 



  Sparkles, 



  Building2, 



  Tag, 



  CheckCircle2, 



  AlertCircle 



} from 'lucide-react';



import {

  formatDDMonthYYYY,
  formatEventScheduleDisplay, 



  downloadEventIcs, 



  isItemSaved, 



  toggleSaveItem, 



  generateSlug,



  parseToMidnight,



  isExpired,

  formatCategoryLabel,

  isOutOfAreaLocation,

  formatLocationDisplay

} from '../services/discoveryService';







// Fallback curated town events lookup in case dynamic record is pending or static



const CURATED_DETAILS_FALLBACK = [];







export default function EventDetails() {



  const { slug } = useParams();



  const navigate = useNavigate();



  const [event, setEvent] = useState(null);
  const [businessSlug, setBusinessSlug] = useState(null);

  useEffect(() => {
    let alive = true;
    const bName = String(event?.business_name || '').trim();
    setBusinessSlug(null);
    if (bName.length < 2) return undefined;
    const pattern = bName.replace(/[\\%_]/g, '\\$&');
    supabase.from('directory_listings')
      .select('slug')
      .eq('status', 'approved')
      .ilike('name', pattern)
      .limit(1)
      .then(({ data }) => {
        if (alive && data && data[0] && data[0].slug) setBusinessSlug(data[0].slug);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [event?.business_name]);



  const [loading, setLoading] = useState(true);



  const [copiedShare, setCopiedShare] = useState(false);



  const [savedUpdate, setSavedUpdate] = useState(0);







  useEffect(() => {



    let isMounted = true;



    async function loadEvent() {



      try {



        setLoading(true);



        // 1. Try matching slug or id in vendor_events safely without Postgres UUID cast errors



        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);



        let query = supabase.from('vendor_events').select(PUBLIC_LISTING_COLUMNS);



        if (isUuid) {



          query = query.eq('id', slug);



        } else {



          query = query.or(slugOrAliasFilter(slug));



        }



        const { data } = await query.eq('status', 'approved').maybeSingle();







        if (data && isMounted) {



          setEvent(data);
          // v61: always show the friendly address (/events, /dining or /sales + name);
          // ids and old names forward to it.
          const canonical = detailPath(data);
          if (canonical !== window.location.pathname) {
            // The page loads again at the new address; count the view there, not twice.
            navigate(canonical, { replace: true });
            return;
          }



          // Increment impression count



          try {



            await supabase.rpc('increment_listing_impression', {



              target_table: 'vendor_events',



              target_id: data.id



            });



          } catch (_) {}



          return;



        }







        // 2. Fallback to curated events



        const curated = CURATED_DETAILS_FALLBACK.find(it => it.slug === slug || it.id === slug);



        if (curated && isMounted) {



          setEvent(curated);



          return;



        }







        // 3. Fallback: query all approved events and match slug dynamically (exact or prefix)



        const { data: allApproved } = await supabase



          .from('vendor_events')



          .select(PUBLIC_LISTING_COLUMNS)



          .eq('status', 'approved');







        if (allApproved && isMounted) {



          const match = allApproved.find(it => {



            const computedSlug = generateSlug(it.title, it.location);



            const titleSlug = generateSlug(it.title);



            return computedSlug === slug || titleSlug === slug || slug.startsWith(titleSlug) || it.id === slug;



          });



          if (match) {



            setEvent(match);



            return;



          }



        }



      } catch (err) {



        console.error('Error fetching event details:', err);



      } finally {



        if (isMounted) setLoading(false);



      }



    }







    loadEvent();

    return () => { isMounted = false; };

  }, [slug]);

  // Synchronize document title, Open Graph, and Twitter metadata
  useEffect(() => {
    if (!event) return;

    const originalTitle = document.title;
    document.title = `${event.title} | Welcome East Gwillimbury Community Events`;

    const ogImage = (event.image_url && !String(event.image_url).startsWith('pending:'))
      ? event.image_url
      : 'https://welcomeeg.ca/default-welcome-eg-og.jpg';
    const ogDesc = event.summary || event.description || 'Discover upcoming community events, local dining specials, and deals on Welcome East Gwillimbury.';
    const ogUrl = typeof window !== 'undefined' ? window.location.href : `https://welcomeeg.ca/events/${slug}`;

    const metaTags = [
      { property: 'og:title', content: event.title },
      { property: 'og:description', content: ogDesc },
      { property: 'og:image', content: ogImage },
      { property: 'og:url', content: ogUrl },
      { property: 'og:type', content: 'article' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: event.title },
      { name: 'twitter:description', content: ogDesc },
      { name: 'twitter:image', content: ogImage }
    ];

    const elementsToCleanup = [];

    metaTags.forEach(tag => {
      const selector = tag.property ? `meta[property="${tag.property}"]` : `meta[name="${tag.name}"]`;
      let el = document.querySelector(selector);
      if (!el) {
        el = document.createElement('meta');
        if (tag.property) el.setAttribute('property', tag.property);
        if (tag.name) el.setAttribute('name', tag.name);
        document.head.appendChild(el);
        elementsToCleanup.push(el);
      }
      el.setAttribute('content', tag.content);
    });

    return () => {
      document.title = originalTitle;
      elementsToCleanup.forEach(el => el.remove());
    };
  }, [event, slug]);







  // Google Calendar Template URL



  const googleCalendarUrl = useMemo(() => {



    if (!event) return '';



    const title = encodeURIComponent(event.title || 'East Gwillimbury Event');



    const details = encodeURIComponent(`${event.summary || ''}\n\nMore information: ${event.link || window.location.href}`);



    const location = encodeURIComponent(event.location || 'East Gwillimbury, ON');







    let datesParam = '';



    const parsedStart = parseToMidnight(event.event_start_date);



    if (parsedStart) {



      const y = parsedStart.getFullYear();



      const m = String(parsedStart.getMonth() + 1).padStart(2, '0');



      const d = String(parsedStart.getDate()).padStart(2, '0');



      datesParam = `${y}${m}${d}T140000Z/${y}${m}${d}T170000Z`;



    }



    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&location=${location}${datesParam ? `&dates=${datesParam}` : ''}`;



  }, [event]);







  // Schema.org Event Structured Data



  const structuredData = useMemo(() => {



    if (!event) return null;



    const isFree = (event.price_text || '').toLowerCase().includes('free');



    return {



      "@context": "https://schema.org",



      "@type": "Event",



      "name": event.title,



      "description": event.summary || event.description,



      "startDate": event.event_start_date ? `${event.event_start_date}T10:00:00-05:00` : undefined,



      "eventStatus": "https://schema.org/EventScheduled",



      "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",



      "location": {



        "@type": "Place",



        "name": event.location || "East Gwillimbury, ON",



        "address": {



          "@type": "PostalAddress",



          "addressLocality": event.community || "East Gwillimbury",



          "addressRegion": "ON",



          "addressCountry": "CA"



        }



      },



      "organizer": {
        "@type": "LocalBusiness",
        "name": event.business_name || event.organizer || "Community Organizer",
        "url": event.link || "https://welcomeeg.ca",
        "telephone": event.contact_phone || undefined,
        "address": {
          "@type": "PostalAddress",
          "streetAddress": event.location || "East Gwillimbury, ON",
          "addressLocality": event.community || "East Gwillimbury",
          "addressRegion": "ON",
          "addressCountry": "CA"
        }
      },



      "offers": isFree ? {



        "@type": "Offer",



        "price": "0",



        "priceCurrency": "CAD",



        "availability": "https://schema.org/InStock"



      } : undefined



    };



  }, [event]);







  const handleShare = () => {



    if (navigator.share) {



      navigator.share({



        title: event?.title || 'Welcome East Gwillimbury Event',



        url: window.location.href



      }).catch(() => {});



    } else {



      navigator.clipboard.writeText(window.location.href);



      setCopiedShare(true);



      setTimeout(() => setCopiedShare(false), 2500);



    }



  };







  const handleSaveToggle = () => {



    if (event) {



      toggleSaveItem(event);



      setSavedUpdate(c => c + 1);



    }



  };







  if (loading) {



    return (



      <div className="max-w-[1440px] mx-auto px-4 py-20 text-center">



        <div className="w-12 h-12 border-4 border-[#00008b] border-t-transparent rounded-full animate-spin mx-auto mb-4" />



        <p className="text-gray-600 font-bold text-sm">Loading verified event details...</p>



      </div>



    );



  }







  if (!event) {



    return (



      <div className="max-w-xl mx-auto px-4 py-20 text-center">



        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />



        <h1 className="text-2xl font-black text-gray-900">Event Not Found</h1>



        <p className="text-sm text-gray-600 mt-2">



          This community listing may have concluded or been updated.



        </p>



        <Link



          to="/events"



          className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#00008b] text-white text-xs font-black uppercase tracking-wider hover:bg-blue-900 transition-colors"



        >



          <ArrowLeft className="w-4 h-4" />



          <span>Browse Upcoming Events</span>



        </Link>



      </div>



    );



  }







  const saved = isItemSaved(event.id);



  const expired = isExpired(event.expires_after);



  const isNewsOrArticle = event.category === 'local_news' || event.category === 'municipal_news' || event.category === 'news' || (!event.event_start_date && event.category !== 'dining' && event.category !== 'special_sale');







  return (



    <div className="w-full max-w-[1440px] min-w-0 mx-auto px-4 md:px-6 py-8">



      {/* Schema.org JSON-LD */}



      {structuredData && (



        <script



          type="application/ld+json"



          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}



        />



      )}







      {/* Breadcrumb Navigation */}



      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-500 mb-6 min-w-0 max-w-full">



        <Link to="/" className="hover:text-[#00008b] shrink-0">Home</Link>



        <span className="shrink-0">/</span>



        <Link to="/events" className="hover:text-[#00008b] shrink-0">Events</Link>



        <span className="shrink-0">/</span>



        <span className="text-gray-900 font-bold min-w-0 max-w-full break-words">{event.title}</span>



      </div>







      {expired && (



        <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center gap-3">



          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />



          <p className="text-xs font-bold">



            Notice: This event concluded on {formatDDMonthYYYY(event.expires_after)}. It remains archived for informational purposes.



          </p>



        </div>



      )}







      {/* Main Card */}



      <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 md:p-10">



        {/* Header Badges & Actions */}



        <div className="flex flex-wrap items-center justify-between gap-3 pb-6 border-b border-gray-100">



          <div className="flex flex-wrap items-center gap-2">



            <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-blue-50 text-[#00008b] border border-blue-200 flex items-center gap-1.5">



              <CheckCircle2 className="w-3.5 h-3.5" />



              <span>Verified Listing</span>



            </span>



            {event.category && (
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700">
                {formatCategoryLabel(event.category)}
              </span>
            )}
            {isOutOfAreaLocation(event.location) && (
              <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200">
                Out of Area
              </span>
            )}







          </div>







          <div className="flex items-center gap-2">



            <button



              type="button"



              onClick={handleSaveToggle}



              className={`p-2.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 ${



                saved



                  ? 'bg-amber-100 border-amber-300 text-amber-950 font-black'



                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'



              }`}



              title={saved ? 'Saved in Your Bookmarks' : 'Save Event for Later'}



            >



              <Bookmark className="w-4 h-4 fill-current" />



              <span className="hidden sm:inline">{saved ? 'Saved' : 'Save'}</span>



            </button>







            <button



              type="button"



              onClick={handleShare}



              className="p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold transition-colors flex items-center gap-1.5"



              title="Share Event"



            >



              <Share2 className="w-4 h-4" />



              <span className="hidden sm:inline">{copiedShare ? 'Copied!' : 'Share'}</span>



            </button>



          </div>



        </div>







        {/* Title & Host */}



        <div className="mt-6">



          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-gray-900 leading-tight break-words">



            {event.title}



          </h1>







          <div className="flex items-start sm:items-center gap-2 mt-3 text-sm font-semibold text-gray-600 min-w-0">



            <Building2 className="w-4 h-4 text-blue-700 shrink-0 mt-0.5 sm:mt-0" />



            <span className="min-w-0 break-words">
              Presented by:{' '}
              {businessSlug ? (
                <Link to={`/businesses/${businessSlug}`} className="font-bold text-[#00008b] hover:underline">
                  {event.business_name}
                </Link>
              ) : (
                <strong className="text-gray-900">{event.business_name || event.organizer || 'Community Organizer'}</strong>
              )}
            </span>



          </div>



        </div>







        {/* v61.1: photo column, same as dining pages. Right side on desktop, directly under the
            title on phones when a real photo exists; generic WG placeholder is hidden on mobile so
            key logistics appear above the fold. */}
        <div className="mt-6 lg:grid lg:grid-cols-12 lg:gap-8">
          {(() => {
            const realImage = event.image_url && !String(event.image_url).startsWith('pending:') ? event.image_url : '';
            return (
              <aside className={`lg:col-span-5 lg:order-2 lg:pt-8 mb-6 lg:mb-0 ${realImage ? '' : 'hidden lg:block'}`}>
                <img
                  src={realImage || '/placeholder-eg-500x500.png'}
                  alt={realImage ? (event.title || 'Listing image') : `${event.title || 'Listing'} (no photo provided)`}
                  onClick={realImage ? () => window.open(realImage, '_blank', 'noopener,noreferrer') : undefined}
                  title={realImage ? 'Click to view the image full screen in a new window' : undefined}
                  loading="lazy"
                  className={`block w-full max-w-[500px] mx-auto rounded-2xl border border-gray-200 shadow-sm bg-gray-100 ${realImage ? 'max-h-[260px] sm:max-h-[360px] lg:max-h-none object-cover lg:object-contain h-auto cursor-pointer hover:opacity-95' : 'h-auto'}`}
                  onError={(e) => {
                    if (!e.currentTarget.src.endsWith('/placeholder-eg-500x500.png')) e.currentTarget.src = '/placeholder-eg-500x500.png';
                  }}
                />
              </aside>
            );
          })()}
          <div className="lg:col-span-7 lg:order-1 min-w-0">
            {/* Key Logistics Grid */}



            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-8 p-6 rounded-2xl bg-gray-50 border border-gray-100">



              <div className="flex items-start gap-3">



                <div className="w-10 h-10 rounded-xl bg-blue-100 text-[#00008b] flex items-center justify-center shrink-0">



                  <Clock className="w-5 h-5" />



                </div>



                <div>



                  <p className="text-[13px] sm:text-[10px] font-black uppercase tracking-wider text-gray-500">



                    {isNewsOrArticle ? 'Publication & Status' : 'Date & Schedule'}



                  </p>



                  {(() => {
                    const raw = formatEventScheduleDisplay(event) || event.event_date_label || event.event_start_date || event.date || '';
                    let dPart = raw;
                    let tPart = '';
                    if (raw.includes('•')) {
                      const pts = raw.split('•');
                      dPart = pts[0].trim();
                      tPart = pts.slice(1).join('•').trim();
                    } else if (raw.includes('@')) {
                      const pts = raw.split('@');
                      dPart = pts[0].trim();
                      tPart = pts.slice(1).join('@').trim();
                    }
                    const formattedDate = formatDDMonthYYYY(dPart) || (isNewsOrArticle ? 'Community Feature' : 'See details below');
                    return (
                      <div className="space-y-1 mt-1 text-left">
                        <p className="text-[17px] sm:text-sm font-black text-gray-900 leading-tight">
                          <span className="text-gray-500 font-bold text-[15px] sm:text-xs uppercase tracking-wider mr-1.5">Date:</span>
                          {formattedDate}
                        </p>
                        {tPart && (
                          <p className="text-[15px] sm:text-xs font-black text-[#00008b] leading-tight">
                            <span className="text-gray-500 font-bold text-[14px] sm:text-[11px] uppercase tracking-wider mr-1.5">Time:</span>
                            {tPart}
                          </p>
                        )}
                      </div>
                    );
                  })()}



                  <p className="text-[15px] sm:text-xs text-gray-500 mt-0.5">



                    {isNewsOrArticle ? 'Town of East Gwillimbury Coverage' : 'America/Toronto Local Time'}



                  </p>



                </div>



              </div>







              <div className="flex items-start gap-3">



                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">



                  <MapPin className="w-5 h-5" />



                </div>



                <div>



                  <p className="text-[13px] sm:text-[10px] font-black uppercase tracking-wider text-gray-500">Venue &amp; Location</p>
                  <p className="text-[17px] sm:text-sm font-black text-gray-900 mt-0.5 leading-snug">
                    {formatLocationDisplay(event.location || 'East Gwillimbury, Ontario')}
                  </p>
                  <p className="text-[15px] sm:text-xs text-blue-700 font-bold mt-0.5">
                    {isOutOfAreaLocation(event.location) ? 'York Region / Surrounding Area' : 'Town of East Gwillimbury'}
                  </p>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery(event.location))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1.5 text-[17px] sm:text-sm font-bold text-green-800 hover:text-green-900 hover:underline"
                    title="Open this address in Google Maps"
                  >
                    <MapIcon className="w-4 h-4 shrink-0" />
                    <span>Directions &amp; Reviews</span>
                  </a>



                </div>



              </div>



            </div>







            {/* Description */}



            <div className="space-y-4 text-gray-800 text-sm md:text-base leading-relaxed">



              <h2 className="text-lg font-black text-gray-900">{isNewsOrArticle ? 'About This Article' : 'About This Event'}</h2>



              <p className="whitespace-pre-line font-normal text-gray-700">



                {event.summary || event.description || 'Join fellow residents for this local community gathering in East Gwillimbury. Check the official organizer website for schedule, parking, and RSVP details.'}



              </p>



            </div>







          </div>
        </div>

        {/* Primary Actions: RSVP / Official Website & Calendar Export */}
        <div className="mt-8 pt-6 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {event.link && (
            <a
              href={trackedLink('listing', event.id, 'event-details') || event.link}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto sm:order-2 px-6 py-3 rounded-xl bg-[#00008b] hover:bg-blue-900 text-white font-black text-xs uppercase tracking-wider shadow-md transition-all flex items-center justify-center gap-2"
            >
              <span>
                {isNewsOrArticle
                  ? 'Read Full Story / Article'
                  : 'RSVP & Full Details on Their Website'}
              </span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto sm:order-1">
            <a
              href={googleCalendarUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-900 text-xs font-bold transition-all flex items-center justify-center gap-2"
            >
              <Calendar className="w-4 h-4 text-[#00008b] shrink-0" />
              <span className="truncate">Google Calendar</span>
            </a>

            <button
              type="button"
              onClick={() => downloadEventIcs(event)}
              className="px-3.5 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-900 text-xs font-bold transition-all flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4 text-gray-600 shrink-0" />
              <span className="truncate">Apple / Outlook (.ics)</span>
            </button>
          </div>
        </div>

        {/* Social Media Share Bar */}
        <div className="mt-6 p-5 bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-slate-50 rounded-2xl border border-blue-100 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                <Share2 className="w-4 h-4 text-[#00008b]" />
                Share This Event With Neighbors &amp; Friends
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {(event.image_url && !event.image_url.startsWith('pending:'))
                  ? 'Includes approved event photo card on social media'
                  : 'Includes official Welcome East Gwillimbury community preview card'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg bg-[#1877f2] hover:bg-blue-600 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1"
                title="Share on Facebook"
              >
                Facebook
              </a>
              <a
                href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}&text=${encodeURIComponent(`Check out ${event.title} in East Gwillimbury!`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg bg-black hover:bg-gray-800 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1"
                title="Share on X (Twitter)"
              >
                X
              </a>
              <a
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg bg-[#0a66c2] hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1"
                title="Share on LinkedIn"
              >
                LinkedIn
              </a>
              <a
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`Check out ${event.title} in East Gwillimbury! ${typeof window !== 'undefined' ? window.location.href : ''}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg bg-[#25d366] hover:bg-emerald-600 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1"
                title="Share via WhatsApp"
              >
                WhatsApp
              </a>
              <button
                type="button"
                onClick={handleShare}
                className="px-3 py-1.5 rounded-lg bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 text-xs font-bold transition-all shadow-sm flex items-center gap-1"
                title="Copy direct share link"
              >
                {copiedShare ? '✓ Copied!' : 'Copy Link'}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-3 border-t border-blue-100/80 text-xs text-gray-500">
            <span className="text-[11px] text-gray-500">Notice outdated dates or details?</span>
            <SomethingChangedButton itemTitle={event.title} businessName={event.business_name} category={event.category} />
          </div>
        </div>

      </div>

      {/* About the business + more from this business (v59) */}
      {!isNewsOrArticle && <BusinessPanel event={event} />}

      {/* Return Links */}
      <div className="mt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Link
          to="/events"
          className="text-xs font-black text-[#00008b] hover:underline flex items-center gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to Community Events</span>
        </Link>

        <Link
          to="/this-weekend"
          className="text-xs font-bold text-gray-600 hover:text-gray-900"
        >
          View This Weekend in East Gwillimbury &rarr;
        </Link>
      </div>



    </div>



  );



}



