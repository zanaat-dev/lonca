#!/usr/bin/env -S pnpm exec tsx
/**
 * Order and return writes on one of our own paid test orders in n11's test
 * store, one step at a time (n11 moves the order between steps: `Delivered`
 * is set by n11 on request, returns are opened by the buyer).
 *
 *   pnpm e2e:n11:orders -- --order <orderNumber> --step inspect
 *   pnpm e2e:n11:orders -- --order <orderNumber> --step approve
 *   pnpm e2e:n11:orders -- --order <orderNumber> --step split-lines
 *   pnpm e2e:n11:orders -- --order <orderNumber> --step split-quantity
 *   pnpm e2e:n11:orders -- --order <orderNumber> --step cancel-item
 *   pnpm e2e:n11:orders -- --order <orderNumber> --step collection
 *   pnpm e2e:n11:orders -- --order <orderNumber> --step labor-cost
 *   pnpm e2e:n11:orders -- --order <orderNumber> --step invoice-link
 *   pnpm e2e:n11:orders -- --order <orderNumber> --step returns
 *   pnpm e2e:n11:orders -- --order <orderNumber> --step returns --postpone <claimId>
 *   pnpm e2e:n11:orders -- --order <orderNumber> --step returns --approve <claimId>
 *   pnpm e2e:n11:orders -- --order <orderNumber> --step returns --deny <claimId>
 *
 * The order the steps are written for: LONCA-ORDER-1 x3 + LONCA-ORDER-2 x2 in
 * one package, plus test-test001 x1 (the silver product n11 opened for us on
 * the `horozTest` template, so it ships in its own Horoz Lojistik package).
 * `split-lines` gives one package per product; `split-quantity` turns the x3
 * package into x1 + x1 and cancels 1 (`UnSupplied`); `cancel-item` cancels 1
 * of the x2 LONCA-ORDER-2 line over SOAP; `collection` asks Horoz to collect
 * the test-test001 package; `labor-cost` puts a labour cost on its line.
 *
 * Guards: the key must belong to the test store, and every line of the order
 * must be one of our test products (`LONCA-ORDER-*`, test-test001), so other
 * developers' orders on the shared store are never touched. Every write is
 * followed by a read-back.
 */
import { LoncaError } from '@lonca/core';
import {
  createN11Client,
  type N11Client,
  type N11Environment,
  type N11ShipmentPackage,
} from '@lonca/n11';
import { parseArgs } from 'node:util';

const SPACING_MS = 1500;
const OUR_SKU = /^(LONCA-ORDER-\d+|test-test001)$/;
const SPLIT_SKU = 'LONCA-ORDER-1';
const CANCEL_SKU = 'LONCA-ORDER-2';
/** n11's test product in a labour-cost category (1104101 Gümüş Aksesuar), shipped by Horoz. */
const HOROZ_SKU = 'test-test001';
/** 61 "Stokta Kalmayan Ürün", valid for both the REST split-cancel and SOAP partial cancel. */
const CANCEL_REASON = 61;
/** A long-lived public test PDF (W3C); n11 only stores the link. */
const INVOICE_URL = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';

const STEPS = [
  'inspect',
  'approve',
  'split-lines',
  'split-quantity',
  'cancel-item',
  'collection',
  'labor-cost',
  'invoice-link',
  'returns',
] as const;
type Step = (typeof STEPS)[number];

const { values: args } = parseArgs({
  // pnpm forwards the `--` separator.
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    order: { type: 'string' },
    step: { type: 'string', default: 'inspect' },
    approve: { type: 'string' },
    deny: { type: 'string' },
    postpone: { type: 'string' },
  },
});
const step = args.step as Step;
if (!args.order || !STEPS.includes(step)) {
  console.error(`usage: --order <orderNumber> --step <${STEPS.join('|')}>`);
  process.exit(2);
}
const orderNumber = args.order;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`missing ${name}; run with --env-file=.env.n11-test`);
    process.exit(2);
  }
  return value;
}

function fail(message: string): never {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

function describeError(error: unknown): string {
  if (error instanceof LoncaError) {
    const issue = error.issues[0]?.message;
    return `${error.constructor.name}${error.status ? ` ${error.status}` : ''}: ${issue ?? error.message}`;
  }
  return error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error);
}

