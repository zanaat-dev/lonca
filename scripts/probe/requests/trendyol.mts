/** Trendyol request samples, checked against `specs/trendyol`. */
import { createTrendyolClient, type TrendyolClient } from '@lonca/trendyol';
import type { RequestSet } from './registry.mts';

const BATCH = '0d7b3f0e-5a4e-4c1b-9d6f-1f2e3a4b5c6d';
/** A settled `getBatchRequestResult`, so `updateAndWait` stops polling. */
const COMPLETED = () => ({
  batchRequestId: BATCH,
  status: 'COMPLETED',
  itemCount: 1,
  failedItemCount: 0,
  items: [],
});
const PACKAGE = 3_145_678_901;
const TRACKING = '7330012345678';
const pdf = () => new Blob(['%PDF-1.4'], { type: 'application/pdf' });

const client = (fetch: typeof globalThis.fetch, env: 'prod' | 'stage') =>
  createTrendyolClient({
    sellerId: 123456,
    apiKey: 'key',
    apiSecret: 'secret',
    env,
    integratorName: 'LoncaCheck',
    fetch,
  });
/**
 * The recorder of the call being run. Test orders exist only on STAGE
 * (`specs/trendyol/test-order.json` lists only the stage host), so their
 * samples build a stage client over the same recorder.
 */
let recorder: typeof globalThis.fetch = globalThis.fetch;
const stage = () => client(recorder, 'stage');

