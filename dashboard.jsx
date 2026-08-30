import React, { useState, useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer,
} from "recharts";

const RANGE_MS = { week: 7 * 24 * 60 * 60 * 1000, month: 30 * 24 * 60 * 60 * 1000, all: Infinity };
const BASE_GENRES = [
  "Entertainment", "Music", "Sports", "Travel", "Gaming",
  "Vlogs", "News", "Lifestyle", "Education", "Tech", "Other",
];
const COLORS = ["#ff0033", "#ff6b35", "#ffb800", "#4ade80", "#22d3ee", "#818cf8", "#e879f9", "#fb7185", "#a3e635", "#f472b6", "#60a5fa"];

function Bars({ title, data }) {
  if (data.length === 0) {
    return (
      <div className="section">
        <h2>{title}</h2>
        <div className="empty">Nothing watched in this range yet.</div>
      </div>
    );
  }
  return (
    <div className="section">
      <h2>{title}</h2>
      <ResponsiveContainer width="100%" height={Math.max(120, data.length * 34)}>
        <BarChart data={data} layout="vertical" margin={{ left: 20, right: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#222" horizontal={false} />
          <XAxis type="number" allowDecimals={false} stroke="#888" fontSize={12} />
          <YAxis type="category" dataKey="name" stroke="#ccc" fontSize={13} width={110} />
          <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #333", color: "#fff" }} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function App() {
  const [history, setHistory] = useState(null); // null = loading
  const [genres, setGenres] = useState(BASE_GENRES);
  const [range, setRange] = useState("week");

  useEffect(() => {
    chrome.storage.local.get(["watchHistory", "customGenres"], ({ watchHistory = [], customGenres = [] }) => {
      setHistory(watchHistory);
      setGenres([...BASE_GENRES, ...customGenres.filter((g) => !BASE_GENRES.includes(g))]);
    });
  }, []);

  const filtered = useMemo(() => {
    if (!history) return [];
    const cutoff = Date.now() - RANGE_MS[range];
    return history.filter((e) => e.watchedAt >= cutoff);
  }, [history, range]);

  const genreData = useMemo(() => {
    const counts = {};
    filtered.forEach((e) => (counts[e.genre] = (counts[e.genre] || 0) + 1));
    return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [filtered]);

  const creatorData = useMemo(() => {
    const counts = {};
    filtered.forEach((e) => (counts[e.channelTitle] = (counts[e.channelTitle] || 0) + 1));
    return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [filtered]);

  const recent = useMemo(
    () => [...filtered].sort((a, b) => b.watchedAt - a.watchedAt).slice(0, 30),
    [filtered]
  );

  async function applyGenreOverride(videoId, newGenre) {
    const { genreOverrides = {} } = await chrome.storage.local.get("genreOverrides");
    genreOverrides[videoId] = newGenre;
    await chrome.storage.local.set({ genreOverrides });

    const updated = history.map((e) => (e.videoId === videoId ? { ...e, genre: newGenre } : e));
    setHistory(updated);
    await chrome.storage.local.set({ watchHistory: updated });
  }

  async function handleGenreChange(videoId, value, prevValue) {
    if (value !== "__new__") {
      await applyGenreOverride(videoId, value);
      return;
    }
    const typed = prompt("Name your new genre:");
    if (!typed || !typed.trim()) return; // select snaps back on next render automatically
    const newGenre = typed.trim();

    if (!genres.includes(newGenre)) {
      const { customGenres = [] } = await chrome.storage.local.get("customGenres");
      const updatedCustom = customGenres.includes(newGenre) ? customGenres : [...customGenres, newGenre];
      await chrome.storage.local.set({ customGenres: updatedCustom });
      setGenres((g) => [...g, newGenre]);
    }
    await applyGenreOverride(videoId, newGenre);
  }

  if (history === null) {
    return <div className="loading">Loading your watch history...</div>;
  }

  if (history.length === 0) {
    return (
      <div className="empty" style={{ marginTop: 40 }}>
        No watch history yet — go watch something on YouTube, then come back here.
      </div>
    );
  }

  return (
    <>
      <h1>Your YouTube Watch Report</h1>
      <div className="filter-row">
        {["week", "month", "all"].map((r) => (
          <button
            key={r}
            className={`filter-btn ${range === r ? "active" : ""}`}
            onClick={() => setRange(r)}
          >
            {r === "week" ? "This Week" : r === "month" ? "This Month" : "All Time"}
          </button>
        ))}
      </div>
      <div className="summary">{filtered.length} video{filtered.length === 1 ? "" : "s"} watched</div>

      <Bars title="By Genre" data={genreData} />
      <Bars title="Top Creators" data={creatorData} />

      <div className="section">
        <h2>Recent Videos <span className="hint">(pick a genre to fix it)</span></h2>
        {recent.length === 0 ? (
          <div className="empty">Nothing here yet.</div>
        ) : (
          recent.map((entry) => (
            <div className="video-row" key={entry.videoId + entry.watchedAt}>
              <div className="video-title" title={entry.title}>{entry.title}</div>
              <div className="video-channel" title={entry.channelTitle}>{entry.channelTitle}</div>
              <select
                className="genre-select"
                value={entry.genre}
                onChange={(e) => handleGenreChange(entry.videoId, e.target.value, entry.genre)}
              >
                {genres.map((g) => <option key={g} value={g}>{g}</option>)}
                <option value="__new__">+ New genre...</option>
              </select>
            </div>
          ))
        )}
      </div>
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
