# YT Watch Report 🎥📊

<img width="1321" height="862" alt="image" src="https://github.com/user-attachments/assets/1d6605bf-aa8c-480b-ba3e-d0e9b9186e45" />
<img width="1321" height="862" alt="image" src="https://github.com/user-attachments/assets/e83b2672-c4a6-4cdb-96bc-da1d89977e61" />

I watch a *lot* of random stuff on YouTube — some days it's system design videos, some days it's a two-hour rabbit hole of unrelated Shorts — and I got curious about what that actually adds up to over a week or a month. So I built this instead of just wondering about it.

It's a Chrome extension that quietly tracks what you watch (long-form + Shorts) and turns it into a little personal report: genre breakdown, top creators, filterable by week/month/all-time. If it gets a video's genre wrong, you can just fix it — and it remembers your fix.

## What it does

- 🎥 Tracks long-form videos and Shorts automatically — no manual logging, it just runs in the background while you browse normally
- 📊 Colorful charts (Recharts) for genre breakdown and your top 10 creators
- 📅 Toggle between This Week / This Month / All Time
- ✏️ Wrong genre? Click it, fix it — the correction applies retroactively *and* to future watches of that video
- 🏷️ Not happy with the default genre buckets? Make your own
- 📥 Can backfill your actual watch history via a Google Takeout import, since YouTube's API only shows what's watched *after* you install this
- 🖥️ Opens as a proper full-page dashboard, not a squished popup

## How it's built

Nothing fancy — three moving pieces:

1. **`content.js`** sits on youtube.com and notices when you open a new video or Short
2. **`background.js`** grabs that video's metadata from the YouTube Data API, sorts it into a genre, and saves it locally
3. **`dashboard.jsx`** (React + Recharts) reads that saved data and turns it into the report you actually see

Everything lives in `chrome.storage.local` — nothing gets sent anywhere except the read-only calls to YouTube's own API for public video info. No backend, no accounts, no tracking-the-tracker.

## Setting it up

You'll need your own free YouTube Data API key (takes like 2 minutes):

1. Head to [Google Cloud Console](https://console.cloud.google.com/apis/credentials), make a project if you don't have one
2. Enable **YouTube Data API v3**
3. Create an API key under Credentials, copy it
4. Drop it into `YT_API_KEY` in both `background.js` and `src/dashboard.jsx`

Then load it up:

```bash
git clone <your-repo-url>
cd yt-tracker
npm install
npm run build
```

Go to `chrome://extensions`, flip on Developer Mode, hit **Load unpacked**, and pick this folder. Watch a couple videos, click the extension icon, and you've got your first report.

## If you want to tinker with it

The dashboard's actual source is `src/dashboard.jsx` — edit that, then run `npm run build` to regenerate `dashboard.bundle.js` (that's the file Chrome actually loads, so don't hand-edit it). Reload the extension after every build.

```
yt-tracker/
├── manifest.json         # extension permissions & config
├── content.js             # watches youtube.com for new videos/Shorts
├── background.js          # fetches metadata + categorizes + saves it
├── dashboard.html          # the shell that loads the React bundle
├── dashboard.css            # styling
├── dashboard.bundle.js       # compiled — generated, don't touch
├── src/dashboard.jsx          # the actual dashboard source
└── package.json
```

## Stuff I know isn't perfect

- No Instagram Reels support — Instagram just doesn't expose a watch-history API the way YouTube (sort of) does, and DOM-scraping it felt like a whole separate fragile project
- Detecting Shorts relies on watching URL changes + a MutationObserver, since YouTube's a single-page app and doesn't always fire clean navigation events when you're swiping through Shorts
- If you reload the extension while a YouTube tab is already open, that tab needs a manual refresh — otherwise it throws an "Extension context invalidated" error. Annoying but expected, not a bug

## Ideas I might come back to

- Exporting the report as an image to actually share
- Tracking watch *time*, not just video counts
- Some way to sync across devices without needing a real backend
