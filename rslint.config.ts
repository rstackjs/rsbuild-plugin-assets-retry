import { defineConfig, ts } from '@rslint/core';

export default defineConfig([
  {
    ignores: ['src/runtime/runtime.d.ts'],
  },
  ts.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['src/runtime/asyncChunkRetry.ts'],
    rules: {
      'prefer-rest-params': 'off',
    },
  },
]);