const client: N11Client = createN11Client({
  appKey: required('N11_APP_KEY'),
  appSecret: required('N11_APP_SECRET'),
  env: (process.env.N11_ENV ?? 'prod') as N11Environment,
  integratorName: process.env.N11_INTEGRATOR_NAME ?? 'LoncaDev',
});

// ── Guards ──────────────────────────────────────────────────────────────────
{
  const expectedSeller = process.env.N11_E2E_SELLER ?? 'testtmagazaa';
  const first = (await client.products.list({ limit: 1, sender: 'ALL' })).items[0];
  const seller = first?.raw.sellerNickname;
  if (seller !== expectedSeller) {
    console.error(`refusing to run: the key belongs to seller ${JSON.stringify(seller)}`);
    process.exit(2);
  }
}

async function packages(): Promise<N11ShipmentPackage[]> {
  await sleep(SPACING_MS);
  const page = await client.orders.list({ orderNumber, limit: 100 });
  if (page.items.length === 0) fail(`order ${orderNumber} not found`);
  const foreign = page.items
    .flatMap((p) => p.lines)
    .filter((l) => !OUR_SKU.test(l.stockCode ?? ''));
  if (foreign.length > 0) {
    console.error(`refusing to run: order ${orderNumber} has lines that are not ours`);
    process.exit(2);
  }
  return page.items;
}

function show(label: string, pkgs: N11ShipmentPackage[]): void {
  console.log(`\n${label}`);
  for (const p of pkgs) {
    const lines = p.lines.map(
      (l) => `${l.stockCode} x${l.quantity} (line ${l.lineId}, ${l.status})`,
    );
    console.log(`  package ${p.id} ${p.status}: ${lines.join('; ')}`);
  }
}

function linesOf(pkgs: N11ShipmentPackage[], sku: string) {
  return pkgs
    .flatMap((p) => p.lines.map((line) => ({ pkg: p, line })))
    .filter((x) => x.line.stockCode === sku);
}

async function write(name: string, run: () => Promise<unknown>): Promise<void> {
  await sleep(SPACING_MS);
  try {
    const result = await run();
    console.log(`ok      ${name}${result === undefined ? '' : ` — ${JSON.stringify(result)}`}`);
  } catch (error) {
    fail(`${name} — ${describeError(error)}`);
  }
}

// ── Steps ───────────────────────────────────────────────────────────────────
const before = await packages();
show(`order ${orderNumber}, before`, before);

