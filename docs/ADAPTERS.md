# Writing a new adapter

Each adapter is a class that extends `BaseAdapter` (`lib/adapters/base.js`) and registers itself in `lib/adapters/index.js`.

## Minimum viable adapter

Handles direct product URLs only — no search.

```js
// lib/adapters/example.js
const { BaseAdapter } = require('./base');

class ExampleAdapter extends BaseAdapter {
  static id = 'example';
  static displayName = 'Example Shop';

  static get loginUrl() {
    return 'https://example.com/login';
  }

  static matchUrl(url) {
    return /example\.com\/product\//.test(url);
  }

  static async extractMainImages(page) {
    return page.evaluate(() => {
      // Return an array of normalized full-size image URLs.
      return [...document.querySelectorAll('img.product-photo')]
        .map((i) => i.src)
        .filter(Boolean);
    });
  }
}

module.exports = { ExampleAdapter };
```

Register it:

```js
// lib/adapters/index.js
const { ExampleAdapter } = require('./example');
const ADAPTERS = [TaobaoAdapter, ExampleAdapter];
```

That's enough to support:

```bash
node grab.js "https://example.com/product/123"
```

## Adding keyword search

```js
class ExampleAdapter extends BaseAdapter {
  // ... above ...

  static supportsKeywordSearch = true;

  static buildSearchUrl(keyword) {
    return `https://example.com/search?q=${encodeURIComponent(keyword)}`;
  }

  static async extractResults(page) {
    return page.evaluate(() => {
      return [...document.querySelectorAll('a.product-card')]
        .slice(0, 15)
        .map((a) => {
          const id = a.href.match(/\/product\/(\w+)/)?.[1] || '';
          return {
            id,
            url: a.href,
            title: a.querySelector('.title')?.innerText.trim() || '',
            price: a.querySelector('.price')?.innerText.trim() || '',
          };
        })
        .filter((r) => r.id);
    });
  }
}
```

Now `node grab.js "搜尋詞"` works (with whichever adapter is the default — or pass `--site=example`).

## Adding image search

Optional. Implement these three methods:

```js
static supportsImageSearch = true;

static async openImageSearch(page) {
  await page.goto('https://example.com');
  await page.locator('text=Search by image').click();
}

static async uploadImage(page, imagePath) {
  await page.locator('input[type="file"]').setInputFiles(imagePath);
}

static async waitForImageResults(page) {
  await page.waitForURL(/example\.com\/search/);
  await page.waitForTimeout(3000);
}
```

After `waitForImageResults` returns, `extractResults` should work on the resulting page.

## Adding SKU/variant image extraction

```js
static async extractSkuImages(page) {
  return page.evaluate(() => {
    return [...document.querySelectorAll('.variant-thumb img')]
      .map((i) => i.src)
      .filter(Boolean);
  });
}
```

The CLI automatically dedupes SKU images against the main set and downloads them to `_options/`.

## Filter helpers

The three filtering tricks in `docs/DEVNOTE.md` (seller-ID lock, recommendation-bleed walker, filename dedup) are currently inlined in `taobao.js`. If your adapter benefits from them, copy the pattern. Future versions of this repo may extract them into `lib/filters.js` for reuse.

## Testing

There's no CI yet. Manual smoke test for a new adapter:

```bash
node grab.js "https://yoursite/product/<known-id>" --keep-open
```

Compare the output folder image count vs. what you see on the page. Aim for >90% precision; missing the occasional image is fine, but **false positives** (cross-seller ads, recommendation thumbs) are a quality bug.

## PR checklist

If you're contributing an adapter:

- [ ] Extends `BaseAdapter`
- [ ] Registered in `lib/adapters/index.js`
- [ ] Manual smoke test against ≥3 different product URLs on the target site
- [ ] No site credentials, cookies, or `.profile/` data committed
- [ ] README updated to mention the new adapter
- [ ] Note any rate-limiting or captcha behavior in the PR description
