import type { APIRoute } from "astro";
import { resolveArtworkByName, resolveBestArtworkUrl } from "../../lib/artwork-resolver";

function json(body: unknown, status: number, cacheControl?: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(cacheControl ? { "Cache-Control": cacheControl } : {}),
    },
  });
}

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const name = url.searchParams.get("name")?.trim();
  const appidStr = url.searchParams.get("appid");
  const appid = appidStr ? parseInt(appidStr, 10) : null;

  if (!name) return json({ url: null }, 400);

  // Use the unified resolver — it handles caching internally
  let resolvedUrl: string | null = null;

  if (appid && appid > 0) {
    resolvedUrl = await resolveBestArtworkUrl(appid, name);
  } else {
    resolvedUrl = await resolveArtworkByName(name);
  }

  return json({ url: resolvedUrl }, 200, "public, s-maxage=86400");
};