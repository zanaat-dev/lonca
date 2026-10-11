// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc';

// https://astro.build/config
export default defineConfig({
  site: 'https://lonca.zanaat.dev',
  devToolbar: { enabled: false },
  integrations: [
    starlight({
      title: 'Lonca SDKs',
      description:
        'Type-safe TypeScript SDKs for Turkish e-commerce marketplaces (Trendyol, Hepsiburada).',
      logo: {
        // Source-of-truth: the repo's brand/ directory, copied
        // into docs/public/brand/ via `pnpm docs:sync-brand` (runs automatically
        // before docs:dev / docs:build). The SVG carries its own
        // `prefers-color-scheme` rule, so a single file adapts to Starlight's
        // light/dark themes without a `dark` pair.
        src: './public/brand/logomark.svg',
        replacesTitle: true,
      },
      favicon: '/brand/icon.svg',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/zanaat-dev/lonca' }],
      editLink: {
        baseUrl: 'https://github.com/zanaat-dev/lonca/edit/main/docs/',
      },
      lastUpdated: true,
      pagination: true,
      components: {
        // Append a site-wide "unofficial / not affiliated" disclaimer to every page.
        Footer: './src/components/Footer.astro',
      },
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 4 },
      plugins: [
        starlightTypeDoc({
          entryPoints: [
            '../packages/core/src/index.ts',
            '../sdks/trendyol/src/index.ts',
            '../sdks/hepsiburada/src/index.ts',
          ],
          tsconfig: '../tsconfig.base.json',
          typeDoc: {
            entryPointStrategy: 'expand',
            // A readme keeps starlight-typedoc from deleting the per-package entry pages
            // (it drops nested README.md files when no readme is configured, which left
            // the module links on /api/readme/ pointing at 404s).
            readme: './api-overview.md',
            excludeInternal: true,
            excludePrivate: true,
            includeVersion: false,
            skipErrorChecking: true,
            sort: ['kind', 'alphabetical'],
            groupOrder: ['Classes', 'Functions', 'Interfaces', 'Type Aliases', 'Variables', '*'],
          },
          sidebar: {
            label: 'API Reference',
            collapsed: false,
          },
        }),
      ],
      sidebar: [
        {
          label: 'Get started',
          items: [
            { label: 'Overview', slug: 'overview' },
            { label: 'Installation', slug: 'installation' },
            { label: 'Authentication', slug: 'authentication' },
            { label: 'Stability & versioning', slug: 'stability' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Trendyol in 30 minutes', slug: 'guides/trendyol-in-30-minutes' },
            { label: 'Trendyol', slug: 'guides/trendyol' },
            { label: 'Hepsiburada', slug: 'guides/hepsiburada' },
            { label: 'Webhook events', slug: 'guides/webhook-events' },
          ],
        },
        typeDocSidebarGroup,
      ],
      customCss: ['/src/styles/custom.css'],
    }),
  ],
});
