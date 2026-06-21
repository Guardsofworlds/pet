# 🐾 PawTrail

Reunite lost pets, fast. A free, no-account, installable (PWA) web app for reporting
lost & found pets, getting instant matches, and reaching neighbors. It runs on a shared
**Supabase** server so a pet reported on one device can be found by anyone, anywhere —
with a localStorage fallback so it still runs for local development without a backend.

This is a **static front-end** (plain HTML/CSS/JS — no build step) backed by an optional
**Supabase** project for shared data and abuse protection.

---

## Local fallback (development, no backend)

This is the fallback mode, not how it's meant to ship. Open `index.html` with no
Supabase configured and everything runs against `localStorage`:

- Report lost/found pets, browse, match, bookmark, share, flyers, assistant, etc.
- Community board posting (local to that browser only).
- Calm generative ambient **soundtrack** (🔈 toggle in the header / mobile menu) —
  synthesised in-browser via the Web Audio API, so there's no audio file to ship.
  On by default; starts on the visitor's first click/tap/scroll (browsers block
  audible autoplay until then). Toggle off anytime from the header or settings.

Without Supabase configured, data **never leaves the device**.

## What Supabase adds

- **Shared listings** across all visitors (`listings` table).
- **Shared community board** across all visitors (`community_posts` table).
- **Automated abuse protection** (edge functions): per-IP rate limits + auto-suspension.
  - Listings: **10 per IP / 30 days** (`listing-guard`).
  - Community posts: **20 per IP / day** (`post-guard`).
- Optional global shelter listings via Petfinder (`fetch-global-listings`).

---

## Deploy in 4 steps

### 1. Create the database

In your Supabase project → **SQL Editor**, run [`supabase-schema.sql`](supabase-schema.sql).
It is idempotent (`create … if not exists`), so re-running is safe.

This creates: `listings`, `community_posts`, `listing_submissions`, `post_submissions`,
`moderation_subjects`, `moderation_actions`, all RLS policies, and the auto-moderation trigger.

### 2. Deploy the edge functions (the "automated admin")

Install the [Supabase CLI](https://supabase.com/docs/guides/cli), then:

```bash
supabase functions deploy listing-guard
supabase functions deploy post-guard
# (optional) supabase functions deploy fetch-global-listings

# Set the IP-hash salt so IPs are never stored in the clear:
supabase secrets set PAWTRAIL_IP_HASH_SALT="$(openssl rand -hex 16)"
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into functions automatically.

### 3. Add your public credentials

In [`index.html`](index.html), fill in the **anon/public** key (never the service-role key):

```js
window.PAWTRAIL_SUPABASE = {
  url: "https://YOUR-PROJECT.supabase.co",
  anonKey: "eyJhbGc..."            // Settings → API → anon public
};
```

(Alternatively a user can set `pawtrail.supabase.url` / `pawtrail.supabase.anonKey`
in `localStorage` without editing the file.)

### 4. Host the static files

Any static host works — deploy the repo root as-is:

- **Netlify / Vercel / Cloudflare Pages:** drag-and-drop or connect the repo. No build command; publish directory = repo root.
- **GitHub Pages:** push and enable Pages on the branch.
- **Any web server:** serve the folder over HTTPS (required for the service worker / PWA install).

---

## Rate limiting / "automated admin"

The community board is protected on two layers:

| Layer | Where | Limit | Behaviour when exceeded |
|-------|-------|-------|-------------------------|
| Server (authoritative) | `supabase/functions/post-guard` | 20 posts / IP / day | Records an `auto_limit` moderation action (auto-suspends the IP via DB trigger) and returns HTTP 429. |
| Client (fallback) | `localPostPolicy()` in `app.js` | 20 posts / browser / day | Blocks with a toast — used only when Supabase isn't configured. |

To change the limit, edit `LIMIT` in `supabase/functions/post-guard/index.ts` **and**
`POST_DAILY_LIMIT` in `app.js`, then redeploy the function.

Manual moderation: insert a row into `moderation_actions`
(`action = 'ban' | 'suspend' | 'clear'`, `subject = <ip_hash>`) — the trigger updates
`moderation_subjects`, and the guard functions honour it on the next request.

---

## Project layout

```
index.html              App shell + Supabase/Petfinder config
styles.css              All styling (light + dark themes)
app.js                  Router, state, localStorage, rendering, rate-limit fallback
features.js             PWA, search, shortcuts, shelter intake, moderation UI
data.js                 Seed/reference data (shelters, tips, articles) — demo posts cleared
supabase-client.js      Browser bridge to Supabase REST + edge functions
supabase-schema.sql     Full database schema + RLS + triggers
supabase/functions/     Edge functions (listing-guard, post-guard, …)
sw.js / manifest.json   PWA offline shell + install metadata
```

> **Note:** Homepage testimonials and the reunion ticker in `data.js`
> (`TESTIMONIALS`, `RECENT_REUNIONS`) are illustrative sample content. Replace them
> with real stories before promoting the site as live, or clear them for a blank slate.
