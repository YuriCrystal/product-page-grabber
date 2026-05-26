[English](./DEVNOTE.md) | **繁體中文**

# Dev note：商品頁抓圖其實是過濾問題

第一次嘗試批次存淘寶商品頁時，用最直覺的「抓頁面上每一張 `<img>`」結果一個商品丟出 80 多張圖，大部分是垃圾：

- 「猜你喜歡」推薦縮圖
- 嵌在商品說明裡的跨店家廣告
- 同一張圖出現在三個不同的 CDN subdomain（`gw.alicdn`、`img.alicdn`、`aeis.alicdn`）
- 小尺寸 site icon、UI 用素材

真正的商品照被淹沒了。這篇 note 記錄我最後用到的三招。

## 第一招：seller ID lock（店家 ID 鎖定）

淘寶圖片 URL 把店家的 user ID 寫在路徑裡：

```
https://img.alicdn.com/imgextra/i3/2221364769133/O1CN01bCmc8G2HKyOlsDJgv.jpg
                                  └─ 店家 ID ─┘
```

商品頁渲染完之後，真正的商品照都來自**同一個**店家 ID。推薦輪播、嵌入廣告則是從各種店家亂入。所以：

```javascript
// 1. 抓所有符合 pattern 的 URL
const urls = allUrls.filter((u) => /\/\d{8,}\/O1CN/.test(u));

// 2. 計算每個店家 ID 出現的次數
const counts = {};
for (const u of urls) {
  const m = u.match(/\/(\d{8,})\/O1CN/);
  if (m) counts[m[1]] = (counts[m[1]] || 0) + 1;
}

// 3. 出現最多的那家才是主商品
const targetSeller = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
const productUrls = urls.filter((u) => u.includes(`/${targetSeller}/`));
```

實測下來，這一招把雜訊從 ~85 URL 壓到 ~25-40 張真正的商品圖。

## 第二招：「猜你喜歡」DOM walker

有些嵌入廣告會用跟主商品**同一個**店家 ID（同品牌自家的交叉宣傳），單純靠 ID 鎖定抓不到。所以再加一層：往上爬 DOM、看 ancestor 有沒有命中「推薦容器」的 class / id：

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

這個 regex 涵蓋了「任何稍微正常的工程師會用來命名推薦輪播的詞」，中英都有。

## 第三招：filename 層級的去重

淘寶會根據地理 / 負載把同一張圖從不同 CDN host 餵出來。經過 URL 正規化後，同一張圖會留下同樣的 basename：

```
https://gw.alicdn.com/.../O1CN01abc...jpg
https://img.alicdn.com/.../O1CN01abc...jpg
https://aeis.alicdn.com/.../O1CN01abc...jpg
```

URL 層級的去重抓不到這種，filename 層級才行：

```javascript
const seen = new Set();
const final = urls.filter((u) => {
  const base = u.split('/').pop().replace(/[?#].*$/, '');
  if (seen.has(base)) return false;
  seen.add(base);
  return true;
});
```

去重之前要先把 CDN 尺寸 suffix（`_200x200q90.jpg`）拿掉，不然會留下同一張圖的多種解析度。`lib/adapters/taobao.js` 裡的 regex 處理了常見變體：

```javascript
s = s
  .replace(/_\d+x\d+(q\d+)?\.(jpg|jpeg|png|webp).*$/i, '')
  .replace(/_q\d+\.(jpg|jpeg|png|webp).*$/i, '')
  .replace(/_\.webp$/i, '')
  .replace(/~crop,[\d,]+~/, '');
```

## 加碼：SKU 縮圖躲在 JS 裡、不在 DOM 上

現代版的淘寶把 SKU / 選項縮圖透過 JavaScript 在頁面載完之後才塞進來。初始 DOM 抓不到，但這些圖會出現在：

- `window.__INIT_DATA__`
- `window.pageData`
- inline `<script>` tag 的內容

所以 adapter 抓完 DOM 圖之後，再把這幾個 global 物件 stringify 一下、用 regex 撈 alicdn URL：

```javascript
const jsonStr = JSON.stringify(
  window.__INIT_DATA__ || window.pageData || window.__GLOBAL_DATA__ || {}
);
const urlRe = /(?:https?:)?\/\/[^\s"']+alicdn\.com\/[^\s"']+/g;
for (const m of jsonStr.matchAll(urlRe)) { /* 收 */ }
```

這一步的差別是「只抓到 1 張 SKU 圖」vs「8 種變體都抓到」。

## 推廣到其他網站

這三招都不是淘寶限定：

