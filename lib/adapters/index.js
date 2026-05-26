// Adapter registry + URL → adapter resolution.

const { TaobaoAdapter } = require('./taobao');
const { Adapter1688 } = require('./alibaba1688');
const { MercariAdapter } = require('./mercari');

// Order matters: more specific URL patterns first.
// 1688 is checked before Taobao because both could conceivably match if a URL
// has both keywords (unlikely, but safer).
const ADAPTERS = [Adapter1688, TaobaoAdapter, MercariAdapter];

/**
 * Find the adapter that handles a given URL.
 * @param {string} url
 * @returns {typeof import('./base').BaseAdapter | null}
 */
function resolveAdapter(url) {
  return ADAPTERS.find((A) => A.matchUrl(url)) || null;
}

/**
 * Get adapter by id (e.g. 'taobao', '1688', 'mercari').
 */
function getAdapter(id) {
  return ADAPTERS.find((A) => A.id === id) || null;
}

/**
 * Default adapter for non-URL inputs (keyword / image) when --site is not given.
 */
function defaultAdapter() {
  return TaobaoAdapter;
}

module.exports = { ADAPTERS, resolveAdapter, getAdapter, defaultAdapter };
