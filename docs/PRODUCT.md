# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, in this order on the landing page (user decision, 2026-10-11):

- **Primary on the landing page: marketplace sellers** (Trendyol, Hepsiburada, soon n11), the buyers of the planned **paid seller panel**. The panel does not exist yet; the landing page leads with it as the next product, offered through a waitlist.
- **Secondary: developers and integration teams** (agencies, in-house e-commerce teams, SaaS teams, freelancers) who write code against the marketplace seller APIs. Today they get the free, MIT-licensed SDKs. Their job: ship and maintain marketplace integrations (products, stock and price, orders, claims, webhooks, finance) without rewriting the same client code and chasing undocumented API changes.
- Also: international TypeScript/Node developers arriving from npm, GitHub or search, and open-source contributors (Hacktoberfest "good first issue" work).
- The landing page is **bilingual, Turkish and English** (user decision, 2026-10-11). The docs stay in English and serve the developer audience.

## Product Purpose

Lonca is a set of open-source, MIT-licensed TypeScript SDKs for Turkish e-commerce marketplaces: `@lonca/trendyol`, `@lonca/hepsiburada` and the shared `@lonca/core`, all stable 1.x on npm. n11 is in progress: REST and SOAP reads are verified against production but not published.

Success right now (October 2026 launch): developers try it (`npm i`), give feedback in Discussions or issues, and make first outside contributions. Stars and downloads follow from that.

## Positioning

- **Category word:** Lonca owns the word **"entegratör" / "integrator"** (user decision, 2026-10-11). It is a Turkish marketplace integrator whose integration engine is open source.
- **Business model:** the open-source SDKs are the free, open core. The paid product is a **seller panel** built on the same engine (earlier docs called the paid layer a "Unified Marketplace API Gateway"; the user decided on 2026-10-11 that it is sold to sellers as a panel). Pricing is undecided.
- **Stance: the category's "amiral gemisi katili" (flagship killer)** (user, 2026-10-11). Like OnePlus against the flagship phones: flagship-grade integration without the flagship's licence. The flagships are the yearly-licence integrators, whose public prices run from about 9,500 to 99,000 ₺ a year, with API access often locked to the top tier.
  - **Price weapon: a permanently free tier for small sellers, then paid** (user, 2026-10-11). Paid prices are not set; never print a figure for them.
  - **Comparison: unnamed** (user, 2026-10-11). Compare against "yearly-licence integrators" as a class, using only publicly verifiable category facts (yearly licence, API locked to upper tiers, closed code). Never name a competitor on the page.
- **The panel's detailed promise and feature set are undecided.** Pages must not claim panel features the user has not confirmed. The confirmed levers are the free tier, the open-source engine (no lock-in) and production-verified reliability (contract probes and drift detection).
- The landing page leads with "tomorrow" (the panel, waitlist) and presents the SDKs as what exists today.

What already differentiates the engine: Lonca is checked against production, not only against the marketplaces' documentation:

- Read-only contract probes call live production endpoints and record the key sets and JSON types of real responses, never values.
- `pnpm drift` compares those wire shapes with a curated OpenAPI spec collection (`specs/`). `pnpm drift:types` checks the SDKs' own TypeScript types against the same specs in CI.

So the project notices when a marketplace's API differs from its docs or changes silently. Existing alternatives are closed, vendor-locked integrators, or general automation tools without Turkish marketplace support.

## Operating Context

- Developers evaluate Lonca from npm, GitHub, the docs at `https://lonca.zanaat.dev` and the "Trendyol in 30 minutes" guide.
- Typical use: a Node.js (>= 22) backend or worker. Credentials come from the marketplace seller panels (Trendyol `sellerId`/`apiKey`/`apiSecret`/`integratorName`; Hepsiburada `merchantId`/username/password/`integratorName`).
- Trendyol has prod and stage environments. Hepsiburada has prod and SIT.
- The project is maintained in the open under the Zanaat umbrella organization (`github.com/zanaat-dev`, `zanaat.dev`). Baron is a sibling project.

## Capabilities and Constraints

- **`@lonca/trendyol`:** 14 resources, about 70 methods (brands, categories, suppliers, products read/write/lifecycle, inventory, orders, claims, webhooks with `parseWebhookEvent`, questions, invoices, finance, labels, test orders, locations).
- **`@lonca/hepsiburada`:** 12 resources, 95 methods; full dev-portal coverage.
- **`@lonca/core`:** typed error hierarchy (`AuthError`, `RateLimitError`, `ValidationError`, `NotFoundError`, …), `retry`, token-bucket rate limiter, `paginate`, `money` (integer minor units), structured logger.
- **OpenAPI specs:** Trendyol 13 files / 95 operations; Hepsiburada 7 files / 67 operations; n11 REST 14 operations.
- **Stability:** semver. Breaking changes ship only in major versions, with a published deprecation policy (`/stability/`).
- **Constraints:**
  - Probes are strictly read-only; no marketplace write calls are made in verification.
  - Marketplace credentials are never stored in CI.
