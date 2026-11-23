import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../supabaseClient';
import BusinessPanel from '../components/BusinessPanel';
import { SomethingChangedButton } from '../components/SomethingChangedModal';
import { isUuid, slugOrAliasFilter } from '../utils/links';

// Business page (v61): /businesses/<name>
// Directory details (address, Google Map, phone, click-tracked website) and the
// business's upcoming events, dining specials and sales.

export default function BusinessPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [listing, setListing] = useState(null);
  const [state, setState] = useState('loading'); // loading | ok | missing

  useEffect(() => {
    let alive = true;
    setState('loading');
    (async () => {
      let q = supabase.from('directory_listings')
        .select('id, slug, name, category, community, location, phone, link, listing_type, notes, image_url')
        .eq('status', 'approved');
      q = isUuid(slug) ? q.eq('id', slug) : q.or(slugOrAliasFilter(slug));
      const { data } = await q.limit(1);
      if (!alive) return;
      const row = data && data[0];
      if (!row) { setState('missing'); return; }
      if (row.slug && row.slug !== slug) { navigate(`/businesses/${row.slug}`, { replace: true }); return; }
      setListing(row);
      setState('ok');
      document.title = `${row.name} | Welcome East Gwillimbury`;
    })();
    return () => { alive = false; };
  }, [slug, navigate]);

  return (
    <div className="max-w-[1440px] mx-auto w-full px-4 md:px-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <Link to="/directory" className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-[#00008b]">
          <ArrowLeft className="w-3.5 h-3.5" /> All businesses
        </Link>
        {state === 'ok' && listing && (
          <SomethingChangedButton
            itemTitle={listing.name}
            businessName={listing.name}
            category="business"
          />
        )}
      </div>

      {state === 'loading' && <p className="text-sm text-gray-500">Loading&hellip;</p>}

      {state === 'missing' && (
        <div className="bg-white rounded-3xl border border-gray-200 p-8 text-center">
          <h1 className="text-xl font-black text-gray-900">Business not found</h1>
          <p className="text-sm text-gray-600 mt-1">It may have moved or been removed from the directory.</p>
          <Link to="/directory" className="inline-block mt-3 text-sm font-black text-[#00008b] hover:underline">Browse all businesses &rarr;</Link>
        </div>
      )}

      {state === 'ok' && listing && (
        <>
          <script type="application/ld+json">
            {JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'LocalBusiness',
              name: listing.name,
              url: `https://welcomeeg.ca/businesses/${listing.slug || slug}`,
              sameAs: listing.link && !/^https?:\/\/(www\.)?welcomeeg\.ca(\/|$)/i.test(listing.link) ? listing.link : undefined,
              telephone: listing.phone || undefined,
              address: {
                '@type': 'PostalAddress',
                streetAddress: listing.location || `${listing.community || 'East Gwillimbury'}, ON`,
                addressLocality: listing.community || 'East Gwillimbury',
                addressRegion: 'ON',
                addressCountry: 'CA',
              },
            })}
          </script>
          <p className="text-[11px] font-black uppercase tracking-wider text-[#00008b]">{listing.category || 'Local business'}</p>
          <h1 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight break-words">{listing.name}</h1>
          {listing.community && <p className="text-sm text-gray-600 mt-1">{listing.community}</p>}
          <BusinessPanel listing={listing} page="business" />
        </>
      )}
    </div>
  );
}
