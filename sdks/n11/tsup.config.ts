import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/testing.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  target: 'node22',
});
