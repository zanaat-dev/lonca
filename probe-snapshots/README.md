# Probe snapshots

Committed structural baselines produced by [`scripts/probe/run.mts`](../scripts/probe/run.mts)
(`pnpm probe:prod`). Each `<marketplace>.json` holds, per probe, the response **shape** — key
sets and JSON types — and never a value. Format and drift rules are documented in
[`scripts/probe/README.md`](../scripts/probe/README.md).

| File               | Environment | Captured   | Result          | Wire baseline (`wire`)                                                         |
| ------------------ | ----------- | ---------- | --------------- | ------------------------------------------------------------------------------ |
| `hepsiburada.json` | prod        | 2026-10-10 | 15 ok / 0 error | 15 operations, 4 with no spec match                                            |
| `n11.json`         | prod        | 2026-10-10 | 11 ok / 0 error | 8 operations: 4 REST matched to `specs/n11/`, 4 SOAP `POST` reads with no spec |
| `trendyol.json`    | prod        | 2026-10-10 | 18 ok / 0 error | 17 operations (one `POST` read), all matched to `specs/`                       |

All baselines are taken against **production**. Every probe is a read-only GET, except the
Trendyol buybox `POST` read and n11's SOAP reads (SOAP is always `POST`). n11 has no sandbox at
all. The earlier
SIT (Hepsiburada) and stage-placeholder (Trendyol) captures are only in git history.

