#!/usr/bin/env -S pnpm exec tsx
/**
 * End-to-end run of every `@lonca/n11` method against n11's test store.
 *
 *   pnpm build --filter @lonca/n11...
 *   pnpm e2e:n11                       # reads .env.n11-test
 *
 * n11 has no sandbox. The test store it gives integrators lives on prod, so
 * this script writes for real. Before the first write it checks that the key
 * belongs to the test store (`N11_E2E_SELLER`, default `testtmagazaa`) and
 * stops otherwise; never point it at a real seller account.
 *
 * What it does:
 * - Reads: every read method, including pagination and status mapping.
 * - Products: creates one `LONCA-E2E-<time>` SKU, suspends it at once, changes
 *   price, stock and limits, reads every change back, then deletes it.
 * - Orders, returns, questions: the store has no paid orders (we do not place
 *   any), so each write is sent for a package, claim or question in a state
 *   that does not allow it, and n11 must refuse it with a failure the SDK maps
 *   to `ValidationError` / `NotFoundError` or a `FAIL` line. That checks the
 *   request shape and error mapping, not the success path. With
 *   `N11_E2E_ORDER_WRITES=1` and a `Created` package on the store, `approve`
 *   runs for real on it.
 *
 * Exit codes: 0 every check passed, 1 a check failed, 2 setup error.
 */
import { LoncaError, NotFoundError, paginate, ValidationError } from '@lonca/core';
import {
  createN11Client,
  n11Capabilities,
  normalizeStatus,
  type N11Client,
  type N11Environment,
  type N11ShipmentPackage,
} from '@lonca/n11';

const DAY_MS = 24 * 60 * 60 * 1000;
/** n11 suspends IPs that send requests milliseconds apart; keep every call spaced. */
const SPACING_MS = 1500;

/** Every public method, so the report can show which ones the run reached. */
const METHODS = [
  'products.list',
  'products.create',
  'products.update',
  'products.delete',
  'products.getTask',
  'products.waitForTask',
  'inventory.update',
  'inventory.updateAndWait',
  'orders.list',
  'orders.approve',
  'orders.splitPackage',
  'orders.splitPackageByQuantity',
  'orders.createCollectionRequest',
  'orders.updateLaborCosts',
  'orders.cancelItem',
  'orders.sendInvoiceLink',
  'categories.list',
  'categories.getAttributes',
  'catalog.search',
  'questions.list',
  'questions.get',
  'questions.answer',
  'claims.listReturns',
  'claims.listCancels',
  'claims.getReturnDenyReasons',
  'claims.getReturnPendingReasons',
  'claims.getCancelDenyReasons',
  'claims.approveReturn',
  'claims.denyReturn',
  'claims.postponeReturn',
  'shipping.getShipmentCompanies',
  'finance.listSettlements',
  'finance.getSettlementDetail',
  'locations.getCities',
  'locations.getCity',
  'locations.getDistricts',
  'locations.getNeighborhoods',
] as const;
type Method = (typeof METHODS)[number];

/** `ok`: success path verified. `refused`: n11 refused as expected. */
type Outcome = 'ok' | 'refused' | 'skip' | 'FAIL';
interface Check {
  /** The methods the check exercises; the first is the one under test. */
  methods: Method[];
  name: string;
  outcome: Outcome;
  note: string;
}

const checks: Check[] = [];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class CheckFailed extends Error {}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new CheckFailed(message);
}

function describeError(error: unknown): string {
  if (error instanceof LoncaError) {
    const issue = error.issues[0]?.message;
    return `${error.constructor.name}${error.status ? ` ${error.status}` : ''}: ${issue ?? error.message}`;
  }
  return error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error);
}

async function check(
  method: Method | Method[],
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

/** The call must be refused: a `ValidationError` / `NotFoundError`, never anything else. */
async function refused(call: () => Promise<unknown>): Promise<{ outcome: Outcome; note: string }> {
  try {
    const value = await call();
    throw new CheckFailed(`expected a refusal, got ${JSON.stringify(value).slice(0, 200)}`);
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      return { outcome: 'refused', note: describeError(error) };
    }
    throw error;
  }
}

