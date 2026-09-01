// Configuration guide: https://rstack.rs/config
import { define } from 'rstack';
import type { RsbuildPlugin } from 'rstack/app';

define.lib(async () => {
  const path = await import('node:path');
  const { performance } = await import('node:perf_hooks');
  const { minify } = await import('@swc/core');
  const { logger } = await import('rstack/app');
  const { pluginPublint } = await import('rsbuild-plugin-publint');
  const { default: pkgJson } = await import('./package.json', {
    with: { type: 'json' },
  });

  /**
   * Compile runtime code to ES5
   */
  const pluginGenerateMinified: (filename: string) => RsbuildPlugin = (
    filename: string,
  ) => ({
    name: 'rsbuild-plugin-compile-runtime',
    setup(api) {
      /**
       * transform `src/runtime/${filename}.ts`
       * to `dist/runtime/${filename}.js` and `dist/runtime/${filename}.min.js`
       */
      async function minifyRuntimeFile(distCode: string) {
        const startTime = performance.now();
        const { code: minifiedRuntimeCode } = await minify(distCode, {
          ecma: 6,
          // allows SWC to mangle function names
          module: true,
          compress: {
            passes: 5,
            unsafe: true,
          },
        });

        logger.success(
          `minify ${filename} retry runtime code in ${(
            performance.now() - startTime
          ).toFixed(1)} ms`,
        );
        return minifiedRuntimeCode;
      }

      api.processAssets(
        { stage: 'optimize-transfer' },
        async ({ assets, compilation, compiler }) => {
          const minifiedChunkFilePath = path.join(
            'runtime',
            `${filename}.min.js`,
          );

          await Promise.all(
            Object.entries(assets).map(async ([_, assetSource]) => {
              const code = assetSource.source().toString();
              const minifiedCode = await minifyRuntimeFile(code);
              compilation.emitAsset(
                minifiedChunkFilePath,
                new compiler.webpack.sources.RawSource(minifiedCode),
              );
            }),
          );
        },
      );
    },
  });

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
