import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { FRAME, frameWidth, fitCount, sagFor, swayFor, DEFAULT_HOVER_TEXT } from '../utils/heroGallery';

// Home hero "clothesline": white polaroid frames hung on a thin line with sunset-orange pegs,
// one row between the header and the eyebrow text. Photos, hover text, links and order come
// from the home_gallery table (staff/gallery.html); files live in /gallery/ on the web host.
// Click/tap opens the full-size (watermarked) photo in a full-screen viewer.

const HINT_KEY = 'wg_gallery_has_photos'; // remembers that the strip had photos, so space is kept for it (no layout jump)

function readHint() {
  try { return localStorage.getItem(HINT_KEY) === '1'; } catch { return false; }
}
function writeHint(has) {
  try { localStorage.setItem(HINT_KEY, has ? '1' : '0'); } catch { /* storage blocked: fine */ }
}

function useIsPhone() {
  const query = '(max-width: 639px)';
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const on = () => setPhone(mq.matches);
    mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on);
    return () => (mq.removeEventListener ? mq.removeEventListener('change', on) : mq.removeListener(on));
  }, []);
  return phone;
}

const isInternal = (url) => typeof url === 'string' && url.startsWith('/');

function Viewer({ photos, index, onClose, onMove }) {
  const p = photos[index];
  const closeRef = useRef(null);
  const touch = useRef(null);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') onMove(1);
      else if (e.key === 'ArrowLeft') onMove(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
  }, [onClose, onMove]);

  if (!p) return null;
  const text = p.hover_text || DEFAULT_HOVER_TEXT;
  const many = photos.length > 1;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      className="fixed inset-0 z-[70] bg-[#030c14]/[0.97] text-white flex flex-col pt-[calc(env(safe-area-inset-top)+12px)] pb-[calc(env(safe-area-inset-bottom)+16px)] px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onTouchStart={(e) => { touch.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={(e) => {
        const start = touch.current; touch.current = null;
        const end = e.changedTouches[0]?.clientX;
        if (many && start != null && end != null && Math.abs(end - start) > 50) onMove(end < start ? 1 : -1);
      }}
    >
      <div className="flex items-center justify-between text-sm text-lake-200 max-w-6xl w-full mx-auto">
        <span>{many ? `Photo ${index + 1} of ${photos.length}` : ''}</span>
        <button ref={closeRef} type="button" onClick={onClose} className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full bg-white/10 hover:bg-white/20 font-black text-sm">
          <X className="w-4 h-4" aria-hidden="true" /> Close
        </button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center gap-2 sm:gap-4 py-3" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        {many && (
          <button type="button" onClick={() => onMove(-1)} aria-label="Previous photo" className="hidden sm:inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 shrink-0">
            <ChevronLeft className="w-6 h-6" aria-hidden="true" />
          </button>
        )}
        <img src={p.image_url} alt={text} className="max-w-full max-h-full object-contain rounded-md shadow-2xl" />
        {many && (
          <button type="button" onClick={() => onMove(1)} aria-label="Next photo" className="hidden sm:inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 shrink-0">
            <ChevronRight className="w-6 h-6" aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="text-center flex flex-col items-center gap-3 max-w-3xl mx-auto pt-2">
        <p className="font-black text-2xl sm:text-3xl text-white tracking-tight leading-tight">{text}</p>
        {p.link_url && (isInternal(p.link_url) ? (
          <Link to={p.link_url} onClick={onClose} className="inline-flex items-center justify-center gap-2 min-h-[52px] px-7 py-3 rounded-full bg-sun-400 hover:bg-sun-300 text-lake-950 font-black text-lg sm:text-xl shadow-lg transition-transform active:scale-95">
            {p.link_label ? `See ${p.link_label}` : 'See the listing'} &rarr;
          </Link>
        ) : (
          <a href={p.link_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 min-h-[52px] px-7 py-3 rounded-full bg-sun-400 hover:bg-sun-300 text-lake-950 font-black text-lg sm:text-xl shadow-lg transition-transform active:scale-95">
            {p.link_label ? `Visit ${p.link_label}` : 'Visit the website'} &#8599;
          </a>
        ))}
        {many && <p className="text-xs text-lake-300 sm:hidden">Swipe for more photos</p>}
      </div>
    </div>,
    document.body,
  );
}

export default function HeroGallery() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const lowerPath = (pathname || '/').toLowerCase();
  const isHome = lowerPath === '/';

  const [photos, setPhotos] = useState(null); // null = loading
  const [hint] = useState(readHint);
  const phone = useIsPhone();
  const rowRef = useRef(null);
  const [rowWidth, setRowWidth] = useState(0);
  const [tip, setTip] = useState(null); // { text, highlight, sponsored, x, y }
  const [open, setOpen] = useState(-1);
  const openerRef = useRef(null);
  const enteredFullscreen = useRef(false);

  useEffect(() => {
    let alive = true;
    const nowMs = Date.now();
    Promise.resolve(
      supabase
        .from('home_gallery')
        .select('id, image_url, thumb_url, hover_text, highlight, link_url, link_label, sort_order, created_at, active, starts_at, ends_at, is_sponsored, is_complimentary, sponsor_name')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
    )
      .then(({ data, error }) => {
        if (!alive) return;
        const list = !error && Array.isArray(data)
          ? data.filter((p) => {
              if (!p || !p.thumb_url || !p.image_url) return false;
              if (p.active === false) return false;
              if (p.starts_at && Date.parse(p.starts_at) > nowMs) return false;
              if (p.ends_at && Date.parse(p.ends_at) < nowMs) return false;
              return true;
            })
          : [];
        setPhotos(list);
        writeHint(list.length > 0);
      })
      .catch(() => { if (alive) setPhotos([]); });
    return () => { alive = false; };
  }, []);

  useLayoutEffect(() => {
    const el = rowRef.current;
    if (!el) return undefined;
    const measure = () => setRowWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [photos]);

  useEffect(() => {
    if (!tip) return undefined;
    const hide = () => setTip(null);
    window.addEventListener('scroll', hide, { passive: true });
    return () => window.removeEventListener('scroll', hide);
  }, [tip]);

  const move = useCallback((d) => {
    setOpen((i) => (photos && photos.length ? (i + d + photos.length) % photos.length : -1));
  }, [photos]);

  const close = useCallback(() => {
    setOpen(-1);
    if (enteredFullscreen.current && document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    enteredFullscreen.current = false;
    openerRef.current?.focus();
  }, []);

  // Hide on admin/staff/login routes
  if (lowerPath.startsWith('/admin') || lowerPath.startsWith('/staff') || lowerPath === '/login') {
    return null;
  }

  const size = phone ? FRAME.mobile : FRAME.desktop;
  const fw = frameWidth(size);
  const adScale = 1.25;
  const adHeight = Math.round(size.height * adScale);
  const lineRoom = phone ? 10 : 14; // space above frames for the line and pegs
  const hasAnySponsored = Boolean(photos && photos.some((p) => p.is_sponsored || p.is_complimentary || p.highlight));
  const maxItemHeight = hasAnySponsored ? adHeight + 22 : size.height;
  const stripHeight = maxItemHeight + lineRoom + size.sag + 8;

  // Nothing to show: keep the space only while loading, and only if the last visit had photos.
  if (photos && photos.length === 0) return null;
  if (!photos && !hint) return null;

  const cap = photos ? fitCount(rowWidth, fw, size.minGap, photos.length) : 0;
  const needsSlide = Boolean(photos && rowWidth > 0 && photos.length > cap);
  const trackItems = photos ? (needsSlide ? [...photos, ...photos] : photos) : [];

  const showTip = (e, p) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({
      text: p.hover_text || p.sponsor_name || DEFAULT_HOVER_TEXT,
      highlight: !!p.highlight,
      sponsored: Boolean(p.is_sponsored || p.is_complimentary),
      x: r.left + r.width / 2,
      y: r.bottom + 8,
    });
  };

  const handleItemClick = (e, p, origIndex) => {
    openerRef.current = e.currentTarget;
    setTip(null);

    if (p.is_sponsored || p.is_complimentary) {
      Promise.resolve(supabase.rpc('wg_record_gallery_ad_event', { p_photo_id: p.id, p_event_type: 'click' })).catch(() => {});
      const dest = (p.link_url || '').trim();
      if (dest.startsWith('/')) {
        navigate(dest);
        return;
      }
      if (/^https?:\/\//i.test(dest)) {
        window.open(dest, '_blank', 'noopener,noreferrer');
        return;
      }
    }

    setOpen(origIndex);
    const root = document.documentElement;
    if (!document.fullscreenElement && root.requestFullscreen && !phone) {
      root.requestFullscreen().then(() => { enteredFullscreen.current = true; }).catch(() => {});
    }
  };

  const wrapperClass = 'relative z-20 w-full bg-gradient-to-r from-[#041e30] via-[#0b314d] to-[#041e30] border-b border-white/10 overflow-x-clip';
  const innerWrapClass = 'max-w-[1440px] w-full mx-auto px-4 md:px-12 pt-3 pb-2';

  return (
    <div className={wrapperClass}>
      <div className={innerWrapClass}>
        <div className="mb-1 flex items-center justify-between">
          <Link
            to="/advertise#photo-gallery-ads"
            className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.14em] text-sun-300/90 hover:text-white underline-offset-4 hover:underline transition-colors"
          >
            Sponsored &rarr;
          </Link>
        </div>
        <div ref={rowRef} className="relative overflow-x-clip" style={{ height: stripHeight }}>
          {photos && photos.length > 0 && (
            <>
              {/* The clothesline */}
              <svg aria-hidden="true" className="absolute -left-2 -right-2 top-0 pointer-events-none overflow-visible" style={{ height: lineRoom + size.sag + 2, width: 'calc(100% + 16px)' }} viewBox={`0 0 100 ${lineRoom + size.sag + 2}`} preserveAspectRatio="none">
                <path d={`M0 2 Q 50 ${2 + size.sag * 2} 100 2`} fill="none" stroke="rgba(255,226,154,0.55)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
              </svg>
              <ul
                className={`absolute top-0 list-none m-0 p-0 ${needsSlide ? 'wg-gallery-track is-sliding' : 'inset-x-0 flex justify-between items-start'}`}
                style={{
                  top: lineRoom,
                  gap: needsSlide ? `${Math.max(12, size.minGap)}px` : undefined,
                  '--wg-slide-duration': `${Math.max(20, photos.length * 4)}s`,
                }}
                aria-label="Community photos and featured sponsors"
              >
                {trackItems.map((p, idx) => {
                  const origIndex = idx % photos.length;
                  const sag = sagFor(origIndex, photos.length, size.sag);
                  const sway = swayFor(origIndex);
                  const isAd = Boolean(p.is_sponsored || p.is_complimentary);
                  const isLarge = Boolean(isAd || p.highlight);
                  const itemW = isLarge ? Math.round(fw * adScale) : fw;
                  const itemH = isLarge ? adHeight : size.height;
                  const pad = isLarge ? Math.round(size.pad * adScale) : size.pad;
                  const chin = isLarge ? Math.round(size.chin * adScale) : size.chin;

                  return (
                    <li
                      key={`${p.id}-${idx}`}
                      className={`flex-none ${isAd ? 'z-10' : ''}`}
                      style={{ transform: `translateY(${sag}px)` }}
                    >
                      <div className={isAd ? 'wg-pola-ad p-[7px] relative' : 'relative'}>
                        <button
                          type="button"
                          className={`wg-pola group relative block bg-[#FBFAF6] rounded-[2px] ${isAd ? 'cursor-pointer' : 'cursor-zoom-in'} ${p.highlight ? 'wg-pola-hl' : ''}`}
                          style={{ width: itemW, height: itemH, padding: `${pad}px ${pad}px ${chin}px`, '--sway': `${sway}deg` }}
                          aria-label={`${isAd ? 'Sponsored: ' : 'Open photo: '}${p.hover_text || p.sponsor_name || DEFAULT_HOVER_TEXT}`}
                          onMouseEnter={(e) => showTip(e, p)}
                          onMouseLeave={() => setTip(null)}
                          onFocus={(e) => showTip(e, p)}
                          onBlur={() => setTip(null)}
                          onClick={(e) => handleItemClick(e, p, origIndex)}
                        >
                          <span aria-hidden="true" className="wg-peg" />
                          <img
                            src={p.thumb_url}
                            alt=""
                            width={itemW - 2 * pad}
                            height={itemH - pad - chin}
                            style={{ width: itemW - 2 * pad, height: itemH - pad - chin }}
                            decoding="async"
                            className="block object-cover rounded-[1px]"
                          />
                          {isAd && (
                            <span className="absolute bottom-[2px] left-1/2 -translate-x-1/2 bg-[#00008b] text-[#fbbf24] text-[8px] font-black uppercase tracking-wider px-1.5 py-[1px] rounded-sm whitespace-nowrap leading-none">
                              Sponsored
                            </span>
                          )}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>

      {tip && createPortal(
        <div
          role="tooltip"
          className="fixed z-[65] pointer-events-none max-w-[260px] -translate-x-1/2 bg-white text-lake-950 font-bold leading-snug px-3 py-2 rounded-lg shadow-xl"
          style={{ left: Math.max(128, Math.min(tip.x, window.innerWidth - 128)), top: tip.y }}
        >
          <span className="block text-[15px] font-extrabold text-lake-950">{tip.text}</span>
          {tip.sponsored && <span className="block mt-0.5 text-[10px] font-black uppercase tracking-wider text-[#00008b]">Sponsored Ad</span>}
          {!tip.sponsored && tip.highlight && <span className="block mt-0.5 text-[10px] font-black uppercase tracking-wider text-coral-600">Local spotlight</span>}
        </div>,
        document.body,
      )}

      {open >= 0 && photos && <Viewer photos={photos} index={open} onClose={close} onMove={move} />}
    </div>
  );
}
