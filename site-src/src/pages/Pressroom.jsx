import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';

export default function Pressroom() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    async function loadPressArticles() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('press_articles')
          .select('*')
          .eq('status', 'published')
          .order('published_at', { ascending: false });

        if (error) throw error;
        setArticles(data || []);
      } catch (err) {
        console.error('Error fetching press articles:', err);
      } finally {
        setLoading(false);
      }
    }

    loadPressArticles();
  }, []);

  const filteredArticles = articles.filter(art => {
    const term = searchTerm.toLowerCase().trim();
    return (
      art.title?.toLowerCase().includes(term) ||
      art.business_name?.toLowerCase().includes(term) ||
      art.business_address?.toLowerCase().includes(term) ||
      art.excerpt?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="max-w-[1440px] mx-auto w-full px-4 md:px-10 py-10 flex flex-col gap-10">
      {/* Pressroom Hero Banner */}
      <div className="bg-[#00008b] text-white p-8 md:p-12 rounded-3xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="max-w-2xl">
          <span className="inline-block text-xs uppercase tracking-widest font-black bg-white/10 px-3 py-1 rounded-full text-blue-200 mb-3">
            Official Town Citations &amp; Media
          </span>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-3">
            East Gwillimbury Business Pressroom
          </h1>
          <p className="text-blue-100 text-sm md:text-base leading-relaxed">
            Verified press releases, business milestones, new openings, and local citation directories connecting East Gwillimbury commerce with residents and search engines.
          </p>
        </div>

        <div className="shrink-0 bg-white/10 backdrop-blur-md p-6 rounded-2xl border border-white/20 text-center md:text-left max-w-sm">
          <h2 className="text-sm font-black uppercase tracking-wider mb-1 text-white">Publish a Press Release</h2>
          <p className="text-xs text-blue-200 mb-3">
            Boost your local Google citation authority and reach thousands of East Gwillimbury shoppers.
          </p>
          <a
            href="mailto:contact@welcomeeg.ca?subject=Press%20Release%20Inquiry"
            className="inline-block bg-amber-500 hover:bg-amber-600 text-gray-950 font-black text-xs uppercase tracking-wider px-5 py-2.5 rounded-xl transition-all shadow-md"
          >
            Inquire for Publication
          </a>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-4 md:p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div className="relative w-full sm:w-96">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by business name or topic..."
            className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#00008b]"
          />
        </div>
        <div className="text-xs font-bold text-gray-500 self-end sm:self-center">
          Showing {filteredArticles.length} Published Citation Releases
        </div>
      </div>

      {/* Press Releases Grid */}
      {loading ? (
        <div className="py-20 text-center font-bold text-gray-500">
          Loading press articles...
        </div>
      ) : filteredArticles.length === 0 ? (
        <div className="bg-white rounded-3xl border border-gray-200 p-12 text-center text-gray-600 flex flex-col items-center">
          <h2 className="text-lg font-bold mb-2">No Press Releases Found</h2>
          <p className="text-sm text-gray-500 max-w-md">
            {searchTerm ? 'Try adjusting your search terms.' : 'Press releases for local businesses are currently being curated and published by our editorial team.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredArticles.map((article) => {
            const pubDate = article.published_at
              ? new Date(article.published_at).toLocaleDateString('en-CA', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric'
                })
              : 'Recent';

            return (
              <article
                key={article.id}
                className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow group"
              >
                {/* Image */}
                {article.image_url ? (
                  <div className="h-48 w-full overflow-hidden bg-gray-100">
                    <img
                      src={article.image_url}
                      alt={article.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  </div>
                ) : (
                  <div className="h-32 w-full bg-gradient-to-r from-blue-900 to-[#00008b] flex items-center justify-center p-4">
                    <span className="text-white text-sm font-black uppercase tracking-wider text-center opacity-80">
                      {article.business_name}
                    </span>
                  </div>
                )}

                {/* Body Content */}
                <div className="p-6 flex-1 flex flex-col justify-between gap-4">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full bg-blue-100 text-[#00008b]">
                        {article.business_name}
                      </span>
                      <span className="text-xs text-gray-500 font-semibold">{pubDate}</span>
                    </div>

                    <h2 className="text-lg font-black text-gray-900 line-clamp-2 leading-snug group-hover:text-blue-700 transition-colors">
                      <Link to={`/press/${article.slug}`}>
                        {article.title}
                      </Link>
                    </h2>

                    {article.excerpt && (
                      <p className="text-xs text-gray-600 line-clamp-3 mt-2 leading-relaxed">
                        {article.excerpt}
                      </p>
                    )}
                  </div>

                  {/* NAP Citation Footer */}
                  <div className="pt-4 border-t border-gray-100 text-xs text-gray-500 flex flex-col gap-1">
                    <div className="font-semibold text-gray-700 truncate">
                      {article.business_address}
                    </div>
                    {article.business_phone && (
                      <div className="text-gray-600 font-medium">
                        Tel: {article.business_phone}
                      </div>
                    )}
                    <Link
                      to={`/press/${article.slug}`}
                      className="mt-2 text-xs font-black text-[#00008b] hover:text-blue-700 inline-flex items-center gap-1"
                    >
                      Read Full Release &amp; Citation &rarr;
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
