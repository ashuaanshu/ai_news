from unittest.mock import patch

import pytest

from app.pipeline import NewsItem, run_news_pipeline


def test_pipeline_parses_rss_and_atom_deduplicates_and_summarizes() -> None:
    rss = b"""<rss><channel>
      <item><title>First story</title><link>https://news.test/1</link>
      <description>Details</description><pubDate>Today</pubDate></item>
      <item><title>Second story</title><link>https://news.test/2</link></item>
    </channel></rss>"""
    atom = b"""<feed xmlns="http://www.w3.org/2005/Atom"><entry>
      <title>Duplicate story</title><link href="https://news.test/1"/>
      <summary>Atom details</summary></entry></feed>"""
    feeds = {
        "https://feed.test/rss": rss,
        "https://feed.test/atom": atom,
    }

    with patch(
        "app.pipeline._fetch_feed",
        side_effect=lambda url, timeout: feeds[url],
    ):
        items = run_news_pipeline(
            feeds,
            summarizer=lambda item: f"Summary: {item.title}",
        )

    assert items == [
        NewsItem(
            "First story",
            "https://news.test/1",
            "Details",
            "Today",
            "feed.test",
            "Summary: First story",
        ),
        NewsItem(
            "Second story",
            "https://news.test/2",
            "",
            "",
            "feed.test",
            "Summary: Second story",
        ),
    ]


@pytest.mark.parametrize(
    ("kwargs", "message"),
    [
        ({"timeout": 0}, "timeout"),
        ({"max_items_per_feed": 0}, "max_items_per_feed"),
    ],
)
def test_pipeline_rejects_invalid_limits(kwargs, message) -> None:
    with pytest.raises(ValueError, match=message):
        run_news_pipeline([], **kwargs)
