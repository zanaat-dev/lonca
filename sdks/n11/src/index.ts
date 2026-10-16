/**
 * Type-safe client for the n11 marketplace API (REST and SOAP).
 *
 * @module @lonca/n11
 */
export { createN11Client, type CreateN11ClientOptions, type N11Client } from './client.js';
export { N11Transport, type N11Environment, type SoapCallOptions } from './transport.js';
export { mapSoapFailure, mapSoapHttpError, type SoapResultInfo } from './soap/errors.js';
export { mapHttpError } from './errors.js';
export { n11Capabilities, type N11Capabilities } from './capabilities.js';
export { statusMap, normalizeStatus } from './status.js';
export {
  CatalogResource,
  type N11CatalogProduct,
  type N11CatalogSearchResult,
  type SearchN11CatalogParams,
} from './resources/catalog.js';
export { CategoriesResource } from './resources/categories.js';
export { ClaimsResource } from './resources/claims.js';
export { FinanceResource } from './resources/finance.js';
export { InventoryResource } from './resources/inventory.js';
export {
  LocationsResource,
  type N11City,
  type N11District,
  type N11Neighborhood,
} from './resources/locations.js';
export { OrdersResource } from './resources/orders.js';
export { ProductsResource } from './resources/products.js';
export { QuestionsResource } from './resources/questions.js';
export { ShippingResource, type N11ShipmentCompany } from './resources/shipping.js';
export type {
  N11AttributeValue,
  N11Category,
  N11CategoryAttribute,
  N11CategoryAttributes,
} from './types/category.js';
export type {
  CancelN11OrderItemParams,
  KnownN11PackageStatus,
  ListN11OrdersParams,
  N11Address,
  N11CollectionRequestLine,
  N11LaborCost,
  N11LineResult,
  N11SplitPackageItem,
  N11SplitResult,
  SendN11InvoiceLinkParams,
  SplitN11PackageByQuantityParams,
  N11OrderLine,
  N11PackageHistory,
  N11PackageStatus,
  N11ShipmentPackage,
} from './types/order.js';
export type {
  ListN11ProductsParams,
  N11Product,
  N11ProductAttribute,
  N11ProductStatus,
  N11SaleStatus,
  N11Sender,
} from './types/product.js';
export type {
  DenyN11ReturnParams,
  PostponeN11ReturnParams,
  ListN11CancelsParams,
  ListN11ReturnsParams,
  N11CancelClaim,
  N11CancelStatus,
  N11ClaimExecuter,
  N11ClaimSearchType,
  N11ReasonType,
  N11ReturnClaim,
  N11ReturnStatus,
} from './types/claim.js';
export type {
  ListN11QuestionsParams,
  N11Question,
  N11QuestionDetail,
  N11QuestionStatus,
} from './types/question.js';
export type {
  N11CurrencyType,
  N11PriceStockUpdate,
  N11ProductAttributeInput,
  N11ProductCreateItem,
  N11ProductTask,
  N11ProductUpdateItem,
  N11TaskDetails,
  N11TaskItemResult,
  N11TaskItemStatus,
  N11TaskPollOptions,
  N11TaskStatus,
  N11TaskType,
  N11VatRate,
} from './types/task.js';
export type {
  ListN11SettlementsParams,
  N11Deferment,
  N11DefermentUsage,
  N11Settlement,
  N11SettlementDetail,
  N11SettlementLine,
  N11SettlementStatus,
  N11SettlementSummary,
  N11ShipmentDeferment,
} from './types/finance.js';
