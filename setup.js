// One-time setup: launches Chrome with a persistent profile and navigates
// to the target site's login page. Log in manually, then close the window.
// Login cookies persist in .profile/ for subsequent grab.js runs.
//
// Usage:
//   node setup.js               # default: Taobao
//   node setup.js --site=taobao

const path = require('path');
const { chromium } = require('playwright');
const { defaultAdapter, getAdapter } = require('./lib/adapters');

const args = process.argv.slice(2);
const siteFlag = args.find((a) => a.startsWith('--site='));
const siteId = siteFlag ? siteFlag.split('=')[1] : null;

const Adapter = siteId ? getAdapter(siteId) : defaultAdapter();
if (!Adapter) {
  console.error(`Unknown site: ${siteId}`);
  process.exit(1);
}

const PROFILE_DIR = path.resolve(__dirname, '.profile');

(async () => {
  console.log(`→ Launching Chrome with profile: ${PROFILE_DIR}`);
  console.log(`→ Site: ${Adapter.displayName}`);
  console.log(`→ Login URL: ${Adapter.loginUrl}`);

  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1400, height: 900 },
    locale: 'zh-CN',
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = browser.pages()[0] || (await browser.newPage());
  await page.goto(Adapter.loginUrl, { waitUntil: 'domcontentloaded' });

  console.log('\n→ Browser is open. Please log in manually, then close the window.');
  console.log('  Cookies will persist in .profile/ for grab.js to reuse.\n');

  // Wait for the user to close the window
  await new Promise((resolve) => browser.once('close', resolve));
  console.log('✅ Setup complete. You can now run: node grab.js "..."');
})();
