"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type NewsItem = {
  title: string;
  link: string;
  description: string;
  published: string;
  source: string;
};

type Tab = "news" | "stocks" | "indian-stocks" | "chat" | "learning" | "notepad" | "automation";
type NewsTab = "news" | "stocks" | "indian-stocks";
type SearchCategory = NewsTab;
type ChatMessage = { role: "user" | "assistant"; content: string };
type LearningMode = "learn" | "interview";
type DateFilter = "today" | "yesterday" | "week" | "all";
type Note = { id: string; title: string; content: string; updated_at: string };
type Task = { id: string; title: string; completed: boolean; created_at: string };

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function isNewsTab(tab: Tab): tab is NewsTab {
  return tab === "news" || tab === "stocks" || tab === "indian-stocks";
}

function formatDate(value: string): string {
  if (!value) return "Latest";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function matchesDateFilter(value: string, filter: DateFilter): boolean {
  if (filter === "all") return true;
  const published = new Date(value);
  if (!value || Number.isNaN(published.getTime())) return false;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const publishedStart = new Date(published.getFullYear(), published.getMonth(), published.getDate());
  if (filter === "today") return publishedStart.getTime() === todayStart.getTime();
  if (filter === "yesterday") {
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    return publishedStart.getTime() === yesterdayStart.getTime();
  }
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 6);
  return published >= weekStart && published <= today;
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("news");
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [stockItems, setStockItems] = useState<NewsItem[]>([]);
  const [indianStockItems, setIndianStockItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [searchItems, setSearchItems] = useState<NewsItem[]>([]);
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [hinglishSummaries, setHinglishSummaries] = useState<Record<string, string>>({});
  const [summarizing, setSummarizing] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState("");
  const [speakingLink, setSpeakingLink] = useState<string | null>(null);
  const [speechError, setSpeechError] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [noteId, setNoteId] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [notesReady, setNotesReady] = useState(false);
  const [noteStatus, setNoteStatus] = useState("Loading your local note…");
  const [taskError, setTaskError] = useState("");
  const [learningMode, setLearningMode] = useState<LearningMode>("learn");
  const [learningTopic, setLearningTopic] = useState("");
  const [learningLevel, setLearningLevel] = useState("Beginner");
  const [learningContent, setLearningContent] = useState("");
  const [learningLoading, setLearningLoading] = useState(false);
  const [learningError, setLearningError] = useState("");

  const items = tab === "stocks"
    ? stockItems
    : tab === "indian-stocks"
      ? indianStockItems
      : newsItems;
  const visibleItems = (search.trim() ? searchItems : items).filter((item) =>
    matchesDateFilter(item.published, dateFilter),
  );

  useEffect(() => () => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const loadNews = useCallback(async (category: NewsTab) => {
    setLoading(true);
    setError("");
    try {
      const endpoint = category === "indian-stocks"
        ? "stocks/india"
        : category === "stocks"
          ? "stocks"
          : "news";
      const response = await fetch(`${API_URL}/api/${endpoint}?period=all`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail ?? "Could not load news.");
      }
      if (category === "stocks") {
        setStockItems(data);
      } else if (category === "indian-stocks") {
        setIndianStockItems(data);
      } else {
        setNewsItems(data);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect to the news API.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isNewsTab(tab)) {
      void loadNews(tab);
      setSearch("");
    }
  }, [loadNews, tab]);

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2 || !isNewsTab(tab)) {
      setSearchItems([]);
      setSearchLoading(false);
      setSearchError("");
      return;
    }

    const controller = new AbortController();
    setSearchLoading(true);
    setSearchError("");
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          query,
          category: tab as SearchCategory,
        });
        const response = await fetch(`${API_URL}/api/search?${params}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.detail ?? "Could not search news.");
        }
        setSearchItems(data);
      } catch (cause) {
        if (cause instanceof Error && cause.name === "AbortError") return;
        setSearchItems([]);
        setSearchError(cause instanceof Error ? cause.message : "Could not search news.");
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, tab]);

  useEffect(() => {
    void Promise.all([
      fetch(`${API_URL}/api/notes`).then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail ?? "Could not load notes.");
        return data as Note[];
      }),
      fetch(`${API_URL}/api/tasks`).then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail ?? "Could not load tasks.");
        return data as Task[];
      }),
    ]).then(([savedNotes, savedTasks]) => {
      setNotes(savedNotes);
      setTasks(savedTasks);
      if (savedNotes[0]) {
        setNoteId(savedNotes[0].id);
        setNoteTitle(savedNotes[0].title);
        setNoteContent(savedNotes[0].content);
      }
      setNoteStatus("Saved in your local database");
    }).catch((cause: unknown) => {
      setNoteStatus(cause instanceof Error ? cause.message : "Could not load saved data.");
      setTaskError(cause instanceof Error ? cause.message : "Could not load tasks.");
    }).finally(() => {
      setNotesReady(true);
    });
  }, []);

  useEffect(() => {
    if (!notesReady || (!noteTitle && !noteContent)) return;
    const currentId = noteId || crypto.randomUUID();
    if (!noteId) setNoteId(currentId);
    setNoteStatus("Saving…");
    const timer = setTimeout(() => {
      void fetch(`${API_URL}/api/notes/${currentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: noteTitle, content: noteContent }),
      }).then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail ?? "Could not save this note.");
        setNotes((current) => [data as Note, ...current.filter((note) => note.id !== currentId)]);
        setNoteStatus("Saved in your local database");
      }).catch((cause: unknown) => {
        setNoteStatus(cause instanceof Error ? cause.message : "Could not save this note.");
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [noteId, noteTitle, noteContent, notesReady]);

  async function summarize(item: NewsItem, language: "en" | "hinglish") {
    const summaryKey = `${item.link}:${language}`;
    setSummarizing(summaryKey);
    setSummaryError("");
    try {
      const response = await fetch(`${API_URL}/api/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: item.title, description: item.description, language }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail ?? "Could not summarize this article.");
      }
      if (language === "hinglish") {
        setHinglishSummaries((current) => ({ ...current, [item.link]: data.summary }));
      } else {
        setSummaries((current) => ({ ...current, [item.link]: data.summary }));
      }
    } catch (cause) {
      setSummaryError(cause instanceof Error ? cause.message : "Could not summarize this article.");
    } finally {
      setSummarizing(null);
    }
  }

  function toggleSpeech(item: NewsItem) {
    setSpeechError("");
    if (!("speechSynthesis" in window)) {
      setSpeechError("Text-to-speech is not supported by this browser.");
      return;
    }
    if (speakingLink === item.link) {
      window.speechSynthesis.cancel();
      setSpeakingLink(null);
      return;
    }

    const text = hinglishSummaries[item.link] || summaries[item.link]
      || `${item.title}. ${item.description}`.slice(0, 4_000);
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = hinglishSummaries[item.link] ? "en-IN" : "en";
    utterance.onend = () => setSpeakingLink(null);
    utterance.onerror = () => {
      setSpeakingLink(null);
      setSpeechError("Could not play this story. Check your browser's speech settings.");
    };
    setSpeakingLink(item.link);
    window.speechSynthesis.speak(utterance);
  }

  async function sendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = chatDraft.trim();
    if (!content || chatSending) return;

    const nextMessages = [...chatMessages, { role: "user" as const, content }];
    const requestMessages = nextMessages.length > 20 ? nextMessages.slice(-19) : nextMessages;
    const noteMatch = content.match(
      /^(?:please\s+)?(?:create|make|save)\s+(?:a\s+)?(?:note|notepad)(?:\s+titled?)?\s+(.+?)(?:\s+(?:with content|saying|with text|:)\s+([\s\S]+))?$/i,
    );
    const taskMatch = content.match(
      /^(?:please\s+)?(?:add|create|make)\s+(?:a\s+)?(?:task|to my task list)(?:\s+to)?\s*:?\s+([\s\S]+)$/i,
    );
    setChatSending(true);
    setChatError("");
    setChatDraft("");
    try {
      if (noteMatch) {
        const response = await fetch(`${API_URL}/api/notes/${crypto.randomUUID()}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: noteMatch[1].trim().slice(0, 120),
            content: (noteMatch[2] ?? "").trim(),
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail ?? "Could not create that note.");
        setNotes((current) => [data as Note, ...current]);
        setChatMessages([
          ...requestMessages,
          { role: "assistant", content: `Created “${(data as Note).title || "Untitled note"}”. Open Notepad to read or edit it.` },
        ]);
        return;
      }
      if (taskMatch) {
        const response = await fetch(`${API_URL}/api/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: taskMatch[1].trim() }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail ?? "Could not add that task.");
        setTasks((current) => [data as Task, ...current]);
        setChatMessages([
          ...requestMessages,
          { role: "assistant", content: `Added “${(data as Task).title}” to your task list.` },
        ]);
        return;
      }
      const response = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: requestMessages,
          news_context: visibleItems.slice(0, 25).map((item) =>
            `${item.title} (${item.source}, ${item.published}): ${item.description}`,
          ).join("\n").slice(0, 12_000),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail ?? "Could not get a chat response.");
      }
      setChatMessages([...requestMessages, { role: "assistant", content: data.reply }]);
    } catch (cause) {
      setChatDraft(content);
      setChatError(cause instanceof Error ? cause.message : "Could not connect to the AI provider.");
    } finally {
      setChatSending(false);
    }
  }

  async function toggleTask(task: Task) {
    setTaskError("");
    try {
      const response = await fetch(`${API_URL}/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: task.title, completed: !task.completed }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "Could not update this task.");
      setTasks((current) => current.map((item) => item.id === task.id ? data as Task : item));
    } catch (cause) {
      setTaskError(cause instanceof Error ? cause.message : "Could not update this task.");
    }
  }

  async function deleteTask(task: Task) {
    setTaskError("");
    try {
      const response = await fetch(`${API_URL}/api/tasks/${task.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "Could not remove this task.");
      setTasks((current) => current.filter((item) => item.id !== task.id));
    } catch (cause) {
      setTaskError(cause instanceof Error ? cause.message : "Could not remove this task.");
    }
  }

  async function deleteNote(note: Note) {
    setNoteStatus("Deleting…");
    try {
      const response = await fetch(`${API_URL}/api/notes/${note.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "Could not delete this note.");
      const remaining = notes.filter((item) => item.id !== note.id);
      setNotes(remaining);
      if (noteId === note.id) {
        setNoteId(remaining[0]?.id ?? "");
        setNoteTitle(remaining[0]?.title ?? "");
        setNoteContent(remaining[0]?.content ?? "");
      }
      setNoteStatus("Note deleted");
    } catch (cause) {
      setNoteStatus(cause instanceof Error ? cause.message : "Could not delete this note.");
    }
  }

  async function generateLearningContent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const topic = learningTopic.trim();
    if (!topic || learningLoading) return;

    setLearningLoading(true);
    setLearningError("");
    setLearningContent("");
    try {
      const response = await fetch(`${API_URL}/api/learn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: learningMode,
          topic,
          level: learningLevel,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "Could not generate your study guide.");
      setLearningContent(data.content);
    } catch (cause) {
      setLearningError(cause instanceof Error ? cause.message : "Could not reach the AI provider.");
    } finally {
      setLearningLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Signal home">
          <span className="brand-mark">s</span>
          <span>signal<span className="brand-period">.</span></span>
        </a>

        <div className="sidebar-label">WORKSPACE</div>
        <nav className="navigation" aria-label="Main navigation">
          <button
            className={`nav-item ${tab === "news" ? "active" : ""}`}
            onClick={() => setTab("news")}
          >
            <span className="nav-icon">◈</span> AI News
            <span className="nav-count">{newsItems.length || ""}</span>
          </button>
          <button
            className={`nav-item ${tab === "stocks" ? "active" : ""}`}
            onClick={() => setTab("stocks")}
          >
            <span className="nav-icon">↗</span> Stock News
            <span className="nav-count">{stockItems.length || ""}</span>
          </button>
          <button
            className={`nav-item ${tab === "indian-stocks" ? "active" : ""}`}
            onClick={() => setTab("indian-stocks")}
          >
            <span className="nav-icon">₹</span> Indian Stocks
            <span className="nav-count">{indianStockItems.length || ""}</span>
          </button>
          <button
            className={`nav-item ${tab === "chat" ? "active" : ""}`}
            onClick={() => setTab("chat")}
          >
            <span className="nav-icon">✳</span> AI Chat
          </button>
          <button
            className={`nav-item ${tab === "learning" ? "active" : ""}`}
            onClick={() => setTab("learning")}
          >
            <span className="nav-icon">◎</span> Learn &amp; Prep
          </button>
          <button
            className={`nav-item ${tab === "notepad" ? "active" : ""}`}
            onClick={() => setTab("notepad")}
          >
            <span className="nav-icon">▤</span> Notepad
          </button>
          <button
            className={`nav-item ${tab === "automation" ? "active" : ""}`}
            onClick={() => setTab("automation")}
          >
            <span className="nav-icon">⌘</span> Automation
            <span className="soon-dot" />
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="connection"><span className="status-dot" /> Local workspace</div>
          <div className="profile">
            <div className="avatar">A</div>
            <div><strong>Your workspace</strong><span>Private by default</span></div>
            <span className="profile-menu">···</span>
          </div>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> {tab === "news" ? "AI News" : tab === "stocks" ? "Stock News" : tab === "indian-stocks" ? "Indian Stocks" : tab === "chat" ? "AI Chat" : tab === "learning" ? "Learn & Prep" : tab === "notepad" ? "Notepad" : "Automation"}</div>
          <div className="topbar-right">
            <span className="today-label">YOUR DAILY BRIEFING</span>
            <div className="top-avatar">A</div>
          </div>
        </header>

        {tab === "notepad" ? (
          <div className="content notepad-content">
            <div className="eyebrow"><span className="eyebrow-line" /> YOUR PRIVATE SPACE</div>
            <div className="notepad-heading">
              <div>
                <h1>Notes, as they come<span className="heading-comma">.</span></h1>
                <p className="intro">Notes and task lists are saved in the local SQLite database. Ask Signal in chat to create them too.</p>
              </div>
              <span className="note-status"><span className="status-dot" /> {noteStatus}</span>
            </div>
            <div className="note-list">
              {notes.map((note) => (
                <div className="note-list-item" key={note.id}>
                  <button
                    type="button"
                    className={note.id === noteId ? "selected" : ""}
                    onClick={() => {
                      setNoteId(note.id);
                      setNoteTitle(note.title);
                      setNoteContent(note.content);
                    }}
                  >
                    {note.title || "Untitled note"}
                  </button>
                  <button type="button" onClick={() => void deleteNote(note)} aria-label={`Delete ${note.title || "note"}`}>×</button>
                </div>
              ))}
              <button
                type="button"
                className="new-note-button"
                onClick={() => { setNoteId(""); setNoteTitle(""); setNoteContent(""); }}
              >
                + New note
              </button>
            </div>
            <section className="notepad-card">
              <input
                className="note-title"
                value={noteTitle}
                onChange={(event) => setNoteTitle(event.target.value)}
                placeholder="Untitled note"
                aria-label="Note title"
                maxLength={120}
              />
              <textarea
                className="note-body"
                value={noteContent}
                onChange={(event) => setNoteContent(event.target.value)}
                placeholder={"Start writing…\n\nYour notes stay in this browser and are not sent to the AI provider."}
                aria-label="Note contents"
              />
              <div className="note-footer">
                <span>Stored locally in SQLite</span>
                <button
                  type="button"
                  onClick={() => {
                    const note = notes.find((item) => item.id === noteId);
                    if (note) void deleteNote(note);
                  }}
                  disabled={!noteId}
                >
                  Delete note
                </button>
              </div>
            </section>
            <section className="task-panel">
              <div className="section-heading">
                <div><span className="section-dot" /> YOUR TASK LIST <span className="story-count">{tasks.filter((task) => !task.completed).length} open</span></div>
                <span className="feed-note">Create tasks in AI Chat</span>
              </div>
              {taskError && <div className="notice error-notice" role="alert">{taskError}</div>}
              {tasks.length === 0 ? (
                <div className="empty-state">No tasks yet. In AI Chat, try “Add task: review today&apos;s headlines”.</div>
              ) : (
                <ul className="task-list">
                  {tasks.map((task) => (
                    <li key={task.id}>
                      <label>
                        <input type="checkbox" checked={task.completed} onChange={() => void toggleTask(task)} />
                        <span className={task.completed ? "completed" : ""}>{task.title}</span>
                      </label>
                      <button type="button" onClick={() => void deleteTask(task)} aria-label={`Delete task ${task.title}`}>×</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : tab === "learning" ? (
          <div className="content learning-content">
            <div className="eyebrow"><span className="eyebrow-line" /> LEARN SOMETHING. GET READY.</div>
            <h1>A little practice<br />goes a long way<span className="heading-comma">.</span></h1>
            <p className="intro">Get a clear mini-lesson or prepare for your next interview with an AI study coach.</p>
            <div className="learning-panel">
              <div className="learning-mode-switch" role="group" aria-label="Choose a learning mode">
                <button
                  type="button"
                  className={learningMode === "learn" ? "selected" : ""}
                  onClick={() => { setLearningMode("learn"); setLearningContent(""); setLearningError(""); }}
                >
                  <span>◎</span> Learn a topic
                </button>
                <button
                  type="button"
                  className={learningMode === "interview" ? "selected" : ""}
                  onClick={() => { setLearningMode("interview"); setLearningContent(""); setLearningError(""); }}
                >
                  <span>◈</span> Interview prep
                </button>
              </div>
              <form className="learning-form" onSubmit={(event) => void generateLearningContent(event)}>
                <label htmlFor="learning-topic">{learningMode === "learn" ? "What would you like to learn?" : "What role or subject is your interview about?"}</label>
                <input
                  id="learning-topic"
                  value={learningTopic}
                  onChange={(event) => setLearningTopic(event.target.value)}
                  placeholder={learningMode === "learn" ? "e.g. How the stock market works" : "e.g. Frontend developer, React"}
                  maxLength={300}
                  minLength={2}
                  required
                />
                <label htmlFor="learning-level">Your experience level</label>
                <select id="learning-level" value={learningLevel} onChange={(event) => setLearningLevel(event.target.value)}>
                  <option>Beginner</option>
                  <option>Intermediate</option>
                  <option>Advanced</option>
                </select>
                <button className="learning-submit" type="submit" disabled={learningLoading || !learningTopic.trim()}>
                  {learningLoading ? "Preparing…" : learningMode === "learn" ? "Create my lesson" : "Prepare my interview"}
                  <span>↗</span>
                </button>
              </form>
              {learningError && <div className="notice error-notice" role="alert">{learningError}</div>}
              {learningLoading && <div className="loading-state"><span className="loader" /> Putting your guide together…</div>}
              {learningContent && (
                <article className="learning-result">
                  <div className="eyebrow"><span className="eyebrow-line" /> {learningMode === "learn" ? "YOUR MINI-LESSON" : "YOUR INTERVIEW GUIDE"}</div>
                  <div className="learning-answer">{learningContent}</div>
                </article>
              )}
            </div>
          </div>
        ) : tab === "chat" ? (
          <div className="content chat-content">
            <div className="eyebrow"><span className="eyebrow-line" /> YOUR AI ASSISTANT</div>
            <h1>Let&apos;s think<br />it through<span className="heading-comma">.</span></h1>
            <p className="intro">Ask about the news, markets, or anything you&apos;re curious about.</p>
            <div className="chat-panel">
              <div className="chat-messages" aria-live="polite">
                {chatMessages.length === 0 && (
                  <div className="chat-welcome">
                    <span className="chat-welcome-icon">✳</span>
                    <strong>A little more context. A clearer picture.</strong>
                    <p>Ask about current headlines, or say “Create note titled Briefing with content…” or “Add task: review the market”.</p>
                  </div>
                )}
                {chatMessages.map((message, index) => (
                  <div className={`chat-message ${message.role}`} key={`${index}-${message.role}`}>
                    <span className="chat-role">{message.role === "user" ? "YOU" : "SIGNAL"}</span>
                    <p>{message.content}</p>
                  </div>
                ))}
                {chatSending && <div className="chat-thinking"><span className="loader" /> Thinking…</div>}
              </div>
              {chatError && <div className="notice error-notice" role="alert">{chatError}</div>}
              <form className="chat-form" onSubmit={(event) => void sendChat(event)}>
                <textarea
                  value={chatDraft}
                  onChange={(event) => setChatDraft(event.target.value)}
                  placeholder="Ask a question…"
                  aria-label="Your message"
                  maxLength={4_000}
                  rows={2}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                <button type="submit" disabled={chatSending || !chatDraft.trim()}>
                  {chatSending ? "Sending…" : "Send"} <span>↑</span>
                </button>
              </form>
              <div className="chat-privacy">AI replies can be inaccurate. Avoid sending sensitive personal information.</div>
            </div>
          </div>
        ) : tab !== "automation" ? (
          <div className="content">
            <div className="page-heading">
              <div>
                <div className="eyebrow"><span className="eyebrow-line" /> {tab === "indian-stocks" ? "INDIAN MARKETS IN FOCUS" : tab === "stocks" ? "MARKETS IN FOCUS" : "THE SIGNAL, NOT THE NOISE"}</div>
                <h1>{tab === "indian-stocks" ? <>India&apos;s markets<span className="heading-comma">.</span><br />In focus.</> : tab === "stocks" ? <>Markets move<span className="heading-comma">.</span><br />Stay a step ahead.</> : <>Good morning<span className="heading-comma">,</span><br />here&apos;s what matters.</>}</h1>
                <p className="intro">{tab === "indian-stocks" ? "Headlines about Indian equities, NSE, BSE, Nifty and Sensex." : tab === "stocks" ? "The latest market and business headlines, gathered from your finance feeds." : "A considered look at the stories shaping technology and the world."}</p>
              </div>
              <button className="refresh-button" onClick={() => void loadNews(tab)} disabled={loading}>
                <span className={loading ? "spin" : ""}>↻</span> Refresh
              </button>
            </div>

            <label className="search-box">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                placeholder={`Search ${tab === "indian-stocks" ? "Indian stock" : tab === "stocks" ? "stock" : "AI"} news…`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label={`Search ${tab === "indian-stocks" ? "Indian stock" : tab === "stocks" ? "stock" : "AI"} news`}
              />
              {search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search">×</button>}
            </label>

            <label className="date-filter">
              <span>Show</span>
              <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value as DateFilter)} aria-label="Filter news by date">
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="week">Last 7 days</option>
                <option value="all">All time</option>
              </select>
            </label>

            <div className="section-heading">
              <div><span className="section-dot" /> {search ? "SEARCH RESULTS" : tab === "indian-stocks" ? "INDIAN MARKET STORIES" : tab === "stocks" ? "MARKET STORIES" : "TODAY'S STORIES"} <span className="story-count">{visibleItems.length}</span></div>
              <span className="feed-note">{search ? `Web results for “${search}”` : "Curated from your RSS feeds"}</span>
            </div>

            {error && (
              <div className="notice error-notice" role="alert">
                <strong>Couldn&apos;t reach your news feeds.</strong>
                <span>{error}</span>
                <button onClick={() => void loadNews(tab)}>Try again</button>
              </div>
            )}
            {summaryError && <div className="notice summary-notice" role="alert">{summaryError}</div>}
            {speechError && <div className="notice summary-notice" role="alert">{speechError}</div>}
            {searchError && <div className="notice error-notice" role="alert">{searchError}</div>}
            {loading && <div className="loading-state"><span className="loader" /> Gathering the latest stories…</div>}
            {search.trim().length === 1 && (
              <div className="empty-state">Type at least 2 characters to search the web.</div>
            )}
            {searchLoading && <div className="loading-state"><span className="loader" /> Searching the web for stories…</div>}
            {!search.trim() && !loading && !error && items.length === 0 && (
              <div className="empty-state">No stories found. Check your RSS feed settings in `backend/.env`.</div>
            )}
            {search.trim().length >= 2 && !searchLoading && !searchError && visibleItems.length === 0 && (
              <div className="empty-state">No web stories found for “{search}”. Try different keywords.</div>
            )}

            <div className="stories">
              {visibleItems.map((item, index) => (
                <article className="story-card" key={item.link}>
                  <div className="story-index">{String(index + 1).padStart(2, "0")}</div>
                  <div className="story-content">
                    <div className="story-meta">
                      <span className="source-label">{item.source}</span>
                      <span className="meta-divider">·</span>
                      <span>{formatDate(item.published)}</span>
                    </div>
                    <h2><a href={item.link} target="_blank" rel="noreferrer">{item.title}</a></h2>
                    {item.description && <p className="story-description">{item.description}</p>}
                    {summaries[item.link] && (
                      <div className="ai-summary"><span>✳ AI SUMMARY</span><p>{summaries[item.link]}</p></div>
                    )}
                    {hinglishSummaries[item.link] && (
                      <div className="ai-summary hinglish-summary"><span>✳ HINGLISH SUMMARY</span><p>{hinglishSummaries[item.link]}</p></div>
                    )}
                    <div className="story-actions">
                      <a className="read-link" href={item.link} target="_blank" rel="noreferrer">Read full story <span>↗</span></a>
                      {item.description && !summaries[item.link] && (
                        <button
                          className="summarize-button"
                          onClick={() => void summarize(item, "en")}
                          disabled={summarizing !== null}
                        >
                          {summarizing === `${item.link}:en` ? "Thinking…" : "✳ Summarize"}
                        </button>
                      )}
                      {item.description && !hinglishSummaries[item.link] && (
                        <button
                          className="summarize-button"
                          onClick={() => void summarize(item, "hinglish")}
                          disabled={summarizing !== null}
                        >
                          {summarizing === `${item.link}:hinglish` ? "Thinking…" : "✳ Hinglish"}
                        </button>
                      )}
                      <button
                        className="summarize-button speech-button"
                        onClick={() => toggleSpeech(item)}
                        aria-pressed={speakingLink === item.link}
                      >
                        {speakingLink === item.link ? "■ Stop" : "🔊 Listen"}
                      </button>
                    </div>
                  </div>
                  <div className="story-accent" aria-hidden="true" />
                </article>
              ))}
            </div>

            <footer className="page-footer"><span>Built for curiosity.</span><span>News stays on your machine <span className="footer-spark">✳</span></span></footer>
          </div>
        ) : (
          <div className="content automation-content">
            <div className="eyebrow"><span className="eyebrow-line" /> YOUR PERSONAL ASSISTANT</div>
            <h1>Make room for<br />the work that matters.</h1>
            <p className="intro">Describe a task and Signal will help you plan the next step. Browser automation is not enabled yet.</p>
            <div className="automation-card">
              <div className="automation-icon">⌘</div>
              <div>
                <span className="coming-soon">IN DEVELOPMENT</span>
                <h2>Automation is coming soon</h2>
                <p>Job search and application assistance will ask you to review each step before anything is submitted. This starter does not sign in to websites or store credentials.</p>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
