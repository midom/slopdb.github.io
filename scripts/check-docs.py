"""Check the static site's local links and anchors without third-party packages."""

from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parent.parent
issues = []


class Page(HTMLParser):
    def __init__(self, filename):
        super().__init__()
        self.filename = filename
        self.ids = set()
        self.links = []

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if "id" in attrs:
            if attrs["id"] in self.ids:
                issues.append(f"{self.filename}: duplicate id {attrs['id']}")
            self.ids.add(attrs["id"])
        for attribute in ("href", "src"):
            if attribute in attrs:
                self.links.append(attrs[attribute])


pages = {}
for filename in ROOT.rglob("*.html"):
    if "node_modules" in filename.relative_to(ROOT).parts:
        continue
    page = Page(filename.relative_to(ROOT))
    page.feed(filename.read_text())
    pages[filename] = page

checked = 0
for filename, page in pages.items():
    for link in page.links:
        url = urlsplit(link)
        if url.scheme or url.netloc:
            continue
        target = (filename.parent / unquote(url.path)).resolve() if url.path else filename
        if target.is_dir():
            target /= "index.html"
        checked += 1
        if not target.exists():
            issues.append(f"{page.filename}: missing local file {link}")
        elif url.fragment and target in pages and unquote(url.fragment) not in pages[target].ids:
            issues.append(f"{page.filename}: missing anchor {link}")

for issue in issues:
    print(issue)
print(f"Checked {checked} local links across {len(pages)} pages; {len(issues)} issues.")
raise SystemExit(bool(issues))
