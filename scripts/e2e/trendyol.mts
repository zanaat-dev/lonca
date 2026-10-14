#!/usr/bin/env -S pnpm exec tsx
/**
 * End-to-end run of every `@lonca/trendyol` method against Trendyol STAGE.
 *
 *   pnpm build --filter @lonca/trendyol...
 *   pnpm e2e:trendyol                  # reads .env (TY_ENV must be `stage`)
 *
 * Stage answers only from allow-listed IPs (the maintainer's VPN). The script
 * refuses to run unless `TY_ENV=stage`, so it can never write to a real seller.
 *
 * What it does:
 * - Reads: every read method with realistic parameters.
 * - Price / stock: changes one stage product, reads it back, restores it.
 * - Products: creates one `LONCA-E2E-<time>` product copied from a stage
 *   product's category / brand / attributes, then updates, archives and
 *   deletes it.
 * - Orders: opens fresh test orders (`testOrders.create`) and walks them
 *   through picking, invoicing, carrier change, splits, cancel, labels,
 *   shipping, delivery and a return claim.
 * - Webhooks: creates one, updates, toggles and deletes it.
 *
 * Outcomes: `ok` the success path was verified; `refused` Trendyol refused
 * with a business rule or a stage limit that is understood (note says why);
 * `skip` not exercisable; `FAIL` anything else. Exit 0 when nothing FAILed.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- reads untyped stage `raw` rows */
import { AuthError, LoncaError, NotFoundError, ValidationError } from '@lonca/core';
import { createTrendyolClient, isBatchSettled, type TrendyolClient } from '@lonca/trendyol';
import { publicMethods } from './public-methods.mts';

const DAY = 864e5;
const SPACING_MS = 800;
/** A stage product with plenty of stock (restored after the price/stock check). */
const STOCK_BARCODE = '3180246363757';

type Outcome = 'ok' | 'refused' | 'skip' | 'FAIL';
interface Check {
  methods: string[];
  name: string;
  outcome: Outcome;
  note: string;
}
const checks: Check[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** The smallest well-formed PDF (one empty page): Trendyol answers a bare `%PDF` header with 500. */
function tinyPdf(): Blob {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  const rows = offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${rows}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([out], { type: 'application/pdf' });
}
class CheckFailed extends Error {}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new CheckFailed(message);
}
function describeError(error: unknown): string {
  if (error instanceof LoncaError) {
    return `${error.constructor.name}${error.status ? ` ${error.status}` : ''}: ${error.message.slice(0, 220)}`;
  }
  return error instanceof Error
    ? `${error.constructor.name}: ${error.message.slice(0, 220)}`
    : String(error);
}

async function check(
  method: string | string[],
  name: string,
  run: () => Promise<{ outcome?: Outcome; note: string } | string>,
): Promise<void> {
  await sleep(SPACING_MS);
  const methods = Array.isArray(method) ? method : [method];
  let result: Check;
  try {
    const out = await run();
    result =
      typeof out === 'string'
        ? { methods, name, outcome: 'ok', note: out }
        : { methods, name, outcome: out.outcome ?? 'ok', note: out.note };
  } catch (error) {
    result = { methods, name, outcome: 'FAIL', note: describeError(error) };
  }
  checks.push(result);
  console.log(`${result.outcome.padEnd(7)} ${name} — ${result.note}`);
}
function skip(method: string, why: string) {
  checks.push({ methods: [method], name: method, outcome: 'skip', note: why });
  console.log(`skip    ${method} — ${why}`);
}

/**
 * The call must be refused with a business rule (`ValidationError` /
 * `NotFoundError`), or — when `stageAuth` explains it — a stage permission
 * `AuthError`. Anything else, including success, fails the check.
 */
async function refused(
  call: () => Promise<unknown>,
  stageAuth?: string,
): Promise<{ outcome: Outcome; note: string }> {
  try {
    const value = await call();
    throw new CheckFailed(`expected a refusal, got ${JSON.stringify(value)?.slice(0, 160)}`);
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError)
      return { outcome: 'refused', note: describeError(error) };
    if (stageAuth && error instanceof AuthError)
      return { outcome: 'refused', note: `${stageAuth} (${describeError(error)})` };
    throw error;
  }
}
/** Success, or a business-rule refusal (stage data decides which). */
async function either(
  call: () => Promise<unknown>,
  okNote: (v: unknown) => string,
  stageAuth?: string,
): Promise<{ outcome: Outcome; note: string }> {
  try {
    return { outcome: 'ok', note: okNote(await call()) };
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError)
      return { outcome: 'refused', note: describeError(error) };
    if (stageAuth && error instanceof AuthError)
      return { outcome: 'refused', note: `${stageAuth} (${describeError(error)})` };
    throw error;
  }
}

if (process.env.TY_ENV !== 'stage') {
  console.error('refusing to run: TY_ENV must be `stage` (this script writes)');
  process.exit(2);
}
const sellerId = Number(process.env.TY_SELLER_ID);
const c: TrendyolClient = createTrendyolClient({
  sellerId,
  apiKey: process.env.TY_API_KEY!,
  apiSecret: process.env.TY_API_SECRET!,
  env: 'stage',
  integratorName: process.env.TY_INTEGRATOR_NAME ?? 'LoncaDev',
});
const stamp = Date.now();

