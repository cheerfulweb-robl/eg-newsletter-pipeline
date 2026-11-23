import React, { useEffect } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Calendar, Store, ArrowLeft } from 'lucide-react';
import SubmitEvent from './SubmitEvent.jsx';
import SubmitSale from './SubmitSale.jsx';
import SubmitDining from './SubmitDining.jsx';

export default function MultiSubmission() {
  const location = useLocation();
  const params = useParams();
  const rawTab = String(params.tab || new URLSearchParams(location.search).get('tab') || 'events').toLowerCase();
  const tab = rawTab.startsWith('sale') ? 'sales' : rawTab.startsWith('dining') || rawTab.startsWith('restaurant') ? 'dining' : 'events';
  const tabLabel = tab === 'sales' ? 'Sales' : tab === 'dining' ? 'Dining' : 'Event';

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  }, [tab]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Sticky Top Event Submission Bar */}
      <div className="sticky top-[45px] md:top-[50px] z-30 bg-white/95 backdrop-blur-md border-b border-gray-200 shadow-xs">
        <div className="max-w-[1440px] w-full mx-auto px-4 md:px-8 py-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Left: Breadcrumbs & Header Title */}
            <div className="flex items-center gap-2 text-xs font-bold text-gray-500 w-full sm:w-auto">
              <Link to="/" className="hover:text-[#00008b] flex items-center gap-1">
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Home</span>
              </Link>
              <span>/</span>
              <span className="text-gray-900 font-extrabold uppercase tracking-wide">{tabLabel} Submission</span>
            </div>

            {/* Right: Admin / Event Hub Shortcut */}
            <div className="w-full sm:w-auto flex justify-end">
              <a
                href="/my-submissions"
                className="inline-flex items-center gap-1.5 text-xs font-black text-[#00008b] hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-xl transition-all shadow-2xs"
              >
                <Store className="w-3.5 h-3.5 text-blue-700" />
                <span>My Submissions</span>
                <span className="text-[10px]">&rarr;</span>
              </a>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-center">
            <div className="inline-flex p-1 bg-gray-100 rounded-2xl border border-gray-200 gap-1 w-full sm:w-auto shadow-inner">
              <div className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-[#00008b] text-white shadow-md">
                <Calendar className="w-4 h-4" />
                <span>{tab === 'events' ? 'Events Calendar Submission' : `${tabLabel} Submission`}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area: Events Only */}
      <div className="flex-1">
        {tab === 'sales' ? <SubmitSale /> : tab === 'dining' ? <SubmitDining /> : <SubmitEvent isEmbedded />}
      </div>
    </div>
  );
}
