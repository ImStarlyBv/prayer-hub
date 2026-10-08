# Publishing prayers

How to push prayers onto prayerhub.space through the publisher API. This is the
same structure as mobilepanels.shop's publisher, ported to this Eleventy site:

- Prayers become **plain static HTML** at `/<category>/<slug>/`, with no JavaScript.
- Each publish updates the category hub, home page, archive, `sitemap.xml`,
  `rss.xml` and `feed.rss`, and pings IndexNow.
- No existing URL is ever moved.

---

## 1. How it works

- You `POST` a JSON prayer to `/api/prayers` with a bearer token.
- The publisher saves the JSON as the **source of truth**: `data/prayers/<slug>.json`, bind-mounted on the server.
- It rebuilds the whole site with Eleventy into a new release folder (about 1 second), then switches Caddy to it in one atomic step. Visitors never see a half-built site.
- Posting the same slug again **updates** it.
- Visitors never hit Node. Caddy serves static files and proxies only `/api/` to the publisher.

```
                 ┌──────────── Caddy (prayerhub) ─────────────┐
visitor ───────► │ /*      -> /srv/site/current  (static)     │
publish task ──► │ /api/*  -> publisher:8000                  │
                 └────────────────────┬───────────────────────┘
                                      │ shared volume `site`
                 ┌──────── publisher (Node) ──────────────────┐
                 │ data/prayers/*.json -> content/api/*.md    │
                 │ eleventy -> releases/<id>/                 │
                 │ swap symlink current -> releases/<id>      │
                 └────────────────────────────────────────────┘
```

Git-tracked prayers in `content/prayers/*.md` still work exactly as before.
API prayers are merged in next to them.

---

## 2. Authentication

Every endpoint except `GET /api/health` needs the `PUBLISH_TOKEN` you set in Coolify:

```
Authorization: Bearer <PUBLISH_TOKEN>
```

