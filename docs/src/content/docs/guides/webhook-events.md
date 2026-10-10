---
title: Webhook events
description: How Trendyol and Hepsiburada deliver async events, and how the SDK helpers parse them.
---

Both marketplaces deliver async events via webhooks, but the **delivery models differ** — Trendyol is body-discriminated, Hepsiburada is endpoint-per-event. The SDKs ship a parser for each.

## Trendyol — single endpoint, body-discriminated

You register **one** URL with Trendyol. Every event lands at that URL; the JSON body contains the discriminator.

```ts
import express from 'express';
import { parseWebhookEvent } from '@lonca/trendyol';

const app = express();
app.use(express.json());

app.post('/ty/webhook', (req, res) => {
  // Returns { packages, pageInfo, raw }
  const { packages } = parseWebhookEvent(req.body);

  for (const pkg of packages) {
    console.log(pkg.shipmentPackageId, pkg.status, pkg.createdBy);
  }
  res.status(200).end();
});
```

The parser:

- Validates the JSON shape (throws `ValidationError` on bad input)
- Normalizes each shipment package via the same path used by `client.orders.list()`
- Surfaces a `WebhookEventStatus` union (`CREATED | PICKING | INVOICED | SHIPPED | DELIVERED | UNDELIVERED | RETURNED | CANCELLED | UNPACKED | UNSUPPLIED | AT_COLLECTION_POINT | VERIFIED`) plus `PackageCreatedBy` (`order-creation | cancel | split | transfer`)

See [Trendyol guide](/guides/trendyol/) for context and [API Reference](/api/readme/) for the exact `WebhookEvent` type.

## Hepsiburada — endpoint-per-event

You register **one base URL** with Hepsiburada. Hepsiburada `PUT`s to `<baseUrl>/<eventName>` — one route per event, 12 events total.

```ts
import express from 'express';
import {
  parseHepsiburadaWebhookEvent,
  ORDER_WEBHOOK_EVENTS,
  CLAIM_WEBHOOK_EVENTS,
  type HepsiburadaWebhookEvent,
} from '@lonca/hepsiburada';

const app = express();
app.use(express.json());

const allEvents: readonly HepsiburadaWebhookEvent[] = [
  ...ORDER_WEBHOOK_EVENTS,
  ...CLAIM_WEBHOOK_EVENTS,
];

for (const event of allEvents) {
  app.put(`/hb/${event}`, (req, res) => {
    const { body } = parseHepsiburadaWebhookEvent(event, req.body);
    handle(event, body);
    res.status(204).end();
  });
}

function handle(event: HepsiburadaWebhookEvent, body: Record<string, unknown>) {
  // Exhaustive switch — TypeScript will warn if a new event is added
  switch (event) {
    case 'createOrder':
      /* new paid order */ break;
    case 'createPackages':
      /* Hepsiburada packaged your items */ break;
    case 'orderCancel':
      /* buyer cancelled */ break;
    case 'unpack':
      /* package unpacked */ break;
    case 'intransit':
      /* handed to cargo */ break;
    case 'deliver':
      /* delivered */ break;
    case 'undeliver':
      /* delivery failed */ break;
    case 'changeShippingAddressOrder':
      /* address updated */ break;
    case 'awaitingAction':
      /* claim needs accept/reject */ break;
    case 'awaitingPreApproval':
      /* pre-approval flow */ break;
    case 'disputedClaimResult':
      /* disputed-claim decision */ break;
    case 'packageFromClaimResult':
      /* return package from approval */ break;
  }
}
```

The parser:

- Validates the event name is one of the documented 12 (throws `ValidationError` otherwise)
- Accepts a JSON string or already-parsed object
- Returns `{ event, body, raw }` — `body` is `Record<string, unknown>` because Hepsiburada documents field sets in HTML tables; the SDK keeps `body` loose and exposes the raw payload verbatim

## Shared contract notes

Both marketplaces expect:

- **2xx response** within a few seconds (5s for Hepsiburada, 30s for Trendyol)
- **Idempotent receiver** — both retry on non-2xx responses

If you're behind a reverse proxy (nginx, Cloudflare, IIS), make sure `PUT` is allowed (IIS disables it by default).

## See also

- [API Reference → @lonca/trendyol → `parseWebhookEvent`](/api/readme/)
- [API Reference → @lonca/hepsiburada → `parseHepsiburadaWebhookEvent`](/api/readme/)
- [Trendyol guide](/guides/trendyol/) and [Hepsiburada guide](/guides/hepsiburada/) for the surrounding flow
