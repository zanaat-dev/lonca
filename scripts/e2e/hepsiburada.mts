#!/usr/bin/env -S pnpm exec tsx
/**
 * End-to-end run of every `@lonca/hepsiburada` method against Hepsiburada SIT.
 *
 *   pnpm build --filter @lonca/hepsiburada...
 *   pnpm e2e:hepsiburada               # reads .env (HB_ENV must be `sit`)
 *
 * SIT is Hepsiburada's sandbox. The script refuses to run unless `HB_ENV` is
 * `sit`, so it never writes to a real seller. The merchant id never reaches
 * the output (it is masked as `<merchant>`).
 *
 * What it does:
 * - Reads: every read method with realistic parameters; it checks shapes, not
 *   data (the SIT merchant is sparse).
 * - Listings: changes the stock and price of one SIT listing (`HB_E2E_SKU`,
 *   default `HBV0000105YIF`), activates and deactivates it, waits for each
 *   upload to settle and reads the change back, then puts back the values it
 *   found (also when a check fails).
 * - Orders: places a test order on the order stub, finds the package the stub
 *   makes for it, and sends every package and line action. Stub packages have
 *   no delivery record, so most actions end in `500 DeliveryNotFound` after
 *   Hepsiburada validated the body; those count as `refused`, a `400` on our
 *   body is a `FAIL`.
 * - Questions: seeds two questions on SIT, answers one and rejects the other.
 * - Catalog / product updates: sends unknown SKUs or an invalid category, so
 *   the tracking flow runs end to end and nothing real is created or deleted.
 * - Claims, suppliers, promotions: SIT cannot run their success path (see the
 *   notes each check prints); the requests still go out and the answers are
 *   recorded.
 *
 * Left behind on SIT (by design): the test order and its package, the seeded
 * questions, an invoice link on the new package and one `LONCA-E2E-PROFILE`
 * shipping profile (created once, reused afterwards).
 *
 * Exit codes: 0 every check passed, 1 a check failed, 2 setup error.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LoncaError, NetworkError, NotFoundError, ServerError, ValidationError } from '@lonca/core';
import { createHepsiburadaClient, type HepsiburadaClient, type Listing } from '@lonca/hepsiburada';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DAY_MS = 24 * 60 * 60 * 1000;
/** Keep every call spaced; SIT is shared and slow to settle. */
const SPACING_MS = 1000;

// ── Setup ───────────────────────────────────────────────────────────────────

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`missing ${name}; run with --env-file=.env`);
    process.exit(2);
  }
  return value;
}

if (process.env.HB_ENV !== 'sit') {
  console.error(
    `refusing to run: HB_ENV is ${JSON.stringify(process.env.HB_ENV)}, not "sit"; this script writes`,
  );
  process.exit(2);
}
const MERCHANT_ID = required('HB_MERCHANT_ID');
const client: HepsiburadaClient = createHepsiburadaClient({
  merchantId: MERCHANT_ID,
  username: required('HB_API_USER'),
  password: required('HB_API_PASS'),
  env: 'sit',
  integratorName: required('HB_INTEGRATOR_NAME'),
});
const HB_SKU = process.env.HB_E2E_SKU ?? 'HBV0000105YIF';

/** Never print the merchant id: Hepsiburada echoes it in rows and error messages. */
const mask = (text: string): string => text.split(MERCHANT_ID).join('<merchant>');
const say = (text: string): void => console.log(mask(text));
const json = (value: unknown, max = 200): string =>
  (JSON.stringify(value) ?? 'undefined').slice(0, max);

/** Public `resource.method` names, read from the API lock (`etc/hepsiburada-client.d.ts.snapshot`). */
function publicMethods(): string[] {
  const text = readFileSync(join(ROOT, 'etc/hepsiburada-client.d.ts.snapshot'), 'utf8');
  const lines = text.split(/\r?\n/);
  const block = (header: RegExp): string[] => {
    const start = lines.findIndex((l) => header.test(l));
    if (start < 0) return [];
    const end = lines.findIndex((l, i) => i > start && l === '}');
    return lines.slice(start + 1, end);
  };
  const out: string[] = [];
  for (const line of block(/^interface HepsiburadaClient \{/)) {
    const m = /^ {4}(\w+): (\w+);/.exec(line);
    if (!m) continue;
    for (const member of block(new RegExp(`^declare class ${m[2]} \\{`))) {
      const method = /^ {4}(?!private |constructor|static |readonly )(\w+)(?:<[^(]*>)?\(/.exec(
        member,
      );
      if (method) out.push(`${m[1]}.${method[1]}`);
    }
  }
  return [...new Set(out)].sort();
}
const METHODS = publicMethods();
if (METHODS.length === 0) {
  console.error('could not read the public methods from etc/hepsiburada-client.d.ts.snapshot');
  process.exit(2);
}

// ── Checks ──────────────────────────────────────────────────────────────────

/** `ok`: success path verified. `refused`: Hepsiburada refused as expected. */
type Outcome = 'ok' | 'refused' | 'skip' | 'FAIL';
interface Check {
  /** The methods the check exercises; the first is the one under test. */
  methods: string[];
  name: string;
  outcome: Outcome;
  note: string;
}
type Result = { outcome?: Outcome; note: string } | string;

const checks: Check[] = [];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class CheckFailed extends Error {}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new CheckFailed(message);
}

/** The raw error body, short, for notes. */
function bodyOf(error: LoncaError): string {
  const body = (error.data as { body?: unknown } | undefined)?.body;
  return typeof body === 'string' ? body : json(body, 160);
}

function describeError(error: unknown): string {
  if (error instanceof LoncaError) {
    const issue = error.issues[0]?.message;
    const status = error.status ? ` ${error.status}` : '';
    if (error instanceof ServerError || (!issue && error.data)) {
      return `${error.constructor.name}${status}: ${bodyOf(error)}`;
    }
    return `${error.constructor.name}${status}: ${issue ?? error.message}`;
  }
  return error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error);
}

async function check(method: string | string[], name: string, run: () => Promise<Result>) {
  await sleep(SPACING_MS);
  const methods = Array.isArray(method) ? method : [method];
  for (const m of methods) {
    if (!METHODS.includes(m)) throw new Error(`unknown method ${m} in check "${name}"`);
  }
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
  result.note = mask(result.note);
  checks.push(result);
  say(`${result.outcome.padEnd(7)} ${name} — ${result.note}`);
}

function skip(method: string, note: string): void {
  checks.push({ methods: [method], name: method, outcome: 'skip', note });
  say(`${'skip'.padEnd(7)} ${method} — ${note}`);
}

interface RefusalRules {
  /** A `5xx` whose body matches counts as a refusal (stub state errors raised after validation). */
  server?: RegExp;
  /**
   * Accept `400`/`422` (default true). `false` where a `400` would mean our
   * body is wrong; a pattern accepts only the `400`s whose message matches.
   */
  validation?: boolean | RegExp;
}

/**
 * The call must be refused: a `ValidationError`, a `NotFoundError`, a state
 * conflict (`406`/`409`), or a `5xx` matching `rules.server`. Anything else
 * (a success, `401`/`403`, an unexpected `5xx`) fails the check.
 */
async function refused(call: () => Promise<unknown>, rules: RefusalRules = {}): Promise<Result> {
  let value: unknown;
  try {
    value = await call();
  } catch (error) {
    if (error instanceof ServerError && rules.server?.test(bodyOf(error))) {
      return { outcome: 'refused', note: `passed validation, then ${describeError(error)}` };
    }
    if (error instanceof ValidationError) {
      const { validation = true } = rules;
      const note = describeError(error);
      if (validation === true || (validation instanceof RegExp && validation.test(note))) {
        return { outcome: 'refused', note };
      }
    }
    if (error instanceof NotFoundError) return { outcome: 'refused', note: describeError(error) };
    if (error instanceof LoncaError && (error.status === 406 || error.status === 409)) {
      return { outcome: 'refused', note: describeError(error) };
    }
    throw error;
  }
  throw new CheckFailed(`expected a refusal, got ${json(value)}`);
}

/**
 * For a service SIT does not run: a success is `ok`, a `5xx` or a dropped
 * connection is `skip` (the request went out; Hepsiburada's side failed).
 */
async function sitServiceDown(call: () => Promise<unknown>, okNote: (v: unknown) => string) {
  try {
    return okNote(await call());
  } catch (error) {
    if (error instanceof ServerError || error instanceof NetworkError) {
      return { outcome: 'skip' as const, note: `SIT service failed: ${describeError(error)}` };
    }
    throw error;
  }
}

/** Poll a listing upload while Hepsiburada reports it `Ready` (queued) or `InProgress`. */
async function settleUpload<T extends { status?: string }>(get: () => Promise<T>): Promise<T> {
  let result = await get();
  for (let i = 0; i < 30 && (result.status === 'Ready' || result.status === 'InProgress'); i++) {
    await sleep(3000);
    result = await get();
  }
  return result;
}

async function readListing(): Promise<Listing> {
  const row = (await client.listings.list({ offset: 0, limit: 1, hbSkuList: HB_SKU })).items[0];
  if (!row) throw new CheckFailed(`listing ${HB_SKU} not found`);
  return row;
}

async function waitForListing(predicate: (l: Listing) => boolean, what: string): Promise<Listing> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const row = await readListing();
    if (predicate(row)) return row;
    await sleep(3000);
  }
  const row = await readListing();
  throw new CheckFailed(
    `${what} not read back: stock ${row.availableStock}, price ${row.price}, salable ${row.isSalable}`,
  );
}