- A wrong or missing token returns `401`.
- If the server has no token set (or it's still `changeme`), the API returns `503` and the site keeps serving normally.

**Base URL:** `https://prayerhub.space/api`

**CLI:** `node scripts/publish.js` reads `PUBLISH_TOKEN` (and optionally `PUBLISH_URL`) from the environment or from `.env`.

---

## 3. Endpoints

| Method + path | What it does |
|---|---|
| `GET /api/health` | `{"status":"ok","prayers":N,"release":"…"}`, no auth |
| `GET /api/prayers` | every prayer, git and API, with `slug, title, category, keyword, url, source` |
| `GET /api/prayers/{slug}` | the stored JSON of an API prayer |
| `POST /api/prayers` | publish **or** update (upsert by slug). `?dry_run=1` validates only |
| `DELETE /api/prayers/{slug}` | unpublish an API prayer. If it was overriding a git page, the git version comes back |
| `GET /api/categories` | every category, with hub copy |
| `PUT /api/categories/{slug}` | create a category, or override a git category's hub copy |
| `DELETE /api/categories/{slug}` | remove an API category (only if it has no prayers) |
| `POST /api/rebuild` | rebuild the whole site |

`POST /api/prayers` returns **`201`** for a new prayer and **`200`** for an update:

```json
{ "slug": "psalm-91", "url": "/psalms/psalm-91/", "updated": false,
  "overrides_git": false, "unchanged": false,
  "warnings": ["excerpt is 112 chars; aim for 120-165"],
  "build": { "release": "20261008…", "ms": 1100 } }
```

Re-posting identical content returns `"unchanged": true` without rebuilding, and `dateModified` doesn't move. Freshness dates only change when the text really changes.

---

## 4. The prayer payload

Only `slug`, `category`, `title`, `excerpt` and one of `body_markdown`, `traditional.text` or `days` are required. Every other section renders only when present.

```jsonc
{
  "slug": "psalm-91",                      // URL: /<category>/<slug>/
  "category": "psalms",                    // must exist (GET /api/categories)
  "title": "Psalm 91 (KJV): Full Text, Meaning & Prayer",  // <title> + H1, keep ≤ 60 chars
  "excerpt": "…",                          // meta description, 120-165 chars
  "keyword": "psalm 91",                   // primary keyword (for warnings + schema)
  "secondary_keywords": ["psalm 91 king james"],

  "traditional": {                         // the known text, shown FIRST
    "title": "Psalm 91 (King James Version)",
    "text": "He that dwelleth in the secret place…",
    "source": "Psalm 91:1-16, King James Version"
  },
  "prayer_heading": "A Prayer Based on Psalm 91",  // heading over body_markdown
  "body_markdown": "Lord, You are my refuge…",     // the main (original) prayer
  "short_version": "…",                            // for "short … prayer" searches
  "variants": [{ "title": "For Your Family", "text": "…" }],
  "days": [{ "title": "Day 1: …", "text": "…" }],  // novenas: 9 entries, with a jump menu
  "how_to_pray_heading": "What Psalm 91 Means",
  "how_to_pray": "markdown: meaning, history, when to pray it",
  "verses": [{ "ref": "Psalm 91:11", "text": "For he shall give his angels…", "translation": "KJV" }],
  "faq": [{ "q": "Who wrote Psalm 91?", "a": "…" }]  // also emitted as FAQPage schema
}
```

The page renders top to bottom in this order:
1. H1 and excerpt
2. **traditional text**
3. body
4. short version
5. days
6. variants
7. meaning / how to pray
8. Scripture
9. FAQ
10. related prayers

All text is escaped: HTML in a payload shows up as text, and `{{ }}` is never evaluated.

A complete real example is [`publisher/examples/saint-michael-prayer.json`](publisher/examples/saint-michael-prayer.json).

---

## 5. Rules the API enforces (`422` on failure)

- **Slug:** matches `^[a-z0-9]+(?:-[a-z0-9]+)*$`, is at most 80 characters, and isn't reserved (`api`, `archive`, `about`, `css`, `images`…) or a category slug.
- **Category** must exist.
- **URLs never move.**
  - A slug that already exists as a git page can be published through the API. That's how old pages get **upgraded in place**, and the API version replaces the git one. The category must match, so the URL stays the same.
  - An API prayer can't change category. Unpublish it first.
- **Not thin:** at least 120 words across all sections.
- **Not a near-duplicate:** the original writing (body, short version, variants, days) is compared with every other prayer on the site using 5-word shingles. A similarity of 0.5 or more is rejected. Traditional texts and Scripture are excluded from this check on purpose.
- **Excerpt** must be at least 50 characters.

**Soft warnings** come back on success and are worth fixing:
- excerpt length outside 120 to 165 characters
- title over 60 characters
- keyword missing from the title, or from the excerpt and first 120 words
- under 400 words
- no FAQ
- a bible-verses page with no verses

---

## 6. Writing rules for the generator

1. **Match search intent.** If a traditional text exists, it must be on the page, as `traditional`. Examples:
   - the Saint Michael prayer, the Hail Mary, the Act of Contrition, Grace before meals, the Memorare
   - the Psalms (KJV)
   - novena prayers

   Our own prayer goes **after** it, never instead of it.
2. **Quote Scripture from the KJV only**, which is public domain in the US, with the reference and `"translation": "KJV"`. Never quote modern copyrighted translations (NIV, ESV, NABRE).
3. **One page per search intent.** Put close variants in `secondary_keywords` instead of making a new page. Check `GET /api/prayers` before publishing.
4. **FAQs come from real "People also ask" questions** for the keyword, 3 to 5 of them, each answered in 1 to 3 sentences.
5. Aim for **600 to 1,200 words**, and keep the prayer itself near the top.
6. **Never invent facts:** dates, authors, feast days. If you're unsure, leave it out.

---

## 7. Deploying the publisher (Coolify, one time)

1. Coolify must deploy this app with the **Docker Compose** build pack, using `docker-compose.yml`. Keep the domain on the `prayerhub` service.
   - Plain Dockerfile mode still serves the site (the image has a baked copy), but `/api/` returns 502.
2. Set the environment variables:
   - `PUBLISH_TOKEN`: a long random string
   - `SITE_URL`: `https://prayerhub.space`
3. Deploy. On start, the publisher rebuilds the site into the `site` volume. Check that `GET https://prayerhub.space/api/health` shows a `release`.
4. Put the same token in a local `.env` (gitignored) as `PUBLISH_TOKEN=…` for `scripts/publish.js`.

**Backups:** `node scripts/publish.js --backup backups/2026-10-08` saves every API prayer's JSON locally.
