"""
Sends the Monday and Thursday editions via SMTP (if configured) or the Supabase `send-email`
Edge Function (Brevo), plus the Facebook post copy and failure alerts for the owner.
"""
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import os
import smtplib
import requests

from src.supabase_client import _get_supabase_config, fetch_active_subscribers


def _build_mime_message(
    sender: str,
    recipient: str,
    subject: str,
    html_body: str,
    unsubscribe_token: str = "",
) -> MIMEMultipart:
    raw_portal = (os.environ.get("PUBLIC_PORTAL_URL") or "").strip().rstrip("/")
    if not raw_portal or not raw_portal.startswith(("http://", "https://")) or "news.welcomeeg.ca" in raw_portal.lower():
        portal_base = "https://welcomeeg.ca/news"
    else:
        portal_base = raw_portal
    token_val = unsubscribe_token or "manage"
    personalized_html = html_body.replace("{{UNSUBSCRIBE_TOKEN}}", token_val)
    unsub_url = f"{portal_base}/unsubscribe.html?token={token_val}"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"Welcome East Gwillimbury <{sender}>"
    msg["To"] = recipient
    msg["List-Unsubscribe"] = f"<{unsub_url}>"
    msg.attach(MIMEText(personalized_html, "html"))
    return msg


ADMIN_ALERT_EMAIL = "contact@welcomeeg.ca"


def _send_via_edge(cfg: dict, to: str, subject: str, html_body: str) -> bool:
    """One email through the send-email Edge Function (staff-only newsletter_dispatch type)."""
    resp = requests.post(
        f"{cfg['url']}/functions/v1/send-email",
        headers=cfg["headers"],
        json={"formType": "newsletter_dispatch", "record": {"email": to, "subject": subject, "html_body": html_body}},
        timeout=20,
    )
    if resp.status_code != 200:
        print(f"Warning: Edge Function returned {resp.status_code}: {resp.text[:200]}")
    return resp.status_code == 200


def _smtp_settings():
    host = (os.environ.get("SMTP_HOST") or os.environ.get("SMTP_SERVER") or "").strip()
    port = int(os.environ.get("SMTP_PORT") or 587)
    user = (os.environ.get("SMTP_USER") or os.environ.get("SMTP_USERNAME") or "").strip()
    password = (os.environ.get("SMTP_PASSWORD") or "").strip()
    sender = (os.environ.get("SENDER_EMAIL") or "contact@welcomeeg.ca").strip()
    return host, port, user, password, sender


def send_single_email(to: str, subject: str, html_body: str, text_body: str = "") -> bool:
    """One email to the owner/admin: SMTP when configured, otherwise the Edge Function."""
    host, port, user, password, sender = _smtp_settings()
    try:
        if not host or not user or not password:
            return _send_via_edge(_get_supabase_config(), to, subject, html_body)
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"Welcome East Gwillimbury <{sender}>"
        msg["To"] = to
        if text_body:
            msg.attach(MIMEText(text_body, "plain", "utf-8"))
        msg.attach(MIMEText(html_body, "html", "utf-8"))
        with smtplib.SMTP(host, port) as server:
            server.starttls()
            server.login(user, password)
            server.sendmail(sender, to, msg.as_string())
        return True
    except Exception as exc:
        print(f"Warning: could not send '{subject}': {exc}")
        return False


def send_admin_alert(subject: str, message: str) -> bool:
    import html as html_lib
    body = (f'<div style="font-family:Arial,sans-serif;max-width:640px;"><h2 style="color:#b91c1c;">{html_lib.escape(subject)}</h2>'
            f'<pre style="white-space:pre-wrap;font-size:13px;">{html_lib.escape(message)}</pre>'
            '<p style="font-size:12px;color:#64748b;">Sent by the Welcome East Gwillimbury newsletter pipeline (GitHub Actions).</p></div>')
    return send_single_email(ADMIN_ALERT_EMAIL, f"[Newsletter alert] {subject}", body, message)


def _dispatch_via_supabase_edge_function(recipients_map: dict, subject: str, html_body: str, edition: str) -> int:
    cfg = _get_supabase_config()
    print(f"Dispatching [{edition.upper()}] issue via Supabase Edge Function (Brevo) to {len(recipients_map)} recipient(s)...")
    delivered = 0
    for n, item in enumerate(recipients_map.values(), 1):
        token_val = item.get("unsubscribe_token") or "manage"
        try:
            if _send_via_edge(cfg, item["email"], subject, html_body.replace("{{UNSUBSCRIBE_TOKEN}}", token_val)):
                delivered += 1
        except Exception as exc:
            print(f"Warning: send #{n} of the [{edition}] issue failed: {exc}")
    print(f"Delivered [{edition.upper()}] issue to {delivered}/{len(recipients_map)} recipient(s) via Brevo Edge Function.")
    return delivered


