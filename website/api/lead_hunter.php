<?php
// Welcome East Gwillimbury - Admin-Only Lead Hunter Proxy (Google Places API New)
// Requires a valid Supabase admin JWT in Authorization: Bearer <token>.
// Never imports Google Places photos (copyright/Terms compliance).

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

function lh_respond(int $code, array $body): void {
    http_response_code($code);
    echo json_encode($body);
    exit;
}

function lh_http(string $url, string $method, array $headers, ?string $body = null, int $timeout = 12): array {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        $resp = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return [$code, is_string($resp) ? $resp : ''];
    }
    $opts = ['http' => ['method' => $method, 'header' => implode("\r\n", $headers), 'timeout' => $timeout, 'ignore_errors' => true]];
    if ($body !== null) $opts['http']['content'] = $body;
    $resp = @file_get_contents($url, false, stream_context_create($opts));
    $code = 0;
    if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $hm)) {
        $code = (int) $hm[1];
    }
    return [$code > 0 ? $code : ($resp !== false ? 200 : 500), is_string($resp) ? $resp : ''];
}

// 1. Verify Admin Supabase JWT
$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
if (!preg_match('/^Bearer\s+(\S+)$/i', $authHeader, $m)) {
    lh_respond(401, ['success' => false, 'error' => 'Missing Authorization Bearer token']);
}
$jwt = $m[1];

[$uCode, $uBody] = lh_http(WG_SUPABASE_URL . '/auth/v1/user', 'GET', [
    'apikey: ' . WG_SUPABASE_ANON_KEY,
    'Authorization: Bearer ' . $jwt,
    'Accept: application/json',
]);
$user = json_decode($uBody, true);
if ($uCode !== 200 || empty($user['id'])) {
    lh_respond(401, ['success' => false, 'error' => 'Invalid or expired session']);
}

[$pCode, $pBody] = lh_http(
    WG_SUPABASE_URL . '/rest/v1/user_profiles?select=role,active&id=eq.' . rawurlencode((string) $user['id']) . '&limit=1',
    'GET',
    ['apikey: ' . WG_SUPABASE_ANON_KEY, 'Authorization: Bearer ' . $jwt, 'Accept: application/json']
);
$prof = json_decode($pBody, true);
$active = !empty($prof[0]['active']);
$role = strtolower((string) ($prof[0]['role'] ?? ''));
if (!$active || !in_array($role, ['admin', 'super_admin'], true)) {
    lh_respond(403, ['success' => false, 'error' => 'Admin access required']);
}

// Per-admin rate limit: max 60 Lead Hunter requests per 10 minutes
$rlFile = rtrim(sys_get_temp_dir(), '/\\') . '/wg_lh_rl_' . sha1((string) $user['id']) . '.json';
$rlFh = @fopen($rlFile, 'c+');
if ($rlFh && flock($rlFh, LOCK_EX)) {
    $now = time();
    $hits = array_values(array_filter(
        json_decode((string) stream_get_contents($rlFh), true) ?: [],
        fn($t) => is_int($t) && $t > $now - 600
    ));
    if (count($hits) >= 60) {
        flock($rlFh, LOCK_UN);
        fclose($rlFh);
        lh_respond(429, ['success' => false, 'error' => 'Rate limit exceeded. Please wait a few minutes.']);
    }
    $hits[] = $now;
    ftruncate($rlFh, 0);
    rewind($rlFh);
    fwrite($rlFh, json_encode($hits));
    fflush($rlFh);
    flock($rlFh, LOCK_UN);
    fclose($rlFh);
} elseif ($rlFh) {
    fclose($rlFh);
}

// 2. Load server-only Google Places API Key
$placesKey = getenv('GOOGLE_PLACES_KEY') ?: '';
$cfgFile = __DIR__ . '/lead_hunter_config.php';
if ($placesKey === '' && is_file($cfgFile)) {
    $cfg = include $cfgFile;
    if (is_array($cfg) && !empty($cfg['google_places_key'])) {
        $placesKey = trim((string) $cfg['google_places_key']);
    }
}
if ($placesKey === '') {
    lh_respond(503, ['success' => false, 'error' => 'Google Places API key is not configured on the server.']);
}

$input = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($input)) lh_respond(400, ['success' => false, 'error' => 'Invalid JSON body']);

