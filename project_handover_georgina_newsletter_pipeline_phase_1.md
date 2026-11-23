# Handover Document: Automated Georgina Newsletter Pipeline (Phase 1)
**Target Tool / Environment:** Google Antigravity Agent  
**Project Objective:** Build a zero-terminal, serverless prototype that extracts hyper-local content from Georgina, Ontario, formats it into an email newsletter, and dispatches a test edition using SMTP (Amazon SES or Resend).

---

## 1. Project Overview & Architecture

### High-Level Flow
1. **Trigger:** Manual trigger (or scheduled cron) via GitHub Actions.
2. **Ingestion:** Python script fetches local feeds (RSS and structured web pages) covering Keswick, Sutton, Jackson’s Point, and Pefferlaw.
3. **Data Normalization:** Filters and structures article titles, links, and summaries.
4. **HTML Email Compilation:** Assembles items into a responsive, clean, unbranded email template.
5. **Dispatch:** Sends via secure SMTP to a designated test recipient address.

### Target Environment & Constraints
- **Zero-Terminal Expectation:** All scripts, configurations, and schedules must run via Git repositories, GitHub Web UI, or automated cloud agents without requiring raw local terminal / bash access.
- **Cost Target:** $0.00 / month during prototyping (GitHub Actions free tier + SES / Resend free tiers).
- **Target Locale:** Georgina, York Region, Ontario, Canada (Focus: Lake Simcoe, Keswick, Sutton).

---

## 2. Repository File Structure

Antigravity should generate and maintain the following directory layout:

```text
georgina-newsletter-pipeline/
│
├── .github/
│   └── workflows/
│       └── run_pipeline.yml         # GitHub Actions orchestration file
│
├── src/
│   ├── __init__.py
│   ├── scraper.py                   # Ingestion logic for Georgina & York Region
│   ├── compiler.py                  # HTML compilation & template generation
│   └── sender.py                    # SMTP dispatch handler
│
├── main.py                          # Primary execution entrypoint
├── requirements.txt                 # Python dependencies
└── README.md                        # Documentation & setup guide
```

---

## 3. Configuration & Secrets Specification

The agent must configure the workflow to draw from GitHub Repository Secrets (`Settings -> Secrets and variables -> Actions`):

| Secret Name | Description | Example / Format |
|---|---|---|
| `SMTP_HOST` | Outgoing SMTP mail server | `email-smtp.us-east-1.amazonaws.com` or `smtp.resend.com` |
| `SMTP_PORT` | Port for TLS delivery | `587` |
| `SMTP_USER` | SMTP authentication username | Access key or API key ID |
| `SMTP_PASSWORD` | SMTP authentication password | Generated credential string |
| `SENDER_EMAIL` | Verified sender address | `newsletter@yourdomain.com` or verified personal address |
| `TEST_RECIPIENT` | Target test inbox | Personal developer / editor email |

---

## 4. Production-Ready Code Specifications

### A. Dependency Manifest (`requirements.txt`)
```text
requests>=2.31.0
beautifulsoup4>=4.12.0
feedparser>=6.0.10
python-dateutil>=2.8.2
```

### B. Ingestion Layer (`src/scraper.py`)
```python
"""
Scrapes and aggregates local news and community updates from Georgina, ON.
"""
from typing import List, Dict
import feedparser
import requests
from bs4 import BeautifulSoup


def get_georgina_post_feed() -> List[Dict[str, str]]:
    """Fetches stories from The Georgina Post RSS feed."""
    url = "https://georginapost.com/feed/"
    articles = []
    try:
        feed = feedparser.parse(url)
        for entry in feed.entries[:3]:
            summary = entry.get("summary", "")
            # Clean HTML tags from summary if present
            soup = BeautifulSoup(summary, "html.parser")
            clean_summary = soup.get_text(separator=" ").strip()
            
            articles.append({
                "title": entry.title,
                "link": entry.link,
                "source": "The Georgina Post",
                "summary": clean_summary[:220] + "..." if len(clean_summary) > 220 else clean_summary
            })
    except Exception as exc:
        print(f"Warning: Georgina Post ingestion failed: {exc}")
    return articles


def get_municipal_announcements() -> List[Dict[str, str]]:
    """
    Fallback and structured announcement ingestion for Town of Georgina updates.
    """
    # Sample items / Fallback seed for Phase 1 verification
    return [
        {
            "title": "Town of Georgina Council & Waterfront Planning Updates",
            "link": "https://www.georgina.ca/newsroom",
            "source": "Town of Georgina",
            "summary": "Key council agenda motions covering recreation campus additions and local infrastructure schedules."
        }
    ]


def aggregate_content() -> List[Dict[str, str]]:
    """Consolidates all scraped content into a single normalized list."""
    all_content = []
    all_content.extend(get_georgina_post_feed())
    
    if not all_content:
        all_content.extend(get_municipal_announcements())
        
    return all_content
```

