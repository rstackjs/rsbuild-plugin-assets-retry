import { expect, test } from '@rstest/playwright';
import { logger } from '@rsbuild/core';
import { getRandomPort, gotoPage, proxyConsole } from './helper';
import {
  count404Response,
  createBlockMiddleware,
  createRsbuildWithMiddleware,
} from './helper';

test('should work when blocking async chunk', async ({ page }) => {
  logger.level = 'verbose';
  const { logs, restore } = proxyConsole();
  const blockedMiddleware = createBlockMiddleware({
    blockNum: 3,
    urlPrefix: '/static/js/async/src_AsyncCompTest_tsx.js',
  });
  const rsbuild = await createRsbuildWithMiddleware(blockedMiddleware, {});

  await gotoPage(page, rsbuild);
  const compTestElement = page.locator('#async-comp-test');
  await expect(compTestElement).toHaveText('Hello AsyncCompTest');
  const blockedResponseCount = count404Response(
    logs,
    '/static/js/async/src_AsyncCompTest_tsx.js',
  );
  expect(blockedResponseCount).toBe(3);
  await rsbuild.server.close();
  restore();
  logger.level = 'log';
});

test('should work when blocking async css chunk`', async ({ page }) => {
  logger.level = 'verbose';
  const { logs, restore } = proxyConsole();
  const blockedMiddleware = createBlockMiddleware({
    blockNum: 3,
    urlPrefix: '/static/css/async/src_AsyncCompTest_tsx.css',
  });
  const rsbuild = await createRsbuildWithMiddleware(blockedMiddleware, {});

  await gotoPage(page, rsbuild);
  const compTestElement = page.locator('#async-comp-test');
  await expect(compTestElement).toHaveText('Hello AsyncCompTest');
  await expect(compTestElement).toHaveCSS('background-color', 'rgb(0, 0, 139)');
  const blockedResponseCount = count404Response(
    logs,
    '/static/css/async/src_AsyncCompTest_tsx.css',
  );
  expect(blockedResponseCount).toBe(3);
  await rsbuild.server.close();
  restore();
  logger.level = 'log';
});

for (const runtimeMode of ['webpack', 'rspack'] as const) {
  test(`should retry async CSS from the backup domain in ${runtimeMode} runtime mode`, async ({
    page,
  }) => {
    const port = await getRandomPort();
    const origin = `http://localhost:${port}`;
    const backup = 'http://backup-cdn.test';
    const cssPath = '/static/css/async/src_AsyncCompTest_tsx.css';
    const requests: string[] = [];

    await page.route(
      (url) => url.pathname === cssPath,
      async (route) => {
        const url = route.request().url();
        requests.push(url);
        if (url === `${backup}${cssPath}`) {
          const response = await route.fetch({ url: `${origin}${cssPath}` });
          await route.fulfill({ response });
        } else {
          await route.fulfill({ status: 404 });
        }
      },
    );

    const rsbuild = await createRsbuildWithMiddleware(
      [],
      { domain: [origin, backup], max: 2 },
      undefined,
      port,
      undefined,
      runtimeMode,
    );
    try {
      await gotoPage(page, rsbuild);
      await expect(page.locator('#async-comp-test')).toHaveCSS(
        'background-color',
        'rgb(0, 0, 139)',
      );
      expect(requests).toEqual([
        `${origin}${cssPath}`,
        `${origin}${cssPath}`,
        `${backup}${cssPath}`,
      ]);
    } finally {
      await rsbuild.server.close();
    }
  });
}

test('should work with minified runtime code when blocking async chunk', async ({
  page,
}) => {
  logger.level = 'verbose';
  const { logs, restore } = proxyConsole();
  const blockedMiddleware = createBlockMiddleware({
    blockNum: 3,
    urlPrefix: '/static/js/async/src_AsyncCompTest_tsx.js',
  });
  const rsbuild = await createRsbuildWithMiddleware(blockedMiddleware, {
    minify: true,
  });

  await gotoPage(page, rsbuild);
  const compTestElement = page.locator('#async-comp-test');
  await expect(compTestElement).toHaveText('Hello AsyncCompTest');
  const blockedResponseCount = count404Response(
    logs,
    '/static/js/async/src_AsyncCompTest_tsx.js',
  );
  expect(blockedResponseCount).toBe(3);
  await rsbuild.server.close();
  restore();
  logger.level = 'log';
});
