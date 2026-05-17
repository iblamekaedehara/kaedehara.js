/**
 * Normalize game names for consistent cross-provider searching.
 *
 * Transforms display names like "Wuthering Waves™", "Wuthering Waves",
 * or "WutheringWaves" into the canonical slug "wuthering-waves".
 *
 * Rules:
 * - lowercase
 * - strip trademark/copyright symbols (™, ®, ©)
 * - strip special edition suffixes (editions, bundles)
 * - replace whitespace/punctuation runs with single hyphens
 * - collapse consecutive hyphens
 * - trim leading/trailing hyphens
 */

const STRIP_PATTERNS = [
  /[™®©]/g,
  /\b(GOTY|Game of the Year|Definitive|Ultimate|Deluxe|Collector's|Special|Enhanced|Anniversary|Remastered|Remaster)\s*Edition\b/gi,
  /\bEdition\b/gi,
  /\bBundle\b/gi,
  /\bPack\b/gi,
  /['']/g,
];

export function normalizeGameName(raw: string): string {
  let s = raw.trim();

  for (const pattern of STRIP_PATTERNS) {
    s = s.replace(pattern, "");
  }

  s = s
    .toLowerCase()
    .replace(/[:\-\–—_.+&()[\]]+/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return s || raw.toLowerCase().replace(/\s+/g, "-");
}

/**
 * Generate search variations for fuzzy matching across providers.
 */
export function getSearchVariants(raw: string): string[] {
  const normalized = normalizeGameName(raw);
  const base = raw.trim();
  const lower = base.toLowerCase();

  return [...new Set([lower, normalized, base])];
}