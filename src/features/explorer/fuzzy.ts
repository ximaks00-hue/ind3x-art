/** Fuzzy subsequence search — keep in sync with src-tauri/src/search/mod.rs; golden vectors: tests/fixtures/fuzzy_golden.json */

export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const t = text.toLowerCase();
  if (t.includes(q)) return 1000 - q.length;

  const qb = [...q];
  const tc = [...t];
  let qi = 0;
  let score = 0;
  let lastMatch: number | null = null;

  for (let ti = 0; ti < tc.length; ti++) {
    if (qi < qb.length && tc[ti] === qb[qi]) {
      score += 10;
      if (lastMatch !== null && ti - lastMatch > 1) {
        score -= (ti - lastMatch - 1) * 2;
      }
      lastMatch = ti;
      qi++;
    }
  }

  return qi === qb.length ? Math.max(1, score) : null;
}

export function filterAssetsFuzzy<
  T extends { displayName: string; path: string; namespace: string },
>(assets: T[], query: string, fuzzy: boolean): T[] {
  const q = query.trim();
  if (!q) return assets;

  const scored = assets
    .map((entry) => {
      const hay = `${entry.displayName} ${entry.path} ${entry.namespace}`;
      if (fuzzy) {
        const score = fuzzyScore(q, hay);
        return score !== null ? { entry, score } : null;
      }
      return hay.toLowerCase().includes(q.toLowerCase()) ? { entry, score: 1000 } : null;
    })
    .filter((x): x is { entry: T; score: number } => x !== null);

  scored.sort((a, b) => b.score - a.score || a.entry.path.localeCompare(b.entry.path));
  return scored.map((s) => s.entry);
}
