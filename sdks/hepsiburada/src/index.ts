/**
 * Type-safe client for the Hepsiburada marketplace API.
 *
 * @module @lonca/hepsiburada
 */

export {
  createHepsiburadaClient,
  type CreateClientOptions,
  type HepsiburadaClient,
} from './client.js';
export { statusMap, normalizeStatus, type KnownHepsiburadaOrderStatus } from './status.js';
export { hepsiburadaCapabilities, type HepsiburadaCapabilities } from './capabilities.js';
export {
  parseWebhookEvent,
  /** @deprecated Use `parseWebhookEvent` instead. The legacy name will be
   * removed in a future minor release. */
  parseHepsiburadaWebhookEvent,
} from './parse-webhook-event.js';
export {
  CLAIM_WEBHOOK_EVENTS,
  HEPSIBURADA_WEBHOOK_EVENTS,
  ORDER_WEBHOOK_EVENTS,
  type ClaimWebhookEvent,
  type HepsiburadaWebhookEvent,
  type OrderWebhookEvent,
  type ParsedHepsiburadaWebhookEvent,
} from './types/webhook-event.js';
export { type HepsiburadaEnvironment } from './transport.js';
// Pagination helpers re-exported from @lonca/core so consumers can iterate list
// endpoints (which return `OffsetPage`/`CursorPage`) without taking a direct
// @lonca/core dependency.
export {
  paginate,
  paginateOffset,
  type CursorPage,
  type CursorPaginationParams,
  type OffsetPage,
  type OffsetPaginationParams,
  type MutationResult,
} from '@lonca/core';
export { ListingsResource } from './resources/listings.js';
export { ShippingResource } from './resources/shipping.js';
export { ClaimsResource } from './resources/claims.js';
export { TestOrdersResource, type CreateTestOrderInput } from './resources/test-orders.js';
export { OrdersResource } from './resources/orders.js';
export { CategoriesResource } from './resources/categories.js';
export { CatalogResource } from './resources/catalog.js';
export { ProductUpdatesResource } from './resources/product-updates.js';
export { SuppliersResource } from './resources/suppliers.js';
export { AccountingResource } from './resources/accounting.js';
export { QuestionsResource } from './resources/questions.js';
export { PromotionsResource } from './resources/promotions.js';
export type {
  AdditionalInfoUploadItem,
  BulkUnlockInput,
  BuyboxOrderRow,
  CommissionRow,
  CustomizableProperty,
  InventoryUploadItem,
  ListListingsParams,
  Listing,
  ListingPricing,
  ListingsPage,
  PriceUploadItem,
  PriceUploadResult,
  PriceValidation,
  ShippingInfoUploadItem,
  StockUploadItem,
  UpdateListingInput,
  UploadError,
  UploadReceipt,
  UploadResult,
  UploadStatus,
} from './types/listing.js';
export type { CargoFirm, ShippingProfile, ShippingProfileInput } from './types/shipping.js';
export type {
  Claim,
  ClaimActionInput,
  ClaimStatus,
  CreateClaimInput,
  ListClaimsByStatusParams,
  ListClaimsParams,
} from './types/claim.js';
export type {
  CancelLineItemInput,
  CargoCompanyOption,
  ChangeCargoCompanyInput,
  CreatePackagesInput,
  InvoiceLinkInput,
  InvoiceLinkItem,
  LaborCostInput,
  ListOrdersParams,
  ListPackagesParams,
  Order,
  OrderPrice,
  OrdersPage,
  PackageLabel,
  PackageReceipt,
  PackageStatusInput,
  ParcelInfoInput,
  ShippingPackage,
  SplitPackageDetail,
  SplitPackageInput,
  WarehouseInput,
} from './types/order.js';
export type {
  CatalogPage,
  CatalogResult,
  Category,
  CategoryAttribute,
  CategoryAttributeValue,
  GetAttributesParams,
  ListCategoriesParams,
} from './types/category.js';
export type {
  CatalogAttributePair,
  CatalogField,
  CatalogMatchedHbProduct,
  CatalogPagingParams,
  CatalogProduct,
  CatalogProductAttribute,
  CatalogProductLifecycleStatus,
  CatalogProductStatus,
  CatalogTaskDetail,
  CatalogTrackingReceipt,
  CatalogUploadProduct,
  CatalogValidationResult,
  CheckProductStatusInput,
  DeleteBySkuInput,
  DeleteBySkuItem,
  FastListingInput,
  ListCatalogProductsParams,
  ListProductsByStatusParams,
  MerchantSkuGroup,
  PreMatchActionInput,
  TrackingIdHistoryEntry,
  UploadProductsInput,
} from './types/catalog-product.js';
export type {
  ProductUpdateHistoryEntry,
  ProductUpdateInput,
  ProductUpdateItem,
  ProductUpdateReceipt,
  ProductUpdateStatus,
} from './types/product-update.js';
export type {
  CreateListingUpdateRequestInput,
  CreateListingUpdateRequestItem,
  ListingUpdateRequestDetail,
  ListingUpdateRequestItem,
  ListingUpdateRequestReceipt,
  ListingUpdateRequestSearchInput,
  ListingUpdateRequestSummary,
  OpenPurchaseOrder,
  OpenPurchaseOrderSearchInput,
  OpenPurchaseOrderStatus,
  PurchaseOrderLineRef,
  PurchaseOrderType,
  SupplierApprovalStatus,
  SupplierEnvelope,
  SupplierListing,
  SupplierListingSearchInput,
  SupplierListingStatus,
  SupplierListingType,
  SupplierSearchResult,
} from './types/supplier.js';
export type {
  AccountingAmount,
  AccountingTransaction,
  ListTransactionsParams,
} from './types/accounting.js';
export type {
  AnswerQuestionInput,
  CreateQuestionInput,
  ListQuestionsParams,
  Question,
  QuestionConversation,
  QuestionCountSummary,
  QuestionProduct,
  QuestionSubject,
  RejectQuestionInput,
} from './types/question.js';
export type {
  CancelDiscountInput,
  CreatePercentDiscountInput,
  CreateTlDiscountInput,
  CreateXyDiscountInput,
  Discount,
  DiscountBudgets,
  DiscountLimits,
  DiscountReceipt,
  ListDiscountsParams,
  PromotionCategory,
} from './types/promotion.js';
