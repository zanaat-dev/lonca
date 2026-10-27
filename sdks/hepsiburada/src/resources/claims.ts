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
 * are documented on the developer portal (`talep-listeleme`,
 * `talep-olusturma`) and typed as hints on `ClaimActionInput` /
 * `CreateClaimInput`; the SDK passes them through so future field additions
 * don't break callers.
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
   * Accept (approve) a customer claim — the portal's `AcceptClaimRequest`:
   * `FinalizedWith` (`Refund` / `Change`), `AcceptionReason`, `InvoiceLink`.
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

  /**
   * Reject a customer claim (the claim goes to `InDispute`) — the portal's
   * `RejectClaimRequest`: `ClaimRejectionReason` (a value from Hepsiburada's
   * list, see `ClaimActionInput`), `MerchantStatement`, `Reports`,
   * `UploadedReportsUrls`. Send at least the reason and the statement.
   *
   * @throws {ValidationError} when `claimNumber` is missing or `input` is
   *   empty (Hepsiburada refuses an empty body with a bare `400`).
   */
  async reject(claimNumber: string, input: ClaimActionInput = {}): Promise<MutationResult> {
    if (!claimNumber) {
      throw new ValidationError({ message: 'claims.reject: claimNumber is required' });
    }
    if (!input || typeof input !== 'object' || Object.keys(input).length === 0) {
      throw new ValidationError({
        message:
          'claims.reject: input is required — send ClaimRejectionReason and MerchantStatement (Hepsiburada refuses an empty body)',
      });
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
   * Confirm an `AwaitingPreApproval` claim with "send the product to me, I
   * will inspect it" — the portal's `PreApprovalConfirmRequest`
   * (`{ preApprovalReason: 'ProductInvestigation' }`, the only accepted
   * value). The SDK sends that reason when `input` carries none, so
   * `preApprovalConfirm(claimNumber)` is enough. A claim in another status is
   * refused with `400 "Claim is not in AwaitingPreApproval status"`.
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
    const hasReason = Object.keys(input ?? {}).some((k) => k.toLowerCase() === 'preapprovalreason');
    return {
      raw: await this.transport.request<unknown>({
        method: 'POST',
        service: SERVICE_LIST,
        path: `/claims/number/${encodeURIComponent(claimNumber)}/preapprovalconfirm`,
        body: hasReason ? input : { preApprovalReason: DEFAULT_PRE_APPROVAL_REASON, ...input },
        rateLimiter: this.limiter,
      }),
    };
  }

  /**
   * Create a claim on an order — a test-environment helper (`claim-stub`
   * service) taking the portal's `CreateClaim` body
   * (`{ orderNumber, type, reason, newSKU }`).
   *
   * Hepsiburada answers a failed create with `200` and puts the failure text
   * where the claim number belongs (`{ ClaimList: [{ claimNumber: "Claim
   * oluşturulamadı.", type: "" }] }`, SIT 2026-10-27); the SDK throws that as
   * a `ValidationError` (`status` 200, the body on `error.data.body`).
   *
   * @throws {ValidationError} when `input` is missing, or when a `ClaimList`
   *   entry carries no claim number.
   */
  async create(input: CreateClaimInput): Promise<MutationResult> {
    if (!input || typeof input !== 'object') {
      throw new ValidationError({ message: 'claims.create: input is required' });
    }
    const raw = await this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE_CREATE,
      path: `/claims/merchant/${encodeURIComponent(this.transport.merchantId)}/create`,
      body: input,
      rateLimiter: this.limiter,
    });
    const failure = createFailure(raw);
    if (failure !== undefined) {
      throw new ValidationError({
        message: `claims.create: Hepsiburada did not create the claim: ${failure}`,
        status: 200,
        data: { body: raw },
      });
    }
    return { raw };
  }
}

/** The only `preApprovalReason` the portal documents and SIT accepts. */
const DEFAULT_PRE_APPROVAL_REASON = 'ProductInvestigation';

/** A claim number as Hepsiburada issues them: digits only (e.g. `060630739`). */
const CLAIM_NUMBER = /^\d+$/;

/**
 * The failure text of a `claims.create` response, or `undefined` when every
 * `ClaimList` entry carries a claim number (or the body has no `ClaimList`
 * to judge by). A failed entry has a non-numeric `claimNumber` — Hepsiburada
 * writes the failure text there.
 */
function createFailure(raw: unknown): string | undefined {
  const list = (raw as { ClaimList?: unknown } | undefined)?.ClaimList;
  if (!Array.isArray(list)) return undefined;
  for (const entry of list) {
    const claimNumber = (entry as { claimNumber?: unknown } | null)?.claimNumber;
    if (typeof claimNumber !== 'string' || !CLAIM_NUMBER.test(claimNumber)) {
      return typeof claimNumber === 'string' && claimNumber
        ? JSON.stringify(claimNumber)
        : 'the response carries no claim number';
    }
  }
  return undefined;
}
