import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  MessageSquare,
  Send,
  Calendar,
  MapPin,
  Sparkles,
  Store,
  Gift,
  Newspaper,
  Megaphone,
  ShieldCheck,
  Utensils,
} from 'lucide-react';

const SITE_OFFERINGS = [
  {
    icon: Calendar,
    title: '45-Day Events Calendar & Weekend Planner',
    desc: 'Browse verified community events, concerts, markets, library programs, and family activities across East Gwillimbury.',
    links: [
      { label: 'Events Calendar', to: '/events' },
      { label: 'This Weekend', to: '/this-weekend' },
      { label: 'Featured Events', to: '/spotlight' },
    ],
  },
  {
    icon: Utensils,
    title: 'Local Dining & Retail Sales',
    desc: 'Discover daily restaurant specials, eat-in/take-out options, and current local store sales and deals.',
    links: [
      { label: 'Local Dining', to: '/dining' },
      { label: 'Sales & Deals', to: '/sales' },
      { label: 'All Offers', to: '/offers' },
    ],
  },
  {
    icon: Store,
    title: 'Business Directory & Owner Portal',
    desc: 'Search local East Gwillimbury businesses by community or category. Owners can claim their listing to manage details and view click stats.',
    links: [
      { label: 'Business Directory', to: '/directory' },
      { label: 'Submit Listing', to: '/submission' },
    ],
  },
  {
    icon: Gift,
    title: 'Welcome Hamper & Digital Wallet',
    desc: 'New to East Gwillimbury? Apply for free local merchant welcome perks and redeem digital passes at participating businesses.',
    links: [
      { label: 'Welcome Hamper', to: '/hamper/', external: true },
      { label: 'Digital Wallet', to: '/hamper/wallet.html', external: true },
    ],
  },
  {
    icon: Newspaper,
    title: 'Local Newsroom & Pressroom',
    desc: 'Read local East Gwillimbury news, Town updates, and verified business press releases (kept separate from event newsletters).',
    links: [
      { label: 'Local Newsroom', to: '/newsroom' },
      { label: 'Pressroom', to: '/press' },
      { label: 'Corrections', to: '/corrections' },
    ],
  },
  {
    icon: Megaphone,
    title: 'Advertising & Sponsorships',
    desc: 'Promote your business with Quick Search Sponsored pills, Sitewide Photo Gallery spots, Newsletter Ads, or Sponsored Press Releases.',
    links: [{ label: 'View Ad Options', to: '/advertise' }],
  },
];

const ASK_WG_FEATURES = [
  {
    title: 'Anonymous by Default',
    desc: 'No account, login, or email is required to ask questions about East Gwillimbury events, dining, deals, or businesses.',
  },
  {
    title: 'Grounded in Approved Site Data',
    desc: 'Answers are built strictly from live approved listings, offers, directory records, and published news — never invented dates, hours, or prices.',
  },
  {
    title: 'Smart Local Date & Community Filters',
    desc: 'Understands Eastern Time dates (today, tomorrow, this weekend, next weekend), East Gwillimbury communities (Holland Landing, Mount Albert, Jackson\'s Point, Queensville, Brown Hill, etc.), and free/low-cost requests.',
  },
  {
    title: 'East Gwillimbury-First Results',
    desc: 'Prioritizes East Gwillimbury listings first and only falls back to nearby Out of Area listings when East Gwillimbury has no direct matches.',
  },
  {
    title: 'Quick Actions & Direct Links',
    desc: 'Start with one-tap prompts (Weekend events, Local deals, Where to eat, New to East Gwillimbury, Promote my business) and jump straight to listing pages via View details.',
  },
  {
    title: 'Optional Consented Inquiries',
    desc: 'Residents, newcomers, and business owners can submit a contact-consented inquiry directly to our team (with a separate, unchecked-by-default newsletter option).',
  },
];

