import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronDown,
  CalendarDays,
  Star,
  Newspaper,
  Mail,
  Archive,
  Sun,
  Store,
  PenSquare,
  Utensils,
  Tag,
  Gift,
  QrCode,
  ShieldCheck,
  KeyRound,
  Shield,
  HelpCircle,
  ScrollText,
  Lock,
  Scale,
  Megaphone,
  ArrowRight,
} from 'lucide-react';

// Footer link text is 30% larger than the base (14px -> 18.2px, bottom bar 12px -> 15.6px).
// Design B footer: same destinations as the original (Link = SPA route, href = static page),
// emoji icons replaced by lucide SVGs. `accent` marks the original highlighted (amber/blue) links.
const SECTIONS = [
  {
    id: 'community',
    title: 'Community & Calendars',
    icon: CalendarDays,
    links: [
      { to: '/events', label: '45-Day Events Calendar', icon: CalendarDays },
      { to: '/spotlight', label: 'Featured Spotlight & History', icon: Star, accent: true },
      { href: '/news/newsroom.html', label: '90-Day Newsroom Calendar', icon: Newspaper, accent: true },
      { to: '/subscribe', label: 'Monday & Thursday Newsletter', icon: Mail, accent: true },
      { to: '/newsletter', label: 'Past Newsletter Archive', icon: Archive },
      { to: '/weather', label: 'East Gwillimbury 7-Day Weather', icon: Sun },
    ],
  },
  {
    id: 'business',
    title: 'Submissions',
    icon: PenSquare,
    links: [
      { href: '/my-submissions', label: 'My Submissions', icon: Store, accent: true },
      { to: '/submission', label: 'Submit Event / Activity', icon: PenSquare },
      { to: '/submission?tab=dining', label: 'Submit a Dining Special', icon: Utensils },
      { to: '/submission?tab=sales', label: 'Submit a Sale', icon: Tag },
      { href: '/hamper/', label: 'Welcome Hamper for New Residents', icon: Gift },
      { href: '/hamper/redeem.html', label: 'Redemptions (Hamper Codes)', icon: QrCode },
      { to: '/advertise', label: 'Buy Ad Space (Quick Search)', icon: Megaphone, accent: true },
      { href: '/staff/admin-approvals.html?view=events', label: 'Editorial Approvals Hub', icon: ShieldCheck },
    ],
  },
  {
    id: 'accounts',
    title: 'Accounts & Legal',
    icon: KeyRound,
    links: [
      { to: '/login', label: 'All Accounts Sign In', icon: KeyRound, accent: true },
      { href: '/staff/admin-approvals.html', label: 'Admin & Staff Operations', icon: Shield, accent: true },
      { to: '/advertise', label: 'Advertise here', icon: Megaphone },
      { to: '/contact', label: 'Contact Us', icon: Mail },
      { to: '/knowledge-base', label: 'Knowledge Base & FAQ', icon: HelpCircle },
      { to: '/terms', label: 'Terms of Service', icon: ScrollText },
      { to: '/privacy', label: 'Privacy Policy', icon: Lock },
      { to: '/corrections', label: 'Statement of Corrections', icon: Scale },
      { to: '/press', label: 'Pressroom & Citations', icon: Megaphone },
    ],
  },
];

function FooterLink({ item }) {
  const Icon = item.icon;
  const cls = `group inline-flex items-center gap-3 py-1.5 min-h-[44px] text-[1.1375rem] leading-snug transition-colors ${
    item.accent ? 'text-sun-300 font-bold hover:text-white' : 'text-lake-100 hover:text-white'
  }`;
  const inner = (
    <>
      <Icon className="w-5 h-5 shrink-0 text-coral-300 group-hover:text-sun-300 transition-colors" aria-hidden="true" />
      <span className="group-hover:underline underline-offset-4">{item.label}</span>
      {item.accent && <ArrowRight className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />}
    </>
  );
  return item.to ? (
    <Link to={item.to} className={cls}>{inner}</Link>
  ) : (
    <a href={item.href} className={cls}>{inner}</a>
  );
}

