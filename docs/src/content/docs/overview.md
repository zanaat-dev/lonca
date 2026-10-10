---
title: Overview
description: What Lonca is, what's inside, and how the SDKs are organized.
---

**Lonca** is an open-source collection of TypeScript SDKs for Turkish marketplaces — built so a single TypeScript codebase can integrate with Trendyol, Hepsiburada, and (eventually) every other major Turkish marketplace through a uniform, type-safe surface.

:::caution[Unofficial & independent]
Lonca is a community-maintained project. These are **not** official SDKs and are not affiliated with, endorsed by, or supported by Trendyol, Hepsiburada, or any other marketplace. All product names and trademarks belong to their respective owners.
:::

## The problem

If you sell on more than one Turkish marketplace, you've probably written something like this:

- A custom HTTP client per marketplace
- Hand-rolled retry & rate limiting
- Loose typing because the marketplace's docs ship as HTML tables
- Re-discovery of host-specific quirks (case sensitivity, undocumented enums, …) months after launch

There's no widely-adopted open standard. Marketplaces sometimes ship official SDKs but they're often Java/.NET-only, partial, or untyped. Lonca aims to fill this gap with a community-maintained open standard.

## What's inside

| Package                                                                  | What it does                                                                                                                                                                     |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@lonca/core`](https://www.npmjs.com/package/@lonca/core)               | Shared primitives — error hierarchy (`AuthError`, `RateLimitError`, …), retry with exponential backoff, token-bucket rate limiter, structured logger, cursor pagination helpers. |
| [`@lonca/trendyol`](https://www.npmjs.com/package/@lonca/trendyol)       | Trendyol Marketplace SDK — 14 resources, ~70 methods, webhook event parser.                                                                                                      |
| [`@lonca/hepsiburada`](https://www.npmjs.com/package/@lonca/hepsiburada) | Hepsiburada Marketplace SDK — 12 resources, 95 methods, webhook event parser. Full developer-portal coverage.                                                                    |

## Design principles

- **Live-verified**. Every endpoint is typed from a real sandbox response, not just an OpenAPI spec. The Hepsiburada SDK was built by probing SIT directly and recording the wire shape per surface.
- **Spec-faithful**. Method signatures mirror the published paths / parameters / body shapes. We document the quirks instead of papering over them — see for example the [per-host casing matrix](/guides/hepsiburada/#casing-quirks).
- **No magic**. Plain `fetch`, plain TypeScript. No code generation, no opaque proxy classes. You can read the SDK source and find the exact URL each method builds.
- **Forward-compatible**. Every returned row carries a `raw: Record<string, unknown>` escape hatch — undocumented fields stay accessible without an SDK release.

## Where to start

1. Read the [Installation](/installation/) page.
2. Configure [Authentication](/authentication/) for the marketplace you target.
3. Skim the per-SDK guide ([Trendyol](/guides/trendyol/) or [Hepsiburada](/guides/hepsiburada/)) for end-to-end usage flows.
4. Use the [API Reference](/api/) sidebar for method-by-method detail.
