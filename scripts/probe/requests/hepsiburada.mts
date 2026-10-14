/** Hepsiburada request samples, checked against `specs/hepsiburada`. */
import { createHepsiburadaClient, type HepsiburadaClient } from '@lonca/hepsiburada';
import type { RequestSet } from './registry.mts';

export const hepsiburadaRequests: RequestSet<HepsiburadaClient> = {
  marketplace: 'hepsiburada',
  createClient: (fetch) =>
    createHepsiburadaClient({
      merchantId: 'b73989dc-970c-4b27-88a0-0c11e87cbb5e',
      username: 'user',
      password: 'pass',
      env: 'sit',
      integratorName: 'LoncaCheck',
      fetch,
    }),
  calls: [
    {
      name: 'productUpdates.importUpdates',
      call: (c) =>
        c.productUpdates.importUpdates([
          { hbSku: 'HBV00000ABC12', productName: 'Yeni ad', attributes: { renk: 'Siyah' } },
        ]),
    },
    {
      name: 'catalog.uploadProductViaFile',
      call: (c) =>
        c.catalog.uploadProductViaFile([
          { categoryId: 18021982, attributes: { merchantSku: 'SKU-1', UrunAdi: 'Örnek' } },
        ]),
    },
    {
      name: 'questions.answer',
      call: (c) => c.questions.answer('1082059', { Answer: 'Stokta var.' }),
    },
  ],
};
