/**
 * Response and request shapes seen on Hepsiburada SIT during the end-to-end
 * run (`pnpm e2e:hepsiburada`, 2026-10-14) and the follow-up checks of #270
 * (2026-10-27). Every value is invented; the key names and nesting are the
 * wire's (the label response is the spec's `BarcodeData`; SIT could not
 * produce one).
 */
import { describe, expect, it, vi } from 'vitest';
import { TokenBucketRateLimiter, ValidationError } from '@lonca/core';
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

  it('maps the PascalCase PackageNumber / OrderNumber / HasInvoice of the delivered list', async () => {
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
      hasInvoice: false,
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

// ─── #270: findings settled on SIT, 2026-10-27 ────────────────────────────

describe('shipping.getCargoFirms label groups', () => {
  const r = (t: HepsiburadaTransport) => new ShippingResource(t, fastLimiter());
  const hepsiJet = {
    cargoFirmId: 21,
    cargoFirmName: 'HepsiJet',
    cargoFirmDisplayOrder: 1,
    isExceptional: false,
    isVisible: false,
  };
  const aras = {
    ...hepsiJet,
    cargoFirmId: 2,
    cargoFirmName: 'Aras Kargo',
    cargoFirmDisplayOrder: 2,
  };
  const body = {
    cargoFirms: [
      {
        labelId: 2,
        labelName: 'LowDeci',
        labelDisplayName: 'Düşük Desili Kargo Firmaları',
        labelDisplayOrder: 1,
        cargoFirms: [aras, hepsiJet],
      },
      {
        labelId: 3,
        labelName: 'SpecialDelivery',
        labelDisplayName: 'Randevulu Teslimat',
        labelDisplayOrder: 6,
        cargoFirms: [hepsiJet],
      },
    ],
    error: false,
    msg: null,
  };

  it('returns one row per firm and label, with the label fields', async () => {
    const firms = await r(mockTransport(body)).getCargoFirms();
    expect(firms).toEqual([
      {
        id: 2,
        name: 'Aras Kargo',
        labelId: 2,
        labelName: 'LowDeci',
        labelDisplayName: 'Düşük Desili Kargo Firmaları',
        raw: aras,
      },
      {
        id: 21,
        name: 'HepsiJet',
        labelId: 2,
        labelName: 'LowDeci',
        labelDisplayName: 'Düşük Desili Kargo Firmaları',
        raw: hepsiJet,
      },
      {
        id: 21,
        name: 'HepsiJet',
        labelId: 3,
        labelName: 'SpecialDelivery',
        labelDisplayName: 'Randevulu Teslimat',
        raw: hepsiJet,
      },
    ]);
    expect(firms.every((f) => f.code === undefined)).toBe(true);
  });

  it('a label with no firms adds no rows', async () => {
    const firms = await r(
      mockTransport({ cargoFirms: [{ labelId: 9, labelName: 'Empty', cargoFirms: [] }] }),
    ).getCargoFirms();
    expect(firms).toEqual([]);
  });
});

describe('orders.getPackageLabel BarcodeData', () => {
  const r = (t: HepsiburadaTransport) => new OrdersResource(t, fastLimiter());

  it('maps the spec fields data / format / hasMerchantMutualBarcode', async () => {
    const wire = {
      data: ['^XA^FO50,50^FDLONCA^FS^XZ'],
      format: 'zpl',
      hasMerchantMutualBarcode: true,
    };
    const label = await r(mockTransport(wire)).getPackageLabel('5000000001');
    expect(label).toEqual({
      data: ['^XA^FO50,50^FDLONCA^FS^XZ'],
      format: 'zpl',
      hasMerchantMutualBarcode: true,
      raw: wire,
    });
  });

  it('sends format as a query parameter only when given', async () => {
    const transport = mockTransport({});
    await r(transport).getPackageLabel('5000000001', { format: 'pdf' });
    await r(transport).getPackageLabel('5000000001');
    const [withFormat, without] = vi.mocked(transport.request).mock.calls.map(([o]) => o);
    expect(withFormat).toMatchObject({
      path: '/packages/merchantId/M-sit/packagenumber/5000000001/labels',
      query: { format: 'pdf' },
    });
    expect(without!.query).toBeUndefined();
  });
});

describe('orders package status dates', () => {
  const r = (t: HepsiburadaTransport) => new OrdersResource(t, fastLimiter());

  it('sends a Date as an RFC 3339 string and leaves strings alone', async () => {
    const transport = mockTransport();
    const when = new Date('2026-10-27T10:00:00Z');
    await r(transport).markPackageInTransit('5000', {
      trackingNumber: 'T1',
      shippedDate: when,
      estimatedArrivalDate: '2026-10-29T13:00:00+03:00',
    });
    await r(transport).markPackageDelivered('5000', { receivedBy: 'A', receivedDate: when });
    await r(transport).markPackageUndelivered('5000', {
      undeliveredReason: 'CustomerUnreachable',
      undeliveredDate: when,
    });
    const bodies = vi.mocked(transport.request).mock.calls.map(([o]) => o.body);
    expect(bodies).toEqual([
      {
        trackingNumber: 'T1',
        shippedDate: '2026-10-27T10:00:00.000Z',
        estimatedArrivalDate: '2026-10-29T13:00:00+03:00',
      },
      { receivedBy: 'A', receivedDate: '2026-10-27T10:00:00.000Z' },
      { undeliveredReason: 'CustomerUnreachable', undeliveredDate: '2026-10-27T10:00:00.000Z' },
    ]);
  });

  it('does not mutate the caller input', async () => {
    const input = { receivedDate: new Date('2026-10-27T10:00:00Z') };
    await r(mockTransport()).markPackageDelivered('5000', input);
    expect(input.receivedDate).toBeInstanceOf(Date);
  });

  it('refuses an invalid Date before sending', async () => {
    const transport = mockTransport();
    await expect(
      r(transport).markPackageDelivered('5000', { receivedDate: new Date('nope') }),
    ).rejects.toThrow(/receivedDate is an invalid Date/);
    expect(transport.request).not.toHaveBeenCalled();
  });
});

describe('claims actions and create', () => {
  const r = (t: HepsiburadaTransport) => new ClaimsResource(t, fastLimiter());

  it('preApprovalConfirm sends preApprovalReason ProductInvestigation by default', async () => {
    const transport = mockTransport();
    await r(transport).preApprovalConfirm('060600001');
    await r(transport).preApprovalConfirm('060600001', { confirmed: true });
    const bodies = vi.mocked(transport.request).mock.calls.map(([o]) => o.body);
    expect(bodies).toEqual([
      { preApprovalReason: 'ProductInvestigation' },
      { preApprovalReason: 'ProductInvestigation', confirmed: true },
    ]);
  });

  it("preApprovalConfirm keeps the caller's reason, in any casing", async () => {
    const transport = mockTransport();
    await r(transport).preApprovalConfirm('060600001', { preApprovalReason: 'Other' });
    await r(transport).preApprovalConfirm('060600001', { PreApprovalReason: 'Other' });
    const bodies = vi.mocked(transport.request).mock.calls.map(([o]) => o.body);
    expect(bodies).toEqual([{ preApprovalReason: 'Other' }, { PreApprovalReason: 'Other' }]);
  });

  it('reject refuses an empty body before sending, and sends a real one', async () => {
    const transport = mockTransport();
    await expect(r(transport).reject('060600001')).rejects.toThrow(/input is required/);
    await expect(r(transport).reject('060600001', {})).rejects.toThrow(/MerchantStatement/);
    expect(transport.request).not.toHaveBeenCalled();
    const body = { ClaimRejectionReason: 'CustomerReturnedWrongItem', MerchantStatement: 'x' };
    await r(transport).reject('060600001', body);
    expect(vi.mocked(transport.request).mock.calls[0]![0].body).toEqual(body);
  });

  it('create throws when the 200 body reports a failure in place of the claim number', async () => {
    const wire = {
      ClaimList: [{ claimNumber: 'Claim oluşturulamadı.', type: '', explanation: '' }],
    };
    const error = await r(mockTransport(wire))
      .create({ orderNumber: '0400000001', type: 'return', reason: 'ProductIsBroken' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({ status: 200, data: { body: wire } });
    expect((error as Error).message).toMatch(/did not create the claim: "Claim oluşturulamadı\."/);
  });

  it('create resolves when every entry carries a claim number', async () => {
    const wire = { ClaimList: [{ claimNumber: '060600002', type: 'Return', explanation: '' }] };
    await expect(
      r(mockTransport(wire)).create({ orderNumber: '0400000001', type: 'return' }),
    ).resolves.toEqual({ raw: wire });
  });

  it('create resolves when the body has no ClaimList to judge by', async () => {
    await expect(r(mockTransport({})).create({ orderNumber: '1' })).resolves.toEqual({ raw: {} });
  });
});