const nope = `LONCA-E2E-NOPE-${Date.now()}`;
const today = new Date();
const ymd = (d: Date) => d.toISOString().slice(0, 10);
/** Hepsiburada's list date format, `yyyy-MM-dd HH:mm`. */
const ymdhm = (d: Date) => d.toISOString().slice(0, 16).replace('T', ' ');

say(`Hepsiburada SIT, merchant <merchant>, listing ${HB_SKU}; ${METHODS.length} public methods\n`);

// ── Categories and catalogue reads ──────────────────────────────────────────

const CATEGORY_ID = 60003858; // Kadın Günlük Ayakkabı: an active leaf on SIT.
let enumAttribute: string | undefined;
await check('categories.list', 'categories.list: active leaves, page of 5', async () => {
  const page = await client.categories.list({
    leaf: true,
    status: 'ACTIVE',
    available: true,
    page: 0,
    size: 5,
  });
  assert(page.items.length > 0 && page.totalCount > 0, 'empty page');
  assert(
    page.items.every((c) => typeof c.categoryId === 'number' && c.leaf === true),
    `bad rows ${json(page.items[0])}`,
  );
  return `${page.items.length} of ${page.totalCount} leaves`;
});
await check('categories.getAttributes', `categories.getAttributes: ${CATEGORY_ID}`, async () => {
  const attrs = await client.categories.getAttributes(CATEGORY_ID);
  assert(attrs.length > 0 && attrs.every((a) => a.id && a.name), 'no attributes');
  enumAttribute = attrs.find((a) => a.type === 'enum')?.id?.toString();
  return `${attrs.length} attributes, first enum ${enumAttribute ?? 'none'}`;
});
if (enumAttribute) {
  const attributeId = enumAttribute;
  await check(
    'categories.getAttributeValues',
    `categories.getAttributeValues: ${attributeId}`,
    async () => {
      const values = await client.categories.getAttributeValues(CATEGORY_ID, attributeId);
      assert(values.length > 0 && values.every((v) => v.name), `bad values ${json(values[0])}`);
      return `${values.length} values (first "${values[0]!.name}")`;
    },
  );
} else {
  skip('categories.getAttributeValues', 'the category has no enum attribute');
}

await check('catalog.listProducts', 'catalog.listProducts: page of 2', async () => {
  const page = await client.catalog.listProducts({ page: 0, size: 2 });
  assert(page.items.length > 0, 'no products');
  assert(
    page.items.every((p) => p.merchantSku),
    `row without merchantSku ${json(page.items[0])}`,
  );
  return `${page.items.length} of ${page.totalCount}`;
});
await check('catalog.listProductsByStatus', 'catalog.listProductsByStatus: MATCHED', async () => {
  const page = await client.catalog.listProductsByStatus({ status: 'MATCHED', page: 0, size: 2 });
  return `${page.items.length} of ${page.totalCount}`;
});
await check('catalog.getTrackingIdHistory', 'catalog.getTrackingIdHistory', async () => {
  const history = await client.catalog.getTrackingIdHistory();
  assert(
    history.every((h) => h.trackingId),
    'entry without trackingId',
  );
  return `${history.length} tracking ids`;
});
await check(
  'productUpdates.getUpdateHistory',
  `productUpdates.getUpdateHistory: ${HB_SKU}`,
  async () => {
    const history = await client.productUpdates.getUpdateHistory(HB_SKU);
    assert(
      history.every((h) => h.trackingId),
      'entry without trackingId',
    );
    return `${history.length} entries`;
  },
);

// ── Shipping ────────────────────────────────────────────────────────────────

