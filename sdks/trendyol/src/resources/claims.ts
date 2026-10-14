import {
  NotFoundError,
  TokenBucketRateLimiter,
  ValidationError,
  type CursorPage,
  type MutationResult,
} from '@lonca/core';
import type { TrendyolTransport } from '../transport.js';
import type {
  ApproveClaimLineItemsInput,
  Claim,
  ClaimItemAudit,
  ClaimIssueReason,
  CreateClaimInput,
  CreateClaimResult,
  CreateClaimIssueInput,
  ListClaimsParams,
} from '../types/claim.js';

function toIso(epochMs: number | undefined): string | undefined {
  if (typeof epochMs !== 'number' || !Number.isFinite(epochMs) || epochMs === 0) {
    return undefined;
  }
  return new Date(epochMs).toISOString();
}

interface WireClaim {
  id?: string;
  claimId?: string;
  orderNumber?: string;
  orderDate?: number;
  claimDate?: number;
  customerFirstName?: string;
  customerLastName?: string;
  [key: string]: unknown;
}

function normalizeClaim(node: WireClaim): Claim {
  const out: Claim = {
    id: node.id ?? node.claimId ?? '',
    orderNumber: node.orderNumber ?? '',
    raw: node as Record<string, unknown>,
  };
  const orderDate = toIso(node.orderDate);
  if (orderDate) out.orderDate = orderDate;
  const claimDate = toIso(node.claimDate);
  if (claimDate) out.claimDate = claimDate;
  if (node.customerFirstName !== undefined) out.customerFirstName = node.customerFirstName;
  if (node.customerLastName !== undefined) out.customerLastName = node.customerLastName;
  return out;
}

/**
 * Trendyol claims (return / iade) endpoints.
 *
 * Rate limit (per Trendyol service limits): shares the order service bucket;
 * the SDK provisions its own 1000 req/min limiter that the caller can override.
 */
