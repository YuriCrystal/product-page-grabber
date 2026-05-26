#!/usr/bin/env node
// product-page-grabber CLI
//
// Auto-detects input type:
//   - https://... URL          → direct product page
//   - existing image file path → reverse-image search (if adapter supports)
//   - any other string         → keyword search (if adapter supports)
//
// Modes:
//   default          → click first result and grab
//   --list           → show top 10 search results, exit
//   --idx N          → click Nth result (1-indexed)
//   --keep-open      → leave browser open after run (debug)
//   --site=ID        → force a specific adapter (default: auto-detect / Taobao)

const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { chromium } = require('playwright');

const { resolveAdapter, getAdapter, defaultAdapter } = require('./lib/adapters');
const { downloadAll, UA } = require('./lib/download');
const { scrollToBottom } = require('./lib/page');

// ============ Arg parsing ============

const args = process.argv.slice(2);
const KEEP_OPEN = args.includes('--keep-open');
const LIST_ONLY = args.includes('--list');
const siteFlag = args.find((a) => a.startsWith('--site='));
const forcedSite = siteFlag ? siteFlag.split('=')[1] : null;

const idxFlag = args.findIndex((a) => a === '--idx');
const PICK_IDX = idxFlag >= 0 ? parseInt(args[idxFlag + 1], 10) : 1;
if (isNaN(PICK_IDX) || PICK_IDX < 1) {
  console.error('❌ --idx must be a positive integer (1-indexed)');
  process.exit(1);
}

const rawArg = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--idx');

if (!rawArg) {
  console.error('Usage:');
  console.error('  node grab.js "https://item.taobao.com/item.htm?id=..."   # direct URL');
  console.error('  node grab.js "C:\\path\\to\\image.jpg"                    # image search');
  console.error('  node grab.js "搜尋關鍵字"                                  # keyword search');
  console.error('  node grab.js "..." --list                                # show top 10 only');
  console.error('  node grab.js "..." --idx 3                               # pick 3rd result');
  console.error('  node grab.js "..." --site=taobao                         # force adapter');
  process.exit(1);
}

const isUrl = /^https?:\/\//i.test(rawArg);
const looksLikePath =
  !isUrl && (/[\\/]/.test(rawArg) || /\.(jpg|jpeg|png|webp|gif)$/i.test(rawArg));
const maybePath = looksLikePath ? path.resolve(rawArg) : null;
const isImageMode = maybePath && fs.existsSync(maybePath);

if (looksLikePath && !isImageMode) {
  console.error('❌ Looks like a file path but file not found:', rawArg);
  process.exit(1);
}

const directUrl = isUrl ? rawArg : null;
const imagePath = isImageMode ? maybePath : null;
const keyword = isUrl || isImageMode ? null : rawArg;
const inputMode = isUrl ? 'url' : isImageMode ? 'image' : 'keyword';

// ============ Adapter selection ============

const Adapter = forcedSite
  ? getAdapter(forcedSite)
  : isUrl
  ? resolveAdapter(rawArg) || defaultAdapter()
  : defaultAdapter();

if (!Adapter) {
  console.error(`❌ No adapter for: ${rawArg}`);
  process.exit(1);
}

if (inputMode === 'keyword' && !Adapter.supportsKeywordSearch) {
  console.error(`❌ ${Adapter.displayName} adapter does not support keyword search`);
  process.exit(1);
}

if (inputMode === 'image' && !Adapter.supportsImageSearch) {
  console.error(`❌ ${Adapter.displayName} adapter does not support image search`);
  process.exit(1);
}

// ============ Output dir ============

const PROFILE_DIR = path.resolve(__dirname, '.profile');
const ts = new Date()
  .toISOString()
  .replace(/[-:T.]/g, '')
  .slice(0, 12);
const OUT_DIR = path.join(process.env.USERPROFILE || process.env.HOME, 'Desktop', `product-grab-${ts}`);
if (!LIST_ONLY) fs.mkdirSync(OUT_DIR, { recursive: true });

const log = (...a) => console.log('→', ...a);

// ============ Main ============