await check('shipping.getCargoFirms', 'shipping.getCargoFirms', async () => {
  const firms = await client.shipping.getCargoFirms();
  assert(firms.length > 0, 'empty');
  const named = firms.filter((f) => f.name !== undefined).length;
  return `${firms.length} rows, ${named} with a mapped name (rows are label groups with nested cargoFirms)`;
});
const PROFILE_NAME = 'LONCA-E2E-PROFILE';
let profileId: string | undefined;
await check('shipping.listProfiles', 'shipping.listProfiles', async () => {
  const profiles = await client.shipping.listProfiles();
  assert(profiles.length > 0, 'no profiles');
  assert(
    profiles.every((p) => p.profileName),
    `profile without a name: ${json(profiles.map((p) => p.raw))}`,
  );
  profileId = profiles.find((p) => p.profileName === PROFILE_NAME)?.raw.id as string | undefined;
  return `${profiles.length} profiles${profileId ? `, ${PROFILE_NAME} present` : ''}`;
});
if (profileId) {
  await check('shipping.createProfile', `shipping.createProfile: duplicate ${PROFILE_NAME}`, () =>
    refused(() => client.shipping.createProfile({ name: PROFILE_NAME })),
  );
} else {
  await check('shipping.createProfile', `shipping.createProfile: ${PROFILE_NAME}`, async () => {
    const result = await client.shipping.createProfile({ name: PROFILE_NAME });
    const raw = result.raw as { success?: boolean; data?: string };
    assert(raw.success === true && raw.data, json(raw));
    profileId = raw.data;
    return `created ${raw.data} (kept for later runs)`;
  });
}
if (profileId) {
  const id = profileId;
  await check(
    ['shipping.updateProfile', 'shipping.listProfiles'],
    `shipping.updateProfile: ${PROFILE_NAME}`,
    async () => {
      const result = await client.shipping.updateProfile({ id, name: PROFILE_NAME });
      assert((result.raw as { success?: boolean }).success === true, json(result.raw));
      await sleep(SPACING_MS);
      const profiles = await client.shipping.listProfiles();
      assert(
        profiles.some((p) => p.raw.id === id && p.profileName === PROFILE_NAME),
        'name not read back',
      );
      return 'name written and read back';
    },
  );
} else {
  skip('shipping.updateProfile', 'no LONCA-E2E profile to update');
}
await check('shipping.updateProfile', 'shipping.updateProfile: without id', () =>
  refused(() => client.shipping.updateProfile({ name: PROFILE_NAME }), {
    server: /nil pointer/,
  }),
);

// ── Accounting, suppliers, promotions ──────────────────────────────────────

await check(
  'accounting.listTransactions',
  'accounting.listTransactions: last 30 days',
  async () => {
    const rows = await client.accounting.listTransactions({
      recordDateStart: ymd(new Date(today.getTime() - 30 * DAY_MS)),
      recordDateEnd: ymd(today),
      limit: 10,
    });
    assert(Array.isArray(rows), 'not an array');
    return `${rows.length} transactions`;
  },
);
await check('accounting.listTransactions', 'accounting.listTransactions: no date filter', () =>
  refused(() => client.accounting.listTransactions({ limit: 10 })),
);

const notSupplier = { validation: false } as const;
await check('suppliers.searchOpenPurchaseOrders', 'suppliers.searchOpenPurchaseOrders', () =>
  refused(
    () =>
      client.suppliers.searchOpenPurchaseOrders({
        dueDateStart: ymd(today),
        dueDateEnd: ymd(new Date(today.getTime() + 30 * DAY_MS)),
        limit: 10,
        offset: 0,
      }),
    notSupplier,
  ),
);
await check('suppliers.searchSupplierListings', 'suppliers.searchSupplierListings', () =>
  refused(() => client.suppliers.searchSupplierListings({ limit: 10, offset: 0 }), notSupplier),
);
await check('suppliers.searchListingUpdateRequests', 'suppliers.searchListingUpdateRequests', () =>
  refused(
    () =>
      client.suppliers.searchListingUpdateRequests({
        startDate: ymd(new Date(today.getTime() - 30 * DAY_MS)),
        endDate: ymd(today),
        limit: 10,
        offset: 0,
      }),
    notSupplier,
  ),
);
await check('suppliers.getListingUpdateRequest', 'suppliers.getListingUpdateRequest', () =>
  refused(() => client.suppliers.getListingUpdateRequest(randomUUID()), notSupplier),
);
await check('suppliers.createListingUpdateRequest', 'suppliers.createListingUpdateRequest', () =>
  refused(
    () =>
      client.suppliers.createListingUpdateRequest({
        requestItems: [
          {
            traceId: randomUUID(),
            merchantSku: nope,
            sku: 'HBV00000NOPE1',
            price: 1,
            stock: 0,
            currencyCode: 'TRY',
            salable: false,
          },
        ],
      }),
    notSupplier,
  ),
);

await check('promotions.listCategories', 'promotions.listCategories', async () => {
  const categories = await client.promotions.listCategories();
  assert(categories.length > 0, 'empty');
  return `${categories.length} categories`;
});
await check('promotions.getBudgets', 'promotions.getBudgets', () =>
  sitServiceDown(
    () => client.promotions.getBudgets(),
    (v) => json(v, 80),
  ),
);
await check('promotions.getLimits', 'promotions.getLimits', () =>
  sitServiceDown(
    () => client.promotions.getLimits(),
    (v) => json(v, 80),
  ),
);
let campaignId: string | undefined;
await check('promotions.listDiscounts', 'promotions.listDiscounts', () =>
  sitServiceDown(
    () => client.promotions.listDiscounts({ page: 1, pageSize: 10 }),
    (v) => {
      const rows = v as { campaignId?: string | number }[];
      campaignId = rows[0]?.campaignId?.toString();
      return `${rows.length} discounts`;
    },
  ),
);
await check('promotions.getDiscount', `promotions.getDiscount: ${campaignId ?? 'unknown id'}`, () =>
  sitServiceDown(
    () => client.promotions.getDiscount(campaignId ?? '1'),
    (v) => json(v, 80),
  ),
);
// Dates in the past: should the service come back, these are refused, never created.
const pastWindow = {
  name: 'LONCA-E2E',
  startDate: '2020-01-01T00:00:00+03:00',
  endDate: '2020-01-02T00:00:00+03:00',
  oneTimeUsage: true,
};
for (const [method, call] of [
  [
    'promotions.createTlDiscount',
    () =>
      client.promotions.createTlDiscount({
        ...pastWindow,
        conditionSkus: [HB_SKU],
        budget: 1,
        discountAmount: 1,
        conditionAmount: 10,
      }),
  ],
  [
    'promotions.createPercentDiscount',
    () =>
      client.promotions.createPercentDiscount({
        ...pastWindow,
        conditionSkus: [HB_SKU],
        discountPercentage: 1,
        conditionAmount: 10,
        maxDiscountAmount: 1,
        maxCartCount: 1,
      }),
  ],
  [
    'promotions.createXyDiscount',
    () =>
      client.promotions.createXyDiscount({
        ...pastWindow,
        conditionSkus: [HB_SKU],
        conditionProductCount: 3,
        mustPayProductCount: 2,
        iterationCount: 1,
        maxCartCount: 1,
      }),
  ],
  ['promotions.cancelDiscount', () => client.promotions.cancelDiscount({ campaignId: 1 })],
] as const) {
  await check(method, `${method}: past dates / unknown campaign`, () =>
    sitServiceDown(
      () => refused(call),
      (r) => (r as { note: string }).note,
    ).then((r) => (typeof r === 'string' ? { outcome: 'refused' as const, note: r } : r)),
  );
}