// ── Reads ──────────────────────────────────────────────────────────────────
let sampleProduct: Record<string, any> | undefined;
await check('products.list', 'products.list: approved, by barcode', async () => {
  const page = await c.products.list({ barcode: STOCK_BARCODE });
  sampleProduct = page.items[0]?.raw as Record<string, any> | undefined;
  assert(sampleProduct, 'stage product not found');
  return `content ${sampleProduct.contentId}, category ${sampleProduct.category?.id}, brand ${sampleProduct.brand?.id}`;
});
await check('products.listInventoryAndPrice', 'products.listInventoryAndPrice', async () => {
  const page = await c.products.listInventoryAndPrice({ limit: 5 });
  return `${page.items.length} rows`;
});
await check('products.listUnapproved', 'products.listUnapproved', async () => {
  const page = await c.products.listUnapproved({ startDate: new Date(stamp - 30 * DAY), limit: 5 });
  return `${page.items.length} rows`;
});
await check('products.getBase', 'products.getBase', async () => {
  const base = await c.products.getBase(STOCK_BARCODE);
  return `title ${String((base as any).title ?? (base as any).raw?.title).slice(0, 40)}`;
});
await check('products.getBuyboxInfo', 'products.getBuyboxInfo', () =>
  either(
    () => c.products.getBuyboxInfo([STOCK_BARCODE]),
    (v) => `${(v as unknown[]).length} rows`,
  ),
);
const categoryId = String(sampleProduct?.category?.id ?? 411);
let attributeIdWithValues: string | undefined;
await check(
  'brands.list',
  'brands.list',
  async () => `${(await c.brands.list({ limit: 100 })).items.length} brands`,
);
await check(
  'brands.search',
  'brands.search',
  async () =>
    `${(await c.brands.search(String(sampleProduct?.brand?.name ?? 'Trendyol'))).length} matches`,
);
await check(
  'categories.list',
  'categories.list',
  async () => `${(await c.categories.list()).length} roots`,
);
await check('categories.getAttributes', `categories.getAttributes(${categoryId})`, async () => {
  const attrs = await c.categories.getAttributes(categoryId);
  attributeIdWithValues =
    (attrs as any[]).find((a) => !(a.allowCustom ?? a.raw?.allowCustom))?.id ??
    (attrs as any[])[0]?.id;
  return `${attrs.length} attributes`;
});
await check('categories.getAttributeValues', 'categories.getAttributeValues', async () => {
  assert(attributeIdWithValues, 'no attribute');
  const page = await c.categories.getAttributeValues(categoryId, attributeIdWithValues, {
    limit: 50,
  });
  return `${page.items.length} values`;
});
await check('categories.getByBarcodes', 'categories.getByBarcodes', () =>
  either(
    () => c.categories.getByBarcodes([STOCK_BARCODE]),
    (v) => JSON.stringify(v).slice(0, 100),
  ),
);
let shipmentAddressId: number | undefined;
let returningAddressId: number | undefined;
await check('suppliers.getAddresses', 'suppliers.getAddresses', async () => {
  const addrs = (await c.suppliers.getAddresses()) as any[];
  shipmentAddressId = Number(
    addrs.find((a) => /shipment/i.test(a.addressType ?? ''))?.id ?? addrs[0]?.id,
  );
  returningAddressId = Number(
    addrs.find((a) => /return/i.test(a.addressType ?? ''))?.id ?? addrs[0]?.id,
  );
  return `${addrs.length} addresses`;
});
skip('suppliers.invalidateCache', 'clears the in-memory address cache; sends nothing');
await check(
  'orders.list',
  'orders.list: last 14 days',
  async () =>
    `${(await c.orders.list({ startDate: new Date(stamp - 14 * DAY), limit: 10 })).items.length} packages`,
);
await check(
  'orders.listStream',
  'orders.listStream',
  async () =>
    `${(await c.orders.listStream({ lastModifiedStartDate: new Date(stamp - 2 * DAY), lastModifiedEndDate: new Date(stamp), limit: 10 })).items.length} packages`,
);
await check('orders.getCargoInvoiceItems', 'orders.getCargoInvoiceItems: unknown serial', () =>
  either(
    () => c.orders.getCargoInvoiceItems('DDF2026000000000', { limit: 10 }),
    (v) => `${(v as any).items.length} rows`,
  ),
);
await check('orders.getCompensationTickets', 'orders.getCompensationTickets', () =>
  either(
    () =>
      c.orders.getCompensationTickets({
        startDate: new Date(stamp - 30 * DAY),
        endDate: new Date(stamp),
      }),
    (v) => `${(v as any).items.length} tickets`,
    'stage answers 401 on this endpoint',
  ),
);
await check('claims.list', 'claims.list: last 7 days', async () => {
  const page = await c.claims.list({
    startDate: new Date(stamp - 7 * DAY),
    endDate: new Date(stamp),
    limit: 10,
  });
  return `${page.items.length} claims`;
});
await check(
  'claims.list',
  'claims.list: no window (404 from Trendyol when nothing matches)',
  async () => {
    const page = await c.claims.list({ limit: 10 });
    return `${page.items.length} claims`;
  },
);
let issueReasonId: number | undefined;
await check('claims.getIssueReasons', 'claims.getIssueReasons', async () => {
  const reasons = (await c.claims.getIssueReasons()) as any[];
  issueReasonId = Number(reasons[0]?.id);
  return `${reasons.length} reasons`;
});
let openQuestion: string | undefined;
await check('questions.list', 'questions.list', async () => {
  const page = await c.questions.list({ status: 'WAITING_FOR_ANSWER', limit: 10 });
  openQuestion = page.items[0] ? String((page.items[0] as any).id) : undefined;
  return `${page.items.length} waiting`;
});
await check('finance.getSettlements', 'finance.getSettlements', () =>
  either(
    () =>
      c.finance.getSettlements({
        transactionType: 'Sale',
        startDate: new Date(stamp - 14 * DAY),
        endDate: new Date(stamp),
      }),
    (v) => `${(v as any).items.length} rows`,
  ),
);
await check('finance.getOtherFinancials', 'finance.getOtherFinancials', () =>
  either(
    () =>
      c.finance.getOtherFinancials({
        transactionType: 'DeductionInvoices',
        startDate: new Date(stamp - 14 * DAY),
        endDate: new Date(stamp),
      }),
    (v) => `${(v as any).items.length} rows`,
  ),
);
await check(
  'locations.getCountries',
  'locations.getCountries',
  async () => `${(await c.locations.getCountries()).length}`,
);
await check(
  'locations.getTurkeyCities',
  'locations.getTurkeyCities',
  async () => `${(await c.locations.getTurkeyCities()).length}`,
);
// Trendyol's city ids are not plate codes (Adana is id 100, code 1).
let turkeyCityId = '100';
await check(
  'locations.getTurkeyDistricts',
  'locations.getTurkeyDistricts(first city)',
  async () => {
    turkeyCityId = String(((await c.locations.getTurkeyCities())[0] as any).id);
    return `${(await c.locations.getTurkeyDistricts(turkeyCityId)).length} in city ${turkeyCityId}`;
  },
);
await check('locations.getTurkeyNeighborhoods', 'locations.getTurkeyNeighborhoods', async () => {
  const district = (await c.locations.getTurkeyDistricts(turkeyCityId))[0] as any;
  return `${(await c.locations.getTurkeyNeighborhoods(turkeyCityId, district.id)).length}`;
});
await check(
  'locations.getAzerbaijanCities',
  'locations.getAzerbaijanCities',
  async () => `${(await c.locations.getAzerbaijanCities()).length}`,
);
await check('locations.getAzerbaijanDistricts', 'locations.getAzerbaijanDistricts', async () => {
  const city = (await c.locations.getAzerbaijanCities())[0] as any;
  return `${(await c.locations.getAzerbaijanDistricts(city?.id ?? 1)).length}`;
});
await check(
  'locations.getCitiesByCountry',
  'locations.getCitiesByCountry(SA)',
  async () => `${(await c.locations.getCitiesByCountry('SA')).length}`,
);
await check('locations.getDistrictsByCity', 'locations.getDistrictsByCity', async () => {
  const city = (await c.locations.getCitiesByCountry('SA'))[0] as any;
  return `${(await c.locations.getDistrictsByCity('SA', city?.id ?? 1)).length}`;
});
await check('videos.list', 'videos.list', () =>
  either(
    () => c.videos.list({ limit: 10 }),
    (v) => `${(v as unknown[]).length} videos`,
    'stage answers 401 on video endpoints',
  ),
);