`known-discrepancies.json` is not a snapshot: it is the hand-maintained
[known-discrepancy overlay](../packages/drift/README.md#known-discrepancy-overlay) for
`pnpm drift` — findings against the committed baseline that are understood and accepted, each
with a reason. Seeded 2026-10-09 with the 11 then-breaking findings of the first prod baseline
(2 Trendyol docs-vs-prod contradictions the SDK already handles, 9 Hepsiburada `null`s on
properties the upstream spec does not mark `nullable`). With it, `pnpm drift` on this baseline
reports 0 breaking findings; the only warnings left are the 4 Hepsiburada endpoints `specs/`
does not document and n11's 4 SOAP endpoints (SOAP is out of scope for `specs/`).

`specs/n11/` was added on 2026-10-11, after this baseline was captured. The 5 n11 REST wire
entries (4 operations; `categories.getAttributes` also reads `product-query`) were then re-matched offline against the new specs with the same matcher the probe
runner records with (`buildOperationIndex` from `@lonca/drift`): only their `operation` field
changed, from a redacted unmatched path to the spec template, which is what the next
`pnpm probe:prod` records anyway. The shapes were not touched and no n11 endpoint was called.

## Regenerating

Keep `.env` on stage / SIT and put production credentials in a separate, gitignored
`.env.prod` (same variable names as [`.env.example`](../.env.example), with `TY_ENV=prod`,
`HB_ENV=prod` and the `N11_*` keys). Production is then only reached when that file is passed explicitly:

```bash
pnpm build
pnpm probe:prod    # = tsx --env-file=.env.prod scripts/probe/run.mts — rewrites every file
pnpm drift         # compare the wire shapes with specs/, review drift-output/report.md
```

After regenerating, check the report's **Stale overlay entries** section and drop entries that
no longer match anything.

Before committing, check that every file says `"env": "prod"` and every probe is `ok` — a plain
`pnpm probe` reads `.env` and would replace the prod baseline with stage / SIT shapes. Review the
diff: `wire` must contain only spec path templates or `{}`-redacted paths, key names and JSON
types. Shapes are sample-dependent: a list that happens to be empty (e.g. no webhooks, no open
questions) records no item shape. Since roadmap 4.0a the update path keeps the element shape
the committed file already had at such a position, marked `"itemsFromBaseline": true` (see
[`scripts/probe/README.md`](../scripts/probe/README.md#empty-samples-itemsfrombaseline)); a
key that disappears is still a removal.

The 2026-10-09 baseline predates that: `webhooks.list` (Trendyol) and `questions.list`
(Hepsiburada) were empty on that run, so their element shapes are not in these files. They
come back on the first prod run in which those lists are non-empty, and are kept from then on.

## Notes

### Trendyol stage is IP-allowlisted

Trendyol `stage` sits behind a Cloudflare IP allowlist: every request from an unlisted address
gets `403 text/html` (surfaced by the SDK at the time as `ValidationError` / `VALIDATION_FAILED`). That is
why the first Trendyol capture (2026-08-30, stage) recorded nine identical 403 errors and no
shapes, and why the baseline is taken from `prod` (every probe is a GET). `pnpm probe:check`
still prints a warning when a baseline has no successful probe, and flags an environment
mismatch (`stage` baseline vs `prod` run) as drift.

### Hepsiburada host discrepancy (roadmap 2.1a — RESOLVED by 1.7b)

**Resolved 2026-08-30**: `sdks/hepsiburada/src/transport.ts` now carries `mpfinance`,
`supplier-api`, `asktoseller` and `diskonto` service entries, `productUpdates` moved to
`mpop` under the `/ticket-api` base path, `questions.*` sends the required `merchantId`
header (paging with `page`/`size`), `accounting.listTransactions` sends the spec's
PascalCase `Offset`/`Limit` (plus the required date-range/identifier filters), and
`promotions.listDiscounts` sends the required `page`/`pagesize`. The rerouted read probes
now all answer 200 (the baseline above is 12 ok / 0 error). Remaining SIT quirks, not SDK
bugs: `promotions.listDiscounts` / `getLimits` answer a server-side 500
(`"Beklenmedik bir hata oluştu."`) and `getBudgets` resets the connection for the sandbox
merchant regardless of parameters (likely no self-campaign enrollment);
`suppliers.*` answers a route-level 404 `errorCode E4201` ("Tedarikçi bulunamadı") because
the sandbox merchant is not enrolled as a supplier; `promotions.listCategories` has
answered both 6 rows and an empty array within seconds on SIT, so its baseline shape is
`array` with no item shape.

The original evidence (pre-fix), kept for history — `pnpm probe:hosts`
(`scripts/probe/host-check.mts`) called each SDK read method as-is and then raw-GET the
same path on both hosts with the SDK's exact header set. SIT, 2026-08-30, status codes
only:

| Resource       | SDK call                                          | SDK result (via `oms-external-sit`) | Raw GET on spec host                                                                     | Spec file                    |
| -------------- | ------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------- |
| accounting     | `accounting.listTransactions({offset:0,limit:1})` | `NOT_FOUND` 404 (json)              | `mpfinance-external-sit` **400** (problem+json) with `Offset=0&Limit=1`                  | `mpfinance-external.json`    |
| suppliers      | `suppliers.getListingUpdateRequest(<uuid>)`       | `AUTH_FAILED` 401 (json)            | `supplier-api-external-sit` **404** (json) for a bogus id                                | `supplier-api-external.json` |
| questions      | `questions.list({offset:0,limit:1})`              | `AUTH_FAILED` 401 (json)            | `api-asktoseller-merchant-sit` **200** (json) with `page=0&size=1` + `merchantId` header | `asktoseller-merchant.json`  |
| promotions     | `promotions.listCategories()`                     | `AUTH_FAILED` 401 (json)            | `diskonto-external-sit` **200** (json)                                                   | `diskonto-external.json`     |
| promotions     | `promotions.listDiscounts()`                      | `AUTH_FAILED` 401 (json)            | `diskonto-external-sit` **500** (json) with `page=0&pagesize=1`                          | `diskonto-external.json`     |
| productUpdates | `productUpdates.getUpdateStatus(<uuid>)`          | `AUTH_FAILED` 401 (json)            | `mpop-sit/ticket-api` **200** (json)                                                     | `mpop-product-updates.json`  |

Reading:

- **The spec hosts serve these paths; `oms-external` does not.** `oms-external` answers 401 to
  every one of them (404 for `/transactions`), i.e. the credentials are fine for OMS but the
  route is not there, whereas the dedicated hosts either return data (200) or a
  route-specific error (400 bad parameters, 404 unknown id, 500 for `discounts` with a page
  size of 1).
- `accounting`: the spec expects `Offset`/`Limit` (capitalised, both required) on
  `mpfinance-external`; the SDK sends `offset`/`limit` to `oms-external`. Both host and
  parameter casing need to change.
- `questions`: the spec marks a `merchantId` header as required on `api-asktoseller-merchant`
  and pages with `page`/`size`; the SDK sends neither the header nor those parameter names.
- `productUpdates`: the spec base URL includes the `/ticket-api` prefix on `mpop`; the SDK's
  `mpop` base URL has no prefix, so the resource needs its own service entry (or a path prefix).
- `promotions` / `suppliers`: same paths, different host.

The SDK fix landed with roadmap item 1.7b (`fix(hepsiburada)` host-routing PR); this
directory records the evidence and the post-fix baseline.
