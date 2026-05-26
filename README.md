**English** | [繁體中文](./README.zh-TW.md)

# product-page-grabber

> A Playwright pattern for archiving product page images from your own shopping bookmarks.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)]()

Scrape clean product images from e-commerce pages — minus the recommendation carousel bleed, minus the wrong-seller noise. Built for archiving your own purchase research, not for bulk data harvesting.

## Why this exists

You've bookmarked 30 items on Taobao to share with a relative. Saving each image manually is tedious, and naive scrapers also grab:
- "猜你喜歡" recommendation thumbnails
- Same-image-different-CDN duplicates
- Cross-seller variant ads embedded in the page

This repo gives you a small CLI + an adapter pattern that handles all three. See [`docs/DEVNOTE.md`](docs/DEVNOTE.md) for the technical writeup.

## Install

```bash
git clone https://github.com/<you>/product-page-grabber.git
cd product-page-grabber
npm install
npx playwright install chrome   # or use --channel=chrome if you already have it
node setup.js                    # one-time: launch Chrome with persistent profile, log in to target site
```

The persistent profile is stored locally in `.profile/` (gitignored). Login cookies stay on your machine.

## Usage

Three input modes, auto-detected:

```bash
# 1) Direct product URL
node grab.js "https://item.taobao.com/item.htm?id=..."

# 2) Keyword search
node grab.js "外置進氣口罩"

# 3) Image search (reverse image lookup)
node grab.js "C:\path\to\reference.jpg"
```

### Workflow flags

```bash
# Show top 10 search results, exit without grabbing
node grab.js "keyword" --list

# Pick the Nth result (1-indexed) instead of the first
node grab.js "keyword" --idx 3

# Debug: keep browser open after run
node grab.js "..." --keep-open
```

### Output

Each run creates a timestamped folder on Desktop:

```
product-grab-202605261430/
├── 01-O1CN01...jpg          # main product images (deduped, seller-locked)
├── 02-O1CN01...jpg
├── ...
├── _options/                # SKU / variant thumbnails
│   ├── 01-...jpg
│   └── ...
└── _manifest.json           # all URLs + metadata
```

## Adapters

This repo ships with four production adapters:

| Site | Adapter | Notes |
|------|---------|-------|
| Taobao / Tmall | `lib/adapters/taobao.js` | Keyword search via `s.taobao.com/search`, image search via 搜同款, SKU extraction via JS data objects |
| 1688 | `lib/adapters/alibaba1688.js` | Keyword search via `s.1688.com`, custom filename-based seller-ID lock (1688 uses `!!<id>` not `/id/`). Currently grabs the 5 carousel main images only — the 商品详情 description block requires extra tab activation and isn't covered yet. |
| Mercari Japan | `lib/adapters/mercari.js` | Keyword search via `jp.mercari.com/search`, item-ID based image grouping, no SKU (C2C) |
| Behance | `lib/adapters/behance.js` | Keyword search via `behance.net/search/projects`, grabs full project galleries from `mir-s3-cdn-cf.behance.net`. Picks the highest-resolution variant per image hash (source > 2800_webp > 1400_webp > fs_webp > disp). |

Pick the adapter explicitly with `--site=taobao | 1688 | mercari | behance`, or it auto-detects from the product URL.

Writing your own adapter? See [`docs/ADAPTERS.md`](docs/ADAPTERS.md). The base class is ~30 lines.

## Claude Code skill

If you use [Claude Code](https://claude.com/claude-code), there's a bundled skill that wraps the CLI in natural language:

```bash
# Install the skill (one-time)
mkdir -p ~/.claude/skills
ln -s "$(pwd)/skills/grab-product-images" ~/.claude/skills/grab-product-images
```

Then in any Claude Code session:

```
/grab-product-images 外置進氣口罩
```

The skill walks you through keyword → result selection → grab in a single conversation.

## What this tool is NOT for

- **Mass downloading from search engines** (Google Images, Bing, etc.) — copyright holders are spread across thousands of unrelated sites and you have no relationship with any of them.
- **Bulk image harvesting across the open web** — same problem at larger scale.
- **Building image training datasets** — there are dedicated tools and licensed sources for this; please use them.

If you need image discovery (rather than archiving a specific page you already know), use a dedicated stock API like [Unsplash](https://unsplash.com/developers) or [Pexels](https://www.pexels.com/api/), or generate images with an AI tool.

## Safe-use guidelines

This tool is for **archiving images from a specific page you already have a relationship with** — your shopping cart, a designer's Behance project you're studying, a listing you bookmarked. Please:

- Respect each site's robots.txt and ToS.
- Don't run high-frequency batch loops — there are random waits built in, don't strip them out.
- Don't share scraped images publicly without the original creator's / seller's permission.
- If a site blocks you (captcha, login wall), stop and reconsider whether automation is the right approach.

## Responsibility

I (the author) provide this tool as-is under MIT. **You choose which sites to point it at — that choice is yours.** I cannot be responsible for:

- What sites you scrape with it
- Whether your usage complies with those sites' ToS
- Whether you have the right to redistribute what you download
- Any legal consequences of your usage

If you're not sure whether a particular use is okay, the answer is probably "no" — find a properly licensed source instead.

## Tech stack

- Node.js 18+
- Playwright (Chromium via system Chrome)
- Zero external network deps beyond Playwright

## License

MIT — see [`LICENSE`](LICENSE).