def dispatch_email(
    html_body: str,
    edition: str = "reader",
    is_test_only: bool = False,
    test_recipient: str = "",
    subject: str = "",
) -> tuple:
    """Returns (delivered, total). Raises if the subscriber list cannot be loaded."""
    host, port, user, password, sender = _smtp_settings()
    
    # Check test recipient from argument or environment
    effective_test_recipient = (test_recipient or os.environ.get("TEST_RECIPIENT") or os.environ.get("RECIPIENT_EMAILS") or "").strip()
    
    # If is_test_only is true, NEVER send to subscribers
    send_to_subscribers = False if is_test_only else (os.environ.get("SEND_TO_SUBSCRIBERS", "true").lower() in ("1", "true", "yes"))

    date_short = datetime.now().strftime("%b %d, %Y")
    prefix = "[TEST BUILD] " if is_test_only else ""
    if subject:
        subject = f"{prefix}{subject}"
    else:
        subject = f"{prefix}Welcome East Gwillimbury • Community News, Events & Local Perks ({date_short})"

    recipients_map = {}
    if effective_test_recipient:
        for addr in effective_test_recipient.split(","):
            clean_addr = addr.strip()
            if clean_addr and "@" in clean_addr:
                recipients_map[clean_addr.lower()] = {
                    "email": clean_addr,
                    "unsubscribe_token": "test-preview",
                }

    if send_to_subscribers:
        for sub in fetch_active_subscribers(edition=edition):
            email_addr = (sub.get("email") or "").strip()
            if email_addr:
                recipients_map[email_addr.lower()] = {
                    "email": email_addr,
                    "unsubscribe_token": sub.get("unsubscribe_token") or "",
                }

    if not recipients_map:
        print(f"No recipients configured for {edition} edition. Skipping email dispatch.")
        return 0, 0

    if not host or not user or not password:
        delivered = _dispatch_via_supabase_edge_function(
            recipients_map=recipients_map,
            subject=subject,
            html_body=html_body,
            edition=edition,
        )
        return delivered, len(recipients_map)

    print(f"Connecting to SMTP host {host}:{port} for {len(recipients_map)} [{edition.upper()}] recipient(s)...")
    delivered = 0
    with smtplib.SMTP(host, port) as server:
        server.starttls()
        server.login(user, password)
        for n, item in enumerate(recipients_map.values(), 1):
            target_email = item["email"]
            try:
                msg = _build_mime_message(
                    sender=sender,
                    recipient=target_email,
                    subject=subject,
                    html_body=html_body,
                    unsubscribe_token=item["unsubscribe_token"],
                )
                server.sendmail(sender, target_email, msg.as_string())
                delivered += 1
            except Exception as exc:
                print(f"Warning: send #{n} of the [{edition}] issue failed: {exc}")

    print(f"Delivered [{edition.upper()}] issue to {delivered}/{len(recipients_map)} recipient(s).")
    return delivered, len(recipients_map)


def dispatch_facebook_digest(
    digest_text: str,
    edition: str = "reader",
    recipient: str = "robert@welcomeeg.ca",
) -> bool:
    """
    Sends the plain-text Facebook post copy directly to robert@welcomeeg.ca
    every time an edition is published.
    """
    date_str = datetime.now().strftime("%b %d, %Y")
    subject = f"[Facebook Post Copy] Welcome East Gwillimbury Community Digest • {edition.capitalize()} ({date_str})"

    # Pre-wrap in a clean, copy-friendly email with pre-formatted selectable text box
    import html as html_lib
    html_container = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Facebook Post Copy</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 24px; color: #1e293b; margin: 0;">
    <div style="max-width: 720px; margin: 0 auto; background: #ffffff; border: 2px solid #00008b; border-radius: 12px; padding: 28px; box-shadow: 0 4px 16px rgba(0,0,0,0.08);">
        <div style="border-bottom: 2px solid #00008b; padding-bottom: 16px; margin-bottom: 20px;">
            <span style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #0284c7; letter-spacing: 0.05em; background: #e0f2fe; padding: 3px 8px; border-radius: 4px;">Social Media Copy Ready</span>
            <h2 style="margin: 8px 0 4px 0; color: #00008b; font-size: 22px;">📋 Facebook Post Copy — Ready to Publish</h2>
            <p style="margin: 6px 0 0 0; font-size: 14px; color: #475569; line-height: 1.5;">
                Below is your complete plain-text newsletter with genuine bold titles (<strong>Unicode Bold</strong>), left-aligned pins, double-spaced paragraphs, and social click-through tracking URLs.
            </p>
        </div>

        <div style="background: #eff6ff; border-left: 4px solid #2563eb; padding: 12px 16px; border-radius: 6px; margin-bottom: 18px; font-size: 13px; color: #1e40af;">
            💡 <strong>How to Copy:</strong> Click anywhere inside the text box below, press <code>Ctrl+A</code> (or <code>Cmd+A</code> on Mac) to select all, then <code>Ctrl+C</code> to copy with exact line breaks intact for Facebook.
        </div>

        <pre style="white-space: pre-wrap; word-break: break-word; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13.5px; line-height: 1.6; background: #0f172a; color: #f8fafc; border: 1px solid #334155; border-radius: 8px; padding: 20px; user-select: all; -webkit-user-select: all;">{html_lib.escape(digest_text)}</pre>

        <div style="margin-top: 20px; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 16px;">
            <p style="font-size: 12px; color: #94a3b8; margin: 0;">
                Dispatched automatically by Welcome East Gwillimbury Content Pipeline for Robert Lee • <a href="https://welcomeeg.ca" style="color: #00008b; font-weight: 700; text-decoration: none;">WelcomeEG.ca</a>
            </p>
        </div>
    </div>
</body>
</html>"""

    print(f"Delivering Facebook digest copy to {recipient}...")
    ok = send_single_email(recipient, subject, html_container, digest_text)
    print("Facebook digest delivered." if ok else "Warning: Facebook digest was not delivered.")
    return ok
