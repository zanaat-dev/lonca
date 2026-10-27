/**
 * Normalisers vs the real response shapes (roadmap Faz 1b — `pnpm drift:types`).
 *
 * Each fixture has the key set and JSON types of a prod wire row
 * (`probe-snapshots/hepsiburada.json`, 2026-10-09) and the documented schema
 * (`specs/hepsiburada/*.json`). Every value is invented.
 */
import { describe, expect, it, vi } from 'vitest';
import { TokenBucketRateLimiter } from '@lonca/core';
import { AccountingResource } from '../resources/accounting.js';
import { CatalogResource } from '../resources/catalog.js';
import { CategoriesResource } from '../resources/categories.js';
import { OrdersResource } from '../resources/orders.js';
import type { HepsiburadaTransport } from '../transport.js';

function mockTransport(response: unknown) {
  return {
    merchantId: 'M-wire',
    request: vi.fn().mockResolvedValue(response),
  } as unknown as HepsiburadaTransport;
}
const fastLimiter = () => new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 1 });

// ─── Accounting ──────────────────────────────────────────────────────────

const transactionRow = {
  id: 'tx-0001',
  transactionType: 'Commission',
  transactionTypeCategory: 'Sales',
  status: 'Open',
  sku: 'HBV00000TEST1',
  productName: 'Test Mug 300 ml',
  quantity: 2,
  merchantId: 'M-wire',
  orderNumber: '0000000001',
  orderItemNumber: 'item-0001',
  packageNumber: 'pkg-0001',
  invoiceNumber: 'INV-0001',
  invoiceExplanation: null,
  isInvoice: true,
  isIncome: false,
  amount: { value: 12.5, currencyCode: 'TRY' },
  taxAmount: { value: 2.08, currencyCode: 'TRY' },
  netAmount: { value: 10.42, currencyCode: 'TRY' },
  orderDate: '2026-09-01T10:00:00',
  invoiceDate: '2026-09-02T10:00:00',
  dueDate: '2026-09-30T00:00:00',
  paymentDate: null,
};

describe('accounting.listTransactions — prod wire row', () => {
  const list = (body: unknown) =>
    new AccountingResource(mockTransport(body), fastLimiter()).listTransactions();

  it('maps the documented fields, keeping the money objects', async () => {
    const [tx] = await list({ count: 1, items: [transactionRow] });
    expect(tx).toMatchObject({
      id: 'tx-0001',
      transactionType: 'Commission',
      transactionTypeCategory: 'Sales',
      status: 'Open',
      sku: 'HBV00000TEST1',
      productName: 'Test Mug 300 ml',
      quantity: 2,
      merchantId: 'M-wire',
      orderNumber: '0000000001',
      orderItemNumber: 'item-0001',
      packageNumber: 'pkg-0001',
      invoiceNumber: 'INV-0001',
      isInvoice: true,
      isIncome: false,
      transactionAmount: { value: 12.5, currencyCode: 'TRY' },
      taxAmount: { value: 2.08, currencyCode: 'TRY' },
      netAmount: { value: 10.42, currencyCode: 'TRY' },
      orderDate: '2026-09-01T10:00:00',
      invoiceDate: '2026-09-02T10:00:00',
      dueDate: '2026-09-30T00:00:00',
    });
    expect(tx!.raw).toBe(transactionRow);
  });

  it('leaves null wire values unset', async () => {
    const [tx] = await list({ items: [transactionRow] });
    expect(tx).not.toHaveProperty('paymentDate');
    expect(tx).not.toHaveProperty('invoiceExplanation');
    const [paid] = await list({
      items: [{ ...transactionRow, paymentDate: '2026-10-01T00:00:00' }],
    });
    expect(paid!.paymentDate).toBe('2026-10-01T00:00:00');
  });

  it('back-fills the deprecated fields from their exact equivalents', async () => {
    const [tx] = await list({ items: [transactionRow] });
    expect(tx).toMatchObject({
      transactionId: 'tx-0001',
      type: 'Commission',
      amount: 12.5,
      currency: 'TRY',
    });
    // No real field is an exact equivalent of `transactionDate`.
    expect(tx).not.toHaveProperty('transactionDate');
  });

  it('prefers legacy wire names when a row carries them', async () => {
    const [tx] = await list([
      { transactionId: 'T-legacy', type: 'Legacy', amount: 99.9, currency: 'USD', id: 'tx-2' },
    ]);
    expect(tx).toMatchObject({
      id: 'tx-2',
      transactionId: 'T-legacy',
      type: 'Legacy',
      amount: 99.9,
      currency: 'USD',
    });
    expect(tx).not.toHaveProperty('transactionAmount');
  });

  it('drops mistyped money parts and non-object amounts', async () => {
    const [tx] = await list({
      items: [
        {
          amount: { value: '12.5', currencyCode: 'TRY' },
          taxAmount: 'n/a',
          netAmount: [1],
          quantity: '2',
          isIncome: 'yes',
        },
      ],
    });
    expect(tx!.transactionAmount).toEqual({ currencyCode: 'TRY' });
    expect(tx).not.toHaveProperty('amount');
    expect(tx!.currency).toBe('TRY');
    expect(tx).not.toHaveProperty('taxAmount');
    expect(tx).not.toHaveProperty('netAmount');
    expect(tx).not.toHaveProperty('quantity');
    expect(tx).not.toHaveProperty('isIncome');
  });
});

