// Base adapter interface. Each site adapter should extend this class
// and implement the methods it can support.
//
// At minimum, an adapter needs:
//   - matchUrl(url)       → returns true if this adapter handles the URL
//   - id                  → unique adapter id (e.g. 'taobao')
//   - displayName         → human-readable name
//
// Optional capabilities:
//   - supportsKeywordSearch → buildSearchUrl(keyword) + extractResults(page)
//   - supportsImageSearch   → openImageSearch(page) + uploadImage(page, imgPath)
//   - extractMainImages(page)   → returns string[] of full-size product image URLs
//   - extractSkuImages(page)    → returns string[] of SKU/variant thumbnail URLs

class BaseAdapter {
  /** @type {string} */
  static id = 'base';

  /** @type {string} */
  static displayName = 'Base';

  /**
   * Does this adapter handle the given product URL?
   * @param {string} url
   * @returns {boolean}
   */
  static matchUrl(url) {
    return false;
  }

  /**
   * The login page URL for setup.js to navigate to. Override per site.
   * @returns {string}
   */
  static get loginUrl() {
    return '';
  }

  // ============ Optional: keyword search ============

  static supportsKeywordSearch = false;

  /**
   * Build the search results URL for a keyword.
   * @param {string} keyword
   * @returns {string}
   */
  static buildSearchUrl(keyword) {
    throw new Error(`${this.id}: buildSearchUrl not implemented`);
  }

  /**
   * Extract top search results from the current page.
   * @param {import('playwright').Page} page
   * @returns {Promise<Array<{id: string, url: string, title: string, price: string}>>}
   */
  static async extractResults(page) {
    throw new Error(`${this.id}: extractResults not implemented`);
  }

  // ============ Optional: image search ============

  static supportsImageSearch = false;

  /**
   * Open the site's reverse-image-search UI from the homepage.
   * @param {import('playwright').Page} page
   */
  static async openImageSearch(page) {
    throw new Error(`${this.id}: openImageSearch not implemented`);
  }

  /**
   * Upload an image to the image search UI.
   * @param {import('playwright').Page} page
   * @param {string} imagePath
   */
  static async uploadImage(page, imagePath) {
    throw new Error(`${this.id}: uploadImage not implemented`);
  }

  /**
   * Wait for the image search results page to be ready.
   * @param {import('playwright').Page} page
   */
  static async waitForImageResults(page) {
    throw new Error(`${this.id}: waitForImageResults not implemented`);
  }

  // ============ Required: image extraction ============

  /**
   * Extract main product image URLs from a product page.
   * Should apply seller-id-lock and recommendation-bleed filtering.
   * @param {import('playwright').Page} page
   * @returns {Promise<string[]>} normalized full-size URLs
   */
  static async extractMainImages(page) {
    throw new Error(`${this.id}: extractMainImages not implemented`);
  }

  /**
   * Extract SKU / variant thumbnail URLs from a product page.
   * Optional — return [] if not applicable.
   * @param {import('playwright').Page} page
   * @returns {Promise<string[]>}
   */
  static async extractSkuImages(page) {
    return [];
  }
}

module.exports = { BaseAdapter };
