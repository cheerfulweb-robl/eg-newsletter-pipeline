<?php
// Welcome East Gwillimbury - Regenerate sitemap.xml from live Supabase data (v71.9)
// Requires a valid Supabase staff/admin JWT in Authorization: Bearer <token>.

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
@ini_set('display_errors', '0');

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed_origins = ['https://welcomeeg.ca', 'https://www.welcomeeg.ca'];
if ($origin !== '') {
    if (!in_array($origin, $allowed_origins, true)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Origin not allowed']);
        exit;
    }
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Authorization, Content-Type');
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

const WG_SUPABASE_URL = 'https://cyxomkhydsmttefanalx.supabase.co';
const WG_SUPABASE_ANON_KEY = 'sb_publishable_o21_dFCXCHW2fvVJNS45Tw_sFVcprqw';
const WG_SITE = 'https://welcomeeg.ca';

function wg_http_get(string $url, array $headers): array {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 12,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return [$code, is_string($body) ? $body : ''];
    }
    $ctx = stream_context_create(['http' => ['header' => implode("\r\n", $headers), 'timeout' => 12, 'ignore_errors' => true]]);
    $body = @file_get_contents($url, false, $ctx);
    $code = 0;
    if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $hm)) {
        $code = (int) $hm[1];
    }
    return [$code > 0 ? $code : ($body !== false ? 200 : 500), is_string($body) ? $body : ''];
}

// 1. Verify Supabase JWT
$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
if (!preg_match('/^Bearer\s+(\S+)$/i', $authHeader, $m)) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Missing Authorization Bearer token']);
    exit;
}
$jwt = $m[1];

