# Contributing

Thanks for the interest. This repo is a small personal project that turned out useful enough to share — contributions are welcome but please read this first.

## What we want

**New adapters** for sites where there's a legitimate archiving use case:
- E-commerce listings (your shopping cart, your wishlist)
- Design portfolios (Behance-style sites)
- Public museum / institutional image archives
- Marketplaces you have an account on

**Bug fixes** when a site changes structure and an existing adapter breaks.

**Documentation improvements** — the DEVNOTE / ADAPTERS docs are how this repo earns its keep; making them clearer helps everyone.

## What we don't want

Adapters or features whose primary purpose is:
- Mass downloading from search engines (Google Images, Bing, etc.)
- Bulk scraping of someone's portfolio without their knowledge for AI training datasets
- Scraping sites that explicitly forbid it in robots.txt / ToS
- Circumventing CAPTCHA or anti-bot measures (solving manually in your own browser is fine; building auto-solvers is not)

PRs adding these will be closed.

## How to contribute an adapter

Read [`docs/ADAPTERS.md`](docs/ADAPTERS.md) first — it walks you through the `BaseAdapter` interface in ~30 lines.

### PR checklist

- [ ] Extends `BaseAdapter` and is registered in `lib/adapters/index.js`
- [ ] At least 3 real product/page URLs smoke-tested against your adapter
- [ ] No site credentials, cookies, `.profile/` data, or output folders committed
- [ ] Both READMEs (en + zh-TW) updated with the new adapter row
- [ ] [`docs/DEVNOTE`](docs/DEVNOTE.md) updated if your adapter surfaced a new technical insight worth recording
- [ ] PR description includes: target site, rate-limit / captcha behavior observed, any login requirements

## Reporting bugs

Use the bug report template under [Issues](../../issues/new/choose). Include:
- Which adapter and a sample URL that triggers the bug
- The full CLI output (redact anything personal)
- What you expected vs. what happened
- Whether the site recently changed (you saw new layout, etc.)

## Style / conventions

- No build step, no TypeScript — keep it readable JavaScript so anyone can fork and tweak
- No external runtime deps beyond Playwright
- 2-space indent, single quotes, no semicolons-religion (the codebase uses them; just match)
- Comments explain *why*, not *what*

## Development setup

```bash
git clone https://github.com/<your-fork>/product-page-grabber.git
cd product-page-grabber
npm install
npx playwright install chrome
node setup.js   # or node setup.js --site=<your-adapter>
```

Smoke test:

```bash
node grab.js "<your test URL>" --keep-open   # leaves browser open for inspection
```

## License

By contributing, you agree your contributions will be licensed under MIT, the same as the rest of the repo.
