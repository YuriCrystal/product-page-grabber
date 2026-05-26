// Mercari Japan adapter.
//
// jp.mercari.com is a C2C marketplace — each listing is one unique item
// with its own photo set. No "seller ID lock" needed because cross-seller
// recommendation bleed is much rarer; each item page is fairly self-contained.
//
// Images are served from static.mercdn.net. Two URL forms:
//   - https://static.mercdn.net/item/detail/orig/photos/<id>_<n>.jpg  (full size)
//   - https://static.mercdn.net/c!/w=240,a=0,q=75/thumb/photos/<id>.jpg  (resized)
//
// We normalize both to the orig form for download.

const { BaseAdapter } = require('./base');

class MercariAdapter extends BaseAdapter {
  static id = 'mercari';
  static displayName = 'Mercari Japan';

  static get loginUrl() {
    return 'https://jp.mercari.com/login';
  }

  static matchUrl(url) {
    return /jp\.mercari\.com\/item\/m\d+/.test(url);
  }

  // ============ Keyword search ============

  static supportsKeywordSearch = true;

  static buildSearchUrl(keyword) {
    return `https://jp.mercari.com/search?keyword=${encodeURIComponent(keyword)}`;
  }

  static async extractResults(page) {
    // Mercari is Next.js SPA — give it a moment for items to render
    await page.waitForTimeout(2500);
    return page.evaluate(() => {
      const items = [];
      const seen = new Set();
      const links = document.querySelectorAll('a[href^="/item/m"], a[href*="jp.mercari.com/item/m"]');
      links.forEach((a) => {
        const idMatch = a.href.match(/\/item\/(m\d+)/);
        if (!idMatch) return;
        const id = idMatch[1];
        if (seen.has(id)) return;

        // Walk up to find a card with title + price
        let card = a;
        for (let depth = 0; depth < 8 && card; depth++) {
          const t = card.innerText || '';
          if (t.length > 5 && t.length < 400) break;
          card = card.parentElement;
        }
        if (!card) card = a;
        const text = (card.innerText || '').replace(/\s+/g, ' ').trim();
        // Mercari shows ¥<n> in JP region, NT$/US$ in cross-border regions
        const priceMatch = text.match(/(?:¥|NT\$|US\$|€|£)\s*[\d.,]+/);
        const price = priceMatch ? priceMatch[0].replace(/\s+/g, '') : '';
        let title = text;
        if (priceMatch) title = text.slice(0, priceMatch.index).trim();
        title = title.slice(0, 80);
        if (title.length < 2) return;

        seen.add(id);
        items.push({
          id,
          url: `https://jp.mercari.com/item/${id}`,
          title,
          price,
        });
      });
      return items.slice(0, 15);
    });
  }

  // Image search: Mercari has it via mobile app, web is limited — skip
  static supportsImageSearch = false;

  // ============ Main image extraction ============

  static async extractMainImages(page) {
    const allUrls = await page.evaluate(() => {
      const set = new Set();
      const inRecommend = (el) => {
        let n = el;
        while (n && n !== document.body) {
          const cls = (n.className || '').toString();
          const id = (n.id || '').toString();
          // Mercari uses "Recommend" / "RelatedItems" / "おすすめ" etc.
          if (/recomm|related|おすすめ|あなたへ|sidebar|carousel/i.test(cls + ' ' + id)) {
            return true;
          }
          n = n.parentElement;
        }
        return false;
      };
      const collect = (s) => {
        if (!s) return;
        if (s.startsWith('//')) s = 'https:' + s;
        if (!/mercdn\.(net|com)/.test(s)) return;
        // Normalize: strip CDN resizing prefix → keep only orig photos URL
        // Examples:
        //   https://static.mercdn.net/c!/w=240,a=0,q=75/thumb/photos/abc_1.jpg
        //     → https://static.mercdn.net/item/detail/orig/photos/abc_1.jpg
        //   https://static.mercdn.net/item/detail/orig/photos/abc_1.jpg  (already good)
        s = s.replace(/\/c!\/[^/]+\/thumb\//, '/item/detail/orig/');
        // Strip query / fragment
        s = s.split('?')[0].split('#')[0];
        set.add(s);
      };
      document.querySelectorAll('img').forEach((i) => {
        if (inRecommend(i)) return;
        [i.currentSrc, i.src, i.dataset.src, i.dataset.original].forEach(collect);
      });
      document.querySelectorAll('*').forEach((el) => {
        if (inRecommend(el)) return;
        const bg = getComputedStyle(el).backgroundImage;
        if (bg && /mercdn/.test(bg)) {
          const m = bg.match(/url\(["']?([^"')]+)/);
          if (m) collect(m[1]);
        }
      });
      return [...set];
    });

    // Mercari item photos follow the pattern: /photos/<id>_<n>.<ext>
    // Filter to keep only those (drops avatars, badges, etc.)
    let urls = allUrls.filter((u) => /\/photos\/[\w-]+(_\d+)?\.(jpg|jpeg|png|webp)/i.test(u));

    // Lock to the dominant item ID (the part before _<n>)
    const idCounts = {};
    for (const u of urls) {
      const m = u.match(/\/photos\/([\w-]+?)(_\d+)?\.(jpg|jpeg|png|webp)/i);
      if (m) idCounts[m[1]] = (idCounts[m[1]] || 0) + 1;
    }
    const targetId = Object.entries(idCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (targetId) {
      urls = urls.filter((u) => u.includes(`/photos/${targetId}`));
    }

    // Filename-level dedup
    const seen = new Set();
    return urls.filter((u) => {
      const base = u.split('/').pop();
      if (seen.has(base)) return false;
      seen.add(base);
      return true;
    });
  }

  // Mercari C2C items don't have SKU variants — return empty
  static async extractSkuImages(page) {
    return [];
  }
}

module.exports = { MercariAdapter };