// ── Listings ────────────────────────────────────────────────────────────────

let original: Listing | undefined;
await check('listings.list', `listings.list: ${HB_SKU}`, async () => {
  original = await readListing();
  assert(original.merchantSku, 'no merchantSku');
  return `stock ${original.availableStock}, price ${original.price}, salable ${original.isSalable}`;
});
await check('listings.list', 'listings.list: two pages of 2', async () => {
  const first = await client.listings.list({ offset: 0, limit: 2 });
  await sleep(SPACING_MS);
  const second = await client.listings.list({ offset: 2, limit: 2 });
  const skus = new Set([...first.items, ...second.items].map((l) => l.hepsiburadaSku));
  assert(skus.size === 4, `expected 4 distinct SKUs, got ${skus.size}`);
  return `${first.totalCount} listings, pages distinct`;
});
await check('listings.getCommissions', `listings.getCommissions: ${HB_SKU}`, async () => {
  const rows = await client.listings.getCommissions(HB_SKU);
  assert(Array.isArray(rows), 'not an array');
  return `${rows.length} rows`;
});
await check('listings.getBuyboxOrder', `listings.getBuyboxOrder: ${HB_SKU}`, async () => {
  try {
    const rows = await client.listings.getBuyboxOrder(HB_SKU);
    return `${rows.length} rows`;
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { outcome: 'refused', note: `${describeError(error)} (no buybox data on SIT)` };
    }
    throw error;
  }
});

if (original?.merchantSku) {
  const merchantSku = original.merchantSku;
  const { availableStock: stock0, price: price0, isSalable: salable0 } = original;
  try {
    await check(
      ['listings.uploadStock', 'listings.getStockUpload'],
      `listings.uploadStock: ${stock0} → ${stock0 + 1}`,
      async () => {
        const { id } = await client.listings.uploadStock([
          { hepsiburadaSku: HB_SKU, merchantSku, availableStock: stock0 + 1 },
        ]);
        const done = await settleUpload(() => client.listings.getStockUpload(id));
        assert(done.status === 'Done' && done.errors.length === 0, json(done));
        await waitForListing((l) => l.availableStock === stock0 + 1, 'stock');
        return `upload ${id} Done, read back`;
      },
    );
    await check(
      ['listings.uploadPrice', 'listings.getPriceUpload'],
      `listings.uploadPrice: ${price0} → ${price0 + 1}`,
      async () => {
        const { id } = await client.listings.uploadPrice([
          { hepsiburadaSku: HB_SKU, merchantSku, price: price0 + 1 },
        ]);
        const done = await settleUpload(() => client.listings.getPriceUpload(id));
        assert(done.status === 'Done' && done.errors.length === 0, json(done));
        await waitForListing((l) => l.price === price0 + 1, 'price');
        return `upload ${id} Done, read back`;
      },
    );
    await check(
      'listings.updateSingle',
      `listings.updateSingle: stock → ${stock0 + 2}`,
      async () => {
        await client.listings.updateSingle(HB_SKU, merchantSku, { newAvailableStock: stock0 + 2 });
        await waitForListing((l) => l.availableStock === stock0 + 2, 'stock');
        return 'read back';
      },
    );
    await check(
      ['listings.uploadShippingInfo', 'listings.getShippingInfoUpload'],
      `listings.uploadShippingInfo: same dispatch time ${original.dispatchTime}`,
      async () => {
        const { id } = await client.listings.uploadShippingInfo([
          { hepsiburadaSku: HB_SKU, merchantSku, dispatchTime: original!.dispatchTime },
        ]);
        const done = await settleUpload(() => client.listings.getShippingInfoUpload(id));
        assert(done.status === 'Done' && done.errors.length === 0, json(done));
        return `upload ${id} Done`;
      },
    );
  } finally {
    // Put back what we found, whatever happened above.
    await check(
      ['listings.uploadInventory', 'listings.getInventoryUpload'],
      `listings.uploadInventory: restore stock ${stock0}, price ${price0}`,
      async () => {
        const { id } = await client.listings.uploadInventory([
          { hepsiburadaSku: HB_SKU, merchantSku, availableStock: stock0, price: price0 },
        ]);
        const done = await settleUpload(() => client.listings.getInventoryUpload(id));
        assert(done.status === 'Done' && done.errors.length === 0, json(done));
        await waitForListing(
          (l) => l.availableStock === stock0 && l.price === price0,
          'restored stock and price',
        );
        return `upload ${id} Done, read back`;
      },
    );
    // Last, because an inventory upload makes the listing salable again
    // (seen on SIT, 2026-10-14): the second call restores the state found.
    const activate = async () => {
      await client.listings.activate(HB_SKU);
      await waitForListing((l) => l.isSalable, 'activation');
      return 'read back salable';
    };
    const deactivate = async () => {
      await client.listings.deactivate(HB_SKU);
      await waitForListing((l) => !l.isSalable, 'deactivation');
      return 'read back not salable';
    };
    if (salable0) {
      await check('listings.deactivate', 'listings.deactivate', deactivate);
      await check('listings.activate', 'listings.activate (restores)', activate);
    } else {
      await check('listings.activate', 'listings.activate', activate);
      await check('listings.deactivate', 'listings.deactivate (restores)', deactivate);
    }
    let now = await readListing().catch(() => undefined);
    if (now && now.isSalable !== salable0) {
      await (
        salable0 ? client.listings.activate(HB_SKU) : client.listings.deactivate(HB_SKU)
      ).catch(() => undefined);
      await sleep(3000);
      now = await readListing().catch(() => undefined);
    }
    if (
      !now ||
      now.availableStock !== stock0 ||
      now.price !== price0 ||
      now.isSalable !== salable0
    ) {
      console.error(
        `\nlisting ${HB_SKU} not restored (found ${json(now && { s: now.availableStock, p: now.price, salable: now.isSalable })}); ` +
          `set stock ${stock0}, price ${price0}, salable ${salable0} by hand`,
      );
    }
  }
} else {
  for (const method of [
    'listings.uploadStock',
    'listings.getStockUpload',
    'listings.uploadPrice',
    'listings.getPriceUpload',
    'listings.updateSingle',
    'listings.activate',
    'listings.deactivate',
    'listings.uploadShippingInfo',
    'listings.getShippingInfoUpload',
    'listings.uploadInventory',
    'listings.getInventoryUpload',
  ]) {
    skip(method, `listing ${HB_SKU} not found`);
  }
}

