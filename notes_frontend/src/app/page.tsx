"use client";

import { useEffect, useMemo, useState } from "react";

type Tag = {
  id: number;
  name: string;
};

type Note = {
  id: number;
  title: string;
  content: string;
  pinned: boolean;
  favorite: boolean;
  tags: Tag[];
  created_at: string;
  updated_at: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001";

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export default function Home() {
  const [token, setToken] = useState<string>("");
  const [email, setEmail] = useState<string>("demo@notemaster.dev");
  const [password, setPassword] = useState<string>("password123");
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [authError, setAuthError] = useState<string>("");

  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [tags, setTags] = useState<Tag[]>([]);
  const [newTag, setNewTag] = useState<string>("");

  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);

  const [title, setTitle] = useState<string>("");
  const [content, setContent] = useState<string>("");
  const [pinned, setPinned] = useState<boolean>(false);
  const [favorite, setFavorite] = useState<boolean>(false);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);

  const [query, setQuery] = useState<string>("");
  const [filterPinned, setFilterPinned] = useState<boolean>(false);
  const [filterFavorite, setFilterFavorite] = useState<boolean>(false);
  const [filterTagName, setFilterTagName] = useState<string>("");

  const [loading, setLoading] = useState<boolean>(false);
  const [appError, setAppError] = useState<string>("");

  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedNoteId) || null,
    [notes, selectedNoteId]
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!selectedNote) return;
    setTitle(selectedNote.title);
    setContent(selectedNote.content);
    setPinned(selectedNote.pinned);
    setFavorite(selectedNote.favorite);
    setSelectedTagIds(selectedNote.tags.map((t) => t.id));
  }, [selectedNote]);

  useEffect(() => {
    if (!token || !selectedNoteId) return;

    const timer = setTimeout(() => {
      void saveNote(true);
    }, 1200);

    return () => clearTimeout(timer);
  }, [title, content, pinned, favorite, selectedTagIds, token, selectedNoteId]);

  async function safeFetch<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    if (!response.ok) {
      let detail = "Request failed";
      try {
        const body = await response.json();
        detail = body.detail || body.error || detail;
      } catch {
        detail = response.statusText || detail;
      }
      throw new Error(detail);
    }
    return (await response.json()) as T;
  }

  async function authenticate() {
    setAuthError("");
    try {
      const endpoint = authMode === "register" ? "/auth/register" : "/auth/login";
      const data = await safeFetch<{ token: string }>(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      setToken(data.token);
      await bootstrapData(data.token);
    } catch (error) {
      setAuthError((error as Error).message);
    }
  }

  async function bootstrapData(currentToken: string) {
    setLoading(true);
    setAppError("");
    try {
      const [tagData, noteData, themeData] = await Promise.all([
        safeFetch<Tag[]>(`${API_BASE}/tags`, { headers: authHeaders(currentToken) }),
        safeFetch<Note[]>(`${API_BASE}/notes`, { headers: authHeaders(currentToken) }),
        safeFetch<{ theme: "light" | "dark" }>(`${API_BASE}/settings/theme`, {
          headers: authHeaders(currentToken),
        }),
      ]);
      setTags(tagData);
      setNotes(noteData);
      setTheme(themeData.theme || "light");
      if (noteData.length > 0) {
        setSelectedNoteId(noteData[0].id);
      } else {
        clearEditor();
      }
    } catch (error) {
      setAppError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function clearEditor() {
    setSelectedNoteId(null);
    setTitle("");
    setContent("");
    setPinned(false);
    setFavorite(false);
    setSelectedTagIds([]);
  }

  async function refreshNotes() {
    if (!token) return;
    setLoading(true);
    setAppError("");
    try {
      const params = new URLSearchParams();
      if (query) params.append("q", query);
      if (filterPinned) params.append("pinned", "true");
      if (filterFavorite) params.append("favorite", "true");
      if (filterTagName) params.append("tag", filterTagName);

      const endpoint = params.toString() ? `/notes?${params.toString()}` : "/notes";
      const noteData = await safeFetch<Note[]>(`${API_BASE}${endpoint}`, {
        headers: authHeaders(token),
      });
      setNotes(noteData);
      if (noteData.length === 0) clearEditor();
      if (selectedNoteId && !noteData.some((n) => n.id === selectedNoteId)) {
        setSelectedNoteId(noteData[0]?.id ?? null);
      }
    } catch (error) {
      setAppError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function createNote() {
    if (!token) return;
    setLoading(true);
    setAppError("");
    try {
      const note = await safeFetch<Note>(`${API_BASE}/notes`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          title: "Untitled Note",
          content: "",
          pinned: false,
          favorite: false,
          tag_ids: [],
        }),
      });
      await refreshNotes();
      setSelectedNoteId(note.id);
    } catch (error) {
      setAppError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function saveNote(isAutosave = false) {
    if (!token || !selectedNoteId) return;
    try {
      const endpoint = isAutosave ? `/notes/${selectedNoteId}/autosave` : `/notes/${selectedNoteId}`;
      const updated = await safeFetch<Note>(`${API_BASE}${endpoint}`, {
        method: isAutosave ? "POST" : "PUT",
        headers: authHeaders(token),
        body: JSON.stringify({
          title,
          content,
          pinned,
          favorite,
          tag_ids: selectedTagIds,
        }),
      });

      setNotes((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)).sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        })
      );
    } catch (error) {
      if (!isAutosave) setAppError((error as Error).message);
    }
  }

  async function deleteNote() {
    if (!token || !selectedNoteId) return;
    setLoading(true);
    setAppError("");
    try {
      await safeFetch<{ deleted: boolean }>(`${API_BASE}/notes/${selectedNoteId}`, {
        method: "DELETE",
        headers: authHeaders(token),
      });
      await refreshNotes();
    } catch (error) {
      setAppError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function createTag() {
    if (!token || !newTag.trim()) return;
    try {
      const created = await safeFetch<Tag>(`${API_BASE}/tags`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ name: newTag.trim() }),
      });
      setTags((prev) => {
        const exists = prev.some((t) => t.id === created.id);
        return exists ? prev : [...prev, created].sort((a, b) => a.name.localeCompare(b.name));
      });
      setNewTag("");
    } catch (error) {
      setAppError((error as Error).message);
    }
  }

  async function updateTheme(nextTheme: "light" | "dark") {
    if (!token) return;
    try {
      await safeFetch<{ theme: "light" | "dark" }>(`${API_BASE}/settings/theme`, {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify({ theme: nextTheme }),
      });
      setTheme(nextTheme);
    } catch (error) {
      setAppError((error as Error).message);
    }
  }

  function toggleTag(tagId: number) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  }

  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <section className="retro-card w-full max-w-md">
          <h1 className="text-2xl font-bold">NoteMaster // Retro Terminal</h1>
          <p className="retro-muted mt-1">Authenticate to begin syncing your notes.</p>

          <div className="retro-row mt-4">
            <button
              className="retro-button"
              onClick={() => setAuthMode("register")}
              type="button"
              aria-label="Switch to register mode"
            >
              Register
            </button>
            <button
              className="retro-button secondary"
              onClick={() => setAuthMode("login")}
              type="button"
              aria-label="Switch to login mode"
            >
              Login
            </button>
          </div>

          <label className="block mt-4">
            <span>Email</span>
            <input
              className="retro-input mt-1"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
            />
          </label>

          <label className="block mt-3">
            <span>Password</span>
            <input
              className="retro-input mt-1"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
            />
          </label>

          <button className="retro-button mt-4" onClick={authenticate} type="button">
            {authMode === "register" ? "Create Account" : "Sign In"}
          </button>

          {authError ? <p className="retro-error">{authError}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="retro-app">
      <aside className="retro-sidebar">
        <h2 className="text-xl font-bold">Tags</h2>
        <p className="retro-muted mt-1">Filter + classify your notes</p>

        <div className="retro-row mt-3">
          <input
            className="retro-input"
            placeholder="new tag..."
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
          />
          <button className="retro-button" onClick={createTag} type="button">
            +
          </button>
        </div>

        <div className="mt-3">
          <label>
            <span className="retro-muted">Filter by tag</span>
            <select
              className="retro-select mt-1"
              value={filterTagName}
              onChange={(e) => setFilterTagName(e.target.value)}
            >
              <option value="">All tags</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.name}>
                  {tag.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4">
          {tags.map((tag) => (
            <span className="retro-badge" key={tag.id}>
              #{tag.name}
            </span>
          ))}
        </div>

        <hr className="my-4 border-[var(--retro-border)]" />

        <h3 className="font-bold">Theme</h3>
        <div className="retro-row mt-2">
          <button className="retro-button" onClick={() => updateTheme("light")} type="button">
            Light
          </button>
          <button className="retro-button secondary" onClick={() => updateTheme("dark")} type="button">
            Dark
          </button>
        </div>
      </aside>

      <section className="retro-main">
        <header className="retro-topbar">
          <input
            className="retro-input"
            placeholder="search notes..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <label className="retro-muted">
            <input
              type="checkbox"
              checked={filterPinned}
              onChange={(e) => setFilterPinned(e.target.checked)}
            />{" "}
            pinned
          </label>
          <label className="retro-muted">
            <input
              type="checkbox"
              checked={filterFavorite}
              onChange={(e) => setFilterFavorite(e.target.checked)}
            />{" "}
            favorites
          </label>
          <button className="retro-button" onClick={refreshNotes} type="button">
            Search
          </button>
          <button className="retro-button secondary" onClick={createNote} type="button">
            New Note
          </button>
        </header>

        <div className="retro-content">
          <section className="retro-card">
            <h3 className="font-bold">Your Notes</h3>
            <p className="retro-muted mt-1">{loading ? "Loading..." : `${notes.length} note(s)`}</p>

            <div className="retro-note-list mt-3">
              {notes.map((note) => (
                <article
                  key={note.id}
                  className={`retro-note-item ${selectedNoteId === note.id ? "active" : ""}`}
                  onClick={() => setSelectedNoteId(note.id)}
                >
                  <h4 className="font-bold">{note.title || "Untitled"}</h4>
                  <p className="retro-muted">
                    {note.content.slice(0, 80) || "Empty note"}{note.content.length > 80 ? "..." : ""}
                  </p>
                  <div>
                    {note.pinned ? <span className="retro-badge">PINNED</span> : null}
                    {note.favorite ? <span className="retro-badge">FAV</span> : null}
                    {note.tags.map((t) => (
                      <span className="retro-badge" key={t.id}>
                        #{t.name}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="retro-card">
            {selectedNoteId ? (
              <>
                <h3 className="font-bold">Editor</h3>

                <label className="block mt-3">
                  <span>Title</span>
                  <input
                    className="retro-input mt-1"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Note title..."
                  />
                </label>

                <label className="block mt-3">
                  <span>Content</span>
                  <textarea
                    className="retro-textarea mt-1"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Write your thoughts..."
                  />
                </label>

                <div className="retro-row mt-3">
                  <label className="retro-muted">
                    <input
                      type="checkbox"
                      checked={pinned}
                      onChange={(e) => setPinned(e.target.checked)}
                    />{" "}
                    Pinned
                  </label>
                  <label className="retro-muted">
                    <input
                      type="checkbox"
                      checked={favorite}
                      onChange={(e) => setFavorite(e.target.checked)}
                    />{" "}
                    Favorite
                  </label>
                </div>

                <div className="mt-3">
                  <p className="retro-muted">Tags</p>
                  <div className="retro-row mt-1">
                    {tags.map((tag) => (
                      <label key={tag.id} className="retro-muted">
                        <input
                          type="checkbox"
                          checked={selectedTagIds.includes(tag.id)}
                          onChange={() => toggleTag(tag.id)}
                        />{" "}
                        {tag.name}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="retro-row mt-4">
                  <button className="retro-button" onClick={() => saveNote(false)} type="button">
                    Save
                  </button>
                  <button className="retro-button danger" onClick={deleteNote} type="button">
                    Delete
                  </button>
                </div>
              </>
            ) : (
              <div>
                <h3 className="font-bold">No note selected</h3>
                <p className="retro-muted mt-2">Create a new note or choose one from the list.</p>
              </div>
            )}

            {appError ? <p className="retro-error">{appError}</p> : null}
          </section>
        </div>
      </section>
    </main>
  );
}
