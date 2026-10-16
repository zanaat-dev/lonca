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

# All three (a typical multi-marketplace seller)
pnpm add @lonca/trendyol @lonca/hepsiburada @lonca/n11 @lonca/core
```

## Versioning

Lonca uses [Changesets](https://github.com/changesets/changesets) for releases. Every package is at `1.0` or later and follows semver: breaking changes ship only in major versions, so a caret range is safe:

```jsonc
{
  "dependencies": {
    "@lonca/core": "^1.1.0",
    "@lonca/hepsiburada": "^1.3.0",
    "@lonca/n11": "^1.0.0",
    "@lonca/trendyol": "^1.3.0",
  },
}
```

[Stability & versioning](/stability/) has the full policy; [Migrating to 1.0](/migrating-to-1-0/) covers upgrades from `0.x`.

## Stable releases & changelogs

- npm: [`@lonca/core`](https://www.npmjs.com/package/@lonca/core) · [`@lonca/trendyol`](https://www.npmjs.com/package/@lonca/trendyol) · [`@lonca/hepsiburada`](https://www.npmjs.com/package/@lonca/hepsiburada) · [`@lonca/n11`](https://www.npmjs.com/package/@lonca/n11)
- Per-package CHANGELOG.md: [trendyol](https://github.com/zanaat-dev/lonca/blob/main/sdks/trendyol/CHANGELOG.md) · [hepsiburada](https://github.com/zanaat-dev/lonca/blob/main/sdks/hepsiburada/CHANGELOG.md) · [n11](https://github.com/zanaat-dev/lonca/blob/main/sdks/n11/CHANGELOG.md) · [core](https://github.com/zanaat-dev/lonca/blob/main/packages/core/CHANGELOG.md)