- **seller ID lock** 適用任何把店家 ID 寫進圖片路徑的網站（蝦皮、JD、Mercari 大多都這樣）
- **DOM walker** 是跨語言跨平台的通用招式，regex 補當地用語就好
- **filename dedup** 萬用

`lib/adapters/` 的 adapter 模式把這些招數抽成可重用元件。新 adapter 只要覆寫 `extractMainImages`、改成自己網站的 URL pattern 跟 ID 抽取邏輯就好，結構不變。

要寫一個新 adapter 請看 [`ADAPTERS.zh-TW.md`](./ADAPTERS.zh-TW.md)。

## 寫完另外三個 adapter 之後的補充心得

Taobao 之後又加了三個：1688、Mercari 日本、Behance。每個都帶出一個值得記錄的新 insight。

### 1688：seller ID 在 filename、不在路徑

淘寶把店家 ID 放在 URL **路徑**：

```
/imgextra/i3/2221364769133/O1CN01...jpg
              └── 店家 ──┘
```

1688 放在 **filename**、`!!` 後面：

```
/img/ibank/.../O1CN01..._!!2218318563061-0-cib.jpg
                          └── 店家 ──┘
```

同一招（算每個 ID 出現次數、鎖定主店家）、不同的抽取方式：

```javascript
// Taobao
const m = u.match(/\/(\d{8,})\/O1CN/);

// 1688
const m = u.match(/!!(\d{8,})[-_]/);
```

有個小坑：阿里內部的 icon set 資產 seller ID 都是 `6000000...` 開頭。如果不過濾、它們在 icon 很多的頁面會贏掉主店家。解法：

```javascript
if (m && !m[1].startsWith('6000000')) {
  sellerCounts[m[1]] = (sellerCounts[m[1]] || 0) + 1;
}
```

### Mercari：不用 seller lock、改用 item ID 群組

C2C 平台簡單多了。每個 listing 都是獨立物件、有自己的照片：

```
/photos/m92885561183_1.jpg
/photos/m92885561183_2.jpg
/photos/m92885561183_3.jpg
```

沒有跨店家推薦干擾、因為每個 item 就是一個獨立實體。用 item ID 前綴鎖定、邏輯一模一樣：

```javascript
const idCounts = {};
for (const u of urls) {
  const m = u.match(/\/photos\/([\w-]+?)(_\d+)?\.(jpg|jpeg|png|webp)/i);
  if (m) idCounts[m[1]] = (idCounts[m[1]] || 0) + 1;
}
const targetId = Object.entries(idCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
urls = urls.filter((u) => u.includes(`/photos/${targetId}`));
```

形狀完全一樣 — 挑出現最多的 ID、過濾到那一組。只是這個 ID 換成 item ID 而不是 seller ID。

### Behance：同圖五解析度、只留最大那張

Behance 是設計作品集站、對圖質要求很高。同一張圖會餵多個解析度：

```
/projects/original/<hash>.png                              (原檔、例如 14 MB)
/project_modules/2800_webp/<hash>.<variant>.webp           (大)
/project_modules/1400_webp/<hash>.<variant>.webp           (中)
/project_modules/fs/<hash>.<variant>.png                   (全螢幕)
/project_modules/disp/<hash>.<variant>.png                 (顯示縮圖)
```

filename dedup 在這場景不夠 — 五個尺寸 filename 都不同。要 group-by-hash 再挑最大：

```javascript
const byHash = new Map();
for (const url of urls) {
  const { hash, size } = parseBehanceUrl(url); // 抽出 hash + 尺寸
  const pixels = behanceSizePixels(size);      // 'source'=Infinity、'2800_webp'=2800、依此類推
  const baseHash = hash.split('.')[0];          // 去掉 per-variant 後綴
  const existing = byHash.get(baseHash);
  if (!existing || pixels > existing.pixels) {
    byHash.set(baseHash, { url, pixels });
  }
}
return [...byHash.values()].map((x) => x.url);
```

通用 pattern：CDN 同圖多尺寸時、filename 會變、但 filename 裡會藏一個穩定的 **content hash**。把它抽出來、group on 它、挑最大那張。任何用「尺寸 tag URL」的圖庫 CDN 都通。

### 整理表

| Adapter | ID 類型 | ID 位置 | 解析度策略 |
|---------|---------|---------|-----------|
| Taobao  | 店家 ID | URL 路徑 | 任挑（單一尺寸） |
| 1688    | 店家 ID | filename (`!!ID`) | 任挑（單一尺寸） |
| Mercari | item ID | filename 前綴 | 任挑（單一尺寸） |
| Behance | content hash | filename 前綴 | 挑最大尺寸 |
