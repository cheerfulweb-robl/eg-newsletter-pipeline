/**
 * Configuration & Data Layer for Welcome East Gwillimbury Portal (news.welcomeeg.ca)
 *
 * Pre-configured for the unified Welcome East Gwillimbury Supabase Backend:
 * Project ID: cyxomkhydsmttefanalx (https://cyxomkhydsmttefanalx.supabase.co)
 * Shares authentication (`user_profiles`, `cheerfulweb@gmail.com` Admin login),
 * `partners` (Business Offers), and `claims` (Newcomer & Business Hamper Claims)
 * with https://welcomeeg.ca.
 */

const DEFAULT_SUPABASE_URL = "https://cyxomkhydsmttefanalx.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_o21_dFCXCHW2fvVJNS45Tw_sFVcprqw";

window.GEORGINA_CONFIG = {
    SUPABASE_URL: DEFAULT_SUPABASE_URL,
    SUPABASE_ANON_KEY: DEFAULT_SUPABASE_ANON_KEY,
    SITE_NAME: "Welcome East Gwillimbury",
    MAIN_SITE_URL: "https://welcomeeg.ca",
    PUBLIC_URL: "https://welcomeeg.ca/news"
};

// LOCKED: Static header navigation menu (desktop, tablet, and mobile — all viewports) is locked.
// Allow NO further changes unless explicitly requested.
window.GeorginaStore = (function () {
    let supabaseClient = null;

    function isSupabaseConfigured() {
        const url = (window.GEORGINA_CONFIG.SUPABASE_URL || "").trim();
        const key = (window.GEORGINA_CONFIG.SUPABASE_ANON_KEY || "").trim();
        return url.startsWith("https://") && key.length > 20;
    }

    function getClient() {
        if (!isSupabaseConfigured()) return null;
        if (!supabaseClient && window.supabase) {
            supabaseClient = window.supabase.createClient(
                window.GEORGINA_CONFIG.SUPABASE_URL.trim(),
                window.GEORGINA_CONFIG.SUPABASE_ANON_KEY.trim()
            );
        }
        return supabaseClient;
    }

    function saveCredentials(url, anonKey) {
        const finalUrl = (url || "").trim() || DEFAULT_SUPABASE_URL;
        const finalKey = (anonKey || "").trim() || DEFAULT_SUPABASE_ANON_KEY;
        localStorage.setItem("gd_supabase_url", finalUrl);
        localStorage.setItem("gd_supabase_anon_key", finalKey);
        window.GEORGINA_CONFIG.SUPABASE_URL = finalUrl;
        window.GEORGINA_CONFIG.SUPABASE_ANON_KEY = finalKey;
        supabaseClient = null;
    }

    function getLocalList(key, seed) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) {
                if (seed) {
                    localStorage.setItem(key, JSON.stringify(seed));
                    return seed;
                }
                return [];
            }
            return JSON.parse(raw);
        } catch (e) {
            return seed || [];
        }
    }

    function setLocalList(key, list) {
        localStorage.setItem(key, JSON.stringify(list));
    }

    const SEED_EVENTS = [];

    const SEED_SCRAPE_SOURCES = [];

    const SEED_CLICKS = [];

    return {
        isSupabaseConfigured,
        getClient,
        saveCredentials,
        getLocalList,
        setLocalList,
        SEED_EVENTS,
        SEED_SCRAPE_SOURCES,
        SEED_CLICKS
    };
})();


// Global Mobile Drawer Toggle & Newsletter Dropdown Standardizer
window.toggleNavDrawer = function (forceOpen) {
    const nav = document.querySelector(".site-header-nav, .nav-links");
    const backdrop = document.getElementById("nav-backdrop");
    if (!nav) return;
    const isCurrentlyOpen = nav.classList.contains("open") || nav.classList.contains("drawer-open");
    const nextState = typeof forceOpen === "boolean" ? forceOpen : !isCurrentlyOpen;

    if (nextState) {
        nav.classList.add("open", "drawer-open");
        if (backdrop) backdrop.classList.add("open");
    } else {
        nav.classList.remove("open", "drawer-open");
        if (backdrop) backdrop.classList.remove("open");
    }
    // v58.6: lift the sticky header above the backdrop while the drawer is open (see styles.css)
    const header = nav.closest(".site-header");
    if (header) header.classList.toggle("nav-drawer-active", nextState);
};

