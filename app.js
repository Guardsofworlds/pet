/* PawTrail — main application
   Hash router + in-memory state + localStorage persistence
*/

const STORAGE_KEY = "pawtrail.v3";

// Believable baseline for the "Reunited this month" demo stat. Live reunion
// claims increment from here. Set to 0 for a true blank-slate launch.
const DEMO_REUNIONS_BASE = 38;

const state = {
  listings: [],
  alerts: [],
  communityPosts: [],
  postSubmissions: [],   // ISO timestamps of this browser's own posts (local rate-limit fallback)
  reunions: DEMO_REUNIONS_BASE,
  draft: null,
  tipDismissed: false,
  bookmarks: [],
  shareCounts: {},
  moderationWarnings: 0,
  moderationBanUntil: null,
  matchWeights: null,
  matchFeedback: [],
  settings: { email: true, sms: false, freq: "instant", paused: false, darkMode: false },
  pwaInstallDismissed: false,
  user: null,
  cookieConsent: null, // null = not yet decided, "full" | "essential" | "rejected"
};

const DEFAULT_MATCH_WEIGHTS = {
  base: 0.05,
  color: 0.2,
  breedExact: 0.15,
  breedSimilar: 0.05,
  size: 0.05,
  zipExact: 0.1,
  zipNear: 0.05,
  distanceClose: 0.05,
  timeClose: 0.05,
  image: 0.35,
};

// ---------- storage ----------
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) Object.assign(state, JSON.parse(raw));
    state.listings = (state.listings || []).filter(l => !/^L-\d+/.test(l.id || "") && !/^SH-\d+/.test(l.id || ""));
    if (!state.reunions) state.reunions = DEMO_REUNIONS_BASE;
  } catch (e) { /* ignore */ }
}
function saveState() {
  if (state.cookieConsent === "rejected") return; // honour cookie rejection — no localStorage
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      listings: state.listings,
      alerts: state.alerts,
      communityPosts: state.communityPosts,
      postSubmissions: state.postSubmissions,
      reunions: state.reunions,
      draft: state.draft,
      tipDismissed: state.tipDismissed,
      bookmarks: state.bookmarks,
      shareCounts: state.shareCounts,
      moderationWarnings: state.moderationWarnings,
      moderationBanUntil: state.moderationBanUntil,
      matchWeights: state.matchWeights,
      matchFeedback: state.matchFeedback,
      settings: state.settings,
      pwaInstallDismissed: state.pwaInstallDismissed,
      user: state.user,
      cookieConsent: state.cookieConsent,
    }));
  } catch (e) { /* quota */ }
}

// ---------- helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const escapeHtml = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const html = (strings, ...vals) =>
  strings.reduce((acc, s, i) => acc + s + (vals[i] !== undefined ? vals[i] : ""), "");

// The AI engine + mind (ai-engine.js / ai-mind.js) read these helpers off the
// global object (window.$, window.html, …). They're declared with `const`, so
// they live in module scope, not on `window` — without this the AI Mind page
// (which renders via window.$) silently finds no #app and shows nothing.
Object.assign(window, { $, $$, escapeHtml, html });

// ---------- icon system ----------
// Clean, consistent stroke icons (Feather-style, currentColor). Replaces emoji
// across the UI for a calmer, more professional tone. Use icon('name') in markup;
// for HTML-escaped or textContent contexts, do NOT inject SVG — use plain text.
const ICONS = {
  paw: '<path d="M11 13.5c-2 0-3.7 1.6-3.7 3 0 1.1.9 1.7 2 1.7.7 0 1-.3 1.7-.3s1 .3 1.7.3c1.1 0 2-.6 2-1.7 0-1.4-1.7-3-3.4-3Z"/><circle cx="6.6" cy="11" r="1.4"/><circle cx="15.4" cy="11" r="1.4"/><circle cx="9" cy="8.2" r="1.4"/><circle cx="13" cy="8.2" r="1.4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
  volume: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14"/>',
  'volume-x': '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>',
  'life-buoy': '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="m4.9 4.9 4.2 4.2M14.8 14.8l4.3 4.3M14.8 9.1l4.3-4.2M14.7 9.3l4-4M4.9 19.1l4.2-4.2"/>',
  smartphone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z"/>',
  map: '<path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/>',
  clipboard: '<rect x="8" y="3" width="8" height="4" rx="1"/><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/>',
  building: '<path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1"/>',
  lightbulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.4.9 1 .9 1.7V16h5.4v-.5c0-.7.3-1.3.9-1.7A6 6 0 0 0 12 3Z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14Z"/><path d="M4 19.5V21h14"/>',
  'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  'alert-triangle': '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"/>',
  printer: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  'map-pin': '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 6 10 7L22 6"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  home: '<path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2h-4v-6H9v6H5a2 2 0 0 1-2-2Z"/>',
  'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l2-3h8l2 3h3a2 2 0 0 1 2 2Z"/><circle cx="12" cy="13" r="4"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6l2 3h8a2 2 0 0 1 2 2Z"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
  dollar: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  'help-circle': '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
  bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  message: '<path d="M21 11.5a8 8 0 0 1-11.7 7L3 21l2.5-6.3A8 8 0 1 1 21 11.5Z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  'check-circle': '<path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><path d="M22 4 12 14.1l-3-3"/>',
  heart: '<path d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1 7.8 7.8 7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8Z"/>',
  'alert-circle': '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  flag: '<path d="M4 22V4s1-1 4-1 5 2 8 2 4-1 4-1v10s-1 1-4 1-5-2-8-2-4 1-4 1"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z"/>',
  megaphone: '<path d="M3 11v3a1 1 0 0 0 1 1h2l3 4V6L6 10H4a1 1 0 0 0-1 1Z"/><path d="M11 6.5 19 3v18l-8-3.5"/>',
  broadcast: '<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19 5a10 10 0 0 1 0 14M5 19A10 10 0 0 1 5 5"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1Z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  // Distinct, recognizable per-species icons (same stroke language as the rest).
  dog: '<path d="M10 5 7.7 3.4C6.3 2.4 4.3 3 3.8 4.7L2.7 8.9a3 3 0 0 0 .6 2.7l1.4 1.6"/><path d="m14 5 2.3-1.6c1.4-1 3.4-.4 3.9 1.3l1.1 4.2a3 3 0 0 1-.6 2.7l-1.4 1.6"/><path d="M5 9.5A6.5 6 0 0 0 4.6 14c.6 3.4 3.7 5.5 7.4 5.5s6.8-2.1 7.4-5.5a6.5 6 0 0 0-.4-4.5"/><path d="M9.5 13h.01M14.5 13h.01"/><path d="M10.5 15.5a1.6 1.6 0 0 0 3 0Z"/>',
  cat: '<path d="M4.6 3.8 8 8M19.4 3.8 16 8"/><path d="M8 8a6.2 5.6 0 0 0-2.3 4.4c0 3.2 2.8 5.4 6.3 5.4s6.3-2.2 6.3-5.4A6.2 5.6 0 0 0 16 8"/><path d="M9.4 12.3h.01M14.6 12.3h.01"/><path d="M10.9 14.4a1.6 1.4 0 0 0 2.2 0"/><path d="M6.2 13 3.6 12.4M17.8 13l2.6-.6M6.4 14.6l-2.5.9M17.6 14.6l2.5.9"/>',
  rabbit: '<path d="M8.6 9.1 7.2 4.4C6.7 2.8 8.2 1.9 9.3 3c.9.9 1.6 2.5 1.8 4.2M15.4 9.1l1.4-4.7c.5-1.6-1-2.5-2.1-1.4-.9.9-1.6 2.5-1.8 4.2"/><path d="M7.8 8.8a5.4 4.8 0 0 0 8.4 0"/><path d="M6.4 12.8C4.9 12.8 4 14 4 15.5 4 18.4 7.6 20.6 12 20.6s8-2.2 8-5.1c0-1.5-.9-2.7-2.4-2.7"/><path d="M10.1 16.3h.01M13.9 16.3h.01"/><path d="M11 18a1.4 1.2 0 0 0 2 0"/>',
  bird: '<path d="M15.6 7.4h.01"/><path d="M3.5 18.6h7.4a7 7 0 0 0 7-7V8a4 4 0 0 0-7.2-2.4L2 19"/><path d="m17.8 7.4 3.2-.8-3-.9"/><path d="M10.6 18.6V21M14 18.3V21"/><path d="M7.5 18.6a6 6 0 0 0 3.6-10.4"/>',
  fish: '<path d="M16.7 6.6C14.9 5.7 13 5.4 11.3 5.4 7.7 5.4 4.2 7.6 3 12c1.2 4.4 4.7 6.6 8.3 6.6 1.7 0 3.6-.3 5.4-1.2"/><path d="M16.5 6.6 21 9.6c.9.6 1 1.9.2 2.6l-.2.2-4.5 2.9"/><path d="M11 5.6C10.7 4.4 9.8 3 8.7 2.4M11 18.4c-.3 1.2-1.2 2.6-2.3 3.2"/><path d="M16.6 12h.01"/>',
  'paw-print': '<ellipse cx="6.2" cy="12.2" rx="1.5" ry="2"/><ellipse cx="10" cy="8.8" rx="1.5" ry="2"/><ellipse cx="14" cy="8.8" rx="1.5" ry="2"/><ellipse cx="17.8" cy="12.2" rx="1.5" ry="2"/><path d="M12 13.3c-2.1 0-3.8 1.7-3.8 3.4 0 1.2.9 1.9 2 1.9.8 0 1.1-.3 1.8-.3s1 .3 1.8.3c1.1 0 2-.7 2-1.9 0-1.7-1.7-3.4-3.8-3.4Z"/>',
};
function icon(name, cls = "") {
  const p = ICONS[name];
  if (!p) return "";
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}
// Resolve an icon name stored in data (tips/articles). "paw" -> brand paw.
function dataIcon(name) {
  return name === "paw" ? pawIcon() : icon(name);
}
// Request a higher-resolution crop from an Unsplash-style URL for large display.
function hiRes(url, w = 900, h = 900) {
  return typeof url === "string" ? url.replace(/w=\d+&h=\d+/, `w=${w}&h=${h}`) : url;
}

// ---------- editorial imagery ----------
// Reuses the curated, known-good PHOTOS pool so every image reliably loads.
// Gives the icon-only sections real visual context.
const SCENE = {
  post:    PHOTOS.dog[3],
  match:   PHOTOS.cat[1],
  reunite: PHOTOS.dog[6],
};
const ARTICLE_IMG = {
  "first-24-hours": PHOTOS.dog[3],
  "search-strategy": PHOTOS.cat[1],
  "flyers":         PHOTOS.dog[6],
  "scams":          PHOTOS.dog[2],
  "found-pet":      PHOTOS.cat[5],
  "scent":          PHOTOS.dog[5],
  "neighbors":      PHOTOS.dog[1],
  "shelters":       PHOTOS.cat[4],
  "emotional":      PHOTOS.cat[3],
  "injured":        PHOTOS.other[1],
};
function articleImg(a, w = 640, h = 360) {
  const url = ARTICLE_IMG[a && a.id] || PHOTOS.dog[0];
  return hiRes(url, w, h);
}
// Filled brand paw (used for species markers and the wordmark)
function pawIcon(cls = "") {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><ellipse cx="6" cy="11" rx="2" ry="2.6"/><ellipse cx="10" cy="7.4" rx="2" ry="2.6"/><ellipse cx="14" cy="7.4" rx="2" ry="2.6"/><ellipse cx="18" cy="11" rx="2" ry="2.6"/><path d="M12 12.5c-2.6 0-4.8 2.1-4.8 4 0 1.5 1.2 2.3 2.7 2.3.9 0 1.4-.4 2.1-.4s1.2.4 2.1.4c1.5 0 2.7-.8 2.7-2.3 0-1.9-2.2-4-4.8-4Z"/></svg>`;
}

// A distinct, recognizable icon for each species — guides the eye on the report
// form and beside listings, without resorting to emoji. Unknown/other → paw.
function speciesIcon(species, cls = "") {
  const map = { dog: "dog", cat: "cat", rabbit: "rabbit", bird: "bird", fish: "fish" };
  return icon(map[String(species || "").toLowerCase()] || "paw-print", cls);
}

function allListings() {
  // Merge curated demo listings (SEED_LISTINGS) with live/user listings.
  // Seeds are never persisted; a real listing with the same id always wins.
  const seen = new Set(state.listings.map(l => l.id));
  return [...state.listings, ...SEED_LISTINGS.filter(l => !seen.has(l.id))];
}
function allPosts() { return [...state.communityPosts, ...SEED_COMMUNITY_POSTS]; }
function findListing(id) { return allListings().find(l => l.id === id); }

// Returns listings sourced from verified shelter networks or marked as global
function allGlobalListings() {
  return allListings().filter(l => l.verifiedSource || l.source === "global" || l.source === "petfinder" || l.source === "shelter");
}

let _globalSort = "recent";

function sortedGlobalListings() {
  const items = [...allGlobalListings()];
  switch (_globalSort) {
    case "recent":  return items.sort((a, b) => new Date(b.posted || b.when || 0) - new Date(a.posted || a.when || 0));
    case "oldest":  return items.sort((a, b) => new Date(a.posted || a.when || 0) - new Date(b.posted || b.when || 0));
    case "breed":   return items.sort((a, b) => (a.breed || "￿").localeCompare(b.breed || "￿"));
    case "species": return items.sort((a, b) => ({ dog: 0, cat: 1, other: 2 }[a.species] ?? 2) - ({ dog: 0, cat: 1, other: 2 }[b.species] ?? 2));
    case "name":    return items.sort((a, b) => (a.name || "￿").localeCompare(b.name || "￿"));
    case "shelter": return items.sort((a, b) => (a.poster?.name || "￿").localeCompare(b.poster?.name || "￿"));
    default:        return items;
  }
}

// Fetch real listings from Petfinder via Supabase Edge Function (or direct if key configured)
// Fetches real stray/found animals from Austin Animal Center via Socrata open data.
// Free, no credentials required — CORS-enabled public API.
// Returns the user's approximate location from their IP address.
// Uses ipapi.co (free, 30k req/month, CORS-enabled, no API key).
// Result is cached in a promise — any number of callers share one fetch.
let _ipLocPromise = null;
function getIpLocation() {
  if (!_ipLocPromise) {
    _ipLocPromise = fetch("https://ipapi.co/json/")
      .then(r => r.ok ? r.json() : null)
      .then(d => (d && !d.error && d.city)
        ? { city: d.city, region: d.region, regionCode: d.region_code, country: d.country_code, lat: d.latitude, lng: d.longitude, zip: d.postal }
        : null)
      .catch(() => null);
  }
  return _ipLocPromise;
}

async function fetchPublicShelterData() {
  const localIds = new Set(state.listings.map(l => l.id));
  let added = 0;

  // Free public shelter APIs (Socrata open data — no credentials needed).
  // All requests fire in parallel via Promise.allSettled for speed.
  const SHELTER_SOURCES = [
    {
      label: "Austin Animal Center",
      url: "https://data.austintexas.gov/resource/wter-evkm.json?" + new URLSearchParams({
        "$limit": "40", "$order": "datetime DESC",
        "$where": "intake_type='STRAY' AND animal_type IN('Dog','Cat','Other')",
      }),
      map(a) {
        if (!a.animal_id) return null;
        return {
          id: "AAC-" + a.animal_id,
          species: { Dog: "dog", Cat: "cat" }[a.animal_type] || "other",
          name: (a.name && a.name !== "*") ? a.name : null,
          breed: a.breed || null, color: a.color || null, age: a.age_upon_intake || null,
          location: "Austin Animal Center, Austin TX", zip: "78702",
          when: a.datetime || new Date().toISOString(),
          contact: "Austin Animal Center · (512) 978-0500",
          poster: { name: "Austin Animal Center", initials: "AAC", neighborhood: "Austin, TX" },
          features: [
            a.found_location && `Found near: ${a.found_location}`,
            a.intake_condition && `Condition: ${a.intake_condition}`,
          ].filter(Boolean).join(" · ") || null,
          shelterUrl: "https://www.austintexas.gov/department/aac",
        };
      },
    },
    {
      label: "Sonoma County Animal Shelter",
      url: "https://data.sonomacounty.ca.gov/resource/924a-vesw.json?" + new URLSearchParams({
        "$limit": "40", "$order": "intake_date DESC",
        "$where": "outcome_date IS NULL",
      }),
      map(a) {
        const rawId = a.id || a.animal_id || a.intake_number;
        if (!rawId) return null;
        return {
          id: "SCAS-" + rawId,
          species: { Dog: "dog", Cat: "cat" }[a.type] || "other",
          name: a.name || null,
          breed: a.breed || null, color: a.color || null, age: a.age || null,
          location: "Sonoma County Animal Shelter, Santa Rosa CA", zip: "95401",
          when: a.intake_date || new Date().toISOString(),
          contact: "Sonoma County Animal Services · (707) 565-7100",
          poster: { name: "Sonoma County Animal Shelter", initials: "SCAS", neighborhood: "Santa Rosa, CA" },
          features: a.intake_type ? `Intake: ${a.intake_type}` : null,
          shelterUrl: "https://sonomacounty.ca.gov/health-and-human-services/regional-parks/animal-services",
        };
      },
    },
    {
      label: "Long Beach Animal Care Services",
      url: "https://data.longbeach.gov/resource/bqtq-c7na.json?" + new URLSearchParams({
        "$limit": "40", "$order": "intake_date DESC",
        "$where": "outcome_date IS NULL",
      }),
      map(a) {
        const rawId = a.animal_id || a.id;
        if (!rawId) return null;
        return {
          id: "LBACS-" + rawId,
          species: { DOG: "dog", CAT: "cat", Dog: "dog", Cat: "cat" }[a.species || a.animal_type] || "other",
          name: a.animal_name || a.name || null,
          breed: a.primary_breed || a.breed || null,
          color: a.primary_color || a.color || null, age: null,
          location: "Long Beach Animal Care Services, Long Beach CA", zip: "90807",
          when: a.intake_date || new Date().toISOString(),
          contact: "Long Beach Animal Care Services · (562) 570-7387",
          poster: { name: "Long Beach Animal Care Services", initials: "LBACS", neighborhood: "Long Beach, CA" },
          features: a.intake_condition ? `Condition: ${a.intake_condition}` : null,
          shelterUrl: "https://www.longbeach.gov/acs/",
        };
      },
    },
    {
      label: "Louisville Metro Animal Services",
      url: "https://data.louisvilleky.gov/resource/hmnn-v3x2.json?" + new URLSearchParams({
        "$limit": "40", "$order": "intake_date DESC",
        "$where": "outcome_date IS NULL",
      }),
      map(a) {
        const rawId = a.animal_id || a.id;
        if (!rawId) return null;
        return {
          id: "LMAS-" + rawId,
          species: { Dog: "dog", Cat: "cat", DOG: "dog", CAT: "cat" }[a.species || a.animal_type] || "other",
          name: a.animal_name || a.name || null,
          breed: a.breed || a.primary_breed || null,
          color: a.color || a.primary_color || null, age: a.age || null,
          location: "Louisville Metro Animal Services, Louisville KY", zip: "40202",
          when: a.intake_date || new Date().toISOString(),
          contact: "Louisville Metro Animal Services · (502) 473-7387",
          poster: { name: "Louisville Metro Animal Services", initials: "LMAS", neighborhood: "Louisville, KY" },
          features: a.intake_type ? `Intake: ${a.intake_type}` : null,
          shelterUrl: "https://louisvilleky.gov/government/animal-services",
        };
      },
    },
    {
      label: "Dallas Animal Services",
      url: "https://data.dallascityhall.com/resource/7h2m-3um5.json?" + new URLSearchParams({
        "$limit": "40", "$order": "intake_date DESC",
        "$where": "outcome_date IS NULL",
      }),
      map(a) {
        const rawId = a.animal_id || a.id;
        if (!rawId) return null;
        return {
          id: "DAS-" + rawId,
          species: { Dog: "dog", Cat: "cat", DOG: "dog", CAT: "cat" }[a.animal_type || a.species] || "other",
          name: a.animal_name || a.name || null,
          breed: a.breed || a.primary_breed || null,
          color: a.color || null, age: a.age || null,
          location: "Dallas Animal Services, Dallas TX", zip: "75201",
          when: a.intake_date || new Date().toISOString(),
          contact: "Dallas Animal Services · (214) 670-8246",
          poster: { name: "Dallas Animal Services", initials: "DAS", neighborhood: "Dallas, TX" },
          features: a.intake_type ? `Intake: ${a.intake_type}` : null,
          shelterUrl: "https://dallascityhall.com/departments/code/animal-services/Pages/default.aspx",
        };
      },
    },
    {
      label: "Seattle Animal Shelter",
      url: "https://data.seattle.gov/resource/yaai-7frk.json?" + new URLSearchParams({
        "$limit": "40", "$order": "intake_date DESC",
        "$where": "outcome_date IS NULL",
      }),
      map(a) {
        const rawId = a.animal_id || a.id;
        if (!rawId) return null;
        return {
          id: "SAS-" + rawId,
          species: { Dog: "dog", Cat: "cat", DOG: "dog", CAT: "cat" }[a.species || a.animal_type] || "other",
          name: a.animal_name || a.name || null,
          breed: a.primary_breed || a.breed || null,
          color: a.primary_color || a.color || null, age: null,
          location: "Seattle Animal Shelter, Seattle WA", zip: "98103",
          when: a.intake_date || new Date().toISOString(),
          contact: "Seattle Animal Shelter · (206) 386-7387",
          poster: { name: "Seattle Animal Shelter", initials: "SAS", neighborhood: "Seattle, WA" },
          features: a.intake_condition ? `Condition: ${a.intake_condition}` : null,
          shelterUrl: "https://www.seattle.gov/animal-shelter",
        };
      },
    },
    {
      label: "RescueGroups Network",
      url: "https://api.rescuegroups.org/v5/public/animals/search/available?" + new URLSearchParams({ "limit": "40" }),
      extract: (raw) => Array.isArray(raw) ? raw : (raw.data || []),
      map(a) {
        const attrs = a.attributes || a;
        const rawId = a.id || attrs.id;
        if (!rawId) return null;
        const sp = (attrs.species?.singular || attrs.species || "").toLowerCase();
        return {
          id: "RG-" + rawId,
          species: sp === "dog" ? "dog" : sp === "cat" ? "cat" : "other",
          name: attrs.name || null,
          breed: attrs.breeds?.primary || attrs.breed || null,
          color: attrs.colors?.primary || null, age: attrs.ageGroup || null,
          location: [attrs.cityname, attrs.stateprovince].filter(Boolean).join(", ") || "Rescue Network",
          zip: attrs.postalcode || null,
          when: attrs.updatedDate || attrs.createdDate || new Date().toISOString(),
          contact: attrs.rescueOrgEmail || attrs.email || "Via RescueGroups",
          poster: { name: attrs.rescueName || "RescueGroups Network", initials: "RG", neighborhood: attrs.cityname || "" },
          features: attrs.descriptionText?.replace(/<[^>]*>/g, "").slice(0, 200) || null,
          shelterUrl: attrs.url || "https://rescuegroups.org",
        };
      },
    },
  ];

  // Fire all requests simultaneously
  const responses = await Promise.allSettled(
    SHELTER_SOURCES.map(src =>
      fetch(src.url)
        .then(r => r.ok ? r.json() : Promise.reject(r.status))
        .then(raw => src.extract ? src.extract(raw) : raw)
        .catch(err => { console.warn(`${src.label} fetch failed.`, err); return []; })
    )
  );

  responses.forEach((result, i) => {
    if (result.status !== "fulfilled") return;
    result.value.forEach(a => {
      const mapped = SHELTER_SOURCES[i].map(a);
      if (!mapped || localIds.has(mapped.id)) return;
      state.listings.push({
        source: "shelter", type: "found", photo: null, size: null,
        status: "active", posted: mapped.when, verifiedSource: true,
        ...mapped,
      });
      localIds.add(mapped.id);
      added++;
    });
  });

  return added;
}

async function hydrateGlobalListings() {
  // Fetch user location and shelter data in parallel to save time
  const [loc] = await Promise.all([getIpLocation(), Promise.resolve()]);
  let totalAdded = 0;

  // Always fetch from free public shelter open data (no credentials needed)
  totalAdded += await fetchPublicShelterData();

  // Also pull from Supabase Edge Function if configured
  if (window.PawTrailSupabase?.ready) {
    try {
      const rows = await window.PawTrailSupabase.fetchGlobalListings();
      if (rows?.length) {
        const localIds = new Set(state.listings.map(l => l.id));
        const newRows = rows.filter(r => r.id && !localIds.has(r.id));
        newRows.forEach(r => state.listings.push(r));
        totalAdded += newRows.length;
      }
    } catch (err) {
      console.warn("Global listings via Supabase failed.", err);
    }
  }

  // Also pull from direct Petfinder if configured
  const pf = window.PAWTRAIL_PETFINDER;
  if (pf?.apiKey && pf?.secret) {
    try {
      const tokenRes = await fetch("https://api.petfinder.com/v2/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `grant_type=client_credentials&client_id=${encodeURIComponent(pf.apiKey)}&client_secret=${encodeURIComponent(pf.secret)}`,
      });
      if (tokenRes.ok) {
        const { access_token } = await tokenRes.json();
        const locQs = loc?.city && loc?.regionCode
          ? `&location=${encodeURIComponent(loc.city + ", " + loc.regionCode)}&distance=50`
          : loc?.zip ? `&location=${encodeURIComponent(loc.zip)}&distance=50` : "";
        const animalsRes = await fetch(`https://api.petfinder.com/v2/animals?status=adoptable&limit=50${locQs}`, {
          headers: { Authorization: `Bearer ${access_token}` },
        });
        if (animalsRes.ok) {
          const { animals } = await animalsRes.json();
          const localIds = new Set(state.listings.map(l => l.id));
          (animals || []).forEach(a => {
            const id = "PF-" + a.id;
            if (localIds.has(id)) return;
            state.listings.push({
              id, source: "petfinder", type: "found",
              species: ({ Dog: "dog", Cat: "cat" }[a.type] || "other"),
              name: a.name || null, breed: a.breeds?.primary || null,
              color: a.colors?.primary || null,
              size: ({ Small: "small", Medium: "medium", Large: "large", "Extra Large": "large" }[a.size] || null),
              age: a.age || null, photo: a.photos?.[0]?.medium || null,
              location: [a.contact?.address?.city, a.contact?.address?.state].filter(Boolean).join(", "),
              zip: a.contact?.address?.postcode || null, distance: a.distance || null,
              when: a.published_at || new Date().toISOString(),
              contact: a.contact?.email || a.contact?.phone || "Via Petfinder",
              poster: { name: "Petfinder Shelter", initials: "PF", neighborhood: "" },
              features: a.description ? a.description.replace(/<[^>]*>/g, "").slice(0, 300) : null,
              status: "active", posted: a.published_at || new Date().toISOString(),
              verifiedSource: true, petfinderUrl: a.url || null,
            });
            totalAdded++;
          });
        }
      }
    } catch (err) {
      console.warn("Petfinder direct fetch failed.", err);
    }
  }

  if (totalAdded > 0) saveState();
  return totalAdded;
}

