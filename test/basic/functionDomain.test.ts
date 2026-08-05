import { expect, test } from '@rstest/playwright';
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
