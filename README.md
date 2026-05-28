# kaedehara v2

realtime identity & presence hub — complete CSS overhaul + backend rewrite.

displays discord rich presence, steam game activity, and anilist watching history — all served from an ssr astro app deployed on vercel.

## what it does

- **discord presence** — live via lanyard websocket. shows avatar, online/idle/dnd status, spotify playback, and rich presence cards with elapsed timers. activity icons resolved server-side via steamgriddb.
- **steam activity** — recently played games pulled from the steam web api. capped at 3 titles with playtime and last-session indicators. hero banners from steamgriddb with steam cdn fallback.
- **anilist activity** — currently watching + recent list activity from the anilist graphql api. cached server-side with stale-while-revalidate semantics.

## what's new in v2

- **complete tailwindcss v4 design overhaul** — custom css variables, skeleton loading states, refined card shells, improved typography
- **steamgriddb media pipeline** — server-side image resolution for presence icons and steam heroes. no more frontend fetch orchestration, no race conditions, no image flash
- **atomic presence image resolution** — a single `POST /api/presence-activities` endpoint resolves all activity icons in one request. a monotonic generation counter discards stale responses so activity/image pairs never desync
- **steam cdn simplification** — deterministic url construction with zero network probing. no `validateImage` fetches, no sequential http validation
- **leaner codebase** — removed unused provider functions (`fetchGrids`, `fetchLogos`), dead type contracts (`LogoMedia`), pointless shims (`artwork-resolver.ts`), and runtime `onerror` image mutation handlers
- **sgdb endpoint fixes** — correct autocomplete search, client-side mime filtering (accept png/jpeg/webp, reject ico), negative-result caching with 1h ttl to prevent hammering

## stack

- [astro](https://astro.build) (ssr mode, vercel adapter)
- [svelte 5](https://svelte.dev) (islands for interactive presence widgets)
- [tailwindcss 4](https://tailwindcss.com) (utility-first styling with custom theme tokens)
- [valibot](https://valibot.dev) (runtime schema validation for websocket payloads)

## getting started

```
git clone https://github.com/iblamekaedehara/kaedehara-js.git
cd kaedehara-js
pnpm install
```

copy the env template and fill in your keys:

```
cp .env.example .env
```

| variable | purpose |
|---|---|
| `STEAM_WEB_API` | steam web api key (for owned games) |
| `STEAM_USER_ID` | steam 64-bit id to query |
| `STEAM_GRID_API_KEY` | steamgriddb api key (for game icons and hero banners) |

anilist and discord ids are hardcoded in `src/lib/constants.ts` — change them to your own.

## development

```
pnpm dev
```

runs astro dev server with hot reload. presence websocket connects client-side — works in local dev. steamgriddb api calls happen during ssr and via the presence-activities api route.

## deploy

this repo is wired for one-click vercel deployment:

```
vercel deploy
```

- `vercel.json` sets framework to astro, build/install commands to pnpm
- `astro.config.mjs` uses `output: "server"` with the vercel adapter
- the `.env.example` variables need to be set in vercel project settings under environment variables
- no build output directories or archives are committed — `.gitignore` excludes `.astro`, `.vercel`, `dist`, `node_modules`, and archive files

## project structure

```
src/
  components/
    AniList/               # ssr astro components for anilist activity
    Presence/              # svelte islands — lanyard websocket, avatar, presence cards
      PresenceSection.svelte  # hydration root — transport, avatar, status, activity cards
      PresenceCard.svelte     # single activity card — image, verb, name, details, timer
    Spotify/               # spotify playback card (svelte)
    Steam/                 # ssr astro components for steam activity
      SteamCard.astro         # hero banner + metadata card
  layouts/
    BaseLayout.astro       # html shell, meta tags, favicon
  lib/
    anilist.ts             # anilist graphql fetcher + server-side cache
    constants.ts           # discord id, steam id, anilist username, social links
    image-fallback.ts      # discord cdn avatar url builder
    normalize-name.ts      # game name normalization (cache keys, not sgdb queries)
    steam.ts               # steam web api fetcher + per-entry ttl cache
    types.ts               # shared ts interfaces
    live/
      stores/
        clock.ts           # shared 1s interval — powers elapsed timers
      transport/
        leader-election.ts    # broadcastchannel-based tab election
        presence-transport.ts # lanyard wss singleton, stale degradation, state sync, ipresencetransport
    media/
      cache.ts                # generic cache with ttl, max-size eviction, deduplication
      contracts.ts            # semantic media types (activity-icon, steam-hero)
      index.ts                # barrel export
      providers/
        sgdb.ts               # steamgriddb provider — search, icons, heroes
        steam-cdn.ts          # steam cdn deterministic url construction
      resolvers/
        resolve-activity-icon.ts  # presence card icons (sgdb → placeholder)
        resolve-steam-hero.ts     # steam activity heroes (sgdb → steam cdn)
    schemas/
      lanyard.ts            # valibot schemas for lanyard payload validation
  pages/
    index.astro             # homepage — assembles all sections
    api/
      anilist.ts            # api proxy for anilist (cache-friendly endpoint)
      game-image.ts         # api proxy for steam game images
      presence-activities.ts   # server-side activity icon resolution (post endpoint)
      steam.ts              # api proxy for steam (cache-friendly endpoint)
  styles/
    global.css              # tailwind theme tokens, base styles, skeleton/fade utilities
public/
  assets/                   # static icons, fallback svgs, banner, profile image
```

## how it works

### presence transport

`presence-transport.ts` opens a singleton websocket to `wss://api.lanyard.rest/socket`. it:

- sends `op:2` (subscribe) after `op:1` (hello) — correct lanyard protocol order
- treats `init_state` as a full replace and `presence_update` as a partial merge
- uses broadcastchannel to sync state across same-origin tabs
- uses leader election so only one tab holds the websocket
- degrades stale state in two stages: soft-stale at 2 minutes, hard-stale at 10 minutes
- persists last-known state to sessionstorage for instant paint on reload
- implements `ipresencetransport` with a proper noop fallback for ssr

### presence image resolution

when a presence update arrives, `presencesection.svelte` sends the raw activity list to `POST /api/presence-activities`. the server resolves sgdb icons for all game-type activities in a single atomic operation and returns a finalized array with `imageurl` already populated. a monotonic generation counter discards any response that arrives after a newer resolution has already completed — no stale image/activity pairs.

### steam image resolution

`steamcard.astro` renders hero banners. `resolve-steam-hero.ts` first tries steamgriddb heroes, then falls back to a deterministic steam cdn url (`library_hero.jpg`). no network probing — the cdn url is constructed and returned synchronously. the hero container uses `aspect-ratio: 3/1` for proper landscape rendering.

### sgdb provider

all sgdb api calls use bare endpoints with no query parameters — client-side filtering by mime type selects the best renderable asset. ico files (which browsers can't render) are rejected. null results are cached for 1 hour to prevent repeated failed requests.

### elapsed timers

`sharedclock` in `clock.ts` runs a single 1-second interval for the entire page. spotify progress bars and presence card "elapsed" displays both subscribe to it instead of running their own intervals.

### skeleton loading

on first load (before the websocket connects), the presence section shows a skeleton card with pulse animations instead of a blank gap. once the transport connects and activities resolve, the skeleton is replaced with real cards.

## license

wtfpl