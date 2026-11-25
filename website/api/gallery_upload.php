<?php
// Welcome East Gwillimbury - Home gallery photo upload (v63, 2026-11-15)
// Used by /staff/gallery.html. Admin only.
//
//   POST action=upload, file "photo"  -> resizes, watermarks, saves to /gallery/ and /gallery/thumbs/,
//                                        returns { success, image_url, thumb_url }
//   POST action=delete, name=<file>   -> removes /gallery/<file> and /gallery/thumbs/<file>
//
// The caller must send its Supabase sign-in token (Authorization: Bearer ...); the token is checked
// with the database's is_admin(). Full-size images: 1600px long side, JPEG quality 72 (medium),
// watermark-500x500.png from the site root in the bottom-right corner. Thumbnails: 96x120 portrait crop.
// Re-encoding drops all camera data (EXIF, including GPS location).

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
@ini_set('display_errors', '0');
date_default_timezone_set('America/Toronto');

const WG_SUPABASE_URL = 'https://cyxomkhydsmttefanalx.supabase.co';
// Public "anon" key (the same one every visitor's browser uses); not a secret.
const WG_SUPABASE_ANON_KEY = 'sb_publishable_o21_dFCXCHW2fvVJNS45Tw_sFVcprqw';

const WG_HOSTS = ['welcomeeg.ca', 'www.welcomeeg.ca', 'staging.welcomeeg.ca'];
const WG_MAX_BYTES = 15 * 1024 * 1024;   // 15 MB upload
const WG_MAX_PIXELS = 40000000;          // 40 megapixels (protects server memory)
const WG_FULL_LONG_SIDE = 1600;
const WG_FULL_QUALITY = 72;
const WG_THUMB_W = 96;
const WG_THUMB_H = 120;
const WG_THUMB_QUALITY = 78;

function wg_respond(int $status, array $body): void {
    http_response_code($status);
    echo json_encode($body);
    exit;
}

// ---- Same-site browser calls only --------------------------------------------------------
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed_origins = array_map(fn($h) => 'https://' . $h, WG_HOSTS);
if ($origin !== '' && !in_array($origin, $allowed_origins, true)) {
    wg_respond(403, ['success' => false, 'error' => 'This upload only works from the Welcome East Gwillimbury staff pages.']);
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    wg_respond(405, ['success' => false, 'error' => 'Use POST.']);
}

// ---- Admin check: the caller's own Supabase token must pass is_admin() --------------------
function wg_bearer_token(): string {
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if ($h === '' && function_exists('getallheaders')) {
        foreach (getallheaders() as $k => $v) { if (strtolower($k) === 'authorization') { $h = $v; break; } }
    }
    if (preg_match('/^Bearer\s+([A-Za-z0-9\-_.]+)$/', trim($h), $m)) return $m[1];
    return '';
}

function wg_is_admin(string $token): bool {
    if ($token === '' || $token === WG_SUPABASE_ANON_KEY) return false;
    $url = WG_SUPABASE_URL . '/rest/v1/rpc/is_admin';
    $headers = ['apikey: ' . WG_SUPABASE_ANON_KEY, 'Authorization: Bearer ' . $token, 'Content-Type: application/json'];
    $body = false;
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true, CURLOPT_POSTFIELDS => '{}', CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($code !== 200) return false;
    } else {
        $ctx = stream_context_create(['http' => [
            'method' => 'POST', 'header' => implode("\r\n", $headers), 'content' => '{}', 'timeout' => 10, 'ignore_errors' => true,
        ]]);
        $body = @file_get_contents($url, false, $ctx);
        $status = isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $mm) ? (int) $mm[1] : 0;
        if ($status !== 200) return false;
    }
    return is_string($body) && trim($body) === 'true';
}

if (!wg_is_admin(wg_bearer_token())) {
    wg_respond(403, ['success' => false, 'error' => 'Only signed-in admins can change the gallery. Sign in again and retry.']);
}

