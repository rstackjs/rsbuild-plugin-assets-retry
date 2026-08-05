import { ERROR_PREFIX } from '../constants.js';

/**
 * Resolve `config.domain` to a `string[]`.
 *
 * When `domain` is a function, it is evaluated in the browser and the result is
 * cached back onto `config.domain`, so the function runs once when the retry
 * script starts rather than on every retry.
 */
export function getDomainList(config: NormalizedRuntimeRetryOptions): string[] {
  const { domain } = config;
  if (typeof domain !== 'function') {
    return domain;
  }
  let resolved: string[];
  try {
    const value = domain();
    resolved = Array.isArray(value) ? value.filter(Boolean) : [];
  } catch (err) {
    console.error(ERROR_PREFIX, 'resolve domain function failed', err);
    resolved = [];
  }
  // Cache the resolved value so the function is evaluated only once.
  config.domain = resolved;
  return resolved;
}

export function findCurrentDomain(
  url: string,
  config: NormalizedRuntimeRetryOptions,
) {
  const domains = getDomainList(config);
  for (let i = 0; i < domains.length; i++) {
    const domain = domains[i];
    if (url.indexOf(domain) !== -1) {
      return domain;
    }
  }
  return window.origin;
}

export function findNextDomain(
  url: string,
  config: NormalizedRuntimeRetryOptions,
) {
  const domains = getDomainList(config);
  const currentDomain = findCurrentDomain(url, config);
  const index = domains.indexOf(currentDomain);
  return index === -1 ? currentDomain : domains[(index + 1) % domains.length];
}

const postfixRE = /[?#].*$/;
function cleanUrl(url: string) {
  return url.replace(postfixRE, '');
}
export function getQueryFromUrl(url: string) {
  const parts = url.split('?')[1];
  return parts ? `?${parts.split('#')[0]}` : '';
}

function getUrlRetryQuery(
  existRetryTimes: number,
  originalQuery: string,
  config: NormalizedRuntimeRetryOptions,
): string {
  if (config.addQuery === true) {
    return originalQuery !== ''
      ? `${originalQuery}&retry=${existRetryTimes}`
      : `?retry=${existRetryTimes}`;
  }
  if (typeof config.addQuery === 'function') {
    return config.addQuery({ times: existRetryTimes, originalQuery });
  }
  return '';
}

export function getNextRetryUrl(
  currRetryUrl: string,
  domain: string,
  nextDomain: string,
  existRetryTimes: number,
  originalQuery: string,
  config: NormalizedRuntimeRetryOptions,
) {
  return (
    cleanUrl(currRetryUrl.replace(domain, nextDomain)) +
    getUrlRetryQuery(existRetryTimes + 1, originalQuery, config)
  );
}