function matchWeights() {
  state.matchWeights = { ...DEFAULT_MATCH_WEIGHTS, ...(state.matchWeights || {}) };
  return state.matchWeights;
}

function isSubmissionBanned() {
  return state.moderationBanUntil && Date.now() < new Date(state.moderationBanUntil).getTime();
}

function banTimeRemaining() {
  if (!isSubmissionBanned()) return "";
  const hours = Math.ceil((new Date(state.moderationBanUntil).getTime() - Date.now()) / 3600000);
  return hours >= 24 ? `${Math.ceil(hours / 24)} day${hours > 24 ? "s" : ""}` : `${hours} hour${hours !== 1 ? "s" : ""}`;
}

function looksLikeJunk(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return false;
  // PRD §4.9: Anti-abuse / Junk word detection
  const bannedTerms = /\b(rizz|skibi|skibidi|gyatt|sigma)\b/i;
  if (bannedTerms.test(text)) return true;
  const letters = text.replace(/[^a-z]/g, "");
  if (letters.length >= 8 && new Set(letters).size <= 2) return true;
  return false;
}

function showWarningModal(message, warnings) {
  const m = openModal(html`
    <div style="text-align:center; padding:10px;">
      <div style="font-size:50px; margin-bottom:15px;">${icon('alert-triangle')}</div>
      <h2 style="color:var(--lost); margin-bottom:10px; font-weight:900;">WARNING</h2>
      <p style="font-size:16px; line-height:1.5; margin-bottom:20px;">${escapeHtml(message)}</p>
      <div style="background:var(--bg); padding:15px; border-radius:12px; margin-bottom:24px; border:1px solid var(--line);">
        <strong style="display:block; margin-bottom:8px;">Warning Counter: ${warnings} / 10</strong>
        <div style="height:12px; background:var(--line); border-radius:6px; overflow:hidden;">
          <div style="height:100%; background:var(--lost); width:${(warnings / 10) * 100}%; transition: width 0.4s ease;"></div>
        </div>
      </div>
      <button class="btn primary block big" data-close>I understand</button>
    </div>
  `);
  m.querySelector("[data-close]").addEventListener("click", () => m.remove());
}

function validateListingData(data) {
  if (isSubmissionBanned()) {
    return { ok: false, banned: true, message: `Submissions are paused for this browser for ${banTimeRemaining()} because of repeated invalid information.` };
  }

  // Check all fields except 'name' for junk/slang terms per user request
  const checkedFields = ["location", "zip", "contact", "breed", "color", "size", "age", "features", "reward", "condition", "custody"];
  const badFields = checkedFields.filter(field => looksLikeJunk(data[field]));

  // Troll detection: Cross-reference existing submissions in local state
  const now = Date.now();
  // Daily frequency check: max 30 lost and 30 found per day for this browser
  const ownRecentDay = state.listings.filter(l => l.poster?.name === "You" && (now - new Date(l.posted).getTime()) < 86400000);
  const isDailyLimitReached = (data.type === "lost" && ownRecentDay.filter(l => l.type === "lost").length >= 30) || 
                               (data.type === "found" && ownRecentDay.filter(l => l.type === "found").length >= 30);

  // Hourly frequency checks disabled for testing per user request
  const isRapidFire = false;
  const isZipHopping = false;

  if (badFields.length || isDailyLimitReached || isRapidFire || isZipHopping) {
    state.moderationWarnings = (state.moderationWarnings || 0) + 1;
    let message = "Suspicious activity detected. Please enter real information.";
    if (isDailyLimitReached) message = `Daily limit reached: You can only report 30 lost and 30 found pets per day. Warning ${state.moderationWarnings}/10.`;
    if (isRapidFire || isZipHopping) message = `Submission frequency limit reached for this area. Warning ${state.moderationWarnings}/10.`;
    if (badFields.length) message = "Please use proper language. Slang or junk terms are not permitted in reports.";

    if (state.moderationWarnings >= 10) {
      state.moderationBanUntil = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
      message = "Too many invalid submissions. Submissions are blocked for 2 days.";
    }
    saveState();
    return { ok: false, warning: true, message, count: state.moderationWarnings };
  }

  // PRD §4.2: Photo is the single biggest factor. Ensure it's present for real info.
  if (!data.hasPhoto) {
    return { ok: false, message: "A photo is required to ensure accurate matching and prevent spam." };
  }

  if (data.zip && !/^\d{5}$/.test(data.zip.trim())) {
    return { ok: false, message: "Please enter a valid 5-digit ZIP code." };
  }
  if (!String(data.location || "").trim() || String(data.location || "").trim().length < 6) {
    return { ok: false, message: "Please enter a real street, neighborhood, or landmark." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contact || "") && !/[\d\s().+-]{7,}/.test(data.contact || "")) {
    return { ok: false, message: "Please enter a valid email or phone number for matches." };
  }

  return { ok: true };
}

function localListingPolicy() {
  const now = Date.now();
  const windowMs = 86400000; // 24-hour window
  const ownRecent = state.listings.filter(l =>
    l.poster?.name === "You" && now - new Date(l.posted || 0).getTime() < windowMs
  );
  if (ownRecent.length >= 60) {
    return {
      allowed: false,
      reason: "Daily submission limit reached for this session (60 reports).",
    };
  }
  return { allowed: true };
}

async function canSubmitListing(listing) {
  if (isSubmissionBanned()) {
    return { allowed: false, reason: `Submissions are blocked for ${banTimeRemaining()} because of repeated invalid information.` };
  }
  const local = localListingPolicy();
  if (!local.allowed) return local;
  if (!window.PawTrailSupabase?.ready) return local;
  const policy = await window.PawTrailSupabase.checkListingPolicy(listing);
  return policy?.allowed === false
    ? { allowed: false, reason: policy.reason || "This account or network is temporarily blocked from adding listings." }
    : { allowed: true };
}

async function persistListing(listing, source = "public") {
  state.listings.unshift(listing);
  saveState();
  if (!window.PawTrailSupabase?.ready) return;
  try {
    await window.PawTrailSupabase.insertListing(listing, source);
  } catch (err) {
    console.warn("Supabase listing save failed; kept local copy.", err);
    toast("Saved locally. Cloud sync will retry when Supabase is available.");
  }
}

function hydrateRemoteListings() {
  if (!window.PawTrailSupabase?.ready) return;
  window.PawTrailSupabase.fetchListings()
    .then(rows => {
      const localIds = new Set(state.listings.map(l => l.id));
      rows.filter(l => l.id && !localIds.has(l.id)).forEach(l => state.listings.push(l));
      saveState();
      if (location.hash.split("?")[0] === "#/listings") routeRender(location.hash);
    })
    .catch(err => console.warn("Supabase listing load failed.", err));
}

const POST_DAILY_LIMIT = 20;

// Local fallback limit (per browser) for when Supabase isn't configured.
// The authoritative per-IP limit is enforced server-side by the post-guard function.
function localPostPolicy() {
  const since = Date.now() - 86400000; // 24-hour rolling window
  state.postSubmissions = (state.postSubmissions || []).filter(t => new Date(t).getTime() > since);
  if (state.postSubmissions.length >= POST_DAILY_LIMIT) {
    return {
      allowed: false,
      reason: `You have reached the limit of ${POST_DAILY_LIMIT} community posts per day. Please try again tomorrow.`,
    };
  }
  return { allowed: true };
}

async function canSubmitPost(post) {
  const local = localPostPolicy();
  if (!local.allowed) return local;
  if (!window.PawTrailSupabase?.ready) return local;
  const policy = await window.PawTrailSupabase.checkPostPolicy(post);
  return policy?.allowed === false
    ? { allowed: false, reason: policy.reason || "Posting from this network is temporarily blocked." }
    : { allowed: true };
}

async function persistCommunityPost(post) {
  state.communityPosts.unshift(post);
  state.postSubmissions = state.postSubmissions || [];
  state.postSubmissions.push(post.when || new Date().toISOString());
  saveState();
  if (!window.PawTrailSupabase?.ready) return;
  try {
    await window.PawTrailSupabase.insertCommunityPost(post);
  } catch (err) {
    console.warn("Supabase post save failed; kept local copy.", err);
    toast("Posted locally. Cloud sync will retry when Supabase is available.");
  }
}