(async () => {
  log(`Adapter: ${Adapter.displayName}`);
  log(`Mode: ${inputMode}`);
  log(`Launching browser with profile: ${PROFILE_DIR}`);

  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1400, height: 900 },
    userAgent: UA,
    locale: 'zh-CN',
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = browser.pages()[0] || (await browser.newPage());

  try {
    let productPage = null;

    // ============ Navigate to results ============

    if (inputMode === 'url') {
      log(`Direct URL: ${directUrl}`);
      await page.goto(directUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      productPage = page;
    } else if (inputMode === 'keyword') {
      const searchUrl = Adapter.buildSearchUrl(keyword);
      log(`Keyword: ${keyword}`);
      log(`Navigating to: ${searchUrl}`);
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);
      if (page.url().includes('login') || page.url().includes('passport')) {
        throw new Error('Hit login wall. Run: node setup.js');
      }
    } else {
      log(`Image: ${path.basename(imagePath)}`);
      await Adapter.openImageSearch(page);
      await Adapter.uploadImage(page, imagePath);
      await Adapter.waitForImageResults(page);
    }

    // ============ Pick from results (search modes) ============

    if (inputMode !== 'url') {
      log('Extracting top results');
      const results = await Adapter.extractResults(page);
      if (results.length === 0) {
        throw new Error('No search results detected.');
      }

      console.log('\n=== Top results ===');
      results.slice(0, 10).forEach((r, i) => {
        console.log(`  ${String(i + 1).padStart(2, ' ')}. [${r.price || '?'}] ${r.title}`);
        console.log(`      ${r.url}`);
      });
      console.log('');

      if (LIST_ONLY) {
        console.log('--list mode: exit without grabbing.');
        console.log('Pick one with: node grab.js "..." --idx N');
        return; // let finally{} close the browser
      }

      const pick = results[PICK_IDX - 1];
      if (!pick) throw new Error(`--idx ${PICK_IDX} out of range (only ${results.length} results)`);
      log(`Clicking result #${PICK_IDX}: ${pick.title}`);

      await page.goto(pick.url, { waitUntil: 'domcontentloaded' });
      productPage = page;
      await productPage.waitForTimeout(3000);
    }

    log(`Product page: ${productPage.url()}`);

    // ============ Extract images ============

    log('Scrolling to trigger lazy load');
    await scrollToBottom(productPage);

    log('Extracting main image URLs');
    const mainUrls = await Adapter.extractMainImages(productPage);
    log(`Found ${mainUrls.length} main images`);

    if (mainUrls.length === 0) {
      throw new Error('No product images found.');
    }

    // ============ Download main images ============

    log(`Downloading to: ${OUT_DIR}`);
    const ctx = productPage.context().request;
    const referer = new URL(productPage.url()).origin + '/';
    const mainResult = await downloadAll(ctx, mainUrls, OUT_DIR, { referer });

    console.log(`\n✅ Saved ${mainResult.ok}/${mainUrls.length} main images to ${OUT_DIR}`);
    if (mainResult.fail) console.log(`   (${mainResult.fail} failed)`);

    // ============ Extract + download SKU options ============

    log('Extracting SKU option images');
    const skuRaw = await Adapter.extractSkuImages(productPage);
    const mainSet = new Set(mainUrls.map((u) => u.split('/').pop().replace(/[?#].*$/, '')));
    const seen = new Set();
    const skuUrls = skuRaw.filter((u) => {
      if (!/\/\d{8,}\/O1CN/.test(u)) return false;
      const base = u.split('/').pop().replace(/[?#].*$/, '');
      if (seen.has(base) || mainSet.has(base)) return false;
      seen.add(base);
      return true;
    });

    let skuResult = { ok: 0, fail: 0 };
    if (skuUrls.length > 0) {
      const SKU_DIR = path.join(OUT_DIR, '_options');
      log(`Downloading ${skuUrls.length} SKU option images to _options/`);
      skuResult = await downloadAll(ctx, skuUrls, SKU_DIR, { referer, prefix: 'SKU ' });
      console.log(`✅ SKU options: ${skuResult.ok}/${skuUrls.length} saved to _options/`);
      if (skuResult.fail) console.log(`   (${skuResult.fail} failed)`);
    } else {
      log('No extra SKU option images found.');
    }

    // ============ Manifest ============

    fs.writeFileSync(
      path.join(OUT_DIR, '_manifest.json'),
      JSON.stringify(
        {
          ts,
          adapter: Adapter.id,
          input_mode: inputMode,
          direct_url: directUrl || null,
          source_image: imagePath || null,
          keyword: keyword || null,
          pick_idx: inputMode === 'url' ? null : PICK_IDX,
          product_url: productPage.url(),
          main: { downloaded: mainResult.ok, failed: mainResult.fail, urls: mainUrls },
          sku: { downloaded: skuResult.ok, failed: skuResult.fail, urls: skuUrls },
        },
        null,
        2
      )
    );

    // Open the output folder (Windows / macOS)
    if (process.platform === 'win32') exec(`explorer.exe "${OUT_DIR}"`);
    else if (process.platform === 'darwin') exec(`open "${OUT_DIR}"`);
  } catch (e) {
    console.error('\n❌ Error:', e.message);
    if (!LIST_ONLY) {
      try {
        await page.screenshot({ path: path.join(OUT_DIR, '_error.png'), fullPage: true });
      } catch (_) {}
    }
  } finally {
    if (!KEEP_OPEN) {
      await page.waitForTimeout(2000);
      await browser.close();
    } else {
      console.log('\n--keep-open: browser left open. Close manually when done.');
    }
  }
})();
