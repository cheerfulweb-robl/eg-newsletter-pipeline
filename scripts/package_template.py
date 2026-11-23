"""Package a clean, sanitized, sellable developer template zip in community_package/.

Sanitizes all personal emails, Supabase project IDs/keys, analytics IDs,
Stripe Payment Links, and Welcome Georgina domain/brand references into
clearly commented TODO(TEMPLATE) placeholders without modifying the live repo.

Usage (from repo root):
    python scripts/package_template.py
"""
from datetime import date
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "community_package"

def read_build_version() -> str:
    bp = ROOT / "_work" / "build_production.py"
    if bp.exists():
        m = re.search(r'^VERSION\s*=\s*"([^"]+)"', bp.read_text(encoding="utf-8"), re.M)
        if m:
            return m.group(1)
    return "v0.0"

VERSION = read_build_version()
OUT_ZIP = OUT_DIR / f"community_platform_template_{date.today().isoformat()}_{VERSION}.zip"

EXCLUDE_DIRS = {
    ".git",
    "_work",
    "community_package",
    "node_modules",
    "dist",
    "__pycache__",
    ".pytest_cache",
    ".temp",
}

EXCLUDE_FILES = {
    ".env",
    ".env.local",
    ".env.production",
}

TEXT_EXTS = {
    ".js", ".jsx", ".ts", ".tsx", ".html", ".css", ".py", ".sql",
    ".yml", ".yaml", ".md", ".json", ".php", ".txt", ".example", ".svg",
}

FORBIDDEN_TOKENS = [
    "dtyyptbqbwvwxvtexenr",
    "cheerfulweb@gmail.com",
    "stillcheerful@gmail.com",
    "robert@cheerfulmedia.ca",
    "GTM-MVZ6JCXP",
    "z9iiqajy1i",
    "welcomegeorgina.ca",
]

SUPABASE_JWT_RE = re.compile(r"eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}")
STRIPE_BUY_RE = re.compile(r"https://buy\.stripe\.com/[A-Za-z0-9_]+")
STRIPE_PORTAL_RE = re.compile(r"https://billing\.stripe\.com/p/login/[A-Za-z0-9_]+")


def should_include(path: Path) -> bool:
    rel = path.relative_to(ROOT)
    parts = set(rel.parts)
    if parts & EXCLUDE_DIRS:
        return False
    name = path.name
    if name in EXCLUDE_FILES or name.endswith(".zip") or name.startswith("HANDOVER_"):
        return False
    if name.endswith(".pyc"):
        return False
    return True


def is_text_file(path: Path) -> bool:
    return path.suffix.lower() in TEXT_EXTS or path.name in {".htaccess", ".gitignore"}


def sanitize_text(rel: str, text: str) -> str:
    # 1. Replace Supabase project ref & JWT anon keys
    text = text.replace("dtyyptbqbwvwxvtexenr", "YOUR_SUPABASE_PROJECT_REF")
    text = SUPABASE_JWT_RE.sub("YOUR_SUPABASE_ANON_KEY", text)

    # 2. Replace personal emails & GitHub org
    text = text.replace("cheerfulweb@gmail.com", "admin@yourdomain.ca")
    text = text.replace("stillcheerful@gmail.com", "co-admin@yourdomain.ca")
    text = text.replace("robert@cheerfulmedia.ca", "editor@yourdomain.ca")
    text = text.replace("cheerfulweb-robl", "your-github-org")

    # 3. Replace analytics IDs
    text = text.replace("GTM-MVZ6JCXP", "GTM-XXXXXXX")
    text = text.replace("z9iiqajy1i", "YOUR_CLARITY_ID")

    # 4. Replace Stripe Payment Links & Customer Portal
    text = STRIPE_BUY_RE.sub("https://buy.stripe.com/YOUR_PAYMENT_LINK", text)
    text = STRIPE_PORTAL_RE.sub("https://billing.stripe.com/p/login/YOUR_PORTAL_LINK", text)

    # 5. Replace site domain & brand names
    text = text.replace("welcomegeorgina.ca", "yourdomain.ca")
    text = text.replace("Welcome Georgina", "Your Community")
    text = text.replace("WelcomeGeorgina", "YourCommunity")

    # 6. Add clear TODO(TEMPLATE) header comments on key config files
    if rel in ("website/shared/config.js", "website/staff/assets/config.js", "website/news/assets/config.js"):
        banner = (
            "// TODO(TEMPLATE): Replace YOUR_SUPABASE_PROJECT_REF, YOUR_SUPABASE_ANON_KEY,\n"
            "// and admin@yourdomain.ca below with your own Supabase project and admin emails.\n"
        )
        text = banner + text
    elif rel == "site-src/src/config/stripeLinks.js":
        banner = (
            "// TODO(TEMPLATE): Replace each https://buy.stripe.com/YOUR_PAYMENT_LINK and\n"
            "// customerPortal URL below with your own Stripe Payment Links & Customer Portal.\n"
        )
        text = banner + text
    elif rel == "site-src/index.html":
        text = text.replace(
            "GTM-XXXXXXX",
            "GTM-XXXXXXX",
        ).replace(
            "<!-- Google Tag Manager",
            "<!-- TODO(TEMPLATE): Replace GTM-XXXXXXX and YOUR_CLARITY_ID with your own analytics IDs -->\n  <!-- Google Tag Manager",
            1,
        )

    return text


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    count = 0
    leaks = []

    with zipfile.ZipFile(OUT_ZIP, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for p in sorted(ROOT.rglob("*")):
            if not p.is_file() or not should_include(p):
                continue
            rel = p.relative_to(ROOT).as_posix()
            if is_text_file(p):
                raw = p.read_text(encoding="utf-8", errors="replace")
                clean = sanitize_text(rel, raw)
                if rel != "scripts/package_template.py":
                    for tok in FORBIDDEN_TOKENS:
                        if tok in clean:
                            leaks.append(f"{rel}: contains {tok}")
                    if any(m != "https://buy.stripe.com/YOUR_PAYMENT_LINK" for m in STRIPE_BUY_RE.findall(clean)):
                        leaks.append(f"{rel}: contains live buy.stripe.com link")
                    if any(m != "https://billing.stripe.com/p/login/YOUR_PORTAL_LINK" for m in STRIPE_PORTAL_RE.findall(clean)):
                        leaks.append(f"{rel}: contains live billing.stripe.com portal link")
                zf.writestr(rel, clean.encode("utf-8"))
            else:
                zf.write(p, arcname=rel)
            count += 1

    if leaks:
        raise SystemExit("ABORTED — personal/site tokens remained:\n" + "\n".join(leaks[:20]))

    print(f"OK: {OUT_ZIP} ({count} files, verified 0 personal/site leaks)")


if __name__ == "__main__":
    main()
