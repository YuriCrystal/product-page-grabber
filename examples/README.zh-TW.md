[English](./README.md) | **繁體中文**

# 範例

幾個可以直接複製貼上的實際 workflow。

## 找車零件抓圖

研究某輛車的副廠零件。先關鍵字搜尋、看前 10 個結果、抓對的款。

```bash
# 1. 先看有什麼
node grab.js "RAV4 26款 油箱蓋密封圈" --list

# 2. 挑看起來對的
node grab.js "RAV4 26款 油箱蓋密封圈" --idx 1
node grab.js "RAV4 26款 油箱蓋密封圈" --idx 4
node grab.js "RAV4 26款 油箱蓋密封圈" --idx 7
```

每一次抓完都會新開一個桌面資料夾。

## 以圖搜圖

手上有一張朋友車上的零件照、想去市場找一樣的款。

```bash
node grab.js "C:\Users\me\Pictures\reference.jpg" --list
node grab.js "C:\Users\me\Pictures\reference.jpg" --idx 2
```

## 直接給 URL（已經知道要哪個）

```bash
node grab.js "https://item.taobao.com/item.htm?id=1039512168890"
```

跳過搜尋步驟。

## 除錯：adapter 抓不到圖

留瀏覽器開著、可以自己進去看 DOM。

```bash
node grab.js "..." --keep-open
```

## 強制指定 adapter

URL 自動判斷有時會出錯，可以強制：

```bash
node grab.js "ambiguous keyword" --site=taobao
```
