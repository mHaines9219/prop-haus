# FUT-2 · Spacelab 3D set preview — how the pipeline works

After checkout, a production can open its order as a 3D room: every ordered item
becomes a placed object in [Spacelab](https://github.com/mHaines9219/spacelab),
Matthew's browser-based room studio (Rust/WASM scene core, React + three.js
renderer).

This document covers what is built here, what is still owed on the Spacelab
side, and what has to happen before it is a real product surface.

---

## 0. What this needs from Matthew (start here)

Three decisions, in the order they unblock things. Nothing here blocks anything
else in the repo — the flow is demoable today without any of them.

**1. Pick an image-to-3D service.** Candidates to evaluate: Meshy, Tripo, or a
self-hosted TRELLIS-class model. What to compare: cost per generation, quality
on a single product photo (which is all our catalog has), turnaround, and
whether the API is sync or job-based. Until then the mock ships real,
photo-mapped boxes and everything downstream works.

*When you have it:* write one adapter implementing `Model3dProvider`, register
it in `getModel3dProvider()`, then set `SPACELAB_MODEL_PROVIDER=<name>`, its API
key, **and `SPACELAB_ASSET_BUCKET`** (§2). Read the model contract in §2 first —
it is the thing most likely to be gotten wrong.

**2. Create a public Supabase Storage bucket for generated models**, and put its
name in `SPACELAB_ASSET_BUCKET`. Not needed for the mock; **required** the
moment a paid provider is wired, because without it every fetch of a mesh
regenerates it and would re-bill the service. `getModelStore()` logs a warning
when it sees that combination.

**3. Make the Spacelab-side change and deploy it.** Two small, additive patches
(§3, written out as diffs against the current Spacelab source) plus a host for
the static Vite app. Then set `NEXT_PUBLIC_SPACELAB_URL` and
`NEXT_PUBLIC_SITE_URL` here, and the order page becomes a one-click deep link.
Until then the fallback is real and usable: download the room file from the
order page, open it with Spacelab's own "import room" button.

### Also worth a decision, but not blocking

- **Whether checkout should pre-generate models at all** once generation costs
  money. It does today (`SPACELAB_PREWARM=on`), which makes the first click
  instant; flipping it to `off` makes generation user-initiated instead.
- **The placeholder dimension table.** Most scraped listings publish no
  dimensions, so items fall back to a per-category guess (§2). It is marked
  `PLACEHOLDER` in `lib/spacelab/asset.ts` and wants a pass from someone who
  knows what a prop-house sofa actually measures.
- **Vendor posture.** Generated models carry vendor attribution into anyone's
  Spacelab scene. Worth confirming the houses are comfortable with a 3D
  derivative of their listing photos before this goes public.

---

## 1. What runs today

Everything below works with **zero secrets and no Spacelab deployment**:

1. **Checkout places an order.** `app/api/checkout/route.ts` calls
   `queueSpacelabHandoff` inside `after()`, so model generation happens off the
   response path and can never fail a checkout.
2. **A 3D model is generated per catalog item.** `lib/spacelab/models.ts` keeps
   one row per item in `spacelab_models`, shared across every org — the mesh for
   a sofa is the same mesh whoever rents it.
3. **A room file is written.** `lib/spacelab/scene.ts` builds Spacelab's
   `SaveFile` envelope: a rectangular room sized to the set, with every ordered
   item staged in rows along the near wall.
4. **The order page offers it.** `components/ap/spacelab-panel.tsx` on
   `/orders/[id]` — "Open in Spacelab" when a deployment is configured, and the
   raw room file either way.

### Surfaces

| Route | What it serves | Auth |
| --- | --- | --- |
| `POST /api/spacelab/scenes` | Prepare/rebuild the room for an order | Session; order scoped to the caller's org |
| `GET /api/spacelab/scenes/<id>?token=` | The room file (`SaveFile` JSON) | Bearer token, CORS-open |
| `GET /api/spacelab/catalog?scene=<id>&token=` | Catalog entries that room needs | Bearer token, CORS-open |
| `GET /api/spacelab/catalog` | Every generated model | Public, CORS-open |
| `GET /api/spacelab/models/<b64 assetId>.glb` | One mesh, rebuilt on request | Public, CORS-open |

