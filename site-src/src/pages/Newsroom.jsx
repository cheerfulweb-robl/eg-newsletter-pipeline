import React, { useState, useEffect, useMemo } from 'react';
import { matchesQuery } from '../utils/fuzzySearch.js';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { 
  Newspaper, 
  Calendar, 
  ExternalLink, 
  Search, 
  Building2, 
  ArrowLeft,
  ChevronRight,
  ChevronLeft,
  Filter,
  Sparkles,
  Share2,
  Copy,
  Check,
  Mail
} from 'lucide-react';

// Reference date: November 11, 2026
const TODAY = new Date(2026, 10, 11);
const NINETY_DAYS_AGO = new Date(TODAY);
NINETY_DAYS_AGO.setDate(TODAY.getDate() - 90);

const CURATED_NEWS_ARCHIVE = [
  {
    id: "gp-nov08",
    title: "East Gwillimbury kids help inspire a global movement",
    business_name: "The NewmarketToday",
    event_date_label: "Nov 08, 2026",
    event_start_date: "2026-11-08",
    summary: "By Ewa Chwojko-Srawley: A real chicken, a group of curious campers and a question about the future helped spark an idea that is now reaching children around the world.",
    link: "https://georginapost.com/2026/11/08/georgina-kids-help-inspire-a-global-movement/",
    category: "local_news"
  },
  {
    id: "gp-nov05-1",
    title: "York Regional Police launches Project Fallback",
    business_name: "The NewmarketToday",
    event_date_label: "Nov 05, 2026",
    event_start_date: "2026-11-05",
    summary: "Community safety awareness initiative launched across East Gwillimbury and York Region to combat auto theft and promote residential crime prevention.",
    link: "https://georginapost.com",
    category: "local_news"
  },
  {
    id: "gp-nov05-2",
    title: "QuestBus out of service indefinitely after second fire destroys vehicle",
    business_name: "The NewmarketToday",
    event_date_label: "Nov 05, 2026",
    event_start_date: "2026-11-05",
    summary: "Community transit service for local seniors and youth temporarily halted after vehicle damage.",
    link: "https://georginapost.com",
    category: "local_news"
  },
  {
    id: "tg-oct29-1",
    title: "Marking Remembrance Day and more this November in East Gwillimbury",
    business_name: "Town of East Gwillimbury",
    event_date_label: "Oct 29, 2026",
    event_start_date: "2026-10-29",
    summary: "The Town of East Gwillimbury, local Legion branches, and the East Gwillimbury Military Museum invite residents to commemorate our veterans.",
    link: "https://www.georgina.ca/newsroom",
    category: "municipal_news"
  },
  {
    id: "tg-oct29-2",
    title: "Public Notice - Invitation for Public Comment - Old Shiloh Road Bridge Replacement",
    business_name: "Town of East Gwillimbury",
    event_date_label: "Oct 29, 2026",
    event_start_date: "2026-10-29",
    summary: "Public consultation notice regarding environmental assessment and bridge structure renewal in Queensville.",
    link: "https://www.georgina.ca/newsroom",
    category: "municipal_news"
  },
  {
    id: "gp-oct29-1",
    title: "Local teen honoured as the OAAS Youth of the Month",
    business_name: "The NewmarketToday",
    event_date_label: "Oct 29, 2026",
    event_start_date: "2026-10-29",
    summary: "East Gwillimbury youth recognized by Ontario Association of Agricultural Societies for leadership and volunteer service at the Mount Albert Fair.",
    link: "https://georginapost.com",
    category: "local_news"
  },
  {
    id: "gp-oct27",
    title: "East Gwillimbury Vote 2026 brings sweeping change in council",
    business_name: "The NewmarketToday",
    event_date_label: "Oct 27, 2026",
    event_start_date: "2026-10-27",
    summary: "Comprehensive breakdown of election results and new ward representatives across the Town of East Gwillimbury.",
    link: "https://georginapost.com",
    category: "local_news"
  },
  {
    id: "tg-oct26",
    title: "It’s Voting Day in East Gwillimbury",
    business_name: "Town of East Gwillimbury",
    event_date_label: "Oct 26, 2026",
    event_start_date: "2026-10-26",
    summary: "Polls open across Holland Landing, Mount Albert, and Queensville with online and in-person ballot casting options.",
    link: "https://www.georgina.ca/newsroom",
    category: "municipal_news"
  },
  {
    id: "tg-oct22",
    title: "East Gwillimbury Public Library and Milwaukee Tool form exciting partnership to benefit local community",
    business_name: "Town of East Gwillimbury",
    event_date_label: "Oct 22, 2026",
    event_start_date: "2026-10-22",
    summary: "New community tool lending program and hands-on maker space enhancements unveiled at Holland Landing Branch.",
    link: "https://www.georgina.ca/newsroom",
    category: "municipal_news"
  },
  {
    id: "gp-oct22",
    title: "Butter Tarts, Big Hearts…and a Little Gooeyness",
    business_name: "The NewmarketToday",
    event_date_label: "Oct 22, 2026",
    event_start_date: "2026-10-22",
    summary: "Feature on local bakeries, harvest treats, and community fundraising around East Gwillimbury.",
    link: "https://georginapost.com",
    category: "local_news"
  },
  {
    id: "tg-oct19",
    title: "Statement from Mayor Margaret Quirk on the next milestone in advancing East Gwillimbury’s Advanced Care Centre",
    business_name: "Town of East Gwillimbury",
    event_date_label: "Oct 19, 2026",
    event_start_date: "2026-10-19",
    summary: "Council advances provincial health care partnership to expand outpatient emergency services and hospice beds in East Gwillimbury.",
    link: "https://www.georgina.ca/newsroom",
    category: "municipal_news"
  },
  {
    id: "tg-sep16",
    title: "Council Highlights - Sep 16, 2026",
    business_name: "Town of East Gwillimbury",
    event_date_label: "Sep 16, 2026",
    event_start_date: "2026-09-16",
    summary: "Council approvals regarding waterfront park preservation, road paving tenders, and annual budget committee meetings.",
    link: "https://www.georgina.ca/municipal-government/council-meetings/council-highlights",
    category: "municipal_news"
  },
  {
    id: "tg-sep02",
    title: "Council Highlights - Sep 02, 2026",
    business_name: "Town of East Gwillimbury",
    event_date_label: "Sep 02, 2026",
    event_start_date: "2026-09-02",
    summary: "Town Council approvals regarding fall community recreation schedules, street safety, and library services.",
    link: "https://www.georgina.ca/municipal-government/council-meetings/council-highlights",
    category: "municipal_news"
  }
];