// ─── Orders ──────────────────────────────────────────────────────────────

const price = (amount: number) => ({ amount, currency: 'TRY' });
const orderLine = {
  id: 'line-0001',
  orderId: 'order-0001',
  orderNumber: '0000000001',
  orderDate: '2026-09-01T10:00:00',
  lastStatusUpdateDate: '2026-09-01T11:00:00',
  dueDate: '2026-09-03T23:59:59',
  status: 'Open',
  customerId: 'cust-0001',
  customerName: 'Test Customer',
  packageNumber: 'pkg-0001',
  sku: 'HBV00000TEST1',
  merchantSKU: 'MUG-300',
  barcode: '0000000000001',
  productBarcode: '0000000000001',
  name: 'Test Mug 300 ml',
  quantity: 2,
  cargoCompany: 'Test Kargo',
  unitPrice: price(50),
  totalPrice: price(100),
  vat: 16.67,
  vatRate: 20,
  deci: 1.5,
  totalDeci: 3,
  hasInvoice: false,
  commission: price(10),
  shippingAddress: { name: 'Test Customer', city: 'Ankara' },
  pickUpTime: null,
};

describe('orders.list — prod wire order line', () => {
  it('maps the line fields (merchantSKU → merchantSku, prices as { amount, currency })', async () => {
    const page = await new OrdersResource(
      mockTransport({ totalCount: 1, limit: 10, offset: 0, pageCount: 1, items: [orderLine] }),
      fastLimiter(),
    ).list();
    const [order] = page.items;
    expect(order).toMatchObject({
      id: 'line-0001',
      orderId: 'order-0001',
      orderNumber: '0000000001',
      orderDate: '2026-09-01T10:00:00',
      lastStatusUpdateDate: '2026-09-01T11:00:00',
      dueDate: '2026-09-03T23:59:59',
      status: 'Open',
      customerId: 'cust-0001',
      customerName: 'Test Customer',
      packageNumber: 'pkg-0001',
      sku: 'HBV00000TEST1',
      merchantSku: 'MUG-300',
      barcode: '0000000000001',
      name: 'Test Mug 300 ml',
      quantity: 2,
      cargoCompany: 'Test Kargo',
      unitPrice: { amount: 50, currency: 'TRY' },
      totalPrice: { amount: 100, currency: 'TRY' },
      vat: 16.67,
      vatRate: 20,
      deci: 1.5,
      totalDeci: 3,
      hasInvoice: false,
    });
    expect(order!.raw).toBe(orderLine);
  });

  it('never invents the deprecated fields Hepsiburada does not send', async () => {
    const page = await new OrdersResource(
      mockTransport({ items: [orderLine] }),
      fastLimiter(),
    ).list();
    const [order] = page.items;
    for (const key of ['externalOrderNumber', 'modifiedDate', 'total', 'createdDate']) {
      expect(order).not.toHaveProperty(key);
    }
  });

  it('drops mistyped prices and numbers', async () => {
    const page = await new OrdersResource(
      mockTransport({
        items: [
          {
            unitPrice: 50,
            totalPrice: { amount: '100', currency: 'TRY' },
            quantity: '2',
            deci: '1',
            hasInvoice: 'true',
          },
        ],
      }),
      fastLimiter(),
    ).list();
    const [order] = page.items;
    expect(order).not.toHaveProperty('unitPrice');
    expect(order!.totalPrice).toEqual({ currency: 'TRY' });
    expect(order).not.toHaveProperty('quantity');
    expect(order).not.toHaveProperty('deci');
    expect(order).not.toHaveProperty('hasInvoice');
  });

  it('reads the lower-case merchantSku of the cancelled feed', async () => {
    const page = await new OrdersResource(
      mockTransport({ items: [{ orderNumber: '0000000002', merchantSku: 'MUG-301' }] }),
      fastLimiter(),
    ).listCancelled();
    expect(page.items[0]!.merchantSku).toBe('MUG-301');
  });

  it('getByOrderNumber maps the documented detail root (createdDate, orderDate, customer)', async () => {
    const order = await new OrdersResource(
      mockTransport({
        orderId: 'order-0001',
        orderNumber: '0000000001',
        orderDate: '2026-09-01T10:00:00',
        createdDate: '2026-09-01T10:00:05',
        customer: { name: 'Test Customer' },
        items: [orderLine],
      }),
      fastLimiter(),
    ).getByOrderNumber('0000000001');
    expect(order).toMatchObject({
      orderId: 'order-0001',
      orderNumber: '0000000001',
      orderDate: '2026-09-01T10:00:00',
      createdDate: '2026-09-01T10:00:05',
      customerName: 'Test Customer',
    });
  });
});

