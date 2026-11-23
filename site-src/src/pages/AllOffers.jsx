import React, { useState, useEffect } from 'react';
import { matchesQuery } from '../utils/fuzzySearch.js';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { getAlphabeticalSortName } from '../services/discoveryService';
import {
  Search,
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
  ArrowUpDown,
  Gift,
  Building,
  UserCheck,
  MapPin,
  ExternalLink
} from 'lucide-react';

const CATEGORIES = [
  'All', 
  'Dining', 
  'Retail', 
  'Home Services', 
  'Health & Wellness', 
  'Professional Services',
  'Automotive',
  'Marine & Watersports',
  'Farms & Markets'
];

export default function AllOffers() {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sortOrder, setSortOrder] = useState('a-z'); // 'a-z', 'z-a', 'newest'
  const [audienceFilter, setAudienceFilter] = useState('all'); // 'all', 'b2c', 'b2b'

  useEffect(() => {
    async function fetchAllDeals() {
      try {
        const { data, error } = await supabase
          .from('partners')
          .select('*')
          .in('status', ['Approved', 'is_example']);

        if (error) throw error;

        const bgColors = [
          'bg-rose-600',
          'bg-blue-600',
          'bg-emerald-600',
          'bg-purple-600',
          'bg-amber-600',
          'bg-cyan-600',
          'bg-indigo-600'
        ];

        const formatted = (data || []).map((row, index) => ({
          id: row.id,
          business: row.business_name || 'Local Partner',
          title: row.offer_details || row.offer_b2c || row.offer_b2b || 'Welcome Perk',
          offer_b2c: row.offer_b2c || '',
          offer_b2b: row.offer_b2b || '',
          category: row.category || 'Retail',
          location: row.location || 'East Gwillimbury, ON',
          color: row.color || bgColors[index % bgColors.length],
          status: row.status,
          logo_url: row.logo_url,
          target_audience: row.target_audience || 'Both (B2C & B2B)',
          created_at: row.created_at || ''
        }));

        setDeals(formatted);
      } catch (err) {
        console.error('Error fetching all deals:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchAllDeals();
  }, []);

  // Filter deals
  const filteredDeals = deals.filter((deal) => {
    const matchesSearch = !searchTerm.trim() || matchesQuery(`${deal.business || ''} ${deal.title || ''} ${deal.location || ''}`, searchTerm);

    const matchesCategory =
      selectedCategory === 'All' || deal.category === selectedCategory;

    const matchesAudience =
      audienceFilter === 'all' ||
      (audienceFilter === 'b2c' && (deal.offer_b2c || deal.target_audience?.includes('Resident') || deal.target_audience?.includes('Both'))) ||
      (audienceFilter === 'b2b' && (deal.offer_b2b || deal.target_audience?.includes('Business') || deal.target_audience?.includes('Both')));

    return matchesSearch && matchesCategory && matchesAudience;
  });

  // Sort deals
  const sortedDeals = [...filteredDeals].sort((a, b) => {
    if (sortOrder === 'a-z') {
      const nameA = getAlphabeticalSortName(a.business);
      const nameB = getAlphabeticalSortName(b.business);
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    }
    if (sortOrder === 'z-a') {
      const nameA = getAlphabeticalSortName(a.business);
      const nameB = getAlphabeticalSortName(b.business);
      return nameB.localeCompare(nameA, undefined, { sensitivity: 'base' });
    }
    if (sortOrder === 'newest') {
      return (new Date(b.created_at || 0)) - (new Date(a.created_at || 0));
    }
    return 0;
  });

  return (
    <div className="max-w-[1440px] mx-auto w-full px-4 md:px-10 py-10 flex flex-col gap-8">
            {/* Top Banner Header — Design B East Gwillimbury Atmospheric Sunset */}
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
            <span>🎁 Welcome Offers Catalog &bull; Business Directory</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight font-display text-white leading-[1.1] mb-4">
            All East Gwillimbury Welcome Offers
          </h1>

          <p className="text-blue-100 text-sm sm:text-base md:text-lg font-medium leading-relaxed max-w-2xl mb-8">
            Browse our complete directory of local partner businesses welcoming newcomers and commercial residents across East Gwillimbury.
          </p>

          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <Link
              to="/sales"
              className="inline-flex items-center gap-2 min-h-[46px] px-6 rounded-full bg-coral-600 hover:bg-sun-400 text-white hover:text-lake-950 font-black text-xs sm:text-sm uppercase tracking-wider shadow-pop-sm hover:-translate-y-0.5 transition-all"
            >
              <span>Explore Weekly Store Sales</span>
              <span>&rarr;</span>
            </Link>
            <Link
              to="/directory"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 text-xs font-bold text-blue-100 hover:bg-white/20 transition-all"
            >
              <span>Full Business Directory &rarr;</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Control Bar: Categories, Search & Sorting */}
      <div className="bg-white p-6 rounded-3xl border border-lake-100 shadow-sm flex flex-col gap-4">
        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-lake-800 text-white shadow-pop-sm'
                  : 'bg-lake-50 text-lake-900 border border-lake-200/60 hover:bg-lake-100'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search, Audience Filter & A-Z Sort Dropdown */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between pt-2 border-t border-gray-100">
          {/* Keyword Search */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search business or perk..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-gray-200 focus:border-lake-800 focus:outline-none text-xs font-semibold text-gray-900"
            />
          </div>

          {/* Filters & Sorting */}
          <div className="flex items-center gap-3 w-full md:w-auto flex-wrap justify-end">
            {/* Audience Segment Tabs */}
            <div className="flex items-center bg-gray-100 p-1 rounded-xl text-xs font-bold text-gray-700">
              <button
                type="button"
                onClick={() => setAudienceFilter('all')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  audienceFilter === 'all' ? 'bg-white shadow-sm font-black text-lake-800' : 'hover:text-gray-900'
                }`}
              >
                All Audiences
              </button>
              <button
                type="button"
                onClick={() => setAudienceFilter('b2c')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  audienceFilter === 'b2c' ? 'bg-white shadow-sm font-black text-emerald-800' : 'hover:text-gray-900'
                }`}
              >
                Residents (B2C)
              </button>
              <button
                type="button"
                onClick={() => setAudienceFilter('b2b')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  audienceFilter === 'b2b' ? 'bg-white shadow-sm font-black text-purple-800' : 'hover:text-gray-900'
                }`}
              >
                Businesses (B2B)
              </button>
            </div>

            {/* Sort Selector */}
            <div className="flex items-center gap-2 bg-gray-100 px-3 py-1.5 rounded-xl border border-gray-200">
              <ArrowUpDown className="w-3.5 h-3.5 text-gray-500" />
              <label htmlFor="sortSelect" className="text-xs font-bold text-gray-600">Sort:</label>
              <select
                id="sortSelect"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="bg-transparent text-xs font-black text-gray-900 focus:outline-none cursor-pointer"
              >
                <option value="a-z">A to Z (Business Name)</option>
                <option value="z-a">Z to A (Business Name)</option>
                <option value="newest">Newest First</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Directory Count and Header */}
      <div className="flex items-center justify-between px-2">
        <p className="text-sm font-bold text-gray-500">
          Showing <span className="font-black text-gray-900">{sortedDeals.length}</span> welcome offers &amp; partner merchants
        </p>
        {(searchTerm || selectedCategory !== 'All' || audienceFilter !== 'all') && (
          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              setSelectedCategory('All');
              setAudienceFilter('all');
            }}
            className="text-xs font-black text-[#00008b] hover:underline"
          >
            Clear all filters
          </button>
        )}
      </div>

      {/* Offers Grid */}
      {loading ? (
        <div className="py-24 text-center">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-[#00008b] rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-bold text-gray-500">Loading business directory...</p>
        </div>
      ) : sortedDeals.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {sortedDeals.map((deal) => (
            <div
              key={deal.id}
              className={`rounded-3xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 flex flex-col justify-between ${deal.color} border-4 border-white text-white p-7`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <span className="text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm border border-white/30">
                    {deal.category}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-black/20 backdrop-blur-sm border border-white/20">
                    {deal.target_audience}
                  </span>
                </div>

                <h3 className="text-2xl font-black tracking-tight leading-snug mb-1 drop-shadow-sm">
                  {deal.business}
                </h3>
                <div className="mb-4">
                  {deal.location ? (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(deal.location + (deal.location.toLowerCase().includes('georgina') ? '' : ', East Gwillimbury, ON'))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-bold text-white/90 hover:text-amber-300 inline-flex items-center gap-1 group/map underline"
                      title="Open in Google Maps"
                    >
                      <MapPin className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                      <span>{deal.location}</span>
                      <ExternalLink className="w-3 h-3 opacity-70 group-hover/map:opacity-100 shrink-0" />
                    </a>
                  ) : (
                    <p className="text-xs font-semibold text-white/80">East Gwillimbury, ON</p>
                  )}
                </div>

                {/* Offer Details */}
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 mb-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Gift className="w-4 h-4 text-amber-300 shrink-0" />
                    <span className="text-xs uppercase font-black tracking-wider text-amber-200">
                      Welcome Perk
                    </span>
                  </div>
                  <p className="text-sm font-bold leading-snug text-white">
                    {deal.title}
                  </p>

                  {/* Dual Perks Display if available */}
                  {deal.offer_b2c && deal.offer_b2b && (
                    <div className="pt-2 border-t border-white/10 space-y-1 text-xs">
                      <p className="text-emerald-200"><strong>Resident:</strong> {deal.offer_b2c}</p>
                      <p className="text-purple-200"><strong>Business:</strong> {deal.offer_b2b}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-white/20">
                <Link
                  to="/events"
                  className="w-full text-center bg-white text-[#00008b] hover:bg-amber-300 hover:text-amber-950 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-md block"
                >
                  View Local Events &rarr;
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-24 bg-white rounded-3xl border-2 border-dashed border-gray-200 p-8">
          <p className="text-2xl font-black text-gray-800 mb-2">No offers match your criteria.</p>
          <p className="text-xs text-gray-500 mb-6">Try clearing your filters or searching for another keyword.</p>
          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              setSelectedCategory('All');
              setAudienceFilter('all');
            }}
            className="bg-[#00008b] text-white px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider shadow-md"
          >
            Reset Filters
          </button>
        </div>
      )}
    </div>
  );
}