switch (step) {
  case 'inspect':
    break;

  case 'approve': {
    const created = before.flatMap((p) => p.lines).filter((l) => l.status === 'Created');
    if (created.length === 0) fail('no Created line (the store approved the order already)');
    await write('orders.approve', () => client.orders.approve(created.map((l) => l.lineId)));
    break;
  }

  case 'split-lines': {
    const pkg = before.find((p) => p.status === 'Picking' && p.lines.length >= 2);
    if (!pkg) fail('no Picking package with two or more lines');
    await write('orders.splitPackage', () =>
      client.orders.splitPackage(pkg.lines.map((l) => [l.lineId])),
    );
    break;
  }

  case 'split-quantity': {
    const target = linesOf(before, SPLIT_SKU).find(
      (x) => x.pkg.status === 'Picking' && x.pkg.lines.length === 1 && x.line.quantity >= 3,
    );
    if (!target) fail(`no single-line Picking package with ${SPLIT_SKU} x3 or more`);
    const { lineId, quantity } = target.line;
    await write('orders.splitPackageByQuantity (with a 1-item cancel)', () =>
      client.orders.splitPackageByQuantity({
        packages: [[{ lineId, quantity: 1 }], [{ lineId, quantity: quantity - 2 }]],
        cancel: [{ lineId, quantity: 1, reasonId: CANCEL_REASON }],
      }),
    );
    break;
  }

  case 'cancel-item': {
    const target = linesOf(before, CANCEL_SKU).find(
      (x) => x.pkg.status === 'Picking' && x.line.quantity >= 2,
    );
    if (!target) fail(`no Picking line of ${CANCEL_SKU} with quantity 2 or more`);
    await write('orders.cancelItem (1 item)', () =>
      client.orders.cancelItem({
        lineId: target.line.lineId,
        quantity: 1,
        reasonId: CANCEL_REASON,
        description: 'Lonca SDK test: partial cancel',
      }),
    );
    await sleep(SPACING_MS);
    const cancels = await client.claims.listCancels({
      searchInfoType: 'ORDERID',
      searchQuery: orderNumber,
    });
    console.log(
      `claims.listCancels for the order: ${cancels.items.map((c) => `${c.id}:${c.status}`).join(', ') || 'none'}`,
    );
    break;
  }

  case 'collection': {
    const pkg = linesOf(before, HOROZ_SKU).find((x) => x.pkg.status === 'Picking')?.pkg;
    if (!pkg) fail(`no Picking package with ${HOROZ_SKU}`);
    await write('orders.createCollectionRequest (Horoz)', () =>
      client.orders.createCollectionRequest(
        pkg.lines.map((l) => ({
          packageId: pkg.id,
          lineId: l.lineId,
          boxQuantity: 1,
          desi: 1,
          shipmentCompany: 'HLZ',
        })),
      ),
    );
    break;
  }

  case 'labor-cost': {
    const target = linesOf(before, HOROZ_SKU)[0];
    if (!target) fail(`no line of ${HOROZ_SKU}`);
    const lines = await (async () => {
      await sleep(SPACING_MS);
      try {
        return await client.orders.updateLaborCosts([
          { lineId: target.line.lineId, amountExcludingVat: 5 },
        ]);
      } catch (error) {
        fail(`orders.updateLaborCosts — ${describeError(error)}`);
      }
    })();
    console.log(`orders.updateLaborCosts — ${JSON.stringify(lines)}`);
    if (!lines.every((l) => l.status === 'SUCCESS')) fail('a line was not accepted');
    const after = linesOf(await packages(), HOROZ_SKU)[0];
    console.log(
      `read-back laborCostExcludingVat: ${JSON.stringify(after?.line.laborCostExcludingVat)}`,
    );
    break;
  }

  case 'invoice-link':
    await write('orders.sendInvoiceLink', () =>
      client.orders.sendInvoiceLink({ orderNumber, url: INVOICE_URL }),
    );
    break;

  case 'returns': {
    await sleep(SPACING_MS);
    const claims = await client.claims.listReturns({
      status: 'ALL',
      searchInfoType: 'ORDERID',
      searchQuery: orderNumber,
    });
    console.log(
      `\nreturn claims: ${claims.items.map((c) => `${c.id}:${c.status} x${c.quantity ?? '?'}`).join(', ') || 'none'}`,
    );
    if (args.postpone) {
      await sleep(SPACING_MS);
      const reason = (await client.claims.getReturnPendingReasons())[0];
      if (!reason) fail('no pending reasons');
      await write(`claims.postponeReturn ${args.postpone} (${reason.value})`, () =>
        client.claims.postponeReturn({
          claimReturnId: args.postpone!,
          pendingReasonId: reason.id,
          days: 3,
          note: 'Lonca SDK test: postponed',
        }),
      );
    }
    if (args.approve) {
      await write(`claims.approveReturn ${args.approve}`, () =>
        client.claims.approveReturn(args.approve!),
      );
    }
    if (args.deny) {
      await sleep(SPACING_MS);
      const reason = (await client.claims.getReturnDenyReasons()).find((r) => r.id === '1');
      if (!reason) fail('deny reason 1 ("Ürün kargoya sağlam teslim edildi") not offered');
      await write(`claims.denyReturn ${args.deny} (${reason.value})`, () =>
        client.claims.denyReturn({
          claimReturnId: args.deny!,
          denyReasonId: reason.id,
          note: 'Lonca SDK test: denied',
          returnShipmentType: 'CAMPAIGN',
        }),
      );
    }
    if (args.postpone || args.approve || args.deny) {
      await sleep(SPACING_MS);
      const after = await client.claims.listReturns({
        status: 'ALL',
        searchInfoType: 'ORDERID',
        searchQuery: orderNumber,
      });
      console.log(
        `return claims after: ${after.items.map((c) => `${c.id}:${c.status}`).join(', ')}`,
      );
    }
    break;
  }
}

if (step !== 'inspect' && step !== 'returns') show('after', await packages());
