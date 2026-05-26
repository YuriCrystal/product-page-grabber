// Page utilities shared across adapters.

/**
 * Scroll a page from top to bottom to trigger lazy-loaded images.
 * @param {import('playwright').Page} page
 */
async function scrollToBottom(page) {
  await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const height = () => document.body.scrollHeight;
    let y = 0;
    while (y < height()) {
      window.scrollTo(0, y);
      await wait(500);
      y += 800;
    }
    window.scrollTo(0, height());
    await wait(2500);
    window.scrollTo(0, 0);
  });
}

module.exports = { scrollToBottom };
