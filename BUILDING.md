# Building Prayer Hub

This is an Eleventy (11ty) static site. Nothing runs at request time — every page,
the sitemap, and the RSS feeds are generated at build time and served as plain
files. To add content, add a file and rebuild.

## Adding a prayer

Every prayer is one markdown file in `content/prayers/`. Filename doesn't matter
for routing — the `permalink` in the frontmatter decides the URL.

Create `content/prayers/my-new-prayer.md`:

```markdown
---
layout: layouts/prayer.njk
permalink: "/{{ category }}/{{ slug }}/"
title: "My New Prayer"
slug: my-new-prayer
category: night-prayer
keyword: "the target search keyword this page is for"
excerpt: "One sentence describing the prayer — this becomes the meta description."
dateAdded: 2026-08-06
dateModified: 2026-08-06
---

The prayer text goes here, as plain paragraphs.

Amen.
```

Required fields:

| Field | Purpose |
|---|---|
| `title` | Page `<h1>` and `<title>` tag |
| `slug` | Used in the URL via `permalink` |
| `category` | Must match a `slug` in `_data/categories.json` — decides which hub page it appears on and which nav link it's under |
| `excerpt` | Meta description + the line shown in listing pages |
| `dateAdded` | Not currently displayed, kept for reference |
| `dateModified` | Drives `<lastmod>` in the sitemap and `pubDate` in the RSS feeds — **update this whenever you edit a prayer's text** |

Bump `dateModified` on every edit, even small wording fixes — that's the freshness
signal the sitemap and feeds are built around.

## Adding a category

Categories live in `_data/categories.json`. Each one auto-generates a hub page at
`/{slug}/` listing every prayer whose `category` field matches, and a link in the
site nav. To add one:

```json
{
  "slug": "saints-prayer",
  "title": "Prayers to the Saints",
  "rubric": "Ad Sanctos",
  "icon": "church",
  "description": "One paragraph describing the category, used as its page meta description."
}
```

`icon` is a [Material Symbols Outlined](https://fonts.google.com/icons) ligature
name (e.g. `wb_sunny`, `bedtime`, `shield`, `church`). `rubric` is the short Latin
subtitle shown under the category name on the homepage.

No template changes needed — the hub page, nav link, and homepage card are all
generated automatically for anything in this file.

## What's NOT built yet

These content shapes don't have templates yet — they'd need their own layout,
not just a new category:

- **Novenas** — day-by-day sequences, need a different structure than a single prayer
- **Litanies** — call-and-response format (see the Angelus mockup in the Stitch export for the intended V/. R/. styling)
- **Liturgical calendar / saint-of-the-day** — needs date-driven logic, not a flat file per entry

Everything else — a prayer, to any saint, for any occasion, in any of the existing
categories — is buildable right now with just a markdown file.

## Local build

```bash
npm install       # first time only
npm run build      # outputs static site to _site/
npm run serve       # build + serve locally with live reload
```

## Deploying

Push to `main`. Coolify watches the repo and rebuilds the Docker image
(`Dockerfile` → static build → Caddy serving `_site/` on port 80) automatically.
There's no manual deploy step beyond `git push`.

`SITE_URL` (set in Coolify's environment variables, currently `https://prayerhub.space`)
controls every canonical URL, the sitemap, and the RSS feeds — don't hardcode
the domain anywhere in content.