/** Per-line answers (`approve`, `updateLaborCosts`): every line must be `FAIL`, or the call refused. */
async function linesRefused(
  call: () => Promise<{ status: string; reason?: string }[]>,
): Promise<{ outcome: Outcome; note: string }> {
  try {
    const lines = await call();
    assert(lines.length > 0, 'no line results');
    assert(
      lines.every((line) => line.status === 'FAIL'),
      `a line succeeded: ${JSON.stringify(lines)}`,
    );
    return { outcome: 'refused', note: `FAIL line: ${lines[0]!.reason ?? '(no reason)'}` };
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      return { outcome: 'refused', note: describeError(error) };
    }
    throw error;
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`missing ${name}; run with --env-file=.env.n11-test`);
    process.exit(2);
  }
  return value;
}

const client: N11Client = createN11Client({
  appKey: required('N11_APP_KEY'),
  appSecret: required('N11_APP_SECRET'),
  env: (process.env.N11_ENV ?? 'prod') as N11Environment,
  integratorName: process.env.N11_INTEGRATOR_NAME ?? 'LoncaDev',
});
const expectedSeller = process.env.N11_E2E_SELLER ?? 'testtmagazaa';
const orderWrites = process.env.N11_E2E_ORDER_WRITES === '1';

// ── Guard: the key must belong to the test store ────────────────────────────
{
  const first = (await client.products.list({ limit: 1, sender: 'ALL' })).items[0];
  const seller = first?.raw.sellerNickname;
  if (seller !== expectedSeller) {
    console.error(
      `refusing to run: the key belongs to seller ${JSON.stringify(seller)}, not ${JSON.stringify(expectedSeller)}`,
    );
    process.exit(2);
  }
  console.log(`seller ${seller}; capabilities ${JSON.stringify(n11Capabilities)}\n`);
}

// ── Reference data ──────────────────────────────────────────────────────────
const CATEGORY_ID = '1001012'; // Güzel Yazı Defteri: a leaf with an optional brand list.

await check('categories.list', 'categories.list: tree with leaves', async () => {
  const tree = await client.categories.list();
  let leaves = 0;
  const walk = (nodes: typeof tree): void => {
    for (const node of nodes) {
      if (node.leaf) leaves++;
      walk(node.subCategories);
    }
  };
  walk(tree);
  assert(tree.length > 0 && leaves > 0, 'empty tree');
  return `${tree.length} roots, ${leaves} leaves`;
});

let brandValueId: string | undefined;
await check('categories.getAttributes', 'categories.getAttributes: leaf', async () => {
  const attrs = await client.categories.getAttributes(CATEGORY_ID);
  assert(attrs.categoryId === CATEGORY_ID && attrs.attributes.length > 0, 'no attributes');
  brandValueId = attrs.attributes.find((a) => a.id === '1')?.values[0]?.id;
  return `${attrs.name}: ${attrs.attributes.length} attributes, brand value ${brandValueId ?? 'none'}`;
});
await check('categories.getAttributes', 'categories.getAttributes: unknown id', () =>
  refused(() => client.categories.getAttributes('1')),
);

await check('shipping.getShipmentCompanies', 'shipping.getShipmentCompanies', async () => {
  const companies = await client.shipping.getShipmentCompanies();
  assert(companies.length > 0 && companies.every((c) => c.id && c.name), 'bad list');
  return `${companies.length} companies (${companies[0]!.name})`;
});

await check(
  [
    'locations.getCities',
    'locations.getCity',
    'locations.getDistricts',
    'locations.getNeighborhoods',
  ],
  'locations: cities → İstanbul → districts → neighborhoods',
  async () => {
    const cities = await client.locations.getCities();
    assert(cities.length === 81 && cities.every((c) => c.code && c.id && c.name), 'bad city list');
    await sleep(SPACING_MS);
    const istanbul = await client.locations.getCity(34);
    assert(istanbul.name === 'İstanbul', `city 34 is ${istanbul.name}`);
    await sleep(SPACING_MS);
    const districts = await client.locations.getDistricts(istanbul.code);
    assert(districts.length > 0 && districts.every((d) => d.id && d.name), 'bad districts');
    await sleep(SPACING_MS);
    const neighborhoods = await client.locations.getNeighborhoods(districts[0]!.id);
    assert(neighborhoods.length > 0, 'no neighborhoods');
    return `${cities.length} cities, ${districts.length} districts in İstanbul, ${neighborhoods.length} neighborhoods in ${districts[0]!.name}`;
  },
);
await check('locations.getCity', 'locations.getCity: unknown code', () =>
  refused(() => client.locations.getCity(500)),
);

