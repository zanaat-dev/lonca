/**
 * Type-safe client for the Trendyol marketplace API.
 *
 * @module @lonca/trendyol
 */

export { createTrendyolClient, type CreateClientOptions, type TrendyolClient } from './client.js';
export { parseWebhookEvent } from './parse-webhook-event.js';
export { normalizeShipmentPackage } from './resources/orders.js';
export { statusMap, normalizeStatus } from './status.js';
export { trendyolCapabilities, type TrendyolCapabilities } from './capabilities.js';
export { type TrendyolEnvironment } from './transport.js';
// Pagination helpers re-exported from @lonca/core so consumers can iterate list
// endpoints (which return `CursorPage`/`OffsetPage`) without taking a direct
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
export { BrandsResource } from './resources/brands.js';
export {
  CategoriesResource,
  type ListCategoryAttributeValuesParams,
} from './resources/categories.js';
export { ClaimsResource } from './resources/claims.js';
export { ExportCenterResource } from './resources/export-center.js';
export { FinanceResource } from './resources/finance.js';
export {
  InventoryResource,
  pollBatchStatus,
  type BatchPollOptions,
} from './resources/inventory.js';
export { InvoicesResource } from './resources/invoices.js';
export { LabelsResource } from './resources/labels.js';
export { LocationsResource } from './resources/locations.js';
export { OrdersResource, type ListOrdersParams } from './resources/orders.js';
export {
  ProductsResource,
  type ListInventoryAndPriceParams,
  type ListProductsParams,
  type ListUnapprovedProductsParams,
  type UnapprovedDateQueryType,
} from './resources/products.js';
export { QuestionsResource } from './resources/questions.js';
export { TestOrdersResource } from './resources/test-orders.js';
export { SuppliersResource, type SuppliersResourceOptions } from './resources/suppliers.js';
export { VideosResource } from './resources/videos.js';
export { WebhooksResource } from './resources/webhooks.js';
export type { Brand } from './types/brand.js';
export type {
  BarcodeCategoryLookup,
  Category,
  CategoryAttribute,
  CategoryAttributeValue,
} from './types/category.js';
export type { PriceInventoryUpdate, UpdatePriceInventoryResponse } from './types/inventory.js';
export type {
  CareInstruction,
  ExportBatchAcceptedResponse,
  ExportBatchStatus,
  ExportCategoryAttribute,
  ExportPackage,
  ExportPackageItem,
  ExportPackageStatus,
  ExportPriceUpdateInput,
  ExportProduct,
  ExportProductInput,
  ExportStockUpdateInput,
  GetExportPackageItemsParams,
  ListExportPackagesV2Params,
  ListExportPackagesV3Params,
  ListExportProductsParams,
  ProductComposition,
  ProductOrigin,
} from './types/export-center.js';
export type {
  CreateVideoInput,
  CreateVideoResult,
  ListVideosParams,
  SellerIntegrationStatus,
  SellerVideo,
  VideoContentType,
} from './types/video.js';
export type {
  CancelPackageItemInput,
  CargoInvoiceItem,
  LaborCostInput,
  ListOrdersStreamParams,
  OrderAddress,
  OrderAddressLines,
  OrderCustomer,
  OrderLine,
  OrderLineDiscountDetail,
  PackageDetail,
  PackageHistoryEntry,
  PackageLineUpdate,
  KnownShipmentPackageStatus,
  ProcessAlternativeDeliveryInput,
  QuantitySplit,
  ShipmentPackage,
  ShipmentPackageStatus,
  SplitGroup,
  SplitPackagePlan,
  TrendyolCargoProvider,
  UpdateBoxInfoInput,
  UpdatePackageStatusInput,
} from './types/order.js';
export type {
  ApprovedProductStatus,
  BatchRequestItemResult,
  BatchRequestResult,
  BatchRequestStatus,
  BuyboxInfo,
  NamedRef,
  Product,
  ProductAttribute,
  ProductBase,
  ProductContentBase,
  ProductStockPrice,
  ProductStockPriceVariant,
  ProductVariant,
  UnapprovedProduct,
  UnapprovedProductRejectReason,
  UnapprovedProductStatus,
} from './types/product.js';
export type {
  BatchAcceptedResponse,
  CreateProductV2Input,
  DeliveryOptionInput,
  ProductAttributeV2Input,
  ProductImageInput,
  UpdateContentInput,
  UpdateDeliveryInfoInput,
  UpdateUnapprovedInput,
  UpdateVariantInput,
} from './types/product-write.js';
export type {
  ApproveClaimLineItemsInput,
  Claim,
  ClaimItemAudit,
  ClaimItemStatus,
  ClaimIssueReason,
  CreateClaimInput,
  CreateClaimIssueInput,
  CreateClaimItemInput,
  ListClaimsParams,
} from './types/claim.js';
export type {
  CompensationItemDetail,
  CompensationTicket,
  CompensationTicketState,
  ListCompensationTicketsParams,
} from './types/returns.js';
export type { SupplierAddress, SupplierAddressType } from './types/supplier-address.js';
export type {
  AnswerQuestionResult,
  ListQuestionsParams,
  Question,
  QuestionAnswer,
  QuestionStatus,
} from './types/question.js';
export type {
  CreateWebhookResult,
  Webhook,
  WebhookAuthenticationType,
  WebhookInput,
} from './types/webhook.js';
export type { PackageCreatedBy, WebhookEvent, WebhookEventStatus } from './types/webhook-event.js';
export type {
  City,
  CommonLabel,
  CommonLabelEntry,
  Country,
  CreateCommonLabelInput,
  CreateTestOrderInput,
  CreateTestOrderResult,
  DeleteInvoiceLinkInput,
  District,
  FinancialTransaction,
  ListFinanceParams,
  Neighborhood,
  OtherFinancialRow,
  SendInvoiceLinkInput,
  SetClaimsWaitingInActionInput,
  SettlementRow,
  TestOrderStatus,
  TestOrderStatusLine,
  UpdateTestOrderStatusOptions,
  UploadInvoiceFileInput,
} from './types/misc.js';