const unknownListing = { hepsiburadaSku: 'HBV00000NOPE1', merchantSku: nope };
await check(
  ['listings.uploadAdditionalInfo', 'listings.getAdditionalInfoUpload'],
  'listings.uploadAdditionalInfo: unknown SKU fails per item',
  async () => {
    const { id } = await client.listings.uploadAdditionalInfo([
      { ...unknownListing, customizationTextLength: 0 },
    ]);
    const done = await settleUpload(() => client.listings.getAdditionalInfoUpload(id));
    const errors = done.errors[0]?.errors ?? [];
    assert(done.status === 'Done' && errors.includes('ListingNotFound'), json(done));
    return { outcome: 'refused', note: `upload ${id} Done with ListingNotFound` };
  },
);
await check(
  ['listings.uploadInventory', 'listings.getInventoryUpload'],
  'listings.uploadInventory: unknown SKU fails per item',
  async () => {
    const { id } = await client.listings.uploadInventory([
      { ...unknownListing, price: 1, availableStock: 0 },
    ]);
    const done = await settleUpload(() => client.listings.getInventoryUpload(id));
    const errors = done.errors[0]?.errors ?? [];
    assert(done.status === 'Done' && errors.includes('ListingNotFound'), json(done));
    return { outcome: 'refused', note: `upload ${id} Done with ListingNotFound` };
  },
);
await check('listings.getStockUpload', 'listings.getStockUpload: unknown id', () =>
  refused(() => client.listings.getStockUpload(randomUUID())),
);
await check('listings.deleteSingle', 'listings.deleteSingle: unknown SKU', () =>
  refused(() => client.listings.deleteSingle(unknownListing.hepsiburadaSku, nope)),
);
await check('listings.bulkUnlock', `listings.bulkUnlock: ${HB_SKU} (not locked)`, () =>
  refused(() => client.listings.bulkUnlock({ hbSkuList: [HB_SKU] })),
);

// ── Catalogue writes (unknown SKUs / invalid category: nothing real changes) ─

async function settleTracking<T extends { rows?: unknown[] }>(get: () => Promise<T>): Promise<T> {
  let result = await get();
  for (let i = 0; i < 20 && !result.rows?.length; i++) {
    await sleep(3000);
    result = await get();
  }
  return result;
}

await check(
  ['catalog.uploadProductViaFile', 'catalog.getProductStatus'],
  'catalog.uploadProductViaFile: non-leaf category',
  async () => {
    const { trackingId } = await client.catalog.uploadProductViaFile([
      { categoryId: 1, attributes: { merchantSku: nope, UrunAdi: 'Lonca E2E - Satılık Değildir' } },
    ]);
    assert(trackingId, 'no trackingId');
    const status = await settleTracking(() => client.catalog.getProductStatus(trackingId));
    const row = status.rows?.[0] as {
      importStatus?: string;
      importMessages?: { message?: string }[];
    };
    assert(row?.importStatus === 'FAILED', `import ${json(status.rows)}`);
    return `tracking ${trackingId}: FAILED "${row.importMessages?.[0]?.message ?? '?'}"`;
  },
);
await check(
  ['catalog.uploadFastListing', 'catalog.getProductStatus'],
  'catalog.uploadFastListing: unknown barcode',
  async () => {
    const { trackingId } = await client.catalog.uploadFastListing([
      {
        merchant: MERCHANT_ID,
        merchantSku: nope,
        productName: 'Lonca E2E - Satılık Değildir',
        barcode: '0000000000017',
        price: '149,90',
        stock: '0',
      },
    ]);
    assert(trackingId, 'no trackingId');
    const status = await settleTracking(() => client.catalog.getProductStatus(trackingId));
    const row = status.rows?.[0] as {
      importStatus?: string;
      importMessages?: { message?: string }[];
    };
    assert(row?.importStatus === 'FAILED', `import ${json(status.rows)}`);
    return `tracking ${trackingId}: FAILED "${row.importMessages?.[0]?.message ?? '?'}"`;
  },
);
await check(
  ['catalog.deleteByMerchantSkuList', 'catalog.getDeleteProcess'],
  'catalog.deleteByMerchantSkuList: unknown SKU',
  async () => {
    const { trackingId } = await client.catalog.deleteByMerchantSkuList([{ merchantSku: nope }]);
    assert(trackingId, 'no trackingId');
    const status = await settleTracking(() => client.catalog.getDeleteProcess(trackingId));
    return `tracking ${trackingId}: ${json(status.rows?.[0] ?? status.raw, 160)}`;
  },
);
await check('catalog.checkProductStatus', 'catalog.checkProductStatus: unknown SKU', async () => {
  const result = await client.catalog.checkProductStatus([
    { merchant: MERCHANT_ID, merchantSkuList: [nope] },
  ]);
  const raw = result.raw as { success?: boolean; data?: unknown[] };
  assert(raw.success === true && Array.isArray(raw.data), json(raw));
  return `success, ${raw.data.length} rows`;
});
await check('catalog.approvePreMatch', 'catalog.approvePreMatch: unknown SKU', async () => {
  const result = await client.catalog.approvePreMatch([
    { merchant: MERCHANT_ID, merchantSkuList: [nope] },
  ]);
  return `accepted (${json(result.raw ?? null, 60)}); no pre-match for this SKU, so nothing changed`;
});
await check('catalog.rejectPreMatch', 'catalog.rejectPreMatch: unknown SKU', async () => {
  const result = await client.catalog.rejectPreMatch([
    { merchant: MERCHANT_ID, merchantSkuList: [nope] },
  ]);
  return `accepted (${json(result.raw ?? null, 60)}); no pre-match for this SKU, so nothing changed`;
});
await check(
  ['productUpdates.importUpdates', 'productUpdates.getUpdateStatus'],
  'productUpdates.importUpdates: unknown hbSku',
  async () => {
    const { trackingId } = await client.productUpdates.importUpdates([
      { hbSku: 'HBV00000NOPE1', productName: 'Lonca E2E - Satılık Değildir' },
    ]);
    assert(trackingId, 'no trackingId');
    let status = await client.productUpdates.getUpdateStatus(trackingId);
    for (let i = 0; i < 20 && status.success !== false && !status.rows?.length; i++) {
      await sleep(3000);
      status = await client.productUpdates.getUpdateStatus(trackingId);
    }
    return `tracking ${trackingId}: success ${status.success}, code ${status.code}, "${status.message ?? json(status.rows?.[0], 80)}"`;
  },
);