let settlementDay: string | undefined;
await check(
  'finance.listSettlements',
  'finance.listSettlements: since 2020, 2 per page',
  async () => {
    const days = [];
    for await (const s of paginate(
      (p) => client.finance.listSettlements({ startDate: '2020-01-01', endDate: new Date(), ...p }),
      { limit: 2 },
    )) {
      days.push(s);
    }
    assert(
      days.every((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.settlementDate) && s.status),
      'bad row',
    );
    settlementDay = days.find((s) => s.paymentAmount && s.paymentAmount.amount > 0)?.settlementDate;
    return `${days.length} days (${[...new Set(days.map((s) => s.status))].join(', ') || '-'})`;
  },
);
await check('finance.listSettlements', 'finance.listSettlements: DD/MM/YYYY string', () =>
  refused(() => client.finance.listSettlements({ startDate: '01/01/2026', endDate: '31/01/2026' })),
);
if (settlementDay) {
  const day = settlementDay;
  await check(
    'finance.getSettlementDetail',
    `finance.getSettlementDetail: ${day}, 1 per page`,
    async () => {
      const lines = [];
      for await (const line of paginate((p) => client.finance.getSettlementDetail(day, p), {
        limit: 1,
      })) {
        lines.push(line);
      }
      assert(lines.length > 0 && lines.every((l) => l.lineId && l.paymentAmount), 'bad lines');
      const detail = await client.finance.getSettlementDetail(day);
      assert(detail.summary.salesAmount, 'no summary');
      return `${lines.length} lines, ${detail.deferments.length} deferments`;
    },
  );
}

let catalogHit: { catalogId: string; barcode?: string } | undefined;
await check('catalog.search', 'catalog.search: title + category', async () => {
  const result = await client.catalog.search({
    titles: ['Güzel Yazı Defteri'],
    categoryId: CATEGORY_ID,
  });
  assert(result.items.length > 0, 'no matches');
  catalogHit = result.items.find((p) => p.barcode) ?? result.items[0];
  return `${result.items.length} matches${result.warning ? `, warning: ${result.warning}` : ''}`;
});
await check('catalog.search', 'catalog.search: by catalogue id and barcode', async () => {
  assert(catalogHit, 'no catalogue product from the title search');
  const { catalogId, barcode } = catalogHit;
  const byId = await client.catalog.search({ catalogIds: [catalogId] });
  assert(byId.items[0]?.catalogId === catalogId, `id search: ${JSON.stringify(byId.items)}`);
  if (!barcode) return `id ${catalogId} found; no catalogue barcode to search`;
  await sleep(SPACING_MS);
  const byBarcode = await client.catalog.search({ barcodes: [barcode] });
  assert(
    byBarcode.items.some((p) => p.catalogId === catalogId),
    `barcode search: ${JSON.stringify(byBarcode.items)}`,
  );
  return `id ${catalogId} and barcode ${barcode} both found`;
});
await check('catalog.search', 'catalog.search: short title (checked locally)', () =>
  refused(() => client.catalog.search({ titles: ['kısa'], categoryId: CATEGORY_ID })),
);

// ── Product reads ───────────────────────────────────────────────────────────
await check('products.list', 'products.list: three pages of 2', async () => {
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 3; page++) {
    const result = await client.products.list({ limit: 2, sender: 'ALL', cursor });
    for (const item of result.items) seen.add(item.stockCode);
    cursor = result.nextCursor;
    if (!cursor) break;
    await sleep(SPACING_MS);
  }
  assert(seen.size > 0, 'no products');
  return `${seen.size} distinct SKUs over the pages`;
});

