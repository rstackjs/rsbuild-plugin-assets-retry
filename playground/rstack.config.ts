// Configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.app(async () => {
  const [{ pluginReact }, { pluginAssetsRetry }] = await Promise.all([
    import('@rsbuild/plugin-react'),
    import('../dist/index.js'),
  ]);

  function createBlockMiddleware({ urlPrefix, blockNum, onBlock }) {
    let counter = 0;

    return (req, res, next) => {
      if (req.url?.startsWith(urlPrefix)) {
        counter++;
        // if blockNum is 3, 1 2 3 would be blocked, 4 would be passed
        const isBlocked = counter % (blockNum + 1) !== 0;

        if (isBlocked && onBlock) {
          onBlock({
            url: req.url,
            count: counter,
            timestamp: Date.now(),
          });
        }
        if (isBlocked) {
          res.statusCode = 404;
        }
        res.setHeader('block-async', counter);
      }
      next();
    };
  }

  return {
    server: {
      setup: ({ action, server }) => {
        if (action === 'dev') {
          server.middlewares.use(
            createBlockMiddleware({
              urlPrefix: '/static/js/async/src_AsyncCompTest_tsx.js',
              blockNum: 3,
              onBlock: ({ url, count }) => {
                console.info(`Blocked ${url} for the ${count}th time`);
              },
            }),
          );
        }
      },
    },
    plugins: [
      pluginAssetsRetry({
        minify: true,
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
      pluginReact(),
    ],
  };
});
