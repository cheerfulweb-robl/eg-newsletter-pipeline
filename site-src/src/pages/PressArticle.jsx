import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const ALLOWED_ARTICLE_TAGS = new Set([
  'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'H2', 'H3', 'H4',
  'UL', 'OL', 'LI', 'BLOCKQUOTE', 'A', 'HR', 'SPAN', 'DIV',
  'IMG', 'FIGURE', 'FIGCAPTION', 'HEADER', 'FOOTER'
]);

function sanitizeArticleHtml(rawHtml) {
  if (!rawHtml || typeof rawHtml !== 'string') return '';
  if (typeof DOMParser === 'undefined') return '';
  const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
  const cleanNode = (node) => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === 1) {
        if (!ALLOWED_ARTICLE_TAGS.has(child.tagName)) {
          child.remove();
          continue;
        }
        for (const attr of Array.from(child.attributes)) {
          const name = attr.name.toLowerCase();
          if (child.tagName === 'A' && name === 'href') {
            const val = attr.value.trim();
            if (!/^(https?:\/\/|\/[^/])/i.test(val)) {
              child.removeAttribute(attr.name);
            }
          } else if (child.tagName === 'A' && (name === 'target' || name === 'rel')) {
            // allow
          } else if (child.tagName === 'IMG' && name === 'src') {
            const val = attr.value.trim();
            if (!/^(https?:\/\/|\/[^/])/i.test(val)) {
              child.removeAttribute(attr.name);
            }
          } else if (child.tagName === 'IMG' && (name === 'alt' || name === 'loading')) {
            // allow
          } else {
            child.removeAttribute(attr.name);
          }
        }
        if (child.tagName === 'A') {
          child.setAttribute('rel', 'noopener noreferrer');
        }
        if (child.tagName === 'IMG') {
          if (!child.getAttribute('src')) {
            child.remove();
            continue;
          }
          child.setAttribute('loading', 'lazy');
        }
        cleanNode(child);
      } else if (child.nodeType !== 3) {
        child.remove();
      }
    }
  };
  cleanNode(doc.body);
  return doc.body.innerHTML;
}

