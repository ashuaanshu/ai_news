from datetime import datetime, timezone
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi.testclient import TestClient

from app import main
from app.pipeline import NewsItem

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def isolate_database(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(main.database, "DATABASE_PATH", tmp_path / "test.sqlite3")
    main.database.initialize_database()


def test_health_endpoint() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_news_endpoint_serializes_pipeline_results(monkeypatch) -> None:
    monkeypatch.setattr(
        main,
        "run_news_pipeline",
        lambda *args, **kwargs: [
            NewsItem("A headline", "https://news.test/1", "Details", "Today", "news.test")
        ],
    )
    response = client.get("/api/news")
    assert response.status_code == 200
    assert response.json()[0]["title"] == "A headline"


def test_news_endpoint_persists_and_filters_collected_items(monkeypatch) -> None:
    result = [
        NewsItem(
            "Today headline",
            "https://news.test/today",
            "Details",
            datetime.now(timezone.utc).isoformat(),
            "news.test",
        )
    ]
    monkeypatch.setattr(main, "run_news_pipeline", lambda *args, **kwargs: result)

    response = client.get("/api/news?period=today")

    assert response.status_code == 200
    assert response.json()[0]["title"] == "Today headline"
    assert main.database.list_news("news", "all")[0].title == "Today headline"


def test_news_endpoint_reports_feed_errors(monkeypatch) -> None:
    def fail(*args, **kwargs):
        raise OSError("feed unavailable")

    monkeypatch.setattr(main, "run_news_pipeline", fail)
    response = client.get("/api/news")
    assert response.status_code == 502
    assert "feed unavailable" in response.json()["detail"]


def test_stock_news_endpoint_uses_configured_stock_feeds(monkeypatch) -> None:
    monkeypatch.setenv("STOCK_NEWS_FEEDS", "https://markets.test/rss.xml")
    result = [NewsItem("Market update", "https://markets.test/1", "Details", "", "markets.test")]
    with patch("app.main.run_news_pipeline", return_value=result) as pipeline:
        response = client.get("/api/stocks")

    assert response.status_code == 200
    assert response.json()[0]["title"] == "Market update"
    assert pipeline.call_args.args[0] == ["https://markets.test/rss.xml"]


def test_indian_stock_endpoint_uses_india_market_feeds(monkeypatch) -> None:
    monkeypatch.setenv("INDIAN_STOCK_NEWS_FEEDS", "https://india.test/markets.xml")
    result = [NewsItem("Nifty update", "https://india.test/1", "Details", "", "india.test")]
    with patch("app.main.run_news_pipeline", return_value=result) as pipeline:
        response = client.get("/api/stocks/india")

    assert response.status_code == 200
    assert response.json()[0]["title"] == "Nifty update"
    assert pipeline.call_args.args[0] == ["https://india.test/markets.xml"]


def test_search_endpoint_queries_web_for_indian_stock_news() -> None:
    result = [NewsItem("Jio IPO update", "https://news.test/jio", "Details", "", "news.test")]
    with patch("app.main.run_news_pipeline", return_value=result) as pipeline:
        response = client.get(
            "/api/search",
            params={"query": "Jio IPO", "category": "indian-stocks"},
        )

    assert response.status_code == 200
    assert response.json()[0]["title"] == "Jio IPO update"
    feed_url = pipeline.call_args.args[0][0]
    search_params = parse_qs(urlsplit(feed_url).query)
    assert search_params["q"] == ["Jio IPO NSE OR BSE OR Nifty OR Sensex India"]
    assert search_params["gl"] == ["IN"]


def test_search_endpoint_requires_two_characters() -> None:
    response = client.get("/api/search", params={"query": "a"})
    assert response.status_code == 422


def test_summary_endpoint_requires_provider_configuration(monkeypatch) -> None:
    monkeypatch.delenv("AI_BASE_URL", raising=False)
    monkeypatch.delenv("AI_MODEL", raising=False)
    response = client.post(
        "/api/summarize",
        json={"title": "A headline", "description": "Article text"},
    )
    assert response.status_code == 503


def test_summary_endpoint_uses_configured_provider(monkeypatch) -> None:
    monkeypatch.setenv("AI_BASE_URL", "https://ai.test/v1")
    monkeypatch.setenv("AI_API_KEY", "test-key")
    monkeypatch.setenv("AI_MODEL", "local-model")
    provider_response = Mock()
    provider_response.json.return_value = {
        "choices": [{"message": {"content": "A concise summary."}}]
    }
    with patch("app.main.httpx.post", return_value=provider_response) as post:
        response = client.post(
            "/api/summarize",
            json={
                "title": "A headline",
                "description": "Article text",
                "language": "hinglish",
            },
        )

    assert response.status_code == 200
    assert response.json() == {"summary": "A concise summary."}
    assert "Hinglish" in post.call_args.kwargs["json"]["messages"][0]["content"]
    assert post.call_args.args[0] == "https://ai.test/v1/chat/completions"
    assert "Hinglish" in post.call_args.kwargs["json"]["messages"][0]["content"]
    assert post.call_args.kwargs["headers"]["Authorization"] == "Bearer test-key"


def test_summary_endpoint_rejects_empty_article() -> None:
    response = client.post(
        "/api/summarize",
        json={"title": "A headline", "description": ""},
    )
    assert response.status_code == 422


def test_chat_endpoint_requires_provider_configuration(monkeypatch) -> None:
    monkeypatch.delenv("AI_BASE_URL", raising=False)
    monkeypatch.delenv("AI_MODEL", raising=False)
    response = client.post(
        "/api/chat",
        json={"messages": [{"role": "user", "content": "What happened today?"}]},
    )
    assert response.status_code == 503


def test_chat_endpoint_sends_conversation_to_configured_provider(monkeypatch) -> None:
    monkeypatch.setenv("AI_BASE_URL", "https://ai.test/v1")
    monkeypatch.setenv("AI_API_KEY", "test-key")
    monkeypatch.setenv("AI_MODEL", "test-model")
    provider_response = Mock()
    provider_response.json.return_value = {
        "choices": [{"message": {"content": "Here is a helpful answer."}}]
    }
    with patch("app.main.httpx.post", return_value=provider_response) as post:
        response = client.post(
            "/api/chat",
            json={
                "messages": [
                    {"role": "user", "content": "Tell me about the market."},
                    {"role": "assistant", "content": "Which market?"},
                    {"role": "user", "content": "Indian stocks."},
                ],
                "news_context": "Nifty rose today.",
            },
        )

    assert response.status_code == 200
    assert response.json() == {"reply": "Here is a helpful answer."}
    assert post.call_args.args[0] == "https://ai.test/v1/chat/completions"
    assert post.call_args.kwargs["json"]["messages"][-1] == {
        "role": "user",
        "content": "Indian stocks.",
    }
    assert "Nifty rose today." in post.call_args.kwargs["json"]["messages"][0]["content"]


def test_notes_and_tasks_are_persisted_through_api() -> None:
    note = client.put(
        "/api/notes/briefing",
        json={"title": "Briefing", "content": "Review the market update."},
    )
    task = client.post("/api/tasks", json={"title": "Read the headlines"})

    assert note.status_code == 200
    assert client.get("/api/notes").json()[0]["id"] == "briefing"
    assert task.status_code == 201
    task_id = task.json()["id"]
    assert client.patch(
        f"/api/tasks/{task_id}",
        json={"title": "Read the headlines", "completed": True},
    ).json()["completed"] is True
    assert client.get("/api/tasks").json()[0]["completed"] is True


def test_chat_endpoint_rejects_non_user_final_message() -> None:
    response = client.post(
        "/api/chat",
        json={"messages": [{"role": "assistant", "content": "A reply"}]},
    )
    assert response.status_code == 422


def test_learn_endpoint_generates_a_topic_lesson(monkeypatch) -> None:
    monkeypatch.setenv("AI_BASE_URL", "https://ai.test/v1")
    monkeypatch.setenv("AI_MODEL", "test-model")
    with patch("app.main._complete_ai_request", return_value="Lesson content") as complete:
        response = client.post(
            "/api/learn",
            json={"mode": "learn", "topic": "compound interest", "level": "Beginner"},
        )

    assert response.status_code == 200
    assert response.json() == {"content": "Lesson content"}
    assert "Teach the user about compound interest" in complete.call_args.args[0][1]["content"]


def test_learn_endpoint_generates_interview_prep() -> None:
    with patch("app.main._complete_ai_request", return_value="Interview guide") as complete:
        response = client.post(
            "/api/learn",
            json={"mode": "interview", "topic": "React developer", "level": "Intermediate"},
        )

    assert response.status_code == 200
    assert response.json() == {"content": "Interview guide"}
    assert "5 realistic interview questions" in complete.call_args.args[0][1]["content"]


def test_learn_endpoint_rejects_short_topics() -> None:
    response = client.post(
        "/api/learn",
        json={"mode": "learn", "topic": "a", "level": "Beginner"},
    )
    assert response.status_code == 422


def test_summary_endpoint_rejects_unsupported_summary_language() -> None:
    response = client.post(
        "/api/summarize",
        json={"title": "A headline", "description": "Article text", "language": "fr"},
    )
    assert response.status_code == 422
