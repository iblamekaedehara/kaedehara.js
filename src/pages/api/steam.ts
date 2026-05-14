import type { APIRoute } from "astro";
import { fetchSteamData } from "../../lib/steam";

export const GET: APIRoute = async () => {
  try {
    const data = await fetchSteamData();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("Steam API error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch Steam data" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
};