// ── Price & stock ────────────────────────────────────────────────────────────
{
  const read = async () => {
    const raw = (await c.products.list({ barcode: STOCK_BARCODE })).items[0]?.raw as any;
    const v = raw?.variants?.find((x: any) => x.barcode === STOCK_BARCODE) ?? {};
    return { quantity: v.stock?.quantity, sale: v.price?.salePrice, list: v.price?.listPrice };
  };
  const before = await read();
  await check(
    ['inventory.updateAndWait', 'products.getBatchStatus'],
    'inventory.updateAndWait: stock + prices, read back',
    async () => {
      const [batch] = await c.inventory.updateAndWait(
        [{ barcode: STOCK_BARCODE, quantity: 7001, salePrice: 101.01, listPrice: 202.02 }],
        { pollIntervalMs: 3000, timeoutMs: 180_000 },
      );
      assert(
        batch?.items.every((i) => i.status === 'SUCCESS'),
        JSON.stringify(batch?.items),
      );
      let now = await read();
      for (let i = 0; i < 6 && now.quantity !== 7001; i++) {
        await sleep(5000);
        now = await read();
      }
      assert(now.quantity === 7001 && now.sale === 101.01, `read back ${JSON.stringify(now)}`);
      return `batch ${batch!.status}, read back ${JSON.stringify(now)}`;
    },
  );
  await check('inventory.update', 'inventory.update: restore', async () => {
    const { batchRequestId } = await c.inventory.update([
      {
        barcode: STOCK_BARCODE,
        quantity: before.quantity,
        salePrice: before.sale,
        listPrice: before.list,
      },
    ]);
    return `batch ${batchRequestId}, restoring ${JSON.stringify(before)}`;
  });
}

