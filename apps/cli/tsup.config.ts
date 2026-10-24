import { defineConfig } from 'tsup';
// Bundle the private workspace packages so the published `aidevkit-cli` package is self-contained.
export default defineConfig({
  entry: { aidevkit: 'src/main.ts' },
  format: ['esm'],
  target: 'node20',
  clean: true,
  noExternal: [/^@aidev\//, 'commander', 'zod', 'yaml', 'diff'],
  banner: { js: '#!/usr/bin/env node\nimport { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);' },
});
