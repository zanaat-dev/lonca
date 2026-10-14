/**
 * Hepsiburada Shipping types.
 *
 * Source: developers.hepsiburada.com/api/v1/public/docs/hepsiburada/shipping-entegrasyonu/v1.0/openapi
 *
 * Hepsiburada's published OpenAPI for this surface only lists paths and
 * the names of body schemas (`ShippingProfileExternalRequest`,
 * `ShippingProfileExternalResponse`) — the schemas themselves aren't in
 * the components block. The SDK keeps the typed surface conservative
 * (input/output declared as `Record<string, unknown>`) and points at the
 * portal doc for full field rules.
 */

/** One cargo firm row returned by `shipping.getCargoFirms()`. */
export interface CargoFirm {
  id?: string | number;
  name?: string;
  code?: string;
  /** Untouched raw row — pull undocumented fields from here. */
  raw: Record<string, unknown>;
}

/**
 * Shipping profile shape — used by both `shipping.createProfile()` and
 * `shipping.updateProfile()`. Hepsiburada's portal documents the field
 * set under "Profil Oluşturma" / "Profil Güncelleme"; the SDK accepts
 * any object so future field additions don't require a release bump.
 */
export interface ShippingProfileInput {
  /**
   * Profile id, as `listProfiles()` returns it (`raw.id`). Required by
   * `updateProfile()`: without it Hepsiburada answers `500` (verified on SIT,
   * 2026-10-14).
   */
  id?: string;
  /** Profile name. This is the field Hepsiburada stores (verified on SIT, 2026-10-14). */
  name?: string;
  /**
   * @deprecated Hepsiburada ignores this field (an update carrying only
   * `profileName` clears the stored name). Use `name`.
   */
  profileName?: string;
  /** CSV / array of cargo firm codes the profile supports. */
  cargoFirms?: string[] | string;
  /** Free-form extra fields Hepsiburada accepts. */
  [key: string]: unknown;
}

/** One shipping profile row returned by `shipping.listProfiles()`. */
export interface ShippingProfile {
  /** The profile name (the wire's `name`). */
  profileName?: string;
  /** Untouched raw row — see the portal docs for the documented field set. */
  raw: Record<string, unknown>;
}
