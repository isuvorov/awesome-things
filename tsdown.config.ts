import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/**/*.ts', 'src/**/*.tsx'],
  format: 'esm',
  outDir: 'lib-tsdown',
  // shims: false,
  dts: true,
  splitting: false,
  clean: true,
  sourcemap: true,
});