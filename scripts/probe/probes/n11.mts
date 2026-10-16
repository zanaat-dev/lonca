/**
 * n11 read-only probes. The REST probes are GETs; the SOAP probes are `POST`s
 * by protocol but only call read operations (`Get*`, `*List`, reason-type
 * lists, settlements, cities) — approved by the maintainer on 2026-10-10,
 * the settlement and city reads on 2026-10-16. The set never touches
 * the product tasks, order updates, question answers or claim actions. n11
 * documents no sandbox, so these run against prod.
 */
import { createN11Client, type N11Client, type N11Environment } from '@lonca/n11';
import type { ProbeSet } from '../registry.mts';

const DAY_MS = 24 * 60 * 60 * 1000;

function env(): N11Environment {
  return (process.env.N11_ENV ?? 'prod') as N11Environment;
}

/** Depth-first search for the first leaf of the category tree. */
function firstLeaf(
  nodes: Awaited<ReturnType<N11Client['categories']['list']>>,
): string | undefined {
  for (const node of nodes) {
    if (node.leaf) return node.id;
    const leaf = firstLeaf(node.subCategories);
    if (leaf) return leaf;
  }
  return undefined;
}

export const n11Probes: ProbeSet<N11Client> = {
  marketplace: 'n11',
  requiredEnv: ['N11_APP_KEY', 'N11_APP_SECRET'],
  envLabel: env,
  createClient: (fetch) =>
    createN11Client({
      appKey: process.env.N11_APP_KEY!,
      appSecret: process.env.N11_APP_SECRET!,
      env: env(),
      integratorName: process.env.N11_INTEGRATOR_NAME ?? 'LoncaProbe',
      fetch,
    }),
  probes: [
    { name: 'categories.list', call: (c) => c.categories.list() },
    {
      name: 'categories.getAttributes',
      call: async (c) => {
        // Prefer the category of a listed product (its attributes carry values);
        // fall back to the first leaf of the tree for an account with no products.
        const page = await c.products.list({ limit: 1 });
        const categoryId = page.items[0]?.categoryId || firstLeaf(await c.categories.list());
        if (!categoryId) throw new Error('no leaf category to inspect');
        return c.categories.getAttributes(categoryId);
      },
    },
    { name: 'products.list', call: (c) => c.products.list({ limit: 10 }) },
    { name: 'orders.list', call: (c) => c.orders.list({ limit: 10 }) },
    // SOAP reads (POST envelopes, read operations only).
    { name: 'shipping.getShipmentCompanies', call: (c) => c.shipping.getShipmentCompanies() },
    { name: 'claims.listReturns(ALL)', call: (c) => c.claims.listReturns({ status: 'ALL' }) },
    { name: 'claims.listCancels(ALL)', call: (c) => c.claims.listCancels({ status: 'ALL' }) },
    { name: 'claims.getReturnDenyReasons', call: (c) => c.claims.getReturnDenyReasons() },
    { name: 'claims.getReturnPendingReasons', call: (c) => c.claims.getReturnPendingReasons() },
    { name: 'claims.getCancelDenyReasons', call: (c) => c.claims.getCancelDenyReasons() },
    {
      name: 'finance.listSettlements(last 60d) → getSettlementDetail',
      call: async (c) => {
        const end = new Date();
        const page = await c.finance.listSettlements({
          startDate: new Date(end.getTime() - 60 * DAY_MS),
          endDate: end,
          limit: 10,
        });
        const day = page.items[0]?.settlementDate;
        return {
          page,
          detail: day ? await c.finance.getSettlementDetail(day, { limit: 5 }) : undefined,
        };
      },
    },
    {
      name: 'locations.getCities → getDistricts(34) → getNeighborhoods',
      call: async (c) => {
        const cities = await c.locations.getCities();
        const districts = await c.locations.getDistricts(34);
        const first = districts[0];
        return {
          cities,
          districts,
          neighborhoods: first ? await c.locations.getNeighborhoods(first.id) : undefined,
        };
      },
    },
    {
      // n11 allows one question listing per minute; this is the set's only list call.
      name: 'questions.list(CLOSED, last 30d) → get',
      call: async (c) => {
        const end = new Date();
        const page = await c.questions.list({
          startDate: new Date(end.getTime() - 30 * DAY_MS),
          endDate: end,
          status: 'CLOSED',
          limit: 5,
        });
        const first = page.items[0];
        return { page, detail: first ? await c.questions.get(first.id) : undefined };
      },
    },
  ],
};
