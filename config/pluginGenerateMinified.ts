import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { minify } from '@swc/core';
import { type RsbuildPlugin, logger } from 'rstack/app';

/**
 * Compile runtime code to ES5.
 *
 * Transform `src/runtime/${filename}.ts` to
 * `dist/runtime/${filename}.js` and `dist/runtime/${filename}.min.js`.
 */
export const pluginGenerateMinified = (filename: string): RsbuildPlugin => ({
  name: 'rsbuild-plugin-compile-runtime',
  setup(api) {
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