// ---- Folders ------------------------------------------------------------------------------
$site_root = dirname(__DIR__);
$gallery_dir = $site_root . '/gallery';
$thumb_dir = $gallery_dir . '/thumbs';
$host = strtolower($_SERVER['HTTP_HOST'] ?? '');
if (!in_array($host, WG_HOSTS, true)) $host = 'welcomeeg.ca';
$public_base = 'https://' . $host . '/gallery';

$action = $_POST['action'] ?? '';

// ---- Delete ---------------------------------------------------------------------------------
if ($action === 'delete') {
    $name = basename((string) ($_POST['name'] ?? ''));
    if (!preg_match('/^[A-Za-z0-9._-]+\.jpg$/', $name) || $name[0] === '.') {
        wg_respond(400, ['success' => false, 'error' => 'Unknown file name.']);
    }
    $removed = 0;
    foreach ([$gallery_dir . '/' . $name, $thumb_dir . '/' . $name] as $f) {
        if (is_file($f) && @unlink($f)) $removed++;
    }
    wg_respond(200, ['success' => true, 'removed' => $removed]);
}

if ($action !== 'upload') {
    wg_respond(400, ['success' => false, 'error' => 'Unknown action.']);
}

// ---- Upload checks --------------------------------------------------------------------------
if (!extension_loaded('gd') || !function_exists('imagecreatetruecolor')) {
    wg_respond(500, ['success' => false, 'error' => 'The web host is missing PHP image support (GD). Ask the host to enable the GD extension.']);
}
$f = $_FILES['photo'] ?? null;
if (!$f || !is_array($f) || ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    $code = is_array($f) ? (int) ($f['error'] ?? 0) : UPLOAD_ERR_NO_FILE;
    $msg = in_array($code, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)
        ? 'That photo is larger than the web host allows. Use a photo under 15 MB (or ask the host to raise upload_max_filesize).'
        : 'No photo was received. Try again.';
    wg_respond(400, ['success' => false, 'error' => $msg]);
}
if (!is_uploaded_file($f['tmp_name']) || filesize($f['tmp_name']) > WG_MAX_BYTES) {
    wg_respond(400, ['success' => false, 'error' => 'Use a photo under 15 MB.']);
}
$info = @getimagesize($f['tmp_name']);
$types = [IMAGETYPE_JPEG => 'jpeg', IMAGETYPE_PNG => 'png'];
if (defined('IMAGETYPE_WEBP') && function_exists('imagecreatefromwebp')) $types[IMAGETYPE_WEBP] = 'webp';
if (!$info || !isset($types[$info[2]])) {
    wg_respond(400, ['success' => false, 'error' => 'Use a JPG, PNG or WebP photo. (iPhone HEIC photos: share or export them as JPG first.)']);
}
if ($info[0] * $info[1] > WG_MAX_PIXELS) {
    wg_respond(400, ['success' => false, 'error' => 'That photo has too many pixels. Use one under 40 megapixels.']);
}
@ini_set('memory_limit', '512M');

$kind = $types[$info[2]];
$src = $kind === 'jpeg' ? @imagecreatefromjpeg($f['tmp_name'])
     : ($kind === 'png' ? @imagecreatefrompng($f['tmp_name']) : @imagecreatefromwebp($f['tmp_name']));
if (!$src) wg_respond(400, ['success' => false, 'error' => 'That photo could not be read. Try saving it again as JPG.']);

// Phone photos store "which way up" separately: apply it so the photo is not sideways.
if ($kind === 'jpeg' && function_exists('exif_read_data')) {
    $exif = @exif_read_data($f['tmp_name']);
    $o = (int) ($exif['Orientation'] ?? 1);
    if ($o === 3) $src = imagerotate($src, 180, 0);
    elseif ($o === 6) $src = imagerotate($src, -90, 0);
    elseif ($o === 8) $src = imagerotate($src, 90, 0);
}
$sw = imagesx($src);
$sh = imagesy($src);