// ── Products ────────────────────────────────────────────────────────────────
const newBarcode = `LONCAE2E${stamp}`;
let createdOk = false;
let createdAttributes: Record<string, unknown>[] = [];
await check(
  ['products.create', 'products.getBatchStatus'],
  `products.create: ${newBarcode}`,
  async () => {
    assert(sampleProduct, 'no sample product');
    const attributes: Record<string, unknown>[] = (sampleProduct.attributes as any[]).map((a) =>
      a.attributeValueId
        ? { attributeId: a.attributeId, attributeValueIds: [a.attributeValueId] }
        : { attributeId: a.attributeId, attributeValue: String(a.attributeValue) },
    );
    // The sample may lack attributes the category requires today (e.g. "Desen").
    const present = new Set(attributes.map((a) => String(a.attributeId)));
    for (const attr of await c.categories.getAttributes(sampleProduct.category.id)) {
      if (!attr.required || present.has(attr.id)) continue;
      const value = (
        await c.categories.getAttributeValues(sampleProduct.category.id, attr.id, { limit: 1 })
      ).items[0];
      attributes.push(
        value
          ? { attributeId: Number(attr.id), attributeValueIds: [Number(value.id)] }
          : { attributeId: Number(attr.id), attributeValue: 'Lonca' },
      );
    }
    createdAttributes = attributes;
    const { batchRequestId } = await c.products.create([
      {
        barcode: newBarcode,
        title: 'Lonca SDK Uçtan Uca Test Ürünü',
        productMainId: `LONCA-E2E-${stamp}`,
        brandId: Number(sampleProduct.brand.id),
        categoryId: Number(sampleProduct.category.id),
        quantity: 1,
        stockCode: `LONCA-E2E-${stamp}`,
        dimensionalWeight: 1,
        description: '<p>Lonca SDK test ürünü.</p>',
        listPrice: 999,
        salePrice: 999,
        vatRate: 20,
        images: [{ url: String(sampleProduct.images?.[0]?.url) }],
        attributes,
        ...(shipmentAddressId ? { shipmentAddressId } : {}),
        ...(returningAddressId ? { returningAddressId } : {}),
      } as any,
    ]);
    let result = await c.products.getBatchStatus(batchRequestId);
    for (let i = 0; i < 24 && !isBatchSettled(result); i++) {
      await sleep(5000);
      result = await c.products.getBatchStatus(batchRequestId);
    }
    const item = result.items[0];
    createdOk = item?.status === 'SUCCESS';
    return {
      outcome: createdOk ? 'ok' : 'refused',
      note: `batch ${batchRequestId} ${result.status}, item ${item?.status} ${(item?.failureReasons ?? []).join('; ').slice(0, 200)}${item ? '' : ` raw ${JSON.stringify(result.raw).slice(0, 300)}`}`,
    };
  },
);
if (createdOk) {
  await check('products.updateUnapproved', 'products.updateUnapproved: full payload', async () => {
    try {
      const { batchRequestId } = await c.products.updateUnapproved([
        {
          barcode: newBarcode,
          title: 'Lonca SDK Uçtan Uca Test Ürünü 2',
          productMainId: `LONCA-E2E-${stamp}`,
          brandId: Number(sampleProduct!.brand.id),
          categoryId: Number(sampleProduct!.category.id),
          stockCode: `LONCA-E2E-${stamp}`,
          dimensionalWeight: 1,
          description: '<p>Lonca SDK test ürünü.</p>',
          vatRate: 20,
          images: [{ url: String(sampleProduct!.images?.[0]?.url) }],
          attributes: createdAttributes,
        } as any,
      ]);
      return `batch ${batchRequestId}`;
    } catch (error) {
      if (error instanceof ValidationError || error instanceof NotFoundError) {
        return { outcome: 'refused', note: describeError(error) };
      }
      // The product is already approved after create on stage; the unapproved
      // update then fails inside Trendyol ("TrendyolSystemException", 2026-10-14).
      if (error instanceof LoncaError && error.status === 500) {
        return {
          outcome: 'refused',
          note: `stage 500 for an approved product (${describeError(error)})`,
        };
      }
      throw error;
    }
  });
  await check('products.updateVariants', 'products.updateVariants: stock code', () =>
    either(
      async () =>
        c.products.updateVariants([
          { barcode: newBarcode, stockCode: `LONCA-E2E-${stamp}-B` } as any,
        ]),
      (v) => `batch ${(v as any).batchRequestId}`,
    ),
  );
  await check('products.updateDeliveryInfo', 'products.updateDeliveryInfo', () =>
    either(
      async () =>
        c.products.updateDeliveryInfo([
          { barcode: newBarcode, deliveryOptions: { deliveryDuration: 2 } } as any,
        ]),
      (v) => `batch ${(v as any).batchRequestId}`,
    ),
  );
  await check('products.archive', 'products.archive', () =>
    either(
      () => c.products.archive([newBarcode]),
      (v) => `batch ${(v as any).batchRequestId}`,
    ),
  );
  await check('products.unarchive', 'products.unarchive', () =>
    either(
      () => c.products.unarchive([newBarcode]),
      (v) => `batch ${(v as any).batchRequestId}`,
    ),
  );
  await check('products.unlock', 'products.unlock', () =>
    either(
      () => c.products.unlock([newBarcode]),
      (v) => `batch ${(v as any).batchRequestId}`,
    ),
  );
  await check('products.delete', 'products.delete', () =>
    either(
      () => c.products.delete([newBarcode]),
      (v) => `batch ${(v as any).batchRequestId}`,
    ),
  );
} else {
  for (const m of [
    'products.updateUnapproved',
    'products.updateVariants',
    'products.updateDeliveryInfo',
    'products.archive',
    'products.unarchive',
    'products.unlock',
    'products.delete',
  ]) {
    skip(m, 'the create did not succeed on stage');
  }
}
await check('products.updateContent', 'products.updateContent: stage product, same content', () =>
  either(
    () =>
      c.products.updateContent([
        {
          contentId: Number(sampleProduct?.contentId),
          title: String(sampleProduct?.title),
          description: String(sampleProduct?.description ?? ''),
        } as any,
      ]),
    (v) => `batch ${(v as any).batchRequestId}`,
  ),
);