function hydrateRemoteCommunityPosts() {
  if (!window.PawTrailSupabase?.ready) return;
  window.PawTrailSupabase.fetchCommunityPosts()
    .then(rows => {
      const localIds = new Set(state.communityPosts.map(p => p.id));
      rows.filter(p => p.id && !localIds.has(p.id)).forEach(p => state.communityPosts.push(p));
      saveState();
      if (location.hash.split("?")[0] === "#/community") routeRender(location.hash);
    })
    .catch(err => console.warn("Supabase post load failed.", err));
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 3600 * 36) return `${Math.round(diff / 3600)}h ago`;
  if (diff < 3600 * 24 * 7) return `${Math.round(diff / 86400)}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
// Species marker — a distinct icon per animal so a glance reads dog vs. cat vs.
// bird, with the species/name still shown as text beside it. Falls back to the
// brand paw for "other" or unknown species.
function speciesEmoji(s) {
  return speciesIcon(s, "species-ic");
}

function toast(msg, ms = 2600) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, ms);
}

// ---------- layout heights (dynamic, respects actual rendered size) ----------
function updateBodyPad() {
  const tipBar = $("#tip-bar");
  const topbar = $("#topbar");
  const tipH = (tipBar && !tipBar.classList.contains("hidden")) ? tipBar.offsetHeight : 0;
  const navH = topbar ? topbar.offsetHeight : 62;
  document.body.style.paddingTop = (tipH + navH) + "px";
  document.documentElement.style.setProperty("--tip-h", tipH + "px");
  document.documentElement.style.setProperty("--nav-h", navH + "px");
  if (topbar) topbar.style.top = tipH + "px";
}

// ---------- tip bar ----------
function initTipBar() {
  const tips = TIPS.filter(t => t.category === "first-hours" || t.category === "scam-safety");
  const t = tips[Math.floor(Date.now() / 1000 / 3600) % tips.length];
  const el = $("#tip-bar-text");
  if (el && t) el.textContent = t.title + " — " + t.text.slice(0, 90) + "…";

  if (state.tipDismissed) {
    const tb = $("#tip-bar");
    if (tb) tb.classList.add("hidden");
    setTimeout(updateBodyPad, 0);
    return;
  }
  setTimeout(updateBodyPad, 0);

  $("#tip-bar-close")?.addEventListener("click", () => {
    state.tipDismissed = true;
    saveState();
    const tb = $("#tip-bar");
    if (tb) tb.classList.add("hidden");
    updateBodyPad();
  });
}

// ---------- nav active state ----------
function highlightNav() {
  const path = location.hash.split("?")[0].replace(/^#/, "");
  $$(".nav a").forEach(a => {
    const ah = a.getAttribute("href")?.replace(/^#/, "").split("?")[0];
    a.classList.toggle("active", ah === path && ah !== "/");
  });
}

// ---------- drawer management (class-based, no hidden-attribute fights) ----------
let openDrawerId = null;

function openDrawer(id) {
  if (openDrawerId && openDrawerId !== id) closeDrawer(openDrawerId);
  openDrawerId = id;
  document.getElementById(id)?.classList.add("open");
  document.getElementById("drawer-overlay")?.classList.add("open");
}
function closeDrawer(id) {
  const target = id || openDrawerId;
  if (target) document.getElementById(target)?.classList.remove("open");
  else $$(".drawer.open").forEach(d => d.classList.remove("open"));
  document.getElementById("drawer-overlay")?.classList.remove("open");
  if (!id || id === openDrawerId) openDrawerId = null;
}
function toggleDrawer(id) {
  const d = document.getElementById(id);
  if (!d) return;
  d.classList.contains("open") ? closeDrawer(id) : openDrawer(id);
}

// ---------- router ----------
window.addEventListener("hashchange", () => {
  routeRender(location.hash);
  highlightNav();
});

function navigate(hash) {
  if (location.hash !== hash) { location.hash = hash; return; }
  routeRender(hash);
  highlightNav();
}

function routeRender(hash) {
  const path = (hash.replace(/^#/, "").split("?")[0]) || "/";
  const parts = path.split("/").filter(Boolean);
  const route = parts[0];
  const rest = parts.slice(1);
  window.scrollTo({ top: 0, behavior: "instant" });

  if (!route) return renderHome();
  if (route === "listings") return renderListings();
  if (route === "global") return renderGlobalListings();
  if (route === "login") return renderLogin();
  if (route === "profile") return renderProfile();
  if (route === "lost") return renderForm("lost");
  if (route === "found") return renderForm("found");
  if (route === "about") return renderAbout();
  if (route === "help") return renderHelpline();
  if (route === "community") return renderCommunity();
  if (route === "tips") return renderTips();
  if (route === "advice") {
    if (rest[0]) return renderArticle(rest[0]);
    return renderAdviceIndex();
  }
  if (route === "listing" && rest[0]) return (window.renderListingDetail || renderListingDetail)(rest[0]);
  if (route === "reunite" && rest[0]) return renderReunionClaim(rest[0]);
  if (route === "my-listings") return renderMyListings();
  if (route === "shelter") return renderShelterPortal();
  if (route === "settings") return renderSettings();
  if (route === "admin") return renderAdmin();
  if (route === "share-wizard" && rest[0]) return renderShareWizard(rest[0]);
  if (route === "search") return renderSearchPage();
  if (route === "bookmarks") return renderBookmarks();
  if (route === "ai") {
    if (window.PawTrailAI?.mind?.renderPage) return window.PawTrailAI.mind.renderPage();
  }
  render404(route);
}

function render404(route) {
  $("#app").innerHTML = html`
    <div style="text-align:center; padding:80px 24px 60px; max-width:480px; margin:0 auto;">
      <div style="font-size:72px; margin-bottom:16px;">🐾</div>
      <h1 style="font-size:36px; font-weight:800; letter-spacing:-.03em; margin:0 0 10px;">Page not found</h1>
      <p class="muted" style="font-size:16px; margin:0 0 32px;">The path <code style="background:var(--surface-2,var(--line)); padding:2px 6px; border-radius:4px; font-size:14px;">${escapeHtml(route || "/")}</code> doesn't exist.</p>
      <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
        <a href="#/" data-link class="btn primary">Go home</a>
        <a href="#/listings" data-link class="btn">Browse listings</a>
        <a href="#/lost" data-link class="btn ghost">Report a lost pet</a>
      </div>
    </div>
  `;
  bindLinks();
}

// ---------- views ----------

function renderHome() {
  const totalActive = allListings().filter(l => l.status === "active").length;
  const recentListings = allListings()
    .filter(l => l.status === "active")
    .sort((a, b) => new Date(b.posted) - new Date(a.posted))
    .slice(0, 24);
  const recentPosts = allPosts().slice(0, 4);
  const recentReunited = allListings().filter(l => l.status === "reunited").slice(0, 5);

  showLocationCookiePrompt();

  $("#app").innerHTML = html`

    <!-- ============================
         SPLIT HERO - calm copy + framed pet imagery
         ============================ -->
    <section class="hero2 paw-bg">
      <div class="hero2-glow" aria-hidden="true"></div>

      <div class="hero2-content">
        <div class="hero2-eyebrow">
          <span class="dot"></span>
          <span><strong>${totalActive}</strong> active cases · <strong>${state.reunions}</strong> reunited this month</span>
        </div>

        <h1 class="hero2-title">Let's bring<br/>them home.</h1>
        <p class="hero2-sub">Lost a pet or found a stray? Post in 90 seconds. We'll alert you the moment we find a match.</p>

        <div class="hero2-cta">
          <a href="#/lost" class="action-cta lost" data-link>
            <span class="action-cta-emoji">${icon('alert-circle')}</span>
            <span class="action-cta-text">
              <span class="action-cta-title">I Lost a Pet</span>
              <span class="action-cta-sub">Matching starts in seconds</span>
            </span>
            <span class="action-cta-arrow">→</span>
          </a>
          <a href="#/found" class="action-cta found" data-link>
            <span class="action-cta-emoji">${icon('heart')}</span>
            <span class="action-cta-text">
              <span class="action-cta-title">I Found a Pet</span>
              <span class="action-cta-sub">90 seconds · no account</span>
            </span>
            <span class="action-cta-arrow">→</span>
          </a>
        </div>

        <form class="zipbar hero2-zip" id="zip-form">
          <input type="text" placeholder="Enter ZIP to browse nearby cases" id="zip-input" inputmode="numeric" maxlength="5" />
          <button class="btn primary" type="submit">Browse</button>
        </form>
      </div>

      <div class="hero2-media" aria-hidden="true">
        <div class="hero2-photo hero2-photo-main" style="background-image:url('${escapeHtml(hiRes(RECENT_REUNIONS[1].photo, 900, 1000))}');"></div>
        <div class="hero2-photo hero2-photo-sub a" style="background-image:url('${escapeHtml(hiRes(RECENT_REUNIONS[2].photo, 600, 750))}');"></div>
        <div class="hero2-photo hero2-photo-sub b" style="background-image:url('${escapeHtml(hiRes(RECENT_REUNIONS[0].photo, 600, 750))}');"></div>
        <div class="hero2-badge">
          <span class="hero2-badge-emoji">${icon('check-circle')}</span>
          <span class="hero2-badge-text">
            <strong>${escapeHtml(RECENT_REUNIONS[0].name)} reunited</strong>
            ${escapeHtml(RECENT_REUNIONS[0].time)} · ${escapeHtml(RECENT_REUNIONS[0].neighborhood)}
          </span>
        </div>
      </div>
    </section>

    <!-- Recently-reunited marquee -->
    <div class="reunion-strip">
      <span class="reunion-strip-label"> Just reunited</span>
      <div class="reunion-ticker" id="reunion-ticker">
        ${RECENT_REUNIONS.map(r => html`
          <span class="ticker-item">
            <img src="${escapeHtml(r.photo)}" alt="" loading="lazy" />
            <strong>${escapeHtml(r.name)}</strong> · ${escapeHtml(r.neighborhood)}
          </span>
        `).join('<span class="ticker-sep">·</span>')}
      </div>
    </div>

    <!-- ============================
         STATS BAR
         ============================ -->
    <div class="stats-bar">
      <div class="stat-cell"><div class="stat-num">${state.reunions}</div><div class="stat-label">Reunited this month</div></div>
      <div class="stat-cell"><div class="stat-num">${totalActive}</div><div class="stat-label">Active listings</div></div>
      <div class="stat-cell"><div class="stat-num">&lt;8h</div><div class="stat-label">Median reunion time</div></div>
      <div class="stat-cell"><div class="stat-num">5 mi</div><div class="stat-label">Typical search radius</div></div>
    </div>

    <!-- ============================
         HOW IT WORKS
         ============================ -->
    <section class="block">
      <div class="section-row"><h2>How it works</h2></div>
      <p class="subhead">Three steps. No account. Under two minutes.</p>
      <div class="hiw-grid">
        <div class="hiw-card" data-step="1">
          <div class="hiw-photo" style="background-image:url('${escapeHtml(hiRes(SCENE.post, 640, 440))}');"></div>
          <div class="hiw-body">
            <div class="hiw-icon">${icon('file-text')}</div>
            <div class="hiw-title">Post in 90 seconds</div>
            <p class="hiw-desc">Photo, location, contact. The form is minimal — optional details can come later. Your listing goes live immediately and matching starts.</p>
          </div>
        </div>
        <div class="hiw-card" data-step="2">
          <div class="hiw-photo" style="background-image:url('${escapeHtml(hiRes(SCENE.match, 640, 440))}');"></div>
          <div class="hiw-body">
            <div class="hiw-icon">${icon('zap')}</div>
            <div class="hiw-title">Instant matching</div>
            <p class="hiw-desc">Every listing is cross-referenced against the database in seconds — species, breed, color, ZIP, date, and photo similarity all scored automatically.</p>
          </div>
        </div>
        <div class="hiw-card" data-step="3">
          <div class="hiw-photo" style="background-image:url('${escapeHtml(hiRes(SCENE.reunite, 640, 440))}');"></div>
          <div class="hiw-body">
            <div class="hiw-icon">${icon('check-circle')}</div>
            <div class="hiw-title">Get reunited</div>
            <p class="hiw-desc">High-confidence matches trigger instant push and SMS alerts. All contact is routed through our private relay — your number is never exposed.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ============================
         RECENT ACTIVE CASES
         ============================ -->
    <section class="block">
      <div class="section-row">
        <h2>Active cases near you</h2>
        <a href="#/listings" data-link style="font-size:14px; font-weight:600;">See all ${totalActive} →</a>
      </div>
      <p class="subhead">Do you recognize any of these animals? Contact the poster instantly through our relay.</p>
      <div class="list-grid" id="home-listings"></div>
      <div style="text-align:center; margin-top:18px;">
        <a href="#/listings" class="btn" data-link>Browse all ${totalActive} active listings →</a>
      </div>
    </section>

    <!-- ============================
         SCAM WARNING
         ============================ -->
    <div class="section-dark paw-bg">
      <div class="scam-warning-row">
        <div>
          <h2 style="color:white; margin-bottom:8px; font-size:22px;">${icon('shield')} Important: never pay before reunion</h2>
          <p style="margin:0; font-size:15px;">If anyone texts or emails claiming to have your pet and asks for money — shipping fees, vet deposits, gift cards — it's a scam. This happens within hours of posting. Real finders never ask for payment. PawTrail automatically quarantines messages that mention money.</p>
        </div>
        <a href="#/advice/scams" class="btn" data-link style="background:rgba(255,255,255,.12); color:white; border-color:rgba(255,255,255,.3); flex-shrink:0; white-space:nowrap;">Scam guide →</a>
      </div>
    </div>

    <!-- ============================
         TESTIMONIALS
         ============================ -->
    <section class="section-soft">
      <div class="section-row">
        <h2 style="margin-bottom:0;">They made it home</h2>
        <a href="#/listings?type=reunited" data-link style="font-size:14px; font-weight:600; color:var(--found);">All reunions →</a>
      </div>
      <p class="subhead" style="margin-bottom:18px;">Example outcomes for the review area. Replace these with verified user reviews once the service is live.</p>
      <div class="testimonials-grid">
        ${TESTIMONIALS.map(t => html`
          <div class="testimonial">
            <div class="testimonial-photo" style="background-image:url('${escapeHtml(t.photo)}');"></div>
            <div class="testimonial-body">
              <div class="testimonial-tag">${icon('check')} Reunited in ${t.hours}h</div>
              <p class="testimonial-quote">"${escapeHtml(t.story)}"</p>
              <div class="testimonial-name">
                <div class="testimonial-avatar">${escapeHtml(t.initials)}</div>
                <div class="testimonial-info">
                  <strong>${escapeHtml(t.name)}</strong>
                  <span>${escapeHtml(t.neighborhood)} · ${speciesEmoji(t.species)} ${escapeHtml(t.petName)}</span>
                </div>
              </div>
            </div>
          </div>
        `).join("")}
      </div>
    </section>

    <!-- ============================
         COMMUNITY BOARD TEASER
         ============================ -->
    <section class="block">
      <div class="section-row">
        <h2>Community board</h2>
        <a href="#/community" data-link style="font-size:14px; font-weight:600;">See all posts →</a>
      </div>
      <p class="subhead">Sightings, reunion stories, tips from neighbors. No account needed to post.</p>
      <div class="community-feed">${recentPosts.map(p => communityPostCard(p, true)).join("")}</div>
      <div style="text-align:center; margin-top:18px;">
        <a href="#/community" class="btn primary" data-link>Join the community →</a>
      </div>
    </section>

    <!-- ============================
         TIPS + ADVICE
         ============================ -->
    <section class="section-warm">
      <div class="section-row">
        <h2 style="margin-bottom:0;">Quick tips that actually work</h2>
        <a href="#/tips" data-link style="font-size:14px; font-weight:600;">All ${TIPS.length} tips →</a>
      </div>
      <p class="subhead" style="margin-bottom:18px;">From people who've been through it.</p>
      <div class="tips-grid" style="margin-bottom:22px;">${TIPS.slice(0, 6).map(tipCard).join("")}</div>
      <div class="section-row" style="margin-bottom:10px;">
        <h2 style="margin-bottom:0; font-size:20px;">In-depth guides</h2>
        <a href="#/advice" data-link style="font-size:14px; font-weight:600;">All guides →</a>
      </div>
      <div class="advice-grid">
        ${ARTICLES.slice(0, 4).map(a => html`
          <a class="advice-card has-photo ${a.flagship ? "flagship" : ""}" href="#/advice/${a.id}" data-link>
            <div class="advice-photo" style="background-image:url('${escapeHtml(articleImg(a))}');">
              <span class="advice-photo-icon">${dataIcon(a.icon)}</span>
            </div>
            <div class="advice-card-body">
              <h3>${escapeHtml(a.title)}</h3>
              <p>${escapeHtml(a.summary)}</p>
            </div>
          </a>
        `).join("")}
      </div>
    </section>

    <!-- ============================
         SECOND CTA (bottom of page)
         ============================ -->
    <div class="bottom-cta paw-bg">
      <h2>Ready to start?</h2>
      <p>Post a report in 90 seconds. Matching begins immediately. Free, forever.</p>
      <div class="cta-row" style="max-width:460px; margin:0 auto;">
        <a href="#/lost" class="btn lost big" data-link>${icon('alert-circle')} I Lost a Pet</a>
        <a href="#/found" class="btn found big" data-link>${icon('heart')} I Found a Pet</a>
      </div>
    </div>
  `;

  $("#home-listings").innerHTML = recentListings.map(listingCard).join("");
  bindLinks();
  $$(".reaction-btn").forEach(b => b.addEventListener("click", handleReaction));
  $("#zip-form").addEventListener("submit", e => {
    e.preventDefault();
    const zip = $("#zip-input").value.trim();
    navigate(zip ? `#/listings?zip=${encodeURIComponent(zip)}` : "#/listings");
  });
}

function renderGlobalListings() {
  const SORT_OPTIONS = [
    { key: "recent",  label: "Recent" },
    { key: "oldest",  label: "Oldest" },
    { key: "breed",   label: "Breed" },
    { key: "species", label: "Species" },
    { key: "name",    label: "Name" },
    { key: "shelter", label: "Shelter" },
  ];

  function sortBar() {
    return `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:18px;">
      <span style="font-size:13px;color:var(--muted);font-weight:600;white-space:nowrap;">Sort by:</span>
      ${SORT_OPTIONS.map(o => `<button class="btn small ${_globalSort === o.key ? "primary" : "ghost"}" data-sort="${o.key}">${o.label}</button>`).join("")}
    </div>`;
  }

  function bindSort() {
    document.querySelectorAll("[data-sort]").forEach(btn => {
      btn.addEventListener("click", () => {
        _globalSort = btn.dataset.sort;
        const grid = document.getElementById("global-grid");
        if (grid) {
          grid.innerHTML = sortedGlobalListings().map(listingCard).join("");
          bindLinks();
          loadBreedPhotos(grid);
        }
        document.querySelectorAll("[data-sort]").forEach(b =>
          b.className = `btn small ${b.dataset.sort === _globalSort ? "primary" : "ghost"}`
        );
      });
    });
  }

  const items = sortedGlobalListings();

  $("#app").innerHTML = html`
    <div class="section-row" style="margin-bottom:14px;">
      <h1 style="font-size:28px; font-weight:800; letter-spacing:-.02em;">Global Verified Listings</h1>
    </div>
    <p class="subhead">Real pet listings from verified shelter networks and partner organizations.</p>

    <div class="card" style="background:var(--found-soft); border-color:var(--found); margin-bottom:20px;">
      <p style="margin:0; font-size:14px;" id="shelter-sync-banner">${icon('globe')} <strong>Shelter Sync Active:</strong> Listings are pulled live from verified partner shelters and adoption networks.</p>
    </div>

    ${sortBar()}

    ${items.length
      ? `<div class="list-grid" id="global-grid">${items.map(listingCard).join("")}</div>`
      : `<div class="empty" id="global-empty"><div class="emoji">${icon('globe')}</div><p>Loading shelter listings…</p></div>`}
  `;
  bindLinks();
  bindSort();
  loadBreedPhotos();

  // Update the banner with the user's detected city once IP lookup resolves
  getIpLocation().then(loc => {
    const banner = document.getElementById("shelter-sync-banner");
    if (!banner || !loc?.city) return;
    const place = loc.city + (loc.regionCode ? ", " + loc.regionCode : "");
    banner.innerHTML = `${icon('globe')} <strong>Shelter Sync Active · Near ${escapeHtml(place)}:</strong> Listings pulled live from verified shelters near your location.`;
  });

  hydrateGlobalListings().then(added => {
    if (!added) return;
    const grid = document.getElementById("global-grid");
    if (grid) {
      grid.innerHTML = sortedGlobalListings().map(listingCard).join("");
      bindLinks();
      loadBreedPhotos(grid);
    } else {
      routeRender(location.hash);
    }
  });
}

// ---------- breed-accurate photos ----------

const _breedPhotoCache = {};

function breedToSlug(rawBreed) {
  if (!rawBreed) return null;
  const b = rawBreed.toLowerCase().trim();
  const map = {
    "labrador retriever": "labrador", "labrador": "labrador", "lab": "labrador",
    "golden retriever": "retriever/golden", "golden": "retriever/golden",
    "german shepherd": "germanshepherd", "shepherd": "germanshepherd",
    "australian shepherd": "shepherd/australian",
    "beagle": "beagle",
    "french bulldog": "bulldog/french",
    "english bulldog": "bulldog/english", "bulldog": "bulldog/english",
    "poodle": "poodle", "toy poodle": "poodle/toy", "miniature poodle": "poodle/miniature",
    "husky": "husky", "siberian husky": "husky",
    "boxer": "boxer",
    "yorkshire terrier": "terrier/yorkshire", "yorkie": "terrier/yorkshire",
    "chihuahua": "chihuahua",
    "dachshund": "dachshund",
    "great dane": "dane/great",
    "shih tzu": "shihtzu", "shih-tzu": "shihtzu",
    "doberman": "doberman", "dobermann": "doberman",
    "rottweiler": "rottweiler",
    "pit bull": "pitbull", "pitbull": "pitbull", "pit bull terrier": "pitbull",
    "american pit bull terrier": "pitbull", "staffordshire": "staffordshire/american",
    "border collie": "collie/border", "collie": "collie/border",
    "cocker spaniel": "spaniel/cocker", "cocker": "spaniel/cocker",
    "corgi": "corgi/pembroke", "pembroke welsh corgi": "corgi/pembroke",
    "maltese": "maltese",
    "pomeranian": "pomeranian",
    "shiba inu": "shiba", "shiba": "shiba",
    "jack russell terrier": "terrier/jack", "jack russell": "terrier/jack",
    "akita": "akita",
    "samoyed": "samoyed",
    "chow chow": "chow",
    "dalmatian": "dalmatian",
    "greyhound": "greyhound", "italian greyhound": "greyhound/italian",
    "bernese mountain dog": "mountain/bernese",
    "pug": "pug",
    "pointer": "pointer",
    "vizsla": "vizsla",
    "weimaraner": "weimaraner",
    "havanese": "havanese",
    "basenji": "basenji",
  };
  if (map[b]) return map[b];
  for (const [k, v] of Object.entries(map)) {
    if (b.includes(k)) return v;
  }
  return null;
}

async function fetchBreedPhoto(species, breed) {
  const key = `${species || "dog"}:${(breed || "").toLowerCase().slice(0, 40)}`;
  if (_breedPhotoCache[key]) return _breedPhotoCache[key];
  try {
    if (species === "cat") {
      const r = await fetch("https://api.thecatapi.com/v1/images/search?limit=1");
      if (r.ok) {
        const d = await r.json();
        const url = d[0]?.url;
        if (url) { _breedPhotoCache[key] = url; return url; }
      }
    } else {
      const slug = breedToSlug(breed);
      if (slug) {
        const r = await fetch(`https://dog.ceo/api/breed/${slug}/images/random`);
        if (r.ok) {
          const d = await r.json();
          if (d.status === "success" && d.message) {
            _breedPhotoCache[key] = d.message; return d.message;
          }
        }
      }
      // Fallback: any random dog
      const r2 = await fetch("https://dog.ceo/api/breeds/image/random");
      if (r2.ok) {
        const d2 = await r2.json();
        if (d2.status === "success" && d2.message) {
          _breedPhotoCache[key] = d2.message; return d2.message;
        }
      }
    }
  } catch {}
  return null;
}

// After inserting listing cards, call this to patch in breed-accurate photos.
async function loadBreedPhotos(grid) {
  const container = grid || document.getElementById("global-grid");
  if (!container) return;
  const cards = container.querySelectorAll(".photo[data-lid]");
  if (!cards.length) return;
  await Promise.allSettled([...cards].map(async div => {
    const url = await fetchBreedPhoto(div.dataset.species, div.dataset.breed);
    if (url) div.style.backgroundImage = `url('${url.replace(/'/g, "%27")}')`;
  }));
}

// Generates a unique illustrated image for a pet from its description
// (species + color + name + breed). Pure SVG data-URI: no network, no files, offline-safe.
function petAvatar(l) {
  return generatePetSVG(l || {});
}

// ---------- listings ----------

// Maps a described coat colour to a gradient pair. Falls back to the warm brand tone.
function petImageColors(color) {
  const map = {
    black:    ["#4a4a4a", "#1f1f1f"],
    white:    ["#fbfbfb", "#dadada"],
    brown:    ["#8a5a32", "#5e3a1e"],
    tan:      ["#e8c98f", "#d09a52"],
    gray:     ["#bdbdbd", "#8c8c8c"],
    grey:     ["#bdbdbd", "#8c8c8c"],
    orange:   ["#f5a84e", "#e8792e"],
    tricolor: ["#e8c98f", "#3a3a3a"],
    brindle:  ["#6e5230", "#33271a"],
    cream:    ["#f6e7c8", "#e6cf9c"],
    golden:   ["#f3c460", "#e08e2c"],
  };
  const key = String(color || "").toLowerCase().split(/[\s,/&]+/)[0];
  return map[key] || ["#f3b27a", "#e87c2e"];
}

