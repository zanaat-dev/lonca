/**
 * Hepsiburada Claims (Talep) types.
 *
 * Two backend services back this surface:
 *   - `talep-listeleme` (oms-external)        — list + accept / reject / preApproval
 *   - `talep-olusturma` (claim-stub-external) — create
 *
 * The developer portal publishes both definitions (`talep-listeleme`,
 * `talep-olusturma`); they are not in `specs/hepsiburada`. The SDK types the
 * documented body fields as hints, keeps the bodies open
 * (`Record<string, unknown>`) and surfaces responses with a typed envelope +
 * a `raw` escape hatch.
 */

/**
 * Allowed values for `claims.listByStatus(status)`. The published OpenAPI
 * spec types this as a string enum:
 * `NewRequest | Accepted | AwaitingAction | InDispute | Rejected |
 * Refunded | Cancelled | AwaitingPreApproval`. Trendyol's `Open` / `Closed`
 * naming does **not** apply — Hepsiburada returns
 * `400 "Wrong Claim Status"` for any other value.
 *
 * Open-ended to allow forward-compatibility if Hepsiburada adds a new
 * status without an SDK release; explicit literals are intellisense-friendly.
 */
export type ClaimStatus =
  | 'NewRequest'
  | 'Accepted'
  | 'AwaitingAction'
  | 'InDispute'
  | 'Rejected'
  | 'Refunded'
  | 'Cancelled'
  | 'AwaitingPreApproval'
  | (string & {});

/** A single claim row surfaced by `claims.list*()`. */
export interface Claim {
  claimNumber?: string;
  status?: ClaimStatus;
  /** ISO 8601-ish; Hepsiburada returns a server-local string. */
  createdAt?: string;
  /** Untouched raw row — pull full claim fields from here. */
  raw: Record<string, unknown>;
}

/** Filter / pagination params for `claims.list()`. */
export interface ListClaimsParams {
  /** Format: `yyyy-MM-dd HH:mm` (Hepsiburada's documented spelling). */
  beginDate?: string;
  /** Format: `yyyy-MM-dd HH:mm`. */
  endDate?: string;
  offset?: number;
  limit?: number;
}

/** Filter / pagination params for `claims.listByStatus()`. */
export interface ListClaimsByStatusParams extends ListClaimsParams {
  /** Filter on the claim's status-change date. */
  statusBeginDate?: string;
  /** Filter on the claim's status-change date. */
  statusEndDate?: string;
}

/**
 * Payload for `claims.create()` — the portal's `CreateClaim` (`talep-olusturma`,
 * a test-environment helper): `{ orderNumber, type, reason, newSKU }`. The
 * `& Record<string, unknown>` keeps the body open so extra fields still pass
 * through verbatim.
 */
export type CreateClaimInput = {
  /** Order to open the claim on. */
  orderNumber?: string;
  /**
   * Claim type: `change`, `missingitem`, `missingpart`, `missinginvoice`,
   * `extraproduct`, `return` or `renewproduct`.
   */
  type?:
    | 'change'
    | 'missingitem'
    | 'missingpart'
    | 'missinginvoice'
    | 'extraproduct'
    | 'return'
    | 'renewproduct'
    | (string & {});
  /** Claim reason: `ProductIsBroken`, `ProductIsDamaged` or `WrongProductSentByMerchant`. */
  reason?: 'ProductIsBroken' | 'ProductIsDamaged' | 'WrongProductSentByMerchant' | (string & {});
  /** SKU requested in exchange (`change` / `renewproduct`). */
  newSKU?: string;
  /** @deprecated Not part of Hepsiburada's `CreateClaim` body. Will be removed in the next major. */
  lines?: unknown[];
} & Record<string, unknown>;

/**
 * Payload for `claims.accept()` / `claims.reject()` / `claims.preApprovalConfirm()`
 * — the portal's `AcceptClaimRequest`, `RejectClaimRequest` and
 * `PreApprovalConfirmRequest` (`talep-listeleme`). The fields are typed as
 * hints and the body stays open for the rest.
 */
export type ClaimActionInput = {
  /**
   * `accept`: how the claim is settled — `Refund` (pay the money back) or
   * `Change` (send a new product). An exchange claim accepted without a body
   * is settled as `Change`.
   */
  FinalizedWith?: 'Refund' | 'Change' | (string & {});
  /**
   * `accept`: reason for settling a new-product claim with a refund —
   * `StockProblem`, `ProductNotDefective` or `Other`.
   */
  AcceptionReason?: string;
  /** `accept`: invoice link. */
  InvoiceLink?: string;
  /**
   * `reject`: rejection reason from Hepsiburada's list, e.g.
   * `CustomerReturnedWrongItem`, `ProductIsDamaged`, `MissingQuantity`,
   * `ProductNotDefective` (returns and renewals) or `ProductSentComplete`,
   * `MissingItemOrPartCannotBeSupplied`, `Other` (missing item / part).
   */
  ClaimRejectionReason?: string;
  /**
   * `reject`: the merchant's statement. A reject with only this field was
   * accepted (`204`, SIT 2026-10-27); an empty body is refused.
   */
  MerchantStatement?: string;
  /** `reject`: report references. */
  Reports?: string[];
  /** `reject`: URLs of uploaded reports. */
  UploadedReportsUrls?: string[];
  /**
   * `preApprovalConfirm`: the only accepted value is `ProductInvestigation`
   * ("send the product to me, I will inspect it"); the SDK sends it when the
   * input has none.
   */
  preApprovalReason?: 'ProductInvestigation' | (string & {});
  /**
   * @deprecated Hepsiburada reads no `reasonCode`. Use `ClaimRejectionReason`
   *   (`reject`) or `AcceptionReason` (`accept`). Will be removed in the next major.
   */
  reasonCode?: string;
  /**
   * @deprecated Hepsiburada reads no `confirmed` flag; `preApprovalConfirm`
   *   needs `preApprovalReason` (the SDK fills it in). Will be removed in the
   *   next major.
   */
  confirmed?: boolean;
} & Record<string, unknown>;
