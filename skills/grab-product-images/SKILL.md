---
name: grab-product-images
description: |
  Archive product page images from a supported e-commerce site (Taobao / Tmall,
  1688, Mercari Japan) via the `product-page-grabber` CLI. Use when the user wants
  to download all images from a product listing — e.g. "抓淘寶的圖", "grab product
  images", "download all photos from this taobao link", "抓 1688 的圖", "抓 mercari".
  Walks them through keyword → top-10 selection → grab, or accepts a direct product
  URL / reference image for reverse search.
triggers:
  - 抓淘寶
  - 抓商品圖
  - grab product
  - download product images
  - taobao image
  - 淘寶圖片
  - 抓 1688
  - 1688 圖片
  - 抓 mercari
  - mercari 圖片
---

# /grab-product-images

A Claude Code skill that wraps the `product-page-grabber` CLI in a natural-language workflow.

## When to invoke

The user wants to download product images from a supported site. Their input may be:

1. **A product URL** → grab directly. Supported:
   - Taobao: `https://item.taobao.com/...`
   - Tmall: `https://detail.tmall.com/...`
   - 1688: `https://detail.1688.com/offer/...html` or `detail.m.1688.com/...?offerId=...`
   - Mercari Japan: `https://jp.mercari.com/item/m<id>`
2. **A keyword** (e.g. "外置進氣口罩") → search, show top 10, ask which one to grab.
   - Defaults to Taobao adapter. Pass `--site=1688` or `--site=mercari` to switch.
3. **An image file path** (e.g. `C:\photos\ref.jpg`) → reverse-image search (Taobao only for now).

## Prerequisites

The repo must be cloned and set up:

```bash
git clone https://github.com/<you>/product-page-grabber.git
cd product-page-grabber
npm install
npx playwright install chrome
node setup.js   # log in manually once
```

If the user hasn't run `setup.js` yet (no `.profile/` directory), prompt them to do so first.

## Workflow

### Case A — direct URL

If the user provides a URL matching a known adapter:

```bash
node grab.js "<url>"
```

Report the output folder + image count when done.

### Case B — keyword search

1. Run with `--list` to see the top 10:

   ```bash
   node grab.js "<keyword>" --list
   ```

2. Present the top 10 in a table to the user (price, title, link), highlight which look most relevant to their query.

3. Ask the user which index(es) they want. Accept ranges/lists ("1,3,5", "2-4", "all").

4. For each pick, run:

   ```bash
   node grab.js "<keyword>" --idx <N>
   ```

5. Report the output folder + image count for each grab.

### Case C — reverse image search

1. Verify the file exists. If it does, run:

   ```bash
   node grab.js "<absolute_image_path>" --list
   ```

2. Same selection + grab loop as Case B.

## Output structure

Each grab produces a timestamped folder on the user's Desktop:

```
product-grab-YYYYMMDDHHMM/
├── 01-...jpg → 99-...jpg     (main product images)
├── _options/                  (SKU / variant thumbnails)
│   └── 01-...jpg
└── _manifest.json
```

The folder opens automatically (Windows: Explorer, macOS: Finder).

## Notes / safety

- Never run more than ~10 grabs in rapid succession against the same site. Pause if the user wants to keep going.
- If you see a captcha or login wall in the script output, **stop and tell the user** — don't retry automatically.
- Don't suggest commercial reuse of scraped images. This tool is for personal archiving.

## Tips for the assistant

- When a keyword search returns mixed results (e.g. cup holders + kids' water bottle covers), call out which results look on/off-topic before asking the user to pick.
- If `--list` output shifts between runs (Taobao reshuffles), the user's "pick #N" refers to **the most recent list**. Don't grab from a stale list.
- The persistent profile in `.profile/` is precious — never `rm -rf` it without confirming.
