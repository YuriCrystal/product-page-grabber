**English** | [繁體中文](./DEVNOTE.zh-TW.md)

# Dev note: product page image scraping is mostly a filtering problem

When I first tried to bulk-archive Taobao product pages, the naive "grab every `<img>` on the page" approach gave me 80+ files per product, most of them garbage:

- "猜你喜歡" recommendation thumbnails
- Cross-seller variant ads embedded in the product description
- The same image hosted on three different CDN subdomains (`gw.alicdn`, `img.alicdn`, `aeis.alicdn`)
- Tiny site icons and UI assets

The real product photos were drowning. This note documents the three tricks I ended up using.

## Trick 1: Seller-ID lock

Taobao image URLs encode the seller's user ID in the path:

```
https://img.alicdn.com/imgextra/i3/2221364769133/O1CN01bCmc8G2HKyOlsDJgv.jpg
                                  └─ seller ID ─┘
```

When a page is rendered, the real product images all share one seller ID. Recommendation carousels and embedded ads pull from many different sellers. So:

```javascript
// 1. Collect every URL matching the pattern
const urls = allUrls.filter((u) => /\/\d{8,}\/O1CN/.test(u));

// 2. Count occurrences of each seller ID
const counts = {};
for (const u of urls) {
  const m = u.match(/\/(\d{8,})\/O1CN/);
  if (m) counts[m[1]] = (counts[m[1]] || 0) + 1;
}

// 3. The dominant seller wins
const targetSeller = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
const productUrls = urls.filter((u) => u.includes(`/${targetSeller}/`));
```

In practice this drops the noise from ~85 URLs down to ~25-40 real product images.

## Trick 2: Recommendation-bleed DOM walker

Some embedded ads use the same seller ID as the main product (cross-promotion within a brand's shop). Filtering by seller ID alone doesn't catch them. A second pass walks up the DOM and rejects anything inside a known recommendation container:

```javascript
const inRecommend = (el) => {
  let n = el;
  while (n && n !== document.body) {
    const cls = (n.className || '').toString();
    const id = (n.id || '').toString();
    if (/recomm|guess|猜你|相关|相關|sidebar|hot[_-]|bought|bottombar/i.test(
      cls + ' ' + id
    )) {
      return true;
    }
    n = n.parentElement;
  }
  return false;
};
```

This catches everything that any normal site engineer would name a recommendation carousel, in both Chinese and English.

## Trick 3: Filename-level dedup

Taobao serves the same image from multiple CDN hosts depending on geo / load. After normalization, identical images keep their basename:

```
https://gw.alicdn.com/.../O1CN01abc...jpg
https://img.alicdn.com/.../O1CN01abc...jpg
https://aeis.alicdn.com/.../O1CN01abc...jpg
```

URL-level dedup misses these. Filename-level dedup catches them:

```javascript
const seen = new Set();
const final = urls.filter((u) => {
  const base = u.split('/').pop().replace(/[?#].*$/, '');
  if (seen.has(base)) return false;
  seen.add(base);
  return true;
});
```

Don't forget to strip CDN size suffixes (`_200x200q90.jpg`) first, or you'll keep multiple resolutions of the same image. The regexes in `lib/adapters/taobao.js` handle the common variants:

```javascript
s = s
  .replace(/_\d+x\d+(q\d+)?\.(jpg|jpeg|png|webp).*$/i, '')
  .replace(/_q\d+\.(jpg|jpeg|png|webp).*$/i, '')
  .replace(/_\.webp$/i, '')
  .replace(/~crop,[\d,]+~/, '');
```

## Bonus: SKU thumbnails live in JS, not the DOM

Modern Taobao loads SKU/variant selector images via JavaScript after page load. They don't appear in the initial DOM, but they do show up in:

- `window.__INIT_DATA__`
- `window.pageData`
- Inline `<script>` tag contents

So after extracting DOM images, the adapter also stringifies these globals and regex-matches alicdn URLs:

```javascript
const jsonStr = JSON.stringify(
  window.__INIT_DATA__ || window.pageData || window.__GLOBAL_DATA__ || {}
);
const urlRe = /(?:https?:)?\/\/[^\s"']+alicdn\.com\/[^\s"']+/g;
for (const m of jsonStr.matchAll(urlRe)) { /* collect */ }
```

This was the difference between "got 1 SKU image" and "got 8 variants" on the test products.

## Generalizing to other sites

These three tricks aren't Taobao-specific:

- **Seller-ID lock** works on any site that puts seller/shop ID in the image URL (most do — Shopee, JD, Mercari, etc.)
- **Recommendation-bleed walker** is language-and-platform agnostic; just expand the regex per locale
- **Filename dedup** is universal

The adapter pattern in `lib/adapters/` keeps these tricks reusable. New adapters override `extractMainImages` with their own URL pattern and selector ID extraction, but the structure stays the same.

See [`ADAPTERS.md`](./ADAPTERS.md) for how to write one.
