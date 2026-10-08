# Prayer Hub: SEO boost plan

_Updated 2026-10-08. Site: https://prayerhub.space_

## Where we started (2026-10-08)

- **Ubersuggest:**
  - domain authority 1
  - 2 ranking keywords
  - 0 organic traffic
  - 16 referring domains, all nofollow
- **12 prayers live**, last pushed 2026-08-13. Another 13 were written but stuck unpushed in a second local copy, because the daily task said "don't push, Luis reviews".
- **Sitemap problems:**
  - `/README/` and `/BUILDING/` were listed as pages.
  - 5 of the 6 category hubs were missing.
- **No structured data, OG tags or Twitter cards.**
- **Pages didn't match search intent:**
  - The St. Michael page had no actual St. Michael prayer.
  - The bible-verses pages were banned from quoting verses.
- **Pages were thin** (90 to 350 words) and keywords were chosen at random.

## What the keyword data says (Ubersuggest, US)

| Opportunity | Example | Volume | Difficulty |
|---|---|---|---|
| **Psalms (KJV text, public domain)** | psalm 91 | 673,000 | **17** |
| | psalm 91 king james | 135,000 | 31 |
| | psalm 121 / 23 | 135k / 673k | 51 / 63 |
| **Bible verses by topic** | bible verses about love | 165,000 | 27 |
| | … encouragement | 135,000 | 27 |
| | … anxiety | 49,500 | 19 |
| **Novenas** (very low difficulty) | novena of st jude | 18,100 | **11** |
| | divine mercy novena | 14,800 | **10** |
| | mary undoer of knots novena | 5,400 | **7** |
| **Prayers to saints** | prayer to saint michael the archangel | 135,000 | 34 |
| | prayer to saint anthony | 14,800 | 14 |
| | prayer to saint padre pio | 14,800 | 17 |
| **Low-competition Catholic basics** | catholic prayers for night | 9,900 | **8** |
| | short prayer before bed | 4,400 | **7** |
| | prayer for safe travel | 9,900 | 8 |

**Model to copy:** praymorenovenas.com. It has domain authority 44 and gets about 189k organic visits a month, almost entirely from one novena or saint per page, each with the traditional text.

The full ranked list is in `keyword_queue.json`, 95 keywords. Regenerate it with `python scripts/build-keyword-queue.py`.

---

## Done (this branch)

- [x] **13 pending prayers merged** into this repo, for 25 total.
- [x] **Sitemap fixed:**
  - all 6 hubs included (`addAllPagesToCollections`)
  - README/BUILDING/SEO-PLAN excluded
  - empty hubs excluded and noindexed
- [x] **Publisher API, same structure as mobilepanels** (`publisher/`, `PUBLISHING.md`):
  - Caddy + Node publisher in docker-compose, sharing a site volume, with `/api/` as the only proxied path
  - bearer token, with JSON as the source of truth in the bind-mounted `data/`
  - Eleventy rebuilds into a new release, then an atomic symlink swap
  - IndexNow ping on every publish
  - upgrades existing pages in place without changing their URLs
  - quality checks enforced: thin pages, near-duplicates, slug and URL guards
  - tested end to end in Docker
- [x] **Structured data:**
  - `Article`, `BreadcrumbList` and `FAQPage` on prayers
  - `CollectionPage` + `ItemList` on hubs
  - `WebSite` + `Organization` on the home page
- [x] **Social tags:** OG and Twitter meta on every page.
- [x] **Richer prayer template**, every section optional:
  - traditional text, short version, novena days with a jump menu, variants
  - meaning / how to pray, KJV Scripture blocks, FAQ
  - related prayers (same category plus other categories)
- [x] **Hub intros and FAQs** for every category, plus 3 new categories: **Saints, Novenas, Psalms**.
- [x] **Trust and housekeeping pages:**
  - `/about/` (sources and editorial policy)
  - a real `/404.html` (noindex)
  - URLs without a trailing slash now redirect (308) to the canonical version
- [x] **St. Michael upgrade payload** with the real Leo XIII prayer, the Latin, KJV verses and FAQ: `publisher/examples/saint-michael-prayer.json`.
- [x] **New daily task:** queue-driven, 2 pages per run, publishes through the API.

## To do

### User, one time

- [ ] Coolify: switch the build pack to **Docker Compose** and keep the domain on the `prayerhub` service. Set `PUBLISH_TOKEN` (a long random string) and `SITE_URL`, then deploy.
- [ ] Put the same `PUBLISH_TOKEN=…` in `Documents/prayer-hub/.env`.
- [ ] Publish St. Michael: `node scripts/publish.js publisher/examples/saint-michael-prayer.json`.
- [ ] Search Console and Bing Webmaster: submit `https://prayerhub.space/sitemap.xml`, and request indexing for the upgraded St. Michael URL.
- [ ] Retire the old `C:\Users\LuisUrbaez\prayerhub` folder. Everything it had is merged here.

### Content (the daily task works through these)

- [ ] Psalm 91, then Psalm 23 and 121: the biggest volume at the lowest difficulty.
- [ ] Upgrade the existing bible-verses pages (love, strength, anxiety) with 8 to 15 KJV verses each, through the API with the same slug.
- [ ] Novenas: St. Jude, Divine Mercy, Surrender, Mary Undoer of Knots, St. Joseph.
- [ ] Saints: Anthony, Padre Pio, Raphael, Jude, Holy Spirit.

### Technical, next

- [ ] An og:image per prayer, generated with `scripts/prayer-image.js --size=og` at build time. It's ready to wire into `publisher/build.js`. Right now every page uses the logo.
- [ ] Self-host or subset the Material Symbols font, which blocks rendering (Core Web Vitals).
- [ ] Saint of the day / feast days (40k searches for "saint of the day", difficulty 53): a `_data/saints.json` calendar. Do this after the saints category has about 15 pages.
- [ ] Backlinks: every one we have is nofollow. Submit to Catholic link directories and parish resource pages, and pitch the novena pages to novena communities.

## Measurement

- [ ] Baseline now (Ubersuggest: 2 keywords, 0 traffic). Re-check about 2026-11-08 in Search Console, comparing **by page**.
- [ ] 30-day targets:
  - all URLs indexed
  - Psalm 91 and St. Michael in the top 30
  - first 100 organic clicks