// ── Questions ───────────────────────────────────────────────────────────────

await check('questions.getCountByStatus', 'questions.getCountByStatus', async () => {
  const counts = await client.questions.getCountByStatus();
  assert(counts.byStatus && typeof counts.byStatus === 'object', json(counts));
  return json(counts.byStatus, 120);
});
const seeded: string[] = [];
await check('questions.create', 'questions.create: seed two questions', async () => {
  for (let i = 0; i < 2; i++) {
    const result = await client.questions.create({ issueCount: 1 });
    const numbers = result.raw as unknown[];
    assert(Array.isArray(numbers) && numbers.length === 1, json(result.raw));
    seeded.push(String(numbers[0]));
    await sleep(SPACING_MS);
  }
  return `seeded ${seeded.join(', ')}`;
});
await check('questions.list', 'questions.list: WaitingForAnswer', async () => {
  const rows = await client.questions.list({ status: 'WaitingForAnswer', page: 0, size: 50 });
  const found = seeded.filter((n) => rows.some((q) => String(q.issueNumber) === n));
  return `${rows.length} questions, ${found.length}/${seeded.length} seeded ones listed`;
});
if (seeded.length === 2) {
  const [toAnswer, toReject] = seeded as [string, string];
  await check('questions.get', `questions.get: ${toAnswer}`, async () => {
    const question = await client.questions.get(toAnswer);
    assert(String(question.issueNumber) === toAnswer, json(question, 120));
    return `status ${question.status}, ${question.conversations?.length ?? 0} conversation(s)`;
  });
  // Reject first: on SIT, answering one seeded question has also answered the
  // other one (seen 2026-10-14), which then can no longer be rejected.
  await check(['questions.reject', 'questions.get'], `questions.reject: ${toReject}`, async () => {
    const before = await client.questions.get(toReject);
    assert(before.status === 'WaitingForAnswer', `status before ${before.status}`);
    await client.questions.reject(toReject, {
      rejectReason: 'Lonca SDK uçtan uca testi: soru ürünle ilgili değil.',
    });
    await sleep(SPACING_MS);
    const question = await client.questions.get(toReject);
    assert(question.status === 'Rejected', `status ${question.status}`);
    return 'read back Rejected';
  });
  await check(['questions.answer', 'questions.get'], `questions.answer: ${toAnswer}`, async () => {
    await client.questions.answer(toAnswer, { Answer: 'Lonca SDK uçtan uca test cevabı.' });
    await sleep(SPACING_MS);
    const question = await client.questions.get(toAnswer);
    assert(question.status === 'Answered', `status ${question.status}`);
    return 'read back Answered';
  });
  await check('questions.answer', `questions.answer: ${toAnswer} again`, () =>
    refused(() => client.questions.answer(toAnswer, { Answer: 'Lonca SDK ikinci cevap.' })),
  );
  await check('questions.reject', `questions.reject: ${toAnswer} (answered)`, () =>
    refused(() =>
      client.questions.reject(toAnswer, { rejectReason: 'Lonca SDK uçtan uca testi.' }),
    ),
  );
} else {
  for (const method of ['questions.get', 'questions.answer', 'questions.reject']) {
    skip(method, 'no seeded questions');
  }
}
await check('questions.get', 'questions.get: unknown number', () =>
  refused(() => client.questions.get('1')),
);

// ── Orders: reads ───────────────────────────────────────────────────────────

const window = {
  beginDate: ymdhm(new Date(today.getTime() - 30 * DAY_MS)),
  endDate: ymdhm(new Date(today.getTime() + DAY_MS)),
};
for (const [method, call] of [
  ['orders.list', () => client.orders.list({ ...window, limit: 10 })],
  ['orders.listCancelled', () => client.orders.listCancelled({ limit: 10 })],
  ['orders.listPaymentAwaiting', () => client.orders.listPaymentAwaiting({ limit: 10 })],
  ['orders.listShippedPackages', () => client.orders.listShippedPackages({ limit: 10 })],
  ['orders.listDeliveredPackages', () => client.orders.listDeliveredPackages({ limit: 10 })],
  ['orders.listUndeliveredPackages', () => client.orders.listUndeliveredPackages({ limit: 10 })],
  ['orders.listUnpackedPackages', () => client.orders.listUnpackedPackages({ limit: 10 })],
  [
    'orders.listMissingInvoicePackages',
    () => client.orders.listMissingInvoicePackages({ limit: 10 }),
  ],
] as const) {
  await check(method, `${method}: limit 10`, async () => {
    const page = (await call()) as {
      totalCount: number;
      items: { packageNumber?: string; orderNumber?: string; raw: Record<string, unknown> }[];
    };
    assert(page.items.length <= 10 && page.totalCount >= page.items.length, json(page));
    if (method.endsWith('Packages')) {
      assert(
        page.items.every((p) => p.packageNumber),
        `package without packageNumber: ${json(page.items[0]?.raw)}`,
      );
    } else {
      assert(
        page.items.every((o) => o.orderNumber),
        `order without orderNumber: ${json(page.items[0]?.raw)}`,
      );
    }
    return `${page.items.length} of ${page.totalCount}`;
  });
}
await check('orders.getByOrderNumber', 'orders.getByOrderNumber: unknown', () =>
  refused(() => client.orders.getByOrderNumber('1')),
);

// ── Orders: a test order and its package ───────────────────────────────────

