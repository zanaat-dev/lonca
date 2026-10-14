/**
 * Hepsiburada request samples, checked against `specs/hepsiburada`. The
 * portal publishes no API definition for the listing, shipping, claim and
 * test-order services (see `specs/hepsiburada/README.md`), so those samples
 * run but are not compared.
 */
import { createHepsiburadaClient, type HepsiburadaClient } from '@lonca/hepsiburada';
import type { RequestSet } from './registry.mts';

const MERCHANT = 'b73989dc-970c-4b27-88a0-0c11e87cbb5e';
const TRACKING_ID = '3f1c9a52-7d4e-4b8a-9c0e-2a6b5d8f1e47';
const HB_SKU = 'HBV00000ABC12';
const PACKAGE = '4501234567';
const LINE_ID = '7d3f2a10-5b6c-4e8f-a1d2-3c4b5a6f7e80';
const QUESTION = '1082059';

const NO_SPEC = (service: string) =>
  `${service}: Hepsiburada publishes no API definition for it, so specs/hepsiburada has none`;
const LISTING = NO_SPEC('listing-external');
const SHIPPING = NO_SPEC('shipping-external');
const CLAIMS = NO_SPEC('claims (oms-external / claim-stub-external)');
const TEST_ORDERS = NO_SPEC('oms-stub-external (test orders)');

/** mpop's `{ success, code, message, data }` envelope, so the catalog reads succeed. */
const CATALOG_OK = () => ({ success: true, code: 0, message: null, data: [] });

