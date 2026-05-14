/**
 * Shared AniList data fetching — used by the API route and SSR components.
 * AniList activity does NOT require freshness. Heavy CDN caching is appropriate.
 */

import { ANILIST_USERNAME } from "./constants";

const ANILIST_API = "https://graphql.anilist.co";
const FETCH_TIMEOUT_MS = 5000;

const CURRENTLY_WATCHING_QUERY = `
query CurrentWatching($name: String) {
  MediaListCollection(userName: $name, type: ANIME, status: CURRENT) {
    lists { entries { media { id title { romaji english } } } }
  }
}`;

const USER_ID_QUERY = `
query AniListUserId($name: String) { User(name: $name) { id } }`;

const RECENT_ACTIVITY_QUERY = `
query RecentAnimeActivity($id: Int) {
  Page(page: 1, perPage: 10) {
    activities(userId: $id, type: MEDIA_LIST, sort: ID_DESC) {
      ... on ListActivity { id progress status createdAt media { id title { romaji english } } }
    }
  }
}`;

const RECENT_LIST_FALLBACK_QUERY = `
query RecentAnimeListUpdates($name: String) {
  MediaListCollection(userName: $name, type: ANIME) {
    lists { entries { id progress status updatedAt media { id title { romaji english } } } }
  }
}`;

export interface RecentlyWatchingEntry {
  title: string | null;
}

export interface RecentActivityEntry {
  id: number;
  title: string;
  progress: string;
  label: string;
  createdAt: number;
}

export interface AniListSnapshot {
  currentlyWatching: string | null;
  recentActivity: RecentActivityEntry[];
}

async function anilistGraphql<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
  try {
    const response = await fetch(ANILIST_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const json = await response.json();
    if (json.errors) return null;
    return json.data as T;
  } catch {
    return null;
  }
}

let _anilistCache: { data: AniListSnapshot; ts: number } | null = null;
const ANILIST_CACHE_TTL_MS = 1800_000; // 30 minutes

export async function fetchAniListSnapshot(): Promise<AniListSnapshot> {
  if (_anilistCache && Date.now() - _anilistCache.ts < ANILIST_CACHE_TTL_MS) return _anilistCache.data;

  const [watchingData, userIdData] = await Promise.all([
    anilistGraphql<{
      MediaListCollection?: { lists?: Array<{ entries?: Array<{ media?: { title?: { romaji?: string; english?: string } } }> }> };
    }>(CURRENTLY_WATCHING_QUERY, { name: ANILIST_USERNAME }),
    anilistGraphql<{ User?: { id?: number } }>(USER_ID_QUERY, { name: ANILIST_USERNAME }),
  ]);

  const currentlyWatchingTitles: string[] = [];
  if (watchingData?.MediaListCollection?.lists) {
    for (const list of watchingData.MediaListCollection.lists) {
      for (const entry of list.entries || []) {
        const t = entry.media?.title?.english || entry.media?.title?.romaji;
        if (t) currentlyWatchingTitles.push(t);
      }
    }
  }

  const userId = userIdData?.User?.id;

  // Fetch activity; only fetch fallback if activity fails
  let activityData = userId
    ? await anilistGraphql<{
        Page?: { activities?: Array<{ id: number; progress?: string; status?: string; createdAt?: number; media?: { title?: { romaji?: string; english?: string } } }> };
      }>(RECENT_ACTIVITY_QUERY, { id: userId })
    : null;

  const recentActivity: RecentActivityEntry[] = [];

  if (activityData?.Page?.activities) {
    for (const entry of activityData.Page.activities) {
      if (!entry.media?.title) continue;
      const title = entry.media.title.english || entry.media.title.romaji || "Unknown";
      recentActivity.push({
        id: entry.id,
        title,
        progress: String(entry.progress || entry.status || "updated").toLowerCase(),
        label: activityLabel(title, entry.progress, entry.status),
        createdAt: entry.createdAt ?? 0,
      });
    }
  } else {
    // Fallback: fetch from list updates
    const fallbackData = await anilistGraphql<{
      MediaListCollection?: { lists?: Array<{ entries?: Array<{ id: number; progress?: number; status?: string; updatedAt?: number; media?: { title?: { romaji?: string; english?: string } } }> }> };
    }>(RECENT_LIST_FALLBACK_QUERY, { name: ANILIST_USERNAME });

    if (fallbackData?.MediaListCollection?.lists) {
      const seen = new Set(recentActivity.map((a) => a.id));
      for (const list of fallbackData.MediaListCollection.lists) {
        for (const entry of list.entries || []) {
          if (!entry.id || seen.has(entry.id) || !entry.media?.title) continue;
          const title = entry.media.title.english || entry.media.title.romaji || "Unknown";
          seen.add(entry.id);
          recentActivity.push({
            id: entry.id,
            title,
            progress: entry.progress ? `episode ${entry.progress}` : String(entry.status || "updated").toLowerCase(),
            label: listUpdateLabel(title, entry.progress, entry.status),
            createdAt: entry.updatedAt ?? 0,
          });
        }
      }
    }
  }

  // Filter zero-timestamp and sort
  recentActivity.sort((a, b) => b.createdAt - a.createdAt);

  return {
    currentlyWatching: currentlyWatchingTitles[0] ?? null,
    recentActivity: recentActivity.slice(0, 3),
  };
}

// ── Label formatters ─────────────────────────────────────────────────────

function sentenceCase(value: string) {
  const normalized = value.toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function activityLabel(title: string, progress?: string, status?: string) {
  if (status?.toLowerCase() === "completed") return `Completed ${title}`;
  if (progress) return `Watched episode ${progress} of ${title}`;
  return `${sentenceCase(status || "Updated")} ${title}`;
}

function listUpdateLabel(title: string, progress?: number, status?: string) {
  if (status === "COMPLETED") return `Completed ${title}`;
  if (progress && progress > 0) return `Watched episode ${progress} of ${title}`;
  return `${sentenceCase(String(status || "updated").replaceAll("_", " "))} ${title}`;
}