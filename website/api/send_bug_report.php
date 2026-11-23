<?php
// Welcome East Gwillimbury - Bug Report Dispatcher (v58.3, hardened 2026-11-12)
// Sends website/newsletter bug reports to robert@welcomeeg.ca.
//
// Security notes:
//  - Visitor-supplied text can no longer add mail headers (name, email and page URL
//    are reduced to a single line; the email must be a valid address to be used).
//  - Only this site may call the endpoint from a browser.
//  - Each visitor (IP address) is limited to 5 reports per hour.
//  - A hidden "website" field traps simple spam bots.

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

$allowed_origins = ['https://welcomeeg.ca', 'https://www.welcomeeg.ca'];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowed_origins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

function wg_respond(int $status, array $body): void {
    http_response_code($status);
    echo json_encode($body);
    exit;
}

// One line of plain text: control characters (including CR/LF) removed, length capped.
function wg_clean_line($value, int $max): string {
    if (!is_string($value)) return '';
    $value = preg_replace('/[\x00-\x1F\x7F]+/', ' ', $value) ?? '';
    $value = trim($value);
    return function_exists('mb_substr') ? mb_substr($value, 0, $max) : substr($value, 0, $max);
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    wg_respond(405, ['success' => false, 'error' => 'Method Not Allowed']);
}

// A browser request from another website is refused. Requests with no Origin header
// (for example the site's own same-origin form post in some browsers) are allowed.
if ($origin !== '' && !in_array($origin, $allowed_origins, true)) {
    wg_respond(403, ['success' => false, 'error' => 'Origin not allowed']);
}

$raw_input = file_get_contents('php://input', false, null, 0, 20001);
if ($raw_input === false || strlen($raw_input) > 20000) {
    wg_respond(413, ['success' => false, 'error' => 'Report too large']);
}

$data = json_decode($raw_input, true);
if (!is_array($data)) {
    wg_respond(400, ['success' => false, 'error' => 'Invalid JSON payload']);
}

// Spam trap: real visitors never fill this hidden field. Pretend it worked.
if (!empty($data['website'])) {
    wg_respond(200, ['success' => true, 'delivered' => true, 'timestamp' => date('c')]);
}

$name = wg_clean_line($data['name'] ?? '', 80);
if ($name === '') $name = 'Anonymous Resident';

$email_raw = wg_clean_line($data['email'] ?? '', 254);
$email = filter_var($email_raw, FILTER_VALIDATE_EMAIL) ? $email_raw : '';

$page_url = wg_clean_line($data['page_url'] ?? '', 300);
if ($page_url === '') $page_url = 'https://welcomeeg.ca';

$message = is_string($data['message'] ?? null) ? $data['message'] : '';
$message = str_replace("\0", '', $message);
$message = trim(function_exists('mb_substr') ? mb_substr($message, 0, 5000) : substr($message, 0, 5000));

$report_type = wg_clean_line($data['report_type'] ?? '', 40);
$listing_info = wg_clean_line($data['listing_info'] ?? '', 200);

$recipient = 'robert@welcomeeg.ca';

if ($message === '' || strlen($message) < 10) {
    wg_respond(400, ['success' => false, 'error' => 'Message too short']);
}