export class ClaimsResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: TrendyolTransport,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 60_000 });
  }

  /**
   * Create a return claim against an order. Use this to file a return on
   * behalf of a customer (e.g. when they called your CS line). For
   * customer-initiated returns coming from trendyol.com, you receive them
   * via `claims.list()` — no need to call `create`.
   *
   * Resolves to the new claim's id, one claim item id per unit and the
   * return shipment's tracking number (stage, 2026-10-14), plus `raw`.
   *
   * @throws {ValidationError} when `claimItems` is empty.
   */
  async create(input: CreateClaimInput): Promise<CreateClaimResult> {
    if (!Array.isArray(input?.claimItems) || input.claimItems.length === 0) {
      throw new ValidationError({ message: 'claims.create: claimItems must not be empty' });
    }
    const raw = await this.transport.request<unknown>({
      method: 'POST',
      path: `/integration/order/sellers/${this.transport.sellerId}/claims/create`,
      body: input,
      rateLimiter: this.limiter,
    });
    const body = (raw && typeof raw === 'object' ? raw : {}) as {
      claimId?: unknown;
      claimItemIds?: unknown;
      cargoTrackingNumber?: unknown;
    };
    const result: CreateClaimResult = {
      claimItemIds: Array.isArray(body.claimItemIds) ? body.claimItemIds.map(String) : [],
      raw,
    };
    if (body.claimId !== undefined && body.claimId !== null) result.claimId = String(body.claimId);
    if (body.cargoTrackingNumber !== undefined && body.cargoTrackingNumber !== null) {
      result.cargoTrackingNumber = String(body.cargoTrackingNumber);
    }
    return result;
  }

  /**
   * File a seller-side rejection ("ret talebi") against a customer claim.
   *
   * **Wire format: `multipart/form-data`** — the SDK builds the FormData
   * internally from the typed input. `claimItemIdList` is joined with
   * commas (Trendyol expects a single comma-separated string field).
   * Attach supporting docs (PDF / JPEG) via `files: [Blob, ...]`.
   */
  async createIssue(claimId: string, input: CreateClaimIssueInput): Promise<MutationResult> {
    if (!Array.isArray(input?.claimItemIdList) || input.claimItemIdList.length === 0) {
      throw new ValidationError({
        message: 'claims.createIssue: claimItemIdList must not be empty',
      });
    }
    if (typeof input.description !== 'string' || input.description.length === 0) {
      throw new ValidationError({ message: 'claims.createIssue: description is required' });
    }
    if (input.description.length > 500) {
      throw new ValidationError({
        message: `claims.createIssue: description must be ≤500 chars (got ${input.description.length})`,
      });
    }

    const form = new FormData();
    form.append('claimIssueReasonId', String(input.claimIssueReasonId));
    form.append('claimItemIdList', input.claimItemIdList.join(','));
    form.append('description', input.description);
    if (input.files) {
      for (const file of input.files) {
        form.append('files', file);
      }
    }

    return {
      raw: await this.transport.request<unknown>({
        method: 'POST',
        path: `/integration/order/sellers/${this.transport.sellerId}/claims/${encodeURIComponent(claimId)}/issue`,
        body: form,
        rateLimiter: this.limiter,
      }),
    };
  }

  /**
   * Approve specific claim line items. After approval, Trendyol moves
   * those line items into the post-approval refund / return-shipping flow.
   *
   * @throws {ValidationError} when `claimLineItemIdList` is empty.
   */
  async approveLineItems(
    claimId: string,
    input: ApproveClaimLineItemsInput,
  ): Promise<MutationResult> {
    if (!Array.isArray(input?.claimLineItemIdList) || input.claimLineItemIdList.length === 0) {
      throw new ValidationError({
        message: 'claims.approveLineItems: claimLineItemIdList must not be empty',
      });
    }
    return {
      raw: await this.transport.request<unknown>({
        method: 'PUT',
        path: `/integration/order/sellers/${this.transport.sellerId}/claims/${encodeURIComponent(claimId)}/items/approve`,
        body: input,
        rateLimiter: this.limiter,
      }),
    };
  }

  /**
   * List claims (page-based; SDK exposes opaque cursor convention).
   *
   * @example
   * ```ts
   * import { paginate } from '@lonca/core';
   * for await (const c of paginate((p) =>
   *   client.claims.list({ ...p, claimItemStatus: 'WaitingInAction' }),
   * )) {
   *   console.log(c.id, c.orderNumber, c.claimDate);
   * }
   * ```
   */
  async list(params: ListClaimsParams = {}): Promise<CursorPage<Claim>> {
    const size = Math.min(params.limit ?? 50, 200);
    const page = params.cursor ? Number.parseInt(params.cursor, 10) : 0;

    const query: Record<string, string | number | undefined> = { page, size };
    if (params.startDate) query.startDate = params.startDate.getTime();
    if (params.endDate) query.endDate = params.endDate.getTime();
    if (params.claimItemStatus) query.claimItemStatus = params.claimItemStatus;
    if (params.orderNumber) query.orderNumber = params.orderNumber;
    if (params.claimIds?.length) query.claimIds = params.claimIds.join(',');

    interface WireResponse {
      totalElements?: number;
      totalPages?: number;
      page?: number;
      size?: number;
      content?: WireClaim[];
    }
    let data: WireResponse;
    try {
      data = await this.transport.request<WireResponse>({
        method: 'GET',
        path: `/integration/order/sellers/${this.transport.sellerId}/claims`,
        query,
        rateLimiter: this.limiter,
      });
    } catch (error) {
      // Trendyol answers a search with no match with 404 `order.not.found`
      // ("Order not found for claim", stage 2026-10-14) — an empty page.
      if (error instanceof NotFoundError && isNoClaimsAnswer(error.data)) return { items: [] };
      throw error;
    }

    const items = (data.content ?? []).map(normalizeClaim);
    const result: CursorPage<Claim> = { items };
    const totalPages = typeof data.totalPages === 'number' ? data.totalPages : 0;
    if (page + 1 < totalPages) {
      result.nextCursor = String(page + 1);
    }
    return result;
  }

  /**
   * Fetch the catalog of rejection-reason IDs the seller can use on
   * `claims.createIssue()`. Cache the result — it changes rarely.
   *
   * Note: this endpoint is **not seller-scoped** (no `sellerId` in path).
   */
  async getIssueReasons(): Promise<ClaimIssueReason[]> {
    const data = await this.transport.request<Array<{ id?: number; name?: string }>>({
      method: 'GET',
      path: `/integration/order/claim-issue-reasons`,
      rateLimiter: this.limiter,
    });
    return (data ?? []).map((r) => ({
      id: typeof r.id === 'number' ? r.id : 0,
      name: r.name ?? '',
    }));
  }

  /**
   * Fetch the audit log for a single claim item (state transitions,
   * actor, timestamp). Trendyol's response shape varies — the SDK
   * surfaces each row as `{ raw }` and leaves field extraction to the
   * caller until we observe a stable shape on the wire.
   */
  async getItemAudits(claimItemId: string): Promise<ClaimItemAudit[]> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      path: `/integration/order/sellers/${this.transport.sellerId}/claims/items/${encodeURIComponent(claimItemId)}/audit`,
      rateLimiter: this.limiter,
    });
    const rows = Array.isArray(data)
      ? data
      : Array.isArray((data as { content?: unknown[] })?.content)
        ? (data as { content: unknown[] }).content
        : [];
    return rows.map((row) => ({ raw: row as Record<string, unknown> }));
  }
}

function isNoClaimsAnswer(data: Record<string, unknown> | undefined): boolean {
  const body = data?.body as { errors?: { key?: unknown }[] } | undefined;
  return Array.isArray(body?.errors) && body.errors.some((e) => e?.key === 'order.not.found');
}