describe('orders.listPackages — prod wire package', () => {
  // Key set of a `GET /packages/merchantid/{merchantId}` row (prod, 2026-10-27).
  const packageRow = {
    packageNumber: 'pkg-0001',
    status: 'Packaged',
    cargoCompany: 'Test Kargo',
    totalDeci: 3,
    warehouse: { shippingAddressLabel: 'Depo 1', shippingModel: 'Standard' },
    items: [
      {
        orderNumber: '0000000001',
        quantity: 2,
        deci: 1.5,
        warehouse: { shippingAddressLabel: 'Depo 1', shippingModel: 'Standard' },
      },
    ],
  };

  it('maps totalDeci and warehouse', async () => {
    const [pkg] = await new OrdersResource(
      mockTransport([packageRow]),
      fastLimiter(),
    ).listPackages();
    expect(pkg).toEqual({
      packageNumber: 'pkg-0001',
      status: 'Packaged',
      cargoCompany: 'Test Kargo',
      totalDeci: 3,
      warehouse: { shippingAddressLabel: 'Depo 1', shippingModel: 'Standard' },
      raw: packageRow,
    });
  });

  it('drops a mistyped totalDeci and warehouse', async () => {
    const [pkg] = await new OrdersResource(
      mockTransport([{ packageNumber: 'pkg-0002', totalDeci: '3', warehouse: 'Depo 1' }]),
      fastLimiter(),
    ).listPackages();
    expect(pkg).not.toHaveProperty('totalDeci');
    expect(pkg).not.toHaveProperty('warehouse');
  });
});

// ─── Catalog ─────────────────────────────────────────────────────────────

const springPage = (rows: unknown[]) => ({
  success: true,
  code: 0,
  version: 1,
  message: null,
  totalElements: rows.length,
  totalPages: 1,
  number: 0,
  numberOfElements: rows.length,
  first: true,
  last: true,
  data: rows,
});
const attribute = (name: string, value: string, mandatory = false) => ({ name, value, mandatory });

