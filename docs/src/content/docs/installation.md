---
title: Installation
description: Install the @lonca SDKs in your TypeScript or JavaScript project.
---

## Requirements

- Node.js **22 or newer**
- A package manager — pnpm 10+ is the project default, but npm / yarn / bun also work

## Install

Pick the marketplace package(s) you need; `@lonca/core` comes along as a peer dependency.

```bash
# Trendyol
pnpm add @lonca/trendyol @lonca/core

# Hepsiburada
pnpm add @lonca/hepsiburada @lonca/core

# n11
pnpm add @lonca/n11 @lonca/core

# Both (a typical multi-marketplace seller)
pnpm add @lonca/trendyol @lonca/hepsiburada @lonca/core
```

## Versioning

Lonca uses [Changesets](https://github.com/changesets/changesets) for releases. While the SDKs are on `0.x`, **pin to a minor range** — the `0.x` line ships breaking type changes when live observation reveals stricter contracts:

```jsonc
{
  "dependencies": {
    "@lonca/hepsiburada": "~0.9.0",
    "@lonca/trendyol": "~0.11.0",
  },
}
```

Once a package reaches `1.0`, standard semver guarantees apply.

## Stable releases & changelogs

- npm: [`@lonca/core`](https://www.npmjs.com/package/@lonca/core) · [`@lonca/trendyol`](https://www.npmjs.com/package/@lonca/trendyol) · [`@lonca/hepsiburada`](https://www.npmjs.com/package/@lonca/hepsiburada) · [`@lonca/n11`](https://www.npmjs.com/package/@lonca/n11)
- Per-package CHANGELOG.md: [trendyol](https://github.com/zanaat-dev/lonca/blob/main/sdks/trendyol/CHANGELOG.md) · [hepsiburada](https://github.com/zanaat-dev/lonca/blob/main/sdks/hepsiburada/CHANGELOG.md) · [n11](https://github.com/zanaat-dev/lonca/blob/main/sdks/n11/CHANGELOG.md) · [core](https://github.com/zanaat-dev/lonca/blob/main/packages/core/CHANGELOG.md)
