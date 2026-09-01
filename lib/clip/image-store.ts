import { createAdminClient } from '../supabase/admin';
import { SafeFetchError, assertPublicUrl } from './safe-fetch';

/**
 * Snapshot a clipped listing's image (MVP-7).
 *
 * WHY COPY THE IMAGE. Retail CDN URLs rot (a de-listed SKU 404s its image) and
 * some check the Referer header, so a hotlinked retail image can render today
 * and break tomorrow. Copying it into our own bucket makes the folder durable.
 *
 * ZERO-SECRET DEMO. Storage is optional: with no `CLIP_IMAGE_BUCKET` (or no
 * service key) we fall back to PassthroughStore, which returns the original URL
 * unchanged. `next.config.ts` already renders any https image host, so the clip
 * still shows — it's just hotlinked rather than snapshotted. This is also the
 * posture to keep if Matthew decides hotlink-only (see the PR flag).
 */

export interface ImageStore {
  /**
   * Copy the image at `url` under `key`, returning a URL to render. On any
   * failure it MUST return the original `url` rather than throw — a clip should
   * never fail because we couldn't mirror its picture.
   */
  put(url: string, key: string): Promise<string>;
}

/** Hotlink posture: hand back the original URL, copy nothing. */
export class PassthroughStore implements ImageStore {
  async put(url: string): Promise<string> {
    return url;
  }
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const IMAGE_TIMEOUT_MS = 10_000;

/** Copy into a public Supabase Storage bucket, keyed by the clip's item hash. */
export class SupabaseImageStore implements ImageStore {
  constructor(private readonly bucket: string) {}

  async put(url: string, key: string): Promise<string> {
    try {
      const { bytes, contentType } = await this.download(url);
      const ext = extensionFor(contentType);
      const path = `${key}.${ext}`;
      const admin = createAdminClient();
      const { error } = await admin.storage
        .from(this.bucket)
        .upload(path, bytes, { contentType, upsert: true });
      if (error) throw error;
      const { data } = admin.storage.from(this.bucket).getPublicUrl(path);
      return data.publicUrl || url;
    } catch {
      // Snapshotting is best-effort. Fall back to the live URL so the clip works.
      return url;
    }
  }

  /** Fetch the image with the same SSRF guard, a content-type check, and a cap. */
  private async download(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
    await assertPublicUrl(url); // reject private/loopback hosts before fetching
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
    try {
      const res = await fetch(url, { redirect: 'error', signal: controller.signal });
      if (!res.ok) throw new SafeFetchError('http', `image fetch returned ${res.status}`);
      const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim();
      if (!contentType.startsWith('image/')) {
        throw new SafeFetchError('http', `not an image: ${contentType || 'unknown'}`);
      }
      const declared = Number(res.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
        throw new SafeFetchError('too-large', 'image exceeds size cap');
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength > MAX_IMAGE_BYTES) {
        throw new SafeFetchError('too-large', 'image exceeds size cap');
      }
      return { bytes: buf, contentType };
    } finally {
      clearTimeout(timer);
    }
  }
}

function extensionFor(contentType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
  };
  return map[contentType] ?? 'img';
}

/**
 * The configured store. SupabaseImageStore when a bucket AND a service key are
 * present; PassthroughStore otherwise so the demo path needs no secrets.
 */
export function getImageStore(): ImageStore {
  const bucket = process.env.CLIP_IMAGE_BUCKET;
  const hasKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (bucket && hasKey) return new SupabaseImageStore(bucket);
  return new PassthroughStore();
}
