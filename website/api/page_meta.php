<?php
// Welcome East Gwillimbury - share tags for listing pages (v63.1, 2026-11-15)
//
// Facebook, X, LinkedIn, iMessage and search previews read the raw HTML and never run the
// site's JavaScript, so every page used to share the same generic preview. .htaccess sends
// /events/<slug>, /sales/<slug>, /dining/<slug> and /businesses/<slug> here. This script
// returns the normal app page (index.html) with that listing's title, description, image and
// address written into the Open Graph / Twitter tags. If anything fails it returns index.html
// unchanged, so the page always works.

header('Content-Type: text/html; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-cache');
@ini_set('display_errors', '0');

const WG_SUPABASE_URL = 'https://cyxomkhydsmttefanalx.supabase.co';
// Public "anon" key (the same one every visitor's browser uses); not a secret.
const WG_SUPABASE_ANON_KEY = 'sb_publishable_o21_dFCXCHW2fvVJNS45Tw_sFVcprqw';
const WG_SITE = 'https://welcomeeg.ca';
const WG_DEFAULT_IMAGE = 'https://welcomeeg.ca/default-welcome-eg-og.jpg';
const WG_PRESS_IMAGE = 'https://welcomeeg.ca/press-release-og.jpg';
const WG_TITLE_SUFFIX = ' | Welcome East Gwillimbury | Local Welcome Wagon, Community Events & Perks';
const WG_CACHE_SECONDS = 600;

$index_path = dirname(__DIR__) . '/index.html';
$html = @file_get_contents($index_path);
if ($html === false) {
    http_response_code(500);
    echo 'Page not available.';
    exit;
}

$kind = (string) ($_GET['kind'] ?? '');
$slug = strtolower((string) ($_GET['slug'] ?? ''));
if (!in_array($kind, ['events', 'sales', 'dining', 'businesses', 'press'], true) || !preg_match('/^[a-z0-9-]{1,200}$/', $slug)) {
    echo $html;
    exit;
}

function wg_get_json(string $path) {
    $url = WG_SUPABASE_URL . $path;
    $headers = ['apikey: ' . WG_SUPABASE_ANON_KEY, 'Authorization: Bearer ' . WG_SUPABASE_ANON_KEY, 'Accept: application/json'];
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_HTTPHEADER => $headers, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 4, CURLOPT_CONNECTTIMEOUT => 3]);
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($code !== 200 || !is_string($body)) return null;
    } else {
        $ctx = stream_context_create(['http' => ['header' => implode("\r\n", $headers), 'timeout' => 4, 'ignore_errors' => true]]);
        $body = @file_get_contents($url, false, $ctx);
        if (!is_string($body)) return null;
    }
    $data = json_decode($body, true);
    return is_array($data) ? $data : null;
}

// One line of plain text, tags like "[Category: Retail]" removed, cut at a word boundary.
function wg_clean_text($s, int $max): string {
    $s = (string) $s;
    $s = preg_replace('/\[(Category|Discount|Services?)[^\]]*\]/i', ' ', $s) ?? $s;
    $s = preg_replace('/^\s*\[Sale\]\s*/i', '', $s) ?? $s;
    $s = trim(preg_replace('/\s+/u', ' ', strip_tags($s)) ?? $s);
    if (function_exists('mb_strlen') && mb_strlen($s) > $max) {
        $cut = mb_substr($s, 0, $max - 1);
        $sp = mb_strrpos($cut, ' ');
        $s = rtrim(($sp !== false && $sp > $max * 0.6) ? mb_substr($cut, 0, $sp) : $cut, " ,.;:-") . '…';
    } elseif (!function_exists('mb_strlen') && strlen($s) > $max) {
        $s = rtrim(substr($s, 0, $max - 3), " ,.;:-") . '...';
    }
    return $s;
}

function wg_is_external_url(string $url): bool {
    $u = trim($url);
    if (!preg_match('#^https?://[^\s"<>]+$#i', $u)) return false;
    return !preg_match('#^https?://(www\.)?welcomeeg\.ca(/|$)#i', $u);
}

