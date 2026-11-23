import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Calendar as CalendarIcon, Sparkles, Mail, Plus } from 'lucide-react';

/**
 * Sticky mobile bottom navigation dock shown on all public pages (hidden on desktop and admin/staff routes).
 */
export default function MobileBottomNav() {
  const { pathname } = useLocation();
  const lower = (pathname || '').toLowerCase();
  const isHidden = lower.startsWith('/admin') || lower.startsWith('/staff');

  useEffect(() => {
    if (isHidden) {
      document.documentElement.classList.remove('wg-has-bottom-bar');
      return undefined;
    }
    document.documentElement.classList.add('wg-has-bottom-bar');
    return () => document.documentElement.classList.remove('wg-has-bottom-bar');
  }, [isHidden]);

  if (isHidden) {
    return null;
  }

  return (
    <nav
      aria-label="Quick links"
      className="fixed bottom-0 inset-x-0 bg-lake-950 text-white border-t-4 border-coral-500 z-40 px-2 pb-[env(safe-area-inset-bottom)] flex items-stretch justify-around lg:hidden"
    >
      <Link
        to="/events"
        className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px] ${
          lower.startsWith('/events') || lower === '/calendar'
            ? 'text-sun-300'
            : 'text-lake-100 hover:text-sun-300'
        }`}
      >
        <CalendarIcon className="w-5 h-5" aria-hidden="true" />
        <span className="text-[11px] font-black uppercase tracking-wider">Events</span>
      </Link>
      <Link
        to="/this-weekend"
        className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px] ${
          lower === '/this-weekend' || lower === '/weekend'
            ? 'text-sun-300'
            : 'text-lake-100 hover:text-sun-300'
        }`}
      >
        <Sparkles className="w-5 h-5 text-sun-300" aria-hidden="true" />
        <span className="text-[11px] font-black uppercase tracking-wider">Weekend</span>
      </Link>
      <Link
        to="/subscribe"
        className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px] ${
          lower === '/subscribe'
            ? 'text-sun-300'
            : 'text-lake-100 hover:text-sun-300'
        }`}
      >
        <Mail className="w-5 h-5 text-coral-300" aria-hidden="true" />
        <span className="text-[11px] font-black uppercase tracking-wider">Newsletter</span>
      </Link>
      <Link
        to="/submission"
        className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px] text-white"
      >
        <span className="w-7 h-7 rounded-full bg-coral-600 text-white flex items-center justify-center">
          <Plus className="w-4 h-4" aria-hidden="true" />
        </span>
        <span className="text-[11px] font-black uppercase tracking-wider">Submit</span>
      </Link>
    </nav>
  );
}