- **Terminology:** "marketplace" (pazaryeri), "integrator" (entegratör), "drift", "contract probe", "SDK". Package names are always written as `@lonca/<name>`.
- **Seller panel:** not built. No screens, features, prices, launch date or customers exist; any panel imagery is a labelled concept.
- **Undecided:** the panel's value proposition, scope and pricing; n11 publication date; which marketplace follows n11 (poll planned: Amazon TR, Çiçeksepeti, Pazarama, PttAVM, Idefix).
- **Competitive research (2026-10-11):** 41 sites studied; category defaults ("tek panel", logo wall, "ücretsiz dene", vanity counts, SEO FAQ) differentiate nothing. Reference page: https://claude.ai/artifact/Q7rnJSwARKgUbpyfY7HVak

## Brand Commitments

- **Name:** Lonca (Turkish for "guild"). It lives under the **Zanaat** umbrella ("craft"). Each Zanaat project keeps its **own visual language**; there is no shared Zanaat theme (user decision, 2026-10-11). The Lonca landing gets its own world, and the Lonca docs follow the landing.
- **Marks:** the real marks in `brand/` (`logomark.svg`, `icon.svg`, `wordmark.svg`, `social-preview.png`) must be used as they are, never redrawn or invented.
  - The "lonca" wordmark is hand-drawn, not a font.
  - Marks are single-colour and flat (no shadows, glows or borders). Each mark carries its own light/dark `currentColor` rule; default ink is `#2A272C` and dark-mode ink is `#FAFAF9`.
  - `brand/README.md` holds clearspace and usage rules.
- **Required notice:** Lonca is unofficial and independent. It is not affiliated with, endorsed by or supported by Trendyol, Hepsiburada or any marketplace. Product names and trademarks belong to their owners. This notice must stay visible on the site.
- **Voice:** plain, specific and technical. It is honest about what is verified and what is in progress.
- **Visual references (user, 2026-10-11): Nango, Linear, Vercel, Resend.** The user likes Nango's style most. The look is dark-first, near-monochrome, with hairline grids, one accent (Lonca blue), real code cards and precise developer-tool craft. It is applied to the category's section frame.
- **Section plan approved (user, 2026-10-11, "önerilerinle devam"):** https://claude.ai/artifact/SagctoWdUp86v1xmnenP86
  - Waitlist stored in a Cloudflare Worker + D1.
  - "Small seller" means up to 200 orders a month (Claude's proposal, accepted; shown on the page).
  - The "no lock-in" line promises only what is true today: the engine is open source and can be self-run.
- **Landing visual framework: the category standard** (user, 2026-10-11). Work within the frame the competitors use: a seller-SaaS layout with headline, form, product view, comparison, how-it-works, pricing, FAQ. Execute it at the level of the best sites in the category, played straight with no irony. The user delegated the choice of reference sites to Claude and asked for per-section proposals with motion.
- **Red lines (user):**
  - No corporate company-site feel.
  - No agency-portfolio showiness.
  - No fabricated proof.
  - The maintainer's employer and its products are never named.
- **Contact:** `hello@zanaat.dev`. Security reports go through GitHub private vulnerability reporting.

## Evidence on Hand

Real, citable facts:

- Package coverage numbers above, and stable 1.x releases on npm (core 1.1.0, trendyol 1.2.2, hepsiburada 1.2.1 as of 2026-10-11).
- Real drift findings from production probes:
  - Trendyol `ShipmentPackage.whoPays` is undocumented and absent on production; deprecated in 1.2.2.
  - Documented fields never appear in practice, and some numbers arrive as `null`.
  - n11 reason lists arrive without the WSDL's wrapper element.
  - A bug in Lonca's own webhook path was caught only by a live production check.
- Docs and guides at lonca.zanaat.dev, including "Trendyol in 30 minutes", the webhook events guide and the full TypeDoc API reference.
- Seven Hacktoberfest "good first issue" issues (#150–#156).

**Absent, must not be fabricated:**

- Customers, logos, testimonials and case studies.
- Usage, star or download counts. These are deliberately not shown; the user chose product facts only.
- Benchmarks.
- Any claim of official marketplace partnership.

## Product Principles

1. **Production is the source of truth.** Claim only what live, read-only checks have verified, and say clearly what is in progress.
2. **Types over guesswork.** Every response and error is typed; quirks of the marketplace are absorbed in the SDK, not pushed to the user.
3. **Open by default.** MIT license, public specs, public roadmap, and contributions welcome.
4. **Respect the developer's time.** Get from `npm i` to a real call in minutes; docs answer before the user has to ask.
