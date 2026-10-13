import type { MarketplaceCapabilities } from '@lonca/core';

/**
 * Static feature-capability flags for n11, derived from the developer portal;
 * `stockOnlyBatch` and `listingUpdatedAt` were confirmed on n11's test store
 * (2026-10-13). Same contract as the Trendyol and
 * Hepsiburada SDKs, so a missing or renamed flag is a compile error.
 */
export const n11Capabilities = {
  /** No time-bounded / scheduled pricing is documented. */
  scheduledPricing: false,
  /**
   * `POST /ms/product/tasks/price-stock-update` accepts `quantity` without
   * prices ("fields you do not send are not updated"; a stock-only task
   * succeeded on the test store).
   */
  stockOnlyBatch: true,
  /** `GET /ms/product-query` rows carry no last-update timestamp. */
  listingUpdatedAt: false,
} as const satisfies MarketplaceCapabilities;

/** Shape of {@link n11Capabilities}. */
export type N11Capabilities = typeof n11Capabilities;