### Data

The model route's path segment is the asset id in base64url: a vendor source id
can contain a slash, and an encoded slash in a URL path is refused by enough
proxies to be worth designing around.

- `spacelab_models` — the image-to-3D cache. Keyed by
  `prophaus:<source>:<sourceId>`, public-read (Spacelab fetches it
  cross-origin), service-role writes.
- `spacelab_scenes` — one prepared room per order, org-owned, carrying a bearer
  `token`. **No select policy**: every read is server-side, so the token is
  never reachable through the Data API. Same treatment as
  `projects.share_token`.

---

## 2. The two things that are mocked

Both sit behind interfaces, and both are one file to replace.

### Image-to-3D (`lib/spacelab/provider.ts`)

`MockBoxProvider` builds a real, loadable GLB: a box at the item's true
dimensions with the listing photo mapped onto its faces (`lib/spacelab/glb.ts`).
It reads as a placeholder in the room, which is honest, and it exercises the
whole pipeline — generation, caching, catalog publication, scene loading —
without a key.

Swapping in a real service (Meshy, Tripo, a TRELLIS-class host) is:

1. Write the adapter implementing `Model3dProvider`.
2. Register it in `getModel3dProvider()`'s switch.
3. Set `SPACELAB_MODEL_PROVIDER=<name>` and its API key.
4. **Set `SPACELAB_ASSET_BUCKET`.** Without a bucket, model URLs point at the
   regenerating route, which would re-call a paid service on every fetch.
   `getModelStore()` warns when it sees that combination.

**Model contract for any adapter.** Spacelab adds a GLB to the scene
untransformed — the group's scale is Rust's per-axis multiplier, `[1,1,1]` on a
fresh placement, and the selection box is drawn from the catalog `dims_m`
centred at `y = h/2`. So a mesh must be:

- in **metres**, at real-world size matching its catalog `dims_m`
- **origin centred on the footprint, base on the floor plane** (`y = 0`)
- **facing `+Z`**

Most services return a unit-ish mesh centred on its bounding box. An adapter
that does not re-scale and re-origin will put every piece in the room half
underground.

### Item dimensions

Most scraped listings publish no dimensions, so `lib/spacelab/asset.ts` falls
back to a per-category placeholder table (marked `PLACEHOLDER` in the source).
Each axis falls back independently — an item with a published width and height
keeps both. `spacelab_models.dims_source` records `vendor` vs `fallback`, so
once MVP-6 #3's parsed-dimension backfill lands, the guessed ones can be
regenerated on their own.

---

## 3. What is owed on the Spacelab side

Spacelab loads models from its own bundled catalog: `CatalogPanel.tsx` and
`viewport.ts` each `fetch("/assets/catalog.json")`, and `urlOf` resolves an
entry as `/assets/${entry.blob}`. Our models live on another origin, so two
small changes are needed. They are additive — Spacelab keeps working exactly as
it does today when neither parameter is present.

### 3.1 Load an additional remote catalog, and allow absolute `blob` URLs

New module, `web/src/remoteCatalog.ts`:

```ts
/** Extra catalogs to merge in, from ?catalog=<url> (repeatable). */
export function extraCatalogUrls(): string[] {
  const params = new URLSearchParams(window.location.search);
  return params.getAll("catalog").filter((u) => /^https?:\/\//.test(u));
}

/** An entry's model URL: absolute passes through, relative stays bundle-local. */
export function assetUrl(blob: string): string {
  return /^https?:\/\//.test(blob) ? blob : `/assets/${blob}`;
}

export async function loadCatalogs(): Promise<CatalogEntry[]> {
  const urls = ["/assets/catalog.json", ...extraCatalogUrls()];
  const lists = await Promise.all(
    urls.map((u) =>
      fetch(u)
        .then((r) => (r.ok ? r.json() : []))
        // A remote catalog that fails to load costs its entries, not the app.
        .catch(() => []),
    ),
  );
  return lists.flat();
}
```

