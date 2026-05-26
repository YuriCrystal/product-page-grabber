[English](./README.md) | **繁體中文**

# product-page-grabber

> 用 Playwright 把電商商品頁的圖片乾淨地存下來、給個人收藏整理用的小工具。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)]()

從商品頁抓圖、自動過濾「猜你喜歡」推薦輪播、過濾跨店家的廣告雜訊。專為個人購物研究與資料整理設計，不是給大規模資料收集用的。

## 為什麼有這個專案

你在淘寶收藏了 30 件商品想分享給家人，一張一張手動存圖太累。寫個爬蟲又會把這些東西一起抓進來：

- 「猜你喜歡」推薦縮圖
- 同一張圖卻來自不同 CDN 的重複檔
- 嵌在商品說明裡的跨店家廣告

這個 repo 提供一個小型 CLI ＋ adapter 架構，三類雜訊都會自動過濾掉。完整的技術寫法請看 [`docs/DEVNOTE.zh-TW.md`](docs/DEVNOTE.zh-TW.md)。

## 安裝

```bash
git clone https://github.com/YuriCrystal/product-page-grabber.git
cd product-page-grabber
npm install
npx playwright install chrome   # 已經有 Chrome 的話可改用 --channel=chrome
node setup.js                    # 一次性：開瀏覽器登入目標網站
```

登入 cookie 會存在本地 `.profile/`（已加進 `.gitignore`），之後 `grab.js` 都會沿用。

## 使用方式

三種輸入會自動判斷：

```bash
# 1) 直接給商品網址
node grab.js "https://item.taobao.com/item.htm?id=..."

# 2) 關鍵字搜尋
node grab.js "外置進氣口罩"

# 3) 以圖搜圖
node grab.js "C:\path\to\reference.jpg"
```

### 模式 flag

```bash
# 列出搜尋結果前 10 個、不下載
node grab.js "keyword" --list

# 選第 N 個結果（從 1 開始）下載
node grab.js "keyword" --idx 3

# 除錯：跑完不要關瀏覽器
node grab.js "..." --keep-open
```

### 輸出

每次跑都會在桌面建立一個帶時間戳的資料夾：

```
product-grab-202605261430/
├── 01-O1CN01...jpg          # 商品主圖（去重 + 鎖定店家）
├── 02-O1CN01...jpg
├── ...
├── _options/                # SKU / 顏色款式選項圖
│   ├── 01-...jpg
│   └── ...
└── _manifest.json           # 所有 URL ＋ 抓取設定
```

## Adapter

目前內建一個正式 adapter：

| 網站 | Adapter | 備註 |
|------|---------|------|
| 淘寶 / 天貓 | `lib/adapters/taobao.js` | 關鍵字走 `s.taobao.com/search`、以圖搜圖走「搜同款」、SKU 圖從 JS 資料物件抽取 |

要寫自己的 adapter 看 [`docs/ADAPTERS.zh-TW.md`](docs/ADAPTERS.zh-TW.md)，base class 大概 30 行。

## Claude Code skill

有用 [Claude Code](https://claude.com/claude-code) 的話，repo 內附一個 skill 把 CLI 包成自然語言操作：

```bash
# 一次性安裝
mkdir -p ~/.claude/skills
ln -s "$(pwd)/skills/grab-product-images" ~/.claude/skills/grab-product-images
```

之後在任何 Claude Code session 裡：

```
/grab-product-images 外置進氣口罩
```

skill 會帶你從「關鍵字 → 選結果 → 抓圖」一路完成。

## 使用守則

這個工具的設計目的是**個人購物資料整理、個人研究記錄**。請：

- 尊重各網站的 robots.txt 與服務條款
- 不要連續高頻跑批次 — 程式內建隨機等待，不要把它拿掉
- 抓下來的圖未經原店家同意不要公開散佈
- 遇到驗證碼或登入牆就停下來思考一下：自動化真的合適嗎

開發者不為誤用負責。

## 技術 stack

- Node.js 18+
- Playwright（透過系統 Chrome）
- 除了 Playwright 沒有任何外部網路依賴

## License

MIT — 詳見 [`LICENSE`](LICENSE)。
