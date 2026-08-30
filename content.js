// content.js
// Runs on every youtube.com page. Detects when the user starts watching a
// new video (long-form or Shorts) and tells the background worker.

let lastVideoId = null;
let urlWatcher;
let observer;

function extractVideoId(url) {
  const u = new URL(url);

  // Long-form: youtube.com/watch?v=VIDEO_ID
  if (u.pathname === "/watch") {
    return u.searchParams.get("v");
  }

  // Shorts: youtube.com/shorts/VIDEO_ID
  const shortsMatch = u.pathname.match(/^\/shorts\/([^/?]+)/);
  if (shortsMatch) {
    return shortsMatch[1];
  }

  return null;
}

function reportIfNewVideo() {
  const videoId = extractVideoId(location.href);
  if (!videoId || videoId === lastVideoId) return;

  lastVideoId = videoId;
  const isShort = location.pathname.startsWith("/shorts/");

  // If the extension was reloaded/updated while this tab stayed open, the
  // old content script's connection to chrome.runtime is dead — calling it
  // throws "Extension context invalidated". That's expected during dev;
  // just stop this tab's watchers instead of spamming console errors.
  try {
    chrome.runtime.sendMessage({
      type: "VIDEO_WATCHED",
      videoId,
      isShort,
      watchedAt: Date.now(),
    });
  } catch (err) {
    if (err.message.includes("Extension context invalidated")) {
      clearInterval(urlWatcher);
      observer.disconnect();
    } else {
      throw err;
    }
  }
}

// 1. Catch normal navigations (page loads / full reloads).
reportIfNewVideo();

// 2. YouTube is a single-page app — URL changes without a reload for both
//    clicking a new video and swiping through Shorts. Watch the URL.
let lastHref = location.href;
urlWatcher = setInterval(() => {
  if (location.href !== lastHref) {
    lastHref = location.href;
    reportIfNewVideo();
  }
}, 1000);

// 3. Shorts feed also swaps the active short via internal DOM changes that
//    sometimes don't touch the URL fast enough — a MutationObserver as a
//    backstop catches those.
observer = new MutationObserver(() => reportIfNewVideo());
observer.observe(document.body, { childList: true, subtree: true });
