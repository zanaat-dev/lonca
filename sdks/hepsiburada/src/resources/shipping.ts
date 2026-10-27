import { TokenBucketRateLimiter, ValidationError, type MutationResult } from '@lonca/core';
import type { HepsiburadaTransport } from '../transport.js';
import type { CargoFirm, ShippingProfile, ShippingProfileInput } from '../types/shipping.js';

const SERVICE = 'shipping' as const;

/**
 * Unwrap a list response. Hepsiburada's shipping surface wraps rows under an
 * endpoint-specific key (`cargoFirms`, `profiles`) rather than a bare array or
 * the generic `items`/`data` envelopes — so a non-array response would silently
 * drop every row without these keys. Tries bare array → `items` → `data` →
 * caller-supplied keys.
 */
function unwrapShippingRows(data: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const key of ['items', 'data', ...keys]) {
      const value = (data as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

interface WireCargoFirm {
  id?: string | number;
  name?: string;
  code?: string;
  [key: string]: unknown;
}

/**
 * A label group as `/cargoFirms/{merchantId}` sends it (verified on SIT,
 * 2026-10-27): `{ labelId, labelName, labelDisplayName, labelDisplayOrder,
 * cargoFirms: [{ cargoFirmId, cargoFirmName, … }] }`.
 */
interface WireCargoFirmLabel {
  labelId?: number;
  labelName?: string;
  labelDisplayName?: string;
  cargoFirms?: unknown;
  [key: string]: unknown;
}

/**
 * Map one `getCargoFirms` row. A label group becomes one row per nested
 * firm, carrying the label's id and names; a flat row (an older or
 * different shape) is mapped as it is.
 */
function normalizeCargoFirmRows(row: unknown): CargoFirm[] {
  const r = (row && typeof row === 'object' ? row : {}) as WireCargoFirmLabel & WireCargoFirm;
  if (Array.isArray(r.cargoFirms)) {
    return r.cargoFirms.map((f) => {
      const firm = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>;
      const out: CargoFirm = { raw: firm };
      if (typeof firm.cargoFirmId === 'number' || typeof firm.cargoFirmId === 'string') {
        out.id = firm.cargoFirmId;
      }
      if (typeof firm.cargoFirmName === 'string') out.name = firm.cargoFirmName;
      if (typeof r.labelId === 'number') out.labelId = r.labelId;
      if (typeof r.labelName === 'string') out.labelName = r.labelName;
      if (typeof r.labelDisplayName === 'string') out.labelDisplayName = r.labelDisplayName;
      return out;
    });
  }
  const out: CargoFirm = { raw: r as Record<string, unknown> };
  if (r.id !== undefined) out.id = r.id;
  if (r.name !== undefined) out.name = r.name;
  if (r.code !== undefined) out.code = r.code;
  return [out];
}

interface WireProfile {
  profileName?: string;
  /** The profile name as `listProfiles` sends it (verified on SIT, 2026-10-14). */
  name?: string;
  [key: string]: unknown;
}

/**
 * Hepsiburada Shipping (`shipping-entegrasyonu`) — cargo firm catalog +
 * merchant shipping profile management.
 *
 * **Service base URL**: `shipping-external[-sit].hepsiburada.com`.
 *
 * Hepsiburada's published OpenAPI for this surface lists 4 paths but
 * leaves body schemas / response schemas empty. The SDK exposes the
 * documented paths typed and accepts loose `Record<string, unknown>`
 * payloads — see the developer-portal doc page for field rules.
 */
export class ShippingResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: HepsiburadaTransport,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 60, intervalMs: 60_000 });
  }

  /**
   * List the cargo firms Hepsiburada supports for the merchant, one row per
   * firm and label.
   *
   * Hepsiburada groups the firms by label (`LowDeci`, `HighDeci`,
   * `SpecialDelivery`, `International`, `ExpressDelivery`, …), so a firm in
   * two labels (HepsiJet is in `LowDeci` and `SpecialDelivery` on SIT)
   * appears twice, once with each `labelId`.
   */
  async getCargoFirms(): Promise<CargoFirm[]> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `/cargoFirms/${encodeURIComponent(this.transport.merchantId)}`,
      rateLimiter: this.limiter,
    });
    // Hepsiburada returns this list under a `cargoFirms` key (verified live),
    // not a bare array / `items` / `data` — so include it in the unwrap.
    return unwrapShippingRows(data, 'cargoFirms').flatMap(normalizeCargoFirmRows);
  }

  /** List the merchant's configured shipping profiles. */
  async listProfiles(): Promise<ShippingProfile[]> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `/profiles/${encodeURIComponent(this.transport.merchantId)}`,
      rateLimiter: this.limiter,
    });
    // Returned under a `profiles` key (verified live), not a bare array.
    const rows = unwrapShippingRows(data, 'profiles');
    return rows.map((r) => {
      const row = r as WireProfile;
      const out: ShippingProfile = { raw: row as Record<string, unknown> };
      const profileName = row.profileName ?? row.name;
      if (profileName !== undefined) out.profileName = profileName;
      return out;
    });
  }

  /**
   * Create a new shipping profile. Resolves to a `MutationResult` — the
   * portal publishes no response schema for this surface, so the body is
   * left untouched on `raw`.
   *
   * @throws {ValidationError} when `input` is empty / missing fields HB requires.
   */
  async createProfile(input: ShippingProfileInput): Promise<MutationResult> {
    if (!input || typeof input !== 'object') {
      throw new ValidationError({ message: 'shipping.createProfile: input is required' });
    }
    return {
      raw: await this.transport.request<unknown>({
        method: 'POST',
        service: SERVICE,
        path: `/profile/createByMerchantId`,
        body: this.profileBody(input),
        rateLimiter: this.limiter,
      }),
    };
  }

  /** Update an existing shipping profile. Same body shape (and `MutationResult`) as `createProfile`. */
  async updateProfile(input: ShippingProfileInput): Promise<MutationResult> {
    if (!input || typeof input !== 'object') {
      throw new ValidationError({ message: 'shipping.updateProfile: input is required' });
    }
    return {
      raw: await this.transport.request<unknown>({
        method: 'PUT',
        service: SERVICE,
        path: `/profile/updateByMerchantId`,
        body: this.profileBody(input),
        rateLimiter: this.limiter,
      }),
    };
  }

  /**
   * The `*ByMerchantId` paths carry no merchant id, so Hepsiburada reads it
   * from the body and answers `403 "Auth Error"` without it (verified on SIT,
   * 2026-10-14). A caller-supplied `merchantId` wins.
   */
  private profileBody(input: ShippingProfileInput): ShippingProfileInput {
    return { merchantId: this.transport.merchantId, ...input };
  }
}
