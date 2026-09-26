// Offline fallback for skill-request matching. The backend registry is authoritative
// (backend/shura/registry.py); this keeps the same rules for exact and core-term matches.

const STOPWORDS = new Set([
  'learn', 'learning', 'i', 'want', 'to', 'how', 'the', 'a', 'an', 'basics', 'basic', 'intro',
  'introduction', 'programming', 'language', 'for', 'and', 'of', 'in', 'with', 'course', 'skills', 'skill',
]);

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

function core(text: string): string {
  return normalize(text)
    .split(' ')
    .filter((w) => w && !STOPWORDS.has(w))
    .join(' ');
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Returns the id of the best matching pack, or null. */
export function matchPack(request: string, aliases: Record<string, string[]>): string | null {
  const q = normalize(request);
  const qc = core(request);
  if (!q) return null;
  let best: { id: string; score: number } | null = null;
  for (const [id, names] of Object.entries(aliases)) {
    for (const name of names) {
      const n = normalize(name);
      let score = 0;
      if (n === q) score = 1;
      else if (qc && (qc === core(name) || new RegExp(`\\b${escape(n)}\\b`).test(q))) score = 0.95;
      if (!best || score > best.score) best = { id, score };
    }
  }
  return best && best.score >= 0.8 ? best.id : null;
}
