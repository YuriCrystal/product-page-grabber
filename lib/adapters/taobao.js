// Taobao / Tmall adapter.
//
// Handles:
//   - item.taobao.com / detail.tmall.com product pages
//   - s.taobao.com/search keyword search
//   - 搜同款 (image search) via taobao.com homepage
//
// Key tricks (see docs/DEVNOTE.md):
//   - Seller-ID-lock: extract the most-frequent /<sellerId>/O1CN segment from
//     image URLs to filter out cross-seller recommendation bleed
//   - recommendation-bleed DOM walker: skip images whose ancestor has
//     class/id matching /recomm|guess|猜你|相关|相關|sidebar|hot/i
//   - Filename dedup: strip CDN host/query and dedup by base filename
//   - SKU image hunt: scan window.__INIT_DATA__ / pageData and inline
//     <script> tags for alicdn URLs not in the main set

const { BaseAdapter } = require('./base');

class TaobaoAdapter extends BaseAdapter {
  static id = 'taobao';
  static displayName = 'Taobao / Tmall';

  static get loginUrl() {
    return 'https://login.taobao.com/';
  }

  static matchUrl(url) {
    return /item\.taobao\.com|detail\.tmall\.com/.test(url);
  }

  // ============ Keyword search ============

  static supportsKeywordSearch = true;

  static buildSearchUrl(keyword) {
    return `https://s.taobao.com/search?q=${encodeURIComponent(keyword)}`;
  }

  static async extractResults(page) {
    return page.evaluate(() => {
      const items = [];
      const seen = new Set();
      const links = document.querySelectorAll(
        'a[href*="item.taobao.com"], a[href*="detail.tmall.com"]'
      );
      links.forEach((a) => {
        const idMatch = a.href.match(/[?&]id=(\d+)/);
        if (!idMatch) return;
        const id = idMatch[1];
        if (seen.has(id)) return;

        // Walk up to find a card with title + price
        let card = a;
        for (let depth = 0; depth < 8 && card; depth++) {
          const t = card.innerText || '';
          if (t.length > 10 && t.length < 500) break;
          card = card.parentElement;
        }
        if (!card) card = a;
        const text = (card.innerText || '').replace(/\s+/g, ' ').trim();
        const priceMatch = text.match(/¥\s*[\d.,]+/);
        const price = priceMatch ? priceMatch[0].replace(/\s+/g, '') : '';
        let title = text;
        if (priceMatch) title = text.slice(0, priceMatch.index).trim();
        title = title.slice(0, 80);
        if (title.length < 3) return;

        seen.add(id);
        items.push({
          id,
          url: a.href.split('?')[0] + '?id=' + id,
          title,
          price,
        });
      });
      return items.slice(0, 15);
    });
  }

  // ============ Image search ============

  static supportsImageSearch = true;

