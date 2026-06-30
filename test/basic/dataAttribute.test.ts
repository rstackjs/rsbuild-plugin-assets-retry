import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createRsbuild } from '@rsbuild/core';
import { ASSETS_RETRY_DATA_ATTRIBUTE, pluginAssetsRetry } from '../../dist';
import { getRandomPort } from './helper';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(__dirname, '../../dist/runtime');
const es6PlusSyntaxRE = /\b(?:const|let|class)\b|=>|\?\?|\?\.|\.\.\.|`/;
const runtimeFiles = [
  'initialChunkRetry.js',
  'initialChunkRetry.min.js',
  'asyncChunkRetry.js',
  'asyncChunkRetry.min.js',
];

test('should emit retry runtime without ES6+ syntax', () => {
  for (const filename of runtimeFiles) {
    const code = fs.readFileSync(path.join(runtimeDir, filename), 'utf-8');
    expect(code).not.toMatch(es6PlusSyntaxRE);
  }
});

test('should add data attribute to inline retry script', async ({ page }) => {
  const rsbuild = await createRsbuild({
    cwd: import.meta.dirname,
    rsbuildConfig: {
      plugins: [
        pluginAssetsRetry({
          inlineScript: true,
        }),
      ],
      server: {
        port: getRandomPort(),
      },
    },
  });

  const { server, urls } = await rsbuild.startDevServer();

  await page.goto(urls[0]);

  // Check if inline script has correct data attribute
  const inlineScript = await page.locator(
    `script[${ASSETS_RETRY_DATA_ATTRIBUTE}="inline"]`,
  );
  expect(await inlineScript.count()).toBe(1);

  // Verify script content contains retry logic
  const scriptContent = await inlineScript.innerHTML();
  expect(scriptContent).toContain('document.addEventListener');

  await server.close();
});

test('should add data attribute to external retry script', async ({ page }) => {
  const rsbuild = await createRsbuild({
    cwd: import.meta.dirname,
    rsbuildConfig: {
      plugins: [
        pluginAssetsRetry({
          inlineScript: false,
        }),
      ],
      server: {
        port: getRandomPort(),
      },
    },
  });

  const { server, urls } = await rsbuild.startDevServer();

  await page.goto(urls[0]);

  // Check if external script has correct data attribute
  const externalScript = await page.locator(
    `script[${ASSETS_RETRY_DATA_ATTRIBUTE}="external"]`,
  );
  expect(await externalScript.count()).toBe(1);

  // Verify script has src attribute
  const src = await externalScript.getAttribute('src');
  expect(src).toContain('assets-retry');

  await server.close();
});

test('should be able to filter retry script in HTML template', async ({
  page,
}) => {
  const rsbuild = await createRsbuild({
    cwd: import.meta.dirname,
    rsbuildConfig: {
      plugins: [
        pluginAssetsRetry({
          inlineScript: true,
        }),
      ],
      server: {
        port: getRandomPort(),
      },
    },
  });

  const { server, urls } = await rsbuild.startDevServer();

  await page.goto(urls[0]);

  // Simulate using htmlWebpackPlugin.tags.headTags.filter in HTML template
  // Verify that retry scripts can be filtered by data attribute
  const allScripts = await page.locator('script');
  const retryScripts = await page.locator(
    `script[${ASSETS_RETRY_DATA_ATTRIBUTE}]`,
  );

  const allScriptsCount = await allScripts.count();
  const retryScriptsCount = await retryScripts.count();

  // Should have at least one script, and retry script should be one of them
  expect(allScriptsCount).toBeGreaterThan(0);
  expect(retryScriptsCount).toBe(1);

  await server.close();
});