// ── Orders ──────────────────────────────────────────────────────────────────
const packages: N11ShipmentPackage[] = [];
await check('orders.list', 'orders.list: every status, last 15 days', async () => {
  const counts: string[] = [];
  for (const status of [
    'Created',
    'Picking',
    'Shipped',
    'Delivered',
    'Cancelled',
    'Unpacked',
    'UnSupplied',
  ]) {
    const page = await client.orders.list({
      status,
      startDate: Date.now() - 14 * DAY_MS,
      limit: 100,
    });
    for (const pkg of page.items) {
      const mapped = normalizeStatus(pkg.status);
      assert(mapped.mapped, `unmapped package status ${pkg.status}`);
    }
    packages.push(...page.items);
    counts.push(`${status} ${page.items.length}`);
    await sleep(SPACING_MS);
  }
  return counts.join(', ');
});
await check('orders.list', 'orders.list: by last update (orderByField)', async () => {
  const page = await client.orders.list({
    orderByField: true,
    startDate: Date.now() - 14 * DAY_MS,
    limit: 10,
  });
  return `${page.items.length} packages`;
});

const open = packages.find((p) => p.status === 'Created' && p.lines.length > 0);
const closed = packages.find(
  (p) => p.status !== 'Created' && p.status !== 'Picking' && p.lines.length > 0,
);
const closedLine = closed?.lines[0];
if (open && orderWrites) {
  await check('orders.approve', `orders.approve: Created package ${open.id}`, async () => {
    const lines = await client.orders.approve(open.lines.map((l) => l.lineId));
    assert(
      lines.every((l) => l.status === 'SUCCESS'),
      JSON.stringify(lines),
    );
    return `${lines.length} lines approved`;
  });
} else if (open) {
  console.log(
    `note: Created package ${open.id} on the store; set N11_E2E_ORDER_WRITES=1 to approve it`,
  );
}
if (closed && closedLine) {
  const lineId = closedLine.lineId;
  const tag = `${closed.status} package ${closed.id}`;
  await check('orders.approve', `orders.approve: ${tag}`, () =>
    linesRefused(() => client.orders.approve([lineId])),
  );
  await check('orders.splitPackage', `orders.splitPackage: ${tag}`, () =>
    refused(() => client.orders.splitPackage([[lineId]])),
  );
  await check('orders.splitPackageByQuantity', `orders.splitPackageByQuantity: ${tag}`, () =>
    refused(() => client.orders.splitPackageByQuantity({ packages: [[{ lineId, quantity: 1 }]] })),
  );
  await check('orders.createCollectionRequest', `orders.createCollectionRequest: ${tag}`, () =>
    refused(() =>
      client.orders.createCollectionRequest([
        {
          packageId: closed.cargoTrackingNumber ?? closed.id,
          lineId,
          boxQuantity: 1,
          desi: 1,
          shipmentCompany: 'HLZ',
        },
      ]),
    ),
  );
  await check('orders.updateLaborCosts', `orders.updateLaborCosts: ${tag}`, () =>
    linesRefused(() => client.orders.updateLaborCosts([{ lineId, amountExcludingVat: 10 }])),
  );
  await check('orders.cancelItem', `orders.cancelItem: ${tag}`, () =>
    refused(() => client.orders.cancelItem({ lineId, quantity: 1, reasonId: 61 })),
  );
} else {
  for (const method of [
    'orders.approve',
    'orders.splitPackage',
    'orders.splitPackageByQuantity',
    'orders.createCollectionRequest',
    'orders.updateLaborCosts',
    'orders.cancelItem',
  ] as const) {
    checks.push({
      methods: [method],
      name: method,
      outcome: 'skip',
      note: 'no closed package in the last 15 days',
    });
  }
}
await check('orders.sendInvoiceLink', 'orders.sendInvoiceLink: unknown order', () =>
  refused(() =>
    client.orders.sendInvoiceLink({ orderNumber: '1', url: 'https://example.com/lonca-e2e.pdf' }),
  ),
);
await check('orders.sendInvoiceLink', 'orders.sendInvoiceLink: http link (checked locally)', () =>
  refused(() =>
    client.orders.sendInvoiceLink({ orderNumber: '1', url: 'http://example.com/x.pdf' }),
  ),
);

