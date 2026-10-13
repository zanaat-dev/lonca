import { createStatusNormalizer, type NormalizedOrderStatus } from '@lonca/core';
import type { KnownN11PackageStatus } from './types/order.js';

/**
 * Exhaustive map from n11's documented shipment-package statuses to the
 * marketplace-agnostic {@link NormalizedOrderStatus} vocabulary.
 *
 * Because the key type is the **closed** {@link KnownN11PackageStatus} union,
 * adding a value there without mapping it here is a compile-time error. n11
 * has no `Invoiced` or `Returned` package status (returns are claims).
 */
export const statusMap: Record<KnownN11PackageStatus, NormalizedOrderStatus> = {
  Created: 'created',
  Picking: 'picking',
  Unpacked: 'picking', // the original package after a split; its lines live on in new packages
  Shipped: 'shipped',
  Delivered: 'delivered',
  Cancelled: 'cancelled',
  UnSupplied: 'cancelled', // the seller could not supply (split-and-cancel) → effectively cancelled
};

/**
 * Normalize a raw n11 package status into the {@link NormalizedOrderStatus}
 * vocabulary. Unknown raw values resolve to `{ normalized: 'unknown', mapped:
 * false }` with the raw string preserved.
 */
export const normalizeStatus = createStatusNormalizer(statusMap);
