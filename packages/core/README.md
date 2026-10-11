<p align="left">
  <img src="https://raw.githubusercontent.com/zanaat-dev/lonca/main/brand/logomark.svg" alt="Lonca" height="32">
</p>

# @lonca/core

Shared primitives for Lonca marketplace SDKs.

> Type-safe building blocks reused across every `@lonca/<marketplace>` SDK: money, errors, pagination, retry, logger, rate limiter.

> [!IMPORTANT]
> **Unofficial.** Part of Lonca, an independent, community-maintained project — not affiliated with, endorsed by, or supported by any marketplace. All marketplace names and trademarks belong to their respective owners.

See [Stability & versioning](https://lonca.zanaat.dev/stability/) for the semver policy and what counts as the public API.

## Install

```bash
pnpm add @lonca/core
```

## What's inside

| Primitive                 | Purpose                                                                                                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Money`, `Currency`       | ISO 4217 currency codes; integer minor-unit money representation; `moneyFromMajor`/`moneyToMajor` lira↔kuruş converters                                                                                                                    |
| `CursorPage`, `paginate`  | Cursor-based pagination + async iterator helper                                                                                                                                                                                            |
| `LoncaError` hierarchy    | Structured errors (`AuthError`, `RateLimitError`, `ValidationError`, `NotFoundError`, `ServerError`, `NetworkError`, `TimeoutError`) with `retryable` flag and a normalized `issues` array                                                 |
| `NormalizedOrderStatus`   | Closed cross-marketplace order-status vocabulary + `createStatusNormalizer` (surfaces unmapped statuses via `mapped: false`, never a silent default)                                                                                       |
| `MarketplaceCapabilities` | Cross-marketplace feature-flag contract each SDK's `*Capabilities` constant `satisfies`, so consumers feature-detect via `client.capabilities` with a key set that can't drift between SDKs                                                |
| `retry`                   | Exponential backoff with jitter, honors `retryAfterMs`, supports `AbortSignal`. `parseRetryAfter` parses `Retry-After`; `isRetryableIdempotentOnly` gates non-idempotent writes to 429-only replays                                        |
| `createRequester`         | Shared HTTP request lifecycle (rate-limit → fetch under a composed timeout → 204/error mapping → idempotency-aware retry → structured logging) that each SDK transport is built on; inject marketplace-specific URL/header/error-map seams |
| `Logger`                  | Structured logger interface (`debug`/`info`/`warn`/`error`/`child`) with `noopLogger` and `consoleLogger`                                                                                                                                  |
| `TokenBucketRateLimiter`  | Async token-bucket rate limiter with `AbortSignal` support                                                                                                                                                                                 |

## Design principles

- **Money is an integer in minor units** — `{ amount: 12550, currency: 'TRY' }` means 125.50 TRY. No floats, no surprises. Marketplace SDKs hand you raw major-unit numbers (e.g. `199.9` lira); wrap them once with `moneyFromMajor(price, TRY)` instead of a hand-rolled `Math.round(price * 100)`.
- **Cursor pagination over offset** — opaque cursors compose better with async iterators and stay stable as datasets grow.
- **Errors are typed and tagged** — `err.code` plus a `retryable` boolean tells retry helpers what to do without sniffing messages.
- **Logger is an interface, not an implementation** — wire your own (pino, winston, console). A no-op default is provided.

## Stability

`1.x` — stable. Breaking changes ship only in major versions; see [Stability & versioning](https://lonca.zanaat.dev/stability/).

## License

MIT
