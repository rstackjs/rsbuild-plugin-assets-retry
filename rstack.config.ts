// Configuration guide: https://rstack.rs/config
import { define } from 'rstack';
import pkgJson from './package.json' with { type: 'json' };

define.lib(async () => {
  const { pluginGenerateMinified } =
    await import('./config/pluginGenerateMinified.ts');
  const { pluginPublint } = await import('rsbuild-plugin-publint');

  return {
    plugins: [pluginPublint()],
    lib: [
      {
        syntax: 'es2023',
        dts: {
          bundle: true,
        },
        source: {
          entry: {
            index: 'src/index.ts',
          },
        },
      },
      {
        format: 'iife',
        syntax: 'es6',
        source: {
          entry: {
            'runtime/initialChunkRetry': 'src/runtime/initialChunkRetry.ts',
          },
        },
        output: {
          target: 'web',
        },
        plugins: [pluginGenerateMinified('initialChunkRetry')],
      },
      {
        format: 'iife',
        syntax: 'es6',
        source: {
          entry: {
            'runtime/asyncChunkRetry': 'src/runtime/asyncChunkRetry.ts',
          },
        },
        output: {
          target: 'web',
        },
        plugins: [pluginGenerateMinified('asyncChunkRetry')],
      },
    ],
    source: {
      define: {
        PLUGIN_VERSION: JSON.stringify(pkgJson.version.replace(/\./g, '-')),
      },
    },
  };
});

define.test({
  env: {
    // Let Rsbuild choose the mode based on the command.
    NODE_ENV: undefined,
  },
  isolate: false,
});

define.fmt({
  ignorePatterns: ['.rslib/**', 'dist/**'],
  singleQuote: true,
  sortPackageJson: true,
});

define.staged({
  '*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}': ['rs lint --fix', 'rs fmt'],
  '*.{json,md,mdx,css,scss,less,html,yml,yaml}': 'rs fmt',
});

define.lint(({ js, ts }) => [
  {
    ignores: ['src/runtime/runtime.d.ts'],
  },
  js.configs.recommended,
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
  {
    files: ['test/**/*'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]);
