import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";
import svelte from "@astrojs/svelte";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  output: "server",
  adapter: vercel({
    imageService: false,
    devMode: false,
  }),
  integrations: [svelte()],
  vite: {
    plugins: [tailwindcss()],
  },
});