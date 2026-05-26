// Behance adapter — for archiving design project images.
//
// Behance project pages have a gallery of high-res images embedded via
// the mir-s3-cdn-cf.behance.net CDN. Each project image is served at
// multiple resolutions; we prefer the `source/` variant (original size).
//
// URL patterns:
//   - Project: https://www.behance.net/gallery/<id>/<slug>
//   - Search:  https://www.behance.net/search/projects?search=<keyword>
//   - Image:   https://mir-s3-cdn-cf.behance.net/project_modules/<size>/<hash>.<ext>
//              sizes: source (original) > 2800_opt_1 > 1400_opt_1 > disp > max_632
//
// Behance is fully public (no login wall for browsing). C2C-style — no SKU,
// no recommendation bleed problem to solve (project images are well-scoped).

const { BaseAdapter } = require('./base');

// Behance serves project module images at multiple resolutions. We pick the
// largest available per image hash by extracting any embedded pixel width
// from the size segment of the path: /project_modules/<size>/<hash>.<ext>
//
// Known size segment formats:
//   - source            (original, no resize)        → pixels = Infinity
//   - 2800_webp / 1400_webp / 2800_opt_1            → pixels = the number
//   - fs_webp           (fullscreen)                  → ~ 1920
//   - max_3840 / max_1920                            → pixels = the number
//   - disp / disp_2     (display, small preview)     → 500
//   - hd_v1                                          → 1200
function behanceSizePixels(seg) {
  if (!seg) return 0;
  if (seg === 'source') return Infinity;
  if (seg.startsWith('fs')) return 1920;
  if (seg.startsWith('disp')) return 500;
  if (seg.startsWith('hd')) return 1200;
  const m = seg.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 800;
}

class BehanceAdapter extends BaseAdapter {
  static id = 'behance';
  static displayName = 'Behance';

  static get loginUrl() {
    return 'https://www.behance.net/';
  }

  static matchUrl(url) {
    return /behance\.net\/gallery\/\d+/.test(url);
  }

  // ============ Keyword search ============

  static supportsKeywordSearch = true;

  static buildSearchUrl(keyword) {
    return `https://www.behance.net/search/projects?search=${encodeURIComponent(keyword)}`;
  }

  static async extractResults(page) {
    await page.waitForTimeout(3000);
    // Behance is heavy SPA — scroll once to trigger render
    await page.evaluate(() => window.scrollBy(0, 600));
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollTo(0, 0));

    return page.evaluate(() => {
      const items = [];
      const seen = new Set();
      const links = document.querySelectorAll('a[href*="/gallery/"]');
      links.forEach((a) => {
        const m = a.href.match(/behance\.net\/gallery\/(\d+)\/([^?#]+)/);
        if (!m) return;
        const id = m[1];
        if (seen.has(id)) return;

        // Walk up to find a card with title
        let card = a;
        for (let depth = 0; depth < 8 && card; depth++) {
          const t = card.innerText || '';
          if (t.length > 5 && t.length < 300) break;
          card = card.parentElement;
        }
        const text = ((card && card.innerText) || a.innerText || '').replace(/\s+/g, ' ').trim();
        const title = text.slice(0, 80) || decodeURIComponent(m[2]).replace(/-/g, ' ');

        seen.add(id);
        items.push({
          id,
          url: a.href.split('?')[0],
          title,
          price: '', // Behance has no prices
        });
      });
      return items.slice(0, 15);
    });
  }

  static supportsImageSearch = false;

  // ============ Main image extraction ============

  static async extractMainImages(page) {
    // Behance lazy-loads project modules as you scroll. Do a thorough scroll.
    await page.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const height = () => document.body.scrollHeight;
      let y = 0;
      while (y < height()) {
        window.scrollTo(0, y);
        await wait(700);
        y += 600;
      }
      window.scrollTo(0, height());
      await wait(2000);
      window.scrollTo(0, 0);
    });

    const allUrls = await page.evaluate(() => {
      const set = new Set();
      const collect = (s) => {
        if (!s) return;
        if (s.startsWith('//')) s = 'https:' + s;
        // Accept anything that looks like an image CDN URL — we'll filter later
        if (!/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(s)) return;
        set.add(s);
      };
      document.querySelectorAll('img').forEach((i) => {
        [i.currentSrc, i.src, i.dataset.src, i.dataset.original].forEach(collect);
        // Behance uses srcset heavily — collect the highest-res candidate too
        if (i.srcset) {
          i.srcset.split(',').forEach((entry) => {
            const url = entry.trim().split(/\s+/)[0];
            collect(url);
          });
        }
      });
      document.querySelectorAll('*').forEach((el) => {
        const bg = getComputedStyle(el).backgroundImage;
        if (bg && /behance\.net/.test(bg)) {
          const m = bg.match(/url\(["']?([^"')]+)/);
          if (m) collect(m[1]);
        }
      });
      return [...set];
    });

    // Keep only the project's actual artwork:
    //   - /project_modules/<size>/<hash>.<ext>     (per-module images, multi-res)
    //   - /projects/original/<hash>.<ext>          (original cover/single image)
    // The hash in both cases starts with the project ID for this project.
    const urls = allUrls.filter(
      (u) => /\/project_modules\//.test(u) || /\/projects\/original\//.test(u)
    );

    // Group by image hash, pick the highest-resolution variant per hash.
    const byHash = new Map();
    for (const url of urls) {
      let size, hash, ext;
      const mod = url.match(/\/project_modules\/([^/]+)\/([\w.]+)\.(jpg|jpeg|png|gif|webp)/i);
      const orig = url.match(/\/projects\/original\/([\w.]+)\.(jpg|jpeg|png|gif|webp)/i);
      if (mod) {
        [, size, hash, ext] = mod;
      } else if (orig) {
        size = 'source';
        [, hash, ext] = orig;
      } else {
        continue;
      }
      const pixels = behanceSizePixels(size);
      // Key by hash only — strip any trailing `.suffix` segments that vary
      // between size variants (e.g. `.696369631c7c0` is a per-variant tag)
      const baseHash = hash.split('.')[0];
      const key = `${baseHash}.${ext.toLowerCase()}`;
      const existing = byHash.get(key);
      if (!existing || pixels > existing.pixels) {
        byHash.set(key, { url, pixels });
      }
    }

    return [...byHash.values()].map((x) => x.url);
  }

  // Behance projects don't have variants → no SKU
  static async extractSkuImages(page) {
    return [];
  }
}

module.exports = { BehanceAdapter };
