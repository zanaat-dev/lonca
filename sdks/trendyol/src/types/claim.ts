/**
 * Trendyol claim ("iade" / return-claim) types.
 *
 * A claim is a customer-initiated return on a delivered order. The
 * seller can also open a `createClaimIssue` (a rejection) against a
 * customer-filed claim, and either party can have line items approved
 * via `approveClaimLineItems`.
 */
import type { CursorPaginationParams } from '@lonca/core';

/** One item inside `claims.create()`. */
export interface CreateClaimItemInput {
  /** Barcode of the ordered SKU. */
  barcode: string;
  /** Number of units being returned. */
  quantity: number;
  /**
   * Numeric reason code customers select on trendyol.com.
   * Trendyol's docs note `401` ("Vazgectim" — changed my mind) as a
   * safe default when you don't have a more specific code.
   */
  reasonId: number;
  /** Free-text note from the customer. */
  customerNote?: string;
}

/** Payload for `claims.create()`. */
export interface CreateClaimInput {
  /** The order to file the claim against. */
  orderNumber: string;
  claimItems: CreateClaimItemInput[];
  /** Trendyol customer ID (the one who placed the order). */
  customerId?: number;
  /** Suppress this claim from listing pages. */
  excludeListing?: boolean;
  /** Force a new shipment package to be created for the return. */
  forcePackageCreation?: boolean;
  /**
   * Cargo company of the return shipment (`17` is Trendyol Express). Optional
   * in the reference, but Trendyol refuses the claim without it ("ShipmentCompanyId:
   * 0 hatalıdır", stage 2026-10-14).
   */
  shipmentCompanyId?: number;
}

/** Result of `claims.create()`. */
export interface CreateClaimResult {
  claimId?: string;
  /** One id per claimed unit. */
  claimItemIds: string[];
  /** Tracking number of the return shipment. */
  cargoTrackingNumber?: string;
  /** Untouched raw response. */
  raw: unknown;
}

/**
 * Payload for `claims.createIssue()` — file a seller-side rejection
 * ("ret talebi") against a customer claim. Wire format is
 * `multipart/form-data` because optional `files` are PDF / JPEG
 * supporting documents.
 */
export interface CreateClaimIssueInput {
  /** Numeric reason ID from `claims.getIssueReasons()`. */
  claimIssueReasonId: number;
  /** Per-line claim item IDs being rejected. SDK joins with commas. */
  claimItemIdList: string[];
  /** Free-text explanation (≤500 chars). */
  description: string;
  /** Optional supporting documents (Blob / File). */
  /**
   * Evidence (PDF, JPEG, …). Send at least one: stage answered a request
   * without a file with a bare 400 "Request Failed" (2026-10-14).
   */
  files?: Blob[];
}

/** Payload for `claims.approveLineItems()`. */
export interface ApproveClaimLineItemsInput {
  /** Claim line-item IDs to approve. */
  claimLineItemIdList: string[];
  /** Optional extra params Trendyol forwards verbatim. */
  params?: Record<string, string>;
}

/**
 * Claim item lifecycle state. Open enum — Trendyol can add new states
 * without breaking callers.
 */
export type ClaimItemStatus =
  | 'Created'
  | 'WaitingInAction'
  | 'WaitingFraudCheck'
  | 'Accepted'
  | 'Unresolved'
  | 'Rejected'
  | (string & {});

/** Filter / pagination for `claims.list()`. */
export interface ListClaimsParams extends CursorPaginationParams {
  startDate?: Date;
  endDate?: Date;
  /** Filter claims by item-level status. */
  claimItemStatus?: ClaimItemStatus;
  /** Claims of one order. */
  orderNumber?: string;
  /** Specific claims (sent comma-separated). */
  claimIds?: (string | number)[];
}

/**
 * A return claim. Trendyol returns ~20 fields; the SDK surfaces the
 * stable subset and keeps everything else on `raw`.
 */
export interface Claim {
  /** Claim ID (Trendyol returns it under both `id` and `claimId` — same value). */
  id: string;
  orderNumber: string;
  /** ISO 8601 UTC (from ms-epoch `orderDate`). */
  orderDate?: string;
  /** ISO 8601 UTC (from ms-epoch `claimDate`). */
  claimDate?: string;
  customerFirstName?: string;
  customerLastName?: string;
  /** Untouched raw claim — pull undocumented fields from here. */
  raw: Record<string, unknown>;
}

/** Rejection-reason catalog row from `claims.getIssueReasons()`. */
export interface ClaimIssueReason {
  id: number;
  name: string;
}

/**
 * Audit entry for a single claim item, returned by `claims.getItemAudits()`.
 * Trendyol's response shape varies; only `raw` is guaranteed.
 */
export interface ClaimItemAudit {
  /** Untouched raw audit row. */
  raw: Record<string, unknown>;
}
