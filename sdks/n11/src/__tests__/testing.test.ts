import { describe, expect, it } from 'vitest';
import { normalizeStatus, statusMap } from '../index.js';
import { createFakeN11Client, type FakeN11Request } from '../testing.js';

describe('createFakeN11Client', () => {
  it('answers unseeded REST and SOAP reads with empty results', async () => {
    const client = createFakeN11Client();
    expect((await client.products.list()).items).toEqual([]);
    expect((await client.orders.list()).items).toEqual([]);
    expect(await client.categories.list()).toEqual([]);
    expect((await client.categories.getAttributes('1000002')).attributes).toEqual([]);
    expect(await client.shipping.getShipmentCompanies()).toEqual([]);
    expect(
      (await client.questions.list({ startDate: '01/10/2026', endDate: '10/10/2026' })).items,
    ).toEqual([]);
  });

  it('queues product tasks and reports them processed by default', async () => {
    const client = createFakeN11Client();
    const task = await client.inventory.update([{ stockCode: 'SKU-1', quantity: 2 }]);
    expect(task.taskId).toBe('1');
    const details = await client.products.waitForTask(task.taskId);
    expect(details).toMatchObject({ taskId: '1', status: 'PROCESSED', items: [] });
    await expect(client.questions.answer('1', 'Evet')).resolves.toBeUndefined();
  });

  it('routes requests through the seed handler with parsed bodies and SOAP operation names', async () => {
    const seen: FakeN11Request[] = [];
    const client = createFakeN11Client({
      handler: (req) => {
        seen.push(req);
        if (req.path === '/ms/product-query') {
          return { content: [{ n11ProductId: 7, stockCode: 'SKU-7', title: 'Örnek' }] };
        }
        if (req.soapOperation === 'GetShipmentCompanies') {
          return '<result><status>success</status></result><shipmentCompanies><shipmentCompany><id>1</id><name>Örnek Kargo</name><shortName>OK</shortName></shipmentCompany></shipmentCompanies>';
        }
        return undefined;
      },
    });

    const page = await client.products.list({ stockCode: 'SKU-7' });
    expect(page.items[0]).toMatchObject({ id: '7', stockCode: 'SKU-7' });
    expect(seen[0]).toMatchObject({ method: 'GET', path: '/ms/product-query' });
    expect(seen[0]!.query.get('stockCode')).toBe('SKU-7');

    const companies = await client.shipping.getShipmentCompanies();
    expect(companies[0]).toMatchObject({ id: '1', name: 'Örnek Kargo' });
    expect(seen[1]).toMatchObject({ method: 'POST', soapOperation: 'GetShipmentCompanies' });
    expect(typeof seen[1]!.body).toBe('string');

    await client.products.delete(['SKU-7']);
    expect(seen[2]!.body).toEqual({
      payload: { integrator: 'fake', skus: [{ stockCode: 'SKU-7' }] },
    });
  });

  it('passes no body for a GET', async () => {
    const seen: FakeN11Request[] = [];
    const client = createFakeN11Client({ handler: (req) => void seen.push(req) });
    await client.orders.list();
    expect(seen[0]!.body).toBeUndefined();
  });
});

describe('normalizeStatus', () => {
  it('maps every documented package status', () => {
    expect(Object.keys(statusMap).sort()).toEqual(
      ['Cancelled', 'Created', 'Delivered', 'Picking', 'Shipped', 'UnSupplied', 'Unpacked'].sort(),
    );
    expect(normalizeStatus('Unpacked')).toEqual({
      normalized: 'picking',
      raw: 'Unpacked',
      mapped: true,
    });
    expect(normalizeStatus('UnSupplied').normalized).toBe('cancelled');
  });

  it('keeps an unknown status visible', () => {
    expect(normalizeStatus('Bogus')).toEqual({
      normalized: 'unknown',
      raw: 'Bogus',
      mapped: false,
    });
  });
});
