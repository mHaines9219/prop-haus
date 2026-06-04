import { loadCatalog } from './catalog';
import { loadIndex, topK, EMBED_DIM } from './embeddings';
import type { PropItem } from './types';

const EMBED_MODEL = process.env.OPENROUTER_EMBED_MODEL || 'openai/text-embedding-3-small';
const OR_URL = 'https://openrouter.ai/api/v1/embeddings';

async function embedQuery(query: string, apiKey: string): Promise<Float32Array> {
  const res = await fetch(OR_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      'http-referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3017',
      'x-title': process.env.OPENROUTER_APP_NAME || 'prop-haus',
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: query }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenRouter embed ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = (await res.json()) as { data?: Array<{ embedding: number[] }> };
  const vec = data.data?.[0]?.embedding;
  if (!vec) throw new Error('no embedding returned');
  if (vec.length !== EMBED_DIM) throw new Error(`embedding dim ${vec.length} != ${EMBED_DIM}`);
  return new Float32Array(vec);
}

export type Shortlist = Array<{ item: PropItem; score: number }>;

export async function shortlistByEmbedding(query: string, k = 50): Promise<Shortlist> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
  const index = await loadIndex();
  if (!index) return [];
  const vec = await embedQuery(query, apiKey);
  const hits = topK(index, vec, k);
  const catalog = await loadCatalog();
  const byId = new Map(catalog.map((i) => [i.id, i]));
  return hits
    .map((h) => ({ item: byId.get(h.id), score: h.score }))
    .filter((x): x is { item: PropItem; score: number } => Boolean(x.item));
}

export function shortlistAsText(shortlist: Shortlist): string {
  return shortlist
    .map(({ item }) => {
      const tags = [
        item.style?.join(','),
        item.era,
        item.materials?.join(','),
        item.colors?.join(','),
      ]
        .filter(Boolean)
        .join(' | ');
      const desc = item.description ? ' — ' + item.description.slice(0, 140) : '';
      return `${item.id} | ${item.category}${item.subcategory ? '/' + item.subcategory : ''} | ${item.name}${tags ? ' [' + tags + ']' : ''}${desc}`;
    })
    .join('\n');
}
