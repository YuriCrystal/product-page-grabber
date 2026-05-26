// Diagnostic: open a 1688 product page and inspect structure for deep image extraction.
//
// Reports:
//   - All iframes (src, dimensions, accessibility)
//   - Image count + body height at multiple scroll depths
//   - Presence of "商品详情" / "查看更多" buttons
//   - All alicdn URLs categorized by host
//
// Usage:
//   node scripts/diag-1688.js "https://detail.1688.com/offer/<id>.html"

const path = require('path');
const { chromium } = require('playwright');

const url = process.argv[2];
if (!url) {
  console.error('Usage: node scripts/diag-1688.js "<1688 product URL>"');
  process.exit(1);
}

const PROFILE_DIR = path.resolve(__dirname, '..', '.profile');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

(async () => {
  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1400, height: 900 },
    userAgent: UA,
    locale: 'zh-CN',
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = browser.pages()[0] || (await browser.newPage());
  console.log('→ Navigating to:', url);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const title = await page.title();
  console.log('→ Title:', title);
  if (/验证码|captcha/i.test(title)) {
    console.log('❌ Captcha wall. Solve manually first.');
    await page.waitForTimeout(60000);
    await browser.close();
    return;
  }

  // ============ Probe 1: scroll depth vs image count ============
  console.log('\n=== Scroll depth probe ===');
  const probe = async (label) => {
    const r = await page.evaluate(() => ({
      bodyHeight: document.body.scrollHeight,
      scrollY: window.scrollY,
      imgs: document.querySelectorAll('img').length,
      alicdnImgs: [...document.querySelectorAll('img')].filter((i) =>
        /alicdn/.test(i.src || i.currentSrc || '')
      ).length,
      iframes: document.querySelectorAll('iframe').length,
    }));
    console.log(`  [${label}] bodyH=${r.bodyHeight} scrollY=${r.scrollY} imgs=${r.imgs} alicdnImgs=${r.alicdnImgs} iframes=${r.iframes}`);
    return r;
  };

  await probe('initial');
  for (let y = 0; y <= 6000; y += 1000) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(800);
  }
  await probe('after-deep-scroll');

  // Try really deep
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2000);
  await probe('after-bottom');

  // ============ Probe 2: iframes ============
  console.log('\n=== Iframes ===');
  const iframes = await page.evaluate(() => {
    return [...document.querySelectorAll('iframe')].map((f) => {
      let accessible = false;
      try {
        // eslint-disable-next-line no-unused-expressions
        f.contentDocument?.body;
        accessible = !!f.contentDocument;
      } catch (_) {
        accessible = false;
      }
      return {
        src: f.src,
        width: f.width || f.clientWidth,
        height: f.height || f.clientHeight,
        accessible,
        className: f.className,
        id: f.id,
      };
    });
  });
  iframes.forEach((f, i) => {
    console.log(`  iframe[${i}]`);
    console.log(`    src: ${f.src}`);
    console.log(`    size: ${f.width}x${f.height}  accessible: ${f.accessible}`);
    console.log(`    class: ${f.className}  id: ${f.id}`);
  });

  // ============ Probe 3: buttons / tabs to click ============
  console.log('\n=== Potential expanders / tabs ===');
  const expanders = await page.evaluate(() => {
    const results = [];
    document.querySelectorAll('a, button, div[role="tab"], li').forEach((el) => {
      const t = (el.innerText || '').trim();
      if (
        t.length >= 2 &&
        t.length < 20 &&
        /(详情|描述|介绍|查看更多|展开|图文|更多|实拍)/.test(t)
      ) {
        results.push({
          text: t,
          tag: el.tagName,
          className: el.className.toString().slice(0, 60),
        });
      }
    });
    return results.slice(0, 30);
  });
  expanders.forEach((e) => {
    console.log(`  <${e.tag}> "${e.text}" class="${e.className}"`);
  });

  // ============ Probe 4: alicdn URLs by host ============
  console.log('\n=== All alicdn URLs by host ===');
  const byHost = await page.evaluate(() => {
    const counts = {};
    const samples = {};
    const collect = (s) => {
      if (!s || !/alicdn\.com/.test(s)) return;
      const host = s.startsWith('//') ? new URL('https:' + s).host : new URL(s).host;
      counts[host] = (counts[host] || 0) + 1;
      if (!samples[host]) samples[host] = s.slice(0, 130);
    };
    document.querySelectorAll('img').forEach((i) => {
      [i.currentSrc, i.src, i.dataset.src].forEach(collect);
    });
    document.querySelectorAll('*').forEach((el) => {
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && /alicdn/.test(bg)) {
        const m = bg.match(/url\(["']?([^"')]+)/);
        if (m) collect(m[1]);
      }
    });
    return { counts, samples };
  });
  Object.entries(byHost.counts).forEach(([host, count]) => {
    console.log(`  ${host}: ${count}`);
    console.log(`    sample: ${byHost.samples[host]}`);
  });

  // ============ Probe 5: dump ALL cbu01.alicdn.com URLs (product CDN) ============
  console.log('\n=== All cbu01.alicdn.com URLs (full) ===');
  const cbu01Urls = await page.evaluate(() => {
    const set = new Set();
    const collect = (s) => {
      if (!s || !/cbu01\.alicdn\.com/.test(s)) return;
      set.add(s.startsWith('//') ? 'https:' + s : s);
    };
    document.querySelectorAll('img').forEach((i) => {
      [i.currentSrc, i.src, i.dataset.src].forEach(collect);
    });
    document.querySelectorAll('*').forEach((el) => {
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && /cbu01/.test(bg)) {
        const m = bg.match(/url\(["']?([^"')]+)/);
        if (m) collect(m[1]);
      }
    });
    return [...set];
  });
  cbu01Urls.forEach((u, i) => console.log(`  [${i + 1}] ${u}`));

  console.log('\n→ Closing browser in 5s...');
  await page.waitForTimeout(5000);
  await browser.close();
})();