const allProductsRow = {
  merchantSku: 'MUG-300',
  barcode: '0000000000001',
  hbSku: 'HBV00000TEST1',
  variantGroupId: 'vg-0001',
  productName: 'Test Mug 300 ml',
  brand: 'Test Brand',
  images: ['https://img.example.test/1.jpg', 'https://img.example.test/2.jpg'],
  categoryId: 60000001,
  categoryName: 'Test Mugs',
  tax: '20',
  price: '149.90',
  description: 'A test mug.',
  status: 'MATCHED',
  baseAttributes: [attribute('Marka', 'Test Brand', true)],
  productAttributes: [attribute('Hacim', '300 ml')],
  variantTypeAttributes: [attribute('Renk', 'Mavi', true)],
  validationResults: [],
  rejectReasons: [],
};

const byStatusRow = {
  merchantSku: 'MUG-300',
  barcode: '0000000000001',
  hbSku: 'HBV00000TEST1',
  variantGroupId: 'vg-0001',
  productName: 'Test Mug 300 ml',
  productStatus: 'MATCHED',
  taskDetails: [{ reason: 'Fix image', url: 'https://task.example.test/1', commentList: [] }],
  validationResults: [{ attributeName: 'Renk', message: 'Test validation message' }],
  matchedHbProductInfo: [
    {
      hbSku: 'HBV00000TEST1',
      productName: 'Test Mug 300 ml',
      brand: 'Test Brand',
      images: ['https://img.example.test/1.jpg'],
      variantTypeAttributes: [{ name: 'Renk', value: 'Mavi' }],
    },
  ],
  rejectReasonsMessages: [],
  videoStatus: 'NONE',
};