export default function KnowledgeBase() {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(() => {
    if (
      location?.hash === '#support' ||
      location?.search?.includes('tab=support') ||
      (typeof window !== 'undefined' &&
        (window.location?.hash === '#support' || window.location?.search?.includes('tab=support')))
    ) {
      return 'support';
    }
    if (location?.hash === '#ask-wg' || location?.search?.includes('tab=ask-wg')) {
      return 'ask-wg';
    }
    return 'ask-wg';
  });

  const [supportForm, setSupportForm] = useState({
    name: '',
    email: '',
    phone: '',
    topic: 'Event Submission Inquiry',
    message: '',
  });
  const [supportSubmitted, setSupportSubmitted] = useState(false);

  useEffect(() => {
    if (location.hash === '#support') setActiveTab('support');
    else if (location.hash === '#ask-wg') setActiveTab('ask-wg');
  }, [location.hash]);

  const handleSupportSubmit = (e) => {
    e.preventDefault();
    setSupportSubmitted(true);
  };

  return (
    <div className="max-w-[1440px] mx-auto w-full px-4 md:px-8 py-10 flex flex-col gap-8">
      {/* Knowledge Base Header */}
      <div className="bg-[#00008b] text-white p-8 md:p-10 rounded-3xl shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <span className="inline-block text-xs uppercase tracking-widest font-black bg-white/10 px-3 py-1 rounded-full text-blue-200 mb-2">
            Knowledge Base, Guidelines &amp; Help Center
          </span>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-2">
            Welcome East Gwillimbury Help Center
          </h1>
          <p className="text-blue-100 text-sm md:text-base max-w-2xl leading-relaxed font-medium">
            Explore Ask WG (our local discovery assistant), everything Welcome East Gwillimbury offers, event submission rules, twice-weekly newsletter standards, and our support desk.
          </p>
        </div>

        <div className="shrink-0 flex flex-wrap gap-3">
          <Link
            to="/events"
            className="bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider px-5 py-3 rounded-xl transition-all shadow-md"
          >
            Events Calendar
          </Link>
          <Link
            to="/submission"
            className="bg-white/10 hover:bg-white/20 text-white font-black text-xs uppercase tracking-wider px-5 py-3 rounded-xl border border-white/20 transition-all"
          >
            Submit Listing
          </Link>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
        {[
          { id: 'ask-wg', label: 'Ask WG & Site Features' },
          { id: 'events-guide', label: 'Events, Directory & Submissions' },
          { id: 'newsletter-faq', label: 'Twice-Weekly Newsletter FAQ' },
          { id: 'support', label: 'Contact Support Desk' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === tab.id
                ? 'bg-[#00008b] text-white shadow-sm'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: ASK WG & SITE FEATURES */}
      {activeTab === 'ask-wg' && (
        <div className="space-y-8 animate-fadeIn">
          {/* Ask WG Overview */}
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-200 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider bg-blue-50 text-[#00008b] px-3 py-1 rounded-full border border-blue-200">
                  <MessageSquare className="w-3.5 h-3.5" />
                  New Site-Wide Assistant
                </span>
                <h2 className="text-2xl font-black text-gray-900 mt-2">
                  Ask WG — Local Discovery Chatbot
                </h2>
                <p className="text-sm text-gray-600 mt-1 max-w-3xl leading-relaxed">
                  Click the floating <strong>Ask WG</strong> button in the bottom-right corner of any page to search events, dining specials, local deals, businesses, and Welcome Hamper perks conversationally.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
              {ASK_WG_FEATURES.map((feat) => (
                <div key={feat.title} className="p-4 rounded-2xl bg-slate-50 border border-gray-200 space-y-1.5">
                  <h3 className="font-black text-gray-900 text-sm flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#00008b] shrink-0" />
                    <span>{feat.title}</span>
                  </h3>
                  <p className="text-xs text-gray-600 leading-relaxed">{feat.desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 p-4 rounded-2xl bg-blue-50/70 border border-blue-200 flex items-start gap-3 text-xs text-slate-700">
              <ShieldCheck className="w-4 h-4 text-[#00008b] shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong>Privacy &amp; Safety:</strong> Ask WG does not require an account, does not store full anonymous chat transcripts, and separates news publication dates from event dates so you always get clear, source-linked answers.
              </p>
            </div>
          </div>

          {/* Everything Welcome East Gwillimbury Offers */}
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-200 shadow-sm">
            <h2 className="text-2xl font-black text-gray-900 mb-2">
              What Welcome East Gwillimbury Offers
            </h2>
            <p className="text-sm text-gray-600 mb-6 leading-relaxed">
              A complete local guide for East Gwillimbury residents, newcomers, and businesses across Holland Landing, Mount Albert, Jackson&apos;s Point, Queensville, Brown Hill, and surrounding hamlets.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {SITE_OFFERINGS.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="p-5 rounded-2xl bg-gray-50 border border-gray-200 flex flex-col justify-between gap-4">
                    <div className="space-y-2">
                      <div className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-blue-100 text-[#00008b]">
                        <Icon className="w-4 h-4" />
                      </div>
                      <h3 className="font-black text-gray-900 text-base">{item.title}</h3>
                      <p className="text-xs text-gray-600 leading-relaxed">{item.desc}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {item.links.map((lnk) =>
                        lnk.external ? (
                          <a
                            key={lnk.label}
                            href={lnk.to}
                            className="text-xs font-extrabold text-[#00008b] bg-white border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                          >
                            {lnk.label} &rarr;
                          </a>
                        ) : (
                          <Link
                            key={lnk.label}
                            to={lnk.to}
                            className="text-xs font-extrabold text-[#00008b] bg-white border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                          >
                            {lnk.label} &rarr;
                          </Link>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: EVENTS & SUBMISSIONS GUIDE */}
      {activeTab === 'events-guide' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-200 shadow-sm">
            <h2 className="text-2xl font-black text-gray-900 mb-2">
              Community Event, Dining, Sale &amp; Directory Standards
            </h2>
            <p className="text-sm text-gray-600 mb-6 leading-relaxed">
              Welcome East Gwillimbury publishes verified community gatherings, dining specials, retail sales, and local business profiles across East Gwillimbury and nearby communities.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs sm:text-sm">
              <div className="p-5 rounded-2xl bg-gray-50 border border-gray-200 space-y-3">
                <h3 className="font-black text-gray-900 text-base flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#00008b]" />
                  <span>45-Day Sunday–Saturday Calendar</span>
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  Our community calendar runs across complete Sunday-to-Saturday weeks for 45 days forward from the current week.
                </p>
                <ul className="space-y-2 text-xs text-gray-700 font-semibold">
                  <li className="flex items-start gap-2">
                    <span className="text-[#00008b] font-black">&#10003;</span>
                    <span>Past days within the current week are marked &ldquo;You missed it!&rdquo; with events suppressed.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#00008b] font-black">&#10003;</span>
                    <span>Approved listings appear immediately on the calendar, in Ask WG search, and in upcoming newsletter editions.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#00008b] font-black">&#10003;</span>
                    <span>Events in neighbouring towns outside East Gwillimbury are automatically tagged &ldquo;Out of Area: &lt;Location&gt;&rdquo;.</span>
                  </li>
                </ul>
              </div>

              <div className="p-5 rounded-2xl bg-gray-50 border border-gray-200 space-y-3">
                <h3 className="font-black text-gray-900 text-base flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-emerald-700" />
                  <span>Free Submissions, Claiming &amp; Stats</span>
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  Local organizations, venues, restaurants, and residents can submit listings free of charge via <Link to="/submission" className="text-[#00008b] font-bold underline">/submission</Link>.
                </p>
                <ul className="space-y-2 text-xs text-gray-700 font-semibold">
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-600 font-black">&#10003;</span>
                    <span><strong>One-Time Email Verification:</strong> New submissions confirm via a one-time email link before entering the editorial review queue.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-600 font-black">&#10003;</span>
                    <span><strong>Claim Your Business:</strong> Owners can claim their <Link to="/directory" className="text-[#00008b] underline">Directory</Link> profile and view live click analytics in the Business Portal (<code>/business/index.html</code>).</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-600 font-black">&#10003;</span>
                    <span><strong>Auto-Crawl Sources:</strong> Approved public calendars and feeds are synced automatically and deduplicated before publication.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: NEWSLETTER FAQ */}
      {activeTab === 'newsletter-faq' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-200 shadow-sm">
            <h2 className="text-2xl font-black text-gray-900 mb-2">
              Twice-Weekly Community Newsletter FAQ
            </h2>
            <p className="text-sm text-gray-600 mb-6 leading-relaxed">
              Everything you need to know about our Monday and Thursday community email editions:
            </p>

            <div className="space-y-4">
              <div className="p-5 rounded-2xl bg-blue-50/60 border border-blue-200 text-xs sm:text-sm space-y-2">
                <h3 className="font-black text-[#00008b] text-base">
                  When are the newsletters delivered and what do they cover?
                </h3>
                <p className="text-slate-700 leading-relaxed">
                  We publish <strong>twice weekly</strong>: the <strong>Monday Edition</strong> (Monday morning, covering Monday–Friday listings) and the <strong>Thursday Edition</strong> (Thursday morning, covering Friday–Sunday for both the coming weekend and next weekend). Subscribers can choose Monday, Thursday, or both at <Link to="/subscribe" className="font-bold text-[#00008b] underline">/subscribe</Link>.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-gray-50 border border-gray-200 text-xs sm:text-sm space-y-2">
                <h3 className="font-black text-gray-900 text-base">
                  Why aren&apos;t news articles included in the email newsletter?
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  To keep newsletters focused on actionable events, dining specials, and local deals, local news stories are published on the website (<Link to="/newsroom" className="font-bold text-[#00008b] underline">/newsroom</Link> and <Link to="/press" className="font-bold text-[#00008b] underline">/press</Link>) with a direct &ldquo;Read Local News&rdquo; link in every edition.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-gray-50 border border-gray-200 text-xs sm:text-sm space-y-2">
                <h3 className="font-black text-gray-900 text-base">
                  Is subscription free and compliant with Canadian anti-spam legislation (CASL)?
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  Yes, 100%. Subscription is completely free and requires verified double opt-in confirmation. Every edition includes a one-click unsubscribe link that honours opt-outs immediately.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-gray-50 border border-gray-200 text-xs sm:text-sm space-y-2">
                <h3 className="font-black text-gray-900 text-base">
                  How are events selected for inclusion?
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  Listings submitted by residents, local businesses, non-profits, and synced from verified public community calendars are reviewed, deduplicated, and approved by editorial staff before appearing on the site or in newsletters.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: SUPPORT DESK */}
      {activeTab === 'support' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-200 shadow-sm">
            <h2 className="text-2xl font-black text-gray-900 mb-2">
              Welcome East Gwillimbury Support Desk
            </h2>
            <p className="text-sm text-gray-600 mb-6 leading-relaxed">
              Have a question, event correction, or technical issue? Submit an inquiry below, use <Link to="/contact" className="text-[#00008b] font-bold underline">/contact</Link>, or email <a href="mailto:contact@welcomeeg.ca" className="text-[#00008b] font-bold underline">contact@welcomeeg.ca</a>.
            </p>

            {supportSubmitted ? (
              <div className="p-8 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-3">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center mx-auto text-2xl font-black">
                  ✓
                </div>
                <h3 className="text-xl font-black text-emerald-900">
                  Thank you! Your ticket has been received.
                </h3>
                <p className="text-xs sm:text-sm text-emerald-800 max-w-md mx-auto">
                  A representative will review your inquiry and follow up at <strong>{supportForm.email}</strong> shortly.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSupportSubmitted(false);
                    setSupportForm({ name: '', email: '', phone: '', topic: 'Event Submission Inquiry', message: '' });
                  }}
                  className="mt-4 px-6 py-2.5 rounded-xl bg-emerald-700 text-white font-black text-xs uppercase tracking-wider hover:bg-emerald-800 transition-all"
                >
                  Submit Another Ticket
                </button>
              </div>
            ) : (
              <form onSubmit={handleSupportSubmit} className="space-y-4 max-w-2xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black uppercase text-gray-700 mb-1">
                      Your Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={supportForm.name}
                      onChange={(e) => setSupportForm({ ...supportForm, name: e.target.value })}
                      placeholder="Jane Smith"
                      className="w-full p-3 rounded-xl border border-gray-300 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black uppercase text-gray-700 mb-1">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      value={supportForm.email}
                      onChange={(e) => setSupportForm({ ...supportForm, email: e.target.value })}
                      placeholder="jane@example.com"
                      className="w-full p-3 rounded-xl border border-gray-300 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black uppercase text-gray-700 mb-1">
                      Phone Number (Optional)
                    </label>
                    <input
                      type="tel"
                      value={supportForm.phone}
                      onChange={(e) => setSupportForm({ ...supportForm, phone: e.target.value })}
                      placeholder="(905) 555-0123"
                      className="w-full p-3 rounded-xl border border-gray-300 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black uppercase text-gray-700 mb-1">
                      Inquiry Category *
                    </label>
                    <select
                      value={supportForm.topic}
                      onChange={(e) => setSupportForm({ ...supportForm, topic: e.target.value })}
                      className="w-full p-3 rounded-xl border border-gray-300 text-sm focus:border-blue-500 focus:outline-none bg-white"
                    >
                      <option value="Event Submission Inquiry">Community Event Submission / Status</option>
                      <option value="Ask WG Question">Ask WG Chatbot Feedback</option>
                      <option value="Newsletter Question">Twice-Weekly Newsletter / Subscription</option>
                      <option value="Advertising Question">Advertising &amp; Sponsorships</option>
                      <option value="Bug Report">Technical Bug or Error Report</option>
                      <option value="General Question">General Feedback &amp; Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-gray-700 mb-1">
                    How Can We Help You? *
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={supportForm.message}
                    onChange={(e) => setSupportForm({ ...supportForm, message: e.target.value })}
                    placeholder="Provide details about your question, event submission, or bug report..."
                    className="w-full p-3 rounded-xl border border-gray-300 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="bg-[#00008b] hover:bg-blue-900 text-white font-black text-xs uppercase tracking-wider px-8 py-3.5 rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer"
                  >
                    <span>Submit Ticket</span>
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