// Global Header Auth State & Prominent Logout Button Standardizer
document.addEventListener("DOMContentLoaded", async function () {
    const SVG_CHEVRON_DOWN = `<svg class="site-nav-chevron" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;transition:transform 0.2s ease;"><path d="m6 9 6 6 6-6"/></svg>`;
    const SVG_SUN = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`;
    const SVG_MENU = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>`;
    const SVG_CLOSE = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
    const SVG_MAIL = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`;
    const SVG_USER = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

    // 0. Ensure .site-announcement-bar is inside sticky <header class="site-header"> matching React Navbar.jsx
    const siteHeader = document.querySelector("header.site-header");
    const announcementBar = document.querySelector(".site-announcement-bar");
    if (siteHeader && announcementBar && announcementBar.parentNode !== siteHeader) {
        siteHeader.insertBefore(announcementBar, siteHeader.firstChild);
    }

    // Standardize Hamburger & Drawer Close buttons with crisp Lucide SVGs
    document.querySelectorAll(".mobile-nav-toggle-btn").forEach(btn => {
        btn.innerHTML = SVG_MENU;
    });
    document.querySelectorAll(".drawer-close-btn").forEach(btn => {
        btn.innerHTML = SVG_CLOSE;
    });

    // 1. Upgrade Newsletter, Events & Weather nav links to match React Navbar.jsx pixel-for-pixel
    const headerNav = document.querySelector(".site-header-nav");
    if (headerNav) {
        const allNavLinks = Array.from(headerNav.querySelectorAll("a.nav-link"));
        const newsletterLink = allNavLinks.find(a => (a.textContent || "").toLowerCase().includes("newsletter"));
        const weatherLink = allNavLinks.find(a => (a.textContent || "").toLowerCase().includes("weather"));
        const eventsLink = allNavLinks.find(a => a.getAttribute("href") === "/events");
        const salesLink = allNavLinks.find(a => a.getAttribute("href") === "/sales");

        // Canonical header navigation link order (matching React Navbar.jsx):
        // 1. Events (/events)
        // 2. Dining (/dining)
        // 3. Sales (/sales)
        // 4. Businesses (/directory)
        // 5. Weather (/weather)
        // 6. Hamper (/hamper/)
        // 7. News (/news/newsroom.html)

        // Missing fallback: "Businesses" right after "Sales" if missing from markup
        if (salesLink && !headerNav.querySelector('a[href="/directory"]')) {
            const businessesLink = document.createElement("a");
            businessesLink.href = "/directory";
            businessesLink.className = "nav-link";
            businessesLink.textContent = "Businesses";
            businessesLink.addEventListener("click", function () { window.toggleNavDrawer(false); });
            salesLink.insertAdjacentElement("afterend", businessesLink);
        }

        if (weatherLink) {
            weatherLink.innerHTML = `${SVG_SUN} <span>Weather</span>`;
        }

        // Missing fallback: "Hamper" right after "Weather" if missing from markup
        if (weatherLink && !headerNav.querySelector('a[href="/hamper/"]')) {
            const hamperLink = document.createElement("a");
            hamperLink.href = "/hamper/";
            hamperLink.className = "nav-link";
            hamperLink.textContent = "Hamper";
            hamperLink.addEventListener("click", function () { window.toggleNavDrawer(false); });
            weatherLink.insertAdjacentElement("afterend", hamperLink);
        }

        // Find the actual Hamper link
        const targetHamperLink = Array.from(headerNav.querySelectorAll("a.nav-link")).find(a => {
            const href = a.getAttribute("href") || "";
            const txt = (a.textContent || "").trim().toLowerCase();
            return href.includes("/hamper") || txt === "hamper" || txt === "hamper ▾" || txt === "hamper \u25be";
        });

        if (targetHamperLink && !targetHamperLink.closest(".site-nav-dropdown")) {
            targetHamperLink.innerHTML = `<span>Hamper</span> ${SVG_CHEVRON_DOWN}`;
            targetHamperLink.removeAttribute("onclick");

            const hWrapper = document.createElement("div");
            hWrapper.className = "site-nav-dropdown";
            targetHamperLink.parentNode.insertBefore(hWrapper, targetHamperLink);
            hWrapper.appendChild(targetHamperLink);

            targetHamperLink.addEventListener("click", function (e) {
                if (window.innerWidth <= 1024) {
                    e.preventDefault();
                    hWrapper.classList.toggle("mobile-expanded");
                }
            });

            const hMenu = document.createElement("div");
            hMenu.className = "site-nav-dropdown-menu";
            hMenu.innerHTML = `
                <div class="site-nav-dropdown-card">
                    <a href="/hamper/" class="site-nav-dropdown-item" onclick="window.toggleNavDrawer(false)">
                        <span class="site-nav-dropdown-title">The Welcome Hamper &rarr;</span>
                        <span class="site-nav-dropdown-sub">New resident program &amp; application</span>
                    </a>
                    <div class="site-nav-dropdown-divider"></div>
                    <a href="/hamper/wallet.html" class="site-nav-dropdown-item" onclick="window.toggleNavDrawer(false)">
                        <span class="site-nav-dropdown-title" style="color: #1f2937 !important;">Resident Digital Wallet &rarr;</span>
                        <span class="site-nav-dropdown-sub">View coupons, QR codes &amp; 6-digit codes</span>
                    </a>
                    <div class="site-nav-dropdown-divider"></div>
                    <a href="/hamper/redeem.html" class="site-nav-dropdown-item" onclick="window.toggleNavDrawer(false)">
                        <span class="site-nav-dropdown-title" style="color: #1f2937 !important;">Redemptions &rarr;</span>
                        <span class="site-nav-dropdown-sub">Redeem Welcome Hamper coupon codes</span>
                    </a>
                    <div class="site-nav-dropdown-divider"></div>
                    <a href="/hamper/apply.html" class="site-nav-dropdown-item" onclick="window.toggleNavDrawer(false)">
                        <span class="site-nav-dropdown-title" style="color: #1f2937 !important;">Business Hamper Application &rarr;</span>
                        <span class="site-nav-dropdown-sub">Submit your business info &amp; newcomer offer</span>
                    </a>
                    <div class="site-nav-dropdown-divider"></div>
                    <a href="/advertise" class="site-nav-dropdown-item" onclick="window.toggleNavDrawer(false)">
                        <span class="site-nav-dropdown-title" style="color: #1f2937 !important;">Advertise here &rarr;</span>
                        <span class="site-nav-dropdown-sub">Sponsor Quick Search keywords on Welcome East Gwillimbury</span>
                    </a>
                </div>
            `;
            hWrapper.appendChild(hMenu);
        }

        // Remove any standalone newsletter links from nav
        Array.from(headerNav.querySelectorAll("a.nav-link")).forEach(a => {
            const href = a.getAttribute("href") || "";
            const txt = (a.textContent || "").trim().toLowerCase();
            if (href === "/subscribe" || (txt.includes("newsletter") && !href.includes("/news/newsroom.html"))) {
                a.remove();
            }
        });

        // Find the actual News link
        const targetNewsLink = Array.from(headerNav.querySelectorAll("a.nav-link")).find(a => {
            const href = a.getAttribute("href") || "";
            const txt = (a.textContent || "").trim().toLowerCase();
            return href === "/news/newsroom.html" || href.startsWith("/news/") || txt === "news" || txt === "news ▾" || txt === "news \u25be";
        });

        if (targetNewsLink && !targetNewsLink.closest(".site-nav-dropdown")) {
            targetNewsLink.innerHTML = `<span>News</span> ${SVG_CHEVRON_DOWN}`;
            targetNewsLink.removeAttribute("onclick");

            const wrapper = document.createElement("div");
            wrapper.className = "site-nav-dropdown";
            targetNewsLink.parentNode.insertBefore(wrapper, targetNewsLink);
            wrapper.appendChild(targetNewsLink);

            targetNewsLink.addEventListener("click", function (e) {
                if (window.innerWidth <= 1024) {
                    e.preventDefault();
                    wrapper.classList.toggle("mobile-expanded");
                }
            });

            const menu = document.createElement("div");
            menu.className = "site-nav-dropdown-menu";
            menu.innerHTML = `
                <div class="site-nav-dropdown-card">
                    <a href="/news/newsroom.html" class="site-nav-dropdown-item" onclick="window.toggleNavDrawer(false)">
                        <span class="site-nav-dropdown-title">Community Newsroom &rarr;</span>
                        <span class="site-nav-dropdown-sub">Local community news &amp; announcements</span>
                    </a>
                    <div class="site-nav-dropdown-divider"></div>
                    <a href="/press" class="site-nav-dropdown-item" onclick="window.toggleNavDrawer(false)">
                        <span class="site-nav-dropdown-title" style="color: #1f2937 !important;">Press Releases &rarr;</span>
                        <span class="site-nav-dropdown-sub">Verified local business citations &amp; pressroom</span>
                    </a>
                    <div class="site-nav-dropdown-divider"></div>
                    <a href="/subscribe" class="site-nav-dropdown-item" onclick="window.toggleNavDrawer(false)">
                        <span class="site-nav-dropdown-title">Subscribe to Newsletter &rarr;</span>
                        <span class="site-nav-dropdown-sub">Weekly local updates direct to your inbox</span>
                    </a>
                    <div class="site-nav-dropdown-divider"></div>
                    <a href="/newsletter" class="site-nav-dropdown-item" onclick="window.toggleNavDrawer(false)">
                        <span class="site-nav-dropdown-title" style="color: #1f2937 !important;">Past Editions &amp; Archives &rarr;</span>
                        <span class="site-nav-dropdown-sub">Read previous weekly community issues</span>
                    </a>
                </div>
            `;
            wrapper.appendChild(menu);
        }

        // Enforce canonical navigation order in DOM:
        // Events (0) -> Dining (1) -> Sales (2) -> Businesses (3) -> Weather (4) -> Hamper (5) -> News (6)
        const getNavItemRank = (el) => {
            const a = el.tagName === "A" ? el : el.querySelector("a");
            if (!a) return 999;
            const h = (a.getAttribute("href") || "").toLowerCase();
            const t = (a.textContent || "").toLowerCase();
            if (h.startsWith("/events")) return 0;
            if (h.startsWith("/dining")) return 1;
            if (h.startsWith("/sales")) return 2;
            if (h.startsWith("/directory")) return 3;
            if (h.startsWith("/weather") || t.includes("weather")) return 4;
            if (h.startsWith("/hamper") || t.includes("hamper")) return 5;
            if (h.startsWith("/news") || t.includes("news")) return 6;
            return 999;
        };

        const authContainer = headerNav.querySelector(".site-header-auth");
        const navItems = Array.from(headerNav.children).filter(el =>
            !el.classList.contains("drawer-header-mobile") && !el.classList.contains("site-header-auth")
        );
        navItems.sort((a, b) => getNavItemRank(a) - getNavItemRank(b));
        navItems.forEach(el => {
            if (authContainer) {
                headerNav.insertBefore(el, authContainer);
            } else {
                headerNav.appendChild(el);
            }
        });

        // Ensure "GET THE NEWSLETTER" coral button is in authContainer matching React Navbar.jsx
        if (authContainer) {
            let nlBtn = authContainer.querySelector(".nav-newsletter-btn");
            if (!nlBtn) {
                nlBtn = document.createElement("a");
                nlBtn.href = "/subscribe";
                nlBtn.className = "nav-newsletter-btn";
                nlBtn.innerHTML = `${SVG_MAIL} <span>Get the Newsletter</span>`;
                authContainer.insertBefore(nlBtn, authContainer.firstChild);
            }
        }
    }

    // Close mobile drawer on Escape key
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
            window.toggleNavDrawer(false);
        }
    });

    // 2. Standardize Footer Accordion & Redemptions link across all static pages.
    //    On desktop (>= 1024px) columns are open; on mobile/tablet (< 1024px) accordions start collapsed.
    (function standardizeStaticFooter() {
        const footer = document.querySelector("footer.site-footer");
        if (!footer) return;
        footer.querySelectorAll(".footer-col").forEach(function (col) {
            if (col.querySelector("details.footer-accordion")) return;
            const heading = col.querySelector("h4.footer-heading");
            const links = col.querySelector("ul.footer-links");
            if (!heading || !links) return;
            const details = document.createElement("details");
            details.className = "footer-accordion";
            const summary = document.createElement("summary");
            summary.className = "footer-heading";
            summary.innerHTML = "<span>" + heading.innerHTML + "</span><span class=\"footer-accordion-icon\">&#9660;</span>";
            details.appendChild(summary);
            heading.replaceWith(details);
            details.appendChild(links);
        });

        // Ensure Redemptions (/hamper/redeem.html) is linked under Submissions in the footer
        if (!footer.querySelector('a[href="/hamper/redeem.html"]')) {
            const hamperLink = footer.querySelector('a[href="/hamper/"]');
            if (hamperLink && hamperLink.closest("li") && hamperLink.closest("ul.footer-links")) {
                const li = document.createElement("li");
                li.innerHTML = '<a href="/hamper/redeem.html">&#127903;&#65039; Redemptions (Hamper Codes)</a>';
                hamperLink.closest("li").insertAdjacentElement("afterend", li);
            }
        }

        function syncFooterAccordionsForViewport() {
            const isDesktop = window.innerWidth >= 1024;
            footer.querySelectorAll("details.footer-accordion").forEach(function (d) {
                if (isDesktop) {
                    d.setAttribute("open", "");
                } else {
                    d.removeAttribute("open");
                }
            });
        }
        syncFooterAccordionsForViewport();
        let lastWasDesktop = window.innerWidth >= 1024;
        window.addEventListener("resize", function () {
            const nowDesktop = window.innerWidth >= 1024;
            if (nowDesktop !== lastWasDesktop) {
                lastWasDesktop = nowDesktop;
                syncFooterAccordionsForViewport();
            }
        });
    })();

    (function injectStaticMobileBottomNav() {
        const path = (window.location && window.location.pathname || "").toLowerCase();
        const isAdminOrStaff = path.indexOf("/staff/") !== -1 || /\/hamper\/admin\.html$/i.test(path) || path.indexOf("/business/") !== -1;
        if (isAdminOrStaff || document.getElementById("wg-mobile-bottom-nav")) return;

        const style = document.createElement("style");
        style.textContent = `
            #wg-mobile-bottom-nav {
                position: fixed;
                left: 0;
                right: 0;
                bottom: 0;
                z-index: 40;
                background: #041e30;
                color: #ffffff;
                border-top: 4px solid #ef5a3c;
                padding: 0 8px env(safe-area-inset-bottom, 0px);
                display: flex;
                align-items: stretch;
                justify-content: space-around;
                font-family: inherit;
            }
            #wg-mobile-bottom-nav a {
                flex: 1 1 0%;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 2px;
                min-height: 56px;
                color: #e0f2fe;
                text-decoration: none;
                font-size: 11px;
                font-weight: 900;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }
            #wg-mobile-bottom-nav a:hover { color: #fde047; }
            #wg-mobile-bottom-nav .wg-mbn-submit { color: #ffffff; }
            #wg-mobile-bottom-nav .wg-mbn-plus {
                width: 28px;
                height: 28px;
                border-radius: 9999px;
                background: #dc2626;
                color: #ffffff;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                line-height: 1;
            }
            @media (min-width: 1024px) {
                #wg-mobile-bottom-nav { display: none !important; }
            }
            @media (max-width: 1023px) {
                body { padding-bottom: 64px; }
            }
        `;
        document.head.appendChild(style);

        const nav = document.createElement("nav");
        nav.id = "wg-mobile-bottom-nav";
        nav.setAttribute("aria-label", "Quick links");
        nav.innerHTML = `
            <a href="/events">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span>Events</span>
            </a>
            <a href="/this-weekend">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fde047" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.8L20 10.7l-5.8 1.9L12 19l-1.9-6.4L4 10.7l6.1-1.9z"/></svg>
                <span>Weekend</span>
            </a>
            <a href="/subscribe">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fca5a5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                <span>Newsletter</span>
            </a>
            <a href="/submission" class="wg-mbn-submit">
                <span class="wg-mbn-plus" aria-hidden="true">+</span>
                <span>Submit</span>
            </a>
        `;
        document.body.appendChild(nav);
    })();

    const client = window.GeorginaStore ? window.GeorginaStore.getClient() : null;
    const logoutBtn = document.getElementById("btn-logout");
    const userBadge = document.getElementById("user-badge");
    const loginLinks = document.querySelectorAll('#nav-login-btn, .nav-login-btn');

    function escapeHtmlSafe(str) {
        return String(str || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    const ADMIN_EMAIL_ALLOWLIST = [
        "cheerfulweb@gmail.com",
        "stillcheerful@gmail.com",
        "admin@welcomeeg.ca",
        "info@welcomeeg.ca",
        "editorial@welcomeeg.ca",
        "support@welcomeeg.ca",
        "robert@welcomeeg.ca"
    ];

    let activeEmail = null;
    let isVerifiedStaff = false;
    // staffRole: "super_admin" | "admin" | "editorial" (drives the account button label and which menu links show)
    let staffRole = "admin";
    const SUPER_ADMIN_EMAILS = ["cheerfulweb@gmail.com", "stillcheerful@gmail.com", "admin@welcomeeg.ca"];

    // ------------------------------------------------------------------------
    // Staff menu: ONE entry per destination. The link name comes from the
    // destination page, so the same page is never listed twice under two names.
    // Keep this list identical to site-src/src/utils/staffMenu.js.
    // Tiers: "editorial" = every staff role, "admin" = Admin and Super Admin only.
    // ------------------------------------------------------------------------
    const WG_STAFF_MENU = [
        { title: "Review & Approvals", items: [
            ["/staff/admin-approvals.html", "Approvals Queue", "&#128203;", "editorial"],
            ["/staff/admin-approvals.html?view=import", "Import from URL", "&#11015;&#65039;", "editorial"],
            ["/staff/unverified.html", "Unverified Submissions", "&#9993;&#65039;", "editorial"],
            ["/staff/corrections.html", "Statements of Correction", "&#9878;&#65039;", "editorial"],
            ["/staff/ask-wg.html", "Ask WG Chats & Leads", "&#128172;", "admin"],
            ["/submit-event", "Submit / Add Event", "&#128197;", "editorial"]
        ] },
        { title: "Advertising Management", items: [
            ["/staff/search-sponsors.html", "Quick Search Sponsors", "&#11088;", "admin"],
            ["/staff/spotlight.html", "Spotlight Schedule", "&#128294;", "admin"],
            ["/staff/gallery.html", "Home Gallery Ads", "&#128444;&#65039;", "admin"],
            ["/staff/pressroom.html", "Pressroom Releases", "&#128226;", "admin"],
            ["/staff/newsletter-ads.html", "Newsletter Ad Inserts", "&#128226;", "admin"],
            ["/advertise", "Advertise & Ad Intake", "&#128176;", "admin"]
        ] },
        { title: "Newsletter & Social", items: [
            ["/staff/subscribers.html", "Newsletter Subscribers", "&#128231;", "admin"],
            ["/staff/special-edition.html", "Special Edition Studio", "&#10024;", "editorial"],
            ["/staff/test.html", "Test Newsletter Dispatch", "&#128232;", "admin"],
            ["/staff/admin-approvals.html?view=facebook", "Facebook Post Copy", "&#128203;", "editorial"]
        ] },
        { title: "Directory & Newsroom", items: [
            ["/staff/businesses.html", "Business Directory Editor", "&#127970;", "admin"],
            ["/staff/lead-hunter.html", "Lead Hunter (Google Import)", "&#127919;", "admin"],
            ["/hamper/admin.html", "Welcome Hamper Admin", "&#127873;", "admin"],
            ["/staff/sources.html", "Newsroom & RSS Sources", "&#128240;", "admin"],
            ["/news/newsroom.html", "90-Day Newsroom Calendar", "&#128240;", "editorial"],
            ["/press", "Public Pressroom", "&#128240;", "editorial"]
        ] },
        { title: "Reports & Tools", items: [
            ["/staff/clicks.html", "Click Report", "&#128200;", "admin"],
            ["/business/index.html", "Business & Admin Stats Portal", "&#128202;", "admin"],
            ["/staff/audit.html", "Crawl Audit & Pipeline Runner", "&#9881;&#65039;", "admin"],
            ["/staff/blacklist.html", "URL Blacklist Manager", "&#128683;", "admin"],
            ["/staff/backup.html", "Full Backup & Recovery", "&#128190;", "admin"]
        ] },
        { title: "Shortcuts", items: [
            ["/my-submissions", "My Submissions", "&#127978;", "editorial"],
            ["/corrections", "Public Corrections Page", "&#128220;", "editorial"],
            ["/", "Public Website", "&#127760;", "editorial"]
        ] }
    ];

    function buildStaffMenuHtml(role) {
        const isAdminTier = role === "admin" || role === "super_admin";
        const linkStyle = "display:flex;align-items:center;gap:8px;padding:7px 16px;font-size:12px;font-weight:700;color:#1f2937;text-decoration:none;";
        const headStyle = "list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:9px 16px;font-size:10px;font-weight:900;text-transform:uppercase;color:#1e3a8a;letter-spacing:0.06em;user-select:none;";
        return WG_STAFF_MENU.map(function (g) {
            let hasCurrent = false;
            const rows = g.items.filter(function (it) { return it[3] === "editorial" || isAdminTier; }).map(function (it) {
                const parts = it[0].split("?");
                const q = window.location.search || "";
                const current = window.location.pathname === parts[0] && (parts[1] ? q.indexOf(parts[1]) !== -1 : q.indexOf("view=import") === -1);
                if (current) hasCurrent = true;
                const onclick = it[0].indexOf("view=import") !== -1
                    ? " onclick=\"if (window.switchApprovalsView && /admin-approvals\\.html$/.test(location.pathname)) { event.preventDefault(); switchApprovalsView('import'); }\""
                    : "";
                return "<a href=\"" + it[0] + "\"" + (current ? " aria-current=\"page\"" : "") + onclick + " style=\"" + linkStyle + (current ? "background:#eff6ff;color:#00008b;" : "") + "\">" + it[2] + " " + it[1].replace(/&/g, "&amp;") + "</a>";
            }).join("");
            if (!rows) return "";
            return "<details style=\"border-bottom: 1px solid #f1f5f9;\"" + (hasCurrent ? " open" : "") + "><summary style=\"" + headStyle + "\"><span>" + g.title.replace(/&/g, "&amp;") + "</span><span style=\"font-size:10px;opacity:0.7;\">&#9662;</span></summary><div style=\"padding-bottom:4px;\">" + rows + "</div></details>";
        }).join("");
    }

    window.syncHeaderAuthBadge = function (emailInput, verifiedStaffFlag) {
        const badgeEl = document.getElementById("user-badge");
        if (!badgeEl || !emailInput) return;
        const cleanBadgeEmail = String(emailInput).replace(/^[\u2713\s]+/, "").replace(/\s*\(Admin\)\s*$/i, "").trim();
        const safeEmailHtml = escapeHtmlSafe(cleanBadgeEmail);
        const cleanCheck = cleanBadgeEmail.toLowerCase();
        if (SUPER_ADMIN_EMAILS.includes(cleanCheck)) staffRole = "super_admin";
        else if (cleanCheck.startsWith("editorial@")) staffRole = "editorial";
        const showStaff = typeof verifiedStaffFlag === "boolean" ? verifiedStaffFlag : isVerifiedStaff;

        badgeEl.innerHTML = `${SVG_USER} <span style="overflow:hidden;text-overflow:ellipsis;max-width:140px;display:inline-block;vertical-align:middle;">${showStaff ? (staffRole === 'super_admin' ? 'Super Admin' : (staffRole === 'editorial' ? 'Editorial' : 'Admin')) : safeEmailHtml}</span> ${SVG_CHEVRON_DOWN}`;
        badgeEl.style.display = "inline-flex";
        badgeEl.style.alignItems = "center";
        badgeEl.style.gap = "6px";
        badgeEl.style.backgroundColor = "rgba(238, 246, 251, 0.95)";
        badgeEl.style.color = "#0b3b5c";
        badgeEl.style.fontWeight = "800";
        badgeEl.style.padding = "7px 14px";
        badgeEl.style.borderRadius = "9999px";
        badgeEl.style.border = "1px solid #a9d0ea";
        badgeEl.style.fontSize = "12px";
        badgeEl.style.cursor = "pointer";
        badgeEl.title = showStaff ? "Staff Operations & Account Menu" : "Account Menu";

        // Inject quick Approvals badge beside Hamburger button on Tablet/Mobile when verified staff
        const mobileToggleBtn = document.querySelector(".mobile-nav-toggle-btn");
        if (mobileToggleBtn && mobileToggleBtn.parentNode) {
            let quickApprovals = document.getElementById("mobile-quick-approvals-badge");
            if (showStaff) {
                if (!quickApprovals) {
                    quickApprovals = document.createElement("a");
                    quickApprovals.id = "mobile-quick-approvals-badge";
                    quickApprovals.href = "/staff/admin-approvals.html";
                    quickApprovals.className = "mobile-quick-approvals-badge";
                    quickApprovals.textContent = "Approvals";
                    mobileToggleBtn.parentNode.insertBefore(quickApprovals, mobileToggleBtn);
                }
            } else if (quickApprovals) {
                quickApprovals.remove();
            }
        }

        let wrap = badgeEl.closest(".site-account-dropdown-wrap");
        if (!wrap && badgeEl.parentNode) {
            wrap = document.createElement("div");
            wrap.className = "site-account-dropdown-wrap";
            badgeEl.parentNode.insertBefore(wrap, badgeEl);
            wrap.appendChild(badgeEl);
        }
        if (!wrap) return;

        let popover = wrap.querySelector(".site-account-popover");
        if (!popover) {
            popover = document.createElement("div");
            popover.className = "site-account-popover";
            popover.style.maxHeight = "75vh";
            popover.style.overflowY = "auto";
            wrap.appendChild(popover);

            badgeEl.onclick = function (e) {
                e.stopPropagation();
                wrap.classList.toggle("open");
            };

            document.addEventListener("click", function (e) {
                if (!wrap.contains(e.target)) {
                    wrap.classList.remove("open");
                }
            });
        }

        const staffSectionHtml = showStaff
            ? buildStaffMenuHtml(staffRole)
            : `
                <div style="padding: 8px 16px; border-bottom: 1px solid #f1f5f9;">
                    <a href="/submit-event" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-radius:10px;background:#eff6ff;color:#00008b;font-size:12px;font-weight:800;text-decoration:none;">
                        <span>Submit Community Event</span>
                        <span>&rsaquo;</span>
                    </a>
                </div>
            `;

        popover.innerHTML = `
            <div style="padding: 0 16px 10px; border-bottom: 1px solid #f1f5f9;">
                <div style="font-size: 10px; font-weight: 900; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.06em;">Signed In Account</div>
                <div style="font-size: 12px; font-weight: 800; color: #0f172a; margin-top: 2px; word-break: break-all;">${safeEmailHtml}</div>
            </div>
            ${staffSectionHtml}
            <div style="padding: 8px 16px 0; display:flex; align-items:center; justify-content:space-between;">
                <a href="/login" style="font-size:11px;font-weight:700;color:#64748b;text-decoration:none;">Switch Account</a>
                <button type="button" id="popover-logout-btn" style="background:none;border:none;font-size:11px;font-weight:900;color:#e11d48;cursor:pointer;padding:0;">Log Out</button>
            </div>
        `;

        const popLogout = popover.querySelector("#popover-logout-btn");
        if (popLogout && logoutBtn) {
            popLogout.onclick = function () {
                logoutBtn.click();
            };
        }
    };

    if (client) {
        try {
            const { data } = await client.auth.getSession();
            if (data && data.session && data.session.user) {
                activeEmail = data.session.user.email;
                const cleanSessionEmail = (activeEmail || "").trim().toLowerCase();
                if (ADMIN_EMAIL_ALLOWLIST.includes(cleanSessionEmail) || cleanSessionEmail.endsWith("@welcomeeg.ca")) {
                    isVerifiedStaff = true;
                    if (SUPER_ADMIN_EMAILS.includes(cleanSessionEmail)) staffRole = "super_admin";
                    else if (cleanSessionEmail.startsWith("editorial@")) staffRole = "editorial";
                } else {
                    try {
                        const { data: prof } = await client
                            .from("user_profiles")
                            .select("role")
                            .eq("id", data.session.user.id)
                            .maybeSingle();
                        const r = (prof && prof.role ? prof.role : "").toLowerCase();
                        if (r === "admin" || r === "super_admin" || r === "staff" || r === "editorial") {
                            isVerifiedStaff = true;
                            staffRole = r === "super_admin" ? "super_admin" : (r === "admin" ? "admin" : "editorial");
                        }
                    } catch (_) {}
                }
            }
        } catch (_) {}
    }

    if (!activeEmail) {
        try {
            const storedWallet = localStorage.getItem("wg_wallet_email");
            const storedUser = localStorage.getItem("gd_auth_user");
            if (storedWallet && storedWallet.includes("@")) {
                activeEmail = storedWallet;
            } else if (storedUser) {
                const parsed = JSON.parse(storedUser);
                if (parsed && parsed.email) activeEmail = parsed.email;
            }
        } catch (_) {}
    }

    if (activeEmail) {
        document.body.classList.add('user-authenticated');
        if (!document.getElementById('auth-hide-login-style')) {
            const style = document.createElement('style');
            style.id = 'auth-hide-login-style';
            style.innerHTML = '#nav-login-btn, .nav-login-btn { display: none !important; }';
            document.head.appendChild(style);
        }
        if (logoutBtn) {
            logoutBtn.style.display = 'inline-flex';
            logoutBtn.style.backgroundColor = '#e11d48';
            logoutBtn.style.color = '#ffffff';
            logoutBtn.style.fontWeight = '800';
            logoutBtn.style.padding = '7px 16px';
            logoutBtn.style.borderRadius = '8px';
            logoutBtn.style.border = 'none';
            logoutBtn.style.cursor = 'pointer';
            logoutBtn.textContent = 'Log Out';
            logoutBtn.onclick = async function () {
                localStorage.removeItem('wg_wallet_email');
                localStorage.removeItem('wg_user_email');
                localStorage.removeItem('wg_user_role');
                localStorage.removeItem('gd_auth_user');
                if (client) {
                    try { await client.auth.signOut(); } catch (_) {}
                }
                window.location.href = window.location.pathname.indexOf('/staff/') !== -1 ? '/staff/login.html' : '/news/login.html';
            };
        }
        if (userBadge) {
            window.syncHeaderAuthBadge(activeEmail, isVerifiedStaff);
        }
        loginLinks.forEach(link => {
            link.style.display = 'none';
        });
    } else {
        const styleEl = document.getElementById('auth-hide-login-style');
        if (styleEl) styleEl.remove();
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (userBadge) {
            userBadge.style.setProperty('display', 'none', 'important');
            userBadge.textContent = '';
        }
        loginLinks.forEach(link => {
            link.style.display = 'inline-flex';
        });
    }
});

// ============================================================================
// Staff area gate (added 2026-11-12, v58.1)
// Runs only on /staff/ pages other than the sign-in page. The page stays hidden
// until the visitor has a real Supabase session AND an active row in
// user_profiles (the same test the database uses for staff access).
//   - not signed in            -> sent to /staff/login.html
//   - signed in, not staff     -> sent to the public home page
// Browser-stored values (localStorage) are never trusted here.
// ============================================================================
(function () {
    var path = window.location.pathname || "";
    // v58.8: the Welcome Hamper admin page lives at /hamper/admin.html and is staff-only too.
    if (path.toLowerCase().indexOf("/staff/") === -1 && !/\/hamper\/admin\.html$/i.test(path)) return;
    if (/\/staff\/login\.html$/i.test(path)) return;

    var STYLE_ID = "wg-staff-gate-style";
    var decided = false;
    try {
        var style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = "html { visibility: hidden !important; }";
        (document.head || document.documentElement).appendChild(style);
    } catch (_) {}

    function reveal() {
        if (decided) return;
        decided = true;
        var s = document.getElementById(STYLE_ID);
        if (s && s.parentNode) s.parentNode.removeChild(s);
    }
    function toLogin() {
        if (decided) return;
        decided = true;
        window.location.replace("/staff/login.html?redirect=" + encodeURIComponent(path + (window.location.search || "")));
    }
    function toHome() {
        if (decided) return;
        decided = true;
        window.location.replace("/");
    }

    async function verifyStaff() {
        try {
            var client = window.GeorginaStore ? window.GeorginaStore.getClient() : null;
            if (!client) return toLogin();
            var sessionRes = await client.auth.getSession();
            var user = sessionRes && sessionRes.data && sessionRes.data.session ? sessionRes.data.session.user : null;
            if (!user || !user.id) return toLogin();
            var profRes = await client.from("user_profiles").select("role, active").eq("id", user.id).maybeSingle();
            var prof = profRes ? profRes.data : null;
            var staffRoles = ["admin", "super_admin", "staff", "editorial", "sales_rep", "viewer"];
            var role = prof && prof.role ? String(prof.role).toLowerCase().trim() : "";
            if (prof && prof.active === true && staffRoles.indexOf(role) !== -1) return reveal();
            return toHome();
        } catch (_) {
            return toLogin();
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", verifyStaff);
    } else {
        verifyStaff();
    }
    // Fail closed: if verification has not finished in 10 seconds, do not show the page.
    setTimeout(toLogin, 10000);
})();