describe('catalog list endpoints — prod wire rows', () => {
  const catalog = (body: unknown) => new CatalogResource(mockTransport(body), fastLimiter());

  it('listProducts maps an all-products-of-merchant row', async () => {
    const page = await catalog(springPage([allProductsRow])).listProducts();
    const [p] = page.items;
    expect(p).toMatchObject({
      merchantSku: 'MUG-300',
      barcode: '0000000000001',
      hbSku: 'HBV00000TEST1',
      variantGroupId: 'vg-0001',
      title: 'Test Mug 300 ml',
      brand: 'Test Brand',
      images: ['https://img.example.test/1.jpg', 'https://img.example.test/2.jpg'],
      categoryId: '60000001',
      categoryName: 'Test Mugs',
      description: 'A test mug.',
      price: '149.90',
      tax: '20',
      status: 'MATCHED',
      baseAttributes: [{ name: 'Marka', value: 'Test Brand', mandatory: true }],
      productAttributes: [{ name: 'Hacim', value: '300 ml', mandatory: false }],
      variantTypeAttributes: [{ name: 'Renk', value: 'Mavi', mandatory: true }],
      validationResults: [],
      rejectReasons: [],
    });
    expect(p).not.toHaveProperty('productStatus');
    expect(p!.raw).toBe(allProductsRow);
  });

  it('listProductsByStatus maps a products-by-merchant-and-status row', async () => {
    const page = await catalog(springPage([byStatusRow])).listProductsByStatus({
      status: 'MATCHED',
    });
    const [p] = page.items;
    expect(p).toMatchObject({
      merchantSku: 'MUG-300',
      barcode: '0000000000001',
      hbSku: 'HBV00000TEST1',
      variantGroupId: 'vg-0001',
      title: 'Test Mug 300 ml',
      productStatus: 'MATCHED',
      // `status` mirrors `productStatus` so both endpoints expose the lifecycle status there.
      status: 'MATCHED',
      taskDetails: [{ reason: 'Fix image', url: 'https://task.example.test/1', commentList: [] }],
      validationResults: [{ attributeName: 'Renk', message: 'Test validation message' }],
      matchedHbProductInfo: [
        {
          hbSku: 'HBV00000TEST1',
          productName: 'Test Mug 300 ml',
          brand: 'Test Brand',
          images: ['https://img.example.test/1.jpg'],
          // `{ name, value }` pairs here — `mandatory` is not part of this schema.
          variantTypeAttributes: [{ name: 'Renk', value: 'Mavi' }],
        },
      ],
      rejectReasonsMessages: [],
      videoStatus: 'NONE',
    });
    // Only all-products-of-merchant rows carry these.
    for (const key of ['brand', 'images', 'categoryId', 'price', 'baseAttributes']) {
      expect(p).not.toHaveProperty(key);
    }
  });

  it('never invents the deprecated fields neither endpoint sends', async () => {
    const page = await catalog(springPage([allProductsRow, byStatusRow])).listProducts();
    const deprecated = [
      'id',
      'createdAt',
      'createdBy',
      'modifiedAt',
      'modifiedBy',
      'preMatchedSku',
      'siblingSku',
      'listingStatus',
      'listingFailureReason',
      'validationStatus',
      'productType',
      'uploadDate',
      'productQuality',
      'categoryScore',
      'fields',
    ];
    for (const p of page.items) for (const key of deprecated) expect(p).not.toHaveProperty(key);
  });

  it('keeps a wire status over productStatus and drops mistyped nested values', async () => {
    const page = await catalog(
      springPage([
        {
          status: 'WAITING',
          productStatus: 'MATCHED',
          baseAttributes: [{ name: 'Marka', value: 1, mandatory: 'yes' }, 'junk', null],
          validationResults: [{ attributeName: 7, message: 'm' }, ['x']],
          rejectReasons: ['bad image', 3],
          taskDetails: [{ reason: 1, url: 'u', commentList: 'none' }],
          matchedHbProductInfo: [
            { hbSku: 5, images: 'img', variantTypeAttributes: {} },
            { variantTypeAttributes: [{ name: 'Renk', value: 'Mavi', mandatory: true }] },
          ],
          price: 149.9,
        },
      ]),
    ).listProducts();
    const [p] = page.items;
    expect(p!.status).toBe('WAITING');
    expect(p!.productStatus).toBe('MATCHED');
    expect(p!.baseAttributes).toEqual([{ name: 'Marka' }]);
    expect(p!.validationResults).toEqual([{ message: 'm' }]);
    expect(p!.rejectReasons).toEqual(['bad image']);
    expect(p!.taskDetails).toEqual([{ url: 'u' }]);
    expect(p!.matchedHbProductInfo).toEqual([
      {},
      { variantTypeAttributes: [{ name: 'Renk', value: 'Mavi' }] },
    ]);
    expect(p).not.toHaveProperty('price');
  });
});

// ─── Category attributes ─────────────────────────────────────────────────

describe('categories.getAttributes — prod wire attribute', () => {
  it('maps type / multiValue and leaves the undocumented fields unset', async () => {
    const wireAttribute = (id: string, name: string) => ({
      id,
      name,
      mandatory: true,
      type: 'enum',
      multiValue: false,
    });
    const attrs = await new CategoriesResource(
      mockTransport({
        success: true,
        code: 0,
        version: 1,
        message: null,
        data: {
          baseAttributes: [wireAttribute('00000001', 'Marka')],
          attributes: [{ ...wireAttribute('00000002', 'Hacim'), multiValue: true, type: 'string' }],
          variantAttributes: [wireAttribute('00000003', 'Renk')],
        },
      }),
      fastLimiter(),
    ).getAttributes(60000001);
    expect(attrs).toEqual([
      expect.objectContaining({
        id: '00000001',
        name: 'Marka',
        mandatory: true,
        type: 'enum',
        multiValue: false,
        group: 'base',
      }),
      expect.objectContaining({
        id: '00000002',
        type: 'string',
        multiValue: true,
        group: 'category',
      }),
      expect.objectContaining({ id: '00000003', group: 'variant' }),
    ]);
    for (const a of attrs) {
      expect(a).not.toHaveProperty('externalName');
      expect(a).not.toHaveProperty('values');
    }
  });
});
