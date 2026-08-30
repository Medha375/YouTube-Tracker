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

// Kept in sync with the same constants in background.js.
const YT_API_KEY = "AIzaSyBa-hGus8GhPVBTE2KCQH1oDbPMNpzF0_I";
const CATEGORY_MAP = {
  "1": "Entertainment", "10": "Music", "15": "Entertainment", "17": "Entertainment",
  "19": "Travel", "20": "Gaming", "22": "Vlogs", "23": "Entertainment", "24": "Entertainment",
  "25": "News", "26": "Lifestyle", "27": "Education", "28": "Tech",
};

function extractVideoId(titleUrl) {
  if (!titleUrl) return null;
  try {
    const u = new URL(titleUrl);
    if (u.pathname === "/watch") return { id: u.searchParams.get("v"), isShort: false };
    const shortsMatch = u.pathname.match(/^\/shorts\/([^/?]+)/);
    if (shortsMatch) return { id: shortsMatch[1], isShort: true };
  } catch {
    // not a parseable URL — skip
  }
  return null;
}

async function fetchCategoriesBatch(videoIds) {
  // videos.list accepts up to 50 ids per call.
  const categoryById = {};
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${chunk.join(",")}&key=${YT_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    (data.items || []).forEach((item) => {
      categoryById[item.id] = item.snippet.categoryId;
    });
  }
  return categoryById;
}

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

function ImportControl({ importStatus, onFile }) {
  return (
    <div className="import-box">
      <label className="filter-btn import-btn">
        {importStatus === "running" ? "Importing..." : "Import Google Takeout"}
        <input
          type="file"
          accept="application/json"
          onChange={onFile}
          disabled={importStatus === "running"}
          style={{ display: "none" }}
        />
      </label>
      {importStatus && importStatus !== "running" && (
        <div className="import-status">{importStatus}</div>
      )}
      <div className="hint" style={{ marginTop: 6 }}>
        Get your real watch history from{" "}
        <a href="https://takeout.google.com/settings/takeout" target="_blank" rel="noreferrer">
          Google Takeout
        </a>{" "}
        (select only "YouTube and YouTube Music" → history), then upload the watch-history.json file here.
      </div>
    </div>
  );
}

function App() {
  const [history, setHistory] = useState(null); // null = loading
  const [genres, setGenres] = useState(BASE_GENRES);
  const [range, setRange] = useState("week");
  const [importStatus, setImportStatus] = useState(null); // null | "running" | "done" | error string

  useEffect(() => {
    chrome.storage.local.get(["watchHistory", "customGenres"], ({ watchHistory = [], customGenres = [] }) => {
      setHistory(watchHistory);
      setGenres([...BASE_GENRES, ...customGenres.filter((g) => !BASE_GENRES.includes(g))]);
    });
  }, []);

  async function handleTakeoutFile(e) {
    const file = e.target.files[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    setImportStatus("running");
    try {
      const text = await file.text();
      const raw = JSON.parse(text);

      // Google Takeout's watch-history.json is a flat array of entries like:
      // { title: "Watched X", titleUrl: "https://www.youtube.com/watch?v=...",
      //   subtitles: [{ name: "Channel Name" }], time: "2024-01-01T12:00:00Z" }
      const parsed = raw
        .map((item) => {
          const parsedUrl = extractVideoId(item.titleUrl);
          if (!parsedUrl || !parsedUrl.id) return null;
          const watchedAt = item.time ? new Date(item.time).getTime() : null;
          if (!watchedAt) return null;
          return {
            videoId: parsedUrl.id,
            isShort: parsedUrl.isShort,
            title: (item.title || "").replace(/^Watched /, ""),
            channelTitle: item.subtitles?.[0]?.name || "Unknown",
            watchedAt,
          };
        })
        .filter(Boolean);

      if (parsed.length === 0) {
        setImportStatus("No YouTube watch entries found in that file.");
        return;
      }

      const uniqueIds = [...new Set(parsed.map((p) => p.videoId))];
      const categoryById = await fetchCategoriesBatch(uniqueIds);
      const { genreOverrides = {} } = await chrome.storage.local.get("genreOverrides");

      const imported = parsed.map((p) => ({
        videoId: p.videoId,
        title: p.title,
        channelTitle: p.channelTitle,
        isShort: p.isShort,
        watchedAt: p.watchedAt,
        genre: genreOverrides[p.videoId] || CATEGORY_MAP[categoryById[p.videoId]] || "Other",
      }));

      // Avoid duplicating entries already tracked live (same video + same
      // watch timestamp).
      const existingKeys = new Set(history.map((e) => `${e.videoId}_${e.watchedAt}`));
      const newOnes = imported.filter((e) => !existingKeys.has(`${e.videoId}_${e.watchedAt}`));

      const merged = [...history, ...newOnes];
      setHistory(merged);
      await chrome.storage.local.set({ watchHistory: merged });
      setImportStatus(`Imported ${newOnes.length} watch${newOnes.length === 1 ? "" : "es"} (${parsed.length - newOnes.length} already tracked).`);
    } catch (err) {
      setImportStatus(`Import failed: ${err.message}`);
    }
  }

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
      <div style={{ marginTop: 40 }}>
        <div className="empty">No watch history yet — go watch something on YouTube, then come back here.</div>
        <ImportControl importStatus={importStatus} onFile={handleTakeoutFile} />
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
      <ImportControl importStatus={importStatus} onFile={handleTakeoutFile} />

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
