import { ValidationError } from '@lonca/core';
import type { N11Transport } from '../transport.js';
import { asArray, asObject } from '../soap/xml.js';
import { text } from '../soap/values.js';

/** One n11 catalogue product from `catalog.search`. */
export interface N11CatalogProduct {
  catalogId: string;
  title?: string;
  categoryId?: string;
  categoryName?: string;
  /** GTIN / barcode (`usc`). */
  barcode?: string;
}

/** Filters for `catalog.search`. */
export interface SearchN11CatalogParams {
  /** Up to 10 catalogue ids. When given, every other filter is ignored by n11. */
  catalogIds?: readonly (string | number)[];
  /** Up to 10 GTINs / barcodes. When given (and no `catalogIds`), other filters are ignored. */
  barcodes?: readonly string[];
  /** Up to 10 titles of at least 10 characters each; needs `categoryId`. */
  titles?: readonly string[];
  /** One category id; needs `titles` or `brandName`. */
  categoryId?: string | number;
  /** One brand name. */
  brandName?: string;
  /** 0-based page. */
  page?: number;
}

/** Result of `catalog.search`. */
export interface N11CatalogSearchResult {
  items: N11CatalogProduct[];
  /** n11's `warning`, when it sends one. */
  warning?: string;
}

const MAX_VALUES = 10;
const MIN_TITLE_LENGTH = 10;

/**
 * n11 catalogue search (SOAP `CatalogService` → `SearchCatalog`), the first
 * step of "fast" product upload: a `catalogId` or `barcode` from here can be
 * sent to `products.create`.
 *
 * Source: developer.n11.com → "Katalog Servisi ve Hızlı Ürün Yükleme" and the
 * WSDL. Verified on n11's test store on 2026-10-13 (title + category search
 * returns matches; an unknown barcode returns none).
 */
export class CatalogResource {
  constructor(private readonly transport: N11Transport) {}

  /**
   * Search the catalogue. n11's rules, checked before sending: at most 10
   * values per list, titles of at least 10 characters, a title search needs
   * `categoryId`, and a `categoryId` needs `titles` or `brandName`.
   */
  async search(params: SearchN11CatalogParams): Promise<N11CatalogSearchResult> {
    for (const [name, list] of [
      ['catalogIds', params.catalogIds],
      ['barcodes', params.barcodes],
      ['titles', params.titles],
    ] as const) {
      if (list && list.length > MAX_VALUES) {
        throw new ValidationError({
          message: `catalog.search: ${name} accepts at most ${MAX_VALUES} values`,
        });
      }
    }
    const byId = Boolean(params.catalogIds?.length || params.barcodes?.length);
    if (!byId) {
      if (params.titles?.some((t) => t.length < MIN_TITLE_LENGTH)) {
        throw new ValidationError({
          message: `catalog.search: titles must be at least ${MIN_TITLE_LENGTH} characters`,
        });
      }
      if (params.titles?.length && params.categoryId === undefined) {
        throw new ValidationError({ message: 'catalog.search: a title search needs categoryId' });
      }
      if (params.categoryId !== undefined && !params.titles?.length && !params.brandName) {
        throw new ValidationError({
          message: 'catalog.search: categoryId needs titles or brandName',
        });
      }
      if (params.categoryId === undefined && !params.brandName) {
        throw new ValidationError({ message: 'catalog.search: give at least one filter' });
      }
    }
    const response = await this.transport.soap({
      service: 'catalogService',
      operation: 'SearchCatalog',
      fields: {
        productTitles: params.titles?.join(','),
        categoryId: params.categoryId === undefined ? undefined : String(params.categoryId),
        uscs: params.barcodes?.join(','),
        brandName: params.brandName,
        catalogIds: params.catalogIds?.join(','),
        currentPage: params.page ?? 0,
      },
    });
    const items = asArray(asObject(response.searchResponses).searchResponse).flatMap((group) =>
      asArray(asObject(asObject(group).products).product).map((node) => {
        const p = asObject(node);
        const product: N11CatalogProduct = { catalogId: text(p.catalogId) ?? '' };
        const title = text(p.productTitle);
        const categoryId = text(p.categoryId);
        const categoryName = text(p.categoryName);
        const barcode = text(p.usc);
        if (title) product.title = title;
        if (categoryId) product.categoryId = categoryId;
        if (categoryName) product.categoryName = categoryName;
        if (barcode) product.barcode = barcode;
        return product;
      }),
    );
    const result: N11CatalogSearchResult = { items };
    const warning = text(response.warning);
    if (warning) result.warning = warning;
    return result;
  }
}
