# Contract probes

Read-only, deterministic probes that call the main read endpoints of each marketplace SDK
against a live account and reduce every response to its **structure** — the key set of each
object level and the JSON type(s) seen at each position. The structures are committed under
[`probe-snapshots/`](../../probe-snapshots/) and re-checked **locally** with `pnpm probe:check`
(see [Running locally](#running-locally-the-default)); a difference is the drift signal
(roadmap Faz 2.3 / 2.4). Each probe records two structures: `shape`, the SDK's normalised
return value, and `wire`, the raw HTTP responses behind it, matched to the operations in
[`specs/`](../../specs/) so that [`pnpm drift`](../../packages/drift/) can compare them with
the documented schemas (roadmap Faz 4).

## Usage

```bash
pnpm probe                       # run every probe set that has credentials, write probe-snapshots/*.json
pnpm probe:check                 # run, compare with the committed snapshots, exit 1 on drift
pnpm probe -- --only trendyol    # one marketplace (repeatable)
pnpm probe:hosts                 # Hepsiburada host-discrepancy report (SIT only, see below)
pnpm probe:prod                  # same as `pnpm probe`, but reads `.env.prod` instead of `.env`
```

The committed baselines are production captures. Keep `.env` on stage / SIT and regenerate them
with `pnpm probe:prod`, which loads a separate gitignored `.env.prod` (see
[`probe-snapshots/README.md`](../../probe-snapshots/README.md#regenerating)).

Credentials are read from the environment; the root scripts load `.env` when it exists
(`tsx --env-file-if-exists=.env`). The variable names are the ones in
[`.env.example`](../../.env.example): `HB_MERCHANT_ID`, `HB_API_USER`, `HB_API_PASS`, `HB_ENV`,
`HB_INTEGRATOR_NAME`, `TY_SELLER_ID`, `TY_API_KEY`, `TY_API_SECRET`, `TY_ENV`,
`TY_INTEGRATOR_NAME`, and `N11_APP_KEY`, `N11_APP_SECRET`, `N11_ENV`, `N11_INTEGRATOR_NAME`. A marketplace whose required variables are absent is **skipped**, not
failed (`--require-credentials` turns that into exit code 2 for CI).

| Flag                    | Effect                                                                      |
| ----------------------- | --------------------------------------------------------------------------- |
| `--check`               | Compare fresh shapes with `probe-snapshots/` instead of writing them.       |
| `--update`              | Write `probe-snapshots/` (the default when `--check` is absent).            |
| `--only <marketplace>`  | Restrict to `hepsiburada`, `n11` or `trendyol`. Repeatable.                 |
| `--out-dir <dir>`       | Where fresh snapshots, timings and `report.md` go. Default `probe-output/`. |
| `--require-credentials` | Exit 2 when a selected marketplace has no credentials.                      |

Exit codes: `0` no drift, `1` drift detected (or no committed snapshot), `2` usage /
credentials / internal error.

## What is probed

Every probe is an SDK read call with a small page size (10); a few chain two or three reads to
get an id to inspect (marked "→"). No probe calls an upload, create, update, delete or "test
order" method. All requests are `GET` except one: Trendyol's buybox check
(`products.getBuyboxInfo`) is a documented read that is sent as a `POST` whose body is only the
list of barcodes to look up (max 10).

| Hepsiburada                                        | Trendyol                                                    |
| -------------------------------------------------- | ----------------------------------------------------------- |
| `listings.list`                                    | `products.list`                                             |
| `catalog.listProducts`                             | `orders.list`                                               |
| `catalog.listProductsByStatus(MATCHED)`            | `categories.list`                                           |
| `orders.list`                                      | `brands.list`                                               |
| `categories.list`                                  | `locations.getTurkeyCities`                                 |
| `categories.getAttributes` (→ first leaf category) | `questions.list`                                            |
| `claims.list`                                      | `claims.list`                                               |
| `questions.list`                                   | `finance.getSettlements(Sale, last 7d)`                     |
| `shipping.getCargoFirms`                           | `webhooks.list`                                             |
| `shipping.listProfiles`                            | `locations.getTurkeyDistricts` (→ first city)               |
| `accounting.listTransactions`                      | `locations.getTurkeyNeighborhoods` (→ first city, district) |
| `promotions.listCategories`                        | `categories.getAttributes` (→ first leaf category)          |
| `promotions.listDiscounts`                         | `products.listUnapproved`                                   |
| `orders.listPackages`                              | `orders.list(Delivered)`                                    |
| `orders.getByOrderNumber` (→ first order)          | `suppliers.getAddresses` (Trendyol allows 1 request / hour) |
|                                                    | `categories.getAttributeValues` (→ first leaf, attribute)   |
|                                                    | `orders.listStream(last 7d)`                                |
|                                                    | `products.getBuyboxInfo` (→ first barcodes; `POST`, read)   |

The probes below the original twelve / nine were added to verify SDK fields that the
SDK-types-vs-spec check (`pnpm drift:types`) could not confirm from the earlier sample.

n11 (`@lonca/n11`, the private research SDK) has four REST probes, all `GET`: `categories.list`,
`categories.getAttributes` (→ the category of the first listed product), `products.list` and
`orders.list`. It also has seven SOAP probes. SOAP sends every call as a `POST` envelope, but these
only call read operations: shipment companies, return and cancel claim lists, the three reason-type
lists, and the question list → detail (once per run, since n11 allows one listing per minute). The
maintainer approved them on 2026-10-10. SOAP bodies are XML, so their `wire` entries record
`non-json` and the shape comes from the SDK's normalised return value. n11 documents no sandbox, so its credentials are prod ones and only belong in
`.env.prod`. The four REST operations match the hand-compiled
[`specs/n11/`](../../specs/n11/README.md); the four SOAP endpoints have no spec (SOAP is out of
scope for `specs/`), so `pnpm drift` reports them as "no spec match" warnings.

Add a probe by appending `{ name, call }` to the registry in `probes/<marketplace>.mts`; the
name is the snapshot key, so keep it stable.

## Snapshot format

`probe-snapshots/<marketplace>.json` (2-space JSON, keys sorted, excluded from prettier):

```jsonc
{
  "$comment": "…",
  "marketplace": "hepsiburada",
  "env": "sit",
  "shapeOptions": { "maxDepth": 6, "maxKeys": 80 },
  "probes": {
    "orders.list": {
      "status": "ok", // ok | error | skipped
      "shape": {
        "types": ["object"],
        "keys": {
          "items": {
            "types": ["array"],
            "items": {
              "types": ["object"],
              "keys": { "orderNumber": { "types": ["string"] }, "…": {} },
            },
          },
          "totalCount": { "types": ["number"] },
        },
      },
    },
    "questions.list": {
      "status": "error",
      "httpStatus": 401,
      "errorName": "AuthError",
      "errorCode": "AUTH_FAILED",
    },
  },
}
```

- `types` is the sorted union of JSON types (`string | number | boolean | null | array | object`)
  observed at that position.
- Arrays are summarised by the union of their element shapes (`items`); element counts are not
  recorded. An empty array has no `items` — except when the snapshot is rewritten (see
  [Empty samples](#empty-samples-itemsfrombaseline)).
- `itemsFromBaseline: true` marks an array position whose `items` were **not** observed in the
  run that wrote the file (every array there was empty) but kept from the previous snapshot.
- Depth is capped at 6 (`depthCapped: true` marks the cut) and keys at 80 per level
  (`droppedKeys: n`).
- Errors are recorded as `{ httpStatus, errorName, errorCode }` from `LoncaError` only — never
  the message or response body, which marketplaces routinely fill with echoed request data.
- Timings go to `probe-output/<marketplace>.timings.json`, not the snapshot, so a re-run with an
  unchanged contract is byte-identical.

**PII is handled structurally**: values never leave the process. A customer name becomes
`"customerName": { "types": ["string"] }`; an address becomes its key set. There is no
masking step to get wrong.

### Wire capture (`wire`)

`shape` describes what the **SDK returns**, which is normalised (`brands.list` →
`{ items: [{ id, name }] }`) and therefore cannot be compared with the marketplace's OpenAPI
definitions. So each probe entry also carries `wire`: one entry per HTTP exchange the call
caused, recorded by a `fetch` wrapper (`createWireRecorder` in
[`@lonca/drift`](../../packages/drift/)):

```jsonc
"orders.list": {
  "status": "ok",
  "shape": { "…": "SDK output, as before" },
  "wire": [
    {
      "operation": {
        "key": "GET /integration/order/sellers/{sellerId}/orders",
        "spec": "trendyol/marketplace.json",
        "operationId": "getShipmentPackages",
        "method": "GET",
        "path": "/integration/order/sellers/{sellerId}/orders",
        "specPath": "/order/sellers/{sellerId}/orders",
        "server": "https://apigw.trendyol.com/integration",
      },
      "status": 200,
      "contentType": "application/json",
      "body": "json", // json | non-json | empty | not-recorded
      "shape": { "types": ["object"], "keys": { "…": {} } },
    },
  ],
}
```

- The request URL is matched against every `specs/<marketplace>/*.json` operation (server URL +
  path template, `{param}` segments as wildcards, literal segments case-insensitive; Hepsiburada
  production hosts also match the `-sit` servers the portal documents). What is recorded is the
  **template**, never the concrete path, so seller ids, merchant UUIDs and package ids do not
  reach the snapshot. A URL no spec describes is recorded as
  `{ "key": "GET <host><path>", "unmatched": true, … }` with every value-like path segment
  (numbers, UUIDs, codes, anything not a plain lower-case word) replaced by `{}`. Query strings
  are never recorded.
- The body is read from `response.clone()`, so the SDK consumes the original response exactly
  as before. Only **2xx** bodies are summarised (same `summarize()`, same caps); error bodies are
  not read at all (`body: "not-recorded"`) because marketplaces echo request data into them.
- Retries are collapsed: a `503` followed by a `200` for the same operation records only the
  `200`; several successful calls of one operation merge their shapes.
- The recorder is passed to each client through the SDKs' `fetch` option
  (`createTrendyolClient({ …, fetch })` / `createHepsiburadaClient({ …, fetch })`); nothing else
  about the client changes.

### Empty samples (`itemsFromBaseline`)

Shapes are sample-dependent: with a 10-row page, a list that happens to be empty (no webhooks,
no open questions) has no element shape. So that such a run does not erase a known shape, the
**update** path (`pnpm probe` / `pnpm probe:prod`, writing `probe-snapshots/`) compares each
fresh shape — the SDK-output `shape` and every `wire[].shape` (matched by operation key +
status) — with the committed snapshot of the same probe:

- wherever the fresh shape has an array **without** `items` (an empty sample, not a depth cap)
  and the committed shape has `items` at the same position, the committed `items` are kept and
  the array is marked `"itemsFromBaseline": true`;
- nothing else is carried over — keys, types and caps come from the fresh run alone, so a
  removed key is still a removal; a list that is non-empty again replaces the carried shape
  (and the marker disappears);
- only within the same environment: a `stage` run never inherits `prod` element shapes.

`pnpm drift` treats carried `items` like observed ones. `probe-output/<marketplace>.json` (the
raw fresh run) is written without carry-over.

## Drift detection

`--check` compares the fresh shape of each probe with the committed one and reports:

- `added` / `removed` — a key exists on one side only;
- `type-changed` — the non-null type set differs (`string` → `number`, `object` → `array`);
- probe status changes (`ok` → `error`, HTTP status or `errorCode` changed);
- environment mismatch (`stage` baseline checked against `prod`).

Those block (exit 1). `nullability` (only the presence of `null` differs) is printed for
information but does not block — with a 10-row sample a nullable field is often `null` in one
run and populated in the next. Array element shapes are compared only when both sides have
them; an empty fresh page against a known element shape is reported as `uncomparable`
(informational, "no elements in this sample") — data churn, not drift.

The `wire` lists are compared the same way and reported in their own **Wire (raw
responses)** section of `report.md`: an operation that appeared or disappeared, a changed
status / content type / body kind, and `added` / `removed` / `type-changed` keys (paths are
prefixed with the operation key) block; `nullability` and `uncomparable` are informational. A committed snapshot
taken before wire capture has no `wire` field: `--check` prints "no wire baseline yet" and does
**not** treat it as drift. Running `pnpm probe` once writes the baseline.

Known limitation: a key that is only present on some rows (e.g. a cancellation field) can
appear or disappear with the sample. When that happens, `pnpm probe` and commit the widened
snapshot; the merged key set only grows. Comparing the wire shapes with the documented schemas
in `specs/` is `pnpm drift` ([`packages/drift`](../../packages/drift/), roadmap Faz 4).

## Workflow (manual only)

`.github/workflows/contract-probe.yml` has **no schedule**: the nightly cron was removed on
2026-08-30 because marketplace credentials are deliberately not stored as GitHub secrets. It
runs only on `workflow_dispatch`, and a first job checks for the `HB_*` / `TY_*` secrets and
skips the probe (with a notice) when none are configured — which is the current state. Should
secrets ever be added, it runs `pnpm probe:check --require-credentials`, uploads
`probe-output/` as an artifact on drift and opens (or comments on) a single issue titled
**Contract drift detected** labelled `drift`. It only runs in `zanaat-dev/lonca`.

Note that Trendyol `stage` is behind an IP allowlist (Cloudflare 403 for unlisted addresses);
either allowlist the runner egress or point `TY_ENV` at `prod` — all probes are GETs.

## Host discrepancy report (`host-check.mts`)

Roadmap 2.1a. For the Hepsiburada resources the SDK routes via the `oms` host
(`accounting`, `suppliers`, `questions`, `promotions`, `productUpdates`) while the portal's
OpenAPI documents put them on dedicated hosts, the script calls the SDK method as-is and then
raw-GETs the same path on both the SDK host and the spec host with the SDK's exact header set.
It prints a Markdown table of status codes only and refuses to run when `HB_ENV` is not `sit`.
The findings are recorded in [`probe-snapshots/README.md`](../../probe-snapshots/README.md).

## Running locally (the default)

Marketplace credentials are intentionally **not** stored as GitHub secrets, so the
workflow only runs when dispatched manually (and no-ops without secrets). The
supported way to check for drift is local:

```bash
pnpm build               # the probes import the built SDKs and @lonca/drift
pnpm probe:check         # exits 1 and prints a structural diff when the API drifted
pnpm probe -- --update   # accept the new shape after reviewing the diff
pnpm drift               # compare the committed wire shapes with specs/ (no network)
```

Run it before releases (`pnpm probe && pnpm drift`) and whenever an SDK behaves unexpectedly. To automate it
on your own machine, schedule `pnpm probe:check` (e.g. Windows Task Scheduler /
cron) from a checkout that has a valid .env.
