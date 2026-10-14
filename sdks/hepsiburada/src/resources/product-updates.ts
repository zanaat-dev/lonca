import { TokenBucketRateLimiter, ValidationError } from '@lonca/core';
import type { HepsiburadaTransport } from '../transport.js';
import type {
  ProductUpdateHistoryEntry,
  ProductUpdateInput,
  ProductUpdateReceipt,
  ProductUpdateStatus,
} from '../types/product-update.js';

const SERVICE = 'mpop' as const;
// The portal spec's base URL is `mpop[-sit].hepsiburada.com/ticket-api`; the
// SDK's `mpop` service entry carries no path prefix (the catalog surface uses
// `/product/...`), so the prefix lives here in the resource paths.
const BASE_PATH = '/ticket-api/api/integrator';

/**
 * Hepsiburada Product Updates (`urun-guncelleme-entegrasyonu`).
 *
 * **Service base URL**: `mpop[-sit].hepsiburada.com` with the `/ticket-api`
 * base path (per the portal spec — routing through `oms-external` returns 401
 * because the routes don't exist there; verified on SIT 2026-08-30, where
 * `/ticket-api/api/integrator/status/{id}` answers 200). 3-endpoint surface —
 * submit updates, poll status, query update history per (merchantId, hbSku)
 * pair.
 */
export class ProductUpdatesResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: HepsiburadaTransport,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 120, intervalMs: 60_000 });
  }

  /**
   * Submit a batch of product updates. Returns a `trackingId` you can poll
   * via `getUpdateStatus(trackingId)`.
   */
  async importUpdates(updates: ProductUpdateInput): Promise<ProductUpdateReceipt> {
    if (!Array.isArray(updates) || updates.length === 0) {
      throw new ValidationError({
        message: 'productUpdates.importUpdates: updates array is required (non-empty)',
      });
    }
    const data = await this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE,
      path: `${BASE_PATH}/import`,
      body: updates,
      rateLimiter: this.limiter,
    });
    const obj = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
    return { trackingId: String(obj.trackingId ?? obj.id ?? ''), raw: obj };
  }

  /** Get the status of a previously-submitted update batch. */
  async getUpdateStatus(trackingId: string): Promise<ProductUpdateStatus> {
    if (!trackingId) {
      throw new ValidationError({
        message: 'productUpdates.getUpdateStatus: trackingId is required',
      });
    }
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `${BASE_PATH}/status/${encodeURIComponent(trackingId)}`,
      rateLimiter: this.limiter,
    });
    const obj = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
    const out: ProductUpdateStatus = { raw: obj };
    if (typeof obj.trackingId === 'string') out.trackingId = obj.trackingId;
    if (typeof obj.status === 'string') out.status = obj.status;
    if (typeof obj.message === 'string') out.message = obj.message;
    if (Array.isArray(obj.rows)) out.rows = obj.rows as Array<Record<string, unknown>>;
    else if (Array.isArray(obj.items)) out.rows = obj.items as Array<Record<string, unknown>>;
    // The documented response (`PageResponseIntegratorImportStatusDto`) is a
    // Spring page whose rows live under `data`.
    else if (Array.isArray(obj.data)) out.rows = obj.data as Array<Record<string, unknown>>;
    return out;
  }

  /** Get the full update history for one (merchantId, hbSku) pair. */
  async getUpdateHistory(hbSku: string): Promise<ProductUpdateHistoryEntry[]> {
    if (!hbSku) {
      throw new ValidationError({
        message: 'productUpdates.getUpdateHistory: hbSku is required',
      });
    }
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `${BASE_PATH}/merchant/${encodeURIComponent(this.transport.merchantId)}/hbSku/${encodeURIComponent(hbSku)}`,
      rateLimiter: this.limiter,
    });
    const rows = Array.isArray(data)
      ? data
      : Array.isArray((data as { items?: unknown[] })?.items)
        ? (data as { items: unknown[] }).items
        : Array.isArray((data as { data?: unknown[] })?.data)
          ? (data as { data: unknown[] }).data
          : [];
    return rows.map((row) => {
      const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
      const out: ProductUpdateHistoryEntry = { raw: r };
      if (typeof r.trackingId === 'string') out.trackingId = r.trackingId;
      if (typeof r.status === 'string') out.status = r.status;
      if (typeof r.modifiedAt === 'string') out.modifiedAt = r.modifiedAt;
      return out;
    });
  }
}
