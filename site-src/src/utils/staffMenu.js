/**
 * Staff menu: ONE entry per destination. The link name comes from the destination
 * page, so the same page is never listed twice under two different names.
 * Keep identical (hrefs, labels, tiers) to WG_STAFF_MENU in website/shared/config.js.
 * Tiers: 'editorial' = every staff role, 'admin' = Admin and Super Admin only.
 */
export const STAFF_MENU = [
  { title: 'Review & Approvals', items: [
    { href: '/staff/admin-approvals.html', label: 'Approvals Queue', tier: 'editorial' },
    { href: '/staff/admin-approvals.html?view=import', label: 'Import from URL', tier: 'editorial' },
    { href: '/staff/unverified.html', label: 'Unverified Submissions', tier: 'editorial' },
    { href: '/staff/corrections.html', label: 'Statements of Correction', tier: 'editorial' },
    { href: '/staff/ask-wg.html', label: 'Ask WEG Chats &amp; Leads', tier: 'admin' },
    { href: '/submit-event', label: 'Submit / Add Event', tier: 'editorial' },
  ] },
  { title: 'Advertising Management', items: [
    { href: '/staff/search-sponsors.html', label: 'Quick Search Sponsors', tier: 'admin' },
    { href: '/staff/spotlight.html', label: 'Spotlight Schedule', tier: 'admin' },
    { href: '/staff/gallery.html', label: 'Home Gallery Ads', tier: 'admin' },
    { href: '/staff/pressroom.html', label: 'Pressroom Releases', tier: 'admin' },
    { href: '/staff/newsletter-ads.html', label: 'Newsletter Ad Inserts', tier: 'admin' },
    { href: '/advertise', label: 'Advertise & Ad Intake', tier: 'admin' },
  ] },
  { title: 'Newsletter & Social', items: [
    { href: '/staff/subscribers.html', label: 'Newsletter Subscribers', tier: 'admin' },
    { href: '/staff/special-edition.html', label: 'Special Edition Studio', tier: 'editorial' },
    { href: '/staff/test.html', label: 'Test Newsletter Dispatch', tier: 'admin' },
    { href: '/staff/admin-approvals.html?view=facebook', label: 'Facebook Post Copy', tier: 'editorial' },
  ] },
  { title: 'Directory & Newsroom', items: [
    { href: '/staff/businesses.html', label: 'Business Directory Editor', tier: 'admin' },
    { href: '/staff/lead-hunter.html', label: 'Lead Hunter (Google Import)', tier: 'admin' },
    { href: '/hamper/admin.html', label: 'Welcome Hamper Admin', tier: 'admin' },
    { href: '/staff/sources.html', label: 'Newsroom & RSS Sources', tier: 'admin' },
    { href: '/news/newsroom.html', label: '90-Day Newsroom Calendar', tier: 'editorial' },
    { href: '/press', label: 'Public Pressroom', tier: 'editorial' },
  ] },
  { title: 'Reports & Tools', items: [
    { href: '/staff/clicks.html', label: 'Click Report', tier: 'admin' },
    { href: '/business/index.html', label: 'Business & Admin Stats Portal', tier: 'admin' },
    { href: '/staff/audit.html', label: 'Crawl Audit & Pipeline Runner', tier: 'admin' },
    { href: '/staff/blacklist.html', label: 'URL Blacklist Manager', tier: 'admin' },
    { href: '/staff/backup.html', label: 'Full Backup & Recovery', tier: 'admin' },
  ] },
  { title: 'Shortcuts', items: [
    { href: '/my-submissions', label: 'My Submissions', tier: 'editorial' },
    { href: '/corrections', label: 'Public Corrections Page', tier: 'editorial' },
    { href: '/', label: 'Public Website', tier: 'editorial' },
  ] },
];

/** Groups/items the given role may see (empty groups are dropped). */
export function staffMenuFor(isSysAdmin) {
  return STAFF_MENU
    .map((g) => ({ title: g.title, items: g.items.filter((i) => i.tier === 'editorial' || isSysAdmin) }))
    .filter((g) => g.items.length > 0);
}

/** Static pages (not React routes) need a full page load. */
export function isStaticStaffHref(href) {
  return /^\/(staff|news|hamper|business)\//.test(href);
}