Then in `viewport.ts`:

```diff
-  const urlOf = (entry: CatalogEntry) => `/assets/${entry.blob}`;
+  const urlOf = (entry: CatalogEntry) => assetUrl(entry.blob);

-      const entries: CatalogEntry[] = await fetch("/assets/catalog.json").then((r) => r.json());
+      const entries: CatalogEntry[] = await loadCatalogs();
```

and the same `loadCatalogs()` swap in `CatalogPanel.tsx`.

### 3.2 Open a room from a URL

`App.tsx` already handles `?project=<id>` against its own Supabase portfolio.
Add a sibling for a room fetched from anywhere, ahead of the autosave restore:

```diff
   const projectId = searchParams.get("project");
-  if (projectId) await loadCloudProject(handle, projectId);
+  const roomUrl = searchParams.get("room");
+  if (roomUrl) await loadRemoteRoom(handle, roomUrl);
+  else if (projectId) await loadCloudProject(handle, projectId);
   else await restoreSavedRoom(handle);
```

`loadRemoteRoom` is `loadCloudProject` with `fetch(roomUrl).then(r => r.text())`
in place of `getProject`, handed to the same `handle.loadJson`. The room JSON we
serve is byte-compatible with what Spacelab's own export produces — verified by
round-tripping a generated room through `core-scene`'s serde types.

Only accept `https:` room URLs, and treat the fetched document as untrusted
input, which `load_json` already does (it parses and validates before it swaps
the scene, so a bad file changes nothing).

### 3.3 Deploy it

Spacelab is a static Vite app with no host yet. Once it is deployed, set
`NEXT_PUBLIC_SPACELAB_URL` here and the order page switches from "download the
room file" to a one-click deep link:

```
https://<spacelab>/?room=<encoded room URL>&catalog=<encoded catalog URL>
```

Until then the fallback path is real and usable: download the room file from the
order page and open it with Spacelab's own "import room" button. The pieces will
render as untextured placeholders in that mode, because their catalog entries
are not loaded — 3.1 is what fixes that, not 3.2.

---

## 4. Verification

The parts that can be verified without a browser are:

- `lib/spacelab/scene.test.ts` — the room shape, the staging line, id allocators.
- `lib/spacelab/glb.test.ts` — the GLB container, accessors, and the
  base-on-the-floor model contract.
- `lib/spacelab/asset.test.ts` — asset ids, unit conversion, taxonomy.

The save-file shape itself was verified directly against Spacelab: a room
generated by `buildScene` was deserialized by `core-scene`'s real `Scene` type
through `serde_json`, field for field, including glam's bare-array vectors and
the `"Generated"` / `"Floor"` / `"WoodLight"` enum spellings. That check lives in
the Spacelab clone rather than here (this repo has no Rust toolchain); re-run it
there if Spacelab's `SAVE_VERSION` ever moves.

---

## 5. Not built, deliberately

- **Polling for async generators.** `Model3dProvider.poll` exists in the
  interface and no adapter needs it yet; the mock answers synchronously. A real
  service will need a job that drains `spacelab_models` rows stuck in `pending`.
- **Editing back.** The handoff is one-way. Nothing reads a room the user
  rearranged, and there is no "save my layout" — that needs a decision about
  where the authored room lives (Spacelab's portfolio, or ours).
- **Wall-hung placement.** `anchor` is published per entry (artwork and mirrors
  come through as `wall`), but the generated room stages everything on the
  floor. Spacelab's own `Anchor::AgainstWall` needs a wall id we would have to
  choose for the user.
- **Item-level entry points.** Only orders become rooms. A folder (project) is
  the obvious next one, and `spacelab_scenes.order_id` is nullable so it needs
  no migration.
