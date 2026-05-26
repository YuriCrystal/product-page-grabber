// 1688 adapter.
//
// 1688 is part of the Alibaba group, so it shares the same alicdn image CDN
// as Taobao/Tmall. The image extraction logic (seller-ID lock, recommendation
// bleed walker, filename dedup) is identical — so this adapter inherits
// extractMainImages and extractSkuImages from TaobaoAdapter.
//
// What differs:
//   - URL pattern: detail.1688.com/offer/<id>.html
//   - Search URL:  s.1688.com/selloffer/offer_search.htm?keywords=...
//   - Login URL:   login.1688.com (though SSO usually carries from Taobao)

const { TaobaoAdapter } = require('./taobao');

class Adapter1688 extends TaobaoAdapter {
  static id = '1688';
  static displayName = '1688';

  static get loginUrl() {
    return 'https://login.1688.com/member/signin.htm';
  }

  static matchUrl(url) {
    return /detail\.1688\.com\/offer\/\d+/.test(url) || /detail\.m\.1688\.com.*offerId=\d+/.test(url);
  }

  static supportsKeywordSearch = true;
  static supportsImageSearch = false; // 1688 has image search but it's gated; skip for now

  static buildSearchUrl(keyword) {
    return `https://s.1688.com/selloffer/offer_search.htm?keywords=${encodeURIComponent(keyword)}`;
  }

  static async extractResults(page) {
    // 1688 search is lazy-loaded — scroll a bit to trigger render
    await page.waitForTimeout(3000);
    await page.evaluate(() => {
      for (let y = 0; y <= 2400; y += 800) window.scrollTo(0, y);
    });
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.scrollTo(0, 0));

    return page.evaluate(() => {
      const items = [];
      const seen = new Set();
      // 1688 search now routes most result clicks through detail.m.1688.com
      // with the offer ID in an `offerId=` query param. Direct detail.1688.com
      // links also still appear for some categories — handle both.
      const allLinks = document.querySelectorAll('a[href]');
      allLinks.forEach((a) => {
        const id =
          a.dataset.offerId ||
          a.href.match(/detail\.1688\.com\/offer\/(\d+)\.html/)?.[1] ||
          a.href.match(/detail\.m\.1688\.com[^"]*[?&]offerId=(\d+)/)?.[1] ||
          a.href.match(/[?&]offer(?:Id|_id)=(\d+)/)?.[1];
        if (!id || !/^\d{8,}$/.test(id)) return;
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
          // Prefer the desktop detail URL (better extractMainImages results
          // than the mobile m.1688.com page). 1688 redirects mobile UA back.
          url: `https://detail.1688.com/offer/${id}.html`,
          title,
          price,
        });
      });
      return items.slice(0, 15);
    });
  }
}

// Override extractMainImages because 1688 images don't always follow the
// /<sellerId>/O1CN<id> pattern that Taobao uses. We're more permissive.
Adapter1688.extractMainImages = async function (page) {
  // If we hit the 1688 captcha wall, surface a clear error instead of
  // silently returning zero images. The user can solve the captcha manually
  // in a separate browser session using the same .profile/ to unlock.
  const captchaCheck = await page.evaluate(() => document.title);
  if (/验证码|captcha/i.test(captchaCheck)) {
    throw new Error(
      '1688 hit captcha wall. Open the product URL manually in any Chrome ' +
        'window using the same .profile/, solve the captcha, then retry.'
    );
  }

  const allUrls = await page.evaluate(() => {
    const set = new Set();
    const inRecommend = (el) => {
      let n = el;
      while (n && n !== document.body) {
        const cls = (n.className || '').toString();
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
    return [...set];
  });

  // 1688 image URL structure (different from Taobao):
  //   /img/ibank/.../O1CN01<hash>_!!<sellerId>-<n>-<tag>.jpg
  // Seller ID is encoded after `!!` in the filename, not in the URL path.
  //
  // Noise to filter:
  //   - SVG icons
  //   - TB<digits> UI assets
  //   - -tps-NxN-NxN icon templates  (seller ID looks like 6000000xxxxxx)
  //   - _b.jpg / _b.webp thumbnail variants
  let urls = allUrls.filter((u) => {
    if (/\.svg(?:$|\?)/i.test(u)) return false;
    if (/\/TB\d/.test(u)) return false;
    if (/-tps-\d+-\d+/.test(u)) return false;
    if (/_b\.(jpg|jpeg|png|webp)(?:$|\?)/i.test(u)) return false;
    return /O1CN/.test(u);
  });

  // Seller-ID lock — extract from filename `!!<id>` pattern
  // (Alibaba internal IDs starting with 6000000... are template/icon sets,
  // so we ignore those when picking the dominant seller.)
  const sellerCounts = {};
  for (const u of urls) {
    const m = u.match(/!!(\d{8,})[-_]/);
    if (m && !m[1].startsWith('6000000')) {
      sellerCounts[m[1]] = (sellerCounts[m[1]] || 0) + 1;
    }
  }
  const targetSeller = Object.entries(sellerCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (targetSeller) {
    urls = urls.filter((u) => u.includes(`!!${targetSeller}`));
  }

  // Filename-level dedup
  const seen = new Set();
  return urls.filter((u) => {
    const base = u.split('/').pop().replace(/[?#].*$/, '');
    if (seen.has(base)) return false;
    seen.add(base);
    return true;
  });
};

module.exports = { Adapter1688 };