export default function Footer() {
  const [openSection, setOpenSection] = useState(null);

  const toggleSection = (section) => {
    setOpenSection((prev) => (prev === section ? null : section));
  };

  return (
    <footer className="bg-lake-950 text-white mt-auto relative overflow-hidden">
      {/* Sunset horizon stripe */}
      <div aria-hidden="true" className="h-2 w-full bg-gradient-to-r from-coral-500 via-sun-400 to-coral-500" />

      <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 md:px-12 pt-10 pb-28 lg:pb-8">
        {/* Brand row */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-lake-800">
          <div className="space-y-3 max-w-md">
            <Link to="/" className="inline-block">
              <img
                src="/welcome-eg-logo.png"
                alt="Welcome East Gwillimbury"
                className="h-9 w-auto brightness-0 invert"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = 'welcome-eg-logo.png';
                }}
              />
            </Link>
            <p className="font-display text-2xl sm:text-3xl font-extrabold leading-tight text-white">
              Connecting community, newcomers, and local businesses across East Gwillimbury, Ontario.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/subscribe"
              className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-full bg-coral-600 hover:bg-sun-400 text-white hover:text-lake-950 font-black text-xs uppercase tracking-wider transition-colors focus-ring-dark"
            >
              <Mail className="w-4 h-4" aria-hidden="true" />
              Monday & Thursday Newsletter
            </Link>
            <Link
              to="/weather"
              className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-full border-2 border-lake-600 hover:border-sun-300 text-white font-black text-xs uppercase tracking-wider transition-colors"
            >
              <Sun className="w-4 h-4 text-sun-300" aria-hidden="true" />
              East Gwillimbury 7-Day Weather
            </Link>
          </div>
        </div>

        {/* Desktop: 3 link columns */}
        <div className="hidden lg:grid lg:grid-cols-3 gap-10 py-8 text-sm">
          {SECTIONS.map((section) => (
            <div key={section.id}>
              <h2 className="font-display text-lg font-extrabold text-white mb-3 tracking-tight">
                {section.title}
              </h2>
              <ul className="space-y-0.5">
                {section.links.map((item) => (
                  <li key={item.label}><FooterLink item={item} /></li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Tablet & mobile: accordions */}
        <div className="lg:hidden space-y-3 py-6">
          {SECTIONS.map((section) => {
            const SectionIcon = section.icon;
            const isOpen = openSection === section.id;
            return (
              <div key={section.id} className="rounded-2xl overflow-hidden bg-lake-900 border border-lake-800">
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center justify-between px-4 min-h-[52px] text-sm font-black uppercase tracking-wider text-white text-left cursor-pointer hover:bg-lake-800 transition-colors"
                >
                  <span className="flex items-center gap-2.5">
                    <SectionIcon className="w-4 h-4 text-coral-300" aria-hidden="true" />
                    <span>{section.title}</span>
                  </span>
                  <ChevronDown
                    className={`w-5 h-5 text-lake-200 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>
                {isOpen && (
                  <ul className="px-4 pb-3 pt-1 text-sm border-t border-lake-800">
                    {section.links.map((item) => (
                      <li key={item.label}><FooterLink item={item} /></li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom bar */}
        <div className="pt-6 border-t border-lake-800 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-lake-200 text-center sm:text-left">
          <div>
            <p>
              &copy; {new Date().getFullYear()} Welcome East Gwillimbury • Cheerful Media. All rights reserved.
            </p>
            <p className="mt-1">We are not responsible for errors or omissions.</p>
          </div>
          <div className="flex items-center gap-1 flex-wrap justify-center">
            <Link to="/terms" className="px-2 py-2 text-[0.975rem] hover:text-white hover:underline underline-offset-4 transition-colors">Terms</Link>
            <span aria-hidden="true">&bull;</span>
            <Link to="/privacy" className="px-2 py-2 text-[0.975rem] hover:text-white hover:underline underline-offset-4 transition-colors">Privacy</Link>
            <span aria-hidden="true">&bull;</span>
            <Link to="/corrections" className="px-2 py-2 text-[0.975rem] hover:text-white hover:underline underline-offset-4 transition-colors">Corrections</Link>
            <span aria-hidden="true">&bull;</span>
            <Link to="/contact" className="px-2 py-2 text-[0.975rem] hover:text-white hover:underline underline-offset-4 transition-colors">Contact Us</Link>
            <span aria-hidden="true">&bull;</span>
            <Link to="/directory" className="px-2 py-2 text-[0.975rem] hover:text-white hover:underline underline-offset-4 transition-colors">Directory</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