export default function PressArticle() {
  const { slug } = useParams();
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function loadArticle() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('press_articles')
          .select('*')
          .eq('slug', slug)
          .eq('status', 'published')
          .single();

        if (error || !data) {
          setNotFound(true);
        } else {
          setArticle(data);
          // Set page title for SEO
          document.title = `${data.title} | Welcome East Gwillimbury Pressroom`;
        }
      } catch (err) {
        console.error('Error fetching press article:', err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }

    if (slug) {
      loadArticle();
    }
  }, [slug]);

  if (loading) {
    return (
      <div className="max-w-[1440px] mx-auto px-4 py-20 text-center font-bold text-gray-500">
        Loading press release...
      </div>
    );
  }

  if (notFound || !article) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-black text-gray-900 mb-2">Press Release Not Found</h1>
        <p className="text-sm text-gray-600 mb-6">
          The requested press release could not be found or has not been published yet.
        </p>
        <Link
          to="/press"
          className="inline-block bg-[#00008b] text-white font-bold text-sm px-6 py-2.5 rounded-xl hover:bg-blue-900 transition-colors"
        >
          &larr; Back to Pressroom
        </Link>
      </div>
    );
  }

  const pubDate = article.published_at
    ? new Date(article.published_at).toLocaleDateString('en-CA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    : 'Recent Publication';

  // Construct JSON-LD Schema for Local Citation SEO (NewsArticle + ImageObject + LocalBusiness)
  const rawHero = (article.image_url || "").trim();
  const heroImageUrl = (!rawHero || /default-welcome-georgina-og\.jpg|welcome-georgina-og\.jpg/i.test(rawHero))
    ? "https://welcomeeg.ca/press-release-og.jpg"
    : rawHero;
  const heroImageObject = {
    "@type": "ImageObject",
    "url": heroImageUrl,
    "contentUrl": heroImageUrl,
    "caption": article.image_caption || `${article.business_name} — ${article.title}`,
    "description": article.image_alt || article.title
  };
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": article.title,
    "description": article.summary || undefined,
    "image": [heroImageObject],
    "datePublished": article.published_at,
    "dateModified": article.updated_at || article.published_at,
    "author": {
      "@type": "Organization",
      "name": "Welcome East Gwillimbury Editorial Desk",
      "url": "https://welcomeeg.ca"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Welcome East Gwillimbury",
      "logo": {
        "@type": "ImageObject",
        "url": "https://welcomeeg.ca/welcome-eg-logo.png"
      }
    },
    "about": {
      "@type": "LocalBusiness",
      "name": article.business_name,
      "image": heroImageObject,
      "address": {
        "@type": "PostalAddress",
        "streetAddress": article.business_address,
        "addressLocality": "East Gwillimbury",
        "addressRegion": "ON",
        "addressCountry": "CA"
      },
      "telephone": article.business_phone,
      "url": article.business_website || undefined
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto w-full px-4 md:px-6 py-10 flex flex-col gap-8">
      {/* Schema.org Script Tag */}
      <script type="application/ld+json">
        {JSON.stringify(jsonLd).replace(/</g, '\\u003c')}
      </script>

      {/* Breadcrumbs */}
      <nav className="text-xs font-bold text-gray-500 flex items-center gap-2">
        <Link to="/" className="hover:text-blue-700">Home</Link>
        <span>/</span>
        <Link to="/press" className="hover:text-blue-700">Pressroom</Link>
        <span>/</span>
        <span className="text-gray-900 truncate max-w-xs">{article.business_name}</span>
      </nav>

      {/* Main Release Header */}
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-blue-100 text-[#00008b]">
            Verified Local Citation
          </span>
          <span className="text-xs font-bold text-gray-500">
            Published on {pubDate}
          </span>
          <span className="text-xs font-semibold text-gray-400">
            • East Gwillimbury, Ontario
          </span>
        </div>

        <h1 className="text-2xl sm:text-4xl font-black text-gray-900 leading-tight">
          {article.title}
        </h1>

        <p className="text-sm font-semibold text-gray-600">
          Source: <strong className="text-gray-900">{article.business_name}</strong> via Welcome East Gwillimbury Press Bureau
        </p>
      </header>

      {/* Featured Hero Image */}
      {article.image_url && (
        <figure className="w-full overflow-hidden rounded-3xl bg-gray-100 shadow-sm border border-gray-200">
          <img
            src={article.image_url}
            alt={article.image_alt || article.title}
            className="w-full max-h-[460px] object-cover"
          />
          {article.image_caption && (
            <figcaption className="px-5 py-2.5 text-xs font-medium text-gray-600 bg-white border-t border-gray-100">
              {article.image_caption}
            </figcaption>
          )}
        </figure>
      )}

      {/* Article Body Content */}
      <main className="bg-white p-6 sm:p-10 rounded-3xl border border-gray-200 shadow-sm">
        <div
          className="prose prose-blue max-w-none text-gray-800 leading-relaxed text-base [&_h2]:text-xl [&_h2]:font-black [&_h2]:text-gray-900 [&_h2]:mt-6 [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-black [&_h3]:text-gray-800 [&_h3]:mt-4 [&_h3]:mb-2 [&_p]:mb-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-4 [&_li]:mb-1 [&_strong]:font-bold [&_blockquote]:border-l-4 [&_blockquote]:border-[#00008b] [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-700 [&_figure]:my-6 [&_figure]:rounded-2xl [&_figure]:overflow-hidden [&_figure]:border [&_figure]:border-gray-200 [&_img]:w-full [&_img]:max-h-[460px] [&_img]:object-cover [&_figcaption]:px-4 [&_figcaption]:py-2 [&_figcaption]:text-xs [&_figcaption]:text-gray-600 [&_figcaption]:bg-gray-50 [&_header]:mb-6 [&_header]:pb-4 [&_header]:border-b [&_header]:border-gray-200 [&_footer]:mt-8 [&_footer]:pt-4 [&_footer]:border-t [&_footer]:border-gray-200 [&_footer]:text-sm [&_footer]:text-gray-600"
          dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(article.content) }}
        />
      </main>

      {/* Official Business NAP Local Citation Block */}
      <section className="bg-gradient-to-br from-blue-50 to-indigo-50/40 p-6 sm:p-8 rounded-3xl border-2 border-blue-200 shadow-sm flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-blue-200/80 pb-3">
          <h2 className="text-sm font-black uppercase tracking-wider text-[#00008b]">
            Official Business Citation Details (NAP)
          </h2>
          <span className="text-[11px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
            Verified Entity
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Business Name</div>
            <div className="text-base font-black text-gray-900 mt-0.5">{article.business_name}</div>
          </div>

          <div>
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Telephone</div>
            <div className="text-base font-black text-gray-900 mt-0.5">
              {article.business_phone ? (
                <a href={`tel:${article.business_phone}`} className="text-blue-700 hover:underline">
                  {article.business_phone}
                </a>
              ) : (
                'Available on file'
              )}
            </div>
          </div>

          <div className="sm:col-span-2">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Physical Address</div>
            <div className="text-sm font-semibold text-gray-900 mt-0.5">
              {article.business_address}
            </div>
            {article.business_address && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(article.business_name + ' ' + article.business_address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-bold text-blue-700 hover:underline inline-block mt-1"
              >
                Directions &amp; Reviews &rarr;
              </a>
            )}
          </div>

          {article.business_website && !/^\s*(javascript|data|vbscript):/i.test(article.business_website) && (
            <div className="sm:col-span-2">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Official Website</div>
              <a
                href={/^https?:\/\//i.test(article.business_website) ? article.business_website : `https://${article.business_website.replace(/^\/+/, '')}`}
                target="_blank"
                rel="noopener noreferrer external"
                className="text-sm font-bold text-blue-700 hover:underline inline-block mt-0.5 break-all"
              >
                {article.business_website} &rarr;
              </a>
            </div>
          )}
        </div>
      </section>

      {/* Back to Pressroom Link */}
      <div className="pt-2 pb-6">
        <Link
          to="/press"
          className="text-xs font-black uppercase tracking-wider text-[#00008b] hover:text-blue-700 inline-flex items-center gap-1"
        >
          &larr; Back to All Press Releases
        </Link>
      </div>
    </div>
  );
}
