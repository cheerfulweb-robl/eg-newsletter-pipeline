import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import BusinessPanel from '../components/BusinessPanel';
import { SomethingChangedButton } from '../components/SomethingChangedModal';
import { trackedLink, slugOrAliasFilter, PUBLIC_LISTING_COLUMNS } from '../utils/links';
import {
  Utensils,
  MapPin,
  Phone,
  Clock,
  ExternalLink,
  Share2,
  ArrowLeft,
  CheckCircle2,
  Calendar,
  Sparkles,
  Copy,
  ChevronRight,
  Globe,
  AlertCircle
} from 'lucide-react';
import { formatPhoneNumber, formatDDMonthYYYY } from '../services/discoveryService';
import { resolveCommunity, stripServiceTags, serviceTypesFor } from '../utils/communities';

export default function DiningDetails() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadListing() {
      if (!slug) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setNotFound(false);

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
        let query = supabase.from('vendor_events').select(PUBLIC_LISTING_COLUMNS);

        if (isUuid) {
          query = query.eq('id', slug);
        } else {
          query = query.or(slugOrAliasFilter(slug));
        }

        // Try approved first
        let { data, error } = await query.eq('status', 'approved').maybeSingle();

        // Fallback: If not found under approved (e.g. testing right after submission), check by slug/id
        if (!data) {
          let fallbackQuery = supabase.from('vendor_events').select(PUBLIC_LISTING_COLUMNS);
          if (isUuid) {
            fallbackQuery = fallbackQuery.eq('id', slug);
          } else {
            fallbackQuery = fallbackQuery.or(slugOrAliasFilter(slug));
          }
          const fbRes = await fallbackQuery.maybeSingle();
          if (fbRes.data) {
            data = fbRes.data;
          }
        }

        if (data && isMounted) {
          // v61: always show the friendly address (old names and ids forward to it)
          if (data.slug && data.slug !== slug) {
            // The page loads again at the new address; count the view there, not twice.
            navigate(`/dining/${data.slug}`, { replace: true });
            return;
          }
          // Parse service types
          const rawText = `${data.title || ''} ${data.summary || ''}`.toLowerCase();
          const sTypes = serviceTypesFor(data);

          // Extract phone
          const phoneMatch = data.summary?.match(/(?:📞|Phone:?)\s*([0-9\-\(\)\s\.\+]{7,})/i);
          const rawPhone = data.contact_phone || (phoneMatch ? phoneMatch[1].trim() : '');
          const formattedPhone = formatPhoneNumber(rawPhone);

          // Extract community
          const loc = (data.location || '').toLowerCase();
          const comm = resolveCommunity(data.community, data.location);

          // Clean image URL
          let cleanImg = null;
          if (data.image_url) {
            cleanImg = data.image_url.replace(/^pending:/, '').trim();
          }

          const parsed = {
            id: data.id,
            slug: data.slug || data.id,
            business_name: data.business_name || 'Local Restaurant',
            title: data.title || 'Dining Feature',
            category: data.category || 'dining',
            service_types: sTypes,
            community: comm,
            location: data.location || 'East Gwillimbury, ON',
            phone: formattedPhone,
            email: data.submitter_email || '',
            contact_name: data.contact_name || '',
            image_url: cleanImg,
            event_start_date: data.event_start_date,
            expires_after: data.expires_after,
            event_date_label: data.event_date_label || '',
            summary: data.summary || '',
            link: data.link || '',
            status: data.status
          };

          setRestaurant(parsed);

          // Update page title
          document.title = `${parsed.business_name} - Dining Special | Welcome East Gwillimbury`;

          // Track impression if approved
          try {
            await supabase.rpc('increment_listing_impression', {
              target_table: 'vendor_events',
              target_id: data.id
            });
          } catch (_) {}
        } else if (isMounted) {
          setNotFound(true);
        }
      } catch (err) {
        console.error('Error loading dining detail:', err);
        if (isMounted) setNotFound(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadListing();

    return () => {
      isMounted = false;
    };
  }, [slug]);

  // Social sharing helpers
  const shareUrl = typeof window !== 'undefined' ? window.location.href : `https://welcomeeg.ca/dining/${slug}`;
  const shareTitle = restaurant
    ? `${restaurant.business_name} – ${stripServiceTags(restaurant.title)} | Welcome East Gwillimbury Dining`
    : 'Welcome East Gwillimbury Dining Special';
  const shareText = restaurant
    ? `Check out ${restaurant.business_name} in East Gwillimbury: ${stripServiceTags(restaurant.title)}!`
    : 'Discover verified dining specials across East Gwillimbury.';

  const handleCopyLink = () => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(shareUrl);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2500);
    }
  };

  const handleNativeShare = () => {
    if (navigator?.share) {
      navigator.share({
        title: shareTitle,
        text: shareText,
        url: shareUrl
      }).catch(() => {});
    } else {
      handleCopyLink();
    }
  };

  const facebookShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
  const twitterShareUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareTitle)}`;
  const linkedInShareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
  const whatsAppShareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareTitle + ' ' + shareUrl)}`;

  const gmapsUrl = restaurant
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${restaurant.business_name} ${restaurant.location}`)}`
    : '#';

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 py-16 px-4 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-900 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Loading dining description...</p>
        </div>
      </div>
    );
  }

  if (notFound || !restaurant) {
    return (
      <div className="min-h-screen bg-slate-50 py-16 px-4">
        <div className="max-w-2xl mx-auto bg-white rounded-3xl p-8 border border-slate-200 shadow-sm text-center">
          <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4 text-amber-600">
            <Utensils className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Dining Special Not Found</h1>
          <p className="text-slate-600 mb-6">
            This dining special or restaurant listing may have ended, expired, or been updated.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/dining"
              className="px-6 py-2.5 bg-[#00008b] text-white rounded-xl font-bold hover:bg-blue-900 transition-colors inline-flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Explore All Dining</span>
            </Link>
            <a
              href="/submission?tab=dining"
              className="px-6 py-2.5 bg-slate-100 text-slate-800 rounded-xl font-bold hover:bg-slate-200 transition-colors inline-flex items-center gap-2"
            >
              <span>Submit Restaurant Listing</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  const cleanOfferTitle = stripServiceTags(restaurant.title) || restaurant.title;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-[1440px] mx-auto">
        
        {/* Navigation Breadcrumb & Back Button */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <Link
            to="/dining"
            className="inline-flex items-center gap-2 text-[#00008b] hover:text-blue-800 font-bold text-sm bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-xs hover:shadow transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dining Guide</span>
          </Link>

          <nav className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <Link to="/" className="hover:text-blue-900">Home</Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <Link to="/dining" className="hover:text-blue-900">Dining</Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-800 font-bold truncate max-w-[200px]">{restaurant.business_name}</span>
          </nav>
        </div>

        {/* Main Card Container */}
        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': ['LocalBusiness', 'FoodEstablishment'],
            name: restaurant.business_name,
            description: restaurant.summary || restaurant.title,
            url: `https://welcomeeg.ca/dining/${restaurant.slug}`,
            telephone: restaurant.phone || undefined,
            image: restaurant.image_url || undefined,
            address: {
              '@type': 'PostalAddress',
              streetAddress: restaurant.location || 'East Gwillimbury, ON',
              addressLocality: restaurant.community || 'East Gwillimbury',
              addressRegion: 'ON',
              addressCountry: 'CA',
            },
          })}
        </script>
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          
          {/* Header Bar with Service Badges & Quick Actions */}
          <div className="p-5 sm:p-8 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-blue-50/20">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="py-1 px-3 inline-flex items-center justify-center text-center text-xs font-bold uppercase tracking-wider text-rose-800 bg-rose-50 border border-rose-200 rounded-lg">
                <Utensils className="w-3.5 h-3.5 mr-1.5 inline" />
                Local Dining
              </span>
              <span className="py-1 px-3 inline-flex items-center justify-center text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg">
                <MapPin className="w-3.5 h-3.5 mr-1 text-slate-400 inline" />
                {restaurant.community}
              </span>
              {restaurant.service_types.map(st => (
                <span
                  key={st}
                  className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border ${
                    st === 'Eat In'
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : st === 'Take Out'
                      ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                      : 'bg-blue-100 text-blue-900 border-blue-300'
                  }`}
                >
                  {st}
                </span>
              ))}
              <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                ✓ Verified Restaurant
              </span>
            </div>

            <div className="text-xs uppercase tracking-wider font-extrabold text-blue-900 mb-1">
              Restaurant / Establishment
            </div>
            <h1 className="text-2xl sm:text-4xl font-black text-slate-950 tracking-tight leading-tight">
              {restaurant.business_name}
            </h1>
            <p className="text-lg sm:text-2xl font-bold text-amber-900 mt-1.5">
              {cleanOfferTitle}
            </p>

            {/* 1-Tap Quick-Action Row */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {restaurant.phone && (
                <a
                  href={`tel:${restaurant.phone.replace(/[^0-9]/g, '')}`}
                  className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-colors"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Call {restaurant.phone}</span>
                </a>
              )}
              <a
                href={gmapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-green-800 border border-slate-200 text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-colors"
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>Directions &amp; Reviews</span>
              </a>
              {restaurant.link && restaurant.link !== 'https://welcomeeg.ca/dining' && (
                <a
                  href={trackedLink('listing', restaurant.id, 'dining-details') || restaurant.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl bg-[#00008b] hover:bg-blue-900 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-colors"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Menu &bull; Website</span>
                </a>
              )}
              <button
                type="button"
                onClick={handleNativeShare}
                className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>{copiedShare ? 'Copied!' : 'Share'}</span>
              </button>
            </div>
          </div>

          {/* Desktop 12-col split: main logistics + description on left, photo on right.
              On mobile, hide the generic WG placeholder so key info is immediately above the fold. */}
          <div className="lg:grid lg:grid-cols-12">
            <aside className={`lg:col-span-5 lg:order-2 p-5 sm:p-8 lg:pl-0 border-b lg:border-b-0 border-slate-100 ${restaurant.image_url ? '' : 'hidden lg:block'}`}>
              <img
                src={restaurant.image_url || '/placeholder-500x500.jpg'}
                alt={restaurant.image_url ? `${restaurant.business_name} - ${cleanOfferTitle}` : `${restaurant.business_name} (no photo provided)`}
                className={`block w-full max-w-[500px] mx-auto rounded-2xl border border-slate-200 shadow-sm bg-slate-100 ${restaurant.image_url ? 'max-h-[260px] sm:max-h-[360px] lg:max-h-none object-cover lg:object-contain h-auto' : 'h-auto'}`}
                loading="lazy"
                onError={(e) => {
                  if (!e.currentTarget.src.endsWith('/placeholder-500x500.jpg')) e.currentTarget.src = '/placeholder-500x500.jpg';
                }}
              />
            </aside>
            <div className="lg:col-span-7 lg:order-1 min-w-0">
            {/* Compact 3-Item Logistics Grid */}
            <div className="p-5 sm:p-8 grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-slate-50/60 border-b border-slate-100">

              {/* Dates & Schedule */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-start gap-3 sm:col-span-2">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500">Dates &amp; Schedule</div>
                  <div className="text-base font-semibold text-slate-900 mt-0.5">
                    {restaurant.event_date_label || (restaurant.expires_after ? `Valid until ${formatDDMonthYYYY(restaurant.expires_after)}` : 'Ongoing Special')}
                  </div>
                  {restaurant.event_start_date && (
                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span>Starts: {formatDDMonthYYYY(restaurant.event_start_date)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Address */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500">Address</div>
                  <div className="text-sm font-semibold text-slate-900 mt-0.5 leading-snug">{restaurant.location}</div>
                  <a
                    href={gmapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-green-800 hover:underline mt-1.5"
                  >
                    <span>Directions &amp; Reviews</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {/* Phone Number */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500">Phone Number</div>
                  {restaurant.phone ? (
                    <>
                      <div className="text-base font-bold text-emerald-900 mt-0.5">
                        <a href={`tel:${restaurant.phone.replace(/[^0-9]/g, '')}`} className="hover:underline">
                          {restaurant.phone}
                        </a>
                      </div>
                      <a
                        href={`tel:${restaurant.phone.replace(/[^0-9]/g, '')}`}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 hover:underline mt-1.5"
                      >
                        <span>Click to Call Restaurant</span>
                        <Phone className="w-3 h-3" />
                      </a>
                    </>
                  ) : (
                    <div className="text-sm text-slate-500 mt-1 italic">Phone available upon request</div>
                  )}
                </div>
              </div>

            </div>

            {/* Full Description Section */}
            <div className="p-5 sm:p-8 border-b border-slate-100">
              <h2 className="text-lg sm:text-xl font-bold text-slate-950 mb-3 flex items-center gap-2">
                <Utensils className="w-5 h-5 text-[#00008b]" />
                <span>Full Description &amp; Details</span>
              </h2>
              <div className="prose prose-slate max-w-none text-slate-700 text-base leading-relaxed whitespace-pre-line bg-slate-50/70 p-5 rounded-2xl border border-slate-200">
                {restaurant.summary ? restaurant.summary : 'No additional description provided.'}
              </div>

              {/* Menu / Website Link */}
              {restaurant.link && restaurant.link !== 'https://welcomeeg.ca/dining' && (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-blue-50/60 border border-blue-200">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#00008b] text-white flex items-center justify-center shrink-0">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wider font-bold text-blue-900">Official Webpage</div>
                      <div className="text-sm font-semibold text-slate-800">Visit restaurant website &amp; menu</div>
                    </div>
                  </div>
                  <a
                    href={trackedLink('listing', restaurant.id, 'dining-details') || restaurant.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full sm:w-auto justify-center px-5 py-2.5 rounded-xl bg-[#00008b] hover:bg-blue-900 text-white text-sm font-bold inline-flex items-center gap-2 shadow-xs transition-colors"
                  >
                    <span>Visit Menu &bull; Website</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              )}
            </div>

            </div>
          </div>

          {/* Social Sharing Section */}
          <div className="p-6 sm:p-8 bg-gradient-to-r from-slate-50 via-white to-slate-50">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-950 flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-blue-700" />
                  <span>Share This Dining Special</span>
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Invite friends, share on social media, or spread the word to support local East Gwillimbury dining.
                </p>
              </div>

              {/* Native share sheet if mobile */}
              {typeof navigator !== 'undefined' && navigator.share && (
                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors inline-flex items-center gap-2"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Share via Device</span>
                </button>
              )}
            </div>

            {/* Sharing Buttons Bar */}
            <div className="flex flex-wrap items-center gap-2.5">
              
              {/* Facebook */}
              <a
                href={facebookShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 rounded-xl bg-[#1877F2] hover:bg-[#1464cc] text-white text-xs font-bold inline-flex items-center gap-2 shadow-xs transition-all"
                title="Share on Facebook"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
                <span>Facebook</span>
              </a>

              {/* X / Twitter */}
              <a
                href={twitterShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-2 shadow-xs transition-all"
                title="Share on X"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 23.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                <span>X / Post</span>
              </a>

              {/* LinkedIn */}
              <a
                href={linkedInShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 rounded-xl bg-[#0A66C2] hover:bg-[#084e96] text-white text-xs font-bold inline-flex items-center gap-2 shadow-xs transition-all"
                title="Share on LinkedIn"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                </svg>
                <span>LinkedIn</span>
              </a>

              {/* WhatsApp */}
              <a
                href={whatsAppShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#1faa4f] text-white text-xs font-bold inline-flex items-center gap-2 shadow-xs transition-all"
                title="Share on WhatsApp"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                </svg>
                <span>WhatsApp</span>
              </a>

              {/* Copy Link Button */}
              <button
                type="button"
                onClick={handleCopyLink}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-2 border border-slate-300 shadow-xs transition-all"
              >
                {copiedShare ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span className="text-emerald-700 font-extrabold">Link Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-slate-600" />
                    <span>Copy Direct Link</span>
                  </>
                )}
              </button>

            </div>

            <div className="mt-4 pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>Notice outdated hours or changed specials?</span>
              <SomethingChangedButton
                itemTitle={restaurant.title || restaurant.business_name}
                businessName={restaurant.business_name}
                category="dining"
              />
            </div>
          </div>

          {/* Action Footer */}
          <div className="p-6 sm:p-8 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wider font-extrabold text-amber-400">Welcome East Gwillimbury Dining</div>
              <div className="text-sm text-slate-300">Are you a restaurant owner in East Gwillimbury? Publish your specials free.</div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/dining"
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors"
              >
                &larr; All Restaurants
              </Link>
              <a
                href="/submission?tab=dining"
                className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 text-xs font-black uppercase tracking-wider transition-colors shadow-xs"
              >
                Submit Dining Listing &rarr;
              </a>
            </div>
          </div>

        </div>

        {/* The business's page and its other current offers */}
        {restaurant.business_name && restaurant.business_name !== 'Local Restaurant' && <BusinessPanel event={restaurant} />}

      </div>
    </div>
  );
}
