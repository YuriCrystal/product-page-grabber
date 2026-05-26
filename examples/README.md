**English** | [繁體中文](./README.zh-TW.md)

# Examples

Copy-paste workflows that mirror real use.

## Taobao / Tmall — car parts research

You're shopping for aftermarket parts. Keyword search, eyeball the top 10, grab the listings that match.

```bash
# 1. See what's out there
node grab.js "RAV4 26款 油箱蓋密封圈" --list

# 2. Pick the ones that look right
node grab.js "RAV4 26款 油箱蓋密封圈" --idx 1
node grab.js "RAV4 26款 油箱蓋密封圈" --idx 4
node grab.js "RAV4 26款 油箱蓋密封圈" --idx 7
```

Each grab opens a new Desktop folder when done.

### Reverse-image search

You have a photo of a part — find the same item on Taobao.

```bash
node grab.js "C:\Users\me\Pictures\reference.jpg" --list
node grab.js "C:\Users\me\Pictures\reference.jpg" --idx 2
```

### Direct URL (you already know what you want)

```bash
node grab.js "https://item.taobao.com/item.htm?id=1039512168890"
```

## 1688 — wholesale sourcing

```bash
# Search 1688's wholesale catalog
node grab.js "RAV4 配件" --site=1688 --list
node grab.js "RAV4 配件" --site=1688 --idx 3

# Or grab a known offer directly
node grab.js "https://detail.1688.com/offer/827268908960.html"
```

**Heads up:** 1688 is more aggressive about bot detection than Taobao. If you hit a captcha (`验证码拦截` page title), open the product URL in any Chrome window using the same `.profile/` directory, solve it manually, then retry. The grabber will tell you with a clear error message when this happens.

The 1688 adapter currently grabs the 5 carousel main images per listing. The 商品详情 description block (multi-image breakdown most sellers maintain) requires extra tab activation and isn't covered yet — see `docs/ADAPTERS.md` if you want to extend it.

## Mercari Japan — C2C secondhand

```bash
node grab.js "iPhone 15 Pro" --site=mercari --list
node grab.js "iPhone 15 Pro" --site=mercari --idx 2

# Direct item URL
node grab.js "https://jp.mercari.com/item/m92885561183"
```

Mercari listings are C2C — each item has its own photo set (typically 3-10), no SKU variants. Search results respect your Mercari region — Taiwan accounts see NT$ prices, Japanese accounts see ¥.

## Behance — design project galleries

For when you want to study a designer's complete portfolio piece.

```bash
# Search Behance projects
node grab.js "y2k poster" --site=behance --list
node grab.js "y2k poster" --site=behance --idx 1

# Direct project URL
node grab.js "https://www.behance.net/gallery/241933885/BLUE-GRADIENT-PORTFOLIO-2025"
```

Behance is the most generous source in the list — no login, no captcha, and the adapter pulls the highest-resolution variant of every image in the project (often the full source PNG at 10-25 MB each). A typical portfolio project = 40-60 images, several hundred MB on disk.

## Debug — adapter not finding images?

Browser stays open so you can inspect the page yourself.

```bash
node grab.js "..." --keep-open
```

## Force a specific adapter

If URL auto-detection picks wrong (rare), or if you're doing keyword search and want a non-default adapter:

```bash
node grab.js "ambiguous keyword" --site=taobao
node grab.js "..." --site=1688
node grab.js "..." --site=mercari
node grab.js "..." --site=behance
```
