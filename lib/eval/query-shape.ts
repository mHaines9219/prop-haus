/**
 * Is this query one that token search structurally cannot serve?
 *
 * WHY IT IS A LABELLED COLUMN AND NOT SOMETHING SOMEONE CHECKS BY EYE
 *
 * The in-memory ranker matches with `norm.includes(token)`, so "ouc" finds
 * "couch" and "entury" finds "century". Postgres full-text search matches
 * lexemes, with an optional prefix on the trailing token — it can do "couc" via
 * `couc:*` but never "ouc", because that is a substring in the middle of a word.
 *
 * So when the Postgres ordering loses on a query, there are two very different
 * causes:
 *
 *   WEIGHTS      — both rankers could find the items; they ordered them
 *                  differently. Actionable by changing weights or the query.
 *   SUBSTRING    — the in-memory ranker found items token search cannot reach at
 *                  all. Not a weighting problem, and no amount of tuning fixes
 *                  it. The honest options are a trigram index or accepting it.
 *
 * Reporting a single "Postgres lost" number collapses those, and the tempting
 * misreading is the first one, because it is the one you can act on. Hence a
 * column in the output rather than a note to remember.
 */

/** How a query token can reach a term in the corpus. */
export type TokenShape =
  /** Token equals a whole word, or is a prefix of one: both rankers reach it. */
  | 'exact-or-prefix'
  /** Token appears only mid-word or as a suffix: `includes()` reaches it, tsquery cannot. */
  | 'substring-only'
  /** Token matches no word in the sample at all. */
  | 'unmatched';

export type QueryShape = {
  query: string;
  tokens: Array<{ token: string; shape: TokenShape }>;
  /** True when ANY token is substring-only — enough to make the comparison unfair. */
  substringShaped: boolean;
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Split a corpus string into the words a tsvector would produce lexemes from. */
export function words(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0);
}

/**
 * Classify each token of `query` against a corpus sample.
 *
 * `sample` is the set of field strings the rankers actually read for the items in
 * play — pass the pooled candidates' text, not the whole catalog. Classifying
 * against all ~90k items would call almost anything a prefix of something and the
 * label would stop discriminating.
 */
export function classifyQuery(query: string, sample: string[]): QueryShape {
  const vocab = new Set<string>();
  for (const s of sample) for (const w of words(s)) vocab.add(w);
  const vocabList = [...vocab];

  const tokens = normalize(query)
    .split(' ')
    .filter(Boolean)
    .map((token) => {
      let shape: TokenShape = 'unmatched';
      for (const w of vocabList) {
        if (w.startsWith(token)) {
          // Whole-word or prefix: `token:*` reaches it. Best case, stop looking.
          shape = 'exact-or-prefix';
          break;
        }
        if (w.includes(token)) {
          // Mid-word or suffix. Keep scanning — a later word may still offer a
          // prefix match, which would make the query fair after all.
          shape = 'substring-only';
        }
      }
      return { token, shape };
    });

  return {
    query,
    tokens,
    substringShaped: tokens.some((t) => t.shape === 'substring-only'),
  };
}
