# @lonca/drift

Spec-vs-wire drift detection for the Lonca SDKs (roadmap Faz 4, [Vision](../../README.md#vision)
stage 2). **Private workspace package — not published to npm.**

It answers one question: _do the marketplace's real responses still look like the OpenAPI
definitions in [`specs/`](../../specs/)?_ The inputs are two committed, value-free artefacts:

- [`probe-snapshots/*.json`](../../probe-snapshots/): the contract probes'
  [`wire`](../../scripts/probe/README.md#wire-capture-wire) entries — for every HTTP exchange a
  read probe caused, the documented operation it hit and the **shape** (key sets + JSON types,
  never values) of the raw JSON body;
- [`specs/<marketplace>/*.json`](../../specs/): the documented 2xx `application/json` response
  schema of that operation.

`pnpm drift` needs no credentials and no network; it reads committed files only.

## The local model

Drift runs **locally, before releases**, not in CI: marketplace credentials are deliberately
not stored as GitHub secrets (see [`scripts/probe/README.md`](../../scripts/probe/README.md)).

```bash
pnpm build                       # the probes import the built SDKs and this package
pnpm probe                       # read-only GETs against prod; rewrites probe-snapshots/*.json
pnpm drift                       # compare wire shapes with specs/, write drift-output/
```

Review `git diff probe-snapshots/` and `drift-output/report.md` before committing the snapshots;
drop [overlay](#known-discrepancy-overlay) entries the report lists as stale.

## CLI

```bash
pnpm drift                                # all marketplaces, exit 1 on breaking findings
pnpm drift --only trendyol                # one marketplace (repeatable)
pnpm drift --fail-on additive             # also fail on undocumented fields
pnpm drift --fail-on never                # report only
pnpm drift --out-dir /tmp/drift           # default: drift-output/ (gitignored)
pnpm drift --no-known                     # ignore the known-discrepancy overlay
```

| Flag                             | Default                      | Effect                                                      |
| -------------------------------- | ---------------------------- | ----------------------------------------------------------- |
| `--only <marketplace>`           | all                          | Restrict to `hepsiburada` / `n11` / `trendyol`. Repeatable. |
| `--fail-on <level>`              | `breaking`                   | `breaking`, `additive` (breaking + additive) or `never`.    |
| `--out-dir <dir>`                | `drift-output/`              | Where `report.md` and `report.json` are written.            |
| `--snapshots-dir`, `--specs-dir` | `probe-snapshots/`, `specs/` | Alternative inputs (used by the tests).                     |
| `--known <file>`                 | see below                    | Known-discrepancy overlay; the file must exist.             |
| `--no-known`                     | off                          | Ignore the overlay (every finding at its own severity).     |

Exit codes: `0` nothing at or above `--fail-on` (also when there is **no wire baseline yet** —
the CLI then prints "run `pnpm probe` to capture"), `1` findings at or above `--fail-on`, `2`
usage or input error (including an unreadable or invalid overlay). Warnings and info never fail
the run.

Outputs:

- `report.json` — every finding, per marketplace and operation (including the field names
  behind each collapsed `not-observed` entry).
- `report.md` — a counts table, the overlay summary (with any stale entries), then per
  marketplace → per operation the findings grouped by severity, then a "How to act" footer. It is capped at 60 KB so it can be pasted as an issue
  body; past the cap, whole sections are dropped with a note pointing at `report.json`.

## Findings

| Kind                  | Severity | Meaning                                                                                                                                |
| --------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `type-mismatch`       | breaking | A JSON type was observed that the schema does not allow (other than `null` alone — e.g. `object` where `string` is documented).        |
| `missing-required`    | breaking | A `required` property was never observed although its parent object was.                                                               |
| `undocumented-field`  | additive | An observed key the schema does not list (and no `additionalProperties` allows).                                                       |
| `undocumented-null`   | warning  | `null` was observed on a property that is not nullable, and no other disallowed type was — the upstream spec usually omits `nullable`. |
| `unmatched-operation` | warning  | A wire call no spec operation describes (or whose operation has since left the spec).                                                  |
| `known`               | info     | Explained by Lonca's own annotations: the property is `x-lonca-observed`, or the observed type is listed in `x-lonca-observed-types`.  |
| `accepted`            | info     | A finding the [known-discrepancy overlay](#known-discrepancy-overlay) accepts; carries the original kind (`accepts`) and the `reason`. |
| `not-observed`        | info     | Optional documented properties never seen in the sample — one collapsed entry per object, with a count.                                |
| `uncomparable`        | info     | Nothing to compare: depth / key cap hit, empty arrays only, non-JSON or error body, no documented JSON schema, unresolvable `$ref`.    |

Paths are JSON-pointer-ish relative to the body: `content[].shipmentNumber`, `(root)`.

### Schema rules

The engine (`src/engine.ts`, pure functions) is deliberately lenient, so a breaking finding means
the wire and the definition really disagree:

- `$ref`: local JSON pointers only (the specs are self-contained); an unresolvable reference
  makes the node unconstrained and is reported as `uncomparable`.
- `allOf`: merged — union of properties and `required`, intersection of declared types (`null`
  is allowed if any part allows it).
- `oneOf` / `anyOf`: union of the alternatives — a key or type is fine if any alternative allows
  it; a key is required only if every alternative requires it.
- `nullable: true` and `type: [..., "null"]` allow `null`; `integer` is the JSON type `number`; a
  node without `type` accepts any type. When `null` is the only disallowed type observed at a
  position the finding is `undocumented-null` (warning); `null` next to another disallowed type
  (`null|object` where `string` is documented) is one `type-mismatch`.
- `additionalProperties: true` or a schema allows extra keys (a schema is compared against
  them); absent or `false` means `properties` is the documented key set. An object schema
  with no properties at all documents nothing, so its keys are `uncomparable`, not undocumented.
- Below a `depthCapped` marker nothing is compared; on an object with `droppedKeys`, the
  missing / not-observed checks are skipped.
- Element shapes marked `itemsFromBaseline` (kept by the probe runner from the previous
  snapshot when the fresh sample only had empty arrays) are compared like observed ones.
- Responses: the exact status code, then the `2XX` range; `default` is not used (it documents
  errors in these specs). Media type: `application/json`, then any `*json*` type, then `*/*`.

### Known-discrepancy overlay

[`probe-snapshots/known-discrepancies.json`](../../probe-snapshots/known-discrepancies.json) is a
hand-maintained list of findings that are understood and accepted — the marketplace's docs are
wrong and the SDK copes, or an upstream spec omits `nullable`. It lives next to the snapshots,
not in `specs/`: the Hepsiburada specs are redistributed unchanged and `specs/trendyol` is
generated (and `--check`ed), so neither can carry Lonca's notes.

```jsonc
{
  "$comment": "…",
  "entries": [
    {
      "marketplace": "trendyol",
      "operation": "GET /integration/product/product-categories", // as in the report heading
      "path": "(root)", // as printed in the report; "*" = any path in the operation
      "kind": "type-mismatch", // the finding kind it accepts
      "reason": "Docs say array; prod returns { categories: [...] }. SDK reads data.categories.",
      "since": "2026-10-09", // YYYY-MM-DD
    },
  ],
}
```

- A finding that matches an entry (marketplace + operation + path or `*` + kind) is reported as
  `accepted` (info) with the entry's `reason`; the original kind is kept in `accepts`.
- `kind` must be one that needs attention: `type-mismatch`, `missing-required`,
  `undocumented-field`, `undocumented-null` or `unmatched-operation` — or, for
  [`pnpm drift:types`](#sdk-types-vs-specs), `sdk-type-mismatch` / `sdk-unknown-field`. Each
  report only matches (and only flags as stale) the entries of its own kinds. The file is
  validated on load (unknown keys, missing fields, bad dates, duplicates); any problem is exit
  code `2` with one line per problem.
- Entries that matched nothing in the run (for the marketplaces in the report) are listed under
  **Stale overlay entries** in `report.md` and in `report.json` (`known.stale`) — info, never a
  failure. Remove them, or fix the operation / path spelling.
- By default the CLI reads `<snapshots-dir>/known-discrepancies.json` and silently runs without
  an overlay when that file does not exist; `--known <file>` points elsewhere (and requires the
  file), `--no-known` ignores it. The overlay is never read as a snapshot.

Accept only what the SDK already handles. Undocumented fields (`undocumented-field`) and
undocumented endpoints (`unmatched-operation`) are usually better left visible as signals.

### How to act

- **breaking** — check the SDK's types and normalisers for that field and fix the SDK if it
  relies on the documented shape. If the marketplace is wrong about its own API and the SDK
  copes, add an overlay entry with the reason (reported as `accepted`), or — in a spec Lonca
  generates — record the observed type with `x-lonca-observed-types` (reported as `known`).
- **additive** — the field is real but undocumented. Expose it in the SDK if useful, and mark
  the spec property `x-lonca-observed: true` (Trendyol: the observation pass of
  `pnpm specs:trendyol:build`, see [`specs/trendyol/README.md`](../../specs/trendyol/README.md);
  n11: the same pass in `pnpm specs:n11:build`, see [`specs/n11/README.md`](../../specs/n11/README.md)).
- **warning** — `undocumented-null`: make sure the SDK type allows `null` (or normalises it
  away); the spec most likely just lacks `nullable`, so accept it in the overlay.
  `unmatched-operation`: add the missing definition to `specs/`, or fix the SDK path.

## SDK types vs specs

`pnpm drift:types` (roadmap 4.3) asks the second question: _do the SDKs' own TypeScript types
for those responses agree with the same documented schemas?_ It reads the SDK **sources** with
the TypeScript compiler API — the SDKs are never imported or run — and needs no build, network
or credentials, so it runs on every CI build ([warn-only](#ci-warn-only)).

```bash
pnpm drift:types                          # all mapped types, report only (exit 0)
pnpm drift:types --fail-on warning        # exit 1 when there are warnings
pnpm drift:types --only hepsiburada       # one marketplace (repeatable)
```

| Flag                             | Default                            | Effect                                                    |
| -------------------------------- | ---------------------------------- | --------------------------------------------------------- |
| `--fail-on <level>`              | `never`                            | `warning` (exit 1 on any warning) or `never` (warn-only). |
| `--only <marketplace>`           | all                                | Restrict to the map entries of one marketplace.           |
| `--map <file>`                   | `packages/drift/sdk-type-map.json` | The type map.                                             |
| `--root <dir>`                   | cwd                                | Where the map's `source` paths resolve.                   |
| `--out-dir <dir>`                | `drift-output/`                    | Where `types-report.md` and `types-report.json` go.       |
| `--snapshots-dir`, `--specs-dir` | `probe-snapshots/`, `specs/`       | Wire baseline (evidence only; optional) and specs.        |
| `--known <file>`, `--no-known`   | the default overlay                | [Known-discrepancy overlay](#known-discrepancy-overlay).  |

Exit codes: `0` report written (no warning, or `--fail-on never`), `1` warnings with
`--fail-on warning`, `2` usage or input error — an invalid map or overlay, or a map entry that
does not resolve (unknown file / type / spec / operation, a pointer the documented response does
not have). Nothing is written on exit `2`.

### The type map

[`sdk-type-map.json`](./sdk-type-map.json) is hand-maintained and validated on load. Each entry
says which SDK type mirrors which documented response object:

```jsonc
{
  "marketplace": "hepsiburada",
  "sdkType": "AccountingTransaction", // interface or type alias; may be declared inside a function
  "source": "sdks/hepsiburada/src/types/accounting.ts",
  "spec": "hepsiburada/mpfinance-external.json",
  "operation": "GET /transactions/merchantid/{merchantId}", // as the drift reports print it
  "pointer": "items[]", // body path of the object: "(root)", "content[]", "data.items[]", "[]"
  "ignore": ["raw"], // SDK-only properties: escape hatches, values the SDK builds
  "coerced": ["id"], // optional: converted on purpose (String(id), ms-epoch → ISO) — type not compared
  "note": "Public type; the normaliser copies same-named fields with typeof guards.",
}
```

Only map a type that **genuinely mirrors a wire object**:

- **Trendyol** — mostly the resources' internal wire-node interfaces
  (`TrendyolShipmentPackageNode`, `WireQuestion`, `TrendyolProductNode`, …): they are what the
  normalisers read, so a disagreement there is an SDK bug. Mapping the response envelope at
  `(root)` covers every nested node (`TrendyolGetOrdersResponse` reaches the package, line,
  address and history nodes). Public types are mapped where the normaliser copies wire fields
  as-is (`CargoInvoiceItem`, `ClaimIssueReason`, `SellerVideo`, `OrderLineDiscountDetail`).
- **Hepsiburada** — the public types whose normaliser copies same-named fields with `typeof`
  guards or `pickFields` (`Order`, `AccountingTransaction`, `CatalogProduct`, supplier rows, …):
  a field whose name or JSON type is wrong there is silently never populated.
- **n11** — the resources' internal wire interfaces, as for Trendyol: `N11CategoryWire`,
  `N11CategoryAttributesWire`, `N11ProductQueryResponse` and `N11PackagePageWire` (the
  envelopes reach every nested node). The public `N11*` types are normalised (string ids,
  `Money`, ISO dates) and stay unmapped.

Intentionally **unmapped**:

- Normalised Trendyol public types — `ShipmentPackage`, `OrderLine`, `OrderAddress`,
  `OrderCustomer`, `PackageHistoryEntry`, `Claim`, `Question`, `Product`, `ProductVariant`,
  `ProductStockPrice`, `UnapprovedProduct`, `ProductBase`, `BuyboxInfo`, `BatchRequestResult`,
  `Brand`, `Category`, `CategoryAttribute`, `FinancialTransaction`, `City` / `District` /
  `Neighborhood` / `Country`, `SupplierAddress`, `Webhook`: renamed (`lineId` → `id`), stringified
  ids, ISO dates, synthesised objects. Their wire-node interfaces are mapped instead.
- Response types without a usable definition in `specs/`: Hepsiburada listings (`Listing`,
  upload results, buybox / commission rows — `listing-external` is not in `specs/`), claims
  (`Claim`), shipping (`CargoFirm`, `ShippingProfile`), catalog / product-update tracking
  (`CatalogProductStatus`, `TrackingIdHistoryEntry`, `ProductUpdate*` — `data` documents no
  properties), `CategoryAttributeValue` (no schema); Trendyol `ClaimItemAudit` (`raw` only).
- Envelopes and receipts the SDK builds itself (`CatalogPage`, `CatalogResult`, `OrdersPage`,
  `QuestionCountSummary`, `DiscountReceipt`, `PackageReceipt`, `*Receipt`, `MutationResult`), the
  export-center types, webhook **event** payloads (inbound, not responses), and every request
  type (`*Input`, `*Params` — request-side drift is out of scope).
- Function-local Trendyol interfaces whose name is not unique in their file (`WireResponse` in
  `orders.ts`): the extractor rejects ambiguous names, so the stream node / public type is mapped.

### Extraction rules

String / number / boolean literals, enums, template literals and open unions
(`'A' | 'B' | (string & {})`) reduce to `string` / `number` / `boolean`; `unknown`, `any` and
type parameters to `any` (never compared); `T[]`, `Array<T>`, tuples to `array` with an element
type; `Date` to `string`; object types to `object` with their properties (methods dropped), an
index signature (`[key: string]: unknown`, `Record<…>`) marking extra keys as allowed. Union
members are merged (`{ url?: string } | string` → `object|string`). Recursion stops at a named
type already on the path or 8 levels deep.

### Findings

| Kind                | Severity       | Meaning                                                                                                                                                                                                                                                              |
| ------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sdk-type-mismatch` | warning / info | The SDK declares a JSON type the spec does not allow. **warning** when the two do not overlap (`amount?: number` where an object is documented); **info** when the SDK is only wider (`id?: number \| string` where `integer` is documented). SDK `null` is ignored. |
| `sdk-unknown-field` | warning / info | An SDK property the schema does not document. **info** when the wire baseline has the key (the docs are incomplete); **warning** otherwise — the SDK may read a field that never arrives.                                                                            |
| `sdk-missing-field` | info           | Documented properties the SDK type does not declare (left on `raw`) — one collapsed entry per object; the names are in `types-report.json`.                                                                                                                          |
| `known`             | info           | The SDK's extra type is already recorded as `x-lonca-observed-types` on the spec property.                                                                                                                                                                           |
| `accepted`          | info           | Accepted by an overlay entry with kind `sdk-type-mismatch` / `sdk-unknown-field`; `path` is the body path as printed in the report.                                                                                                                                  |
| `uncomparable`      | info           | The spec documents no properties / element type there, or the SDK type hit the depth cap.                                                                                                                                                                            |

Every type finding carries the SDK path (`sdkPath`, e.g. `AccountingTransaction.amount`), the
SDK and documented types, and — when the probe snapshot has the operation — the JSON types the
**prod wire baseline** observed at that path (`wire`; `[]` = not observed), so a reader can tell
which side is wrong. Required-ness is not compared: SDK fields are deliberately optional.

How to act: when the wire agrees with the spec, fix the SDK type (and its normaliser); when the
wire agrees with the SDK, the docs are wrong — record `x-lonca-observed-types` (Trendyol) or
accept the finding in the overlay with a reason. A warning without wire evidence needs a probe
(or a look at the portal) before changing anything.

### CI (warn-only)

The `Verify` workflow ([`ci.yml`](../../.github/workflows/ci.yml)) runs `pnpm drift:types` on one
Node version after the build and appends `types-report.md` to the job summary. The step is
`continue-on-error` and runs with `--fail-on never`: findings never fail a build. Raising it to
`--fail-on warning` is a separate decision once the current warnings are resolved or accepted.

## Library

The package also provides what the probe runner uses for wire capture:

- `createWireRecorder({ index })` — a `fetch` wrapper that records
  `{ operation, status, contentType, body, shape }` per exchange, reading 2xx bodies from
  `response.clone()` and never reading error bodies.
- `buildOperationIndex(loadSpecs('specs'))` — URL → spec operation matcher (server URL + path
  template, `{param}` as wildcard, literal segments case-insensitive, Hepsiburada `-sit` hosts
  also match production). Unmatched URLs are reduced with `redactPath()` (`{}` for every
  value-like segment).
- `withGlobalFetch(fetch, build)` — builds an SDK client while `fetch` is installed globally
  (the SDK factories expose no `fetch` option, but the transports bind it at construction).
- `loadKnownDiscrepancies` / `applyKnownDiscrepancies` — the overlay, as the CLI uses it.
- `carryEmptyArrayItems` / `carryWireItems` — keep known element shapes when a fresh sample
  only had empty arrays (the probe runner's update path; see
  [`scripts/probe/README.md`](../../scripts/probe/README.md#empty-samples-itemsfrombaseline)).
- `summarize` / `diffShapes` / `diffWire` — the snapshot shape format (moved here from
  `scripts/probe/shape.mts`) and the comparisons `pnpm probe:check` uses.

## Out of scope (v1)

- **Enum drift.** Snapshots hold JSON types, never values, so an unexpected enum member cannot
  be seen.
- Request-side drift (parameters, request bodies) and write endpoints — probes are read-only.

## Development

```bash
pnpm --filter @lonca/drift test            # unit + fixture end-to-end tests (no network)
pnpm --filter @lonca/drift test:coverage
```

`src/cli.test.ts` runs the CLI against a hand-written fixture snapshot
(`src/__fixtures__/snapshots/trendyol.json`) and the **real** `specs/trendyol/*.json`.
`src/types-cli.test.ts` runs `pnpm drift:types` against the real SDK sources, specs and wire
baseline (and checks that every entry of the committed type map resolves);
`src/types-extract.test.ts` covers the extraction rules with `src/__fixtures__/sdk-types/sample.ts`.
