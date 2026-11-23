import React, { useState, useEffect, useMemo } from 'react';
import { matchesQuery } from '../utils/fuzzySearch.js';
import { Link } from 'react-router-dom';
import { Sparkles, Calendar, MapPin, Search, ArrowRight, Share2, Check } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { trackedLink, detailPath, PUBLIC_LISTING_COLUMNS } from '../utils/links';
import { selectSpotlightPageItems, KIND_LABELS } from '../utils/spotlight';

export default function FeaturedEvents() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [scheduledId, setScheduledId] = useState(null);
  const [currentIds, setCurrentIds] = useState([]);
  const [pastIds, setPastIds] = useState([]);

  useEffect(() => {
    async function loadFeaturedData() {
      try {
        setLoading(true);
        const [{ data, error }, pubSpot, sched] = await Promise.all([
          supabase
            .from('vendor_events')
            .select(PUBLIC_LISTING_COLUMNS)
            .eq('status', 'approved')
            .order('created_at', { ascending: false }),
          Promise.resolve(supabase.rpc('wg_public_spotlights')).catch(() => ({ data: null })),
          Promise.resolve(supabase.rpc('wg_active_spotlight')).catch(() => ({ data: null })),
        ]);

        if (!error && Array.isArray(data)) {
          setEvents(data);
        }
        if (pubSpot && !pubSpot.error && pubSpot.data && typeof pubSpot.data === 'object') {
          if (Array.isArray(pubSpot.data.current_ids)) setCurrentIds(pubSpot.data.current_ids);
          if (Array.isArray(pubSpot.data.past_ids)) setPastIds(pubSpot.data.past_ids);
        }
        if (sched && !sched.error && typeof sched.data === 'string') {
          setScheduledId(sched.data);
        }
      } catch (err) {
        console.error('Error loading featured events:', err);
      } finally {
        setLoading(false);
      }
    }
    loadFeaturedData();
  }, []);

  // Only show current spotlight business(es) and past events in the last 13 months selected as spotlight items
  const { currentSpotlights, pastSpotlightEvents } = useMemo(
    () => selectSpotlightPageItems(events, { currentIds, pastIds, scheduledId }),
    [events, currentIds, pastIds, scheduledId]
  );

  const spotlightHistory = useMemo(() => {
    if (!searchTerm.trim()) return pastSpotlightEvents;
    return pastSpotlightEvents.filter((e) =>
      matchesQuery(`${e.title || ''} ${e.business_name || ''} ${e.location || ''} ${e.summary || ''}`, searchTerm)
    );
  }, [pastSpotlightEvents, searchTerm]);

  const handleShare = async (evt) => {
    const path = detailPath(evt) || `/events/${evt.slug || evt.id}`;
    const url = `${window.location.origin}${path}`;
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      setCopiedId(evt.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  return (
    <div className="max-w-[1440px] w-full mx-auto px-4 md:px-8 lg:px-12 py-8 pb-24 space-y-10 min-w-0 overflow-x-clip text-slate-900">
      {/* Top Banner / Hero Header */}
      <section className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-lake-950 via-lake-800 to-indigo-950 text-white p-6 sm:p-10 md:p-14 shadow-lift border border-lake-700/50 min-w-0 max-w-full">
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

        <div className="relative z-10 max-w-4xl min-w-0">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-lake-900/80 border border-lake-600/70 text-sun-200 text-xs sm:text-sm font-bold mb-4 shadow-sm backdrop-blur-sm max-w-full flex-wrap">
            <span className="w-2.5 h-2.5 rounded-full bg-sun-400 animate-pulse shrink-0" aria-hidden="true"></span>
            <span className="whitespace-normal text-left">⭐ Signature Community Showcase • East Gwillimbury Spotlight</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight font-display text-white leading-[1.1] mb-4 break-words">
            Featured Spotlight &amp; <span className="text-sun-300">Past Highlights</span>
          </h1>

          <p className="text-blue-100 text-sm sm:text-base md:text-lg font-medium leading-relaxed max-w-2xl mb-8">
            Discover East Gwillimbury&apos;s current spotlight business features alongside past events and community highlights selected for the Spotlight over the last 13 months.
          </p>

          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <Link
              to="/events"
              className="inline-flex items-center gap-2 min-h-[46px] px-6 rounded-full bg-coral-600 hover:bg-sun-400 text-white hover:text-lake-950 font-black text-xs sm:text-sm uppercase tracking-wider shadow-pop-sm hover:-translate-y-0.5 transition-all"
            >
              <span>Explore All 100+ Events</span>
              <span>&rarr;</span>
            </Link>
            <Link
              to="/submission?tab=events"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 text-xs font-bold text-blue-100 hover:bg-white/20 transition-all"
            >
              <span>+ Submit Your Event</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <div className="w-full min-w-0 max-w-full space-y-12">
        {/* CURRENT ACTIVE SPOTLIGHT BUSINESS(ES) */}
        <section className="space-y-6 min-w-0">
          <div className="border-b border-slate-200 pb-3">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              ⭐ Current Spotlight Business{currentSpotlights.length > 1 ? 'es' : ''}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Featured local business and community spotlight{currentSpotlights.length > 1 ? 's' : ''} active right now.
            </p>
          </div>

          {loading ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-slate-200 text-slate-400 font-bold text-sm">
              Loading current spotlight...
            </div>
          ) : currentSpotlights.length === 0 ? (
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-dashed border-slate-300 text-center space-y-2">
              <p className="text-base font-black text-slate-800">No Current Spotlight Business Active Right Now</p>
              <p className="text-xs sm:text-sm text-slate-500 max-w-xl mx-auto">
                Check back soon for our next featured East Gwillimbury business spotlight, or browse our past 13 months of selected spotlight highlights below.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {currentSpotlights.map(({ item: activeSpotlight, kind }) => (
                <div
                  key={activeSpotlight.id}
                  className="bg-white rounded-3xl p-5 sm:p-8 shadow-xl border border-slate-200 relative overflow-hidden min-w-0 max-w-full"
                >
                  <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-xs font-black uppercase tracking-wider">
                      <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Current Spotlight</span>
                    </span>
                    <span className="text-xs font-bold text-slate-600">
                      {KIND_LABELS[kind] || 'Spotlight Business'} &middot; Featured Selection
                    </span>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start min-w-0">
                    <div className="lg:col-span-2 space-y-3 min-w-0">
                      <h3 className="text-2xl sm:text-3xl font-black text-slate-900 leading-snug break-words">
                        {activeSpotlight.title}
                      </h3>
                      {activeSpotlight.business_name && (
                        <p className="text-sm font-bold text-[#00008b] break-words">
                          Business / Host: {activeSpotlight.business_name}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-slate-600 pt-1">
                        <span className="flex items-center gap-1.5 font-bold text-slate-800">
                          <Calendar className="w-4 h-4 text-[#00008b] shrink-0" />
                          <span>{activeSpotlight.event_date_label || activeSpotlight.event_start_date || 'Current Spotlight'}</span>
                        </span>
                        {activeSpotlight.location && (
                          <span className="flex items-center gap-1.5 min-w-0">
                            <MapPin className="w-4 h-4 text-rose-500 shrink-0" />
                            <span className="break-words">{activeSpotlight.location}</span>
                          </span>
                        )}
                      </div>
                      {activeSpotlight.summary && (
                        <p className="text-sm text-slate-600 leading-relaxed pt-2 break-words">
                          {activeSpotlight.summary}
                        </p>
                      )}
                    </div>

                    {/* Action Buttons Box */}
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3 flex flex-col justify-center min-w-0">
                      <Link
                        to={detailPath(activeSpotlight) || (activeSpotlight.slug ? `/events/${activeSpotlight.slug}` : `/events/${activeSpotlight.id}`)}
                        className="w-full py-3 px-4 rounded-xl bg-[#00008b] hover:bg-blue-900 text-white font-black text-xs uppercase tracking-wider transition text-center shadow-sm flex items-center justify-center gap-2"
                      >
                        <span>View Full Listing</span>
                        <ArrowRight className="w-4 h-4 shrink-0" />
                      </Link>
                      {activeSpotlight.link && activeSpotlight.link !== '#' && (
                        <a
                          href={trackedLink('listing', activeSpotlight.id, 'featured') || activeSpotlight.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs uppercase tracking-wider transition text-center border border-slate-200"
                        >
                          🔗 Official Website &rarr;
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => handleShare(activeSpotlight)}
                        className="w-full py-2 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-600 font-bold text-xs transition text-center border border-slate-200 flex items-center justify-center gap-1.5"
                      >
                        {copiedId === activeSpotlight.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span className="text-emerald-700 font-bold">Link Copied!</span>
                          </>
                        ) : (
                          <>
                            <Share2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span>Share Spotlight Link</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* PAST SPOTLIGHT EVENTS (LAST 13 MONTHS) */}
        <section className="space-y-6 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-4">
            <div className="min-w-0">
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                📜 Past Spotlight Events (Last 13 Months)
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Past events from the last 13 months that were selected as Welcome East Gwillimbury spotlight features.
              </p>
            </div>
            {/* Search Input */}
            <div className="relative w-full sm:w-72 shrink-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search past spotlight events..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#00008b]"
              />
            </div>
          </div>

          {loading ? (
            <div className="text-center py-16 text-slate-400 font-bold text-sm">
              Loading past spotlight events...
            </div>
          ) : spotlightHistory.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200 text-slate-500 text-sm px-4">
              {searchTerm.trim()
                ? 'No past spotlight events from the last 13 months match your search.'
                : 'No past spotlight events from the last 13 months yet.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 min-w-0">
              {spotlightHistory.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:border-blue-400 hover:shadow-md transition flex flex-col justify-between min-w-0 max-w-full overflow-hidden"
                >
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded-md text-[10.5px] font-black uppercase tracking-wider bg-blue-50 text-[#00008b] border border-blue-100 max-w-full truncate">
                        {item.category ? item.category.replace(/_/g, ' ') : 'Spotlight Feature'}
                      </span>
                      <span className="text-xs font-bold text-slate-500 shrink-0">
                        {item.event_start_date || 'Past Spotlight'}
                      </span>
                    </div>
                    <h4 className="text-base font-black text-slate-900 leading-snug break-words">
                      {item.title}
                    </h4>
                    {item.business_name && (
                      <p className="text-xs font-bold text-slate-600 break-words">
                        {item.business_name}
                      </p>
                    )}
                    <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed break-words">
                      {item.summary}
                    </p>
                  </div>

                  <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-between gap-2 min-w-0">
                    <span className="text-xs font-bold text-slate-500 truncate min-w-0">
                      📍 {item.location || 'East Gwillimbury, ON'}
                    </span>
                    <Link
                      to={detailPath(item) || (item.slug ? `/events/${item.slug}` : `/events/${item.id}`)}
                      className="text-xs font-black text-[#00008b] hover:underline shrink-0"
                    >
                      Details &rarr;
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