$action = trim((string) ($input['action'] ?? ''));
const PRO_MASK = 'places.id,places.displayName,places.formattedAddress,places.primaryTypeDisplayName,places.types,places.businessStatus,places.location,places.googleMapsUri,nextPageToken';
const ENRICH_MASK = 'id,nationalPhoneNumber,websiteUri,regularOpeningHours.weekdayDescriptions,editorialSummary,rating,userRatingCount';

function lh_places_post(string $endpoint, string $mask, array $payload, string $key): array {
    [$code, $resp] = lh_http(
        'https://places.googleapis.com/v1/' . $endpoint,
        'POST',
        ['Content-Type: application/json', 'X-Goog-Api-Key: ' . $key, 'X-Goog-FieldMask: ' . $mask],
        json_encode($payload)
    );
    $json = json_decode($resp, true);
    if ($code < 200 || $code >= 300 || !is_array($json)) {
        $msg = is_array($json) && !empty($json['error']['message']) ? $json['error']['message'] : ('Places API HTTP ' . $code);
        return ['error' => $msg, 'places' => []];
    }
    return $json;
}

function lh_map_place(array $p): array {
    return [
        'placeId' => (string) ($p['id'] ?? ''),
        'name' => (string) ($p['displayName']['text'] ?? ''),
        'address' => (string) ($p['formattedAddress'] ?? ''),
        'primaryType' => (string) ($p['primaryTypeDisplayName']['text'] ?? ''),
        'types' => is_array($p['types'] ?? null) ? $p['types'] : [],
        'businessStatus' => (string) ($p['businessStatus'] ?? 'OPERATIONAL'),
        'lat' => $p['location']['latitude'] ?? null,
        'lng' => $p['location']['longitude'] ?? null,
        'googleMapsUri' => (string) ($p['googleMapsUri'] ?? ''),
    ];
}

if ($action === 'category') {
    $query = trim((string) ($input['query'] ?? ''));
    $community = trim((string) ($input['community'] ?? 'East Gwillimbury'));
    $pageToken = trim((string) ($input['pageToken'] ?? ''));
    if ($query === '') lh_respond(400, ['success' => false, 'error' => 'Sub-category or keyword is required']);

    $area = ($community === '' || strcasecmp($community, 'All East Gwillimbury') === 0) ? 'East Gwillimbury, Ontario, Canada' : ($community . ', East Gwillimbury, Ontario, Canada');
    $body = [
        'textQuery' => $query . ' in ' . $area,
        'languageCode' => 'en',
        'regionCode' => 'CA',
        'locationBias' => ['circle' => ['center' => ['latitude' => 44.1422, 'longitude' => -79.4497], 'radius' => 16000.0]],
    ];
    if ($pageToken !== '') $body['pageToken'] = $pageToken;

    $res = lh_places_post('places:searchText', PRO_MASK, $body, $placesKey);
    if (!empty($res['error'])) lh_respond(502, ['success' => false, 'error' => 'Places search failed. Please try again.']);

    $places = array_map('lh_map_place', $res['places'] ?? []);
    lh_respond(200, ['success' => true, 'places' => $places, 'nextPageToken' => (string) ($res['nextPageToken'] ?? '')]);
}

