import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@rstest/playwright';
import { createRsbuild } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import type { Page } from 'playwright';
import { pluginAssetsRetry } from '../../dist';
import { getRandomPort, gotoPage } from './helper';
import {
  createBlockMiddleware,
  createRsbuildWithMiddleware,
  delay,
  proxyPageConsole,
} from './helper';

test('domain as a function should be resolved in the browser at runtime', async ({
  page,
}) => {
  const blockedMiddleware = createBlockMiddleware({
    blockNum: 100,
    urlPrefix: '/static/js/index.js',
  });

  const port = await getRandomPort();
  const rsbuild = await createRsbuildWithMiddleware(
    blockedMiddleware,
    {
      minify: true,
      // The function is serialized into the runtime and evaluated in the
      // browser at startup. It must be self-contained (no build-time closure),
      // so it reads the origin from `window` rather than the build `port`.
      domain: () => [
        window.location.origin,
        'http://a.com/foo-path',
        'http://b.com',
      ],
      onRetry(context) {
        console.info('onRetry', context);
      },
      onSuccess(context) {
        console.info('onSuccess', context);
      },
      onFail(context) {
        console.info('onFail', context);
      },
    },
    undefined,
    port,
  );

  const { onRetryContextList, onFailContextList, onSuccessContextList } =
    await proxyPageConsole(page, rsbuild.port);

  await gotoPage(page, rsbuild);
  await delay();

  // Behaves identically to the equivalent static `domain` array, proving the
  // function was evaluated in the browser and resolved to the domain list.
  expect({
    onRetryContextList,
    onFailContextList,
    onSuccessContextList,
  }).toMatchObject({
    onRetryContextList: [
      {
        times: 0,
        domain: '<ORIGIN>',
        url: '<ORIGIN>/static/js/index.js',
        tagName: 'script',
        isAsyncChunk: false,
      },
      {
        times: 1,
        domain: 'http://a.com/foo-path',
        url: 'http://a.com/foo-path/static/js/index.js',
        tagName: 'script',
        isAsyncChunk: false,
      },
      {
        times: 2,
        domain: 'http://b.com',
        url: 'http://b.com/static/js/index.js',
        tagName: 'script',
        isAsyncChunk: false,
      },
    ],
    onFailContextList: [
      {
        times: 3,
        domain: '<ORIGIN>',
        url: '<ORIGIN>/static/js/index.js',
        tagName: 'script',
        isAsyncChunk: false,
      },
    ],
    onSuccessContextList: [],
  });
  await rsbuild.server.close();
});

async function proxyDeploymentToPreview(
  page: Page,
  deploymentOrigin: string,
  previewOrigin: string,
) {
  let initialEntryBlocked = false;
  const origins = new Set([deploymentOrigin, 'https://a.com', 'https://b.com']);

  for (const origin of origins) {
    await page.route(`${origin}/**`, async (route) => {
      const requestUrl = new URL(route.request().url());
      const isInitialEntry =
        requestUrl.origin === deploymentOrigin &&
        route.request().resourceType() === 'script' &&
        /^\/static\/js\/index(?:\.|-)/.test(requestUrl.pathname);

      if (isInitialEntry && !initialEntryBlocked) {
        initialEntryBlocked = true;
        await route.fulfill({
          status: 404,
          contentType: 'application/javascript',
          body: '',
        });
        return;
      }

      const pathname = requestUrl.pathname.replace(/^\/foo-path(?=\/)/, '');
      const previewUrl = new URL(
        `${pathname}${requestUrl.search}`,
        previewOrigin,
      );
      const response = await route.fetch({ url: previewUrl.href });
      await route.fulfill({ response });
    });
  }
}

test('the same output should retry from different deployment origins', async ({
  page,
}) => {
  const distPath = await mkdtemp(
    join(tmpdir(), 'assets-retry-function-domain-'),
  );
  let closeBuild: (() => Promise<void>) | undefined;
  let closeServer: (() => Promise<void>) | undefined;

  try {
    const rsbuild = await createRsbuild({
      cwd: import.meta.dirname,
      rsbuildConfig: {
        plugins: [
          pluginReact(),
          pluginAssetsRetry({
            domain: () => [
              window.location.origin,
              'https://a.com/foo-path',
              'https://b.com',
            ],
            onRetry(context) {
              console.info('onRetry', context);
            },
            onSuccess(context) {
              console.info('onSuccess', context);
            },
            onFail(context) {
              console.info('onFail', context);
            },
          }),
        ],
        output: {
          cleanDistPath: false,
          distPath: {
            root: distPath,
          },
          sourceMap: false,
        },
        server: {
          port: await getRandomPort(),
        },
      },
    });

    // Build only once. The same emitted files are served under both origins.
    const buildResult = await rsbuild.build();
    closeBuild = buildResult.close;
    const preview = await rsbuild.preview({ getPortSilently: true });
    closeServer = preview.server.close;
    const previewOrigin = `http://localhost:${preview.port}`;

    const deployments = [
      {
        page,
        origin: previewOrigin,
        expectedInitialDomain: '<ORIGIN>',
      },
      {
        page: await page.context().newPage(),
        origin: 'https://a.com',
        expectedInitialDomain: 'https://a.com',
      },
    ];

    try {
      for (const deployment of deployments) {
        await proxyDeploymentToPreview(
          deployment.page,
          deployment.origin,
          previewOrigin,
        );
        const { onRetryContextList, onFailContextList, onSuccessContextList } =
          await proxyPageConsole(deployment.page, preview.port);

        await deployment.page.goto(`${deployment.origin}/index.html`);
        await expect(deployment.page.locator('#comp-test')).toHaveText(
          'Hello CompTest',
        );
        await delay();

        expect(
          await deployment.page.evaluate(() => window.location.origin),
        ).toBe(deployment.origin);
        expect(onRetryContextList).toHaveLength(1);
        expect(onRetryContextList[0]).toMatchObject({
          times: 0,
          domain: deployment.expectedInitialDomain,
          url: expect.stringContaining(
            `${deployment.expectedInitialDomain}/static/js/index.`,
          ),
          tagName: 'script',
          isAsyncChunk: false,
        });
        expect(onSuccessContextList).toHaveLength(1);
        expect(onSuccessContextList[0]).toMatchObject({
          times: 1,
          url: expect.stringContaining(
            'https://a.com/foo-path/static/js/index.',
          ),
          tagName: 'script',
          isAsyncChunk: false,
        });
        expect(onFailContextList).toEqual([]);
      }
    } finally {
      await deployments[1].page.close();
    }
  } finally {
    await closeServer?.();
    await closeBuild?.();
    await rm(distPath, { recursive: true, force: true });
  }
});
