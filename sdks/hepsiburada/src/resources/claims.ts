import { TokenBucketRateLimiter, ValidationError, type MutationResult } from '@lonca/core';
import type { HepsiburadaTransport } from '../transport.js';
import type {
  Claim,
  ClaimActionInput,
  ClaimStatus,
  CreateClaimInput,
  ListClaimsByStatusParams,
  ListClaimsParams,
} from '../types/claim.js';

const SERVICE_LIST = 'oms' as const;
const SERVICE_CREATE = 'claim-stub' as const;

/**
 * Hepsiburada's claim list endpoints reject a missing `limit` with
 * `400 "LimitCannotBeEmpty"` (verified live), so the SDK defaults it (and
 * `offset`) when the caller doesn't pass one — keeping `claims.list()` usable
 * with no args. Override either via params.
 */
const DEFAULT_OFFSET = 0;
const DEFAULT_LIMIT = 100;

interface WireClaim {
  claimNumber?: string;
  /** The claim number as the list endpoints send it (verified on SIT, 2026-10-14). */
  number?: string;
  status?: string;
  createdAt?: string;
  /** The claim date as the list endpoints send it (verified on SIT, 2026-10-14). */
  claimDate?: string;
  [key: string]: unknown;
}

function normalizeClaim(node: WireClaim): Claim {
  const out: Claim = { raw: node as Record<string, unknown> };
  const claimNumber = node.claimNumber ?? node.number;
  if (claimNumber !== undefined) out.claimNumber = claimNumber;
  if (node.status !== undefined) out.status = node.status;
  const createdAt = node.createdAt ?? node.claimDate;
  if (createdAt !== undefined) out.createdAt = createdAt;
  return out;
}

function unwrapClaims(data: unknown): WireClaim[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray((data as { items?: unknown[] })?.items)) {
    return (data as { items: WireClaim[] }).items;
  }
  if (Array.isArray((data as { data?: unknown[] })?.data)) {
    return (data as { data: WireClaim[] }).data;
  }
  if (Array.isArray((data as { claims?: unknown[] })?.claims)) {
    return (data as { claims: WireClaim[] }).claims;
  }
  return [];
}

/**
 * Hepsiburada Claims (Talep) — list, status-based filtering, and
 * accept/reject/preApproval actions plus claim creation.
 *
 * **Two backend services** back this surface (the SDK routes
 * automatically; callers don't pick):
 *
 *   - List + actions: `oms-external[-sit].hepsiburada.com` (`talep-listeleme`)
 *   - Create: `claim-stub-external[-sit].hepsiburada.com` (`talep-olusturma`)
 *
 * Body shapes for `accept`, `reject`, `preApprovalConfirm`, and `create`
 * are documented on the developer portal — the SDK passes them through
 * as `Record<string, unknown>` so future field additions don't break callers.
 */
export class ClaimsResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: HepsiburadaTransport,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 120, intervalMs: 60_000 });
  }

  /**
   * List all claims. Date-range filters are optional; `offset`/`limit` default
   * to `0`/`100` because Hepsiburada rejects a missing `limit` (`400
   * "LimitCannotBeEmpty"`). Pass your own to paginate.
   */
  async list(params: ListClaimsParams = {}): Promise<Claim[]> {
    const query: Record<string, string | number | undefined> = {};
    if (params.beginDate) query.beginDate = params.beginDate;
    if (params.endDate) query.endDate = params.endDate;
    query.offset = params.offset ?? DEFAULT_OFFSET;
    query.limit = params.limit ?? DEFAULT_LIMIT;

    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE_LIST,
      path: `/claims/merchantId/${encodeURIComponent(this.transport.merchantId)}`,
      query: Object.keys(query).length ? query : undefined,
      rateLimiter: this.limiter,
    });
    return unwrapClaims(data).map(normalizeClaim);
  }

  /**
   * List claims filtered to a specific status.
   *
   * Allowed values (per the published OpenAPI spec, verified live):
   * `NewRequest | Accepted | AwaitingAction | InDispute | Rejected |
   * Refunded | Cancelled | AwaitingPreApproval`. Any other value returns
   * `400 "Wrong Claim Status"` from Hepsiburada.
   *
   * @throws {ValidationError} when `status` is empty.
   */
  async listByStatus(status: ClaimStatus, params: ListClaimsByStatusParams = {}): Promise<Claim[]> {
    if (!status || typeof status !== 'string') {
      throw new ValidationError({ message: 'claims.listByStatus: status is required' });
    }
    const query: Record<string, string | number | undefined> = {};
    if (params.beginDate) query.beginDate = params.beginDate;
    if (params.endDate) query.endDate = params.endDate;
    if (params.statusBeginDate) query.statusBeginDate = params.statusBeginDate;
    if (params.statusEndDate) query.statusEndDate = params.statusEndDate;
    query.offset = params.offset ?? DEFAULT_OFFSET;
    query.limit = params.limit ?? DEFAULT_LIMIT;

    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE_LIST,
      path: `/claims/merchantId/${encodeURIComponent(this.transport.merchantId)}/status/${encodeURIComponent(status)}`,
      query: Object.keys(query).length ? query : undefined,
      rateLimiter: this.limiter,
    });
    return unwrapClaims(data).map(normalizeClaim);
  }

  /**
   * Accept (approve) a customer claim. Hepsiburada expects a body —
   * pass the documented `c` payload via `input`.
   */
  async accept(claimNumber: string, input: ClaimActionInput = {}): Promise<MutationResult> {
    if (!claimNumber) {
      throw new ValidationError({ message: 'claims.accept: claimNumber is required' });
    }
    return {
      raw: await this.transport.request<unknown>({
        method: 'POST',
        service: SERVICE_LIST,
        path: `/claims/number/${encodeURIComponent(claimNumber)}/accept`,
        body: input,
        rateLimiter: this.limiter,
      }),
    };
  }

  /** Reject a customer claim. */
  async reject(claimNumber: string, input: ClaimActionInput = {}): Promise<MutationResult> {
    if (!claimNumber) {
      throw new ValidationError({ message: 'claims.reject: claimNumber is required' });
    }
    return {
      raw: await this.transport.request<unknown>({
        method: 'POST',
        service: SERVICE_LIST,
        path: `/claims/number/${encodeURIComponent(claimNumber)}/reject`,
        body: input,
        rateLimiter: this.limiter,
      }),
    };
  }

  /**
   * Confirm a "pre-approval" — a Hepsiburada-specific second-step
   * approval flow for certain claim categories.
   */
  async preApprovalConfirm(
    claimNumber: string,
    input: ClaimActionInput = {},
  ): Promise<MutationResult> {
    if (!claimNumber) {
      throw new ValidationError({
        message: 'claims.preApprovalConfirm: claimNumber is required',
      });
    }
    return {
      raw: await this.transport.request<unknown>({
        method: 'POST',
        service: SERVICE_LIST,
        path: `/claims/number/${encodeURIComponent(claimNumber)}/preapprovalconfirm`,
        body: input,
        rateLimiter: this.limiter,
      }),
    };
  }

  /**
   * Create a new claim against an order. Routes to the `claim-stub`
   * backend service.
   */
  async create(input: CreateClaimInput): Promise<MutationResult> {
    if (!input || typeof input !== 'object') {
      throw new ValidationError({ message: 'claims.create: input is required' });
    }
    return {
      raw: await this.transport.request<unknown>({
        method: 'POST',
        service: SERVICE_CREATE,
        path: `/claims/merchant/${encodeURIComponent(this.transport.merchantId)}/create`,
        body: input,
        rateLimiter: this.limiter,
      }),
    };
  }
}
