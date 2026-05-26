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

## How the tricks actually generalized (notes from building 3 more adapters)

After Taobao, three more adapters got built: 1688, Mercari Japan, Behance. Each surfaced one new insight worth recording.

### 1688: seller ID is in the filename, not the path

Taobao puts the seller ID in the image URL **path**:

```
/imgextra/i3/2221364769133/O1CN01...jpg
              └─ seller ─┘
```

1688 puts it in the **filename**, after a `!!` delimiter:

```
/img/ibank/.../O1CN01..._!!2218318563061-0-cib.jpg
                          └── seller ──┘
```

Same trick (count occurrences, lock to the dominant seller), different extraction:

```javascript
// Taobao
const m = u.match(/\/(\d{8,})\/O1CN/);

// 1688
const m = u.match(/!!(\d{8,})[-_]/);
```

There's a wrinkle: Alibaba's internal icon-set assets use seller IDs starting with `6000000...`. They'd otherwise win the seller-frequency count on listings with lots of UI icons. Easy fix:

```javascript
if (m && !m[1].startsWith('6000000')) {
  sellerCounts[m[1]] = (sellerCounts[m[1]] || 0) + 1;
}
```

### Mercari: no seller lock needed — group by item ID instead

C2C platforms are simpler. Each listing is one unique item with its own photos:

```
/photos/m92885561183_1.jpg
/photos/m92885561183_2.jpg
/photos/m92885561183_3.jpg
```

No cross-seller recommendation bleed because each item is its own entity. Lock by item ID prefix instead of seller:

```javascript
const idCounts = {};
for (const u of urls) {
  const m = u.match(/\/photos\/([\w-]+?)(_\d+)?\.(jpg|jpeg|png|webp)/i);
  if (m) idCounts[m[1]] = (idCounts[m[1]] || 0) + 1;
}
const targetId = Object.entries(idCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
urls = urls.filter((u) => u.includes(`/photos/${targetId}`));
```

The shape is identical — pick the dominant identifier, filter to its group. The identifier just happens to be an item ID instead of a seller ID.

### Behance: same image at 5 resolutions — keep only the biggest

Behance is a design portfolio site, so it goes hard on image quality. The same image gets served at multiple resolutions:

```
/projects/original/<hash>.png                              (source, e.g. 14 MB)
/project_modules/2800_webp/<hash>.<variant>.webp           (large)
/project_modules/1400_webp/<hash>.<variant>.webp           (medium)
/project_modules/fs/<hash>.<variant>.png                   (full-screen)
/project_modules/disp/<hash>.<variant>.png                 (display thumb)
```

Filename dedup as written would keep all five (different filenames per size). We need a smarter group-by-hash + pick-largest pass:

```javascript
const byHash = new Map();
for (const url of urls) {
  const { hash, size } = parseBehanceUrl(url); // pulls out the hash + size
  const pixels = behanceSizePixels(size);      // 'source'=Infinity, '2800_webp'=2800, etc.
  const baseHash = hash.split('.')[0];          // strip per-variant suffix
  const existing = byHash.get(baseHash);
  if (!existing || pixels > existing.pixels) {
    byHash.set(baseHash, { url, pixels });
  }
}
return [...byHash.values()].map((x) => x.url);
```

The general pattern: when a CDN serves the same image at multiple sizes, the filename varies but a stable **content hash** is buried in there. Extract it, group on it, pick the biggest. Works for any image CDN with size-tagged URLs.

### Summary table

| Adapter | Identifier type | Identifier location | Resolution strategy |
|---------|----------------|---------------------|---------------------|
| Taobao  | Seller ID      | URL path            | Pick any (one size) |
| 1688    | Seller ID      | Filename (`!!ID`)   | Pick any (one size) |
| Mercari | Item ID        | Filename prefix     | Pick any (one size) |
| Behance | Content hash   | Filename prefix     | Pick largest size   |