function wg_lookup(string $kind, string $slug): ?array {
    $is_uuid = (bool) preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $slug);
    $match = $is_uuid ? 'id=eq.' . $slug : 'or=' . rawurlencode("(slug.eq.$slug,old_slugs.cs.{" . $slug . "})");
    if ($kind === 'press') {
        $rows = wg_get_json('/rest/v1/press_articles?select=title,summary,image_url,slug,published_at,updated_at,business_name,business_address,business_phone,business_website&status=eq.published&slug=eq.' . rawurlencode($slug) . '&limit=1');
        if (!$rows) return null;
        $p = $rows[0];
        $title = wg_clean_text($p['title'] ?? '', 110);
        if ($title === '') return null;
        $desc = wg_clean_text($p['summary'] ?? '', 200) ?: ($title . ' — Verified local press release on Welcome East Gwillimbury.');
        $img = (string) ($p['image_url'] ?? '');
        if (!preg_match('#^https://[^\s"<>]+$#i', $img) || stripos($img, 'default-welcome-eg-og.jpg') !== false) {
            $img = WG_PRESS_IMAGE;
        }
        $path = '/press/' . rawurlencode((string) ($p['slug'] ?: $slug));
        $bizName = trim((string) ($p['business_name'] ?? 'East Gwillimbury Local Business'));
        $bizAddr = trim((string) ($p['business_address'] ?? 'East Gwillimbury, ON'));
        $bizPhone = trim((string) ($p['business_phone'] ?? ''));
        $bizWeb = trim((string) ($p['business_website'] ?? ''));
        $schema = [
            '@context' => 'https://schema.org',
            '@type' => 'NewsArticle',
            'headline' => $title,
            'description' => $desc,
            'image' => [['@type' => 'ImageObject', 'url' => $img, 'contentUrl' => $img]],
            'datePublished' => $p['published_at'] ?? null,
            'dateModified' => $p['updated_at'] ?? ($p['published_at'] ?? null),
            'author' => ['@type' => 'Organization', 'name' => 'Welcome East Gwillimbury Editorial Desk', 'url' => WG_SITE],
            'publisher' => ['@type' => 'Organization', 'name' => 'Welcome East Gwillimbury', 'logo' => ['@type' => 'ImageObject', 'url' => WG_SITE . '/welcome-eg-logo.png']],
            'about' => array_filter([
                '@type' => 'LocalBusiness',
                'name' => $bizName,
                'address' => ['@type' => 'PostalAddress', 'streetAddress' => $bizAddr, 'addressLocality' => 'East Gwillimbury', 'addressRegion' => 'ON', 'addressCountry' => 'CA'],
                'telephone' => $bizPhone ?: null,
                'url' => wg_is_external_url($bizWeb) ? $bizWeb : null,
            ]),
        ];
        return ['title' => $title, 'description' => $desc, 'image' => $img, 'path' => $path, 'schema' => $schema];
    }
    if ($kind === 'businesses') {
        $rows = wg_get_json('/rest/v1/directory_listings?select=name,category,community,location,phone,link,slug&' . $match . '&status=eq.approved&limit=1');
        if (!$rows) return null;
        $b = $rows[0];
        $name = wg_clean_text($b['name'] ?? '', 90);
        if ($name === '') return null;
        $where = wg_clean_text($b['community'] ?? '', 60) ?: 'East Gwillimbury';
        $cat = wg_clean_text(str_replace('_', ' ', (string) ($b['category'] ?? '')), 60);
        $path = '/businesses/' . rawurlencode((string) ($b['slug'] ?? $slug));
        $extLink = trim((string) ($b['link'] ?? ''));
        $schema = array_filter([
            '@context' => 'https://schema.org',
            '@type' => 'LocalBusiness',
            'name' => $name,
            'url' => WG_SITE . $path,
            'sameAs' => wg_is_external_url($extLink) ? $extLink : null,
            'telephone' => trim((string) ($b['phone'] ?? '')) ?: null,
            'address' => [
                '@type' => 'PostalAddress',
                'streetAddress' => trim((string) ($b['location'] ?? '')) ?: "$where, ON",
                'addressLocality' => $where,
                'addressRegion' => 'ON',
                'addressCountry' => 'CA',
            ],
        ]);
        return [
            'title' => $name,
            'description' => wg_clean_text(($cat ? "$cat in $where, East Gwillimbury, Ontario." : "Local business in $where, East Gwillimbury, Ontario.") . ' Find hours, location and current events, sales and dining specials on Welcome East Gwillimbury.', 200),
            'image' => '',
            'path' => $path,
            'schema' => $schema,
        ];
    }
    $rows = wg_get_json('/rest/v1/vendor_events?select=title,summary,image_url,slug,event_date_label,event_start_date,expires_after,location,community,business_name,contact_phone,link,price_text&status=eq.approved&' . $match . '&limit=1');
    if (!$rows) return null;
    $e = $rows[0];
    $title = wg_clean_text($e['title'] ?? '', 90);
    if ($title === '') return null;
    $desc = wg_clean_text($e['summary'] ?? '', 200);
    if ($desc === '') {
        $bits = array_filter([wg_clean_text($e['event_date_label'] ?? '', 80), wg_clean_text($e['location'] ?? '', 80)]);
        $desc = $title . ($bits ? ' · ' . implode(' · ', $bits) : '') . '. Details on Welcome East Gwillimbury.';
    }
    $img = (string) ($e['image_url'] ?? '');
    if (!preg_match('#^https://[^\s"<>]+$#i', $img)) $img = ''; // skips empty and "pending:" photos
    $path = '/' . $kind . '/' . rawurlencode((string) ($e['slug'] ?: $slug));
    $bizName = trim((string) ($e['business_name'] ?? '')) ?: $title;
    $loc = trim((string) ($e['location'] ?? '')) ?: 'East Gwillimbury, ON';
    $comm = trim((string) ($e['community'] ?? '')) ?: 'East Gwillimbury';
    $localBiz = array_filter([
        '@type' => $kind === 'dining' ? ['LocalBusiness', 'FoodEstablishment'] : 'LocalBusiness',
        'name' => $bizName,
        'telephone' => trim((string) ($e['contact_phone'] ?? '')) ?: null,
        'url' => wg_is_external_url((string) ($e['link'] ?? '')) ? trim((string) $e['link']) : (WG_SITE . $path),
        'address' => ['@type' => 'PostalAddress', 'streetAddress' => $loc, 'addressLocality' => $comm, 'addressRegion' => 'ON', 'addressCountry' => 'CA'],
    ]);
    if ($kind === 'events') {
        $evNode = array_filter([
            '@type' => 'Event',
            'name' => $title,
            'description' => $desc,
            'startDate' => !empty($e['event_start_date']) ? ($e['event_start_date'] . 'T10:00:00-05:00') : null,
            'eventStatus' => 'https://schema.org/EventScheduled',
            'location' => ['@type' => 'Place', 'name' => $loc, 'address' => ['@type' => 'PostalAddress', 'streetAddress' => $loc, 'addressLocality' => $comm, 'addressRegion' => 'ON', 'addressCountry' => 'CA']],
            'organizer' => $localBiz,
        ]);
        $schema = ['@context' => 'https://schema.org', '@graph' => [$evNode, $localBiz]];
    } elseif ($kind === 'sales') {
        $localBiz['makesOffer'] = ['@type' => 'Offer', 'name' => $title, 'description' => $desc, 'url' => WG_SITE . $path];
        $schema = ['@context' => 'https://schema.org'] + $localBiz;
    } else {
        $schema = ['@context' => 'https://schema.org'] + $localBiz;
    }
    return [
        'title' => $title,
        'description' => $desc,
        'image' => $img,
        'path' => $path,
        'schema' => $schema,
    ];
}

