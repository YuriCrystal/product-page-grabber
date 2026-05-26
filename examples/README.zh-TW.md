[English](./README.md) | **繁體中文**

# 範例

可以直接複製貼上、貼近真實使用情境的 workflow。

## 淘寶 / 天貓 — 找車零件

研究副廠零件。關鍵字搜尋、看前 10 個、抓對的款。

```bash
# 1. 先看有什麼
node grab.js "RAV4 26款 油箱蓋密封圈" --list

# 2. 挑看起來對的
node grab.js "RAV4 26款 油箱蓋密封圈" --idx 1
node grab.js "RAV4 26款 油箱蓋密封圈" --idx 4
node grab.js "RAV4 26款 油箱蓋密封圈" --idx 7
```

每一次抓完都會新開一個桌面資料夾。

### 以圖搜圖

手上有零件照、想去 Taobao 找一樣的款。

```bash
node grab.js "C:\Users\me\Pictures\reference.jpg" --list
node grab.js "C:\Users\me\Pictures\reference.jpg" --idx 2
```

### 直接給 URL（已經知道要哪個）

```bash
node grab.js "https://item.taobao.com/item.htm?id=1039512168890"
```

## 1688 — 批發找貨源

```bash
# 搜尋 1688 批發
node grab.js "RAV4 配件" --site=1688 --list
node grab.js "RAV4 配件" --site=1688 --idx 3

# 或直接給已知商品
node grab.js "https://detail.1688.com/offer/827268908960.html"
```

**注意：** 1688 對自動化的容忍度比淘寶低、容易撞驗證碼。如果看到 page title 是 `验证码拦截`、用任何 Chrome 視窗開那個商品 URL（會用同一個 `.profile/` session）、手動解掉、再重抓。grabber 會印明確的錯誤訊息提醒你。

目前 1688 adapter 只抓 5 張輪播主圖。「商品详情」描述區那大段多張的細節圖需要額外點分頁觸發 lazy load、還沒實作 — 想擴充可以看 `docs/ADAPTERS.zh-TW.md`。

## Mercari 日本 — C2C 二手

```bash
node grab.js "iPhone 15 Pro" --site=mercari --list
node grab.js "iPhone 15 Pro" --site=mercari --idx 2

# 直接 item URL
node grab.js "https://jp.mercari.com/item/m92885561183"
```

Mercari 是 C2C、每個 listing 都是獨立物件、通常 3-10 張照片、沒 SKU。搜尋結果會根據你的 Mercari 帳號地區顯示 — 台灣帳號看到 NT$、日本帳號看到 ¥。

## Behance — 設計 project 完整圖庫

想完整研究一個設計師作品集裡的某個 project 用這個。

```bash
# 搜尋 Behance projects
node grab.js "y2k poster" --site=behance --list
node grab.js "y2k poster" --site=behance --idx 1

# 直接 project URL
node grab.js "https://www.behance.net/gallery/241933885/BLUE-GRADIENT-PORTFOLIO-2025"
```

Behance 是清單裡最大方的來源 — 不用登入、沒 captcha、adapter 自動抓每張圖的最高解析度版本（常常是 10-25 MB 的原始 PNG）。一個典型 portfolio project = 40-60 張、幾百 MB 是正常的。

## Debug — adapter 沒抓到圖？

留瀏覽器開著、可以自己進去看 DOM。

```bash
node grab.js "..." --keep-open
```

## 強制指定 adapter

URL 自動判斷有時會出錯（很少），或關鍵字搜尋想用非預設的 adapter：

```bash
node grab.js "ambiguous keyword" --site=taobao
node grab.js "..." --site=1688
node grab.js "..." --site=mercari
node grab.js "..." --site=behance
```
