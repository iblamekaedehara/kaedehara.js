# kaedehara

realtime identity & presence hub.

displays discord rich presence, steam game activity, and anilist watching history — all served from an ssr astro app deployed on vercel.

## what it does

- **discord presence** — live via lanyard websocket. shows avatar, online/idle/dnd status, spotify playback, and rich presence cards with elapsed timers
- **steam activity** — recently played games pulled from the steam web api. capped at 3 titles with playtime and last-session indicators
- **anilist activity** — currently watching + recent list activity from the anilist graphql api. cached server-side with stale-while-revalidate semantics

## stack

- [astro](https://astro.build) (ssr mode, vercel adapter)
- [svelte 5](https://svelte.dev) (islands for interactive presence widgets)
- [tailwindcss 4](https://tailwindcss.com) (utility-first styling)
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
| `STEAM_WEB_API` | steam web api key |
| `STEAM_USER_ID` | steam 64-bit id to query |

anilist and discord ids are hardcoded in `src/lib/constants.ts` — change them to your own.

## development

```
pnpm dev
```

runs astro dev server with hot reload. presence websocket connects client-side — works in local dev.

## deploy

this repo is wired for one-click vercel deployment:

```
vercel deploy
```

- `vercel.json` sets framework to astro, build/install commands to pnpm
- `astro.config.mjs` uses `output: "server"` with the vercel adapter
- the `.env.example` variables need to be set in vercel project settings

no build output directories are committed — `.gitignore` excludes `.astro`, `.vercel`, `dist`, and `node_modules`.

## project structure

```
src/
  components/
    AniList/          # ssr astro components for anilist activity
    Presence/         # svelte islands — lanyard websocket, avatar, presence cards
    Spotify/          # spotify playback card (svelte)
    Steam/            # ssr astro components for steam activity
  layouts/
    BaseLayout.astro  # html shell, meta tags, favicon
  lib/
    anilist.ts        # anilist graphql fetcher + server-side cache
    constants.ts      # discord id, steam id, anilist username, social links
    image-fallback.ts # discord cdn asset url builder
    steam.ts          # steam web api fetcher + server-side cache
    types.ts          # shared ts interfaces
    live/
      stores/
        clock.ts      # shared 1s interval — powers elapsed timers
      transport/
        leader-election.ts    # broadcastchannel-based tab election
        presence-transport.ts # lanyard wss singleton, stale degradation, state sync
    media/
      activity-icons.ts  # category-aware activity fallback icons
    schemas/
      lanyard.ts     # valibot schemas for lanyard payload validation
  pages/
    index.astro      # homepage — assembles all sections
    api/
      anilist.ts     # api proxy for anilist (cache-friendly endpoint)
      steam.ts       # api proxy for steam (cache-friendly endpoint)
  styles/
    global.css       # tailwind theme tokens, base styles, skeleton/fade utilities
public/
  assets/            # static icons, fallback svgs, profile image
```

## how it works

### presence transport

`presence-transport.ts` opens a singleton websocket to `wss://api.lanyard.rest/socket`. it:

- sends `op:2` (subscribe) after `op:1` (hello) — correct lanyard protocol order
- treats every payload as an **authoritative snapshot** — local state is replaced, not merged
- uses broadcastchannel to sync state across same-origin tabs
- uses leader election so only one tab holds the websocket
- degrades stale state in two stages: soft-stale at 2 minutes, hard-stale at 10 minutes
- persists last-known state to sessionstorage for instant paint on reload

### steam & anilist

both fetch server-side during ssr. results are cached in-memory with configurable ttls. api routes under `/api/` expose the same data for programmatic access. the anilist route is cached at vercel's edge with `stale-while-revalidate`.

### elapsed timers

`sharedClock` in `clock.ts` runs a single 1-second interval for the entire page. spotify progress bars and presence card "elapsed" displays both subscribe to it instead of running their own intervals.

## license

wtfpl