// Flatten transparency onto white (PNG/WebP) by drawing onto a white canvas.
function wg_canvas(int $w, int $h) {
    $im = imagecreatetruecolor($w, $h);
    imagefill($im, 0, 0, imagecolorallocate($im, 255, 255, 255));
    imagealphablending($im, true);
    return $im;
}

// ---- Full size + watermark ------------------------------------------------------------------
$scale = min(1, WG_FULL_LONG_SIDE / max($sw, $sh));
$fw = max(1, (int) round($sw * $scale));
$fh = max(1, (int) round($sh * $scale));
$full = wg_canvas($fw, $fh);
imagecopyresampled($full, $src, 0, 0, 0, 0, $fw, $fh, $sw, $sh);

$wm_path = $site_root . '/watermark-500x500.png';
$wm = is_file($wm_path) ? @imagecreatefrompng($wm_path) : false;
if (!$wm) {
    wg_respond(500, ['success' => false, 'error' => 'watermark-500x500.png is missing from the site root. Upload it, then try again.']);
}
$ww = imagesx($wm);
$wh = imagesy($wm);
$target_w = (int) round(min(360, max(120, $fw * 0.2)));
$target_h = (int) round($wh * $target_w / $ww);
$margin = (int) round(max(12, $fw * 0.025));
$wm_scaled = imagecreatetruecolor($target_w, $target_h);
imagealphablending($wm_scaled, false);
imagesavealpha($wm_scaled, true);
imagefill($wm_scaled, 0, 0, imagecolorallocatealpha($wm_scaled, 0, 0, 0, 127));
imagecopyresampled($wm_scaled, $wm, 0, 0, 0, 0, $target_w, $target_h, $ww, $wh);
imagealphablending($full, true);
imagecopy($full, $wm_scaled, $fw - $target_w - $margin, $fh - $target_h - $margin, 0, 0, $target_w, $target_h);

// ---- Thumbnail: centred 4:5 portrait crop, no watermark (too small to read) ---------------------
$want = WG_THUMB_W / WG_THUMB_H;
if ($sw / $sh > $want) { $cw = (int) round($sh * $want); $ch = $sh; $cx = (int) round(($sw - $cw) / 2); $cy = 0; }
else { $cw = $sw; $ch = (int) round($sw / $want); $cx = 0; $cy = (int) round(($sh - $ch) / 3); } // keep a little more of the top
$thumb = wg_canvas(WG_THUMB_W, WG_THUMB_H);
imagecopyresampled($thumb, $src, 0, 0, $cx, $cy, WG_THUMB_W, WG_THUMB_H, $cw, $ch);

// ---- Save -------------------------------------------------------------------------------------
foreach ([$gallery_dir, $thumb_dir] as $d) {
    if (!is_dir($d) && !@mkdir($d, 0755, true)) {
        wg_respond(500, ['success' => false, 'error' => 'Could not create the /gallery/ folder on the web host. Create it (permission 755) and retry.']);
    }
}
$name = date('Ymd') . '-' . bin2hex(random_bytes(6)) . '.jpg';
imageinterlace($full, true);
imageinterlace($thumb, true);
$ok = imagejpeg($full, $gallery_dir . '/' . $name, WG_FULL_QUALITY) && imagejpeg($thumb, $thumb_dir . '/' . $name, WG_THUMB_QUALITY);
if (!$ok) {
    @unlink($gallery_dir . '/' . $name);
    @unlink($thumb_dir . '/' . $name);
    wg_respond(500, ['success' => false, 'error' => 'Could not save the photo on the web host (check that /gallery/ is writable).']);
}
@chmod($gallery_dir . '/' . $name, 0644);
@chmod($thumb_dir . '/' . $name, 0644);

wg_respond(200, [
    'success' => true,
    'name' => $name,
    'image_url' => $public_base . '/' . $name,
    'thumb_url' => $public_base . '/thumbs/' . $name,
    'width' => $fw,
    'height' => $fh,
]);
