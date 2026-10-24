"""RSS/Atom news collection pipeline with an optional AI summarizer."""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Callable, Iterable
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from xml.etree import ElementTree

MAX_FEED_BYTES = 2_000_000
USER_AGENT = "AINewsReader/0.1"


@dataclass(frozen=True)
class NewsItem:
    title: str
    link: str
    description: str
    published: str
    source: str
    ai_summary: str | None = None


Summarizer = Callable[[NewsItem], str]


def _validate_feed_url(url: str) -> None:
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError(f"Feed URL must be an absolute HTTP(S) URL: {url!r}")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("Feed URLs must not contain embedded credentials")


def _fetch_feed(url: str, timeout: float) -> bytes:
    _validate_feed_url(url)
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=timeout) as response:
        content = response.read(MAX_FEED_BYTES + 1)
    if len(content) > MAX_FEED_BYTES:
        raise ValueError(f"Feed exceeds the {MAX_FEED_BYTES}-byte size limit: {url}")
    return content


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def _entry_value(entry: ElementTree.Element, names: set[str]) -> str:
    for child in entry:
        if _local_name(child.tag) not in names:
            continue
        if _local_name(child.tag) == "link" and child.attrib.get("href"):
            return child.attrib["href"].strip()
        value = "".join(child.itertext()).strip()
        if value:
            return value
    return ""


def _parse_feed(content: bytes, url: str) -> list[NewsItem]:
    try:
        root = ElementTree.fromstring(content)
    except ElementTree.ParseError as error:
        raise ValueError(f"Feed is not valid XML: {url}") from error

    source = urlsplit(url).hostname or url
    items: list[NewsItem] = []
    for entry in root.iter():
        if _local_name(entry.tag) not in {"item", "entry"}:
            continue

        title = _entry_value(entry, {"title"})
        link = _entry_value(entry, {"link"})
        if not title or not link:
            continue

        items.append(
            NewsItem(
                title=title,
                link=link,
                description=_entry_value(
                    entry, {"description", "summary", "content", "encoded"}
                ),
                published=_entry_value(
                    entry, {"pubdate", "published", "updated", "date"}
                ),
                source=source,
            )
        )
    return items


def run_news_pipeline(
    feed_urls: Iterable[str],
    summarizer: Summarizer | None = None,
    *,
    timeout: float = 10.0,
    max_items_per_feed: int = 50,
) -> list[NewsItem]:
    """Fetch feeds, normalize entries, deduplicate links, and optionally summarize.

    Network, XML, URL, and summarizer errors are allowed to propagate so callers
    can report failures rather than treating an incomplete run as successful.
    """
    if timeout <= 0:
        raise ValueError("timeout must be greater than zero")
    if max_items_per_feed <= 0:
        raise ValueError("max_items_per_feed must be greater than zero")

    results: list[NewsItem] = []
    seen_links: set[str] = set()
    for url in feed_urls:
        items = _parse_feed(_fetch_feed(url, timeout), url)
        feed_count = 0
        for item in items:
            if item.link in seen_links:
                continue
            seen_links.add(item.link)
            if summarizer is not None:
                summary = summarizer(item)
                if not isinstance(summary, str):
                    raise TypeError("summarizer must return a string")
                item = replace(item, ai_summary=summary)
            results.append(item)
            feed_count += 1
            if feed_count >= max_items_per_feed:
                break
    return results
