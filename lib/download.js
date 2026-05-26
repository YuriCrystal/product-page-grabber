// Concurrent-safe (sequential for politeness) image download via Playwright
// request context — reuses the same cookies as the browsing session.

const fs = require('fs');
const path = require('path');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

/**
 * Download an array of image URLs to a directory.
 * Returns { ok, fail } counters.
 *
 * @param {import('playwright').APIRequestContext} ctx
 * @param {string[]} urls
 * @param {string} outDir
 * @param {object} [opts]
 * @param {string} [opts.referer]   Referer header for the download requests
 * @param {string} [opts.prefix]    Optional log prefix per line (e.g. "SKU ")
 * @param {(line: string) => void} [opts.log]
 */
async function downloadAll(ctx, urls, outDir, opts = {}) {
  const { referer = 'https://example.com/', prefix = '', log = console.log } = opts;
  fs.mkdirSync(outDir, { recursive: true });

  let ok = 0;
  let fail = 0;
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const base = url.split('/').pop().replace(/[?#].*$/, '');
    const name = String(i + 1).padStart(2, '0') + '-' + base;
    const out = path.join(outDir, name);
    try {
      const resp = await ctx.get(url, {
        headers: { Referer: referer, 'User-Agent': UA },
        timeout: 20000,
      });
      if (!resp.ok()) throw new Error('HTTP ' + resp.status());
      const body = await resp.body();
      fs.writeFileSync(out, body);
      log(`  ${prefix}OK  ${name}  ${body.length} bytes`);
      ok++;
    } catch (e) {
      log(`  ${prefix}FAIL ${name}  ${e.message}`);
      fail++;
    }
  }
  return { ok, fail };
}

module.exports = { downloadAll, UA };
