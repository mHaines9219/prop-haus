/**
 * Order → prepared Spacelab room (FUT-2, phases 3 and 4).
 *
 * "Build your set in 3D" has to be one click, which means the work happens
 * before the click: models generated, catalog published, room file written and
 * addressable. This module is that pipeline, and the post-checkout hook that
 * warms it.
 *
 * WHAT THE USER GETS. A `spacelab_scenes` row holding the SaveFile envelope
 * plus a bearer token, addressable three ways:
 *   - `roomUrl`      — deep link into a deployed Spacelab (needs the loader
 *                      patch in docs/spacelab-integration.md). Null until the
 *                      app is deployed and NEXT_PUBLIC_SPACELAB_URL is set.
 *   - `roomFileUrl`  — the raw room JSON. Works TODAY with zero Spacelab
 *                      changes: download it and use Spacelab's own "import
 *                      room" button. This is the fallback the brief asks for.
 *   - `catalogUrl`   — the entries the room's asset ids resolve against.
 */

import crypto from 'node:crypto';
import { itemsByIds } from '../catalog-db';
import { createAdminClient } from '../supabase/admin';
import { getOrderById, type Order } from '../orders';
import { assetIdFor } from './asset';
import { siteBaseUrl, spacelabRoomUrl } from './config';
import { buildScene, type SceneItem } from './scene';
import type { SaveFile } from './scene-format';
import {
  ensureModels,
  getModels,
  seedFromItem,
  seedFromOrderLine,
  type ModelSeed,
  type SpacelabModel,
} from './models';

export type PreparedScene = {
  id: string;
  /** Total order lines in the room. */
  itemCount: number;
  /** How many of them have a mesh, and so will actually draw. */
  modelReadyCount: number;
  /** Deep link into a deployed Spacelab, or null when there is no deployment. */
  roomUrl: string | null;
  /** The room JSON itself — Spacelab's "import room" accepts this today. */
  roomFileUrl: string;
  /** Catalog entries for this room's assets. */
  catalogUrl: string;
  updatedAt: string;
};

/**
 * Build (or rebuild) the room for an order.
 *
 * Idempotent per order: the unique index on `order_id` means re-preparing
 * updates the same row, and the token is preserved so a link already handed out
 * keeps working. Rebuilding is how a room picks up models that finished
 * generating after the first attempt.
 */
export async function prepareSceneForOrder(orderId: string, orgId: string): Promise<PreparedScene> {
  const order = await getOrderById(orderId, orgId); // throws if not this org's
  const models = await ensureModels(await seedsForOrder(order));
  return persistScene(order, orgId, models);
}

/** The prepared room for an order, if one exists. No generation, no writes. */
export async function getSceneForOrder(orderId: string, orgId: string): Promise<PreparedScene | null> {
  const row = await getSceneRow(orderId, orgId);
  return row ? toPrepared(row) : null;
}

async function getSceneRow(orderId: string, orgId: string): Promise<SceneRow | null> {
  const db = createAdminClient();
  const { data, error } = await db
    .from('spacelab_scenes')
    .select('id, token, item_count, model_ready_count, updated_at')
    .eq('order_id', orderId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) throw new Error(`[spacelab] scene lookup failed: ${error.message}`);
  return (data as SceneRow | null) ?? null;
}

/**
 * The room file itself, for the Spacelab-facing route. Authorized by the token
 * rather than a session: Spacelab is a static app on another origin that has no
 * Prop Haus cookie to send.
 */
export async function getSceneByToken(id: string, token: string): Promise<SaveFile | null> {
  if (!token) return null;
  const db = createAdminClient();
  const { data, error } = await db
    .from('spacelab_scenes')
    .select('token, scene')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`[spacelab] scene read failed: ${error.message}`);
  if (!data) return null;
  // Constant-time compare: this is a bearer credential, and the ids are
  // enumerable in a way a token should not be.
  if (!tokensMatch(data.token as string, token)) return null;
  return data.scene as SaveFile;
}

/** The asset ids a prepared room refers to — what its catalog must cover. */
export async function assetIdsForScene(id: string, token: string): Promise<string[] | null> {
  const scene = await getSceneByToken(id, token);
  if (!scene) return null;
  return [...new Set(scene.scene.furnishings.map((f) => f.asset.asset_id))];
}

/**
 * Post-checkout hook (the extension point MVP-3 left in app/api/checkout/route.ts).
 *
 * Warms the models for an order's items so the first click on "Build your set
 * in 3D" is instant rather than a two-minute wait. Fire-and-forget and entirely
 * non-fatal: an order must never fail because a 3D preview could not be built.
 * Set SPACELAB_PREWARM=off to skip it (useful once a paid provider is wired and
 * you want generation to be an explicit, user-initiated cost).
 */