// ── Orders ──────────────────────────────────────────────────────────────────
const addr = {
  addressText: 'Lonca SDK test adresi',
  city: 'İzmir',
  company: '',
  district: 'Bornova',
  neighborhood: '',
  phone: '5555555555',
  postalCode: '',
  email: 'test@zanaat.dev',
};
async function testOrder(lines: { barcode: string; quantity: number }[]) {
  const { orderNumber } = await c.testOrders.create({
    customer: { customerFirstName: 'Lonca', customerLastName: 'Test' },
    invoiceAddress: {
      ...addr,
      invoiceFirstName: 'Lonca',
      invoiceLastName: 'Test',
      invoiceTaxNumber: '',
      invoiceTaxOffice: '',
    },
    shippingAddress: { ...addr, shippingFirstName: 'Lonca', shippingLastName: 'Test' },
    seller: { sellerId },
    lines: lines.map((l) => ({ ...l, discountPercentage: 0 })),
    commercial: false,
  } as any);
  assert(orderNumber, 'no order number');
  for (let i = 0; i < 12; i++) {
    await sleep(5000);
    const items = (await c.orders.list({ orderNumber } as any)).items as any[];
    // A fresh test order is listed with shipmentPackageId / lineId 0 until Trendyol packages it.
    const pkg = items[0];
    if (pkg && Number(pkg.id) > 0 && (pkg.lines as any[]).every((l) => Number(l.id) > 0))
      return { orderNumber: orderNumber!, pkg };
  }
  throw new CheckFailed(`order ${orderNumber} not listed`);
}
const packagesOf = async (orderNumber: string) =>
  (await c.orders.list({ orderNumber } as any)).items as any[];
// A second barcode for two-line orders.
let secondBarcode: string | undefined;
{
  const page = await c.products.list({ onSale: true, limit: 50 } as any);
  secondBarcode = (page.items as any[])
    .flatMap((p) => (p.raw?.variants ?? []) as any[])
    .find((v) => v.barcode !== STOCK_BARCODE && v.onSale && v.stock?.quantity > 5)?.barcode;
}