export const trendyolRequests: RequestSet<TrendyolClient> = {
  marketplace: 'trendyol',
  createClient: (fetch) => {
    recorder = fetch;
    return client(fetch, 'prod');
  },
  noRequest: {
    'suppliers.invalidateCache': 'clears the in-memory address cache; sends nothing',
  },
  calls: [
    // ─── Catalog lookups ──────────────────────────────────────────────────
    { name: 'brands.list', call: (c) => c.brands.list({ limit: 1000 }) },
    { name: 'brands.search', call: (c) => c.brands.search('Trendyol') },
    { name: 'categories.list', call: (c) => c.categories.list() },
    { name: 'categories.getAttributes', call: (c) => c.categories.getAttributes(411) },
    {
      name: 'categories.getAttributeValues',
      call: (c) => c.categories.getAttributeValues(411, 47, { limit: 100 }),
    },
    {
      name: 'categories.getByBarcodes',
      call: (c) => c.categories.getByBarcodes(['8690000000001', '8690000000002']),
    },

    // ─── Products ─────────────────────────────────────────────────────────
    {
      name: 'products.list',
      call: (c) =>
        c.products.list({
          barcode: '8690000000001',
          startDate: new Date('2026-10-01T00:00:00Z'),
          endDate: new Date('2026-10-14T00:00:00Z'),
          limit: 50,
        }),
    },
    {
      name: 'products.listInventoryAndPrice',
      call: (c) =>
        c.products.listInventoryAndPrice({
          status: 'onSale',
          orderByDirection: 'DESC',
          limit: 100,
        }),
    },
    {
      name: 'products.listUnapproved',
      call: (c) =>
        c.products.listUnapproved({
          startDate: new Date('2026-10-01T00:00:00Z'),
          dateQueryType: 'LAST_MODIFIED_DATE',
          limit: 50,
        }),
    },
    { name: 'products.getBase', call: (c) => c.products.getBase('8690000000001') },
    {
      name: 'products.getBuyboxInfo',
      call: (c) => c.products.getBuyboxInfo(['8690000000001', '8690000000002']),
    },
    {
      name: 'products.getBatchStatus',
      call: (c) => c.products.getBatchStatus(BATCH),
      respond: COMPLETED,
    },
    {
      name: 'products.create',
      call: (c) =>
        c.products.create([
          {
            barcode: '8690000000001',
            title: 'Pamuklu Basic Tişört Beyaz',
            productMainId: 'TSHIRT-BASIC',
            brandId: 1791,
            categoryId: 411,
            quantity: 25,
            stockCode: 'TSHIRT-BASIC-WHT-M',
            dimensionalWeight: 1,
            description: '<p>%100 pamuk, regular fit.</p>',
            listPrice: 299.9,
            salePrice: 249.9,
            images: [{ url: 'https://cdn.example.com/tshirt-white-1.jpg' }],
            vatRate: 10,
            attributes: [
              { attributeId: 47, attributeValueIds: [4294] },
              { attributeId: 338, attributeValueIds: [6980] },
              { attributeId: 343, attributeValue: 'Pamuk' },
            ],
            deliveryOption: { deliveryDuration: 1, fastDeliveryType: 'FAST_DELIVERY' },
            shipmentAddressId: 7015,
            returningAddressId: 7016,
          },
        ]),
    },
    {
      name: 'products.updateContent',
      call: (c) =>
        c.products.updateContent([
          {
            contentId: 856_412_331,
            title: 'Pamuklu Basic Tişört Beyaz - Regular Fit',
            description: '<p>%100 pamuk, regular fit, yıkamaya dayanıklı.</p>',
            images: [{ url: 'https://cdn.example.com/tshirt-white-1.jpg' }],
            attributes: [{ attributeId: 47, attributeValueIds: [4294] }],
          },
        ]),
    },
    {
      name: 'products.updateVariants',
      call: (c) =>
        c.products.updateVariants([
          {
            barcode: '8690000000001',
            stockCode: 'TSHIRT-BASIC-WHT-M',
            vatRate: 10,
            dimensionalWeight: 2,
            shipmentAddressId: 7015,
            returningAddressId: 7016,
            locationBasedDelivery: 'DISABLED',
          },
        ]),
    },
    {
      name: 'products.updateUnapproved',
      call: (c) =>
        c.products.updateUnapproved([
          {
            barcode: '8690000000001',
            title: 'Pamuklu Basic Tişört Beyaz',
            categoryId: 411,
            brandId: 1791,
            vatRate: 10,
            images: [{ url: 'https://cdn.example.com/tshirt-white-1.jpg' }],
            attributes: [{ attributeId: 47, attributeValueIds: [4294] }],
          },
        ]),
    },
    {
      name: 'products.updateDeliveryInfo',
      call: (c) =>
        c.products.updateDeliveryInfo([
          {
            barcode: '8690000000001',
            deliveryOptions: { deliveryDuration: 1, fastDeliveryType: 'SAME_DAY_SHIPPING' },
          },
        ]),
    },
    { name: 'products.delete', call: (c) => c.products.delete(['8690000000001']) },
    { name: 'products.archive', call: (c) => c.products.archive(['8690000000001']) },
    { name: 'products.unarchive', call: (c) => c.products.unarchive(['8690000000001']) },
    { name: 'products.unlock', call: (c) => c.products.unlock(['8690000000001']) },

    // ─── Price & stock ────────────────────────────────────────────────────
    {
      name: 'inventory.update',
      call: (c) =>
        c.inventory.update([
          { barcode: '8690000000001', quantity: 3, salePrice: 149.9, listPrice: 199 },
        ]),
    },
    {
      name: 'inventory.updateAndWait',
      call: (c) =>
        c.inventory.updateAndWait(
          [
            { barcode: '8690000000001', quantity: 3 },
            { barcode: '8690000000002', salePrice: 99.9, listPrice: 120 },
          ],
          { pollIntervalMs: 0 },
        ),
      respond: COMPLETED,
    },

    // ─── Orders ───────────────────────────────────────────────────────────
    {
      name: 'orders.list',
      call: (c) =>
        c.orders.list({
          status: 'Created',
          startDate: new Date('2026-10-01T00:00:00Z'),
          endDate: new Date('2026-10-14T00:00:00Z'),
          limit: 50,
        }),
    },
    {
      name: 'orders.listStream',
      call: (c) =>
        c.orders.listStream({
          packageItemStatuses: 'Created,Picking',
          lastModifiedStartDate: new Date('2026-10-01T00:00:00Z'),
          lastModifiedEndDate: new Date('2026-10-14T00:00:00Z'),
          limit: 100,
        }),
    },
    {
      name: 'orders.updatePackageStatus: picking',
      call: (c) => c.orders.updatePackageStatus(PACKAGE, { status: 'Picking' }),
    },
    {
      name: 'orders.updatePackageStatus: invoiced lines',
      call: (c) =>
        c.orders.updatePackageStatus(PACKAGE, {
          status: 'Invoiced',
          lines: [{ lineId: 4_944_785, quantity: 1 }],
        }),
    },
    {
      name: 'orders.cancelPackageItem',
      call: (c) =>
        c.orders.cancelPackageItem(PACKAGE, {
          lines: [{ lineId: 4_944_785, quantity: 1 }],
          reasonId: 500,
        }),
    },
    { name: 'orders.extendDeliveryDate', call: (c) => c.orders.extendDeliveryDate(PACKAGE, 2) },
    {
      name: 'orders.processAlternativeDelivery',
      call: (c) =>
        c.orders.processAlternativeDelivery(PACKAGE, {
          isPhoneNumber: false,
          trackingInfo: 'https://kargo.example.com/takip/123456',
          params: {},
        }),
    },
    {
      name: 'orders.splitPackage',
      call: (c) => c.orders.splitPackage(PACKAGE, [4_944_785, 4_944_786]),
    },
    {
      name: 'orders.splitPackageByQuantity',
      call: (c) =>
        c.orders.splitPackageByQuantity(PACKAGE, [{ orderLineId: 4_944_785, quantities: [2, 1] }]),
    },
    {
      name: 'orders.multiSplitPackage',
      call: (c) =>
        c.orders.multiSplitPackage(PACKAGE, [
          { orderLineIds: [4_944_785] },
          { orderLineIds: [4_944_786, 4_944_787] },
        ]),
    },
    {
      name: 'orders.splitMultiPackagesByQuantity',
      call: (c) =>
        c.orders.splitMultiPackagesByQuantity(PACKAGE, [
          { packageDetails: [{ orderLineId: 4_944_785, quantities: 1 }] },
          { packageDetails: [{ orderLineId: 4_944_785, quantities: 2 }] },
        ]),
    },
    {
      name: 'orders.changeCargoProvider',
      call: (c) => c.orders.changeCargoProvider(PACKAGE, 'ARASMP'),
    },
    {
      name: 'orders.manualDeliverByPackageId',
      call: (c) => c.orders.manualDeliverByPackageId(PACKAGE),
    },
    {
      name: 'orders.manualDeliverByTrackingNumber',
      call: (c) => c.orders.manualDeliverByTrackingNumber(TRACKING),
    },
    {
      name: 'orders.markDeliveredByService',
      call: (c) => c.orders.markDeliveredByService(PACKAGE),
    },
    {
      name: 'orders.updateBoxInfo',
      call: (c) => c.orders.updateBoxInfo(PACKAGE, { deci: 3, boxQuantity: 2 }),
    },
    {
      name: 'orders.updateLaborCosts',
      call: (c) =>
        c.orders.updateLaborCosts(PACKAGE, [{ orderLineId: 4_944_785, laborCostPerItem: 150 }]),
    },
    { name: 'orders.updateWarehouse', call: (c) => c.orders.updateWarehouse(PACKAGE, 7015) },
    {
      name: 'orders.getCargoInvoiceItems',
      call: (c) => c.orders.getCargoInvoiceItems('DDF2026000123456', { limit: 100 }),
    },
    {
      name: 'orders.manualReturnByPackageId',
      call: (c) => c.orders.manualReturnByPackageId(PACKAGE),
    },
    {
      name: 'orders.manualReturnByTrackingNumber',
      call: (c) => c.orders.manualReturnByTrackingNumber(TRACKING),
    },
    {
      name: 'orders.getCompensationTickets',
      call: (c) =>
        c.orders.getCompensationTickets({
          startDate: new Date('2026-09-01T00:00:00Z'),
          endDate: new Date('2026-10-01T00:00:00Z'),
        }),
    },

    // ─── Claims (returns) ─────────────────────────────────────────────────
    {
      name: 'claims.list',
      call: (c) =>
        c.claims.list({
          claimItemStatus: 'WaitingInAction',
          startDate: new Date('2026-10-01T00:00:00Z'),
          endDate: new Date('2026-10-14T00:00:00Z'),
          limit: 50,
        }),
    },
    {
      name: 'claims.create',
      call: (c) =>
        c.claims.create({
          orderNumber: '10654411111',
          customerId: 98_765_432,
          claimItems: [
            { barcode: '8690000000001', quantity: 1, reasonId: 401, customerNote: 'Vazgeçtim' },
          ],
          excludeListing: false,
          forcePackageCreation: true,
        }),
    },
    {
      name: 'claims.createIssue',
      call: (c) =>
        c.claims.createIssue('f9da2317-876b-4b86-b8f7-0535c3b65731', {
          claimIssueReasonId: 1651,
          claimItemIdList: ['b4c1e2d3-0a9f-4e8b-9c7d-6e5f4a3b2c1d'],
          description: 'Ürün kullanılmış olarak geri gönderildi.',
          files: [pdf()],
        }),
    },
    {
      name: 'claims.approveLineItems',
      call: (c) =>
        c.claims.approveLineItems('f9da2317-876b-4b86-b8f7-0535c3b65731', {
          claimLineItemIdList: ['b4c1e2d3-0a9f-4e8b-9c7d-6e5f4a3b2c1d'],
          params: {},
        }),
    },
    { name: 'claims.getIssueReasons', call: (c) => c.claims.getIssueReasons() },
    {
      name: 'claims.getItemAudits',
      call: (c) => c.claims.getItemAudits('b4c1e2d3-0a9f-4e8b-9c7d-6e5f4a3b2c1d'),
    },

    // ─── Questions ────────────────────────────────────────────────────────
    { name: 'questions.get', call: (c) => c.questions.get(1_234_567) },
    {
      name: 'questions.list',
      call: (c) =>
        c.questions.list({
          status: 'WAITING_FOR_ANSWER',
          startDate: new Date('2026-10-01T00:00:00Z'),
          endDate: new Date('2026-10-14T00:00:00Z'),
          limit: 50,
        }),
    },
    {
      name: 'questions.answer',
      call: (c) =>
        c.questions.answer(1_234_567, 'Merhaba, ürünümüz %100 pamuktur. İyi alışverişler dileriz.'),
    },

    // ─── Invoices, labels, finance ────────────────────────────────────────
    {
      name: 'invoices.uploadFile',
      call: (c) =>
        c.invoices.uploadFile({
          shipmentPackageId: PACKAGE,
          file: pdf(),
          invoiceDateTime: Date.UTC(2026, 9, 14),
          invoiceNumber: 'ABC2026000000123',
        }),
    },
    {
      name: 'invoices.sendLink',
      call: (c) =>
        c.invoices.sendLink({
          shipmentPackageId: PACKAGE,
          invoiceLink: 'https://efatura.example.com/ABC2026000000123.pdf',
          invoiceDateTime: Date.UTC(2026, 9, 14),
          invoiceNumber: 'ABC2026000000123',
        }),
    },
    {
      name: 'invoices.deleteLink',
      call: (c) => c.invoices.deleteLink({ serviceSourceId: PACKAGE, channelId: 1, customerId: 3 }),
    },
    {
      name: 'labels.createCommon',
      call: (c) => c.labels.createCommon(TRACKING, { format: 'ZPL', boxQuantity: 2 }),
    },
    { name: 'labels.getCommon', call: (c) => c.labels.getCommon(TRACKING) },
    {
      name: 'finance.getSettlements',
      call: (c) =>
        c.finance.getSettlements({
          transactionType: 'Sale',
          startDate: new Date('2026-10-01T00:00:00Z'),
          endDate: new Date('2026-10-14T00:00:00Z'),
          limit: 500,
        }),
    },
    {
      name: 'finance.getOtherFinancials',
      call: (c) =>
        c.finance.getOtherFinancials({
          transactionType: 'DeductionInvoices',
          startDate: new Date('2026-10-01T00:00:00Z'),
          endDate: new Date('2026-10-14T00:00:00Z'),
        }),
    },

    // ─── Seller, locations ────────────────────────────────────────────────
    { name: 'suppliers.getAddresses', call: (c) => c.suppliers.getAddresses() },
    { name: 'locations.getCountries', call: (c) => c.locations.getCountries() },
    { name: 'locations.getTurkeyCities', call: (c) => c.locations.getTurkeyCities() },
    { name: 'locations.getTurkeyDistricts', call: (c) => c.locations.getTurkeyDistricts(34) },
    {
      name: 'locations.getTurkeyNeighborhoods',
      call: (c) => c.locations.getTurkeyNeighborhoods(34, 1183),
    },
    { name: 'locations.getAzerbaijanCities', call: (c) => c.locations.getAzerbaijanCities() },
    {
      name: 'locations.getAzerbaijanDistricts',
      call: (c) => c.locations.getAzerbaijanDistricts(1),
    },
    { name: 'locations.getCitiesByCountry', call: (c) => c.locations.getCitiesByCountry('SA') },
    {
      name: 'locations.getDistrictsByCity',
      call: (c) => c.locations.getDistrictsByCity('SA', 11),
    },

    // ─── Webhooks ─────────────────────────────────────────────────────────
    {
      name: 'webhooks.create',
      call: (c) =>
        c.webhooks.create({
          url: 'https://my-app.example.com/trendyol/webhook',
          authenticationType: 'API_KEY',
          apiKey: 'rotatable-secret',
          subscribedStatuses: ['CREATED', 'SHIPPED', 'DELIVERED'],
        }),
    },
    { name: 'webhooks.list', call: (c) => c.webhooks.list() },
    {
      name: 'webhooks.update',
      call: (c) =>
        c.webhooks.update('6e3c1f2a-1b2c-4d5e-8f90-a1b2c3d4e5f6', {
          url: 'https://my-app.example.com/trendyol/webhook',
          authenticationType: 'BASIC_AUTHENTICATION',
          username: 'trendyol',
          password: 'hook-password',
          subscribedStatuses: ['CREATED'],
        }),
    },
    {
      name: 'webhooks.delete',
      call: (c) => c.webhooks.delete('6e3c1f2a-1b2c-4d5e-8f90-a1b2c3d4e5f6'),
    },
    {
      name: 'webhooks.activate',
      call: (c) => c.webhooks.activate('6e3c1f2a-1b2c-4d5e-8f90-a1b2c3d4e5f6'),
    },
    {
      name: 'webhooks.deactivate',
      call: (c) => c.webhooks.deactivate('6e3c1f2a-1b2c-4d5e-8f90-a1b2c3d4e5f6'),
    },

    // ─── Videos ───────────────────────────────────────────────────────────
    {
      name: 'videos.create',
      call: (c) =>
        c.videos.create({
          title: 'Basic Tişört Tanıtım',
          description: 'Kumaş ve kalıp detayları',
          videoUrl: 'https://cdn.example.com/videos/tshirt.mp4',
          productContentIds: ['856412331'],
          videoContentType: 'PRODUCT_PROMOTION',
        }),
    },
    {
      name: 'videos.list',
      call: (c) => c.videos.list({ sellerIntegrationStatus: 'SUCCESS', limit: 50 }),
    },

    // ─── Test orders (stage) ──────────────────────────────────────────────
    {
      name: 'testOrders.create',
      call: () =>
        stage().testOrders.create({
          customer: { customerFirstName: 'Ayşe', customerLastName: 'Yılmaz' },
          invoiceAddress: {
            addressText: 'Atatürk Cad. No:1',
            city: 'İstanbul',
            district: 'Kadıköy',
            invoiceFirstName: 'Ayşe',
            invoiceLastName: 'Yılmaz',
            phone: '5551234567',
            email: 'ayse@example.com',
          },
          shippingAddress: {
            addressText: 'Atatürk Cad. No:1',
            city: 'İstanbul',
            district: 'Kadıköy',
            shippingFirstName: 'Ayşe',
            shippingLastName: 'Yılmaz',
            phone: '5551234567',
            email: 'ayse@example.com',
          },
          seller: { sellerId: 123456 },
          lines: [{ barcode: '8690000000001', quantity: 1 }],
          commercial: false,
        }),
    },
    {
      name: 'testOrders.updateStatus: status only',
      call: () => stage().testOrders.updateStatus(PACKAGE, 'Shipped'),
    },
    {
      name: 'testOrders.updateStatus: lines',
      call: () =>
        stage().testOrders.updateStatus(PACKAGE, 'Delivered', {
          lines: [{ lineId: 4_944_785, quantity: 1 }],
          params: {},
        }),
    },
    {
      name: 'testOrders.setClaimsWaitingInAction',
      call: () => stage().testOrders.setClaimsWaitingInAction({ shipmentPackageId: PACKAGE }),
    },

    // ─── Export Center (İhracat Merkezi) ──────────────────────────────────
    {
      name: 'exportCenter.listProducts',
      call: (c) => c.exportCenter.listProducts({ barcodes: ['8690000000001'], size: 100 }),
    },
    {
      name: 'exportCenter.createProducts',
      call: (c) =>
        c.exportCenter.createProducts([
          {
            barcode: '8690000000001',
            buyingPrice: 180,
            rrp: 299.9,
            gtip: '610910000000',
            origin: 'TR',
            stock: 25,
            categoryId: 411,
            attributes: [{ attributeId: 47, attributeValueId: 4294 }],
          },
        ]),
    },
    {
      name: 'exportCenter.updatePrices',
      call: (c) =>
        c.exportCenter.updatePrices([{ barcode: '8690000000001', buyingPrice: 175, rrp: 289.9 }]),
    },
    {
      name: 'exportCenter.updateStocks',
      call: (c) => c.exportCenter.updateStocks([{ barcode: '8690000000001', stock: 20 }]),
    },
    { name: 'exportCenter.getBatchStatus', call: (c) => c.exportCenter.getBatchStatus(BATCH) },
    {
      name: 'exportCenter.listPackagesV2',
      call: (c) =>
        c.exportCenter.listPackagesV2({
          status: 'new',
          creationStartDate: Date.UTC(2026, 9, 1),
          creationEndDate: Date.UTC(2026, 9, 14),
          size: 100,
        }),
    },
    {
      name: 'exportCenter.listPackagesV3',
      call: (c) =>
        c.exportCenter.listPackagesV3({
          status: 'pending',
          creationStartDate: Date.UTC(2026, 9, 1),
          limit: 50,
        }),
    },
    {
      name: 'exportCenter.getPackageItems',
      call: (c) => c.exportCenter.getPackageItems({ packageId: 'EC-1000123', limit: 50 }),
    },
    {
      name: 'exportCenter.getCategoryAttributes',
      call: (c) => c.exportCenter.getCategoryAttributes(411),
    },
    { name: 'exportCenter.getCareInstructions', call: (c) => c.exportCenter.getCareInstructions() },
    { name: 'exportCenter.getCompositions', call: (c) => c.exportCenter.getCompositions() },
    { name: 'exportCenter.getOrigins', call: (c) => c.exportCenter.getOrigins() },
  ],
};