export async function queueSpacelabHandoff(order: Order, orgId: string): Promise<void> {
  if ((process.env.SPACELAB_PREWARM ?? 'on').toLowerCase() === 'off') return;
  try {
    const models = await ensureModels(await seedsForOrder(order));
    await persistScene(order, orgId, models);
  } catch (err) {
    console.error('[spacelab] prewarm failed (order is unaffected)', err);
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * One seed per DISTINCT item on the order. Catalog rows carry the dimensions
 * and enrichment that make a good model; a line whose catalog row has gone
 * (de-listed on a re-scrape) falls back to its checkout snapshot rather than
 * dropping out of the room.
 */
async function seedsForOrder(order: Order): Promise<ModelSeed[]> {
  const items = await itemsByIds(order.items.map((i) => i.itemId));
  const byAssetId = new Map(items.map((item) => [assetIdFor(item.source, item.sourceId), item]));

  const seeds = new Map<string, ModelSeed>();
  for (const line of order.items) {
    const assetId = assetIdFor(line.source, line.sourceId);
    if (seeds.has(assetId)) continue;
    const item = byAssetId.get(assetId);
    seeds.set(assetId, item ? seedFromItem(item) : seedFromOrderLine(line));
  }
  return [...seeds.values()];
}

/**
 * Write the room. Every line becomes a furnishing — including one whose mesh
 * isn't ready, since the alternative is a room that silently loses items. An
 * unresolved asset id is skipped by Spacelab's renderer, and rebuilding the
 * room once generation finishes fills it in.
 */
async function persistScene(
  order: Order,
  orgId: string,
  models: Map<string, SpacelabModel>,
): Promise<PreparedScene> {
  const sceneItems: SceneItem[] = order.items.map((line) => {
    const assetId = assetIdFor(line.source, line.sourceId);
    const model = models.get(assetId);
    return {
      assetId,
      dims: model?.dims ?? { w: 0.6, h: 0.6, d: 0.6 },
    };
  });

  const readyCount = order.items.filter((line) => {
    const model = models.get(assetIdFor(line.source, line.sourceId));
    return model?.status === 'ready' && !!model.glbUrl;
  }).length;

  const scene = buildScene(sceneItems);
  const db = createAdminClient();
  const existing = await getSceneRow(order.id, orgId);

  // Update and insert are split rather than upserted. An upsert would have to
  // put the token in the proposed row, and Postgres checks NOT NULL on that row
  // BEFORE it resolves the conflict — so "omit the token to keep the existing
  // one" fails outright on the update path. Splitting also makes the intent
  // plain: a rebuild must never rotate a link already handed out.
  const patch = {
    scene,
    item_count: sceneItems.length,
    model_ready_count: readyCount,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { data, error } = await db
      .from('spacelab_scenes')
      .update(patch)
      .eq('id', existing.id)
      .select('id, token, item_count, model_ready_count, updated_at')
      .single();
    if (error) throw new Error(`[spacelab] scene update failed: ${error.message}`);
    return toPrepared(data as SceneRow);
  }

  const { data, error } = await db
    .from('spacelab_scenes')
    .insert({ org_id: orgId, order_id: order.id, token: mintToken(), ...patch })
    .select('id, token, item_count, model_ready_count, updated_at')
    .single();

  if (error) {
    // Two prepares for the same order raced: both saw no room, both inserted,
    // and the unique index on order_id caught the loser. The winner's room is
    // the same room, so read it back rather than surfacing a conflict.
    if (error.code === '23505') {
      const settled = await getSceneForOrder(order.id, orgId);
      if (settled) return settled;
    }
    throw new Error(`[spacelab] scene write failed: ${error.message}`);
  }
  return toPrepared(data as SceneRow);
}

/** 32 hex chars from the CSPRNG — same shape as the project share token. */
function mintToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

function tokensMatch(stored: string, given: string): boolean {
  const a = Buffer.from(stored);
  const b = Buffer.from(given);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

type SceneRow = {
  id: string;
  token: string;
  item_count: number;
  model_ready_count: number;
  updated_at: string;
};

function toPrepared(row: SceneRow): PreparedScene {
  const site = siteBaseUrl();
  const query = `token=${encodeURIComponent(row.token)}`;
  return {
    id: row.id,
    itemCount: row.item_count,
    modelReadyCount: row.model_ready_count,
    roomUrl: spacelabRoomUrl(row.id, row.token),
    roomFileUrl: `${site}/api/spacelab/scenes/${row.id}?${query}&download=1`,
    catalogUrl: `${site}/api/spacelab/catalog?scene=${row.id}&${query}`,
    updatedAt: row.updated_at,
  };
}

/** Models behind one prepared room, for status copy on the order page. */
export async function modelsForScene(id: string, token: string): Promise<SpacelabModel[]> {
  const assetIds = await assetIdsForScene(id, token);
  if (!assetIds) return [];
  return [...(await getModels(assetIds)).values()];
}