let mainOrder: { orderNumber: string; pkg: any } | undefined;
await check('testOrders.create', 'testOrders.create: 2 units', async () => {
  mainOrder = await testOrder([{ barcode: STOCK_BARCODE, quantity: 2 }]);
  return `order ${mainOrder.orderNumber}, package ${mainOrder.pkg.id}`;
});
if (mainOrder) {
  const pkgId = mainOrder.pkg.id;
  const line = mainOrder.pkg.lines[0];
  const lines = [{ lineId: line.id, quantity: line.quantity }];
  await check('orders.updatePackageStatus', 'orders.updatePackageStatus: Picking', async () => {
    await c.orders.updatePackageStatus(pkgId, { status: 'Picking', lines });
    await sleep(4000);
    const [p] = await packagesOf(mainOrder!.orderNumber);
    assert(p.status === 'Picking', `status ${p.status}`);
    return 'read back Picking';
  });
  await check('orders.updateBoxInfo', 'orders.updateBoxInfo', () =>
    either(
      () => c.orders.updateBoxInfo(pkgId, { boxQuantity: 1, deci: 2 }),
      () => 'accepted',
    ),
  );
  await check('orders.updateLaborCosts', 'orders.updateLaborCosts', () =>
    either(
      () =>
        c.orders.updateLaborCosts(pkgId, [{ orderLineId: Number(line.id), laborCostPerItem: 10 }]),
      () => 'accepted',
    ),
  );
  await check('orders.updateWarehouse', 'orders.updateWarehouse', () =>
    either(
      () => c.orders.updateWarehouse(pkgId, shipmentAddressId ?? 0),
      () => 'accepted',
    ),
  );
  await check('orders.extendDeliveryDate', 'orders.extendDeliveryDate', () =>
    either(
      () => c.orders.extendDeliveryDate(pkgId, 1),
      () => 'accepted',
      'stage answers 401 on this endpoint only',
    ),
  );
  await check('orders.updatePackageStatus', 'orders.updatePackageStatus: Invoiced', async () => {
    await c.orders.updatePackageStatus(pkgId, {
      status: 'Invoiced',
      lines,
      params: { invoiceNumber: `LON${new Date().getFullYear()}${String(stamp).slice(-9)}` },
    } as any);
    return 'accepted';
  });
  const invoiceNumber = `LON${new Date().getFullYear()}${String(stamp + 1).slice(-9)}`;
  await check('invoices.sendLink', 'invoices.sendLink', async () => {
    await c.invoices.sendLink({
      shipmentPackageId: Number(pkgId),
      invoiceLink: 'https://example.com/lonca-e2e-invoice.pdf',
      invoiceNumber,
      invoiceDateTime: Date.now(),
    });
    return `invoice ${invoiceNumber}`;
  });
  await check('invoices.deleteLink', 'invoices.deleteLink', () =>
    either(
      () =>
        c.invoices.deleteLink({
          serviceSourceId: Number(pkgId),
          channelId: 1,
          customerId: Number(mainOrder!.pkg.customerId ?? mainOrder!.pkg.raw?.customerId),
        }),
      () => 'deleted',
    ),
  );
  await check('invoices.uploadFile', 'invoices.uploadFile: PDF', () =>
    either(
      () =>
        c.invoices.uploadFile({
          shipmentPackageId: Number(pkgId),
          file: new File([tinyPdf()], 'fatura.pdf', { type: 'application/pdf' }),
          invoiceNumber: `LON${new Date().getFullYear()}${String(stamp + 2).slice(-9)}`,
          invoiceDateTime: Date.now(),
        }),
      () => 'uploaded',
    ),
  );
  const tracking = String(
    mainOrder.pkg.cargoTrackingNumber ?? mainOrder.pkg.raw?.cargoTrackingNumber ?? '',
  );
  await check('labels.createCommon', 'labels.createCommon: ZPL', () =>
    either(
      () => c.labels.createCommon(tracking, { format: 'ZPL', boxQuantity: 1 }),
      () => `tracking ${tracking}`,
    ),
  );
  await check('labels.getCommon', 'labels.getCommon', async () => {
    await sleep(5000);
    return either(
      () => c.labels.getCommon(tracking),
      (v) => `${(v as any).labels?.length ?? 0} label(s)`,
    );
  });
  await check('orders.processAlternativeDelivery', 'orders.processAlternativeDelivery', () =>
    either(
      () =>
        c.orders.processAlternativeDelivery(pkgId, {
          isPhoneNumber: false,
          trackingInfo: 'https://example.com/takip/1',
          params: {},
        }),
      () => 'accepted',
    ),
  );
  await check('testOrders.updateStatus', 'testOrders.updateStatus: Shipped', async () => {
    await c.testOrders.updateStatus(pkgId, 'Shipped', {
      lines: [{ lineId: Number(line.id), quantity: line.quantity }],
    } as any);
    await sleep(4000);
    return `now ${(await packagesOf(mainOrder!.orderNumber))[0]?.status}`;
  });
  await check('orders.manualDeliverByPackageId', 'orders.manualDeliverByPackageId', () =>
    either(
      () => c.orders.manualDeliverByPackageId(pkgId),
      () => 'accepted',
      'stage answers 401 on the manual delivery endpoints',
    ),
  );
  await check('orders.markDeliveredByService', 'orders.markDeliveredByService', () =>
    either(
      () => c.orders.markDeliveredByService(pkgId),
      () => 'accepted',
    ),
  );
  await check('testOrders.updateStatus', 'testOrders.updateStatus: Delivered', async () => {
    await c.testOrders.updateStatus(pkgId, 'Delivered', {
      lines: [{ lineId: Number(line.id), quantity: line.quantity }],
    } as any);
    await sleep(4000);
    return `now ${(await packagesOf(mainOrder!.orderNumber))[0]?.status}`;
  });

  // Return claim on the delivered package: create → waiting in action →
  // approve one unit, open an issue (with evidence) on the other.
  let claim: { claimId?: string; claimItemIds: string[] } | undefined;
  await check('claims.create', 'claims.create: 2 units of the delivered order', async () => {
    claim = await c.claims.create({
      orderNumber: mainOrder!.orderNumber,
      customerId: Number(mainOrder!.pkg.customerId ?? mainOrder!.pkg.raw?.customerId),
      shipmentCompanyId: 17, // Trendyol Express; required in practice
      claimItems: [
        { barcode: STOCK_BARCODE, quantity: 2, reasonId: 401, customerNote: 'Lonca e2e' },
      ],
      forcePackageCreation: true,
    });
    assert(claim.claimId && claim.claimItemIds.length === 2, JSON.stringify(claim));
    return `claim ${claim.claimId}, ${claim.claimItemIds.length} items`;
  });
  const claimStatuses = async () => {
    const listed = (await c.claims.list({ orderNumber: mainOrder!.orderNumber })).items[0];
    return {
      packageId: Number((listed?.raw as any)?.orderShipmentPackageId),
      statuses: (((listed?.raw as any)?.items ?? []) as any[]).flatMap((i) =>
        (i.claimItems ?? []).map((ci: any) => ci.claimItemStatus?.name),
      ),
    };
  };
  await check(
    ['claims.list', 'testOrders.setClaimsWaitingInAction'],
    'testOrders.setClaimsWaitingInAction',
    async () => {
      assert(claim?.claimId, 'no claim');
      await sleep(5000);
      const { packageId } = await claimStatuses();
      assert(packageId > 0, 'claim package not listed');
      await c.testOrders.setClaimsWaitingInAction({ shipmentPackageId: packageId });
      await sleep(8000);
      const { statuses } = await claimStatuses();
      assert(
        statuses.every((st) => st === 'WaitingInAction'),
        `statuses ${statuses}`,
      );
      return `claim package ${packageId}: ${statuses.join(', ')}`;
    },
  );
  await check('claims.approveLineItems', 'claims.approveLineItems: first item', async () => {
    assert(claim?.claimId, 'no claim');
    await c.claims.approveLineItems(claim.claimId, {
      claimLineItemIdList: [claim.claimItemIds[0]!],
      params: {},
    });
    await sleep(6000);
    return `statuses now ${(await claimStatuses()).statuses.join(', ')}`;
  });
  await check('claims.createIssue', 'claims.createIssue: second item, with a PDF', async () => {
    assert(claim?.claimId && issueReasonId, 'no claim or reason');
    await c.claims.createIssue(claim.claimId, {
      claimIssueReasonId: 51,
      claimItemIdList: [claim.claimItemIds[1]!],
      description: 'Lonca e2e: urun kullanilmis olarak geri geldi.',
      files: [new File([tinyPdf()], 'kanit.pdf', { type: 'application/pdf' })],
    });
    return 'issue opened';
  });
  await check('claims.getItemAudits', 'claims.getItemAudits: approved item', async () => {
    assert(claim?.claimItemIds[0], 'no claim item');
    const audits = await c.claims.getItemAudits(claim.claimItemIds[0]);
    assert(audits.length > 0, 'no audits');
    return `${audits.length} audits (${audits.map((a) => (a.raw as any).newStatus).join(' → ')})`;
  });
  await check('orders.manualReturnByPackageId', 'orders.manualReturnByPackageId', () =>
    either(
      () => c.orders.manualReturnByPackageId(pkgId),
      () => 'accepted',
    ),
  );
  await check('orders.manualDeliverByTrackingNumber', 'orders.manualDeliverByTrackingNumber', () =>
    either(
      () => c.orders.manualDeliverByTrackingNumber(tracking),
      () => 'accepted',
      'stage answers 401 on the manual delivery endpoints',
    ),
  );
  await check('orders.manualReturnByTrackingNumber', 'orders.manualReturnByTrackingNumber', () =>
    either(
      () => c.orders.manualReturnByTrackingNumber(tracking),
      () => 'accepted',
      'stage answers 401 on the manual delivery endpoints',
    ),
  );
}

