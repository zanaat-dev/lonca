<p align="center">
  <img src="https://raw.githubusercontent.com/zanaat-dev/lonca/main/brand/logomark.svg" alt="Lonca" height="48">
</p>

# Lonca

[![CI](https://github.com/zanaat-dev/lonca/actions/workflows/ci.yml/badge.svg)](https://github.com/zanaat-dev/lonca/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@lonca/core.svg?label=%40lonca%2Fcore)](https://www.npmjs.com/package/@lonca/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/node/v/@lonca/core.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/maintained%20with-pnpm-cc00ff.svg)](https://pnpm.io/)

**Typed TypeScript SDKs for Turkish e-commerce marketplaces.** Trendyol and Hepsiburada today, n11 next.

```bash
npm i @lonca/trendyol @lonca/core
```

```ts
import { createTrendyolClient } from '@lonca/trendyol';
import { paginate } from '@lonca/core';

const trendyol = createTrendyolClient({
  sellerId: 12345,
  apiKey: process.env.TRENDYOL_API_KEY!,
  apiSecret: process.env.TRENDYOL_API_SECRET!,
  env: 'prod', // or 'stage'
  integratorName: 'SelfIntegration', // or your company name
});

// Every new order, across all pages, fully typed.
for await (const pkg of paginate((p) => trendyol.orders.list({ ...p, status: 'Created' }))) {
  console.log(pkg.orderNumber, pkg.status, pkg.lines.length);
}
```

- **Full API surface.** Trendyol: 14 resources, ~70 methods. Hepsiburada: 12 resources, 95 methods. Webhook parsing included.
- **Production-checked.** Read-only contract probes compare live responses with the SDK types and the [OpenAPI specs](specs/), so we notice when a marketplace changes its API.
- **Batteries included.** Typed errors (`AuthError`, `RateLimitError`, …), retries, rate limiting and pagination helpers from `@lonca/core`.
- **Stable and MIT-licensed.** All three packages are 1.x; breaking changes ship only in major versions ([policy](https://lonca.zanaat.dev/stability/)).

📚 [Docs](https://lonca.zanaat.dev) · ⏱️ [Trendyol in 30 minutes](https://lonca.zanaat.dev/guides/trendyol-in-30-minutes/) · 💬 [Discussions](https://github.com/zanaat-dev/lonca/discussions) · 🎃 [Good first issues](https://github.com/zanaat-dev/lonca/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)

> [!IMPORTANT]
> **Unofficial & independent.** Lonca is a community-maintained project. It is **not** an official SDK and is not affiliated with, endorsed by, or supported by Trendyol, Hepsiburada, or any other marketplace named here. All product names, logos, and trademarks are the property of their respective owners.

## Table of contents

- [Vision](#vision)
- [Why?](#why)
- [Packages](#packages)
- [Quick start](#quick-start)
- [Development](#development)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## Vision

Three-stage roadmap:

1. **SDK + OpenAPI Spec Collection** — Type-safe TypeScript SDKs and curated OpenAPI specs for Turkish marketplaces (current stage)
2. **API Drift Detection** — A monitoring layer that proactively detects breaking changes in marketplace APIs. v1 runs locally: the contract probes record the raw wire shapes of live read calls and [`pnpm drift`](packages/drift/) compares them with the documented schemas in [`specs/`](specs/); [`pnpm drift:types`](packages/drift/README.md#sdk-types-vs-specs) checks the SDKs' own TypeScript response types against the same schemas on every CI run (warn-only)
3. **Unified Marketplace API Gateway** — A Plaid-style abstraction that puts every marketplace behind a single API

Next marketplaces:

- **n11** — _in progress._ Category, product and order reads (REST) and question, claim and shipping reads (SOAP) are verified against production in [`sdks/n11/`](sdks/n11/). Not published to npm yet; write operations come next.
- **Amazon TR, Pazarama, Çiçeksepeti** — planned.

## Why?

Turkish e-commerce marketplace APIs are fragmented, under-documented, and constantly shifting. Every e-commerce developer ends up rewriting the same integration code from scratch. Existing solutions are either closed-source vendor-locked (IdeaSoft, T-Soft) or simply don't support Turkish marketplaces (Zapier, Make, n8n).

Lonca aims to fill this gap with a community-maintained open standard.

## Packages

| Package              | Description                                                                         | Status                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `@lonca/core`        | Shared types, error hierarchy, retry / logger / rate-limiter                        | [![npm](https://img.shields.io/npm/v/@lonca/core.svg)](https://www.npmjs.com/package/@lonca/core)               |
| `@lonca/trendyol`    | Trendyol Marketplace SDK — full surface (14 resources, ~70 methods, webhook helper) | [![npm](https://img.shields.io/npm/v/@lonca/trendyol.svg)](https://www.npmjs.com/package/@lonca/trendyol)       |
| `@lonca/hepsiburada` | Hepsiburada Marketplace SDK — full dev-portal coverage (12 resources, 95 methods)   | [![npm](https://img.shields.io/npm/v/@lonca/hepsiburada.svg)](https://www.npmjs.com/package/@lonca/hepsiburada) |

📄 **OpenAPI specs**: [`specs/`](specs/) — curated per-service OpenAPI 3.0 documents for Hepsiburada (7 files, 67 operations) and Trendyol ([`specs/trendyol/`](specs/trendyol/): 13 files, 95 operations, covering every endpoint `@lonca/trendyol` calls). Both are captured from the marketplaces' developer portals and redistributed under the marketplaces' copyright. See [`specs/README.md`](specs/README.md).

📚 **Docs & API reference**: [lonca.zanaat.dev](https://lonca.zanaat.dev/) — guides, end-to-end flows, and full TypeDoc API reference. Built with [Astro Starlight](https://starlight.astro.build), regenerated on each push to `main`.

Need an SDK for another marketplace? Open a [marketplace request](https://github.com/zanaat-dev/lonca/issues/new?template=marketplace_request.yml).

## Quick start

### Trendyol (live)

```bash
pnpm add @lonca/trendyol @lonca/core
```

```ts
import { createTrendyolClient } from '@lonca/trendyol';
import { paginate } from '@lonca/core';

const client = createTrendyolClient({
  sellerId: 12345,
  apiKey: process.env.TRENDYOL_API_KEY!,
  apiSecret: process.env.TRENDYOL_API_SECRET!,
  env: 'prod', // or 'stage'
  integratorName: 'SelfIntegration', // or your company name
});

// Iterate every product page-by-page.
for await (const product of paginate((p) => client.products.list(p))) {
  for (const variant of product.variants) {
    console.log(variant.barcode, product.title);
  }
}
```

See [`sdks/trendyol/README.md`](./sdks/trendyol/README.md) for the full surface (brands · categories · suppliers · products read+write+lifecycle · inventory · orders read+write+split+cargo+ops+returns · claims · webhooks + `parseWebhookEvent` · questions · invoices · finance · labels · testOrders · locations) and end-to-end walkthroughs for product creation, webhook handling, returns/claims, and settlement reconciliation.

### Shared primitives

```bash
pnpm add @lonca/core
```

```ts
import { money, paginate, retry, RateLimitError, TokenBucketRateLimiter } from '@lonca/core';

const price = money(12550, 'TRY'); // 125.50 TRY (integer minor units)
const limiter = new TokenBucketRateLimiter({ capacity: 50, intervalMs: 60_000 });

await retry(
  async () => {
    await limiter.acquire();
    // ...call a marketplace API
  },
  { maxAttempts: 5 },
);
```

See [`packages/core/README.md`](./packages/core/README.md) for the full surface.

## Development

Requirements:

- Node.js >= 22 (active LTS) — pinned to `24` via `.nvmrc`
- pnpm >= 10 ([Corepack](https://nodejs.org/api/corepack.html) recommended)

```bash
git clone https://github.com/zanaat-dev/lonca.git
cd lonca
pnpm install
```

Common commands:

```bash
pnpm typecheck      # TypeScript
pnpm lint           # ESLint
pnpm format         # Prettier (write)
pnpm test           # Vitest
pnpm build          # Build all packages via Turborepo
pnpm dev            # Parallel watch across packages
```

Work on a single package:

```bash
pnpm --filter @lonca/core test
```

Live contract probes (read-only, credentials from `.env` — see [`.env.example`](./.env.example)):

```bash
pnpm probe          # call the main read endpoints, write key-set/type snapshots to probe-snapshots/
pnpm probe:check    # compare a fresh run with the committed snapshots; exit 1 on drift
pnpm drift          # compare the committed wire shapes with specs/ (offline); exit 1 on breaking drift
pnpm drift:types    # compare the SDKs' TypeScript response types with specs/ (offline, warn-only; also in CI)
```

Findings that are understood and accepted (the marketplace's docs are wrong and the SDK copes)
are listed with a reason in
[`probe-snapshots/known-discrepancies.json`](./probe-snapshots/known-discrepancies.json) and
reported as `accepted` instead of failing the run.

These run locally (before releases: `pnpm probe && pnpm drift`). Marketplace credentials are not
stored as GitHub secrets, so [`contract-probe.yml`](./.github/workflows/contract-probe.yml) is
manual-only and skips without them. Details in [`scripts/probe/README.md`](./scripts/probe/README.md)
and [`packages/drift/README.md`](./packages/drift/README.md).

## Contributing

Pull requests are welcome. Start with [CONTRIBUTING.md](./CONTRIBUTING.md) and our [Code of Conduct](./CODE_OF_CONDUCT.md). For larger changes, open a [Discussion](https://github.com/zanaat-dev/lonca/discussions) first.

## Security

**Do not file public issues for security vulnerabilities.** Follow the disclosure process in [SECURITY.md](./SECURITY.md).

## License

MIT — see [LICENSE](./LICENSE).