// Small file cache so busy pages don't ask the database on every view.
$cache_dir = rtrim(sys_get_temp_dir(), '/\\') . '/wg_meta_cache_' . substr(md5(__DIR__), 0, 8);
if (!is_dir($cache_dir)) {
    @mkdir($cache_dir, 0700, true);
}
$cache_file = $cache_dir . '/wg_meta_' . md5($kind . '|' . $slug) . '.json';
$meta = null;
if (is_file($cache_file) && (time() - (int) @filemtime($cache_file)) < WG_CACHE_SECONDS) {
    $meta = json_decode((string) @file_get_contents($cache_file), true);
}
if (!is_array($meta)) {
    $meta = wg_lookup($kind, $slug) ?? ['none' => true];
    @file_put_contents($cache_file, json_encode($meta), LOCK_EX);
}
if (!empty($meta['none'])) {
    echo $html;
    exit;
}

$e = fn($v) => htmlspecialchars((string) $v, ENT_QUOTES | ENT_HTML5, 'UTF-8');
$full_title = $meta['title'] . WG_TITLE_SUFFIX;
$image = $meta['image'] !== '' ? $meta['image'] : WG_DEFAULT_IMAGE;
$url = WG_SITE . $meta['path'];

$set = function (string $html, string $attr, string $name, string $value) use ($e): string {
    $pattern = '/(<meta\s+' . $attr . '="' . preg_quote($name, '/') . '"\s+content=")[^"]*(")/i';
    return preg_replace_callback($pattern, fn($m) => $m[1] . $e($value) . $m[2], $html, 1) ?? $html;
};
$html = $set($html, 'property', 'og:title', $full_title);
$html = $set($html, 'property', 'og:description', $meta['description']);
$html = $set($html, 'property', 'og:image', $image);
$html = $set($html, 'property', 'og:url', $url);
$html = $set($html, 'name', 'twitter:title', $full_title);
$html = $set($html, 'name', 'twitter:description', $meta['description']);
$html = $set($html, 'name', 'twitter:image', $image);
if ($image !== WG_DEFAULT_IMAGE) {
    // The 1200x630 size belongs to the default image only.
    $html = preg_replace('/\s*<meta\s+property="og:image:(width|height)"\s+content="[^"]*"\s*\/?>/i', '', $html) ?? $html;
}
// Callbacks (not replacement strings) so "$1" or "\1" inside a title is never treated as a placeholder.
$page_title = $e($meta['title'] . ' | Welcome East Gwillimbury');
$html = preg_replace_callback('/<title>[^<]*<\/title>/i', fn($m) => '<title>' . $page_title . '</title>', $html, 1) ?? $html;
if (stripos($html, 'rel="canonical"') === false) {
    $canonical = '<link rel="canonical" href="' . $e($url) . '" />';
    $html = preg_replace_callback('/(<meta\s+property="og:url"[^>]*>)/i', fn($m) => $m[1] . "\n    " . $canonical, $html, 1) ?? $html;
}
if (!empty($meta['schema'])) {
    $json = json_encode($meta['schema'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
    if ($json !== false) {
        $ld = '<script type="application/ld+json">' . $json . '</script>';
        $html = str_ireplace('</head>', "    " . $ld . "\n</head>", $html);
    }
}

echo $html;