// Carrier change and quantity splits on a 3-unit order.
await check(
  ['testOrders.create', 'orders.changeCargoProvider', 'orders.splitPackageByQuantity'],
  'changeCargoProvider + splitPackageByQuantity [1,2]',
  async () => {
    const { orderNumber, pkg } = await testOrder([{ barcode: STOCK_BARCODE, quantity: 3 }]);
    await c.orders.changeCargoProvider(pkg.id, 'ARASMP');
    await sleep(3000);
    await c.orders.splitPackageByQuantity(pkg.id, [
      { orderLineId: Number(pkg.lines[0].id), quantities: [1, 2] },
    ]);
    await sleep(8000);
    const after = await packagesOf(orderNumber);
    assert(after.length >= 3, `packages ${JSON.stringify(after.map((p) => [p.id, p.status]))}`);
    return `order ${orderNumber}: ${after.map((p) => `${p.status}×${p.lines?.[0]?.quantity}`).join(', ')}`;
  },
);
await check(
  ['testOrders.create', 'orders.splitMultiPackagesByQuantity'],
  'splitMultiPackagesByQuantity on a 3-unit order',
  async () => {
    const { orderNumber, pkg } = await testOrder([{ barcode: STOCK_BARCODE, quantity: 3 }]);
    const lineId = Number(pkg.lines[0].id);
    await c.orders.splitMultiPackagesByQuantity(pkg.id, [
      { packageDetails: [{ orderLineId: lineId, quantities: 1 }] },
      { packageDetails: [{ orderLineId: lineId, quantities: 2 }] },
    ]);
    await sleep(8000);
    const after = await packagesOf(orderNumber);
    return `order ${orderNumber}: ${after.map((p) => `${p.status}×${p.lines?.[0]?.quantity}`).join(', ')}`;
  },
);
if (secondBarcode) {
  await check(
    ['testOrders.create', 'orders.splitPackage'],
    'splitPackage on a two-line order',
    async () => {
      const { orderNumber, pkg } = await testOrder([
        { barcode: STOCK_BARCODE, quantity: 1 },
        { barcode: secondBarcode!, quantity: 1 },
      ]);
      assert(pkg.lines.length === 2, `lines ${pkg.lines.length}`);
      await c.orders.splitPackage(pkg.id, [Number(pkg.lines[0].id)]);
      await sleep(8000);
      return `order ${orderNumber}: ${(await packagesOf(orderNumber)).map((p) => `${p.status}/${p.lines?.length}`).join(', ')}`;
    },
  );
  await check(
    ['testOrders.create', 'orders.multiSplitPackage'],
    'multiSplitPackage on a two-line order',
    async () => {
      const { orderNumber, pkg } = await testOrder([
        { barcode: STOCK_BARCODE, quantity: 1 },
        { barcode: secondBarcode!, quantity: 1 },
      ]);
      await c.orders.multiSplitPackage(pkg.id, [
        { orderLineIds: [Number(pkg.lines[0].id)] },
        { orderLineIds: [Number(pkg.lines[1].id)] },
      ]);
      await sleep(8000);
      return `order ${orderNumber}: ${(await packagesOf(orderNumber)).map((p) => `${p.status}/${p.lines?.length}`).join(', ')}`;
    },
  );
} else {
  skip('orders.splitPackage', 'no second on-sale stage barcode found');
  skip('orders.multiSplitPackage', 'no second on-sale stage barcode found');
}
await check(
  ['testOrders.create', 'orders.cancelPackageItem'],
  'cancelPackageItem 1 of 2',
  async () => {
    const { orderNumber, pkg } = await testOrder([{ barcode: STOCK_BARCODE, quantity: 2 }]);
    await c.orders.cancelPackageItem(pkg.id, {
      lines: [{ lineId: Number(pkg.lines[0].id), quantity: 1 }],
      reasonId: 500,
    });
    await sleep(6000);
    return `order ${orderNumber}: ${(await packagesOf(orderNumber)).map((p) => `${p.status}×${p.lines?.[0]?.quantity}`).join(', ')}`;
  },
);

// ── Questions ───────────────────────────────────────────────────────────────
if (openQuestion) {
  await check(
    'questions.get',
    `questions.get ${openQuestion}`,
    async () => `status ${(await c.questions.get(openQuestion!)).status}`,
  );
  await check('questions.answer', `questions.answer ${openQuestion}`, async () => {
    try {
      await c.questions.answer(
        openQuestion!,
        'Merhaba, Lonca SDK test cevabıdır. İyi alışverişler dileriz.',
      );
      return 'answered';
    } catch (error) {
      if (error instanceof ValidationError)
        return { outcome: 'refused', note: describeError(error) };
      // Stage's answer backend cannot resolve its own service host
      // ("social-ugc-questionanswer-service ... no such host", 2026-10-14).
      const raw = JSON.stringify((error as LoncaError).data ?? {});
      if (error instanceof LoncaError && error.status === 500 && raw.includes('no such host')) {
        return {
          outcome: 'refused',
          note: 'stage infrastructure: answer service host not found (500)',
        };
      }
      throw error;
    }
  });
} else {
  await check('questions.get', 'questions.get: unknown id', () =>
    refused(() => c.questions.get(1)),
  );
  skip('questions.answer', 'no question waiting for an answer on stage');
}

