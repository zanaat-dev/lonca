/**
 * Response and request shapes seen on Hepsiburada SIT during the end-to-end
 * run (`pnpm e2e:hepsiburada`, 2026-10-14). Every value is invented; the key
 * names and nesting are the wire's.
 */
import { describe, expect, it, vi } from 'vitest';
import { TokenBucketRateLimiter } from '@lonca/core';
import { CategoriesResource } from '../resources/categories.js';
import { ClaimsResource } from '../resources/claims.js';
import { OrdersResource } from '../resources/orders.js';
import { ShippingResource } from '../resources/shipping.js';
import type { HepsiburadaTransport } from '../transport.js';

function mockTransport(response: unknown = undefined) {
  return {
    merchantId: 'M-sit',
    request: vi.fn().mockResolvedValue(response),
  } as unknown as HepsiburadaTransport;
}
const fastLimiter = () => new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 1 });

describe('claims list rows', () => {
  const row = {
    id: 'c0000000-0000-0000-0000-000000000001',
    number: '060600001',
    status: 'AwaitingAction',
    claimType: 'Return',
    claimDate: '2024-10-28T12:37:51.12',
    orderNumber: '0400000001',
    lineItemId: 'l0000000-0000-0000-0000-000000000001',
  };

  it('reads claimNumber from `number` and createdAt from `claimDate`', async () => {
    const claims = new ClaimsResource(mockTransport([row]), fastLimiter());
    const [listed] = await claims.list();
    expect(listed).toEqual({
      claimNumber: '060600001',
      status: 'AwaitingAction',
      createdAt: '2024-10-28T12:37:51.12',
      raw: row,
    });
    const [byStatus] = await claims.listByStatus('AwaitingAction');
    expect(byStatus?.claimNumber).toBe('060600001');
  });

  it('still prefers claimNumber / createdAt when a row carries them', async () => {
    const claims = new ClaimsResource(
      mockTransport([{ ...row, claimNumber: 'C-1', createdAt: '2026-01-01T00:00:00' }]),
      fastLimiter(),
    );
    const [listed] = await claims.list();
    expect(listed).toMatchObject({ claimNumber: 'C-1', createdAt: '2026-01-01T00:00:00' });
  });
});

describe('categories.getAttributeValues', () => {
  it('reads the bare [{ id, value }] array the wire sends', async () => {
    const rows = [
      { id: '18624', value: 'Deri' },
      { id: '0000WKVL', value: 'Silikon/Plastik' },
    ];
    const values = await new CategoriesResource(
      mockTransport(rows),
      fastLimiter(),
    ).getAttributeValues(60000001, 'malzeme');
    expect(values).toEqual([
      { id: '18624', name: 'Deri', raw: rows[0] },
      { id: '0000WKVL', name: 'Silikon/Plastik', raw: rows[1] },
    ]);
  });
});

describe('orders package reads', () => {
  const r = (t: HepsiburadaTransport) => new OrdersResource(t, fastLimiter());

  it('maps the PascalCase PackageNumber / OrderNumber of the delivered list', async () => {
    const row = {
      Id: 'd0000000-0000-0000-0000-000000000001',
      Barcode: '88850000000001',
      PackageNumber: '5000000001',
      OrderNumber: '4100000001',
      OrderNumbers: ['4100000001'],
      MerchantId: 'M-sit',
      DeliveredDate: '2024-10-23T23:43:28',
      EtgbNo: '',
      HasInvoice: false,
    };
    const page = await r(
      mockTransport({ totalCount: 1, limit: 10, offset: 0, pageCount: 1, items: [row] }),
    ).listDeliveredPackages({ limit: 10 });
    expect(page.items[0]).toEqual({
      packageNumber: '5000000001',
      orderNumber: '4100000001',
      raw: row,
    });
  });

  it('getPackage unwraps the one-element array the wire sends', async () => {
    const row = {
      packageNumber: '5000000002',
      status: 'Open',
      cargoCompany: 'Mağaza Hesabı',
      trackingInfoCode: '',
      barcode: '88850000000002',
      deci: 0,
    };
    const pkg = await r(mockTransport([row])).getPackage('5000000002');
    expect(pkg).toEqual({
      packageNumber: '5000000002',
      status: 'Open',
      cargoCompany: 'Mağaza Hesabı',
      raw: row,
    });
  });

  it('getPackage still reads a plain object', async () => {
    const pkg = await r(mockTransport({ packageNumber: '5000000003' })).getPackage('5000000003');
    expect(pkg.packageNumber).toBe('5000000003');
  });

  it('changeable cargo companies map ShortName to code and Name to name', async () => {
    const row = {
      Id: 1,
      Name: 'Yurtiçi Kargo',
      ShortName: 'YK',
      LogoUrl: 'https://example.com/yk.svg',
      IsActive: true,
      MinDeci: 0,
      MaxDeci: 0,
    };
    const byPackage = await r(mockTransport([row])).getChangeableCargoCompaniesForPackage('5000');
    expect(byPackage).toEqual([{ code: 'YK', name: 'Yurtiçi Kargo', raw: row }]);
    const byLine = await r(
      mockTransport([{ id: 2, name: 'Aras Kargo', shortName: 'AR' }]),
    ).getChangeableCargoCompaniesForLineItem('L1');
    expect(byLine[0]).toMatchObject({ code: 'AR', name: 'Aras Kargo' });
  });
});

describe('shipping profiles', () => {
  const r = (t: HepsiburadaTransport) => new ShippingResource(t, fastLimiter());

  it('listProfiles reads the profile name from `name`', async () => {
    const row = {
      name: 'DefaultProfile',
      createdAt: '2024-10-25 10:09:51',
      updatedAt: '2024-10-28 11:48:05',
      id: 'p0000000-0000-0000-0000-000000000001',
    };
    const [profile] = await r(mockTransport({ profiles: [row] })).listProfiles();
    expect(profile).toEqual({ profileName: 'DefaultProfile', raw: row });
  });

  it('createProfile and updateProfile send the merchant id in the body', async () => {
    const transport = mockTransport({ success: true, data: 'p1', error: null });
    await r(transport).createProfile({ name: 'Express' });
    await r(transport).updateProfile({ id: 'p1', name: 'Express 2' });
    const bodies = vi.mocked(transport.request).mock.calls.map(([opts]) => opts.body);
    expect(bodies).toEqual([
      { merchantId: 'M-sit', name: 'Express' },
      { merchantId: 'M-sit', id: 'p1', name: 'Express 2' },
    ]);
  });

  it('a caller-supplied merchantId wins', async () => {
    const transport = mockTransport({ success: true });
    await r(transport).createProfile({ merchantId: 'M-other', name: 'X' });
    expect(vi.mocked(transport.request).mock.calls[0]![0].body).toEqual({
      merchantId: 'M-other',
      name: 'X',
    });
  });
});