// ── Claims ──────────────────────────────────────────────────────────────────
let denyReason: string | undefined;
let pendingReason: string | undefined;
await check('claims.getReturnDenyReasons', 'claims.getReturnDenyReasons', async () => {
  const reasons = await client.claims.getReturnDenyReasons();
  assert(reasons.length > 0, 'empty');
  denyReason = reasons[0]!.id;
  return `${reasons.length} reasons`;
});
await check('claims.getReturnPendingReasons', 'claims.getReturnPendingReasons', async () => {
  const reasons = await client.claims.getReturnPendingReasons();
  assert(reasons.length > 0, 'empty');
  pendingReason = reasons[0]!.id;
  return `${reasons.length} reasons`;
});
await check('claims.getCancelDenyReasons', 'claims.getCancelDenyReasons', async () => {
  const reasons = await client.claims.getCancelDenyReasons();
  assert(reasons.length > 0, 'empty');
  return `${reasons.length} reasons`;
});
await check('claims.listCancels', 'claims.listCancels: ALL', async () => {
  const page = await client.claims.listCancels({ status: 'ALL' });
  return `${page.items.length} claims`;
});
let settledReturn: string | undefined;
await check('claims.listReturns', 'claims.listReturns: ALL', async () => {
  const page = await client.claims.listReturns({ status: 'ALL' });
  settledReturn = page.items.find((c) =>
    ['APPROVED', 'DENIED', 'CANCELLED'].includes(c.status),
  )?.id;
  return `${page.items.length} claims (${[...new Set(page.items.map((c) => c.status))].join(', ') || '-'})`;
});
if (settledReturn) {
  const id = settledReturn;
  await check('claims.approveReturn', `claims.approveReturn: settled claim ${id}`, () =>
    refused(() => client.claims.approveReturn(id)),
  );
  await check('claims.denyReturn', `claims.denyReturn: settled claim ${id}`, () =>
    refused(() =>
      client.claims.denyReturn({
        claimReturnId: id,
        denyReasonId: denyReason ?? 1,
        note: 'Lonca e2e',
      }),
    ),
  );
  await check('claims.postponeReturn', `claims.postponeReturn: settled claim ${id}`, () =>
    refused(() =>
      client.claims.postponeReturn({
        claimReturnId: id,
        pendingReasonId: pendingReason ?? 1,
        days: 1,
        note: 'Lonca e2e',
      }),
    ),
  );
} else {
  for (const method of [
    'claims.approveReturn',
    'claims.denyReturn',
    'claims.postponeReturn',
  ] as const) {
    checks.push({
      methods: [method],
      name: method,
      outcome: 'skip',
      note: 'no settled return claim',
    });
  }
}

// ── Questions (n11 allows one list call per minute) ────────────────────────
let answered: string | undefined;
await check('questions.list', 'questions.list: CLOSED, last 30 days', async () => {
  const end = new Date();
  const page = await client.questions.list({
    startDate: new Date(end.getTime() - 30 * DAY_MS),
    endDate: end,
    status: 'CLOSED',
  });
  answered = page.items[0]?.id;
  return `${page.items.length} questions`;
});
if (answered) {
  const id = answered;
  await check('questions.get', `questions.get: ${id}`, async () => {
    const detail = await client.questions.get(id);
    assert(detail.id === id && detail.answer, 'no answer on a CLOSED question');
    return `status ${detail.status}, asked ${detail.questionDate}`;
  });
  await check('questions.answer', `questions.answer: already answered ${id}`, () =>
    refused(() => client.questions.answer(id, 'Lonca e2e')),
  );
}
await check('questions.get', 'questions.get: unknown id', () =>
  refused(() => client.questions.get('1')),
);
await check('questions.answer', 'questions.answer: unknown id', () =>
  refused(() => client.questions.answer('1', 'Lonca e2e')),
);

// ── Product lifecycle on one throwaway SKU ─────────────────────────────────
const sku = `LONCA-E2E-${Date.now()}`;
const wait = { pollIntervalMs: 3000 };

async function readBack(
  predicate: (p: Awaited<ReturnType<typeof client.products.list>>['items'][number]) => boolean,
) {
  // Results usually show at once; give the read side a few seconds to catch up.
  for (let attempt = 0; attempt < 6; attempt++) {
    const row = (await client.products.list({ stockCode: sku })).items[0];
    if (row && predicate(row)) return row;
    await sleep(5000);
  }
  const row = (await client.products.list({ stockCode: sku })).items[0];
  throw new CheckFailed(
    `read-back mismatch: ${JSON.stringify(row && { ...row, raw: undefined, description: undefined })}`,
  );
}

