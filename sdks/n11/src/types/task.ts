/**
 * Product write tasks (`POST /ms/product/tasks/*`) and their results
 * (`POST /ms/product/task-details/page-query`).
 *
 * Every product write is asynchronous: n11 queues a task and answers with its
 * id; the per-SKU outcome is read later from task details. Shapes verified on
 * n11's test store on 2026-10-13.
 */

/** Which task service created the task. `SKU_UPDATE` is the price/stock service. */
export type N11TaskType =
  'PRODUCT_CREATE' | 'PRODUCT_UPDATE' | 'SKU_UPDATE' | 'PRODUCT_DELETE' | (string & {});

/**
 * Task state. `IN_QUEUE`: still running. `PROCESSED`: every SKU has a final
 * result. `REJECT`: the task was not processed at all.
 */
export type N11TaskStatus = 'IN_QUEUE' | 'PROCESSED' | 'REJECT' | (string & {});

/** Per-SKU outcome inside a task. */
export type N11TaskItemStatus = 'SUCCESS' | 'FAIL' | (string & {});

/** What a task service answers when a task is queued. */
export interface N11ProductTask {
  /** Task id; pass it to `products.getTask` / `products.waitForTask`. */
  taskId: string;
  type: N11TaskType;
  /** `IN_QUEUE` on success (a `REJECT` answer is thrown as `ValidationError`). */
  status: N11TaskStatus;
  /** n11's messages, e.g. `"3 sku işlenmeye alındı."`. */
  reasons: string[];
}

/** The result for one SKU of a task. */
export interface N11TaskItemResult {
  /** The SKU's `stockCode` (n11's `itemCode`). */
  stockCode: string;
  status: N11TaskItemStatus;
  /** n11's messages: `"Başarıyla tamamlandı."` on success, the failure reason otherwise. */
  reasons: string[];
  /** n11 product code, present on successful create and update results. */
  n11ProductId?: string;
  /** The untouched row, including n11's echo of the SKU (`sku`). */
  raw: Record<string, unknown>;
}

/** Task details: the task state plus one result per SKU that has finished. */
export interface N11TaskDetails {
  taskId: string;
  status: N11TaskStatus;
  /**
   * Finished SKUs. While the task is `IN_QUEUE`, n11 also returns a placeholder
   * row without a stock code (status `FAIL`, reason `"N sku işlenmeye
   * alındı."`); the SDK drops it, so this list only holds real results.
   */
  items: N11TaskItemResult[];
  successCount: number;
  failCount: number;
  /**
   * n11's timestamps as sent (`dd-MM-yyyy hh:mm:ss`). They are a 12-hour clock
   * with no AM/PM marker (a task created at 22:58 Turkish time reads
   * `10:58:24`), so the SDK does not convert them.
   */
  createdDate?: string;
  modifiedDate?: string;
}

/** Options for {@link N11TaskDetails} polling (`products.waitForTask`, `inventory.updateAndWait`). */
export interface N11TaskPollOptions {
  /** Delay between polls, in ms. Default: `2000`. */
  pollIntervalMs?: number;
  /**
   * Total time to wait before throwing `TimeoutError`, in ms. Default:
   * `120000`. A create task whose image n11 has to fetch can stay `IN_QUEUE`
   * for many minutes.
   */
  timeoutMs?: number;
  /** Abort the wait early. */
  signal?: AbortSignal;
}

/** Currencies the task services accept. USD and EUR prices follow the central bank rate. */
export type N11CurrencyType = 'TL' | 'USD' | 'EUR';

/** VAT rates n11 accepts. */
export type N11VatRate = 0 | 1 | 10 | 20;

/** One attribute value on a create or update. */
export interface N11ProductAttributeInput {
  /** Attribute id from `categories.getAttributes` (`1` is the brand, "Marka"). */
  id: string | number;
  /** A value id from the attribute's list. Omit when sending `customValue`. */
  valueId?: string | number | null;
  /** A free value, allowed when the attribute has `isCustomValue: true`. */
  customValue?: string | null;
}

/** One SKU for `products.create` (`POST /ms/product/tasks/product-create`). */
export interface N11ProductCreateItem {
  /** Your unique code for the SKU (max 255 characters); every later update uses it. */
  stockCode: string;
  /** Product name. n11 re-capitalises it (observed). */
  title: string;
  /** HTML description. */
  description: string;
  /** A leaf category id from `categories.list`. */
  categoryId: string | number;
  /** Shared by every variant of one model; variants need variant attributes too. */
  productMainId: string;
  /** Days needed to hand the item to the carrier. */
  preparingDay: number;
  /** Name of a shipment template from Seller Office (Hesabım → Teslimat Bilgilerim). */
  shipmentTemplate: string;
  /** Stock, at most 999,999. */
  quantity: number;
  /** Sale price in major units, at most 2 decimals. */
  salePrice: number;
  /** List price ("PSF") in major units, at most 2 decimals, not below `salePrice`. */
  listPrice: number;
  /** Default: `'TL'`. */
  currencyType?: N11CurrencyType;
  vatRate: N11VatRate;
  /** HTTPS image URLs, at most 10 MB each. */
  images: { url: string; order: number }[];
  /** Attribute values; every `isMandatory` attribute of the category is required. */
  attributes: N11ProductAttributeInput[];
  /** Per-buyer purchase limit. */
  maxPurchaseQuantity?: number;
  /** n11 catalogue id, to list against an existing catalogue product. */
  catalogId?: string | number | null;
  /** National barcode; a catalogue match opens the product as "awaiting seller approval". */
  barcode?: string;
}

/**
 * One SKU for `products.update` (`POST /ms/product/tasks/product-update`).
 * Send `stockCode` plus at least one other field; fields you leave out are not
 * changed. Title, brand and other base attributes can only be changed by n11.
 */
export interface N11ProductUpdateItem {
  stockCode: string;
  /** `'Active'` to sell, `'Suspended'` to take the product off sale. */
  status?: 'Active' | 'Suspended';
  preparingDay?: number;
  shipmentTemplate?: string;
  /**
   * Model code. n11 keeps it empty on a product it has matched to a catalogue
   * product (`catalogId` set): the task still reports `SUCCESS`, but the code
   * is not stored (observed on n11's test store, 2026-10-14).
   */
  productMainId?: string;
  /** `true` removes the `productMainId`. */
  deleteProductMainId?: boolean;
  maxPurchaseQuantity?: number;
  /** `true` removes the purchase limit. */
  deleteMaxPurchaseQuantity?: boolean;
  description?: string;
  vatRate?: N11VatRate;
  /** Product-safety and nutrition attributes only (each needs `id`, `valueId`, `customValue`). */
  attributes?: N11ProductAttributeInput[];
}

/**
 * One SKU for `inventory.update` (`POST /ms/product/tasks/price-stock-update`).
 * Send a stock, a price pair, or both. A price change needs `salePrice` and
 * `listPrice` together (n11 fails a lone `salePrice` with "list price boş
 * olamaz").
 */
export interface N11PriceStockUpdate {
  stockCode: string;
  quantity?: number;
  /** Major units, at most 2 decimals. */
  salePrice?: number;
  /** Major units, at most 2 decimals, not below `salePrice`. */
  listPrice?: number;
  currencyType?: N11CurrencyType;
}
