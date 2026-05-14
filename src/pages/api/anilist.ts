import type { APIRoute } from "astro";
import { fetchAniListSnapshot } from "../../lib/anilist";

export const GET: APIRoute = async () => {
  try {
    const data = await fetchAniListSnapshot();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("AniList API error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch AniList data" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
};