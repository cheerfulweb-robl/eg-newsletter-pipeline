import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, MapPin, Phone, Globe, ExternalLink, Calendar, Utensils, Tag, Map as MapIcon, ArrowRight, ShieldCheck } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { trackedLink, detailPath, hasMerchantLink, businessPath, listingKind, safeHref } from '../utils/links';
import ClaimBusinessModal from './ClaimBusinessModal';

// "About the business" + "More from this business" on a listing's detail page (v59).
// Shows the business's Businesses-directory entry and its other approved events,
// dining specials and sales. Renders nothing if there is neither.

function kindOf(item) {
  return listingKind(item);
}

function shortDate(item) {
  const raw = item.event_start_date || item.expires_after;
  if (!raw) return item.event_date_label || '';
  const d = new Date(`${raw}T12:00:00`);
  return isNaN(d) ? (item.event_date_label || '') : d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

const GROUPS = [
  { key: 'event', label: 'Events', Icon: Calendar },
  { key: 'dining', label: 'Dining specials', Icon: Utensils },
  { key: 'sale', label: 'Sales & offers', Icon: Tag },
];

// Used on listing pages (event = the listing being shown) and on the business page
// (/businesses/<name>: listing passed in directly, page = 'business').
export default function BusinessPanel({ event, listing: listingProp = null, page = 'event-details' }) {
  const [listing, setListing] = useState(listingProp);
  const [related, setRelated] = useState([]);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [alreadyClaimed, setAlreadyClaimed] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const businessName = String(listingProp?.name || event?.business_name || '').trim();
  const excludeId = event?.id || null;

  useEffect(() => {
    let alive = true;
    setListing(listingProp);
    setRelated([]);
    if (businessName.length < 3) return undefined;
    (async () => {
      try {
        const pattern = businessName.replace(/[\\%_]/g, '\\$&');
        const today = new Date().toISOString().slice(0, 10);
        const [dir, more] = await Promise.all([
          listingProp ? Promise.resolve({ data: [listingProp] }) : supabase.from('directory_listings')
            .select('id, slug, name, category, community, location, phone, link, listing_type, notes, image_url')
            .eq('status', 'approved').ilike('name', pattern).limit(1),
          (() => {
            let q = supabase.from('vendor_events')
              .select('id, slug, title, category, event_date_label, event_start_date, expires_after, price_text')
              .eq('status', 'approved').ilike('business_name', pattern)
              .or(`expires_after.is.null,expires_after.gte.${today}`)
              .order('event_start_date', { ascending: true, nullsFirst: false })
              .limit(24);
            if (excludeId) q = q.neq('id', excludeId);
            return q;
          })(),
        ]);
        if (!alive) return;
        const resolved = dir.data && dir.data.length ? dir.data[0] : null;
        setListing(resolved);
        setRelated(more.data || []);
        if (resolved?.id) {
          supabase.rpc('wg_claimed_business_ids').then(({ data: ids }) => {
            if (alive && Array.isArray(ids)) setAlreadyClaimed(ids.includes(resolved.id));
          }).catch(() => {});
        }
      } catch (_) {
        // The panel is extra information; the page works without it.
      }
    })();
    return () => { alive = false; };
  }, [businessName, excludeId, listingProp]);

  if (!listing && related.length === 0 && page !== 'business') return null;

  const siteLink = listing && hasMerchantLink(listing.link)
    ? (trackedLink('directory', listing.id, page === 'business' ? 'business-page' : 'event-details-business') || safeHref(listing.link))
    : null;
  const mapQuery = listing ? [listing.name, listing.location, listing.community].filter(Boolean).join(', ') + (/(georgina|, on)/i.test(`${listing.location} ${listing.community}`) ? '' : ', East Gwillimbury, ON') : '';

  return (
    <section className="mt-8 bg-white rounded-3xl border border-gray-200 shadow-sm p-5 sm:p-8 space-y-6">
      <div className="flex items-start gap-3 sm:gap-4">
        {listing ? (
          <img
            src={listing.image_url || '/placeholder-500x500.jpg'}
            alt={listing.name || businessName}
            onError={(e) => {
              if (!e.currentTarget.src.endsWith('/placeholder-500x500.jpg')) e.currentTarget.src = '/placeholder-500x500.jpg';
            }}
            className="w-14 h-14 sm:w-20 sm:h-20 aspect-square object-cover rounded-xl border border-gray-200 bg-gray-50 shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#00008b] flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-wider text-gray-500">About the business</p>
          <h2 className="text-xl font-black text-gray-900 break-words">
            {listing?.slug && page !== 'business'
              ? <Link to={businessPath(listing)} className="hover:text-[#00008b] hover:underline">{listing.name}</Link>
              : (listing?.name || businessName)}
          </h2>
          {listing?.category && <p className="text-sm text-gray-600">{listing.category}</p>}
        </div>
      </div>

      {listing?.notes && String(listing.notes).trim() && (
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{String(listing.notes).trim()}</p>
      )}

      {listing && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          {(listing.location || listing.community) && (
            <div className="flex items-start gap-2 text-gray-700">
              <MapPin className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{[listing.location, listing.community].filter(Boolean).join(' • ')}</span>
            </div>
          )}
          {mapQuery && (
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`} target="_blank" rel="noopener noreferrer"
              className="flex items-start gap-2 font-bold text-green-800 hover:text-green-900 hover:underline" title="Open this business in Google Maps">
              <MapIcon className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Directions &amp; Reviews</span>
            </a>
          )}
          {listing.phone && (
            <a href={`tel:${String(listing.phone).replace(/[^\d+]/g, '')}`} className="flex items-start gap-2 text-gray-700 hover:text-[#00008b]">
              <Phone className="w-4 h-4 text-[#00008b] shrink-0 mt-0.5" />
              <span>{listing.phone}</span>
            </a>
          )}
          {siteLink ? (
            <a href={siteLink} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 font-bold text-[#00008b] hover:underline">
              <Globe className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Business website</span>
              <ExternalLink className="w-3.5 h-3.5 mt-0.5" />
            </a>
          ) : (
            <div className="flex items-start gap-2 text-gray-500 font-medium">
              <Globe className="w-4 h-4 shrink-0 mt-0.5 text-gray-400" />
              <span>No website provided</span>
            </div>
          )}
        </div>
      )}

      {listing?.slug && page !== 'business' && (
        <Link to={businessPath(listing)} className="inline-flex items-center gap-1 text-sm font-black text-[#00008b] hover:underline">
          See the {listing.name} page <ArrowRight className="w-4 h-4" />
        </Link>
      )}

      {page === 'business' && related.length === 0 && (
        <p className="text-sm text-gray-500">No upcoming events, dining specials or sales right now. Check back soon.</p>
      )}

      {related.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-black uppercase tracking-wider text-gray-800">More from {listing?.name || businessName}</h3>
          {GROUPS.map(({ key, label, Icon }) => {
            const items = related.filter((it) => kindOf(it) === key);
            if (!items.length) return null;
            const isExpanded = !!expandedGroups[key];
            const visibleItems = isExpanded ? items : items.slice(0, 4);
            return (
              <div key={key}>
                <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-gray-500 mb-2">
                  <Icon className="w-3.5 h-3.5" /> {label}
                </p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {visibleItems.map((it) => (
                    <li key={it.id}>
                      <Link to={detailPath(it)} className="block p-3 rounded-xl border border-gray-200 bg-gray-50 hover:border-blue-400 transition">
                        <span className="block text-sm font-bold text-gray-900 break-words">{it.title}</span>
                        <span className="block text-xs text-gray-600 mt-0.5">
                          {[shortDate(it), key !== 'event' ? it.price_text : ''].filter(Boolean).join(' • ')}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {items.length > 4 && (
                  <button
                    type="button"
                    onClick={() => setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }))}
                    className="mt-2.5 text-xs font-bold text-[#00008b] hover:underline"
                  >
                    {isExpanded ? 'Show fewer' : `Show all ${items.length} ${label.toLowerCase()}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {page === 'business' && (
        <div className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-blue-50/50 rounded-2xl p-4 sm:p-5 border border-blue-100">
          <div>
            <p className="text-sm font-black text-gray-900">Own or manage {listing?.name || businessName}?</p>
            <p className="text-xs text-gray-600 mt-0.5">
              Post free events, dining specials, or store sales—or join the Welcome Hamper to reach new East Gwillimbury residents.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {listing?.id && (
              <button
                type="button"
                onClick={() => setClaimOpen(true)}
                className={`px-4 py-2 rounded-xl border text-xs font-black uppercase tracking-wider transition-colors inline-flex items-center gap-1.5 ${
                  alreadyClaimed
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                    : 'bg-white hover:bg-gray-50 text-emerald-800 border-emerald-300'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{alreadyClaimed ? 'Verified Business' : 'Claim This Business'}</span>
              </button>
            )}
            <Link
              to="/submission?tab=events"
              className="px-4 py-2 rounded-xl bg-[#00008b] hover:bg-blue-900 text-white text-xs font-black uppercase tracking-wider transition-colors"
            >
              Post Free Special / Event
            </Link>
            <a
              href="/hamper/apply.html"
              className="px-4 py-2 rounded-xl bg-white hover:bg-gray-50 text-[#00008b] border border-blue-200 text-xs font-black uppercase tracking-wider transition-colors"
            >
              Join Welcome Hamper
            </a>
          </div>
        </div>
      )}
      <ClaimBusinessModal
        business={listing}
        isOpen={claimOpen}
        alreadyClaimed={alreadyClaimed}
        onClose={() => setClaimOpen(false)}
      />
    </section>
  );
}
