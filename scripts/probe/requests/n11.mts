/**
 * n11 request samples. `specs/n11` holds the REST operations (products, price
 * and stock, orders); the SOAP services have no spec in the repo (n11's WSDLs
 * are not redistributed), so their samples run but are not compared.
 */
import { createN11Client, type N11Client } from '@lonca/n11';
import type { RequestSet } from './registry.mts';

const SOAP = 'SOAP service; no spec in specs/n11 (the WSDLs are not redistributed)';
const PROCESSED = () => ({
  id: 1,
  taskId: 1,
  status: 'PROCESSED',
  skus: { content: [], last: true, totalPages: 1 },
});

export const n11Requests: RequestSet<N11Client> = {
  marketplace: 'n11',
  createClient: (fetch) =>
    createN11Client({
      appKey: 'key',
      appSecret: 'secret',
      env: 'prod',
      integratorName: 'LoncaCheck',
      fetch,
    }),
  calls: [
    {
      name: 'products.list',
      call: (c) => c.products.list({ stockCode: 'SKU-1', saleStatus: 'On_Sale', limit: 50 }),
    },
    {
      name: 'products.create',
      call: (c) =>
        c.products.create([
          {
            stockCode: 'SKU-1',
            title: 'Örnek Güzel Yazı Defteri A4',
            description: '<p>Örnek</p>',
            categoryId: 1001012,
            productMainId: 'MAIN-1',
            preparingDay: 3,
            shipmentTemplate: 'Depo',
            quantity: 5,
            salePrice: 149.9,
            listPrice: 199,
            vatRate: 20,
            images: [{ url: 'https://example.com/1.jpg', order: 1 }],
            attributes: [{ id: 1, valueId: 2306398 }],
            maxPurchaseQuantity: 2,
          },
        ]),
    },
    {
      name: 'products.update',
      call: (c) =>
        c.products.update([
          { stockCode: 'SKU-1', status: 'Suspended', preparingDay: 2, maxPurchaseQuantity: 3 },
        ]),
    },
    { name: 'products.delete', call: (c) => c.products.delete(['SKU-1']) },
    { name: 'products.getTask', call: (c) => c.products.getTask('1'), respond: PROCESSED },
    { name: 'products.waitForTask', call: (c) => c.products.waitForTask('1'), respond: PROCESSED },
    {
      name: 'inventory.update',
      call: (c) =>
        c.inventory.update([
          { stockCode: 'SKU-1', quantity: 3 },
          { stockCode: 'SKU-2', salePrice: 99.9, listPrice: 120 },
        ]),
    },
    {
      name: 'inventory.updateAndWait',
      call: (c) => c.inventory.updateAndWait([{ stockCode: 'SKU-1', quantity: 3 }]),
      respond: PROCESSED,
    },
    {
      name: 'orders.list',
      call: (c) =>
        c.orders.list({ status: 'Created', startDate: Date.UTC(2026, 9, 1), orderByField: true }),
    },
    { name: 'orders.approve', call: (c) => c.orders.approve(['1001']) },
    { name: 'orders.splitPackage', call: (c) => c.orders.splitPackage([['1001'], ['1002']]) },
    {
      name: 'orders.splitPackageByQuantity',
      call: (c) =>
        c.orders.splitPackageByQuantity({
          packages: [[{ lineId: '1001', quantity: 1 }], [{ lineId: '1001', quantity: 1 }]],
        }),
    },
    {
      name: 'orders.createCollectionRequest',
      call: (c) =>
        c.orders.createCollectionRequest([
          { packageId: 'PKG-1', lineId: '1001', boxQuantity: 1, desi: 3, shipmentCompany: 'HLZ' },
        ]),
    },
    {
      name: 'orders.updateLaborCosts',
      call: (c) => c.orders.updateLaborCosts([{ lineId: '1001', amountExcludingVat: 150 }]),
    },
    {
      name: 'orders.cancelItem',
      call: (c) => c.orders.cancelItem({ lineId: '1001', quantity: 1, reasonId: 61 }),
      skip: SOAP,
    },
    {
      name: 'orders.sendInvoiceLink',
      call: (c) =>
        c.orders.sendInvoiceLink({ orderNumber: '2026-1', url: 'https://example.com/f.pdf' }),
      skip: SOAP,
    },
    {
      name: 'categories.list',
      call: (c) => c.categories.list(),
      respond: () => ({ categories: [] }),
    },
    { name: 'categories.getAttributes', call: (c) => c.categories.getAttributes(1001012) },
    {
      name: 'catalog.search',
      call: (c) => c.catalog.search({ barcodes: ['8690000000001'] }),
      skip: SOAP,
    },
    {
      name: 'questions.list',
      call: (c) => c.questions.list({ startDate: '01/10/2026', endDate: '14/10/2026' }),
      skip: SOAP,
    },
    { name: 'questions.get', call: (c) => c.questions.get('1'), skip: SOAP },
    { name: 'questions.answer', call: (c) => c.questions.answer('1', 'Evet'), skip: SOAP },
    { name: 'claims.listReturns', call: (c) => c.claims.listReturns(), skip: SOAP },
    { name: 'claims.listCancels', call: (c) => c.claims.listCancels(), skip: SOAP },
    {
      name: 'claims.getReturnDenyReasons',
      call: (c) => c.claims.getReturnDenyReasons(),
      skip: SOAP,
    },
    {
      name: 'claims.getReturnPendingReasons',
      call: (c) => c.claims.getReturnPendingReasons(),
      skip: SOAP,
    },
    {
      name: 'claims.getCancelDenyReasons',
      call: (c) => c.claims.getCancelDenyReasons(),
      skip: SOAP,
    },
    { name: 'claims.approveReturn', call: (c) => c.claims.approveReturn('1'), skip: SOAP },
    {
      name: 'claims.denyReturn',
      call: (c) => c.claims.denyReturn({ claimReturnId: '1', denyReasonId: 1, note: 'Not' }),
      skip: SOAP,
    },
    {
      name: 'claims.postponeReturn',
      call: (c) =>
        c.claims.postponeReturn({ claimReturnId: '1', pendingReasonId: 1, days: 2, note: 'Not' }),
      skip: SOAP,
    },
    {
      name: 'shipping.getShipmentCompanies',
      call: (c) => c.shipping.getShipmentCompanies(),
      skip: SOAP,
    },
  ],
};