let created = false;
await check(
  ['products.create', 'products.waitForTask'],
  `products.create + waitForTask: ${sku}`,
  async () => {
    const task = await client.products.create([
      {
        stockCode: sku,
        title: 'Lonca SDK Uçtan Uca Test Defteri - Satılık Değildir',
        description:
          '<p>Lonca SDK uçtan uca test ürünü. Satılık değildir, test bitince silinir.</p>',
        categoryId: CATEGORY_ID,
        productMainId: `${sku}-MAIN`,
        preparingDay: 3,
        shipmentTemplate: '1',
        quantity: 1,
        salePrice: 1500,
        listPrice: 1500,
        vatRate: 20,
        images: [
          {
            url: 'https://n11scdn3.akamaized.net/a1/org/16/34/83/93/IMG-2754324599651795206.jpg',
            order: 1,
          },
        ],
        attributes: brandValueId ? [{ id: 1, valueId: brandValueId }] : [],
      },
    ]);
    assert(task.status === 'IN_QUEUE' && task.taskId, `unexpected task ${JSON.stringify(task)}`);
    const started = Date.now();
    const done = await client.products.waitForTask(task.taskId, {
      ...wait,
      timeoutMs: 20 * 60_000,
    });
    const item = done.items.find((i) => i.stockCode === sku);
    assert(
      done.status === 'PROCESSED' && item?.status === 'SUCCESS',
      `task ended ${JSON.stringify(done.items)}`,
    );
    created = true;
    return `task ${task.taskId} done in ${Math.round((Date.now() - started) / 1000)} s, n11 id ${item.n11ProductId}`;
  },
);

if (created) {
  await check('products.update', 'products.update: suspend at once', async () => {
    const task = await client.products.update([{ stockCode: sku, status: 'Suspended' }]);
    const done = await client.products.waitForTask(task.taskId, wait);
    assert(done.failCount === 0, JSON.stringify(done.items));
    await readBack((p) => p.status === 'Suspended');
    return `task ${task.taskId}, read back Suspended`;
  });
  await check('products.list', 'products.list: by stockCode', async () => {
    const row = await readBack(() => true);
    assert(row.categoryId === CATEGORY_ID, `category ${row.categoryId}`);
    assert(
      row.salePrice?.amount === 150000 && row.salePrice.currency === 'TRY',
      `price ${JSON.stringify(row.salePrice)}`,
    );
    return `id ${row.id}, ${row.title}, ${row.images.length} image(s), productMainId ${row.productMainId ?? 'not stored'}`;
  });
  await check(
    'inventory.updateAndWait',
    'inventory.updateAndWait: stock + price pair',
    async () => {
      const [done] = await client.inventory.updateAndWait(
        [{ stockCode: sku, quantity: 3, salePrice: 1399.9, listPrice: 1500 }],
        wait,
      );
      assert(done?.failCount === 0 && done.successCount === 1, JSON.stringify(done?.items));
      await readBack(
        (p) => p.quantity === 3 && p.salePrice?.amount === 139990 && p.listPrice?.amount === 150000,
      );
      return 'read back quantity 3, 1399.90 / 1500.00';
    },
  );
  await check(
    ['inventory.update', 'products.getTask'],
    'inventory.update + getTask polling: stock only',
    async () => {
      const task = await client.inventory.update([{ stockCode: sku, quantity: 2 }]);
      let details = await client.products.getTask(task.taskId);
      for (let i = 0; details.status === 'IN_QUEUE' && i < 40; i++) {
        await sleep(3000);
        details = await client.products.getTask(task.taskId);
      }
      assert(details.status === 'PROCESSED' && details.failCount === 0, JSON.stringify(details));
      await readBack((p) => p.quantity === 2 && p.salePrice?.amount === 139990);
      return `task ${task.taskId} via getTask, price kept`;
    },
  );
  await check('products.update', 'products.update: purchase limit, then remove it', async () => {
    const t1 = await client.products.update([
      { stockCode: sku, maxPurchaseQuantity: 2, preparingDay: 2 },
    ]);
    assert(
      (await client.products.waitForTask(t1.taskId, wait)).failCount === 0,
      'limit task failed',
    );
    await readBack((p) => p.maxPurchaseQuantity === 2 && p.preparingDay === 2);
    const t2 = await client.products.update([{ stockCode: sku, deleteMaxPurchaseQuantity: true }]);
    assert(
      (await client.products.waitForTask(t2.taskId, wait)).failCount === 0,
      'remove task failed',
    );
    await readBack((p) => p.maxPurchaseQuantity === undefined);
    return 'limit 2 set and removed, preparingDay 2';
  });
  await check('products.update', 'products.update: set productMainId, then remove it', async () => {
    const t1 = await client.products.update([{ stockCode: sku, productMainId: `${sku}-GROUP` }]);
    const d1 = await client.products.waitForTask(t1.taskId, wait);
    assert(d1.failCount === 0, JSON.stringify(d1.items));
    const row = (await client.products.list({ stockCode: sku })).items[0];
    if (row?.catalogId && row.productMainId === undefined) {
      // n11 matched the new SKU to a catalogue product; such products keep no
      // productMainId, and n11 reports the update as a success anyway.
      return `task succeeded, but n11 keeps productMainId empty on catalogue product ${row.catalogId}`;
    }
    await readBack((p) => p.productMainId === `${sku}-GROUP`);
    const t2 = await client.products.update([{ stockCode: sku, deleteProductMainId: true }]);
    const d2 = await client.products.waitForTask(t2.taskId, wait);
    assert(d2.failCount === 0, JSON.stringify(d2.items));
    await readBack((p) => p.productMainId === undefined);
    return 'set and removed';
  });
  await check('inventory.update', 'inventory.update: unknown SKU fails per SKU', async () => {
    const task = await client.inventory.update([{ stockCode: `${sku}-NOPE`, quantity: 1 }]);
    const done = await client.products.waitForTask(task.taskId, wait);
    const item = done.items[0];
    assert(done.failCount === 1 && item?.status === 'FAIL', JSON.stringify(done.items));
    return `FAIL: ${item.reasons.join('; ')}`;
  });
  await check('inventory.update', 'inventory.update: lone salePrice (checked locally)', () =>
    refused(() => client.inventory.update([{ stockCode: sku, salePrice: 10 }])),
  );
  await check('products.update', 'products.update: bad status enum', () =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately invalid input
    refused(() => client.products.update([{ stockCode: sku, status: 'Bogus' as any }])),
  );
}
await check('products.getTask', 'products.getTask: unknown task', () =>
  refused(() => client.products.getTask('1')),
);