// Rate limit: at most 5 reports per hour from one visitor IP address (CDN-aware).
// Also enforce a secondary cap on REMOTE_ADDR so spoofed forwarding headers cannot bypass limits.
$remote_ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$ip = '';
if (!empty($_SERVER['HTTP_CF_CONNECTING_IP']) && filter_var($_SERVER['HTTP_CF_CONNECTING_IP'], FILTER_VALIDATE_IP)) {
    $ip = $_SERVER['HTTP_CF_CONNECTING_IP'];
} elseif (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
    foreach (explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']) as $cand) {
        $cand = trim($cand);
        if (filter_var($cand, FILTER_VALIDATE_IP)) { $ip = $cand; break; }
    }
}
if ($ip === '') $ip = $remote_ip;
$limit_file = rtrim(sys_get_temp_dir(), '/\\') . '/wg_bug_' . sha1($ip) . '.json';
$remote_limit_file = rtrim(sys_get_temp_dir(), '/\\') . '/wg_bug_r_' . sha1($remote_ip) . '.json';
$now = time();
$recent = [];
$enforce_rate_limit = function (string $file, int $max, int $now): void {
    $fh = @fopen($file, 'c+');
    if (!$fh) return;
    if (flock($fh, LOCK_EX)) {
        $recent = [];
        $stored = json_decode((string) stream_get_contents($fh), true);
        if (is_array($stored)) {
            foreach ($stored as $t) {
                if (is_int($t) && $t > $now - 3600) $recent[] = $t;
            }
        }
        if (count($recent) >= $max) {
            flock($fh, LOCK_UN);
            fclose($fh);
            header('Retry-After: 3600');
            wg_respond(429, ['success' => false, 'error' => 'Too many reports. Please try again later.']);
        }
        $recent[] = $now;
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, json_encode($recent));
        fflush($fh);
        flock($fh, LOCK_UN);
    }
    fclose($fh);
};
$enforce_rate_limit($limit_file, 5, $now);
if ($remote_ip !== $ip) {
    $enforce_rate_limit($remote_limit_file, 20, $now);
}

if ($report_type === 'contact_us') {
    $subject = '[Welcome East Gwillimbury Contact Us] from ' . $name;
    $body = "A new Contact Us message has been submitted via WelcomeEG.ca:\n\n"
          . "Submitted By: " . $name . "\n"
          . "Email: " . ($email !== '' ? $email : '(not provided)') . "\n"
          . ($listing_info !== '' ? "Topic: " . $listing_info . "\n" : '')
          . "Page URL: " . $page_url . "\n"
          . "Submitted At: " . date('Y-m-d H:i:s T') . "\n\n"
          . "--- MESSAGE ---\n"
          . $message . "\n\n"
          . "---------------\n";
} elseif ($report_type === 'listing_correction') {
    $subject = '[Welcome East Gwillimbury Listing Update] ' . ($listing_info !== '' ? $listing_info : 'Notice from ' . $name);
    $body = "A listing change or inaccuracy report has been submitted via WelcomeEG.ca:\n\n"
          . ($listing_info !== '' ? "Listing / Business: " . $listing_info . "\n" : '')
          . "Page URL: " . $page_url . "\n"
          . "Submitted By: " . $name . "\n"
          . "Submitter Email: " . ($email !== '' ? $email : '(not provided)') . "\n"
          . "Submitted At: " . date('Y-m-d H:i:s T') . "\n\n"
          . "--- UPDATE / CORRECTION DETAILS ---\n"
          . $message . "\n\n"
          . "-----------------------------------\n";
} else {
    $subject = '[Welcome East Gwillimbury Bug Report] from ' . $name;
    $body = "A new bug report has been submitted via WelcomeEG.ca:\n\n"
          . "Submitted By: " . $name . "\n"
          . "Submitter Email: " . ($email !== '' ? $email : '(not provided or not valid)') . "\n"
          . "Page URL: " . $page_url . "\n"
          . "Submitted At: " . date('Y-m-d H:i:s T') . "\n\n"
          . "--- BUG DETAILS & DESCRIPTION ---\n"
          . $message . "\n\n"
          . "---------------------------------\n";
}

$headers = [
    'From' => 'Welcome East Gwillimbury <contact@welcomeeg.ca>',
    'Sender' => 'contact@welcomeeg.ca',
    'Return-Path' => 'contact@welcomeeg.ca',
    'Content-Type' => 'text/plain; charset=UTF-8',
];
if ($email !== '') {
    $headers['Reply-To'] = $email;
}

$sent = @mail($recipient, $subject, $body, $headers, '-fcontact@welcomeeg.ca');

wg_respond($sent ? 200 : 502, [
    'success' => (bool) $sent,
    'delivered' => (bool) $sent,
    'timestamp' => date('c'),
]);