const orderNumber = String(1_000_000_000 + Math.floor(Math.random() * 8_999_999_999));
let lineId: string | undefined;
let packageNumber: string | undefined;
await check(
  ['testOrders.create', 'orders.getByOrderNumber'],
  `testOrders.create: ${orderNumber}`,
  async () => {
    await client.testOrders.create({
      OrderNumber: orderNumber,
      OrderDate: new Date().toISOString(),
      Customer: { CustomerId: randomUUID(), Name: 'Lonca Test' },
      DeliveryAddress: {
        AddressId: 'a1',
        Name: 'Lonca Test',
        AddressDetail: 'Test adresi',
        Email: 'test@zanaat.dev',
        CountryCode: 'TR',
        PhoneNumber: '5555555555',
        Town: 'Bornova',
        District: 'Bornova',
        City: 'İzmir',
      },
      LineItems: [
        {
          Sku: HB_SKU,
          MerchantId: MERCHANT_ID,
          Quantity: 2,
          Price: { Amount: 11, Currency: 'TRY' },
          Vat: 0,
          TotalPrice: { Amount: 22, Currency: 'TRY' },
          CargoCompanyId: 89100,
        },
      ],
    });
    for (let attempt = 0; attempt < 15; attempt++) {
      await sleep(3000);
      try {
        const order = await client.orders.getByOrderNumber(orderNumber);
        const items = order.raw.items as { id?: string; status?: string }[] | undefined;
        assert(order.orderNumber === orderNumber && items?.[0]?.id, json(order.raw));
        lineId = items[0].id;
        return `found after ${(attempt + 1) * 3} s, line status ${items[0].status}`;
      } catch (error) {
        if (!(error instanceof NotFoundError)) throw error;
      }
    }
    throw new CheckFailed('order not found after 45 s');
  },
);
if (lineId) {
  await check('orders.listPackages', 'orders.listPackages: find the test package', async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const packages = await client.orders.listPackages({ limit: 100 });
      assert(
        packages.every((p) => p.packageNumber),
        'package without packageNumber',
      );
      const pkg = packages.find((p) =>
        (p.raw.items as { lineItemId?: string }[] | undefined)?.some(
          (i) => i.lineItemId === lineId,
        ),
      );
      if (pkg) {
        packageNumber = pkg.packageNumber;
        return `${packages.length} packages, ours ${packageNumber} (${pkg.status})`;
      }
      await sleep(3000);
    }
    throw new CheckFailed('the stub did not package the test order');
  });
}

if (lineId && packageNumber) {
  const line = lineId;
  const pkg = packageNumber;
  /**
   * Stub packages have no delivery record: this 500 comes after body
   * validation. Package action dates are RFC 3339 with a zone; any other
   * spelling is a `400 "Bad Request <body>"`.
   */
  const noDelivery: RefusalRules = {
    server: /DeliveryNotFound|DeliveryClientNotFound/,
    validation: false,
  };

  await check('orders.getPackage', `orders.getPackage: ${pkg}`, async () => {
    const found = await client.orders.getPackage(pkg);
    assert(found.packageNumber === pkg, `packageNumber ${found.packageNumber}`);
    return `status ${found.status}, cargo ${found.cargoCompany}`;
  });
  await check('orders.getPackageLabel', `orders.getPackageLabel: ${pkg}`, () =>
    refused(() => client.orders.getPackageLabel(pkg)),
  );
  let cargoCode: string | undefined;
  await check(
    'orders.getChangeableCargoCompaniesForPackage',
    `orders.getChangeableCargoCompaniesForPackage: ${pkg}`,
    async () => {
      const options = await client.orders.getChangeableCargoCompaniesForPackage(pkg);
      assert(options.length > 0 && options.every((o) => o.code && o.name), json(options[0]));
      cargoCode = options.find((o) => o.code === 'YK')?.code ?? options[0]!.code;
      return `${options.length} options (${options.map((o) => o.code).join(', ')})`;
    },
  );
  await check(
    'orders.getChangeableCargoCompaniesForLineItem',
    'orders.getChangeableCargoCompaniesForLineItem',
    async () => {
      const options = await client.orders.getChangeableCargoCompaniesForLineItem(line);
      assert(options.length > 0 && options.every((o) => o.code && o.name), json(options[0]));
      return `${options.length} options`;
    },
  );
  await check(
    'orders.getPackageableLineItems',
    'orders.getPackageableLineItems: packaged line',
    () => refused(() => client.orders.getPackageableLineItems(line)),
  );
  await check('orders.createPackages', 'orders.createPackages: line already packaged', () =>
    refused(() => client.orders.createPackages({ lineItemRequests: [{ id: line, quantity: 2 }] }), {
      validation: false,
    }),
  );
  await check('orders.splitPackage', `orders.splitPackage: ${pkg} into 1 + 1`, () =>
    refused(
      () =>
        client.orders.splitPackage(pkg, {
          packageDetails: [
            { lines: [{ orderLineId: line, quantity: 1 }] },
            { lines: [{ orderLineId: line, quantity: 1 }] },
          ],
        }),
      noDelivery,
    ),
  );
  await check(
    'orders.updatePackageCargoCompany',
    `orders.updatePackageCargoCompany: ${cargoCode}`,
    () =>
      refused(
        () =>
          client.orders.updatePackageCargoCompany(pkg, {
            CargoCompanyShortName: cargoCode ?? 'YK',
          }),
        noDelivery,
      ),
  );
  await check(
    'orders.updateLineItemCargoCompany',
    `orders.updateLineItemCargoCompany: ${cargoCode}`,
    () =>
      refused(
        () =>
          client.orders.updateLineItemCargoCompany(line, {
            CargoCompanyShortName: cargoCode ?? 'YK',
          }),
        noDelivery,
      ),
  );
  await check('orders.markPackageInTransit', 'orders.markPackageInTransit', () =>
    refused(
      () =>
        client.orders.markPackageInTransit(pkg, {
          trackingNumber: `LONCA${Date.now()}`,
          trackingUrl: 'https://example.com/track',
          shippedDate: today.toISOString(),
          estimatedArrivalDate: new Date(today.getTime() + 2 * DAY_MS).toISOString(),
          deci: 1,
        }),
      noDelivery,
    ),
  );
  await check('orders.markPackageDelivered', 'orders.markPackageDelivered', () =>
    refused(
      () =>
        client.orders.markPackageDelivered(pkg, {
          receivedBy: 'Lonca Test',
          receivedDate: today.toISOString(),
        }),
      noDelivery,
    ),
  );
  // Hepsiburada documents no list of undelivered reasons, and every value tried
  // on SIT (AddressNotFound, AddressIncorrect, CustomerNotAtAddress, …) is
  // refused as "incorrect undeliveredReason value". That refusal still shows the
  // field name is read; set HB_E2E_UNDELIVERED_REASON to try a known value.
  const undeliveredReason = process.env.HB_E2E_UNDELIVERED_REASON ?? 'AddressNotFound';
  await check(
    'orders.markPackageUndelivered',
    `orders.markPackageUndelivered: reason ${undeliveredReason}`,
    () =>
      refused(
        () =>
          client.orders.markPackageUndelivered(pkg, {
            undeliveredReason,
            undeliveredDate: today.toISOString(),
          }),
        { ...noDelivery, validation: /incorrect +undeliveredReason value/ },
      ),
  );
  await check('orders.updateParcelInfo', 'orders.updateParcelInfo: stub cargo', () =>
    refused(() => client.orders.updateParcelInfo(pkg, { totalDesi: 2, totalParcel: 1 })),
  );
  await check('orders.updatePackageWarehouse', 'orders.updatePackageWarehouse: not HepsiJet', () =>
    refused(() => client.orders.updatePackageWarehouse(pkg, { shippingAddressLabel: 'BIRINCIL' })),
  );
  await check(
    'orders.updateLineItemLaborCost',
    'orders.updateLineItemLaborCost: untagged line',
    () => refused(() => client.orders.updateLineItemLaborCost(line, { unitLaborCost: 1 })),
  );
  await check('orders.cancelLineItem', 'orders.cancelLineItem: packaged line', () =>
    refused(() => client.orders.cancelLineItem(line, { reasonId: 1 }), { validation: false }),
  );
  await check('orders.sendInvoiceLink', `orders.sendInvoiceLink: ${pkg}`, async () => {
    const result = await client.orders.sendInvoiceLink(pkg, {
      invoices: [
        {
          orderNumber,
          invoiceLink: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
          contentType: 'pdf',
          serialNumber: 'LNC',
          rowNumber: String(Date.now() % 1_000_000_000),
          arrangementDate: ymd(today),
        },
      ],
    });
    return `accepted (${json(result.raw ?? null, 60)})`;
  });
  await check('orders.sendInvoiceLink', `orders.sendInvoiceLink: ${pkg} again`, () =>
    refused(() =>
      client.orders.sendInvoiceLink(pkg, {
        invoiceLink: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        serialNumber: 'LNC',
        arrangementDate: ymd(today),
      }),
    ),
  );
  // Last: an unpack, should it ever succeed, takes the package away.
  await check('orders.unpackPackage', `orders.unpackPackage: ${pkg}`, () =>
    refused(() => client.orders.unpackPackage(pkg), noDelivery),
  );
} else {
  for (const method of [
    'orders.getPackage',
    'orders.getPackageLabel',
    'orders.getChangeableCargoCompaniesForPackage',
    'orders.getChangeableCargoCompaniesForLineItem',
    'orders.getPackageableLineItems',
    'orders.createPackages',
    'orders.splitPackage',
    'orders.updatePackageCargoCompany',
    'orders.updateLineItemCargoCompany',
    'orders.markPackageInTransit',
    'orders.markPackageDelivered',
    'orders.markPackageUndelivered',
    'orders.updateParcelInfo',
    'orders.updatePackageWarehouse',
    'orders.updateLineItemLaborCost',
    'orders.cancelLineItem',
    'orders.sendInvoiceLink',
    'orders.unpackPackage',
  ]) {
    skip(method, 'no test package');
  }
}

