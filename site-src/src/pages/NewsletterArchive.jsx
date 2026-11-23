import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// Edition keys: 'monday' = Monday edition (Mon to Fri), 'reader' = Thursday edition (Fri to Sun).
function editionLabel(edition, short = false) {
  if (edition === 'monday') return short ? 'Monday Edition' : 'Monday Edition • Monday to Friday';
  if (edition === 'reader') return short ? 'Thursday Edition' : 'Thursday Edition • Friday to Sunday';
  return short ? 'Business Briefing' : 'Business Briefing (retired edition)';
}

export default function NewsletterArchive() {
  const [latestReader, setLatestReader] = useState(null);
  const [archiveList, setArchiveList] = useState([]);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');

  // Helper to open issue in new tab responsive to viewport up to max 1440px wide
  const openIssueFullscreen = (issue) => {
    if (!issue?.html_content) return;
    let content = issue.html_content;
    const styleInject = `
      <style>
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          background-color: #f1f5f9;
        }
        .wg-viewport-wrapper {
          max-width: 1440px;
          margin: 0 auto;
          background: #ffffff;
          min-height: 100vh;
          box-shadow: 0 4px 20px rgba(0,0,0,0.08);
        }
        @media (max-width: 1440px) {
          .wg-viewport-wrapper {
            width: 100%;
          }
        }
      </style>
    `;

    if (content.includes('<head>')) {
      content = content.replace('<head>', `<head>${styleInject}`);
    } else {
      content = styleInject + content;
    }

    if (content.includes('<body') && !content.includes('wg-viewport-wrapper')) {
      content = content.replace(/(<body[^>]*>)/i, '$1<div class="wg-viewport-wrapper">');
      content = content.replace(/<\/body>/i, '</div></body>');
    }

    const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  // The list loads without the email HTML; one issue's HTML is fetched when it is opened.
  async function openIssue(issue) {
    if (!issue || issue.html_content || !issue.id) { setSelectedIssue(issue); return; }
    setSelectedIssue({ ...issue, html_content: '' });
    const { data } = await supabase.from('newsletter_archive').select('html_content').eq('id', issue.id).single();
    setSelectedIssue(cur => (cur && cur.id === issue.id ? { ...issue, html_content: data?.html_content || '' } : cur));
  }

  useEffect(() => {
    async function loadNewsletters() {
      setLoading(true);
      try {
        // 1. Fetch latest reader edition
        const { data: latestData } = await supabase
          .from('newsletter_editions')
          .select('*')
          .eq('edition', 'reader')
          .single();

        if (latestData) {
          setLatestReader(latestData);
          setSelectedIssue(latestData);
        }

        // 2. Fetch full chronological archive (newest first)
        const { data: archiveData } = await supabase
          .from('newsletter_archive')
          .select('id, edition, subject, issue_date, published_at')
          .order('issue_date', { ascending: false })
          .order('published_at', { ascending: false });

        if (archiveData && archiveData.length > 0) {
          setArchiveList(archiveData);
          // Show the newest edition first, Monday or Thursday
          if (!latestData || (archiveData[0].edition === 'monday' && String(archiveData[0].published_at || '') > String(latestData.updated_at || ''))) {
            openIssue(archiveData[0]);
          }
        } else if (latestData) {
          setArchiveList([latestData]);
        }
      } catch (err) {
        console.error('Error loading newsletter archive:', err);
      } finally {
        setLoading(false);
      }
    }

    loadNewsletters();
  }, []);

  const filteredArchive = archiveList.filter(item => {
    if (activeTab === 'all') return true;
    return item.edition === activeTab;
  });

  return (
    <div className="max-w-[1440px] mx-auto w-full px-4 md:px-10 py-10 flex flex-col gap-8">
      {/* Top Banner Header (Subscription form removed as requested) */}
      <div className="bg-[#00008b] text-white p-8 md:p-12 rounded-3xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="max-w-3xl">
          <span className="inline-block text-xs uppercase tracking-widest font-black bg-white/10 px-3 py-1 rounded-full text-blue-200 mb-3">
            Official Community Publication
          </span>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-3">
            Community Newsletter &amp; Archives
          </h1>
          <p className="text-blue-100 text-sm md:text-base leading-relaxed">
            Welcome East Gwillimbury’s curated weekly digest of town news, council highlights, municipal announcements, local events, and exclusive local business promotions.
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-3">
          <a
            href="https://welcomeeg.ca/news/login.html"
            className="bg-amber-400 hover:bg-amber-500 text-amber-950 font-black text-xs md:text-sm uppercase tracking-wider px-5 py-3 rounded-xl transition-all shadow-md flex items-center gap-1.5"
          >
            <span>Submit Community Event</span>
            <span>↗</span>
          </a>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center font-bold text-gray-500">
          Loading latest newsletters and archives...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT COLUMN: Archive List (Newest First) */}
          <div className="lg:col-span-4 flex flex-col gap-4 bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h2 className="text-base font-black text-gray-900 uppercase tracking-wider">
                Newsletter Archive
              </h2>
              <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-md">
                {filteredArchive.length} Issues
              </span>
            </div>

            {/* Edition Badge */}
            <div className="px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl text-xs font-black text-[#00008b]">
              📬 Weekly Community Newsletter Editions
            </div>

            {/* Chronological List (Newest First) - Clicking opens in new tab */}
            <div className="flex flex-col gap-2 max-h-[650px] overflow-y-auto pr-1">
              {filteredArchive.length === 0 ? (
                <p className="text-sm text-gray-500 py-6 text-center">No past issues recorded yet.</p>
              ) : (
                filteredArchive.map((issue) => {
                  const isCurrent = selectedIssue?.id === issue.id || (selectedIssue?.edition === issue.edition && !issue.id);
                  const issueDateFormatted = issue.issue_date
                    ? new Date(issue.issue_date + 'T00:00:00').toLocaleDateString('en-CA', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })
                    : 'Recent Issue';

                  return (
                    <button
                      key={issue.id || issue.edition}
                      type="button"
                      onClick={() => {
                        openIssue(issue);
                        openIssueFullscreen(issue);
                      }}
                      className={`text-left p-4 rounded-2xl border transition-all ${
                        isCurrent
                          ? 'border-[#00008b] bg-blue-50/50 shadow-sm'
                          : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                      }`}
                      title="Click to view and open edition in new window"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                            issue.edition === 'reader' || issue.edition === 'monday'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {editionLabel(issue.edition, true)}
                        </span>
                        <span className="text-xs text-gray-500 font-semibold">
                          {issueDateFormatted}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-gray-900 line-clamp-2 leading-snug">
                        {issue.subject}
                      </h3>
                      <div className="mt-2 text-xs font-bold text-[#00008b] flex items-center justify-between">
                        <span>{isCurrent ? 'Viewing in Reader' : 'Read Edition'}</span>
                        <span className="text-blue-700 bg-blue-100 px-2 py-0.5 rounded text-[11px]">Open New Tab ↗</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Full Edition Reader Display (Responsive up to 1440px) */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            {selectedIssue ? (
              <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                {/* Issue Header bar */}
                <div className="p-6 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50/50">
                  <div>
                    <span className="text-xs font-black uppercase tracking-wider text-blue-700 bg-blue-100 px-2.5 py-1 rounded-full">
                      {editionLabel(selectedIssue.edition)}
                    </span>
                    <h2 className="text-xl md:text-2xl font-black text-gray-900 mt-2">
                      {selectedIssue.subject}
                    </h2>
                    <p className="text-xs text-gray-500 font-semibold mt-1">
                      Published: {selectedIssue.issue_date || 'Current Edition'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openIssueFullscreen(selectedIssue)}
                      className="bg-[#00008b] hover:bg-blue-900 text-white text-xs font-black uppercase tracking-wider px-5 py-2.5 rounded-xl transition-all shadow-sm flex items-center gap-1.5"
                    >
                      <span>Open Full Screen</span>
                      <span>↗</span>
                    </button>
                  </div>
                </div>

                {/* HTML Preview Frame */}
                <div className="w-full bg-white p-2 md:p-6 min-h-[750px] max-w-[1440px] mx-auto">
                  <iframe
                    title={selectedIssue.subject}
                    srcDoc={selectedIssue.html_content}
                    className="w-full h-[850px] border-0 rounded-2xl shadow-inner bg-white"
                    sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
                  />
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-gray-200 p-12 text-center text-gray-500 font-bold">
                Select a newsletter issue from the archive on the left to read.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
