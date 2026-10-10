---
title: Authentication
description: How each SDK authenticates against its marketplace.
---

Each marketplace uses a different auth scheme. The SDK handles the headers and signing for you — you just supply the credentials at client construction.

## Trendyol

HTTP Basic Auth + a custom `User-Agent`.

```ts
import { createTrendyolClient } from '@lonca/trendyol';

const client = createTrendyolClient({
  sellerId: 12345, // numeric supplier ID
  apiKey: process.env.TY_API_KEY!, // from Partner Panel → Account Info → Integration Information
  apiSecret: process.env.TY_API_SECRET!, // same place — only master users can see these
  env: 'prod', // 'prod' (no IP whitelist) or 'stage' (IP whitelist required)
  integratorName: 'MyCompany', // sent in User-Agent
});
```

Get credentials from the [Trendyol Partner Panel](https://partner.trendyol.com) → Account Info → Integration Information. Only the master user account can view them.

## Hepsiburada

HTTP Basic Auth + a **required** `User-Agent`.

```ts
import { createHepsiburadaClient } from '@lonca/hepsiburada';

const client = createHepsiburadaClient({
  merchantId: process.env.HB_MERCHANT_ID!, // UUID-shaped
  username: process.env.HB_API_USER!, // from Merchant Portal → Settings → Integrations
  password: process.env.HB_API_PASS!,
  env: 'sit', // 'sit' (sandbox) or 'prod'
  integratorName: 'MyCompany', // bare name; Hepsiburada rejects requests without UA
});
```

Get credentials from the [Hepsiburada Merchant Portal](https://merchant.hepsiburada.com) → Settings → Integrations.

:::caution[User-Agent matters]
The `integratorName` you pass is sent as the `User-Agent`, and Hepsiburada is strict about it:

- It must be the **integrator name registered in your Merchant Portal**. Production sits behind a bot manager that rejects an unrecognized `User-Agent` with **`401` / `403`** — a wrong name fails every call. (SIT is more lenient, which can mask the problem.)
- Use a recognizable bare slug (e.g. your company name). **Do not** include the merchant ID — `0.1.0` / `0.2.0` did this and returned 401 on every call.
  :::

## Client options

Besides the credentials, both factories accept the same optional settings:

| Option      | Default        | What it does                                                                                                                 |
| ----------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `timeoutMs` | `30_000`       | Per-request timeout in milliseconds.                                                                                         |
| `logger`    | no-op          | A `Logger` from `@lonca/core` — e.g. `consoleLogger()` — for structured request logs.                                        |
| `fetch`     | global `fetch` | Custom `fetch` implementation: add a proxy agent, record traffic, or inject a mock in tests. _Since 1.1.0._                  |
| `clientIp`  | `'127.0.0.1'`  | **Trendyol only.** IPv4 address sent as `x-clientip`; Trendyol requires the header but does not check it against the origin. |

```ts
import { consoleLogger } from '@lonca/core';
import { createTrendyolClient } from '@lonca/trendyol';

const client = createTrendyolClient({
  sellerId: 12345,
  apiKey: process.env.TY_API_KEY!,
  apiSecret: process.env.TY_API_SECRET!,
  env: 'prod',
  integratorName: 'MyCompany',
  timeoutMs: 60_000,
  logger: consoleLogger({ service: 'catalog-sync' }),
  fetch: (input, init) => fetch(input, init), // e.g. wrap to add tracing
});
```

## Environment variables (recommended)

Both clients accept secret strings directly, but storing them in `.env` is the typical pattern. The repo's [`examples/`](https://github.com/zanaat-dev/lonca/tree/main/examples) folder shows two read-only smoke scripts you can run against your credentials to verify everything works end-to-end.

```bash
# .env
TY_API_KEY=...
TY_API_SECRET=...
TY_SELLER_ID=...

HB_MERCHANT_ID=...
HB_API_USER=...
HB_API_PASS=...
HB_ENV=sit
HB_INTEGRATOR_NAME=MyCompany

# In your project, then:
pnpm try:trendyol
pnpm try:hepsiburada
```

## Error handling

All authentication failures surface as `AuthError` from `@lonca/core`:

```ts
import { AuthError } from '@lonca/core';

try {
  await client.listings.list({ offset: 0, limit: 100 });
} catch (err) {
  if (err instanceof AuthError) {
    console.error('Credentials rejected:', err.message);
  } else {
    throw err;
  }
}
```

See the [`@lonca/core` API reference](/api/) for the full error hierarchy.