// ── Claims ──────────────────────────────────────────────────────────────────

let awaitingClaim: string | undefined;
await check('claims.list', 'claims.list: limit 50', async () => {
  const claims = await client.claims.list({ limit: 50 });
  assert(
    claims.every((c) => c.claimNumber && c.status),
    `claim without claimNumber/status: ${json(claims[0]?.raw)}`,
  );
  awaitingClaim = claims.find((c) => c.status === 'AwaitingAction')?.claimNumber;
  return `${claims.length} claims (${[...new Set(claims.map((c) => c.status))].join(', ') || '-'})`;
});
await check('claims.listByStatus', 'claims.listByStatus: AwaitingAction', async () => {
  const claims = await client.claims.listByStatus('AwaitingAction', { limit: 50 });
  assert(
    claims.every((c) => c.status === 'AwaitingAction' && c.claimNumber),
    json(claims[0]),
  );
  return `${claims.length} claims`;
});
await check('claims.listByStatus', 'claims.listByStatus: unknown status', () =>
  refused(() => client.claims.listByStatus('Open', { limit: 10 })),
);
if (lineId) {
  const line = lineId;
  await check('claims.create', `claims.create: test order ${orderNumber}`, async () => {
    const result = await client.claims.create({
      orderNumber,
      lineItemId: line,
      quantity: 1,
      type: 'Return',
      explanation: 'Lonca SDK uçtan uca testi',
    });
    const created = (result.raw as { ClaimList?: { claimNumber?: string }[] }).ClaimList?.[0];
    if (created?.claimNumber && /^\d+$/.test(created.claimNumber)) {
      return `claim ${created.claimNumber} created`;
    }
    // The stub answers 200 and puts its failure in place of the claim number.
    return { outcome: 'refused', note: `200, ClaimList: ${json(created, 120)}` };
  });
} else {
  skip('claims.create', 'no test order line');
}
const unknownClaim = { server: /GetClaimByNumberNotFoundError/ } as const;
await check('claims.accept', 'claims.accept: unknown claim', () =>
  refused(() => client.claims.accept('000000001'), unknownClaim),
);
await check('claims.reject', 'claims.reject: unknown claim', () =>
  refused(() => client.claims.reject('000000001'), unknownClaim),
);
await check('claims.preApprovalConfirm', 'claims.preApprovalConfirm: unknown claim', () =>
  refused(() => client.claims.preApprovalConfirm('000000001'), unknownClaim),
);
if (awaitingClaim) {
  const claimNumber = awaitingClaim;
  await check(
    'claims.preApprovalConfirm',
    `claims.preApprovalConfirm: ${claimNumber}, no reason`,
    () => refused(() => client.claims.preApprovalConfirm(claimNumber, {})),
  );
}

// ── Report ──────────────────────────────────────────────────────────────────

const reached = new Set(checks.filter((c) => c.outcome !== 'skip').flatMap((c) => c.methods));
const byMethod = (outcome: Outcome) =>
  new Set(checks.filter((c) => c.outcome === outcome).flatMap((c) => c.methods));
const failed = checks.filter((c) => c.outcome === 'FAIL');
const successPath = [...byMethod('ok')].sort();
const refusalOnly = [...byMethod('refused')].filter((m) => !successPath.includes(m)).sort();
say(`
${checks.length} checks, ${failed.length} failed
methods reached: ${reached.size}/${METHODS.length}
success path verified: ${successPath.length} (${successPath.join(', ')})
refusal only: ${refusalOnly.length} (${refusalOnly.join(', ')})
not reached: ${METHODS.filter((m) => !reached.has(m)).join(', ') || '-'}
left on SIT: test order ${orderNumber}${packageNumber ? `, package ${packageNumber}` : ''}${seeded.length ? `, questions ${seeded.join(', ')}` : ''}`);
process.exit(failed.length > 0 ? 1 : 0);