export const hepsiburadaRequests: RequestSet<HepsiburadaClient> = {
  marketplace: 'hepsiburada',
  createClient: (fetch) =>
    createHepsiburadaClient({
      merchantId: MERCHANT,
      username: 'user',
      password: 'pass',
      env: 'sit',
      integratorName: 'LoncaCheck',
      fetch,
    }),
  calls: [
    // ─── accounting (mpfinance-external) ──────────────────────────────────
    {
      name: 'accounting.listTransactions',
      call: (c) =>
        c.accounting.listTransactions({
          beginDate: '2026-10-01',
          endDate: '2026-10-14',
          transactionTypes: 'Commission',
          offset: 0,
          limit: 100,
        }),
    },

    // ─── catalog (mpop /product) ──────────────────────────────────────────
    {
      name: 'catalog.listProducts',
      call: (c) => c.catalog.listProducts({ merchantSku: 'SKU-1', page: 0, size: 50 }),
      respond: CATALOG_OK,
    },
    {
      name: 'catalog.listProductsByStatus',
      call: (c) => c.catalog.listProductsByStatus({ status: 'MATCHED', page: 0, size: 50 }),
      respond: CATALOG_OK,
    },
    { name: 'catalog.getProductStatus', call: (c) => c.catalog.getProductStatus(TRACKING_ID) },
    { name: 'catalog.getTrackingIdHistory', call: (c) => c.catalog.getTrackingIdHistory() },
    {
      name: 'catalog.uploadProductViaFile',
      call: (c) =>
        c.catalog.uploadProductViaFile([
          { categoryId: 18021982, attributes: { merchantSku: 'SKU-1', UrunAdi: 'Örnek' } },
        ]),
    },
    {
      name: 'catalog.uploadFastListing',
      call: (c) =>
        c.catalog.uploadFastListing([
          {
            merchant: MERCHANT,
            merchantSku: 'SKU-1',
            productName: 'Örnek Seramik Kupa 350 ml',
            barcode: '8690000000001',
            price: '149,90',
            stock: '5',
          },
        ]),
    },
    {
      name: 'catalog.approvePreMatch',
      call: (c) => c.catalog.approvePreMatch([{ merchant: MERCHANT, merchantSkuList: ['SKU-1'] }]),
    },
    {
      name: 'catalog.rejectPreMatch',
      call: (c) => c.catalog.rejectPreMatch([{ merchant: MERCHANT, merchantSkuList: ['SKU-2'] }]),
    },
    {
      name: 'catalog.checkProductStatus',
      call: (c) =>
        c.catalog.checkProductStatus([{ merchant: MERCHANT, merchantSkuList: ['SKU-1', 'SKU-2'] }]),
    },
    {
      name: 'catalog.deleteByMerchantSkuList',
      call: (c) =>
        c.catalog.deleteByMerchantSkuList([{ merchantSku: 'SKU-1' }, { merchantSku: 'SKU-2' }]),
    },
    { name: 'catalog.getDeleteProcess', call: (c) => c.catalog.getDeleteProcess(TRACKING_ID) },

    // ─── categories (mpop /product) ───────────────────────────────────────
    {
      name: 'categories.list',
      call: (c) =>
        c.categories.list({ leaf: true, status: 'ACTIVE', available: true, page: 0, size: 1000 }),
      respond: CATALOG_OK,
    },
    {
      name: 'categories.getAttributes',
      call: (c) => c.categories.getAttributes(18021982),
      respond: CATALOG_OK,
    },
    {
      name: 'categories.getAttributeValues',
      call: (c) => c.categories.getAttributeValues(18021982, 'renk_variant_property'),
      respond: CATALOG_OK,
    },

    // ─── productUpdates (mpop /ticket-api) ────────────────────────────────
    {
      name: 'productUpdates.importUpdates',
      call: (c) =>
        c.productUpdates.importUpdates([
          { hbSku: HB_SKU, productName: 'Yeni ad', attributes: { renk: 'Siyah' } },
        ]),
    },
    {
      name: 'productUpdates.getUpdateStatus',
      call: (c) => c.productUpdates.getUpdateStatus(TRACKING_ID),
    },
    {
      name: 'productUpdates.getUpdateHistory',
      call: (c) => c.productUpdates.getUpdateHistory(HB_SKU),
    },

    // ─── orders (oms-external) ────────────────────────────────────────────
    {
      name: 'orders.list',
      call: (c) =>
        c.orders.list({
          beginDate: '2026-10-01 00:00',
          endDate: '2026-10-14 00:00',
          offset: 0,
          limit: 100,
        }),
    },
    { name: 'orders.listCancelled', call: (c) => c.orders.listCancelled({ limit: 100 }) },
    {
      name: 'orders.listPaymentAwaiting',
      call: (c) => c.orders.listPaymentAwaiting({ limit: 100 }),
    },
    { name: 'orders.getByOrderNumber', call: (c) => c.orders.getByOrderNumber('4012345678') },
    {
      name: 'orders.listPackages',
      call: (c) => c.orders.listPackages({ offset: 0, limit: 100 }),
    },
    {
      name: 'orders.listShippedPackages',
      call: (c) => c.orders.listShippedPackages({ offset: 0, limit: 100 }),
    },
    {
      name: 'orders.listDeliveredPackages',
      call: (c) => c.orders.listDeliveredPackages({ offset: 0, limit: 100 }),
    },
    {
      name: 'orders.listUndeliveredPackages',
      call: (c) => c.orders.listUndeliveredPackages({ offset: 0, limit: 100 }),
    },
    {
      name: 'orders.listUnpackedPackages',
      call: (c) => c.orders.listUnpackedPackages({ offset: 0, limit: 100 }),
    },
    {
      name: 'orders.listMissingInvoicePackages',
      call: (c) => c.orders.listMissingInvoicePackages({ offset: 0, limit: 100 }),
    },
    { name: 'orders.getPackage', call: (c) => c.orders.getPackage(PACKAGE) },
    { name: 'orders.getPackageLabel', call: (c) => c.orders.getPackageLabel(PACKAGE) },
    {
      name: 'orders.getChangeableCargoCompaniesForLineItem',
      call: (c) => c.orders.getChangeableCargoCompaniesForLineItem(LINE_ID),
    },
    {
      name: 'orders.getChangeableCargoCompaniesForPackage',
      call: (c) => c.orders.getChangeableCargoCompaniesForPackage(PACKAGE),
    },
    {
      name: 'orders.getPackageableLineItems',
      call: (c) => c.orders.getPackageableLineItems(LINE_ID),
    },
    {
      name: 'orders.createPackages',
      call: (c) => c.orders.createPackages({ lineItemRequests: [{ id: LINE_ID, quantity: 1 }] }),
    },
    {
      name: 'orders.splitPackage',
      call: (c) =>
        c.orders.splitPackage(PACKAGE, {
          packageDetails: [
            { lines: [{ orderLineId: LINE_ID, quantity: 1 }] },
            { lines: [{ orderLineId: LINE_ID, quantity: 1 }] },
          ],
        }),
    },
    { name: 'orders.unpackPackage', call: (c) => c.orders.unpackPackage(PACKAGE) },
    {
      name: 'orders.markPackageInTransit',
      call: (c) => c.orders.markPackageInTransit(PACKAGE, { trackingNumber: 'TR-456' }),
    },
    { name: 'orders.markPackageDelivered', call: (c) => c.orders.markPackageDelivered(PACKAGE) },
    {
      name: 'orders.markPackageUndelivered',
      call: (c) =>
        c.orders.markPackageUndelivered(PACKAGE, {
          undeliveredReason: 'AddressNotFound',
          undeliveredDate: '2026-10-14T12:00:00',
        }),
    },
    {
      name: 'orders.cancelLineItem',
      call: (c) => c.orders.cancelLineItem(LINE_ID, { reasonId: 1 }),
    },
    {
      name: 'orders.updateLineItemCargoCompany',
      call: (c) => c.orders.updateLineItemCargoCompany(LINE_ID, { CargoCompanyShortName: 'YK' }),
    },
    {
      name: 'orders.updateLineItemLaborCost',
      call: (c) => c.orders.updateLineItemLaborCost(LINE_ID, { unitLaborCost: 12.5 }),
    },
    {
      name: 'orders.updatePackageCargoCompany',
      call: (c) => c.orders.updatePackageCargoCompany(PACKAGE, { CargoCompanyShortName: 'YK' }),
    },
    {
      name: 'orders.sendInvoiceLink',
      call: (c) =>
        c.orders.sendInvoiceLink(PACKAGE, {
          invoiceLink: 'https://erp.example.com/inv/4501234567.pdf',
          serialNumber: 'INV2026000123',
          arrangementDate: '2026-10-14',
        }),
    },
    {
      name: 'orders.updateParcelInfo',
      call: (c) => c.orders.updateParcelInfo(PACKAGE, { totalDesi: 8, totalParcel: 1 }),
    },
    {
      name: 'orders.updatePackageWarehouse',
      call: (c) => c.orders.updatePackageWarehouse(PACKAGE, { shippingAddressLabel: 'WH-2' }),
    },

    // ─── questions (api-asktoseller-merchant) ─────────────────────────────
    {
      name: 'questions.list',
      call: (c) =>
        c.questions.list({
          status: 'WaitingForAnswer',
          minCreatedAt: '2026-10-01',
          maxCreatedAt: '2026-10-14',
          page: 0,
          size: 50,
        }),
    },
    { name: 'questions.get', call: (c) => c.questions.get(QUESTION) },
    { name: 'questions.getCountByStatus', call: (c) => c.questions.getCountByStatus() },
    {
      name: 'questions.answer',
      call: (c) => c.questions.answer(QUESTION, { Answer: 'Stokta var.' }),
    },
    {
      name: 'questions.reject',
      call: (c) =>
        c.questions.reject(QUESTION, {
          rejectReason: 'Soru ürünle ilgili değil, reklam içeriyor.',
        }),
    },
    { name: 'questions.create', call: (c) => c.questions.create({ issueCount: 1 }) },

    // ─── promotions (diskonto-external) ───────────────────────────────────
    { name: 'promotions.listCategories', call: (c) => c.promotions.listCategories() },
    { name: 'promotions.getBudgets', call: (c) => c.promotions.getBudgets() },
    { name: 'promotions.getLimits', call: (c) => c.promotions.getLimits() },
    {
      name: 'promotions.listDiscounts',
      call: (c) => c.promotions.listDiscounts({ page: 1, pageSize: 50 }),
    },
    { name: 'promotions.getDiscount', call: (c) => c.promotions.getDiscount('123456') },
    {
      name: 'promotions.createTlDiscount',
      call: (c) =>
        c.promotions.createTlDiscount({
          name: 'Sepette 50 TL',
          startDate: '2026-10-20T00:00:00+03:00',
          endDate: '2026-10-27T23:59:00+03:00',
          conditionSkus: [HB_SKU],
          budget: 5000,
          discountAmount: 50,
          conditionAmount: 500,
          oneTimeUsage: true,
        }),
    },
    {
      name: 'promotions.createPercentDiscount',
      call: (c) =>
        c.promotions.createPercentDiscount({
          name: 'Sepette %10',
          startDate: '2026-10-20T00:00:00+03:00',
          endDate: '2026-10-27T23:59:00+03:00',
          conditionCategories: ['60001546'],
          discountPercentage: 10,
          conditionAmount: 200,
          maxDiscountAmount: 100,
          maxCartCount: 500,
          oneTimeUsage: false,
        }),
    },
    {
      name: 'promotions.createXyDiscount',
      call: (c) =>
        c.promotions.createXyDiscount({
          name: '3 Al 2 Öde',
          startDate: '2026-10-20T00:00:00+03:00',
          endDate: '2026-10-27T23:59:00+03:00',
          conditionSkus: [HB_SKU],
          conditionProductCount: 3,
          mustPayProductCount: 2,
          iterationCount: 1,
          maxCartCount: 500,
          oneTimeUsage: false,
        }),
    },
    {
      name: 'promotions.cancelDiscount',
      call: (c) => c.promotions.cancelDiscount({ campaignId: 123456 }),
    },

    // ─── suppliers (supplier-api-external) ────────────────────────────────
    {
      name: 'suppliers.searchOpenPurchaseOrders',
      call: (c) =>
        c.suppliers.searchOpenPurchaseOrders({
          dueDateStart: '2026-10-01',
          dueDateEnd: '2026-10-31',
          purchaseOrderTypes: ['StandardPurchaseOrder'],
          limit: 50,
          offset: 0,
        }),
    },
    {
      name: 'suppliers.searchSupplierListings',
      call: (c) =>
        c.suppliers.searchSupplierListings({ status: 'Active', listingType: 'Normal', limit: 50 }),
    },
    {
      name: 'suppliers.searchListingUpdateRequests',
      call: (c) =>
        c.suppliers.searchListingUpdateRequests({
          startDate: '2026-10-01',
          endDate: '2026-10-14',
          limit: 50,
          offset: 0,
        }),
    },
    {
      name: 'suppliers.getListingUpdateRequest',
      call: (c) => c.suppliers.getListingUpdateRequest(TRACKING_ID),
    },
    {
      name: 'suppliers.createListingUpdateRequest',
      call: (c) =>
        c.suppliers.createListingUpdateRequest({
          requestItems: [
            {
              traceId: TRACKING_ID,
              merchantSku: 'SKU-1',
              sku: HB_SKU,
              price: 149.9,
              priceEffectiveDate: '2026-10-20T00:00:00+03:00',
              stock: 25,
              currencyCode: 'TRY',
              salable: true,
            },
          ],
        }),
    },

    // ─── listings (listing-external; no spec) ─────────────────────────────
    {
      name: 'listings.list',
      call: (c) => c.listings.list({ offset: 0, limit: 100, merchantSkuList: 'SKU-1,SKU-2' }),
      skip: LISTING,
    },
    {
      name: 'listings.getBuyboxOrder',
      call: (c) => c.listings.getBuyboxOrder(`${HB_SKU},HBV00000ABC13`),
      skip: LISTING,
    },
    {
      name: 'listings.getCommissions',
      call: (c) => c.listings.getCommissions(HB_SKU),
      skip: LISTING,
    },
    {
      name: 'listings.uploadInventory',
      call: (c) =>
        c.listings.uploadInventory([
          { hepsiburadaSku: HB_SKU, merchantSku: 'SKU-1', price: 149.9, availableStock: 5 },
        ]),
      skip: LISTING,
    },
    {
      name: 'listings.getInventoryUpload',
      call: (c) => c.listings.getInventoryUpload(TRACKING_ID),
      skip: LISTING,
    },
    {
      name: 'listings.uploadStock',
      call: (c) =>
        c.listings.uploadStock([
          { hepsiburadaSku: HB_SKU, merchantSku: 'SKU-1', availableStock: 5 },
        ]),
      skip: LISTING,
    },
    {
      name: 'listings.getStockUpload',
      call: (c) => c.listings.getStockUpload(TRACKING_ID),
      skip: LISTING,
    },
    {
      name: 'listings.uploadPrice',
      call: (c) => c.listings.uploadPrice([{ hepsiburadaSku: HB_SKU, price: 199.9 }]),
      skip: LISTING,
    },
    {
      name: 'listings.getPriceUpload',
      call: (c) => c.listings.getPriceUpload(TRACKING_ID),
      skip: LISTING,
    },
    {
      name: 'listings.uploadShippingInfo',
      call: (c) => c.listings.uploadShippingInfo([{ hepsiburadaSku: HB_SKU, dispatchTime: 2 }]),
      skip: LISTING,
    },
    {
      name: 'listings.getShippingInfoUpload',
      call: (c) => c.listings.getShippingInfoUpload(TRACKING_ID),
      skip: LISTING,
    },
    {
      name: 'listings.uploadAdditionalInfo',
      call: (c) =>
        c.listings.uploadAdditionalInfo([
          { hepsiburadaSku: HB_SKU, customizationTextType: 'Text', customizationTextLength: 20 },
        ]),
      skip: LISTING,
    },
    {
      name: 'listings.getAdditionalInfoUpload',
      call: (c) => c.listings.getAdditionalInfoUpload(TRACKING_ID),
      skip: LISTING,
    },
    { name: 'listings.activate', call: (c) => c.listings.activate(HB_SKU), skip: LISTING },
    { name: 'listings.deactivate', call: (c) => c.listings.deactivate(HB_SKU), skip: LISTING },
    {
      name: 'listings.updateSingle',
      call: (c) =>
        c.listings.updateSingle(HB_SKU, 'SKU-1', {
          newAvailableStock: 10,
          newPrice: { currency: 'TRY', amount: 149.9 },
          newDispatchTime: 2,
        }),
      skip: LISTING,
    },
    {
      name: 'listings.deleteSingle',
      call: (c) => c.listings.deleteSingle(HB_SKU, 'SKU-1'),
      skip: LISTING,
    },
    {
      name: 'listings.bulkUnlock',
      call: (c) => c.listings.bulkUnlock({ hbSkuList: [HB_SKU] }),
      skip: LISTING,
    },

    // ─── shipping (shipping-external; no spec) ────────────────────────────
    { name: 'shipping.getCargoFirms', call: (c) => c.shipping.getCargoFirms(), skip: SHIPPING },
    { name: 'shipping.listProfiles', call: (c) => c.shipping.listProfiles(), skip: SHIPPING },
    {
      name: 'shipping.createProfile',
      call: (c) => c.shipping.createProfile({ profileName: 'Express', cargoFirms: 'ARAS,MNG' }),
      skip: SHIPPING,
    },
    {
      name: 'shipping.updateProfile',
      call: (c) => c.shipping.updateProfile({ profileName: 'Express', cargoFirms: 'ARAS' }),
      skip: SHIPPING,
    },

    // ─── claims (no spec) ─────────────────────────────────────────────────
    {
      name: 'claims.list',
      call: (c) => c.claims.list({ beginDate: '2026-10-01 00:00', limit: 50 }),
      skip: CLAIMS,
    },
    {
      name: 'claims.listByStatus',
      call: (c) => c.claims.listByStatus('AwaitingAction', { limit: 50 }),
      skip: CLAIMS,
    },
    {
      name: 'claims.accept',
      call: (c) => c.claims.accept('CLM-1', { reasonCode: 'APPROVED' }),
      skip: CLAIMS,
    },
    {
      name: 'claims.reject',
      call: (c) => c.claims.reject('CLM-1', { reasonCode: 'NOT_ELIGIBLE' }),
      skip: CLAIMS,
    },
    {
      name: 'claims.preApprovalConfirm',
      call: (c) => c.claims.preApprovalConfirm('CLM-1', { confirmed: true }),
      skip: CLAIMS,
    },
    {
      name: 'claims.create',
      call: (c) =>
        c.claims.create({
          orderNumber: '4012345678',
          lines: [{ lineItemId: LINE_ID, quantity: 1 }],
        }),
      skip: CLAIMS,
    },

    // ─── testOrders (oms-stub-external; no spec) ──────────────────────────
    {
      name: 'testOrders.create',
      call: (c) =>
        c.testOrders.create({
          customer: { name: 'Test Müşteri', email: 'test@example.com' },
          lines: [{ merchantSku: 'SKU-1', quantity: 1, price: 149.9 }],
        }),
      skip: TEST_ORDERS,
    },
  ],
};
