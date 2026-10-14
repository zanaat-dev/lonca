/** Trendyol request samples, checked against `specs/trendyol`. */
import { createTrendyolClient, type TrendyolClient } from '@lonca/trendyol';
import type { RequestSet } from './registry.mts';

export const trendyolRequests: RequestSet<TrendyolClient> = {
  marketplace: 'trendyol',
  createClient: (fetch) =>
    createTrendyolClient({
      sellerId: 123456,
      apiKey: 'key',
      apiSecret: 'secret',
      env: 'prod',
      integratorName: 'LoncaCheck',
      fetch,
    }),
  calls: [
    {
      name: 'inventory.update',
      call: (c) =>
        c.inventory.update([
          { barcode: '8690000000001', quantity: 3, salePrice: 149.9, listPrice: 199 },
        ]),
    },
  ],
};