### C. Newsletter HTML Compiler (`src/compiler.py`)
```python
"""
Compiles structured articles into a clean, mobile-responsive HTML newsletter.
"""
from datetime import datetime
from typing import List, Dict


def build_newsletter_html(articles: List[Dict[str, str]]) -> str:
    """Generates cross-client compatible HTML."""
    date_display = datetime.now().strftime("%B %d, %Y")
    
    items_markup = []
    for item in articles:
        block = f"""
        <div style="margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #e5e7eb;">
            <span style="font-size: 11px; font-weight: 700; color: #0284c7; text-transform: uppercase; letter-spacing: 0.05em;">
                {item.get('source', 'Local News')}
            </span>
            <h2 style="margin: 6px 0 10px 0; font-size: 18px; line-height: 1.3;">
                <a href="{item['link']}" style="color: #111827; text-decoration: none;">{item['title']}</a>
            </h2>
            <p style="margin: 0; color: #4b5563; font-size: 14px; line-height: 1.6;">
                {item['summary']}
            </p>
            <div style="margin-top: 10px;">
                <a href="{item['link']}" style="color: #2563eb; font-size: 13px; font-weight: 600; text-decoration: none;">Read full update &rarr;</a>
            </div>
        </div>
        """
        items_markup.append(block)

    joined_items = "\n".join(items_markup)

    html_template = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>The Georgina Dispatch</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 30px 10px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" style="max-width: 580px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 32px; text-align: left;">
                    <tr>
                        <td style="border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px;">
                            <h1 style="margin: 0; font-size: 22px; color: #0f172a; font-weight: 800; letter-spacing: -0.025em;">
                                THE GEORGINA DISPATCH
                            </h1>
                            <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">
                                Weekly Community Briefing • {date_display}
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding-top: 24px;">
                            {joined_items}
                        </td>
                    </tr>
                    <tr>
                        <td style="border-top: 1px solid #e2e8f0; padding-top: 24px; text-align: center; color: #94a3b8; font-size: 12px; line-height: 1.5;">
                            This is an automated prototype build.<br>
                            Covering Keswick, Sutton, Jackson's Point, Pefferlaw & Lake Simcoe.
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
"""
    return html_template
```

### D. SMTP Dispatcher (`src/sender.py`)
```python
"""
Transmits generated HTML issues via SMTP (Amazon SES or Resend).
"""
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime


def dispatch_email(html_body: str) -> None:
    host = os.environ["SMTP_HOST"]
    port = int(os.environ.get("SMTP_PORT", 587))
    user = os.environ["SMTP_USER"]
    password = os.environ["SMTP_PASSWORD"]
    sender = os.environ["SENDER_EMAIL"]
    recipient = os.environ["TEST_RECIPIENT"]

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"The Georgina Dispatch (Test Preview) - {datetime.now().strftime('%b %d')}"
    msg["From"] = f"Georgina Dispatch <{sender}>"
    msg["To"] = recipient

    msg.attach(MIMEText(html_body, "html"))

    print(f"Connecting to SMTP host {host}:{port}...")
    with smtplib.SMTP(host, port) as server:
        server.starttls()
        server.login(user, password)
        server.sendmail(sender, recipient, msg.as_string())
    print(f"Successfully delivered issue to {recipient}.")
```

### E. Orchestrator Entrypoint (`main.py`)
```python
"""
Main execution pipeline for Phase 1.
"""
from src.scraper import aggregate_content
from src.compiler import build_newsletter_html
from src.sender import dispatch_email


def main():
    print("Starting Georgina Content Gathering Pipeline...")
    content = aggregate_content()
    print(f"Collected {len(content)} articles/announcements.")

    print("Compiling responsive newsletter template...")
    html_issue = build_newsletter_html(content)

    print("Dispatching test newsletter...")
    dispatch_email(html_issue)
    print("Pipeline executed successfully.")


if __name__ == "__main__":
    main()
```

### F. GitHub Actions Workflow (`.github/workflows/run_pipeline.yml`)
```yaml
name: Georgina Newsletter Pipeline Runner

on:
  workflow_dispatch: # Enables manual "Run Workflow" button in GitHub UI
  schedule:
    # Runs automatically every Friday at 12:00 PM UTC (8:00 AM EST)
    - cron: '0 12 * * 5'

jobs:
  execute-pipeline:
    runs-on: ubuntu-latest
    steps:
      - name: Check out repository
        uses: actions/checkout@v4

      - name: Initialize Python 3.11
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'

      - name: Install Dependencies
        run: pip install -r requirements.txt

      - name: Run Pipeline Script
        env:
          SMTP_HOST: ${{ secrets.SMTP_HOST }}
          SMTP_PORT: ${{ secrets.SMTP_PORT }}
          SMTP_USER: ${{ secrets.SMTP_USER }}
          SMTP_PASSWORD: ${{ secrets.SMTP_PASSWORD }}
          SENDER_EMAIL: ${{ secrets.SENDER_EMAIL }}
          TEST_RECIPIENT: ${{ secrets.TEST_RECIPIENT }}
        run: python main.py
```

---

## 5. Verification Checklist for Antigravity

1. [ ] **Repository Structure Validation:** All files (`main.py`, `src/*.py`, `run_pipeline.yml`) exist in the correct folders.
2. [ ] **Secrets Verification:** Confirm `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SENDER_EMAIL`, and `TEST_RECIPIENT` are provided in the environment.
3. [ ] **Manual Trigger Test:** Execute via the GitHub **Actions** tab $\rightarrow$ **Run workflow**.
4. [ ] **Inbox Inspection:** Verify that the test email arrives with proper formatting, responsive card elements, and active hyperlinks to original sources.
5. [ ] **Phase 2 Handoff Readiness:** Output data structures are compatible with direct insertion into a future database (PostgreSQL/Listmonk) or headless Ghost instance on a DigitalOcean 1-Click droplet.