// Returns a data-URI SVG illustration built from the listing's described traits.
function generatePetSVG(l) {
  const [c1, c2] = petImageColors(l.color);
  const EMOJI_MAP = { dog: "🐕", cat: "🐈", rabbit: "🐇", bird: "🐦", fish: "🐟" };
  const emoji = EMOJI_MAP[String(l.species || "").toLowerCase()] || "🐾";
  const name = l.name || (l.type === "found" ? "Found pet" : "Lost pet");
  const sub = [l.breed, l.color].filter(Boolean).join(" · ");
  const xml = s => String(s ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const svg =
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
<rect width="400" height="300" fill="url(#g)"/>
<circle cx="338" cy="58" r="130" fill="#ffffff" opacity="0.08"/>
<circle cx="70" cy="250" r="90" fill="#000000" opacity="0.06"/>
<circle cx="200" cy="124" r="76" fill="#ffffff" opacity="0.85"/>
<text x="200" y="126" font-size="84" text-anchor="middle" dominant-baseline="central">${emoji}</text>
<rect x="0" y="231" width="400" height="69" fill="#000000" opacity="0.34"/>
<text x="200" y="258" font-size="26" font-family="system-ui,Segoe UI,Arial,sans-serif" font-weight="700" fill="#ffffff" text-anchor="middle">${xml(name)}</text>
${sub ? `<text x="200" y="284" font-size="15" font-family="system-ui,Segoe UI,Arial,sans-serif" fill="#ffffff" opacity="0.88" text-anchor="middle">${xml(sub)}</text>` : ""}
</svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

function listingCard(l) {
  const tagClass = l.status === "reunited" ? "reunited" : l.type;
  const tagText = l.status === "reunited" ? "Reunited" : (l.type === "lost" ? "Lost" : "Found");
  const title = l.name || (l.type === "found" ? `Found ${l.species}` : `Lost ${l.species}`);
  const meta = [l.breed, l.color, l.location].filter(Boolean).join(" · ");
  const sourceLink = l.verifiedSource ? `<span style="color:var(--info); font-size:11px; display:block; margin-top:2px;">${icon('link')} Source: Official Shelter Network</span>` : "";
  const photoBg = l.photo ? escapeHtml(l.photo) : petAvatar(l);
  return html`
    <a class="listing" href="#/listing/${l.id}" data-link>
      <div class="photo" style="background-image:url('${photoBg}')">
        <span class="tag ${tagClass}">${tagText}</span>
      </div>
      <div class="body">
        <p class="name">${speciesEmoji(l.species)} ${escapeHtml(title)}</p>
        <p class="meta">${escapeHtml(meta)}</p>
        ${sourceLink}
        <p class="meta">${fmtDate(l.posted)} · ${l.distance ? l.distance + " mi" : "—"}</p>
      </div>
    </a>
  `;
}

function renderListings() {
  const params = new URLSearchParams((location.hash.split("?")[1] || ""));
  const initZip = params.get("zip") || "";
  const initSpecies = params.get("species") || "all";
  const initType = params.get("type") || "all";

  $("#app").innerHTML = html`
    <div class="section-row" style="margin-bottom:14px;">
      <h1 style="font-size:28px; font-weight:800; letter-spacing:-.02em;">Browse cases</h1>
    </div>
    <p class="subhead">${allListings().length} listings · matching runs automatically as new ones arrive.</p>

    <div class="map-mock">
      <span class="pin" style="left:30%;top:40%;background:var(--lost);"></span>
      <span class="pin" style="left:65%;top:55%;background:var(--found);"></span>
      <span class="pin" style="left:80%;top:30%;background:var(--info);"></span>
      <span class="pin" style="left:45%;top:65%;background:var(--lost);"></span>
      <span class="pin" style="left:22%;top:70%;background:var(--found);"></span>
      <span class="pin" style="left:54%;top:28%;background:var(--purple);"></span>
    </div>

    <div class="filters">
      <span class="chip ${initType==="all"?"active":""}" data-filter="type" data-value="all">All</span>
      <span class="chip ${initType==="lost"?"active":""}" data-filter="type" data-value="lost">Lost</span>
      <span class="chip ${initType==="found"?"active":""}" data-filter="type" data-value="found">Found</span>
      <span class="chip ${initType==="reunited"?"active":""}" data-filter="type" data-value="reunited">Reunited ${icon('check')}</span>
      <select id="filter-species">
        <option value="all" ${initSpecies==="all"?"selected":""}>All species</option>
        <option value="dog" ${initSpecies==="dog"?"selected":""}>Dogs</option>
        <option value="cat" ${initSpecies==="cat"?"selected":""}>Cats</option>
        <option value="rabbit" ${initSpecies==="rabbit"?"selected":""}>Rabbits</option>
        <option value="bird" ${initSpecies==="bird"?"selected":""}>Birds</option>
        <option value="fish" ${initSpecies==="fish"?"selected":""}>Fish</option>
        <option value="other" ${initSpecies==="other"?"selected":""}>Other</option>
      </select>
      <input id="filter-zip" type="text" placeholder="ZIP" maxlength="5" value="${escapeHtml(initZip)}" style="width:90px;" />
      <select id="filter-sort">
        <option value="recent">Most recent</option>
        <option value="distance">Nearest first</option>
      </select>
    </div>

    <div class="list-grid" id="results"></div>
  `;

  const sf = { type: initType, species: initSpecies, zip: initZip, sort: "recent" };
  function apply() {
    let items = allListings();
    if (sf.type === "reunited") items = items.filter(l => l.status === "reunited");
    else if (sf.type !== "all") items = items.filter(l => l.status !== "reunited" && l.type === sf.type);
    else items = items.filter(l => l.status !== "reunited");
    if (sf.species !== "all") items = items.filter(l => l.species === sf.species);
    if (sf.zip) items = items.filter(l => (l.zip || "").startsWith(sf.zip.slice(0, 3)));
    if (sf.sort === "distance") items.sort((a, b) => (a.distance || 99) - (b.distance || 99));
    else items.sort((a, b) => new Date(b.posted) - new Date(a.posted));
    const r = $("#results");
    r.innerHTML = items.length
      ? items.map(listingCard).join("")
      : `<div class="empty" style="grid-column:1/-1;"><div class="emoji">${icon('search')}</div>No matching listings. Try widening your filters.</div>`;
    bindLinks();
    if (items.length) loadBreedPhotos(r);
  }
  apply();

  $$(".chip[data-filter=type]").forEach(c => c.addEventListener("click", () => {
    $$(".chip[data-filter=type]").forEach(x => x.classList.remove("active"));
    c.classList.add("active");
    sf.type = c.dataset.value;
    apply();
  }));
  $("#filter-species").addEventListener("change", e => { sf.species = e.target.value; apply(); });
  $("#filter-zip").addEventListener("input", e => { sf.zip = e.target.value.trim(); apply(); });
  $("#filter-sort").addEventListener("change", e => { sf.sort = e.target.value; apply(); });
}

// ---------- listing detail ----------
async function renderListingDetail(id) {
  const l = findListing(id);
  if (!l) {
    $("#app").innerHTML = `<div class="empty"><div class="emoji">${icon('search')}</div>Listing not found. <a href="#/listings" data-link>Back to browse</a></div>`;
    bindLinks(); return;
  }
  const matches = (await computeMatches(l)).slice(0, 3);
  const tagClass = l.status === "reunited" ? "reunited" : l.type;
  const tagText = l.status === "reunited" ? "Reunited" : (l.type === "lost" ? "Lost" : "Found");
  const title = l.name || (l.type === "found" ? `Found ${l.species}` : `Lost ${l.species}`);

  const reunitedBanner = l.status === "reunited" ? html`
    <div class="reunion-banner">
      <h2> ${escapeHtml(title)} is home!</h2>
      <p>Reunited ${fmtDate(l.reunitedAt)}. Thank you to everyone who shared and searched.</p>
    </div>
  ` : "";

  const EXPIRY_DAYS = 90;
  const postedMs = l.posted ? new Date(l.posted).getTime() : 0;
  const daysAlive = postedMs ? Math.floor((Date.now() - postedMs) / 86400000) : 0;
  const daysLeft = EXPIRY_DAYS - daysAlive;
  const expiryBar = l.status === "active" && postedMs ? (() => {
    const pct = Math.min(100, Math.round(daysAlive / EXPIRY_DAYS * 100));
    const urgent = daysLeft <= 14;
    const barColor = urgent ? "var(--lost)" : daysLeft <= 30 ? "var(--warn)" : "var(--found)";
    return `<div style="margin-bottom:16px; padding:12px 16px; border-radius:10px; background:var(--surface); border:1px solid var(--line);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <span style="font-size:13px; font-weight:600; color:${barColor};">${urgent ? icon('alert-triangle') : icon('clock')} ${daysLeft > 0 ? `${daysLeft} days until expiry` : "Expired"}</span>
        <span style="font-size:12px; color:var(--muted);">Posted ${daysAlive}d ago</span>
      </div>
      <div style="height:6px; background:var(--line); border-radius:999px; overflow:hidden;">
        <div style="height:100%; width:${pct}%; background:${barColor}; border-radius:999px; transition:width .4s;"></div>
      </div>
    </div>`;
  })() : "";

  $("#app").innerHTML = html`
    <a href="#/listings" data-link class="muted" style="display:inline-block; margin-bottom:14px;">← Back to listings</a>
    ${reunitedBanner}
    <div class="detail-grid">
      <div>
        ${expiryBar}
        <div class="detail-photo" style="background-image:url('${l.photo ? escapeHtml(l.photo) : petAvatar(l)}')"></div>
        <div style="margin-top:14px; display:flex; gap:6px; flex-wrap:wrap;">
          <span class="tag-inline ${tagClass}">${tagText}</span>
          ${l.verifiedSource ? `<span class="tag-inline" style="background:var(--info-soft);color:var(--info);">${icon('check')} Verified shelter</span>` : ""}
          ${l.reward ? `<span class="tag-inline" style="background:var(--warn-soft);color:var(--warn);">Reward $${l.reward}</span>` : ""}
        </div>
        <h1 style="margin:10px 0 4px; font-size:26px; font-weight:800; letter-spacing:-.02em;">
          ${speciesEmoji(l.species)} ${escapeHtml(title)}
        </h1>
        <p class="muted">${escapeHtml(l.location || "")} · ${fmtDate(l.posted)}</p>
        ${l.features ? `<p style="margin-top:16px; font-size:15px; line-height:1.6;">${escapeHtml(l.features)}</p>` : ""}

        ${matches.length ? html`
          <h2 style="margin-top:28px; font-size:20px; font-weight:700;">Possible matches</h2>
          <p class="subhead">Auto-scored from species, location, date, size, color, and visual similarity.</p>
          ${matches.map(m => matchCard(l, m)).join("")}
        ` : ""}
      </div>

      <aside style="display:flex; flex-direction:column; gap:14px;">
        <div class="card">
          <h3 style="margin:0 0 12px; font-size:16px;">Details</h3>
          <ul class="attr-list">
            ${attrRow("Species", l.species)}
            ${attrRow("Breed", l.breed)}
            ${attrRow("Color", l.color)}
            ${attrRow("Size", l.size)}
            ${attrRow("Age", l.age)}
            ${attrRow("Last seen", l.when ? new Date(l.when).toLocaleString(undefined, {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}) : null)}
            ${attrRow("ZIP", l.zip)}
            ${l.condition ? attrRow("Condition", l.condition) : ""}
            ${l.custody ? attrRow("Where now", { "with-me":"With finder", "shelter":"Local shelter", "left":"Left in place" }[l.custody] || l.custody) : ""}
          </ul>
        </div>

        <div class="card">
          <h3 style="margin:0 0 10px; font-size:16px;">Posted by</h3>
          <div class="row">
            <div style="width:44px;height:44px;border-radius:50%;background:var(--brand);color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;flex-shrink:0;">
              ${escapeHtml(l.poster?.initials || "??")}
            </div>
            <div>
              <div style="font-weight:600;">${escapeHtml(l.poster?.name || "Anonymous")}</div>
              <div class="muted">${escapeHtml(l.poster?.neighborhood || "")}</div>
            </div>
          </div>
          <button class="btn block primary" id="contact-btn" style="margin-top:12px;">Message via relay</button>
          <p class="muted" style="font-size:12px; margin-top:6px;">Your contact info stays private. All messages routed through PawTrail.</p>
        </div>

        <div class="card">
          <h3 style="margin:0 0 10px; font-size:16px;">Share to find faster </h3>
          <p class="muted" style="margin-bottom:12px; font-size:13px;">The first hour matters most. One share can reach hundreds of neighbors.</p>
          <div class="share-row">
            <button class="btn small" data-share="facebook">${icon('book')} Facebook</button>
            <button class="btn small" data-share="x">𝕏 Post</button>
            <button class="btn small" data-share="nextdoor">${icon('home')} Nextdoor</button>
            <button class="btn small" data-share="whatsapp">${icon('message')} WhatsApp</button>
            <button class="btn small" data-share="sms">${icon('mail')} SMS</button>
            <button class="btn small" data-share="copy">${icon('link')} Copy link</button>
          </div>
          <button class="btn block ghost" id="flyer-btn" style="margin-top:10px;">${icon('printer')} Print flyer with QR code</button>
        </div>

        <div class="card">
          <h3 style="margin:0 0 10px; font-size:16px;">Actions</h3>
          ${l.type === "found" ? `<a class="btn block primary" href="#/reunite/${l.id}" data-link>This is my pet — claim</a>` : ""}
          ${l.status === "active" ? `<button class="btn block" id="reunite-btn" style="margin-top:8px;">Mark as reunited </button>` : ""}
          <button class="btn block ghost" id="report-btn" style="margin-top:8px;">${icon('flag')} Report this listing</button>
        </div>
      </aside>
    </div>
  `;

  bindLinks();
  $("#contact-btn").addEventListener("click", () => openContactModal(l));
  $$("[data-share]").forEach(b => b.addEventListener("click", () => doShare(b.dataset.share, l)));
  $("#flyer-btn").addEventListener("click", () => openFlyer(l));
  if ($("#reunite-btn")) {
    $("#reunite-btn").addEventListener("click", () => {
      const isUser = state.listings.find(x => x.id === l.id);
      if (isUser) { isUser.status = "reunited"; isUser.reunitedAt = new Date().toISOString(); state.reunions++; saveState(); }
      else { toast("In a real listing, this would close the case and notify everyone."); }
      renderListingDetail(l.id);
    });
  }
  $("#report-btn").addEventListener("click", () => openReportModal(l));
  
  // Connect UI buttons to the training algorithm
  $$("[data-act=confirm]").forEach(b => b.addEventListener("click", () => { 
    const m = findListing(b.dataset.mid);
    if (m) trainMatchAlgorithm(l, m, true);
    toast("Confirmed match — the other side has been notified."); 
  }));
  $$("[data-act=reject]").forEach(b => b.addEventListener("click", () => { 
    const m = findListing(b.dataset.mid);
    if (m) trainMatchAlgorithm(l, m, false);
    toast("Marked not a match. That helps retrain the model. Thanks."); 
  }));
}

function attrRow(k, v) {
  if (!v) return "";
  return `<li><span class="k">${k}</span><span class="v">${escapeHtml(v)}</span></li>`;
}

function matchCard(source, m) {
  const pct = Math.round(m.score * 100);
  let label = "Low Confidence";
  let cls = "";
  if (pct >= 95) { label = "Perfect Match"; cls = "high"; }
  else if (pct >= 75) { label = "High Confidence"; cls = "high"; }
  else if (pct >= 50) { label = "Medium Confidence"; cls = "medium"; }
  else if (pct < 20) { label = "Uncommon Match"; cls = "low"; }

  return html`
    <div class="match-card ${cls}">
      <span class="score">${pct}% confidence · ${label}</span>
      <div class="compare">
        <img src="${source.photo ? escapeHtml(source.photo) : petAvatar(source)}" alt="" />
        <div class="arrow">↔</div>
        <img src="${m.listing.photo ? escapeHtml(m.listing.photo) : petAvatar(m.listing)}" alt="" />
      </div>
      <p style="font-size:13.5px; margin-bottom:10px; color:var(--ink-soft);">
        <strong style="color:var(--ink);">${m.listing.type === "found" ? "Found" : "Lost"} ${escapeHtml(m.listing.breed || m.listing.species)}</strong>
        — ${escapeHtml(m.listing.location || "")}, ${fmtDate(m.listing.posted)}.
        Matched on: ${escapeHtml(m.reasons.join(", "))}.
      </p>
      <div class="row">
        <a class="btn small primary" href="#/listing/${m.listing.id}" data-link>View match</a>
        <button class="btn small" data-act="confirm" data-mid="${m.listing.id}">This is my pet</button>
        <button class="btn small ghost" data-act="reject" data-mid="${m.listing.id}">Not a match</button>
      </div>
    </div>
  `;
}

// ---------- matching ----------
async function getImageSimilarity(src1, src2) {
  if (!src1 || !src2) return 0;
  return new Promise(resolve => {
    const img1 = new Image(); const img2 = new Image();
    let loaded = 0;
    const onDone = () => { if (++loaded === 2) resolve(compareImages(img1, img2)); };
    img1.crossOrigin = img2.crossOrigin = "anonymous";
    img1.onload = onDone; img1.onerror = () => resolve(0);
    img2.crossOrigin = img2.crossOrigin = "anonymous";
    img2.onload = onDone; img2.onerror = () => resolve(0);
    img1.src = src1; img2.src = src2;
  });
}

function compareImages(img1, img2) {
  const size = 16; // Increased resolution for more detail
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = size; canvas.height = size;

  const getFingerprint = (img) => {
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    const d = ctx.getImageData(0, 0, size, size).data;
    const structure = []; 
    const colors = [];
    let totalLuma = 0;

    for (let i = 0; i < size * size; i++) {
      const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      structure.push(luma);
      colors.push([r, g, b]);
      totalLuma += luma;
    }

    const avgLuma = totalLuma / (size * size);
    return {
      hash: structure.map(v => v > avgLuma ? 1 : 0),
      colors: colors
    };
  };

  const f1 = getFingerprint(img1);
  const f2 = getFingerprint(img2);

  let structuralSim = 0;
  let colorSim = 0;
  let weightSum = 0;

  for (let i = 0; i < size * size; i++) {
    // Center-weighting: Pixels in the middle 50% are 3x more important for "main shape"
    const x = i % size;
    const y = Math.floor(i / size);
    const isCenter = x > size / 4 && x < 3 * size / 4 && y > size / 4 && y < 3 * size / 4;
    const weight = isCenter ? 3 : 1;
    weightSum += weight;

    // Structural similarity (shape)
    if (f1.hash[i] === f2.hash[i]) structuralSim += weight;

    // Color similarity (Euclidean distance in RGB space)
    const c1 = f1.colors[i], c2 = f2.colors[i];
    const dist = Math.sqrt(
      Math.pow(c1[0] - c2[0], 2) +
      Math.pow(c1[1] - c2[1], 2) +
      Math.pow(c1[2] - c2[2], 2)
    );
    // Normalized color similarity (1 = same, 0 = opposite)
    const pixelColorSim = Math.max(0, 1 - (dist / 441.67)); 
    colorSim += pixelColorSim * weight;
  }

  const finalStructural = structuralSim / weightSum;
  const finalColor = colorSim / weightSum;

  // Both shape and color must be present for a high score
  return (finalStructural * 0.4) + (finalColor * 0.6);
}

async function computeMatches(source) {
  const weights = matchWeights();
  const others = allListings().filter(l =>
    l.id !== source.id && l.status !== "reunited" &&
    l.type !== source.type && l.species === source.species &&
    withinDays(l.when, source.when, 30));
    
  const results = await Promise.all(others.map(async l => {
    if (!visuallyCompatible(source, l)) return null;
    let score = weights.base;
    const reasons = [];
    if (colorsCompatible(source.color, l.color, source.breed, l.breed)) { score += weights.color; reasons.push("compatible color"); }
    if (l.breed && source.breed) {
      const a = l.breed.toLowerCase(), b = source.breed.toLowerCase();
      if (a === b) { score += weights.breedExact; reasons.push("same breed"); }
      else if (similarBreed(a, b)) { score += weights.breedSimilar; reasons.push("similar breed"); }
    }
    if (l.size && source.size && l.size === source.size) { score += weights.size; reasons.push("same size"); }
    if (l.zip && source.zip) {
      if (l.zip === source.zip) { score += weights.zipExact; reasons.push("same ZIP"); }
      else if (l.zip.slice(0, 3) === source.zip.slice(0, 3)) { score += weights.zipNear; reasons.push("nearby area"); }
    }
    if (l.distance != null && source.distance != null) {
      const d = Math.abs(l.distance - source.distance);
      if (d < 1) { score += weights.distanceClose; reasons.push(`${d.toFixed(1)} mi apart`); }
      else if (d < 3) score += 0.05;
    }
    const hrs = Math.abs(new Date(l.when || 0) - new Date(source.when || 0)) / 3600000;
    if (hrs < 24) { score += weights.timeClose; reasons.push("within 24h"); }
    else if (hrs < 72) score += 0.04;

    const visualScore = await getImageSimilarity(source.photo, l.photo);
    
    // JURISDICTION LOGIC: 
    // If visual score is very low (< 0.35), it's likely a completely different object.
    // We apply a "Jurisdiction Multiplier" that suppresses the total score.
    const jurisdictionMult = visualScore < 0.35 ? 0.2 : 1.0;
    
    let finalScore = (score + (visualScore * weights.image)) * jurisdictionMult;

    if (visualScore > 0.8) reasons.push("strong visual match");
    else if (visualScore > 0.5) reasons.push("similar appearance");

    return { listing: l, score: Math.min(1, finalScore), reasons };
  }));
  return results.filter(m => m && m.score >= 0.1).sort((a, b) => b.score - a.score);
}

function normalizedColors(color, breed) {
  const text = `${color || ""} ${breed || ""}`.toLowerCase();
  const groups = [];
  if (/\bblack\b/.test(text)) groups.push("black");
  if (/\b(white|cream)\b/.test(text)) groups.push("white");
  if (/\b(brown|chocolate|liver)\b/.test(text)) groups.push("brown");
  if (/\b(tan|gold|golden|yellow|blond|blonde|fawn)\b/.test(text)) groups.push("gold");
  if (/\b(gray|grey|blue|silver)\b/.test(text)) groups.push("gray");
  if (/\b(orange|ginger)\b/.test(text)) groups.push("orange");
  if (/\b(tricolor|tri-color|brindle|merle|calico|tabby)\b/.test(text)) groups.push("patterned");
  return [...new Set(groups)];
}

function colorsCompatible(aColor, bColor, aBreed, bBreed) {
  const a = normalizedColors(aColor, aBreed);
  const b = normalizedColors(bColor, bBreed);
  if (!a.length || !b.length) return true;
  return a.some(c => b.includes(c));
}

function similarBreed(a, b) {
  const stop = new Set(["mix", "mixed", "domestic", "shorthair", "longhair", "retriever", "dog", "cat"]);
  const aw = a.split(/\W+/).filter(w => w && !stop.has(w));
  const bw = b.split(/\W+/).filter(w => w && !stop.has(w));
  return aw.some(w => bw.includes(w) || bw.some(x => x.includes(w) || w.includes(x)));
}

function visuallyCompatible(source, listing) {
  // Strict Color Filtering: Prevent matches between incompatible colors (e.g. Black vs Gold)
  const aColors = normalizedColors(source.color, source.breed);
  const bColors = normalizedColors(listing.color, listing.breed);
  
  // If both have color data, they MUST share at least one color group to be compatible
  if (aColors.length && bColors.length) {
    const hasOverlap = aColors.some(c => bColors.includes(c));
    if (!hasOverlap) return false;
  }

  if (source.size && listing.size) {
    const order = ["small", "medium", "large"];
    const diff = Math.abs(order.indexOf(source.size) - order.indexOf(listing.size));
    if (diff > 1) return false;
  }
  return true;
}

function trainMatchAlgorithm(source, matchedListing, positive) {
  const weights = matchWeights();
  const delta = positive ? 0.02 : -0.025;
  const bump = key => {
    weights[key] = Math.max(0.02, Math.min(0.5, Number((weights[key] + delta).toFixed(3))));
  };

  if (colorsCompatible(source.color, matchedListing.color, source.breed, matchedListing.breed)) bump("color");
  if (source.breed && matchedListing.breed) bump(source.breed.toLowerCase() === matchedListing.breed.toLowerCase() ? "breedExact" : "breedSimilar");
  if (source.size && matchedListing.size && source.size === matchedListing.size) bump("size");
  if (source.zip && matchedListing.zip) bump(source.zip === matchedListing.zip ? "zipExact" : "zipNear");

  state.matchWeights = weights;
  state.matchFeedback = state.matchFeedback || [];
  state.matchFeedback.push({
    sourceId: source.id,
    matchId: matchedListing.id,
    positive,
    at: new Date().toISOString(),
  });
  saveState();
}
function withinDays(a, b, d) {
  if (!a || !b) return true;
  return Math.abs(new Date(a) - new Date(b)) / 86400000 <= d;
}

// ---------- forms (multi-step with live match sidebar) ----------
function todayISO() { return new Date().toISOString().slice(0, 10); }
function nowTime() { return new Date().toTimeString().slice(0, 5); }

function liveMatchCount(species, zip) {
  if (!species && !zip) return null;
  const opposite = { lost: "found", found: "lost" };
  return allListings().filter(l =>
    l.status === "active" &&
    (!species || l.species === species) &&
    (!zip || (l.zip && l.zip.startsWith(zip.slice(0, 3))))
  );
}

function renderForm(type) {
  const isLost = type === "lost";
  const draft = state.draft?.type === type ? state.draft : null;
  const accentColor = isLost ? "var(--lost)" : "var(--found)";
  const accentSoft = isLost ? "var(--lost-soft)" : "var(--found-soft)";

  $("#app").innerHTML = html`
    <div class="form-layout">

      <!-- LEFT: main form -->
      <div class="form-main">
        <a href="#/" data-link class="muted" style="display:inline-block; margin-bottom:16px;">← Back</a>

        <div class="form-header">
          <div class="form-header-icon" style="background:${accentColor};">${isLost ? icon('alert-circle') : icon('heart')}</div>
          <div>
            <h1>${isLost ? "Report a lost pet" : "Report a found pet"}</h1>
            <p class="form-header-sub">${isLost
              ? "We'll scan every found-pet report the moment you submit."
              : "Thank you. No account needed. Under 90 seconds."}</p>
          </div>
        </div>

        ${isLost ? `
        <div class="scam-banner">
          ${icon('shield')} <strong>Heads up:</strong> Scammers target lost-pet posts within hours. <strong>Never pay anyone before seeing your pet in person.</strong>
          <a href="#/advice/scams" data-link style="color:var(--warn-ink); font-weight:600; margin-left:4px;">What to watch for →</a>
        </div>` : ""}

        <form id="pet-form">

          <!-- STEP 1: Species -->
          <div class="form-step">
            <div class="form-step-num">1</div>
            <div class="form-step-body">
              <label class="form-step-label">What kind of animal? *</label>
              <div class="species-tiles" id="species-row">
                <button type="button" class="species-tile ${draft?.species === "dog" ? "active" : ""}" data-species="dog">
                  <span class="species-tile-icon">${speciesIcon("dog")}</span>
                  <span>Dog</span>
                </button>
                <button type="button" class="species-tile ${draft?.species === "cat" ? "active" : ""}" data-species="cat">
                  <span class="species-tile-icon">${speciesIcon("cat")}</span>
                  <span>Cat</span>
                </button>
                <button type="button" class="species-tile ${draft?.species === "rabbit" ? "active" : ""}" data-species="rabbit">
                  <span class="species-tile-icon">${speciesIcon("rabbit")}</span>
                  <span>Rabbit</span>
                </button>
                <button type="button" class="species-tile ${draft?.species === "bird" ? "active" : ""}" data-species="bird">
                  <span class="species-tile-icon">${speciesIcon("bird")}</span>
                  <span>Bird</span>
                </button>
                <button type="button" class="species-tile ${draft?.species === "fish" ? "active" : ""}" data-species="fish">
                  <span class="species-tile-icon">${speciesIcon("fish")}</span>
                  <span>Fish</span>
                </button>
                <button type="button" class="species-tile ${draft?.species === "other" ? "active" : ""}" data-species="other">
                  <span class="species-tile-icon">${speciesIcon("other")}</span>
                  <span>Other</span>
                </button>
              </div>
            </div>
          </div>

          <!-- STEP 2: Photo -->
          <div class="form-step">
            <div class="form-step-num">2</div>
            <div class="form-step-body">
              <label class="form-step-label">Upload a photo *</label>
              <p class="form-step-hint">A clear photo is the single biggest factor in a successful match.</p>
              <label class="photo-drop" for="photo-file">
                <div class="photo-drop-icon">${icon('camera')}</div>
                <div class="photo-drop-text">Tap to choose a photo, or drag one here</div>
                <div class="photo-drop-sub">JPG or PNG · max 10 MB · auto-resized</div>
                <input id="photo-file" type="file" accept="image/*" multiple />
              </label>
              <div class="photo-preview" id="photo-preview"></div>
              <div id="photo-counter" style="font-size:12px; color:var(--muted); margin-top:4px;"></div>
            </div>
          </div>

          <!-- STEP 3: Where + When -->
          <div class="form-step">
            <div class="form-step-num">3</div>
            <div class="form-step-body">
              <label class="form-step-label">Where and when? *</label>
              <div class="field">
                <label>Location last ${isLost ? "seen" : "found"}</label>
                <div style="display:flex; gap:6px;">
                  <input type="text" id="location" placeholder="e.g. Riverbend Park, Pinecrest & 4th" value="${escapeHtml(draft?.location || "")}" required style="flex:1;" />
                  <button type="button" class="btn small" id="geo-btn" title="Use my location">${icon('map-pin')} Use my location</button>
                </div>
              </div>
              <div class="row" style="gap:10px; align-items:flex-start;">
                <div class="field" style="flex:1; min-width:100px;">
                  <label>ZIP code</label>
                  <input type="text" id="zip" maxlength="5" inputmode="numeric" placeholder="97214" value="${escapeHtml(draft?.zip || "")}" required />
                </div>
                <div class="field" style="flex:2; min-width:130px;">
                  <label>Date</label>
                  <input type="date" id="when-date" value="${escapeHtml(draft?.whenDate || todayISO())}" required />
                </div>
                <div class="field" style="flex:1; min-width:90px;">
                  <label>Time</label>
                  <input type="time" id="when-time" value="${escapeHtml(draft?.whenTime || nowTime())}" required />
                </div>
              </div>
              <div class="live-match-bar" id="live-match-bar" hidden></div>
            </div>
          </div>

          ${!isLost ? `
          <!-- STEP 3b: Condition (found only) -->
          <div class="form-step">
            <div class="form-step-num" style="background:var(--found);">+</div>
            <div class="form-step-body">
              <label class="form-step-label">Pet's current situation</label>
              <div class="row" style="gap:10px; align-items:flex-start;">
                <div class="field" style="flex:1; min-width:160px;">
                  <label>Condition</label>
                  <select id="condition">
                    <option value="healthy">Healthy</option>
                    <option value="scared">Scared / skittish</option>
                    <option value="injured">Injured — needs vet</option>
                    <option value="aggressive">Aggressive — keep distance</option>
                  </select>
                </div>
                <div class="field" style="flex:1; min-width:160px;">
                  <label>Where is the pet now?</label>
                  <select id="custody">
                    <option value="with-me">With me — safe</option>
                    <option value="left">Left where found</option>
                    <option value="shelter">Brought to shelter</option>
                  </select>
                </div>
              </div>
            </div>
          </div>` : `<input type="hidden" id="condition" value="" /><input type="hidden" id="custody" value="" />`}

          <!-- STEP 4: Contact -->
          <div class="form-step">
            <div class="form-step-num">4</div>
            <div class="form-step-body">
              <label class="form-step-label">How should we reach you when we find a match? *</label>
              <input type="text" id="contact" placeholder="Your email or phone number" value="${escapeHtml(draft?.contact || "")}" required />
              <p class="form-step-hint">${icon('lock')} Never shown publicly. All contact routes through our anonymous relay.</p>
            </div>
          </div>

          <!-- OPTIONAL DETAILS -->
          <details class="form-optional" id="optional-details">
            <summary>
              <span class="form-opt-title">${icon('plus')} Add more details — speeds up matching significantly</span>
              <span class="form-opt-sub">Breed, color, name, distinguishing features</span>
            </summary>
            <div class="form-opt-body">
              <div class="row" style="gap:10px; align-items:flex-start; flex-wrap:wrap;">
                <div class="field" style="flex:1; min-width:140px;">
                  <label>${isLost ? "Pet's name" : "Name (if known)"}</label>
                  <input type="text" id="name" value="${escapeHtml(draft?.name || "")}" placeholder="${isLost ? "Biscuit" : "Unknown"}" />
                </div>
                <div class="field" style="flex:2; min-width:160px;">
                  <label>Breed</label>
                  <input type="text" id="breed" value="${escapeHtml(draft?.breed || "")}" placeholder="e.g. Beagle mix" />
                </div>
              </div>
              <div class="row" style="gap:10px; align-items:flex-start; flex-wrap:wrap;">
                <div class="field" style="flex:1; min-width:120px;">
                  <label>Primary color</label>
                  <select id="color">
                    <option value="">—</option>
                    ${COLOR_OPTIONS.map(c => `<option value="${c}" ${draft?.color === c ? "selected" : ""}>${c}</option>`).join("")}
                  </select>
                </div>
                <div class="field" style="flex:1; min-width:110px;">
                  <label>Size</label>
                  <select id="size">
                    <option value="">—</option>
                    <option value="small">Small &lt;25 lb</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large &gt;60 lb</option>
                  </select>
                </div>
                <div class="field" style="flex:1; min-width:100px;">
                  <label>Age</label>
                  <input type="text" id="age" value="${escapeHtml(draft?.age || "")}" placeholder="e.g. 3 yrs" />
                </div>
              </div>
              <div class="field">
                <label>Distinguishing features</label>
                <textarea id="features" rows="3" placeholder="Microchip ID, collar, scars, unique markings, behavior (e.g. walks with a limp, extremely food-motivated). Each detail helps verify a real match.">${escapeHtml(draft?.features || "")}</textarea>
              </div>
              ${isLost ? `
              <div class="field">
                <label>Reward offered (optional)</label>
                <input type="number" id="reward" min="0" step="25" placeholder="e.g. 200" value="${escapeHtml(draft?.reward || "")}" />
                <div class="hint">Never pay before reunion. If you offer a reward, make it clear it's for safe return only.</div>
              </div>` : `<input type="hidden" id="reward" value="" />`}
            </div>
          </details>

          <!-- SUBMIT -->
          <div class="form-submit-area">
            <button type="submit" class="btn block big" style="background:${accentColor}; color:white; border-color:${accentColor}; font-size:18px; padding:18px;">
              ${isLost ? `${icon('search')} Submit lost report - start matching` : `${icon('check-circle')} Submit found report - start matching`}
            </button>
            <div class="autosave" id="autosave-status"></div>
            <p class="form-anon-note">Anonymous posting allowed. Account creation offered after — not required.</p>
          </div>

        </form>

        <!-- ── Descriptive Form ─────────────────────────────────────── -->
        <div class="card" style="margin-top:28px; border-color:var(--info);">
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
            <div style="width:40px; height:40px; border-radius:50%; background:var(--info); display:flex; align-items:center; justify-content:center; font-size:22px; flex-shrink:0;">${icon('clipboard')}</div>
            <div>
              <strong style="font-size:16px; display:block;">Descriptive Form</strong>
              <span class="muted" style="font-size:13px;">Optional — but greatly improves match accuracy. Add as much as you know.</span>
            </div>
          </div>

          <form id="descriptive-form">

            <!-- 1. Pet Identity -->
            <div class="desc-section">
              <div class="desc-section-head">${pawIcon()} Pet Identity</div>
              <div class="row" style="gap:10px; flex-wrap:wrap;">
                <div class="field" style="flex:1; min-width:150px;">
                  <label>Specific animal type</label>
                  <select id="desc-species-detail">
                    <option value="">—</option>
                    <optgroup label="Dogs"><option value="dog-domestic">Dog (domestic)</option></optgroup>
                    <optgroup label="Cats"><option value="cat-domestic">Cat (domestic)</option><option value="cat-feral">Cat (feral / community)</option></optgroup>
                    <optgroup label="Small animals"><option value="rabbit">Rabbit</option><option value="hamster">Hamster</option><option value="guinea-pig">Guinea pig</option><option value="ferret">Ferret</option><option value="rat">Rat / Mouse</option></optgroup>
                    <optgroup label="Birds"><option value="parrot">Parrot / Parakeet</option><option value="cockatiel">Cockatiel</option><option value="dove">Dove / Pigeon</option><option value="bird-other">Other bird</option></optgroup>
                    <optgroup label="Reptiles"><option value="lizard">Lizard / Gecko</option><option value="snake">Snake</option><option value="turtle">Turtle / Tortoise</option></optgroup>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div class="field" style="flex:1; min-width:110px;">
                  <label>Sex</label>
                  <select id="desc-sex">
                    <option value="">Unknown</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
                <div class="field" style="flex:1; min-width:150px;">
                  <label>Spayed / Neutered</label>
                  <select id="desc-fixed">
                    <option value="">Unknown</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
              </div>
              <div class="row" style="gap:10px; flex-wrap:wrap;">
                <div class="field" style="flex:2; min-width:180px;">
                  <label>Exact breed or mix</label>
                  <input type="text" id="desc-breed-detail" placeholder="e.g. Labrador × Australian Shepherd" />
                </div>
                <div class="field" style="flex:1; min-width:130px;">
                  <label>Age (years / months)</label>
                  <div style="display:flex; gap:6px;">
                    <input type="number" id="desc-age-years" min="0" max="40" placeholder="Yrs" style="width:64px;" />
                    <input type="number" id="desc-age-months" min="0" max="11" placeholder="Mo" style="width:64px;" />
                  </div>
                </div>
                <div class="field" style="flex:1; min-width:130px;">
                  <label>Approximate weight</label>
                  <input type="text" id="desc-weight" placeholder="e.g. 45 lbs / 20 kg" />
                </div>
              </div>
            </div>

            <!-- 2. Appearance -->
            <div class="desc-section">
              <div class="desc-section-head"> Appearance</div>
              <div class="row" style="gap:10px; flex-wrap:wrap;">
                <div class="field" style="flex:1; min-width:130px;">
                  <label>Coat / fur length</label>
                  <select id="desc-coat-length">
                    <option value="">—</option>
                    <option value="hairless">Hairless</option>
                    <option value="short">Short</option>
                    <option value="medium">Medium</option>
                    <option value="long">Long / fluffy</option>
                    <option value="curly">Curly / wavy</option>
                    <option value="wiry">Wiry</option>
                  </select>
                </div>
                <div class="field" style="flex:1; min-width:150px;">
                  <label>Coat pattern</label>
                  <select id="desc-coat-pattern">
                    <option value="">—</option>
                    <option value="solid">Solid</option>
                    <option value="bicolor">Bi-color</option>
                    <option value="tricolor">Tri-color</option>
                    <option value="tabby">Tabby / striped</option>
                    <option value="calico">Calico</option>
                    <option value="merle">Merle</option>
                    <option value="brindle">Brindle</option>
                    <option value="spotted">Spotted</option>
                    <option value="tuxedo">Tuxedo</option>
                    <option value="tortoiseshell">Tortoiseshell</option>
                    <option value="pointed">Color-point (Siamese-style)</option>
                  </select>
                </div>
                <div class="field" style="flex:1; min-width:130px;">
                  <label>Secondary / markings color</label>
                  <select id="desc-secondary-color">
                    <option value="">—</option>
                    ${COLOR_OPTIONS.map(c => `<option value="${c}">${c.charAt(0).toUpperCase() + c.slice(1)}</option>`).join("")}
                  </select>
                </div>
              </div>
              <div class="row" style="gap:10px; flex-wrap:wrap;">
                <div class="field" style="flex:1; min-width:120px;">
                  <label>Eye color</label>
                  <select id="desc-eye-color">
                    <option value="">—</option>
                    <option value="brown">Brown</option>
                    <option value="blue">Blue</option>
                    <option value="green">Green</option>
                    <option value="yellow">Yellow / amber</option>
                    <option value="hazel">Hazel</option>
                    <option value="odd">Odd-eyed (two colors)</option>
                  </select>
                </div>
                <div class="field" style="flex:1; min-width:120px;">
                  <label>Tail</label>
                  <select id="desc-tail">
                    <option value="">—</option>
                    <option value="full">Full / long</option>
                    <option value="short">Short / bobbed</option>
                    <option value="docked">Docked</option>
                    <option value="curled">Curled (e.g. Shiba)</option>
                    <option value="none">No tail</option>
                  </select>
                </div>
                <div class="field" style="flex:1; min-width:120px;">
                  <label>Ear type</label>
                  <select id="desc-ear-type">
                    <option value="">—</option>
                    <option value="upright">Upright / pointed</option>
                    <option value="floppy">Floppy / drop</option>
                    <option value="semi">Semi-erect</option>
                    <option value="folded">Folded (e.g. Scottish Fold)</option>
                    <option value="rose">Rose ear</option>
                  </select>
                </div>
              </div>
              <div class="field">
                <label>Distinctive markings</label>
                <textarea id="desc-markings" rows="2" placeholder="e.g. White blaze on forehead, brown patch over left eye, scar on right hind leg, missing ear tip"></textarea>
              </div>
            </div>

            <!-- 3. Identification -->
            <div class="desc-section">
              <div class="desc-section-head">${icon('tag')} Identification</div>
              <div class="row" style="gap:10px; flex-wrap:wrap;">
                <div class="field" style="flex:1; min-width:120px;">
                  <label>Wearing a collar?</label>
                  <select id="desc-collar">
                    <option value="">Unknown</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
                <div class="field" style="flex:2; min-width:200px;">
                  <label>Collar description</label>
                  <input type="text" id="desc-collar-desc" placeholder="e.g. Red leather with silver engraved ID tag" />
                </div>
              </div>
              <div class="row" style="gap:10px; flex-wrap:wrap;">
                <div class="field" style="flex:1; min-width:130px;">
                  <label>Microchipped?</label>
                  <select id="desc-microchip">
                    <option value="">Unknown</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
                <div class="field" style="flex:2; min-width:200px;">
                  <label>Microchip ID number</label>
                  <input type="text" id="desc-microchip-id" placeholder="15-digit chip ID (any vet can scan for free)" maxlength="20" />
                </div>
              </div>
              <div class="row" style="gap:10px; flex-wrap:wrap;">
                <div class="field" style="flex:1; min-width:160px;">
                  <label>License / registration tag #</label>
                  <input type="text" id="desc-license" placeholder="e.g. City dog license number" />
                </div>
                <div class="field" style="flex:1; min-width:180px;">
                  <label>Ear tip or tattoo?</label>
                  <select id="desc-ear-tip">
                    <option value="">No / Unknown</option>
                    <option value="ear-tip">Ear tip (TNR / feral cat)</option>
                    <option value="tattoo">Tattoo marking</option>
                    <option value="both">Both</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- 4. Condition & Behavior -->
            <div class="desc-section">
              <div class="desc-section-head"> Condition &amp; Behavior</div>
              <div class="row" style="gap:10px; flex-wrap:wrap;">
                <div class="field" style="flex:1; min-width:170px;">
                  <label>Condition when ${isLost ? "last seen" : "found"}</label>
                  <select id="desc-condition-detail">
                    <option value="">—</option>
                    <option value="healthy">Healthy / normal weight</option>
                    <option value="thin">Thin / underweight</option>
                    <option value="injured">Visibly injured</option>
                    <option value="ill">Visibly ill / lethargic</option>
                    <option value="scared">Scared / hiding</option>
                    <option value="aggressive">Aggressive / unapproachable</option>
                  </select>
                </div>
                <div class="field" style="flex:1; min-width:160px;">
                  <label>Temperament</label>
                  <select id="desc-temperament">
                    <option value="">—</option>
                    <option value="friendly">Friendly / social</option>
                    <option value="shy">Shy / cautious</option>
                    <option value="timid">Timid / fearful of strangers</option>
                    <option value="aggressive">Aggressive</option>
                    <option value="skittish">Skittish / easily startled</option>
                    <option value="calm">Calm / relaxed</option>
                  </select>
                </div>
              </div>
              <div class="row" style="gap:10px; flex-wrap:wrap;">
                <div class="field" style="flex:1; min-width:150px;">
                  <label>Responds to name?</label>
                  <select id="desc-responds-name">
                    <option value="">—</option>
                    <option value="yes">Yes, comes when called</option>
                    <option value="partial">Sometimes</option>
                    <option value="no">No / not trained</option>
                  </select>
                </div>
                <div class="field" style="flex:1; min-width:150px;">
                  <label>Good with strangers?</label>
                  <select id="desc-stranger">
                    <option value="">—</option>
                    <option value="yes">Yes, approaches people</option>
                    <option value="cautious">Cautious but approachable</option>
                    <option value="no">No, avoids or growls</option>
                  </select>
                </div>
              </div>
              <div class="field">
                <label>Known fears, triggers, or habits</label>
                <input type="text" id="desc-fears" placeholder="e.g. bolts from loud noises, very food-motivated, hides under beds" />
              </div>
            </div>

            <!-- 5. Health -->
            <div class="desc-section">
              <div class="desc-section-head"> Health</div>
              <div class="row" style="gap:10px; flex-wrap:wrap;">
                <div class="field" style="flex:1; min-width:190px;">
                  <label>Known medical conditions</label>
                  <input type="text" id="desc-medical" placeholder="e.g. epilepsy, diabetes, blindness, deafness" />
                </div>
                <div class="field" style="flex:1; min-width:190px;">
                  <label>Medications required</label>
                  <input type="text" id="desc-medications" placeholder="e.g. phenobarbital twice daily" />
                </div>
              </div>
              <div class="row" style="gap:10px; flex-wrap:wrap;">
                <div class="field" style="flex:1; min-width:160px;">
                  <label>Vaccinations up to date?</label>
                  <select id="desc-vaccinations">
                    <option value="">Unknown</option>
                    <option value="yes">Yes, current</option>
                    <option value="partial">Partial / some</option>
                    <option value="no">No / overdue</option>
                  </select>
                </div>
                <div class="field" style="flex:1; min-width:160px;">
                  <label>Last vet visit (approx)</label>
                  <input type="month" id="desc-last-vet" />
                </div>
              </div>
            </div>

            <div style="border-top:1.5px solid var(--line); padding-top:16px; display:flex; gap:14px; align-items:center; flex-wrap:wrap;">
              <button type="submit" class="btn primary">${icon('save')} Save descriptive details</button>
              <p class="muted" style="font-size:13px; margin:0;">Saved details are included automatically when you submit the main report above.</p>
            </div>

          </form>
        </div>

      </div>

      <!-- RIGHT: live match preview sidebar -->
      <aside class="form-sidebar" id="form-sidebar">
        <div class="sidebar-header">
          <strong>Live match preview</strong>
          <span class="sidebar-pulse"><span class="dot"></span> Scanning</span>
        </div>
        <div id="sidebar-matches">
          <div class="sidebar-empty">
            <div style="font-size:32px; margin-bottom:8px;">${icon('search')}</div>
            <p>Select a species and enter your ZIP — we'll show potential matches from the database right here.</p>
          </div>
        </div>
        <div class="sidebar-tips">
          <strong>${icon('lightbulb')} While you fill this out:</strong>
          <ul>
            <li>More detail = better match accuracy</li>
            <li>A photo is the single biggest factor</li>
            <li>Matching runs on submit — you'll see results immediately</li>
          </ul>
        </div>
      </aside>
    </div>
  `;

  bindLinks();
  initFormHandlers(type);
}

function initFormHandlers(type) {
  const isLost = type === "lost";
  let species = state.draft?.species || null;
  const photos = [];

  // Species tiles
  $$("#species-row .species-tile").forEach(b => {
    b.addEventListener("click", () => {
      $$("#species-row .species-tile").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      let selected = b.dataset.species;
      if (selected === "other") {
        const custom = prompt("What kind of animal is it? (e.g., Hamster, Turtle, Snake)");
        if (custom) {
          selected = custom.toLowerCase().trim();
          b.querySelector('span:last-child').textContent = custom;
          b.querySelector('.species-tile-icon').innerHTML = speciesEmoji(selected);
        }
      }
      species = selected;
      updateSidebarMatches(species, $("#zip")?.value);
    });
  });

  const MAX_PHOTOS = 10;
  function renderPhotoPreview() {
    const p = $("#photo-preview");
    if (!p) return;
    p.innerHTML = photos.map((src, i) => `
      <div style="position:relative; display:inline-block;">
        <img src="${src}" alt="Photo ${i+1}" />
        <button data-photo-idx="${i}" class="photo-remove-btn" style="position:absolute;top:-6px;right:-6px;background:var(--lost);color:white;border:none;border-radius:50%;width:20px;height:20px;font-size:12px;cursor:pointer;line-height:1;" aria-label="Remove photo">${icon('x')}</button>
      </div>`).join("");
    const counter = $("#photo-counter");
    if (counter) counter.textContent = `${photos.length} / ${MAX_PHOTOS} photos`;
    p.querySelectorAll(".photo-remove-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        photos.splice(Number(btn.dataset.photoIdx), 1);
        renderPhotoPreview();
      });
    });
  }

  // Photo upload
  $("#photo-file")?.addEventListener("change", e => {
    Array.from(e.target.files || []).forEach(f => {
      if (photos.length >= MAX_PHOTOS) { toast(`Maximum ${MAX_PHOTOS} photos allowed.`); return; }
      if (f.size > 10 * 1024 * 1024) { toast("Photo over 10 MB — please pick a smaller file."); return; }
      const reader = new FileReader();
      reader.onload = ev => { photos.push(ev.target.result); renderPhotoPreview(); };
      reader.readAsDataURL(f);
    });
  });

  // ZIP live matching
  $("#zip")?.addEventListener("input", e => {
    const zip = e.target.value.trim();
    updateLiveMatchBar(species, zip, type);
    if (zip.length >= 3) updateSidebarMatches(species, zip);
  });

  // Geolocation
  $("#geo-btn")?.addEventListener("click", () => {
    if (!navigator.geolocation) { toast("Location not available in this browser."); return; }
    toast("Getting your location…");
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude: lat, longitude: lon } = pos.coords;
      fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=en`)
        .then(r => r.json())
        .then(d => {
          const a = d.address || {};
          const loc = [a.road, a.suburb || a.city_district || a.neighbourhood, a.city || a.town || a.village].filter(Boolean).join(", ");
          const locationEl = document.getElementById("location");
          const zipEl = document.getElementById("zip");
          if (locationEl && loc) locationEl.value = loc;
          if (zipEl && a.postcode) { zipEl.value = a.postcode.slice(0, 5); updateLiveMatchBar(species, zipEl.value, type); updateSidebarMatches(species, zipEl.value); }
          toast("Location filled in.");
        })
        .catch(() => toast("Couldn't look up address — please type it manually."));
    }, () => toast("Location permission denied — please type address manually."));
  });

  // Autosave
  const autoSaveTimer = setInterval(() => {
    state.draft = collectForm(type, species);
    saveState();
    const s = $("#autosave-status");
    if (s) { s.textContent = "Draft saved · " + new Date().toLocaleTimeString(); setTimeout(() => { if (s) s.textContent = ""; }, 1500); }
  }, 5000);

  // Submit
  $("#pet-form").addEventListener("submit", async e => {
    e.preventDefault();
    if (!species) { toast("Please pick a species first (dog, cat, or other)."); $$("#species-row .species-tile")[0]?.focus(); return; }
    const contact = document.getElementById("contact")?.value?.trim();
    if (!contact) { toast("Please enter an email or phone so matches can reach you."); document.getElementById("contact")?.focus(); return; }
    
    const data = collectForm(type, species);
    data.hasPhoto = photos.length > 0;

    if (!photos.length) {
      toast("Please upload at least one real photo of the pet.");
      return;
    }
    clearInterval(autoSaveTimer);
    const validation = validateListingData(data);
    if (validation.warning) {
      showWarningModal(validation.message, validation.count);
      return;
    } else if (!validation.ok) {
      toast(validation.message, validation.banned ? 5200 : 4200);
      return;
    }
    const submitBtn = document.querySelector('#pet-form [type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Submitting…"; }
    const id = "U-" + Date.now().toString(36).toUpperCase();
    const listing = {
      id, type, species,
      name: data.name || null, breed: data.breed || null, color: data.color || null,
      size: data.size || null, age: data.age || null,
      photo: photos[0], photos,
      location: data.location, zip: data.zip, distance: 0,
      when: `${data.whenDate}T${data.whenTime}`,
      contact: data.contact,
      poster: { name: "You", initials: "YO", neighborhood: "Your area" },
      features: data.features,
      reward: data.reward ? Number(data.reward) : null,
      condition: data.condition, custody: data.custody,
      status: "active", posted: new Date().toISOString(),
    };
    // Merge any saved descriptive form details into the listing
    if (state.draft?.descriptive) {
      const d = state.draft.descriptive;
      const lines = [
        d.sex            && `Sex: ${d.sex}`,
        d.fixed          && `Spayed/Neutered: ${d.fixed}`,
        d.breedDetail    && `Breed (detail): ${d.breedDetail}`,
        (d.ageYears || d.ageMonths) && `Age: ${[d.ageYears && d.ageYears + " yr", d.ageMonths && d.ageMonths + " mo"].filter(Boolean).join(" ")}`,
        d.weight         && `Weight: ${d.weight}`,
        d.coatLength     && `Coat: ${d.coatLength}`,
        d.coatPattern    && `Pattern: ${d.coatPattern}`,
        d.secondaryColor && `Secondary color: ${d.secondaryColor}`,
        d.eyeColor       && `Eye color: ${d.eyeColor}`,
        d.tail           && `Tail: ${d.tail}`,
        d.earType        && `Ears: ${d.earType}`,
        d.markings       && `Markings: ${d.markings}`,
        d.collar === "yes" && (d.collarDesc ? `Collar: ${d.collarDesc}` : "Wearing a collar"),
        d.microchip === "yes" && (d.microchipId ? `Microchip ID: ${d.microchipId}` : "Microchipped"),
        d.license        && `License/tag: ${d.license}`,
        d.earTip         && `Ear marking: ${d.earTip}`,
        d.conditionDetail && `Condition: ${d.conditionDetail}`,
        d.temperament    && `Temperament: ${d.temperament}`,
        d.respondsName   && `Responds to name: ${d.respondsName}`,
        d.stranger       && `With strangers: ${d.stranger}`,
        d.fears          && `Fears/habits: ${d.fears}`,
        d.medical        && `Medical: ${d.medical}`,
        d.medications    && `Medications: ${d.medications}`,
        d.vaccinations   && `Vaccinations: ${d.vaccinations}`,
        d.lastVet        && `Last vet: ${d.lastVet}`,
      ].filter(Boolean);
      if (lines.length) listing.features = [listing.features, lines.join("\n")].filter(Boolean).join("\n\n");
      if (!listing.breed && d.breedDetail) listing.breed = d.breedDetail;
      if (!listing.age && (d.ageYears || d.ageMonths)) listing.age = [d.ageYears && d.ageYears + " yr", d.ageMonths && d.ageMonths + " mo"].filter(Boolean).join(" ");
      listing.descriptive = d;
    }
    const policy = await canSubmitListing(listing);
    if (!policy.allowed) {
      toast(policy.reason || "Listing blocked by automated moderation.");
      return;
    }
    const matches = await computeMatches(listing);
    matches.slice(0, 5).forEach(m => {
      state.alerts.unshift({
        id: "A-" + Date.now() + "-" + m.listing.id,
        listingId: listing.id, matchId: m.listing.id,
        score: m.score, when: new Date().toISOString(),
        message: `${Math.round(m.score * 100)}% match — ${m.reasons.slice(0, 2).join(", ")}`,
        read: false,
      });
    });
    await persistListing(listing, "public");
    saveState();
    refreshAlertsBadge();
    showMatchReveal(listing, matches);
  });

  // Descriptive form — save details to draft so main submit picks them up
  const descForm = document.getElementById("descriptive-form");
  if (descForm) {
    descForm.addEventListener("submit", e => {
      e.preventDefault();
      const g = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
      const filled = Object.fromEntries(Object.entries({
        speciesDetail:   g("desc-species-detail"),
        sex:             g("desc-sex"),
        fixed:           g("desc-fixed"),
        breedDetail:     g("desc-breed-detail"),
        ageYears:        g("desc-age-years"),
        ageMonths:       g("desc-age-months"),
        weight:          g("desc-weight"),
        coatLength:      g("desc-coat-length"),
        coatPattern:     g("desc-coat-pattern"),
        secondaryColor:  g("desc-secondary-color"),
        eyeColor:        g("desc-eye-color"),
        tail:            g("desc-tail"),
        earType:         g("desc-ear-type"),
        markings:        g("desc-markings"),
        collar:          g("desc-collar"),
        collarDesc:      g("desc-collar-desc"),
        microchip:       g("desc-microchip"),
        microchipId:     g("desc-microchip-id"),
        license:         g("desc-license"),
        earTip:          g("desc-ear-tip"),
        conditionDetail: g("desc-condition-detail"),
        temperament:     g("desc-temperament"),
        respondsName:    g("desc-responds-name"),
        stranger:        g("desc-stranger"),
        fears:           g("desc-fears"),
        medical:         g("desc-medical"),
        medications:     g("desc-medications"),
        vaccinations:    g("desc-vaccinations"),
        lastVet:         g("desc-last-vet"),
      }).filter(([, v]) => v));
      state.draft = { ...(state.draft || {}), descriptive: filled };
      saveState();
      toast("Descriptive details saved. They'll be included when you submit the report above. ");
    });
  }
}

function updateLiveMatchBar(species, zip, type) {
  const bar = $("#live-match-bar");
  if (!bar) return;
  const matches = liveMatchCount(species, zip);
  if (!matches) { bar.hidden = true; return; }
  const oppCount = matches.filter(l => l.type !== (type || "lost")).length;
  bar.hidden = false;
  bar.innerHTML = oppCount > 0
    ? `<span class="live-match-found">${icon('target')} ${oppCount} ${species || "pet"} report${oppCount !== 1 ? "s" : ""} in your area could match — submitting this will cross-reference them all.</span>`
    : `<span class="live-match-none">No exact matches yet in your area — your report will alert anyone who posts later.</span>`;
}

function updateSidebarMatches(species, zip) {
  const sb = $("#sidebar-matches");
  if (!sb) return;
  const candidates = allListings().filter(l =>
    l.status === "active" &&
    (!species || l.species === species) &&
    (!zip || zip.length < 3 || (l.zip && l.zip.startsWith(zip.slice(0, 3))))
  ).slice(0, 4);

  if (!candidates.length) {
    sb.innerHTML = `<div class="sidebar-empty"><div style="font-size:28px;margin-bottom:8px;">${icon('check')}</div><p>No existing reports match yet — your listing will be ready to match as soon as someone posts.</p></div>`;
    return;
  }
  sb.innerHTML = `
    <p class="sidebar-count">${candidates.length} active report${candidates.length !== 1 ? "s" : ""} found nearby${species ? " for " + species + "s" : ""}:</p>
    ${candidates.map(l => `
      <a class="sidebar-match-row" href="#/listing/${l.id}" data-link>
        <div class="sidebar-match-photo" style="${l.photo ? `background-image:url('${escapeHtml(l.photo)}')` : ""}"></div>
        <div class="sidebar-match-body">
          <span class="tag-inline ${l.type}">${l.type === "lost" ? "Lost" : "Found"}</span>
          <strong>${escapeHtml(l.name || (l.type === "found" ? "Found " + l.species : "Lost " + l.species))}</strong>
          <div style="font-size:12px; color:var(--muted);">${escapeHtml(l.location || "")} · ${fmtDate(l.posted)}</div>
        </div>
      </a>`).join("")}
    <a href="#/listings?species=${species || "all"}" data-link class="btn ghost block" style="margin-top:8px; font-size:13px; text-align:center;">Browse all listings →</a>
  `;
  bindLinks();
}

function collectForm(type, species) {
  const g = id => (document.getElementById(id) ? document.getElementById(id).value : "");
  return { type, species, location: g("location"), zip: g("zip"), whenDate: g("when-date"), whenTime: g("when-time"), contact: g("contact"), name: g("name"), breed: g("breed"), color: g("color"), size: g("size"), age: g("age"), features: g("features"), reward: g("reward"), condition: g("condition"), custody: g("custody") };
}

function showMatchReveal(listing, matches) {
  const isLost = listing.type === "lost";

  // Dramatic scanning animation first
  $("#app").innerHTML = `
    <div class="match-reveal-scanning">
      <div class="scanning-icon">${icon('search')}</div>
      <h2>Scanning database…</h2>
      <p>Cross-referencing ${allListings().filter(l => l.status === "active").length} active listings by species, location, color, breed, date, and photo similarity.</p>
      <div class="scanning-bar"><div class="scanning-fill" id="scan-fill"></div></div>
    </div>`;

  let pct = 0;
  const fill = () => {
    pct += Math.random() * 18 + 8;
    const el = document.getElementById("scan-fill");
    if (el) el.style.width = Math.min(pct, 95) + "%";
  };
  fill();
  const scanTimer = setInterval(fill, 180);

  setTimeout(() => {
    clearInterval(scanTimer);
    const topMatches = matches.slice(0, 5);
    const hasMatches = topMatches.length > 0;
    const highConf = topMatches.filter(m => m.score >= 0.75);

    $("#app").innerHTML = html`
      <div class="match-reveal">

        <div class="match-reveal-hero ${hasMatches ? "has-matches" : ""}">
          <div class="reveal-icon">${hasMatches ? (highConf.length ? icon('target') : icon('broadcast')) : icon('check-circle')}</div>
          <h1>${hasMatches
            ? (highConf.length ? `${highConf.length} high-confidence match${highConf.length > 1 ? "es" : ""} found!` : `${topMatches.length} possible match${topMatches.length > 1 ? "es" : ""} found`)
            : "Your listing is live!"}</h1>
          <p>${hasMatches
            ? (highConf.length ? "We've already alerted the people on the other side. Tap a match to view and contact them."
                : "These aren't perfect yet — more detail and a photo will sharpen them. We'll keep scanning and alert you instantly when a better match appears.")
            : "No matches in the database right now. You'll get an instant alert the moment a matching report comes in. In the meantime, share your listing."}</p>
        </div>

        ${hasMatches ? html`
          <div class="match-results-list">
            ${topMatches.map(m => html`
              <div class="match-result-card ${m.score >= 0.75 ? "high" : m.score >= 0.5 ? "medium" : ""}">
                <div class="match-result-score">
                  ${m.score >= 0.95 ? " PERFECT" : m.score >= 0.75 ? " HIGH" : m.score >= 0.5 ? " MEDIUM" : m.score < 0.2 ? " UNCOMMON" : " LOW"}
                  <strong>${Math.round(m.score * 100)}% match</strong>
                  <span class="match-reasons">${escapeHtml(m.reasons.join(" · "))}</span>
                </div>
                <div class="match-result-body">
                  <div class="match-photos">
                    <div class="match-photo" style="background-image:url('${listing.photo ? escapeHtml(listing.photo) : petAvatar(listing)}')">
                      <span class="tag ${listing.type}">${listing.type === "lost" ? "Lost" : "Found"}</span>
                    </div>
                    <div class="match-arrow">↔</div>
                    <div class="match-photo" style="background-image:url('${m.listing.photo ? escapeHtml(m.listing.photo) : petAvatar(m.listing)}')">
                      <span class="tag ${m.listing.type}">${m.listing.type === "lost" ? "Lost" : "Found"}</span>
                    </div>
                  </div>
                  <div class="match-details">
                    <strong>${escapeHtml(m.listing.name || (m.listing.type === "found" ? "Found " + m.listing.species : "Lost " + m.listing.species))}</strong>
                    <div class="muted" style="font-size:13px;">${escapeHtml(m.listing.location || "")} · ${fmtDate(m.listing.posted)}</div>
                    <div class="match-result-actions">
                      <a class="btn small primary" href="#/listing/${m.listing.id}" data-link>View & contact →</a>
                      <button class="btn small" data-act="confirm-match" data-mid="${m.listing.id}">Good match</button>
                      <button class="btn small ghost" data-act="reject" data-mid="${m.listing.id}">Not a match</button>
                    </div>
                  </div>
                </div>
              </div>
            `).join("")}
          </div>
        ` : ""}

        <div class="reveal-next-steps">
          <h2>Next steps</h2>
          <div class="reveal-steps-grid">
            <a href="#/share-wizard/${listing.id}" class="reveal-step" data-link>
              <div class="reveal-step-icon">${icon('megaphone')}</div>
              <strong>Share your listing</strong>
              <p>Facebook groups, Nextdoor, WhatsApp — one share in the first hour is worth 10 tomorrow.</p>
            </a>
            <a href="#/advice/first-24-hours" class="reveal-step" data-link>
              <div class="reveal-step-icon">${icon('clock')}</div>
              <strong>First 24 hours guide</strong>
              <p>Calm, proven checklist for the next few hours. Covers shelters, flyers, neighbors, scent.</p>
            </a>
            <a href="#/listing/${listing.id}" class="reveal-step" data-link>
              <div class="reveal-step-icon">${icon('clipboard')}</div>
              <strong>View your listing</strong>
              <p>Print a flyer, edit details, and track who's seen it. You can add more photos any time.</p>
            </a>
            <a href="#/community" class="reveal-step" data-link>
              <div class="reveal-step-icon">${icon('message')}</div>
              <strong>Post in community</strong>
              <p>Let neighbors know directly — someone nearby might have already seen your pet.</p>
            </a>
          </div>
        </div>

      </div>
    `;
    bindLinks();
    $$("[data-act=confirm-match]").forEach(b => b.addEventListener("click", () => {
      const match = topMatches.find(m => m.listing.id === b.dataset.mid);
      if (match) trainMatchAlgorithm(listing, match.listing, true);
      toast("Thanks. The matcher learned from that review.");
    }));
    $$("[data-act=reject]").forEach(b => b.addEventListener("click", () => {
      const match = topMatches.find(m => m.listing.id === b.dataset.mid);
      if (match) trainMatchAlgorithm(listing, match.listing, false);
      b.closest(".match-result-card")?.remove();
      toast("Got it — not a match. That helps train the algorithm.");
    }));
  }, 1800);
}

// ---------- community ----------
function communityPostCard(p, compact = false) {
  const typeLabels = { sighting: "Sighting", reunion: "Reunited! ", tip: "Tip", question: "Question", support: "Support" };
  const pinHtml = p.pinned ? `<span style="font-size:12px;color:var(--warn);font-weight:600;margin-right:6px;">${icon('map-pin')} Pinned</span>` : "";
  const listingLink = p.relatedListing ? html`<a class="post-listing-link" href="#/listing/${p.relatedListing}" data-link>${pawIcon()} View listing: ${findListing(p.relatedListing)?.name || p.relatedListing}</a>` : "";
  const reactTotal = Object.values(p.reactions || {}).reduce((a, b) => a + b, 0);
  return html`
    <div class="community-post">
      <div class="post-head">
        <div class="post-avatar" style="background:${escapeHtml(p.author.avatarColor || "#e87c2e")};">${escapeHtml(p.author.initials)}</div>
        <div class="post-author">
          <strong>${escapeHtml(p.author.name)}</strong>
          <span>${escapeHtml(p.author.neighborhood)} · ${fmtDate(p.when)}</span>
        </div>
        <span class="post-type-tag ${p.type}">${pinHtml}${typeLabels[p.type] || p.type}</span>
      </div>
      <div class="post-content">${escapeHtml(p.content)}</div>
      ${listingLink}
      <div class="post-reactions">
        <button class="reaction-btn" data-post="${p.id}" data-reaction="heart"> ${p.reactions.heart || 0}</button>
        <button class="reaction-btn" data-post="${p.id}" data-reaction="hug"> ${p.reactions.hug || 0}</button>
        <button class="reaction-btn" data-post="${p.id}" data-reaction="clap"> ${p.reactions.clap || 0}</button>
        <button class="reaction-btn" data-post="${p.id}" data-reaction="hope"> ${p.reactions.hope || 0}</button>
        ${p.comments ? `<span class="post-comment-count">${icon('message')} ${p.comments} comments</span>` : ""}
      </div>
    </div>
  `;
}

function renderCommunity() {
  const allP = allPosts().sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.when) - new Date(a.when);
  });

  $("#app").innerHTML = html`
    <div class="section-row" style="margin-bottom:6px;">
      <h1 style="font-size:28px; font-weight:800; letter-spacing:-.02em;">Community board</h1>
    </div>
    <p class="subhead">Neighbors sharing sightings, reunions, tips, and support. No account needed to post.</p>

    <div class="card" id="new-post-area" style="margin-bottom:22px;">
      <h3 style="margin:0 0 14px; font-size:16px;">Share with the community</h3>
      <div style="margin-bottom:10px;">
        <label style="font-size:13px; font-weight:600; color:var(--ink-soft); margin-bottom:6px; display:block;">Post type</label>
        <div class="row" style="gap:6px; flex-wrap:wrap;">
          ${[["sighting",`${icon('search')} Sighting`],["tip",`${icon('lightbulb')} Tip`],["question",`${icon('help-circle')} Question`],["reunion","Reunion"],["support","Support"]].map(([v, label]) =>
            `<button class="chip post-type-btn" data-type="${v}">${label}</button>`).join("")}
        </div>
      </div>
      <div class="new-post-row">
        <div class="post-avatar" style="background:var(--brand); flex-shrink:0;">YO</div>
        <textarea id="new-post-text" placeholder="Share a sighting, tip, or note of support…" rows="3"></textarea>
      </div>
      <div class="row" style="margin-top:10px; justify-content:flex-end;">
        <input type="text" id="new-post-name" placeholder="Your name (optional)" style="padding:8px 12px; border-radius:var(--radius-sm); border:1.5px solid var(--line); font-size:14px; font-family:inherit; flex:1; max-width:220px;" />
        <button class="btn primary" id="post-submit">Post to community</button>
      </div>
    </div>

    <div class="filters" style="margin-bottom:16px;">
      <span class="chip active" data-cfilter="all">All posts</span>
      <span class="chip" data-cfilter="sighting">Sightings</span>
      <span class="chip" data-cfilter="reunion">Reunions</span>
      <span class="chip" data-cfilter="tip">Tips</span>
      <span class="chip" data-cfilter="question">Questions</span>
      <span class="chip" data-cfilter="support">Support</span>
    </div>

    <div class="community-feed" id="community-feed">
      ${allP.map(p => communityPostCard(p)).join("")}
    </div>
  `;

  bindLinks();
  $$(".reaction-btn").forEach(b => b.addEventListener("click", handleReaction));

  let selectedType = "sighting";
  $$(".post-type-btn").forEach(b => {
    b.addEventListener("click", () => {
      $$(".post-type-btn").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      selectedType = b.dataset.type;
    });
  });

  $("#post-submit").addEventListener("click", async () => {
    const text = $("#new-post-text").value.trim();
    if (!text) { toast("Write something first."); return; }
    const name = $("#new-post-name").value.trim() || "Anonymous";
    const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "YO";
    const post = {
      id: "UP-" + Date.now().toString(36).toUpperCase(),
      type: selectedType,
      author: { name, initials, neighborhood: "Your neighborhood", avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)] },
      content: text,
      when: new Date().toISOString(),
      reactions: { heart: 0, hug: 0, clap: 0, hope: 0 },
      comments: 0,
    };

    const submitBtn = $("#post-submit");
    submitBtn.disabled = true;
    const policy = await canSubmitPost(post);
    submitBtn.disabled = false;
    if (!policy.allowed) { toast(policy.reason); return; }

    persistCommunityPost(post);
    $("#new-post-text").value = "";
    toast("Posted to the community board.");
    $("#community-feed").insertAdjacentHTML("afterbegin", communityPostCard(post));
    bindLinks();
    const newCard = $("#community-feed").firstElementChild;
    newCard?.querySelectorAll(".reaction-btn").forEach(b => b.addEventListener("click", handleReaction));
  });

  $$(".chip[data-cfilter]").forEach(c => c.addEventListener("click", () => {
    $$(".chip[data-cfilter]").forEach(x => x.classList.remove("active"));
    c.classList.add("active");
    const f = c.dataset.cfilter;
    const feed = $("#community-feed");
    const filtered = f === "all" ? allP : allP.filter(p => p.type === f);
    feed.innerHTML = filtered.length
      ? filtered.map(p => communityPostCard(p)).join("")
      : `<div class="empty"><div class="emoji">${icon('message')}</div>No ${f} posts yet. Be the first!</div>`;
    bindLinks();
    $$(".reaction-btn").forEach(b => b.addEventListener("click", handleReaction));
  }));
}

function handleReaction(e) {
  const b = e.currentTarget;
  const postId = b.dataset.post;
  const reaction = b.dataset.reaction;
  const allP = allPosts();
  const post = allP.find(p => p.id === postId) || state.communityPosts.find(p => p.id === postId);
  if (!post) return;
  if (!b.classList.contains("reacted")) {
    post.reactions[reaction] = (post.reactions[reaction] || 0) + 1;
    b.classList.add("reacted");
    b.textContent = { heart: "", hug: "", clap: "", hope: "" }[reaction] + " " + post.reactions[reaction];
  }
  saveState();
}

// ---------- tips ----------
function tipCard(t) {
  return html`
    <div class="tip-card">
      <div class="tip-icon">${dataIcon(t.icon)}</div>
      <div class="tip-body">
        <strong>${escapeHtml(t.title)}</strong>
        <p>${escapeHtml(t.text)}</p>
        <span class="tip-cat ${t.category}">${escapeHtml(TIP_CATEGORIES.find(c => c.id === t.category)?.label || t.category)}</span>
      </div>
    </div>
  `;
}

function renderTips() {
  $("#app").innerHTML = html`
    <div class="section-row" style="margin-bottom:6px;">
      <h1 style="font-size:28px; font-weight:800; letter-spacing:-.02em;">Quick tips</h1>
    </div>
    <p class="subhead">${TIPS.length} practical tips from people who've searched — and found their pets.</p>

    <div class="filters" style="margin-bottom:18px;">
      ${TIP_CATEGORIES.map((c, i) => `<span class="chip ${i===0?"active":""}" data-tcat="${c.id}">${c.label}</span>`).join("")}
    </div>

    <div class="tips-grid" id="tips-grid">
      ${TIPS.map(tipCard).join("")}
    </div>

    <div class="section-warm" style="margin-top:36px; text-align:center;">
      <h2 style="margin-bottom:8px;">Need more detail?</h2>
      <p style="color:var(--ink-soft); margin-bottom:18px;">These tips are the quick version. The Advice Center has full, step-by-step guides for each situation.</p>
      <a href="#/advice" class="btn primary" data-link>Open the Advice Center →</a>
    </div>
  `;
  bindLinks();

  $$(".chip[data-tcat]").forEach(c => c.addEventListener("click", () => {
    $$(".chip[data-tcat]").forEach(x => x.classList.remove("active"));
    c.classList.add("active");
    const cat = c.dataset.tcat;
    const filtered = cat === "all" ? TIPS : TIPS.filter(t => t.category === cat);
    $("#tips-grid").innerHTML = filtered.length
      ? filtered.map(tipCard).join("")
      : `<div class="empty"><div class="emoji">${icon('lightbulb')}</div>No tips in this category yet.</div>`;
  }));
}

// ---------- advice ----------
function renderAdviceIndex() {
  $("#app").innerHTML = html`
    <h1 style="font-size:28px; font-weight:800; letter-spacing:-.02em; margin-bottom:6px;">Advice center</h1>
    <p class="subhead">Practical, written-for-panic guides. Skim the checklists first.</p>
    <div class="advice-grid">
      ${ARTICLES.map(a => html`
        <a class="advice-card has-photo ${a.flagship ? "flagship" : ""}" href="#/advice/${a.id}" data-link>
          <div class="advice-photo" style="background-image:url('${escapeHtml(articleImg(a))}');">
            <span class="advice-photo-icon">${dataIcon(a.icon)}</span>
          </div>
          <div class="advice-card-body">
            <h3>${escapeHtml(a.title)}</h3>
            <p>${escapeHtml(a.summary)}</p>
          </div>
        </a>
      `).join("")}
    </div>
  `;
  bindLinks();
}

function renderArticle(id) {
  const a = ARTICLES.find(x => x.id === id);
  if (!a) { renderAdviceIndex(); return; }
  $("#app").innerHTML = html`
    <article class="article">
      <a href="#/advice" data-link class="muted">← All advice</a>
      <div class="article-hero" style="background-image:url('${escapeHtml(articleImg(a, 1100, 520))}');"></div>
      <h1 style="margin-top:0;">${escapeHtml(a.title)}</h1>
      ${a.body}
      <div class="next-step">
        <strong>Next step:</strong>
        ${a.id === "first-24-hours" || a.id === "search-strategy"
          ? `<a href="#/lost" data-link>Report your lost pet →</a>`
          : a.id === "found-pet"
          ? `<a href="#/found" data-link>Post a found-pet report →</a>`
          : `<a href="#/listings" data-link>Browse nearby cases →</a>`}
      </div>
    </article>
  `;
  bindLinks();
}

// ---------- about + helpline ----------
function renderAbout() {
  $("#app").innerHTML = html`
    <article class="article">
      <h1>About PawTrail</h1>
      <p class="lede">Free. Fast. Built for the panicked first hour. We collapse the loop between a missing pet and a reunion.</p>
      <h2>How it works</h2>
      <ol>
        <li>Anyone can post Lost or Found in under 2 minutes — no account needed.</li>
        <li>Every listing runs through a matching pipeline in seconds: species, location, date, attributes, image similarity.</li>
        <li>High-confidence matches trigger instant alerts. Medium go to email. Low go to a daily digest.</li>
        <li>One-tap sharing pushes your listing to Facebook, Nextdoor, X, WhatsApp, and SMS.</li>
        <li>A printable flyer with QR code is ready from any listing.</li>
      </ol>
      <h2>Trust & Safety</h2>
      <ul>
        <li>Contact info is never shown publicly. All messages route through PawTrail relay.</li>
        <li>Ownership claims require at least two non-public verifiers.</li>
        <li>Automated scam detection flags messages mentioning payment or shipping.</li>
        <li>Every listing has a one-tap Report button. Reports go to moderation with a 4-hour SLA.</li>
      </ul>
      <h2>This is a demo</h2>
      <p>All listings, profiles, and contact details are fictional. PawTrail is a demonstration of a product spec — not a live service. If your pet is missing, please use <a href="https://www.pawboost.com" target="_blank" rel="noopener">PawBoost</a>, your local shelter, and your neighborhood social media groups.</p>
    </article>
  `;
  bindLinks();
}

function renderHelpline() {
  $("#app").innerHTML = html`
    <article class="article">
      <h1>Helpline directory</h1>
      <p class="lede">Existing 24/7 services that are well-funded and staffed. Save these numbers in your phone before you need them.</p>
      <div class="helpline-list">
        ${HELPLINE.map(h => html`
          <div class="card">
            <div>
              <div style="font-weight:700; font-size:15px;">${escapeHtml(h.name)}</div>
              <div class="muted" style="font-size:13px;">${escapeHtml(h.note)}</div>
            </div>
            <div class="num">${escapeHtml(h.num)}</div>
          </div>
        `).join("")}
      </div>
      <div class="callout info" style="margin-top:22px;">
        <strong>PawTrail async support:</strong> Email help@pawtrail.example — 4-hour SLA 9am–9pm local, 12-hour overnight. Or use the chat assistant (${icon('message')} button).
      </div>
    </article>
  `;
  bindLinks();
}

// ---------- authentication ----------
function updateAuthUI() {
  const link = $("#nav-auth");
  const mLink = $("#mobile-nav-auth");
  const label = state.user ? (state.user.email?.split("@")[0] || "Account") : "Login";
  const href = state.user ? "#/profile" : "#/login";
  if (link) { link.textContent = label; link.href = href; }
  if (mLink) { mLink.textContent = " " + label; mLink.href = href; }
}

function renderLogin() {
  if (state.user) { navigate("#/profile"); return; }
  let isSignup = false;
  const draw = () => {
    $("#app").innerHTML = html`
      <div class="card" style="max-width:400px; margin:60px auto; padding:32px;">
        <div style="text-align:center; margin-bottom:24px;">
          <div style="font-size:40px; margin-bottom:12px;">${pawIcon()}</div>
          <h1 style="font-size:24px; font-weight:800; margin:0;">${isSignup ? "Create account" : "Welcome back"}</h1>
          <p class="muted" style="margin-top:6px;">${isSignup ? "Join the community to track your pets." : "Log in to manage your listings."}</p>
        </div>
        <form id="login-form">
          <div class="field"><label>Email address</label><input type="email" id="auth-email" required placeholder="name@example.com" /></div>
          <div class="field"><label>Password</label><input type="password" id="auth-password" required placeholder="••••••••" minlength="6" /></div>
          <button class="btn primary block big" type="submit" style="margin-top:8px;">${isSignup ? "Sign up" : "Log in"}</button>
        </form>
        <div style="text-align:center; margin-top:20px; font-size:14px;">
          <span class="muted">${isSignup ? "Already have an account?" : "Don't have an account?"}</span>
          <button class="btn small ghost" id="auth-toggle" style="margin-left:6px;">${isSignup ? "Log in" : "Sign up"}</button>
        </div>
      </div>
    `;
    $("#auth-toggle").addEventListener("click", () => { isSignup = !isSignup; draw(); });
    $("#login-form").addEventListener("submit", async e => {
      e.preventDefault();
      const email = $("#auth-email").value;
      const password = $("#auth-password").value;
      try {
        const api = window.PawTrailSupabase;
        if (!api?.ready) throw new Error("Supabase is not configured.");
        if (isSignup) {
          await api.signUp(email, password);
          toast("Signup successful! Please log in.");
          isSignup = false; draw();
        } else {
          state.user = await api.signIn(email, password);
          saveState();
          updateAuthUI();
          toast("Welcome back!");
          navigate("#/my-listings");
        }
      } catch (err) { toast(err.message); }
    });
    bindLinks();
  };
  draw();
}

function renderProfile() {
  if (!state.user) { navigate("#/login"); return; }
  $("#app").innerHTML = html`
    <div class="card" style="max-width:500px; margin:40px auto; padding:32px;">
      <h1 style="margin:0 0 16px; font-size:24px; font-weight:800;">My Account</h1>
      <div class="field">
        <label>Logged in as</label>
        <div style="padding:12px; background:var(--bg); border-radius:var(--radius-sm); border:1.5px solid var(--line);">
          ${escapeHtml(state.user.email)}
        </div>
      </div>
      <p class="muted" style="font-size:13.5px; margin-top:12px;">Your session is secured via Supabase Auth. All your listings are linked to this email.</p>
      <hr style="margin:24px 0; border:0; border-top:1.5px solid var(--line);" />
      <div class="row" style="gap:10px;">
        <button class="btn block" id="logout-btn" style="flex:1;">Log out</button>
        <a href="#/settings" class="btn block ghost" data-link style="flex:1;">Alert settings</a>
      </div>
    </div>
  `;
  $("#logout-btn").addEventListener("click", () => {
    state.user = null;
    localStorage.removeItem("pawtrail.auth.token");
    saveState();
    updateAuthUI();
    toast("Logged out safely.");
    navigate("#/");
  });
  bindLinks();
}

// ---------- reunion claim ----------
function renderReunionClaim(id) {
  const l = findListing(id);
  if (!l) { navigate("#/listings"); return; }
  $("#app").innerHTML = html`
    <div class="form-page">
      <a href="#/listing/${l.id}" data-link class="muted" style="display:inline-block; margin-bottom:16px;">← Back to listing</a>
      <h1>Claim: this is my pet</h1>
      <p class="lede">To protect against false claims, we need <strong>at least two</strong> non-public verifiers before connecting you with the finder.</p>
      <form id="claim-form">
        <div class="card" style="margin-bottom:18px;">
          <div class="field"><label><input type="checkbox" name="v" value="photo" /> Prior photo of the pet — with EXIF date predating the listing</label></div>
          <div class="field"><label><input type="checkbox" name="v" value="vet" /> Vet record or invoice with the pet's name</label></div>
          <div class="field">
            <label><input type="checkbox" name="v" value="chip" /> Microchip ID number</label>
            <input type="text" placeholder="15-digit chip number" style="margin-top:6px; width:100%; padding:10px; border-radius:var(--radius-sm); border:1.5px solid var(--line); font-family:inherit; font-size:14px;" />
          </div>
          <div class="field">
            <label><input type="checkbox" name="v" value="feature" /> Describe a distinguishing feature NOT shown in the listing</label>
            <textarea placeholder="e.g. small white spot on the underside of the left back paw" style="margin-top:6px; width:100%; padding:10px; border-radius:var(--radius-sm); border:1.5px solid var(--line); font-family:inherit; font-size:14px; resize:vertical; min-height:70px;"></textarea>
          </div>
        </div>
        <div class="callout info">Provide two or more verifiers and we'll send a confirmation request to the finder within minutes. Disputes go to a human moderator with a 4-hour SLA.</div>
        <button class="btn block primary big" type="submit" style="margin-top:18px;">Submit claim</button>
      </form>
    </div>
  `;
  bindLinks();
  $("#claim-form").addEventListener("submit", e => {
    e.preventDefault();
    if ($$('input[name="v"]:checked').length < 2) { toast("Please provide at least 2 verifiers."); return; }
    toast("Claim submitted. The finder has been notified — expect a response within 4 hours.");
    setTimeout(() => navigate("#/listing/" + l.id), 1000);
  });
}

// ---------- modals ----------
function openModal(innerHtml) {
  const back = document.createElement("div");
  back.className = "modal-back";
  back.innerHTML = `<div class="modal">${innerHtml}</div>`;
  document.body.appendChild(back);
  back.addEventListener("click", e => { if (e.target === back) back.remove(); });
  return back;
}

function showLocationCookiePrompt() {
  if (state.cookieConsent) return;
  if (document.getElementById("cookie-full")) return; // modal already open
  const m = openModal(html`
    <div style="max-width:380px; padding:6px;">
      <div style="font-size:40px; margin-bottom:10px; text-align:center;"></div>
      <h3 style="margin:0 0 8px; text-align:center;">Cookies &amp; Location</h3>
      <p class="muted" style="font-size:14px; margin-bottom:6px;">We use cookies to save your draft reports, bookmarks, and settings between visits. Location access lets us show nearby cases first.</p>
      <p class="muted" style="font-size:13px; margin-bottom:18px;">You can post reports and browse without either — nothing here requires an account.</p>
      <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:14px;">
        <button class="btn primary block" id="cookie-full">Accept cookies &amp; enable location</button>
        <button class="btn block" id="cookie-essential">Accept cookies only (no location)</button>
        <button class="btn ghost block" id="cookie-reject" style="font-size:13px; color:var(--muted);">Decline — browse this session only</button>
      </div>
      <p class="muted" style="font-size:11px; text-align:center;">We never sell your data. Cookies store only your own listings and preferences locally. <a href="#/about" data-link>Privacy policy</a></p>
    </div>
  `);

  m.querySelector("#cookie-full").addEventListener("click", () => {
    state.cookieConsent = "full";
    saveState();
    navigator.geolocation?.getCurrentPosition(
      () => { toast("Location enabled. Showing nearby listings first."); routeRender(location.hash); },
      () => { toast("Location permission denied — you can still use all features."); }
    );
    m.remove();
  });

  m.querySelector("#cookie-essential").addEventListener("click", () => {
    state.cookieConsent = "essential";
    saveState();
    toast("Cookies accepted. Your drafts and settings will be saved.");
    m.remove();
  });

  m.querySelector("#cookie-reject").addEventListener("click", () => {
    state.cookieConsent = "rejected"; // in-memory only — saveState() skips when rejected
    toast("No cookies set. Your data won't be saved between visits.", 4000);
    m.remove();
  });
}

function openContactModal(l) {
  const m = openModal(html`
    <h3>Message ${escapeHtml(l.poster?.name || "the poster")}</h3>
    <p class="muted" style="font-size:13px; margin-top:0;">Sent through PawTrail relay — your info stays private.</p>
    <textarea id="msg-body" placeholder="Hi — I think I might have seen your ${l.species}…" style="width:100%; min-height:100px; padding:12px; border-radius:9px; border:1.5px solid var(--line); font-family:inherit; font-size:14px; resize:vertical; outline:none;"></textarea>
    <p class="muted" style="font-size:12px; margin-top:6px;">${icon('alert-triangle')} Messages mentioning payment, gift cards, or wire transfers will be flagged and quarantined.</p>
    <div class="actions">
      <button class="btn ghost" data-close>Cancel</button>
      <button class="btn primary" id="msg-send">Send via relay</button>
    </div>
  `);
  m.querySelector("[data-close]").addEventListener("click", () => m.remove());
  m.querySelector("#msg-send").addEventListener("click", () => {
    const body = m.querySelector("#msg-body").value.trim();
    if (!body) { toast("Write a message first."); return; }
    if (/(\$|paypal|venmo|wire|gift card|shipping fee|deposit)/i.test(body)) {
      toast("Message flagged for payment mention — held for review.");
    } else {
      toast("Message sent. The poster will see it shortly.");
    }
    m.remove();
  });
}

function openReportModal(l) {
  const m = openModal(html`
    <h3>Report this listing</h3>
    <p class="muted" style="margin-top:0; font-size:13px;">Reports route to a moderator with a 4-hour SLA.</p>
    <select id="report-reason" style="width:100%; padding:10px; border-radius:9px; border:1.5px solid var(--line); font-size:14px; font-family:inherit;">
      <option>Looks like a scam</option>
      <option>Wrong or outdated information</option>
      <option>Duplicate of another listing</option>
      <option>Stock photo / not real pet</option>
      <option>Inappropriate content</option>
      <option>Other</option>
    </select>
    <textarea id="report-detail" placeholder="Anything else we should know?" style="width:100%; min-height:80px; margin-top:10px; padding:10px; border-radius:9px; border:1.5px solid var(--line); font-family:inherit; font-size:14px; resize:vertical;"></textarea>
    <div class="actions">
      <button class="btn ghost" data-close>Cancel</button>
      <button class="btn primary" id="report-send">Submit report</button>
    </div>
  `);
  m.querySelector("[data-close]").addEventListener("click", () => m.remove());
  m.querySelector("#report-send").addEventListener("click", () => {
    toast("Report submitted. Moderation team will review within 4 hours. Thank you.");
    m.remove();
  });
}

function openFlyer(l) {
  const win = window.open("", "_blank", "width=740,height=960");
  if (!win) { toast("Popup blocked — allow popups for the print dialog."); return; }
  const phone = l.contact === "shelter" ? "Belmont Vet Clinic · (555) 014-2200" : "(555) 014-7788";
  win.document.write(`<!doctype html><html><head><title>${l.type === "lost" ? "LOST" : "FOUND"} — ${l.name || l.species}</title>
  <style>
    @page { size: letter; margin: .45in; }
    body { font-family: system-ui, sans-serif; text-align: center; color: #1f1a14; margin: 0; padding: 20px; }
    .banner { font-size: 100px; font-weight: 900; color: ${l.type === "lost" ? "#d93a2e" : "#2d9b6c"}; line-height: 1; margin: 0 0 10px; }
    .sub { font-size: 28px; font-weight: 700; margin: 0 0 16px; }
    img { max-width: 90%; max-height: 380px; object-fit: cover; border: 4px solid #1f1a14; }
    .desc { font-size: 20px; margin: 14px 0 6px; }
    .phone { font-size: 50px; font-weight: 900; margin: 14px 0; }
    .qr { margin: 12px auto; width: 100px; height: 100px; border: 2px solid #ccc; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #999; }
    .url { font-size: 13px; color: #777; }
  </style></head><body>
  <p class="banner">${l.type === "lost" ? "LOST" : "FOUND"}</p>
  <p class="sub">${l.name || (l.species[0].toUpperCase() + l.species.slice(1))}${l.reward ? " · REWARD $" + l.reward : ""}</p>
  <img src="${l.photo || ""}" alt="" />
  <p class="desc">${[l.breed, l.color, l.size].filter(Boolean).join(" · ")}</p>
  <p class="desc">Near <strong>${l.location || ""}</strong></p>
  <p class="phone">${phone}</p>
  <div class="qr">QR CODE</div>
  <p class="url">${window.location.host || 'pawtrail.app'}/listing/${l.id}</p>
  <script>setTimeout(() => window.print(), 350);</script>
  </body></html>`);
  win.document.close();
}

// ---------- share ----------
function doShare(channel, l) {
  const url = window.location.origin + window.location.pathname + '#/listing/' + l.id;
  const title = `${l.type === "lost" ? "LOST" : "FOUND"}: ${l.name || l.species} near ${l.location || "our neighborhood"}`;
  const text = encodeURIComponent(`${title}. ${l.features ? l.features.slice(0, 90) + "… " : ""}Please share!`);
  const u = encodeURIComponent(url);
  const targets = {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    x: `https://x.com/intent/tweet?text=${text}&url=${u}`,
    whatsapp: `https://wa.me/?text=${text}%20${u}`,
    sms: `sms:?body=${text}%20${u}`,
  };
  if (channel === "copy") { navigator.clipboard?.writeText(url); toast("Link copied to clipboard!"); return; }
  if (channel === "nextdoor") { toast("Opening Nextdoor with pre-filled text…"); return; }
  if (targets[channel]) window.open(targets[channel], "_blank", "noopener,width=600,height=500");
  toast(`Shared to ${channel}!`);
}

// ---------- alerts ----------
function refreshAlertsBadge() {
  const unread = state.alerts.filter(a => !a.read).length;
  const b = $("#alerts-badge");
  if (b) { b.hidden = !unread; b.textContent = unread; }
}

function renderAlerts() {
  const list = $("#alerts-list");
  if (!list) return;
  if (!state.alerts.length) {
    list.innerHTML = `<div class="empty"><div class="emoji">${icon('bell')}</div>No alerts yet. We'll ping you the moment a match comes in.</div>`;
  } else {
    list.innerHTML = state.alerts.map(a => {
      const m = findListing(a.matchId);
      const src = findListing(a.listingId);
      if (!m || !src) return "";
      return html`
        <div class="alert-item">
          <div style="font-weight:600; margin-bottom:4px;">${escapeHtml(a.message)}</div>
          <div style="font-size:13.5px;">${speciesEmoji(src.species)} ${escapeHtml(src.name || src.species)} ↔ ${escapeHtml(m.name || m.species)} — ${escapeHtml(m.location || "")}</div>
          <div class="when">${fmtDate(a.when)}</div>
          <div class="row" style="margin-top:10px;">
            <a class="btn small primary" href="#/listing/${m.id}" data-link>View listing</a>
            <button class="btn small" data-confirm="${a.id}">This is my pet</button>
            <button class="btn small ghost" data-reject="${a.id}">Not a match</button>
          </div>
        </div>
      `;
    }).join("");
  }
  state.alerts.forEach(a => a.read = true);
  saveState();
  refreshAlertsBadge();
  $$("#alerts-list [data-link]").forEach(el => el.addEventListener("click", () => closeDrawer("alerts-drawer")));
  $$("[data-confirm]").forEach(b => b.addEventListener("click", () => { toast("Confirmed match — the finder has been notified."); removeAlert(b.dataset.confirm); }));
  $$("[data-reject]").forEach(b => b.addEventListener("click", () => { toast("Not a match. Thanks — that trains the algorithm."); removeAlert(b.dataset.reject); }));
}

function removeAlert(id) {
  state.alerts = state.alerts.filter(a => a.id !== id);
  saveState();
  renderAlerts();
}

// ---------- assistant ----------
const GREETING = `Hi — I'm here to help. I can:\n• Walk you through reporting a lost or found pet\n• Tell you what to do in the next 30 minutes\n• Help you spot scam messages\n• Point you to the right guide\n\nWhat's going on?`;

function botReply(q) {
  const lq = q.toLowerCase();
  if (/(scam|extort|money|gift card|venmo|paypal|shipping fee|send.*pay)/.test(lq)) return {
    text: `That's a scam. Real finders never ask for money before reunion. Three things:\n\n1. Don't send anything. No exceptions.\n2. Ask for a fresh photo of a specific feature you didn't post.\n3. Meet only in public — vet office, police parking lot — with a friend.`,
    links: [{ href: "#/advice/scams", text: "Full scam guide →" }],
  };
  if (/(injur|hurt|bleed|emergenc|hit by)/.test(lq)) return {
    text: `For an injured animal:\n• Approach low, slow, sideways. Gloves on.\n• Laundry basket or cardboard box to transport small animals.\n• Nearest emergency vet — they'll treat and bill the owner later.\n• Do NOT give Tylenol or ibuprofen — deadly to cats and dogs.\n\nPoison emergency: ASPCA 1-888-426-4435 (24/7)`,
    links: [{ href: "#/advice/injured", text: "Full injured-animal guide →" }, { href: "#/help", text: "All emergency numbers →" }],
  };
  if (/(lost|missing|ran away|escaped|gone).*(dog|cat|pet|puppy|kitten)|just lost|my dog|my cat/.test(lq)) return {
    text: `I'm sorry. Here's what matters most in the next 30 minutes:\n\n1. Walk the area calmly — don't run or yell.\n2. If it's a cat: check inside your house first. 70% of "lost" indoor cats are still inside.\n3. Post a Lost listing — matching starts in seconds.\n4. Tell every neighbor in person.`,
    links: [{ href: "#/lost", text: "Report a lost pet →" }, { href: "#/advice/first-24-hours", text: "First 24 hours checklist →" }],
  };
  if (/(found|stray|in my yard|wandering)/.test(lq)) return {
    text: `Thank you for helping.\n\n1. If they have a tag, call the number.\n2. Post a Found listing — 90 seconds, no account. Owner may have a Lost listing already.\n3. Get them scanned for a chip at any vet — free, 30 seconds.\n4. You don't have to take them to a shelter.`,
    links: [{ href: "#/found", text: "Report a found pet →" }, { href: "#/advice/found-pet", text: "Full found-pet guide →" }],
  };
  if (/(cat|kitty).*(hide|hiding|search|find)|how.*find.*cat/.test(lq)) return {
    text: `Cats hide. They almost always stay within 3–5 houses, frozen and silent.\n\n• Search at NIGHT with a flashlight — look for eye-shine low to the ground.\n• Ask neighbors to check sheds and crawlspaces.\n• Leave litter box and worn clothing outside at dusk.\n• Set a humane trap after 48 hours.`,
    links: [{ href: "#/advice/search-strategy", text: "Cats vs. dogs search guide →" }],
  };
  if (/(dog|puppy).*(search|find|running)/.test(lq)) return {
    text: `Dogs travel. A scared dog can cover 5–10 miles in a straight line.\n\n• Drive slowly with windows down, calling calmly.\n• Rotisserie chicken or hot dogs dropped along the route.\n• If you spot them: sit down, look small, toss food. Do NOT chase.\n• Mail carriers and delivery drivers cover huge ground — hand them flyers.`,
    links: [{ href: "#/advice/search-strategy", text: "Search strategy guide →" }],
  };
  if (/(flyer|poster|print)/.test(lq)) return {
    text: `A flyer a passing driver actually reads:\n\n1. One word huge: LOST or REWARD\n2. One big color photo\n3. Brief description\n4. One phone number — biggest font possible\n5. QR code to your listing (auto-generated from any listing page)`,
    links: [{ href: "#/advice/flyers", text: "Full flyer guide →" }],
  };
  if (/(chip|microchip|registry)/.test(lq)) return {
    text: `Call your chip registry and mark as "lost":\n• HomeAgain: 1-888-466-3242\n• AKC Reunite: 1-800-252-7894\n• 24PetWatch: 1-866-597-2424\n\nIf you found a pet, any vet will scan for free in 30 seconds.`,
    links: [{ href: "#/help", text: "All helpline numbers →" }],
  };
  if (/(shelter|vet|animal control)/.test(lq)) return {
    text: `Go in person — shelter websites are often a week out of date. Ask:\n• "May I come look in person?" — they routinely mis-tag breed, color, sex.\n• "How long is the stray hold?" (sometimes only 72 hours).\n\nCall all shelters within 25 miles, not just the closest one.`,
    links: [{ href: "#/advice/shelters", text: "Working with shelters guide →" }],
  };
  if (/(thank|thanks|great|helpful)/.test(lq)) return {
    text: "You're welcome. Searching is exhausting — you're doing the right things. I'm here whenever you need to think something through.",
  };
  if (/^(hi|hello|hey|hiya)\b/.test(lq) || lq.length < 5) return { text: GREETING };
  return {
    text: `I can help with:\n• What to do right now (lost or found)\n• Search tactics for cats vs. dogs\n• Scam-message warning signs\n• Making an effective flyer\n• Microchip lookups\n• Emotional support during a long search\n\nWhat's happening?`,
    links: [{ href: "#/tips", text: "Quick tips →" }, { href: "#/advice", text: "Advice center →" }],
  };
}

function appendChat(role, text, links) {
  const log = $("#chat-log");
  if (!log) return;
  const wrap = document.createElement("div");
  wrap.className = "bubble " + role;
  wrap.textContent = text;
  if (links?.length) {
    const lw = document.createElement("div");
    lw.className = "links";
    links.forEach(l => {
      const a = document.createElement("a");
      a.href = l.href;
      a.textContent = l.text;
      a.dataset.link = "true";
      a.addEventListener("click", () => closeDrawer("assistant-drawer"));
      lw.appendChild(a);
    });
    wrap.appendChild(lw);
  }
  log.appendChild(wrap);
  log.scrollTop = log.scrollHeight;
}

// ---------- link binder ----------
function bindLinks() {
  $$("a[data-link]").forEach(a => {
    if (a._bound) return;
    a._bound = true;
    a.addEventListener("click", e => {
      const href = a.getAttribute("href");
      if (href?.startsWith("#")) {
        e.preventDefault();
        closeDrawer("assistant-drawer");
        closeDrawer("alerts-drawer");
        navigate(href);
        highlightNav();
      }
    });
  });
}

// ---------- mobile nav ----------
function openMobileNav() {
  const nav = document.getElementById("mobile-nav");
  const overlay = document.getElementById("mobile-nav-overlay");
  if (nav) {
    nav.hidden = false;
    nav.setAttribute("aria-hidden", "false");
    nav.classList.add("open");
  }
  if (overlay) {
    overlay.hidden = false;
    overlay.classList.add("open");
  }
  document.getElementById("hamburger")?.setAttribute("aria-expanded", "true");
}
function closeMobileNav() {
  const nav = document.getElementById("mobile-nav");
  const overlay = document.getElementById("mobile-nav-overlay");
  nav?.classList.remove("open");
  overlay?.classList.remove("open");
  if (nav) {
    nav.hidden = true;
    nav.setAttribute("aria-hidden", "true");
  }
  if (overlay) overlay.hidden = true;
  document.getElementById("hamburger")?.setAttribute("aria-expanded", "false");
}

// ---------- init ----------
function init() {
  loadState();
  // Bring the AI engine (ai-engine.js) online before any interaction so it can
  // wire its matching / assistant / abuse-defence brain over the app surface.
  try { window.PawTrailAI?.init?.(); } catch (e) { /* engine optional */ }
  getIpLocation();          // pre-warm so location is cached before user visits Global
  hydrateRemoteListings();
  hydrateRemoteCommunityPosts();
  hydrateGlobalListings();
  applyDarkMode();
  initTipBar();
  updateBodyPad();
  updateAuthUI();
  checkExpiredListings();
  refreshAlertsBadge();
  routeRender(location.hash || "#/");
  highlightNav();

  // Mobile nav
  $("#hamburger")?.addEventListener("click", openMobileNav);
  $("#mobile-nav-close")?.addEventListener("click", closeMobileNav);
  $("#mobile-nav-overlay")?.addEventListener("click", closeMobileNav);
  $$(".mobile-nav-link").forEach(a => a.addEventListener("click", closeMobileNav));

  // Single document-level delegation handles ALL close/dismiss buttons reliably,
  // regardless of render order, hidden attributes, or z-index stacking.
  document.addEventListener("click", e => {
    const t = e.target;
    if (t.closest("#assistant-close"))       { e.preventDefault(); closeDrawer("assistant-drawer"); return; }
    if (t.closest("#alerts-close"))          { e.preventDefault(); closeDrawer("alerts-drawer");    return; }
    if (t.closest("#mobile-nav-close"))      { e.preventDefault(); closeMobileNav();                return; }
    if (t.closest("#mobile-nav-overlay"))    { e.preventDefault(); closeMobileNav();                return; }
    if (t.closest("#drawer-overlay"))        { e.preventDefault(); closeDrawer();                   return; }
  });

  // ESC key
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { closeDrawer(); closeMobileNav(); }
  });

  // Assistant FAB
  $("#assistant-fab").addEventListener("click", () => {
    toggleDrawer("assistant-drawer");
    if (document.getElementById("assistant-drawer")?.classList.contains("open") && !$("#chat-log")?.children.length) {
      appendChat("bot", GREETING);
    }
  });
  $("#chat-form").addEventListener("submit", e => {
    e.preventDefault();
    const inp = $("#chat-input");
    const v = inp.value.trim();
    if (!v) return;
    appendChat("user", v);
    inp.value = "";
    setTimeout(() => { const r = botReply(v); appendChat("bot", r.text, r.links); }, 300);
  });
  $$(".quick-chip").forEach(b => {
    b.addEventListener("click", () => {
      const q = b.dataset.q;
      appendChat("user", q);
      setTimeout(() => { const r = botReply(q); appendChat("bot", r.text, r.links); }, 300);
    });
  });
  $("#chat-escalate").addEventListener("click", () => {
    appendChat("bot", "Got it. I've added you to the volunteer-callback queue. A real person will call you back within 1 hour during staffed hours (9am–9pm local).\n\nFor an immediate poison emergency: ASPCA 1-888-426-4435 (24/7).");
  });

  // Alerts
  $("#alerts-btn").addEventListener("click", () => {
    toggleDrawer("alerts-drawer");
    if (document.getElementById("alerts-drawer")?.classList.contains("open")) renderAlerts();
  });
}

document.addEventListener("DOMContentLoaded", init);
window.addEventListener("resize", updateBodyPad);

// Dark mode helpers (called before features.js load)
function applyDarkMode() {
  document.documentElement.setAttribute("data-theme", state.settings?.darkMode ? "dark" : "light");
}
function checkExpiredListings() {
  const NINETY_DAYS = 90 * 86400000;
  state.listings.forEach(l => {
    if (l.status === "active" && Date.now() - new Date(l.posted) > NINETY_DAYS) {
      l.status = "expired";
    }
  });
  saveState();
}