export default function Newsroom() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSource, setSelectedSource] = useState('All');
  const [viewYear, setViewYear] = useState(2026);
  const [viewMonth, setViewMonth] = useState(10); // 10 = November
  const [selectedDateStr, setSelectedDateStr] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const handleCopyLink = (id, url) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2200);
    }
  };

  const handleNativeShare = (title, url) => {
    if (navigator?.share) {
      navigator.share({
        title: title || 'East Gwillimbury Community News Story',
        text: (title || '') + ' - Welcome East Gwillimbury Newsroom',
        url: url
      }).catch(() => {});
    } else {
      handleCopyLink(id, url);
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function loadNews() {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('vendor_events')
          .select('id, title, business_name, summary, link, event_date_label, event_start_date, created_at, category')
          .in('category', ['local_news', 'municipal_news', 'news', 'press_release'])
          .eq('status', 'approved');

        if (!error && data && data.length > 0 && isMounted) {
          setArticles(data);
        } else if (isMounted) {
          setArticles(CURATED_NEWS_ARCHIVE);
        }
      } catch (err) {
        console.warn('Newsroom load notice:', err);
        if (isMounted) setArticles(CURATED_NEWS_ARCHIVE);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadNews();
    return () => { isMounted = false; };
  }, []);

  const filteredArticles = useMemo(() => {
    return articles.filter(art => {
      const biz = (art.business_name || '').toLowerCase();
      if (selectedSource === 'The NewmarketToday' && !biz.includes('post')) return false;
      // "georgina" alone also matched The NewmarketToday
      if (selectedSource === 'Town of East Gwillimbury' && (biz.includes('post') || (!biz.includes('town') && !biz.includes('georgina')))) return false;

      if (searchTerm.trim()) {
        if (!matchesQuery(`${art.title || ''} ${art.summary || ''} ${art.business_name || ''}`, searchTerm)) return false;
      }
      return true;
    });
  }, [articles, selectedSource, searchTerm]);

  // Index articles by 'YYYY-MM-DD'
  const storiesByDate = useMemo(() => {
    const map = {};
    filteredArticles.forEach(item => {
      const d = item.event_start_date ? item.event_start_date.slice(0, 10) : null;
      if (d) {
        if (!map[d]) map[d] = [];
        map[d].push(item);
      }
    });
    return map;
  }, [filteredArticles]);

  // Month navigation
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const quickMonths = [
    { name: 'Nov 2026', month: 10, year: 2026 },
    { name: 'Oct 2026', month: 9, year: 2026 },
    { name: 'Sep 2026', month: 8, year: 2026 },
    { name: 'Aug 2026', month: 7, year: 2026 }
  ];

  const changeMonth = (delta) => {
    let newM = viewMonth + delta;
    let newY = viewYear;
    if (newM < 7) newM = 7; // August limit
    if (newM > 10) newM = 10; // November limit
    setViewMonth(newM);
    setViewYear(newY);
    setSelectedDateStr(null);
  };

  // Calendar Days computation
  const calendarCells = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const startDayOfWeek = firstDay.getDay(); // 0 = Sun
    const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();

    const cells = [];

    // Prev month padding
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      cells.push({
        dayNum: prevMonthDays - i,
        isOutOfWindow: true
      });
    }

    // Days in current view month
    for (let day = 1; day <= daysInMonth; day++) {
      const curDate = new Date(viewYear, viewMonth, day);
      const dIso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = curDate.getTime() === TODAY.getTime();
      const isOut = curDate > TODAY || curDate < NINETY_DAYS_AGO;
      const dayStories = storiesByDate[dIso] || [];

      cells.push({
        dayNum: day,
        dIso,
        isToday,
        isOutOfWindow: isOut,
        stories: dayStories,
        hasStories: dayStories.length > 0
      });
    }

    // Next month padding to complete row
    const total = cells.length;
    const remaining = (7 - (total % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      cells.push({
        dayNum: i,
        isOutOfWindow: true
      });
    }

    return cells;
  }, [viewYear, viewMonth, storiesByDate]);

  // Active displayed stories
  const displayedStories = useMemo(() => {
    if (selectedDateStr) {
      return filteredArticles.filter(it => it.event_start_date && it.event_start_date.slice(0, 10) === selectedDateStr);
    }
    // A typed search covers every month (and undated stories), not just the month on screen
    if (searchTerm.trim()) {
      return [...filteredArticles].sort((a, b) => (b.event_start_date || '').localeCompare(a.event_start_date || ''));
    }
    const curMonthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
    const monthStories = filteredArticles.filter(it => it.event_start_date && it.event_start_date.startsWith(curMonthPrefix));
    return [...monthStories].sort((a, b) => (b.event_start_date || '').localeCompare(a.event_start_date || ''));
  }, [filteredArticles, selectedDateStr, viewYear, viewMonth, searchTerm]);

  return (
    <div className="max-w-[1440px] w-full mx-auto px-4 md:px-8 lg:px-12 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 mb-6">
        <Link to="/" className="hover:text-[#00008b] flex items-center gap-1 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Home</span>
        </Link>
        <span>/</span>
        <span className="text-gray-900 font-bold">Past 90-Day Newsroom Calendar</span>
      </div>

      {/* Hero Banner */}
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
            <span>📰 90-Day Community News Archive &bull; Verified Journalism</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight font-display text-white leading-[1.1] mb-4">
            Past News Stories <span className="text-sun-300">Calendar</span>
          </h1>

          <p className="text-blue-100 text-sm sm:text-base md:text-lg font-medium leading-relaxed max-w-2xl mb-8">
            Interactive retrospective calendar spanning the past 90 days. Click any date on the calendar grid to read verified local journalism from <strong>The NewmarketToday</strong> and official <strong>Town of East Gwillimbury Media Releases</strong>.
          </p>

          <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs font-bold text-blue-200">
            <span className="flex items-center gap-1.5 bg-white/10 px-3.5 py-1.5 rounded-full border border-white/10 backdrop-blur-sm">
              <Calendar className="w-4 h-4 text-sun-300" />
              <span>90-Day Retrospective Archive</span>
            </span>
            <span className="flex items-center gap-1.5 bg-white/10 px-3.5 py-1.5 rounded-full border border-white/10 backdrop-blur-sm">
              <Building2 className="w-4 h-4 text-coral-300" />
              <span>Town Media Releases &amp; Council Highlights</span>
            </span>
          </div>
        </div>
      </div>

      {/* Toolbar: Month Navigation & Filters */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 md:p-6 shadow-sm mb-6 space-y-4">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
          {/* Month Steppers */}
          <div className="flex items-center gap-2 w-full lg:w-auto justify-between lg:justify-start">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              className="px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-black text-gray-700 hover:bg-gray-100 flex items-center gap-1 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Prev Month</span>
            </button>
            <span className="text-base font-black text-gray-900 px-3 tracking-tight">
              {monthNames[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              className="px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-black text-gray-700 hover:bg-gray-100 flex items-center gap-1 transition-colors"
            >
              <span>Next Month</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Month Jump Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full lg:w-auto pb-1 lg:pb-0">
            {quickMonths.map(m => {
              const isActive = viewMonth === m.month && viewYear === m.year;
              return (
                <button
                  key={m.name}
                  type="button"
                  onClick={() => {
                    setViewMonth(m.month);
                    setViewYear(m.year);
                    setSelectedDateStr(null);
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                    isActive ? 'bg-[#00008b] text-white shadow-xs' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {m.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="pt-4 border-t border-gray-100 flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Source Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto">
            <span className="text-[11px] font-black uppercase tracking-wider text-gray-400 mr-1">Source:</span>
            {['All', 'The NewmarketToday', 'Town of East Gwillimbury'].map(src => (
              <button
                key={src}
                type="button"
                onClick={() => setSelectedSource(src)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                  selectedSource === src
                    ? 'bg-[#00008b] text-white shadow-sm'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {src === 'All' ? '🌟 All Sources' : src === 'Town of East Gwillimbury' ? '🏛️ Town of East Gwillimbury' : '📰 The NewmarketToday'}
              </button>
            ))}
          </div>

          {/* Search Bar */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search headline, reporter, topic..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:border-[#00008b]"
            />
          </div>
        </div>
      </div>

      {/* 7-Column Master Calendar Grid */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 md:p-6 shadow-sm mb-8 overflow-hidden">
        <div className="overflow-x-auto -mx-2 sm:mx-0 px-2 sm:px-0">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-7 gap-2 md:gap-3 text-center text-xs font-black uppercase tracking-wider text-gray-500 mb-3 px-1">
              <div>Sun</div>
              <div>Mon</div>
              <div>Tue</div>
              <div>Wed</div>
              <div>Thu</div>
              <div>Fri</div>
              <div>Sat</div>
            </div>

            <div className="grid grid-cols-7 gap-2 md:gap-3">
              {calendarCells.map((cell, idx) => {
                if (cell.isOutOfWindow) {
                  return (
                    <div key={idx} className="min-h-[110px] p-2.5 rounded-2xl border border-gray-100 bg-gray-50/50 opacity-40 cursor-not-allowed">
                      <span className="text-xs font-bold text-gray-400">{cell.dayNum}</span>
                    </div>
                  );
                }

                const isSelected = selectedDateStr === cell.dIso;
                const postCount = cell.stories.filter(s => (s.business_name || '').toLowerCase().includes('post')).length;
                const townCount = cell.stories.filter(s => !(s.business_name || '').toLowerCase().includes('post')).length;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedDateStr(cell.dIso)}
                    className={`min-h-[110px] p-2.5 rounded-2xl border text-left transition-all flex flex-col justify-between group relative overflow-hidden ${
                      isSelected
                        ? 'bg-blue-50/80 border-[#00008b] ring-2 ring-[#00008b] shadow-md'
                        : cell.isToday
                        ? 'bg-blue-50/50 border-blue-400 ring-1 ring-blue-300 hover:border-[#00008b]'
                        : cell.hasStories
                        ? 'bg-white border-blue-200 hover:border-blue-400 hover:shadow-md'
                        : 'bg-white border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className={`text-sm font-black ${cell.isToday ? 'text-blue-900 font-extrabold' : 'text-gray-900'}`}>
                        {cell.dayNum}
                      </span>
                      {cell.isToday && (
                        <span className="text-[9px] font-black uppercase bg-blue-600 text-white px-1.5 py-0.5 rounded shadow-xs">
                          Today
                        </span>
                      )}
                    </div>

                    <div className="mt-1 space-y-1 w-full overflow-hidden">
                      {postCount > 0 && (
                        <div className="bg-amber-50 text-amber-900 border border-amber-200 text-[10px] font-black px-1.5 py-0.5 rounded truncate">
                          📰 {postCount} Post
                        </div>
                      )}
                      {townCount > 0 && (
                        <div className="bg-blue-50 text-blue-900 border border-blue-200 text-[10px] font-black px-1.5 py-0.5 rounded truncate">
                          🏛️ {townCount} Town
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Selected Date Header & Story List */}
      <div className="mb-16">
        <div className="flex items-center justify-between mb-4 px-1">
          <div>
            <h2 className="text-xl font-black text-gray-900 tracking-tight">
              {selectedDateStr ? `Stories on ${selectedDateStr} (${displayedStories.length})` : searchTerm.trim() ? `Search results, all months (${displayedStories.length})` : `All Stories in ${monthNames[viewMonth]} ${viewYear} (${displayedStories.length})`}
            </h2>
            <p className="text-xs text-gray-500 font-semibold">
              {selectedDateStr ? 'Isolating verified stories for this selected day.' : 'Click any highlighted day on the calendar above to view stories for that date.'}
            </p>
          </div>

          {selectedDateStr && (
            <button
              type="button"
              onClick={() => setSelectedDateStr(null)}
              className="text-xs font-bold text-[#00008b] hover:underline"
            >
              Show All Stories for this Month &rarr;
            </button>
          )}
        </div>

        {displayedStories.length === 0 ? (
          <div className="bg-white rounded-3xl border border-gray-200 p-12 text-center">
            <Newspaper className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <h3 className="text-base font-black text-gray-900 mb-1">No News Articles Found</h3>
            <p className="text-xs text-gray-500 max-w-md mx-auto mb-4">
              There were no verified media releases or news stories published on this date. Browse the highlighted calendar dates above.
            </p>
            <button
              type="button"
              onClick={() => setSelectedDateStr(null)}
              className="px-5 py-2.5 bg-[#00008b] text-white rounded-xl text-xs font-black uppercase tracking-wider"
            >
              View All Stories for This Month
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayedStories.map(art => {
              const biz = art.business_name || 'East Gwillimbury News';
              const isPost = biz.toLowerCase().includes('post');
              const targetLink = /^https?:\/\//i.test(String(art.link || '')) ? art.link : 'https://welcomeeg.ca';
              const dateDisplay = art.event_date_label || art.event_start_date;

              return (
                <article
                  key={art.id}
                  className="bg-white rounded-3xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow p-6 flex flex-col justify-between group"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className={`px-2.5 py-1 rounded-md text-[10.5px] font-black uppercase tracking-wider border ${
                        isPost
                          ? 'bg-amber-50 text-amber-900 border-amber-200'
                          : 'bg-blue-50 text-blue-900 border-blue-200'
                      }`}>
                        {isPost ? '📰 The NewmarketToday' : '🏛️ Town Media Release'}
                      </span>
                      <span className="text-[11px] font-bold text-gray-400">📅 {dateDisplay}</span>
                    </div>

                    <h3 className="text-base font-black text-gray-900 leading-snug group-hover:text-[#00008b] transition-colors mb-2">
                      {art.title}
                    </h3>

                    {art.summary && (
                      <p className="text-xs text-gray-600 font-normal mt-2 line-clamp-3 leading-relaxed">
                        {art.summary}
                      </p>
                    )}
                  </div>

                  <div className="mt-6 pt-4 border-t border-gray-100 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-gray-400 truncate max-w-[150px]">
                        {biz}
                      </span>

                      <a
                        href={targetLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3.5 py-1.5 rounded-xl bg-[#00008b] hover:bg-blue-900 text-white text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-xs"
                      >
                        <span>Read Story</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    {/* Social & Direct Sharing Bar */}
                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400">
                        Share Story:
                      </span>
                      <div className="flex items-center gap-1.5">
                        {/* Native Device Share */}
                        <button
                          type="button"
                          onClick={() => handleNativeShare(art.title, targetLink)}
                          title="Share Story"
                          className="p-1.5 rounded-lg bg-gray-100 hover:bg-blue-50 text-gray-600 hover:text-[#00008b] transition-colors"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Facebook Share */}
                        <a
                          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(targetLink)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Share on Facebook"
                          className="p-1.5 rounded-lg bg-gray-100 hover:bg-blue-50 text-gray-600 hover:text-blue-600 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                        </a>

                        {/* X / Twitter Share */}
                        <a
                          href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(targetLink)}&text=${encodeURIComponent(art.title || '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Share on X / Twitter"
                          className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-900 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                        </a>

                        {/* Email Share */}
                        <a
                          href={`mailto:?subject=${encodeURIComponent(art.title || '')}&body=${encodeURIComponent((art.title || '') + '\n\nRead more at: ' + targetLink)}`}
                          title="Share via Email"
                          className="p-1.5 rounded-lg bg-gray-100 hover:bg-rose-50 text-gray-600 hover:text-rose-600 transition-colors"
                        >
                          <Mail className="w-3.5 h-3.5" />
                        </a>

                        {/* Copy Link Button */}
                        <button
                          type="button"
                          onClick={() => handleCopyLink(art.id, targetLink)}
                          title="Copy Link to Clipboard"
                          className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors ${
                            copiedId === art.id
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                          }`}
                        >
                          {copiedId === art.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-700" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
