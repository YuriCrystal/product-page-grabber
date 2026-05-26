# Examples

A few real-world workflows you can copy-paste.

## Find and grab a car part

You're researching aftermarket parts for a specific car. Search by keyword, eyeball the top 10, grab the ones that match.

```bash
# 1. See what's out there
node grab.js "RAV4 26款 油箱蓋密封圈" --list

# 2. Pick the ones that look right
node grab.js "RAV4 26款 油箱蓋密封圈" --idx 1
node grab.js "RAV4 26款 油箱蓋密封圈" --idx 4
node grab.js "RAV4 26款 油箱蓋密封圈" --idx 7
```

Each grab opens a new Desktop folder when done.

## Reverse-image search

You have a photo from a friend's car — find the same part on the marketplace.

```bash
node grab.js "C:\Users\me\Pictures\reference.jpg" --list
node grab.js "C:\Users\me\Pictures\reference.jpg" --idx 2
```

## Direct URL (you already know what you want)

```bash
node grab.js "https://item.taobao.com/item.htm?id=1039512168890"
```

Skips the search step entirely.

## Debug a broken adapter

Browser stays open so you can inspect the page yourself.

```bash
node grab.js "..." --keep-open
```

## Force a specific adapter

If URL auto-detection picks wrong, override:

```bash
node grab.js "ambiguous keyword" --site=taobao
```
