// Adapter registry + URL → adapter resolution.

const { TaobaoAdapter } = require('./taobao');

const ADAPTERS = [TaobaoAdapter];

/**
 * Find the adapter that handles a given URL.
 * @param {string} url
 * @returns {typeof import('./base').BaseAdapter | null}
 */
function resolveAdapter(url) {
  return ADAPTERS.find((A) => A.matchUrl(url)) || null;
}

/**
 * Get adapter by id (e.g. 'taobao').
 */
function getAdapter(id) {
  return ADAPTERS.find((A) => A.id === id) || null;
}

/**
 * Default adapter when no URL is given (e.g. for keyword/image search start).
 * For now defaults to Taobao — future: detect from a --site flag.
 */
function defaultAdapter() {
  return TaobaoAdapter;
}

module.exports = { ADAPTERS, resolveAdapter, getAdapter, defaultAdapter };
