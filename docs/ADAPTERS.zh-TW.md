[English](./ADAPTERS.md) | **繁體中文**

# 寫一個新 adapter

每個 adapter 都是一個繼承 `BaseAdapter`（`lib/adapters/base.js`）的 class，然後在 `lib/adapters/index.js` 註冊。

## 最小可用 adapter

只處理直接給商品 URL 的情境，不支援搜尋。

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
      // 回傳一個正規化後的完整尺寸圖片 URL 陣列
      return [...document.querySelectorAll('img.product-photo')]
        .map((i) => i.src)
        .filter(Boolean);
    });
  }
}

module.exports = { ExampleAdapter };
```

註冊：

```js
// lib/adapters/index.js
const { ExampleAdapter } = require('./example');
const ADAPTERS = [TaobaoAdapter, ExampleAdapter];
```

這樣就支援：

```bash
node grab.js "https://example.com/product/123"
```

## 加上關鍵字搜尋

```js
class ExampleAdapter extends BaseAdapter {
  // ... 上面那些 ...

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

然後 `node grab.js "搜尋詞"` 就能跑（用預設 adapter，或加 `--site=example` 指定）。

## 加上以圖搜圖

選用。實作這三個 method：

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

`waitForImageResults` 回傳後，`extractResults` 就能在結果頁上跑。

## 加上 SKU / 選項圖抽取

```js
static async extractSkuImages(page) {
  return page.evaluate(() => {
    return [...document.querySelectorAll('.variant-thumb img')]
      .map((i) => i.src)
      .filter(Boolean);
  });
}
```

CLI 會自動把 SKU 圖跟主圖去重、存到 `_options/` 子資料夾。

## 過濾 helper

`docs/DEVNOTE.zh-TW.md` 提到的三招（seller ID lock、recommendation-bleed walker、filename dedup）目前內嵌在 `taobao.js` 裡。如果你的 adapter 用得到、直接複製 pattern。未來版本可能會把它們抽到 `lib/filters.js` 共用。

## 測試

目前沒有 CI。新 adapter 的手動 smoke test：

```bash
node grab.js "https://yoursite/product/<known-id>" --keep-open
```

對比輸出資料夾的圖數量跟你在頁面上看到的數量。目標 >90% 精準度；少抓幾張可以接受，但**誤判**（跨店家廣告、推薦縮圖混進來）是品質 bug。

## PR checklist

如果你要貢獻一個 adapter：

- [ ] 繼承 `BaseAdapter`
- [ ] 已在 `lib/adapters/index.js` 註冊
- [ ] 對該網站至少 3 個不同商品 URL 跑過 smoke test
- [ ] 沒 commit 任何 cookie / `.profile/` / 帳密
- [ ] README 更新、有提到這個新 adapter
- [ ] PR 描述裡寫清楚該網站的 rate limit 或驗證碼行為