// ── Webhooks ────────────────────────────────────────────────────────────────
await check(
  ['webhooks.list'],
  'webhooks.list',
  async () => `${(await c.webhooks.list()).length} webhooks`,
);
let webhookId: string | undefined;
await check('webhooks.create', 'webhooks.create', () =>
  either(
    async () => {
      const r = await c.webhooks.create({
        url: `https://example.com/lonca-e2e-${stamp}`,
        authenticationType: 'API_KEY',
        apiKey: `lonca-e2e-${stamp}`,
        subscribedStatuses: ['CREATED', 'SHIPPED'],
      } as any);
      webhookId = String((r as any).id ?? (r as any).raw?.id ?? '');
      return r;
    },
    () => `webhook ${webhookId}`,
  ),
);
if (webhookId) {
  const id = webhookId;
  await check('webhooks.update', 'webhooks.update', () =>
    either(
      () =>
        c.webhooks.update(id, {
          url: `https://example.com/lonca-e2e-${stamp}-b`,
          authenticationType: 'API_KEY',
          apiKey: `lonca-e2e-${stamp}`,
          subscribedStatuses: ['CREATED'],
        } as any),
      () => 'updated',
    ),
  );
  await check('webhooks.deactivate', 'webhooks.deactivate', () =>
    either(
      () => c.webhooks.deactivate(id),
      () => 'deactivated',
    ),
  );
  await check('webhooks.activate', 'webhooks.activate', () =>
    either(
      () => c.webhooks.activate(id),
      () => 'activated',
    ),
  );
  await check('webhooks.delete', 'webhooks.delete', async () => {
    await c.webhooks.delete(id);
    const still = (await c.webhooks.list()).some((w: any) => String(w.id) === id);
    assert(!still, 'still listed');
    return 'deleted, gone from the list';
  });
} else {
  for (const m of [
    'webhooks.update',
    'webhooks.deactivate',
    'webhooks.activate',
    'webhooks.delete',
  ])
    skip(m, 'webhook was not created');
}

// ── Videos ──────────────────────────────────────────────────────────────────
await check('videos.create', 'videos.create', () =>
  either(
    () =>
      c.videos.create({
        title: 'Lonca e2e',
        videoUrl: 'https://example.com/lonca-e2e.mp4',
        productContentIds: [String(sampleProduct?.contentId)],
        videoContentType: 'PRODUCT_PROMOTION',
      } as any),
    (v) => `video ${(v as any).videoId}`,
    'stage answers 401 on video endpoints',
  ),
);

// ── Export Center (needs program enrolment) ─────────────────────────────────
const exportCalls: [string, () => Promise<unknown>][] = [
  ['exportCenter.listProducts', () => c.exportCenter.listProducts({ size: 5 } as any)],
  ['exportCenter.getCategoryAttributes', () => c.exportCenter.getCategoryAttributes(categoryId)],
  ['exportCenter.getCareInstructions', () => c.exportCenter.getCareInstructions()],
  ['exportCenter.getCompositions', () => c.exportCenter.getCompositions()],
  ['exportCenter.getOrigins', () => c.exportCenter.getOrigins()],
  ['exportCenter.listPackagesV2', () => c.exportCenter.listPackagesV2({} as any)],
  ['exportCenter.listPackagesV3', () => c.exportCenter.listPackagesV3({} as any)],
  ['exportCenter.getPackageItems', () => c.exportCenter.getPackageItems({ packageId: 1 } as any)],
  [
    'exportCenter.getBatchStatus',
    () => c.exportCenter.getBatchStatus('00000000-0000-0000-0000-000000000000'),
  ],
  [
    'exportCenter.updateStocks',
    () => c.exportCenter.updateStocks([{ barcode: STOCK_BARCODE, stock: 1 }]),
  ],
  [
    'exportCenter.updatePrices',
    () => c.exportCenter.updatePrices([{ barcode: STOCK_BARCODE, buyingPrice: 1 }]),
  ],
  [
    'exportCenter.createProducts',
    () => c.exportCenter.createProducts([{ barcode: `${newBarcode}X` }]),
  ],
];
for (const [method, call] of exportCalls) {
  await check(method, method, () =>
    either(call, (v) => JSON.stringify(v).slice(0, 80), 'Export Center needs enrolment'),
  );
}

// ── Report ──────────────────────────────────────────────────────────────────
const all = publicMethods('etc/trendyol-client.d.ts.snapshot', 'TrendyolClient');
const reached = new Set(checks.filter((c) => c.outcome !== 'skip').flatMap((c) => c.methods));
const by = (o: Outcome) => new Set(checks.filter((c) => c.outcome === o).flatMap((c) => c.methods));
const ok = [...by('ok')].sort();
const refusalOnly = [...by('refused')].filter((m) => !ok.includes(m)).sort();
const failed = checks.filter((c) => c.outcome === 'FAIL');
console.log(`
${checks.length} checks, ${failed.length} failed
methods reached: ${all.filter((m) => reached.has(m)).length}/${all.length}
success path verified: ${ok.length} (${ok.join(', ')})
refusal only: ${refusalOnly.length} (${refusalOnly.join(', ')})
not reached: ${all.filter((m) => !reached.has(m)).join(', ') || '-'}`);
process.exit(failed.length > 0 ? 1 : 0);
