/**
 * Hepsiburada Catalog/Category types.
 *
 * Source: `katalog-urun-entegrasyonu` v1.0 (developers.hepsiburada.com) +
 * discovery-first against `mpop[-sit].hepsiburada.com/product/api/*`.
 *
 * The catalog API uses a **Spring-style** wrapped pagination envelope
 * (`{ success, code, version, message, totalElements, totalPages, number,
 * numberOfElements, first, last, data: T[] }`) distinct from the OMS shape.
 * `categories.list` maps it onto the shared `OffsetPage<T>` (see
 * {@link CatalogPage}).
 */

import type { OffsetPage } from '@lonca/core';
import type { CatalogPagingParams } from './catalog-product.js';

/**
 * Page returned by `categories.list()` — the shared `OffsetPage<T>` shape from
 * `@lonca/core` (`items`, `totalCount`, `limit`, `offset`, `pageCount`, so it
 * plugs straight into `paginateOffset`) mapped from Hepsiburada's Spring
 * envelope: `totalElements` → `totalCount`, `totalPages` → `pageCount`,
 * `data` → `items`, `number × limit` → `offset`.
 *
 * The Spring fields the SDK exposed before are still present but
 * **deprecated** — they will be dropped in a later minor, at which point this
 * becomes a plain alias of `OffsetPage<T>`. Migrate `.data` → `.items`,
 * `.totalElements` → `.totalCount`, `.totalPages` → `.pageCount`.
 */
export interface CatalogPage<T> extends OffsetPage<T> {
  /** @deprecated Use `offset / limit` — the zero-based page index. */
  number: number;
  /** @deprecated Use `pageCount`. */
  totalPages: number;
  /** @deprecated Use `totalCount`. */
  totalElements: number;
  /** @deprecated Use `items.length`. */
  numberOfElements: number;
  /** @deprecated Derive from `offset === 0`. */
  first: boolean;
  /** @deprecated Derive from `offset + limit >= totalCount`. */
  last: boolean;
  /** @deprecated An empty result is surfaced as an empty page; `success` carries no extra signal. */
  success: boolean;
  /** @deprecated Hepsiburada's own status code (`0` on success; `4008` / `4014` for an empty result). */
  code: number;
  /** @deprecated Hepsiburada's own status message. */
  message: string | null;
  /** @deprecated Use `items`. */
  data: T[];
}

/** Wrapper for non-paged responses (e.g. category attributes). */
export interface CatalogResult<T> {
  success: boolean;
  code: number;
  message: string | null;
  data: T;
}

/**
 * Query parameters for `categories.list()`. Paging is either Hepsiburada's
 * `page` / `size` or the `paginateOffset`-style `offset` / `limit` alias —
 * see {@link CatalogPagingParams}.
 */
export interface ListCategoriesParams extends CatalogPagingParams {
  /** Restrict to leaf (listable) categories. */
  leaf?: boolean;
  /** Filter by status string (`ACTIVE`, `INACTIVE`, …). */
  status?: string;
  /** Restrict to currently-available categories. */
  available?: boolean;
}

/** One row in the category tree. */
export interface Category {
  categoryId: number;
  name: string;
  displayName: string;
  parentCategoryId: number;
  paths: string[];
  leaf: boolean;
  status: string;
  type: string;
  sortId?: string;
  available: boolean;
  productTypes: unknown[];
  merge: boolean;
}

/** Query parameters for `categories.getAttributes()`. */
export interface GetAttributesParams {
  /** ISO timestamp — only return attributes modified at-or-after this. */
  modifiedAtSince?: string;
}

/**
 * One attribute definition for a leaf category (an element of
 * `data.baseAttributes[]` / `data.attributes[]` / `data.variantAttributes[]`
 * of `GET /product/api/categories/{categoryId}/attributes` — spec
 * `mpop-catalog.json`, confirmed on the prod wire 2026-10).
 */
export interface CategoryAttribute {
  /** Attribute id — a string on the wire; kept wide for back-compat. */
  id?: number | string;
  name?: string;
  /** Whether a product in this category must set the attribute. */
  mandatory?: boolean;
  /** Attribute value type, passed through as Hepsiburada spells it. */
  type?: string;
  /** Whether the attribute accepts more than one value. */
  multiValue?: boolean;
  /**
   * @deprecated Neither documented nor sent by Hepsiburada — never populated.
   *   Use {@link name}. Will be removed in the next major.
   */
  externalName?: string;
  /**
   * @deprecated The attributes endpoint does not inline allowed values — never
   *   populated. Fetch them with `categories.getAttributeValues(categoryId, id)`.
   *   Will be removed in the next major.
   */
  values?: unknown[];
  /**
   * Which bucket this attribute came from. Hepsiburada returns a leaf
   * category's attributes in three groups — `base` (common), `category`
   * (category-specific), and `variant` (variant-defining) — flattened into one
   * list here, with this tag so callers can tell them apart.
   */
  group?: 'base' | 'category' | 'variant';
  /** Untouched raw attribute object. */
  raw: Record<string, unknown>;
}

/** One attribute-value option (for enum-style attributes). */
export interface CategoryAttributeValue {
  id?: number | string;
  /** The value's label (the wire's `value`, or `name` where a row carries one). */
  name?: string;
  externalName?: string;
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}