if (created) {
  await check(
    ['products.delete', 'products.waitForTask'],
    `products.delete + waitForTask: ${sku}`,
    async () => {
      const task = await client.products.delete([sku]);
      const done = await client.products.waitForTask(task.taskId, wait);
      assert(done.failCount === 0, JSON.stringify(done.items));
      for (let attempt = 0; attempt < 6; attempt++) {
        if ((await client.products.list({ stockCode: sku })).items.length === 0)
          return `task ${task.taskId}, gone from the list`;
        await sleep(5000);
      }
      return { outcome: 'FAIL', note: `task ${task.taskId} succeeded but the SKU is still listed` };
    },
  );
} else {
  console.error(
    `\nproduct ${sku} was not confirmed; check Seller Office and delete it by hand if it exists`,
  );
}

// ── Report ──────────────────────────────────────────────────────────────────
const reached = new Set(checks.filter((c) => c.outcome !== 'skip').flatMap((c) => c.methods));
const byMethod = (outcome: Outcome) =>
  new Set(checks.filter((c) => c.outcome === outcome).flatMap((c) => c.methods));
const failed = checks.filter((c) => c.outcome === 'FAIL');
const successPath = [...byMethod('ok')];
const refusalOnly = [...byMethod('refused')].filter((m) => !successPath.includes(m));
console.log(`
${checks.length} checks, ${failed.length} failed
methods reached: ${reached.size}/${METHODS.length}
success path verified: ${successPath.length} (${successPath.join(', ')})
refusal only: ${refusalOnly.length} (${refusalOnly.join(', ')})
not reached: ${METHODS.filter((m) => !reached.has(m)).join(', ') || '-'}`);
process.exit(failed.length > 0 ? 1 : 0);