  static async openImageSearch(page) {
    await page.goto('https://www.taobao.com', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    if (page.url().includes('login')) {
      throw new Error('Not logged in. Run: node setup.js');
    }
    const sameBtn = page.locator('text=搜同款').first();
    await sameBtn.waitFor({ state: 'visible', timeout: 10000 });
    await sameBtn.click();
    await page.waitForTimeout(1500);
  }

  static async uploadImage(page, imagePath) {
    let uploaded = false;
    try {
      const fcp = page.waitForEvent('filechooser', { timeout: 5000 });
      await page.locator('text=上传图片').first().click({ timeout: 5000 });
      const chooser = await fcp;
      await chooser.setFiles(imagePath);
      uploaded = true;
    } catch (_) {
      // fall through to direct input
    }
    if (!uploaded) {
      const inputs = await page.locator('input[type="file"]').all();
      for (const inp of inputs) {
        try {
          await inp.setInputFiles(imagePath);
          uploaded = true;
          break;
        } catch (_) {}
      }
    }
    if (!uploaded) throw new Error('No file input accepted the image');
  }

  static async waitForImageResults(page) {
    await page.waitForURL(/s\.taobao\.com|s\.m\.taobao\.com|tu\.taobao\.com|s\.tmall\.com/, {
      timeout: 45000,
    });
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(4000);
  }

  // ============ Main image extraction ============

  static async extractMainImages(page) {
    // 1. Collect all alicdn URLs from <img>, background-image, and iframes,
    //    excluding ancestors that look like recommendation carousels.
    const allUrls = await page.evaluate(() => {
      const set = new Set();
      const inRecommend = (el) => {
        let n = el;
        while (n && n !== document.body) {
          const cls = n.className && n.className.toString ? n.className.toString() : '';
          const id = (n.id || '').toString();
          if (/recomm|guess|猜你|相关|相關|sidebar|hot[_-]|bought|bottombar/i.test(cls + ' ' + id)) {
            return true;
          }
          n = n.parentElement;
        }
        return false;
      };
      const collect = (s) => {
        if (!s) return;
        if (s.startsWith('//')) s = 'https:' + s;
        if (!/alicdn\.com/.test(s)) return;
        s = s
          .replace(/_\d+x\d+(q\d+)?\.(jpg|jpeg|png|webp).*$/i, '')
          .replace(/_q\d+\.(jpg|jpeg|png|webp).*$/i, '')
          .replace(/_\.webp$/i, '')
          .replace(/~crop,[\d,]+~/, '');
        set.add(s);
      };
      document.querySelectorAll('img').forEach((i) => {
        if (inRecommend(i)) return;
        [i.currentSrc, i.src, i.dataset.src, i.dataset.original, i.dataset.ks_lazyload].forEach(
          collect
        );
      });
      document.querySelectorAll('*').forEach((el) => {
        if (inRecommend(el)) return;
        const bg = getComputedStyle(el).backgroundImage;
        if (bg && bg.includes('alicdn')) {
          const m = bg.match(/url\(["']?([^"')]+)/);
          if (m) collect(m[1]);
        }
      });
      document.querySelectorAll('iframe').forEach((f) => {
        try {
          f.contentDocument.querySelectorAll('img').forEach((i) => collect(i.src));
        } catch (_) {}
      });
      return [...set];
    });

    // 2. Filter to product image pattern, then seller-ID-lock to the dominant seller.
    let urls = allUrls.filter((u) => /\/\d{8,}\/O1CN/.test(u));
    const sellerCounts = {};
    for (const u of urls) {
      const m = u.match(/\/(\d{8,})\/O1CN/);
      if (m) sellerCounts[m[1]] = (sellerCounts[m[1]] || 0) + 1;
    }
    const targetSeller = Object.entries(sellerCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (targetSeller) {
      urls = urls.filter((u) => u.includes(`/${targetSeller}/`));
    }

    // 3. Filename-level dedup (same image on gw.alicdn vs img.alicdn etc.)
    const seen = new Set();
    return urls.filter((u) => {
      const base = u.split('/').pop().replace(/[?#].*$/, '');
      if (seen.has(base)) return false;
      seen.add(base);
      return true;
    });
  }

  // ============ SKU / variant image extraction ============

  static async extractSkuImages(page) {
    return page.evaluate(() => {
      const set = new Set();
      const norm = (s) => {
        if (!s) return null;
        if (s.startsWith('//')) s = 'https:' + s;
        if (!/alicdn\.com/.test(s)) return null;
        return s
          .replace(/_\d+x\d+(q\d+)?\.(jpg|jpeg|png|webp).*$/i, '')
          .replace(/_q\d+\.(jpg|jpeg|png|webp).*$/i, '')
          .replace(/_\.webp$/i, '')
          .replace(/~crop,[\d,]+~/, '');
      };

      // 1) DOM: SKU selector / prop-picker areas
      const skuEls = document.querySelectorAll(
        '[class*="sku" i] img, [class*="prop" i] img, [class*="option" i] img, ' +
          '[data-sku-id] img, [data-spm*="sku"] img, ' +
          '.J_SKU_Combo_Image, [class*="selector"] img, [class*="Selector"] img, ' +
          '[class*="thumb" i] img, [class*="variant" i] img, [class*="color" i] img'
      );
      skuEls.forEach((img) => {
        [img.currentSrc, img.src, img.dataset.src, img.dataset.original].forEach((s) => {
          const u = norm(s);
          if (u) set.add(u);
        });
      });

      // 2) Scan Taobao's JS data objects (loaded inline before hydration)
      const jsonStr = JSON.stringify(
        window.__INIT_DATA__ || window.pageData || window.__GLOBAL_DATA__ || {}
      );
      const urlRe = /(?:https?:)?\/\/[^\s"']+alicdn\.com\/[^\s"']+/g;
      for (const m of jsonStr.matchAll(urlRe)) {
        const u = norm(m[0].replace(/\\u002F/g, '/'));
        if (u) set.add(u);
      }

      // 3) Scan inline <script> tags too — some SKU data only lives there
      document.querySelectorAll('script:not([src])').forEach((s) => {
        const t = s.textContent || '';
        for (const m of t.matchAll(urlRe)) {
          const u = norm(m[0].replace(/\\u002F/g, '/'));
          if (u) set.add(u);
        }
      });

      return [...set];
    });
  }
}

module.exports = { TaobaoAdapter };
