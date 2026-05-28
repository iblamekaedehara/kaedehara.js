import type { APIRoute } from "astro";
import { resolveActivityIcon, resolveSteamHero } from "../../lib/media";

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
  const mode = url.searchParams.get("mode");

  if (!name) return json({ url: null }, 400);

  // Presence cards: SGDB icons tab (square PNGs)
  if (mode === "icon") {
    const media = await resolveActivityIcon(name);
    return json({ url: media.url }, 200, "public, s-maxage=86400");
  }

  // Steam activity: SGDB heroes → Steam CDN
  const heroAppid = appid && appid > 0 ? appid : 0;
  const media = await resolveSteamHero(heroAppid, name);
  return json({ url: media.url }, 200, "public, s-maxage=86400");
};