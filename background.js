// background.js
// Receives "video watched" events from the content script, fetches metadata
// for that video, categorizes it, and saves it to chrome.storage.local.

// TODO: put your own YouTube Data API v3 key here.
// Get one free at https://console.cloud.google.com/apis/credentials
// (enable "YouTube Data API v3" on the project first).
const YT_API_KEY = "YOUR_API_KEY_HERE";

// Maps YouTube's built-in categoryId -> a friendly genre bucket.
// Full list: videoCategories.list on the API, or youtube's own reference.
const CATEGORY_MAP = {
  "1": "Entertainment", // Film & Animation
  "10": "Music",
  "15": "Entertainment", // Pets & Animals
  "17": "Entertainment", // Sports
  "19": "Travel",
  "20": "Gaming",
  "22": "Vlogs",
  "23": "Entertainment", // Comedy
  "24": "Entertainment",
  "25": "News",
  "26": "Lifestyle", // Howto & Style
  "27": "Education",
  "28": "Tech", // Science & Technology
};

function categorize(categoryId) {
  return CATEGORY_MAP[categoryId] || "Other";
}

async function fetchVideoMetadata(videoId) {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${YT_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  const item = data.items && data.items[0];
  if (!item) return null;

  return {
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    channelId: item.snippet.channelId,
    categoryId: item.snippet.categoryId,
    tags: item.snippet.tags || [],
  };
}

async function saveWatchEntry(entry) {
  const { watchHistory = [] } = await chrome.storage.local.get("watchHistory");
  watchHistory.push(entry);
  await chrome.storage.local.set({ watchHistory });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "VIDEO_WATCHED") return;

  (async () => {
    const meta = await fetchVideoMetadata(message.videoId);
    if (!meta) return;

    // Manual overrides (set from the dashboard) take priority over the
    // auto-detected genre.
    const { genreOverrides = {} } = await chrome.storage.local.get("genreOverrides");
    const genre = genreOverrides[message.videoId] || categorize(meta.categoryId);

    await saveWatchEntry({
      videoId: message.videoId,
      title: meta.title,
      channelId: meta.channelId,
      channelTitle: meta.channelTitle,
      genre,
      isShort: message.isShort,
      watchedAt: message.watchedAt,
    });
  })();

  return true; // keep the message channel open for the async work above
});

chrome.action.onClicked.addListener(async () => {
  const dashboardUrl = chrome.runtime.getURL("dashboard.html");
  const existing = await chrome.tabs.query({ url: dashboardUrl });

  if (existing.length > 0) {
    chrome.tabs.update(existing[0].id, { active: true });
  } else {
    chrome.tabs.create({ url: dashboardUrl });
  }
});
