# Lonca brand assets

Canonical brand files for Lonca. Source of truth: this directory. Every other use (docs site, READMEs, package metadata) references files from here.

These files lived in [`zanaat-dev/.github`](https://github.com/zanaat-dev/.github/tree/main/brand) until October 2026, when that repository became the profile of the Zanaat umbrella organization. The copies there stay because READMEs already published to npm still load them.

## Files

| File                                         | Use                                                                 | Size baseline  |
| -------------------------------------------- | ------------------------------------------------------------------- | -------------- |
| [`icon.svg`](./icon.svg)                     | Symbol mark alone (avatars, favicons, square containers, app icons) | 24×24, scales  |
| [`wordmark.svg`](./wordmark.svg)             | Word "lonca" alone (footers, tight inline contexts)                 | 83×24, scales  |
| [`logomark.svg`](./logomark.svg)             | Full lockup: symbol + word (primary lockup, README hero, site logo) | 114×24, scales |
| [`social-preview.png`](./social-preview.png) | GitHub repo Social Preview (1280×640)                               | —              |

## One file, both themes

Each SVG carries its own contrast logic. The mark is drawn with `fill="currentColor"` and the SVG ships an inline `<style>` block that sets `color` based on `prefers-color-scheme`:

```svg
<style>
  svg { color: #2A272C; }                                  /* light: ink */
  @media (prefers-color-scheme: dark) { svg { color: #FAFAF9; } }
</style>
```

This means a single file works everywhere:

- **`<img src="...">`** in READMEs — browsers (GitHub, npm) honor `prefers-color-scheme` inside the SVG document, so the mark flips on dark mode automatically.
- **Inline SVG / Starlight theming** — outside CSS (`.starlight svg { color: ... }`) overrides the inline rule because CSS specificity favors the consuming document, so the host theme wins.
- **Favicons** — modern browsers apply the same media query when rendering the tab icon.

We scope the rule to `svg` (rather than `:root`) so that if someone inlines the SVG into HTML the rule doesn't leak onto the host page's `color`. No `*-light.svg` / `*-mono.svg` companions. No `<picture>` markup. One file, one URL.

## Color tokens

| Token                 | Hex       | Use                                                         |
| --------------------- | --------- | ----------------------------------------------------------- |
| `brand.ink`           | `#2A272C` | Default mark color. Body-text adjacent — readable on white. |
| `brand.surface-light` | `#FFFFFF` | Mark on white.                                              |
| `brand.surface-dark`  | `#0F0E10` | Mark inverted on dark — paired with `#FAFAF9` ink.          |

For accents and palette extension, defer to the docs site stylesheet (`docs/src/styles/custom.css`).

## Clearspace

Minimum padding around the mark = the height of the **bullet** (the small square at the bottom-right of the icon). For a 24px icon that's ~2px on every side. The lockup follows the same rule — don't crop closer.

## Do's and don'ts

- ✅ Scale uniformly (SVG handles this).
- ✅ Use the icon with type in your own UI — just respect clearspace.
- ✅ Override the inline color via consuming CSS when you need a non-default tint.
- ❌ Don't strip the `<style>` block — it's what makes adaptive contrast work.
- ❌ Don't stretch non-uniformly.
- ❌ Don't add drop-shadows, glows, or borders. The mark is intentionally flat.

## Where these are wired

| Surface                          | File                 | Where                                                |
| -------------------------------- | -------------------- | ---------------------------------------------------- |
| Docs site logo                   | `logomark.svg`       | `docs/astro.config.mjs` → `starlight.logo.src`       |
| Docs site favicon                | `icon.svg`           | `docs/astro.config.mjs` → `favicon`                  |
| Root [README](../README.md) hero | `logomark.svg`       | `<img>` (height 48)                                  |
| Per-package READMEs              | `logomark.svg`       | `<img>` (height 32) — uses GitHub raw URL            |
| GitHub repo social preview       | `social-preview.png` | Upload via Repo Settings → Social preview (one-time) |

## Updating

Edit the canonical files here, then run:

```bash
pnpm docs:sync-brand   # copies brand/* → docs/public/brand/
```

(Run automatically before `pnpm dev` / `pnpm build` in `docs/`.)