[$uCode, $uBody] = wg_http_get(WG_SUPABASE_URL . '/auth/v1/user', [
    'apikey: ' . WG_SUPABASE_ANON_KEY,
    'Authorization: Bearer ' . $jwt,
    'Accept: application/json',
]);
$user = json_decode($uBody, true);
if ($uCode !== 200 || empty($user['id']) || empty($user['email'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Invalid or expired session']);
    exit;
}

[$pCode, $pBody] = wg_http_get(
    WG_SUPABASE_URL . '/rest/v1/user_profiles?select=role,active&id=eq.' . rawurlencode((string) $user['id']) . '&limit=1',
    ['apikey: ' . WG_SUPABASE_ANON_KEY, 'Authorization: Bearer ' . $jwt, 'Accept: application/json']
);
$prof = json_decode($pBody, true);
$active = !empty($prof[0]['active']);
$role = strtolower((string) ($prof[0]['role'] ?? ''));
$isAllowed = $active && in_array($role, ['admin', 'super_admin', 'staff', 'editorial'], true);
if (!$isAllowed) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Staff or admin access required']);
    exit;
}

// Cooldown: at most 1 regeneration per 60 seconds per user
$rlFile = rtrim(sys_get_temp_dir(), '/\\') . '/wg_sitemap_rl_' . sha1((string) $user['id']);
if (is_file($rlFile) && (time() - (int) @filemtime($rlFile)) < 60) {
    http_response_code(429);
    echo json_encode(['success' => false, 'error' => 'Sitemap was just regenerated. Please wait 60 seconds.']);
    exit;
}
@touch($rlFile);

function wg_fetch_all(string $table, string $query, string $jwt): array {
    $all = [];
    $offset = 0;
    $limit = 1000;
    $headers = [
        'apikey: ' . WG_SUPABASE_ANON_KEY,
        'Authorization: Bearer ' . $jwt,
        'Accept: application/json',
    ];
    while (true) {
        $url = WG_SUPABASE_URL . '/rest/v1/' . $table . '?' . $query . "&limit=$limit&offset=$offset";
        [$code, $body] = wg_http_get($url, $headers);
        if ($code !== 200) break;
        $rows = json_decode($body, true);
        if (!is_array($rows) || count($rows) === 0) break;
        $all = array_merge($all, $rows);
        if (count($rows) < $limit) break;
        $offset += $limit;
    }
    return $all;
}

$today = gmdate('Y-m-d');
$urls = [];
$addUrl = function (string $path, string $lastmod, string $freq, string $priority) use (&$urls) {
    $loc = WG_SITE . $path;
    $urls[$loc] = [
        'loc' => $loc,
        'lastmod' => $lastmod ?: gmdate('Y-m-d'),
        'changefreq' => $freq,
        'priority' => $priority,
    ];
};

// Core static routes
$core = [
    ['/', 'daily', '1.0'],
    ['/events', 'daily', '0.9'],
    ['/dining', 'daily', '0.9'],
    ['/sales', 'daily', '0.9'],
    ['/directory', 'daily', '0.9'],
    ['/this-weekend', 'weekly', '0.8'],
    ['/discovery', 'weekly', '0.8'],
    ['/weather', 'daily', '0.7'],
    ['/press', 'weekly', '0.8'],
    ['/news/newsroom.html', 'daily', '0.8'],
    ['/newsletter', 'weekly', '0.7'],
    ['/subscribe', 'monthly', '0.7'],
    ['/hamper/', 'weekly', '0.7'],
    ['/hamper/apply.html', 'monthly', '0.6'],
    ['/advertise', 'monthly', '0.6'],
    ['/corrections', 'monthly', '0.5'],
    ['/knowledge-base', 'monthly', '0.5'],
    ['/terms', 'yearly', '0.3'],
    ['/privacy', 'yearly', '0.3'],
];
foreach ($core as [$p, $f, $pr]) {
    $addUrl($p, $today, $f, $pr);
}

// Approved Businesses
$businesses = wg_fetch_all('directory_listings', 'select=slug,updated_at,created_at&status=eq.approved&slug=not.is.null&order=name.asc', $jwt);
$bizCount = 0;
foreach ($businesses as $b) {
    $slug = trim((string) ($b['slug'] ?? ''));
    if ($slug === '' || !preg_match('/^[a-z0-9-]+$/i', $slug)) continue;
    $lm = substr((string) ($b['updated_at'] ?: $b['created_at'] ?: $today), 0, 10);
    $addUrl('/businesses/' . $slug, $lm, 'weekly', '0.8');
    $bizCount++;
}

// Approved Active Listings (Events, Dining, Sales)
$listings = wg_fetch_all('vendor_events', "select=slug,category,expires_after,updated_at,created_at&status=eq.approved&slug=not.is.null&or=(expires_after.is.null,expires_after.gte.$today)&order=created_at.desc", $jwt);
$listingCount = 0;
foreach ($listings as $l) {
    $slug = trim((string) ($l['slug'] ?? ''));
    if ($slug === '' || !preg_match('/^[a-z0-9-]+$/i', $slug)) continue;
    $cat = strtolower(trim((string) ($l['category'] ?? '')));
    if (in_array($cat, ['dining', 'restaurant', 'food_and_drink', 'dining_deals'], true)) {
        $prefix = '/dining/';
    } elseif (in_array($cat, ['sale', 'sales', 'local_sales', 'special_sale', 'sales_deal'], true)) {
        $prefix = '/sales/';
    } else {
        $prefix = '/events/';
    }
    $lm = substr((string) ($l['updated_at'] ?: $l['created_at'] ?: $today), 0, 10);
    $addUrl($prefix . $slug, $lm, 'weekly', '0.7');
    $listingCount++;
}

// Published Press Releases
$press = wg_fetch_all('press_articles', 'select=slug,updated_at,published_at&status=eq.published&slug=not.is.null&order=published_at.desc', $jwt);
$pressCount = 0;
foreach ($press as $pr) {
    $slug = trim((string) ($pr['slug'] ?? ''));
    if ($slug === '' || !preg_match('/^[a-z0-9-]+$/i', $slug)) continue;
    $lm = substr((string) ($pr['updated_at'] ?: $pr['published_at'] ?: $today), 0, 10);
    $addUrl('/press/' . $slug, $lm, 'monthly', '0.7');
    $pressCount++;
}

// Build XML
$esc = fn(string $s) => htmlspecialchars($s, ENT_XML1 | ENT_QUOTES, 'UTF-8');
$xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n";
$xml .= "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n";
foreach ($urls as $u) {
    $xml .= "  <url>\n";
    $xml .= "    <loc>" . $esc($u['loc']) . "</loc>\n";
    $xml .= "    <lastmod>" . $esc($u['lastmod']) . "</lastmod>\n";
    $xml .= "    <changefreq>" . $esc($u['changefreq']) . "</changefreq>\n";
    $xml .= "    <priority>" . $esc($u['priority']) . "</priority>\n";
    $xml .= "  </url>\n";
}
$xml .= "</urlset>\n";

$target = dirname(__DIR__) . '/sitemap.xml';
if (@file_put_contents($target, $xml, LOCK_EX) === false) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Could not write sitemap.xml on server (check file permissions)']);
    exit;
}

echo json_encode([
    'success' => true,
    'total_urls' => count($urls),
    'businesses' => $bizCount,
    'listings' => $listingCount,
    'press' => $pressCount,
    'generated_at' => gmdate('c'),
]);
