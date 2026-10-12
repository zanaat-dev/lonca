# Changesets

This monorepo uses [Changesets](https://github.com/changesets/changesets) for versioning and publishing.

When you make a change worth releasing:

```bash
pnpm changeset
```

This will prompt you to describe the change. The generated changeset file gets committed to version control.

The summary becomes the package's CHANGELOG entry and its note on the release notes page
([lonca.zanaat.dev/en/changelog](https://lonca.zanaat.dev/en/changelog/)). The Turkish page
([/surum-notlari](https://lonca.zanaat.dev/surum-notlari/)) reads a Turkish version of the
note from an HTML comment at the end of the summary, which GitHub and npm do not render:

```md
---
'@lonca/trendyol': patch
---

`videos.list()` now reads rows from the documented response envelope.

<!-- tr
`videos.list()` artık satırları dokümandaki yanıt zarfından okuyor.
-->
```

The Turkish block is optional: without it, the Turkish page shows the English note and says
so. Maintainers can add it later, in the changeset or in the CHANGELOG entry.

At release time:

```bash
pnpm version-packages   # bump versions based on changesets
pnpm release            # build and publish to npm
```