if ($action === 'neighbourhood') {
    $location = substr(trim((string) ($input['location'] ?? '')), 0, 200);
    $radius = max(50, min(5000, (int) ($input['radius'] ?? 350)));
    $subCategory = substr(trim((string) ($input['subCategory'] ?? '')), 0, 100);
    if ($location === '') lh_respond(400, ['success' => false, 'error' => 'Address, plaza, crossroads, or neighbourhood is required']);

    // 1. Geocode center point in East Gwillimbury, Ontario
    $geo = lh_places_post('places:searchText', 'places.id,places.displayName,places.formattedAddress,places.location', [
        'textQuery' => $location . ', East Gwillimbury, Ontario, Canada',
        'languageCode' => 'en',
        'regionCode' => 'CA',
        'locationBias' => ['circle' => ['center' => ['latitude' => 44.1422, 'longitude' => -79.4497], 'radius' => 18000.0]],
    ], $placesKey);
    if (!empty($geo['error'])) {
        lh_respond(502, ['success' => false, 'error' => 'Places geocode failed. Please try again.']);
    }
    if (empty($geo['places'][0]['location'])) {
        $geo = lh_places_post('places:searchText', 'places.id,places.displayName,places.formattedAddress,places.location', [
            'textQuery' => $location . ', Ontario, Canada',
            'languageCode' => 'en',
            'regionCode' => 'CA',
            'locationBias' => ['circle' => ['center' => ['latitude' => 44.1422, 'longitude' => -79.4497], 'radius' => 18000.0]],
        ], $placesKey);
        if (!empty($geo['error'])) {
            lh_respond(502, ['success' => false, 'error' => 'Places geocode failed. Please try again.']);
        }
    }
    if (empty($geo['places'][0]['location'])) {
        lh_respond(422, ['success' => false, 'error' => 'Could not locate "' . $location . '" in East Gwillimbury. Try adding a street number or community name.']);
    }
    $center = $geo['places'][0]['location'];
    $centerLabel = (string) ($geo['places'][0]['formattedAddress'] ?? $location);

    // 2. Multi-pass discovery: Nearby (Distance) + Nearby (Popularity) + Text Search
    $byId = [];
    $addBatch = function (array $list) use (&$byId): void {
        foreach ($list as $p) {
            $id = (string) ($p['id'] ?? '');
            if ($id !== '' && !isset($byId[$id])) $byId[$id] = lh_map_place($p);
        }
    };

    $circle = ['center' => ['latitude' => (float) $center['latitude'], 'longitude' => (float) $center['longitude']], 'radius' => (float) $radius];
    $nearDist = lh_places_post('places:searchNearby', PRO_MASK, [
        'locationRestriction' => ['circle' => $circle],
        'rankPreference' => 'DISTANCE',
        'languageCode' => 'en',
        'regionCode' => 'CA',
        'maxResultCount' => 20,
    ], $placesKey);
    $addBatch($nearDist['places'] ?? []);

    $nearPop = lh_places_post('places:searchNearby', PRO_MASK, [
        'locationRestriction' => ['circle' => $circle],
        'rankPreference' => 'POPULARITY',
        'languageCode' => 'en',
        'regionCode' => 'CA',
        'maxResultCount' => 20,
    ], $placesKey);
    $addBatch($nearPop['places'] ?? []);

    $txtQuery = ($subCategory !== '' ? $subCategory . ' near ' : 'businesses near ') . $location . ', East Gwillimbury, Ontario';
    $txtRes = lh_places_post('places:searchText', PRO_MASK, [
        'textQuery' => $txtQuery,
        'locationBias' => ['circle' => $circle],
        'languageCode' => 'en',
        'regionCode' => 'CA',
    ], $placesKey);
    $addBatch($txtRes['places'] ?? []);

    lh_respond(200, ['success' => true, 'center' => $centerLabel, 'places' => array_values($byId)]);
}

if ($action === 'enrich') {
    $ids = $input['placeIds'] ?? [];
    if (!is_array($ids) || count($ids) === 0) lh_respond(400, ['success' => false, 'error' => 'placeIds array required']);
    $ids = array_slice(array_values(array_unique(array_filter(array_map('strval', $ids)))), 0, 20);

    $details = [];
    foreach ($ids as $pid) {
        if (!preg_match('/^[A-Za-z0-9_-]{8,120}$/', $pid)) continue;
        [$code, $resp] = lh_http(
            'https://places.googleapis.com/v1/places/' . rawurlencode($pid),
            'GET',
            ['X-Goog-Api-Key: ' . $placesKey, 'X-Goog-FieldMask: ' . ENRICH_MASK],
            null,
            8
        );
        if ($code >= 200 && $code < 300) {
            $d = json_decode($resp, true);
            if (is_array($d)) {
                $details[$pid] = [
                    'phone' => (string) ($d['nationalPhoneNumber'] ?? ''),
                    'website' => (string) ($d['websiteUri'] ?? ''),
                    'editorialSummary' => (string) ($d['editorialSummary']['text'] ?? ''),
                    'rating' => $d['rating'] ?? null,
                    'userRatingCount' => $d['userRatingCount'] ?? null,
                    'hours' => is_array($d['regularOpeningHours']['weekdayDescriptions'] ?? null) ? $d['regularOpeningHours']['weekdayDescriptions'] : [],
                ];
            }
        }
    }
    lh_respond(200, ['success' => true, 'details' => $details]);
}

lh_respond(400, ['success' => false, 'error' => 'Unsupported action']);
