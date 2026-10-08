// Payload validation + quality gates. Hard failures throw ValidationError (-> 422);
// soft SEO issues come back as `warnings` on a successful publish.
const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const config = require("./config");
const store = require("./store");

class ValidationError extends Error {}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED = new Set([
  "api", "archive", "about", "css", "images", "og", "assets", "feed", "rss",
  "sitemap", "robots", "index", "search", "tag", "tags", "category", "page",
]);
const DUPLICATE_THRESHOLD = 0.5;
const MIN_WORDS = 120;

function gitPrayers() {
  const dir = path.join(config.APP_DIR, "content", "prayers");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const { data, content } = matter(fs.readFileSync(path.join(dir, f), "utf8"));
      return { ...data, slug: data.slug || f.slice(0, -3), body_markdown: content, _git: true };
    });
}

function gitCategories() {
  return require(path.join(config.APP_DIR, "_data", "categoryList.json"));
}

function allCategories() {
  const map = new Map(gitCategories().map((c) => [c.slug, c]));
  for (const c of store.categories.all()) map.set(c.slug, { ...map.get(c.slug), ...c });
  return [...map.values()];
}

// ---- helpers ---------------------------------------------------------------
function str(v, field, { required = false, max = 20000 } = {}) {
  if (v === undefined || v === null || v === "") {
    if (required) throw new ValidationError(`${field} is required`);
    return undefined;
  }
  if (typeof v !== "string") throw new ValidationError(`${field} must be a string`);
  const s = v.trim();
  if (required && !s) throw new ValidationError(`${field} is required`);
  if (s.length > max) throw new ValidationError(`${field} is longer than ${max} characters`);
  return s || undefined;
}

function list(v, field, shape, max = 20) {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) throw new ValidationError(`${field} must be an array`);
  if (v.length > max) throw new ValidationError(`${field} has more than ${max} items`);
  const out = v.map((item, i) => {
    if (!item || typeof item !== "object") throw new ValidationError(`${field}[${i}] must be an object`);
    const o = {};
    for (const [key, opts] of Object.entries(shape)) {
      const val = str(item[key], `${field}[${i}].${key}`, opts);
      if (val !== undefined) o[key] = val;
    }
    return o;
  });
  return out.length ? out : undefined;
}

function validateSlug(slug, field = "slug") {
  if (typeof slug !== "string" || !SLUG_RE.test(slug) || slug.length > 80) {
    throw new ValidationError(`${field} must match ${SLUG_RE} and be at most 80 characters`);
  }
  if (RESERVED.has(slug)) throw new ValidationError(`${field} '${slug}' is reserved`);
  return slug;
}

function words(text) {
  return (text || "").toLowerCase().replace(/[^a-z0-9'\s]/g, " ").split(/\s+/).filter(Boolean);
}

function shingles(text, n = 5) {
  const w = words(text);
  const set = new Set();
  for (let i = 0; i + n <= w.length; i++) set.add(w.slice(i, i + n).join(" "));
  return set;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

// The original writing on a page: body + short version + variants. Traditional
// texts and Scripture are shared on purpose and excluded from the duplicate check.
function originalText(p) {
  return [p.body_markdown, p.short_version, ...(p.variants || []).map((v) => v.text)].filter(Boolean).join("\n");
}

function allText(p) {
  return [
    originalText(p),
    p.traditional && p.traditional.text,
    p.how_to_pray,
    ...(p.verses || []).map((v) => v.text),
    ...(p.faq || []).map((f) => `${f.q} ${f.a}`),
  ].filter(Boolean).join("\n");
}

// ---- prayers ---------------------------------------------------------------
function prayer(payload) {
  if (!payload || typeof payload !== "object") throw new ValidationError("body must be a JSON object");
  const slug = validateSlug(payload.slug);
  const categories = allCategories();
  if (categories.some((c) => c.slug === slug)) throw new ValidationError(`slug '${slug}' collides with a category`);

  const category = str(payload.category, "category", { required: true });
  if (!categories.some((c) => c.slug === category)) {
    throw new ValidationError(`unknown category '${category}' (known: ${categories.map((c) => c.slug).join(", ")})`);
  }

  // Overriding a git-tracked prayer is allowed (that is how old pages get
  // upgraded), but only in the same category, so its URL never changes.
  const git = gitPrayers();
  const gitTwin = git.find((p) => p.slug === slug);
  if (gitTwin && gitTwin.category !== category) {
    throw new ValidationError(
      `'${slug}' already exists at /${gitTwin.category}/${slug}/ — an update must keep category '${gitTwin.category}' so the URL does not change`
    );
  }
  const existing = store.prayers.get(slug);
  if (existing && existing.category !== category) {
    throw new ValidationError(
      `'${slug}' is published at /${existing.category}/${slug}/ — changing category would change its URL; unpublish it first`
    );
  }

  const p = {
    slug,
    category,
    title: str(payload.title, "title", { required: true, max: 120 }),
    excerpt: str(payload.excerpt, "excerpt", { required: true, max: 220 }),
    keyword: str(payload.keyword, "keyword", { max: 120 }),
    secondary_keywords: Array.isArray(payload.secondary_keywords)
      ? payload.secondary_keywords.map((k, i) => str(k, `secondary_keywords[${i}]`, { max: 120 })).filter(Boolean)
      : undefined,
    prayer_heading: str(payload.prayer_heading, "prayer_heading", { max: 120 }),
    body_markdown: str(payload.body_markdown, "body_markdown"),
    short_version: str(payload.short_version, "short_version", { max: 2000 }),
    how_to_pray_heading: str(payload.how_to_pray_heading, "how_to_pray_heading", { max: 120 }),
    how_to_pray: str(payload.how_to_pray, "how_to_pray"),
    variants: list(payload.variants, "variants", { title: { required: true, max: 120 }, text: { required: true } }, 8),
    // Novenas (and any multi-day devotion): one entry per day, rendered in order.
    days: list(payload.days, "days", { title: { required: true, max: 120 }, text: { required: true } }, 54),
    verses: list(payload.verses, "verses", { ref: { required: true, max: 80 }, text: { required: true, max: 1500 }, translation: { max: 40 } }, 12),
    faq: list(payload.faq, "faq", { q: { required: true, max: 200 }, a: { required: true, max: 2000 } }, 10),
  };

  if (payload.traditional !== undefined && payload.traditional !== null) {
    const t = payload.traditional;
    if (typeof t !== "object") throw new ValidationError("traditional must be an object");
    p.traditional = {
      title: str(t.title, "traditional.title", { max: 120 }),
      text: str(t.text, "traditional.text", { required: true }),
      source: str(t.source, "traditional.source", { max: 300 }),
    };
  }

  if (!p.body_markdown && !p.traditional && !p.days) {
    throw new ValidationError("body_markdown is required (or traditional.text, or days)");
  }
  if (p.excerpt.length < 50) throw new ValidationError("excerpt must be at least 50 characters (it is the meta description)");

  const total = words(allText(p)).length;
  if (total < MIN_WORDS) throw new ValidationError(`too thin: ${total} words, minimum is ${MIN_WORDS}`);

  // Near-duplicate guard against every other prayer on the site.
  const mine = shingles(originalText(p));
  if (mine.size) {
    const others = [...git, ...store.prayers.all()].filter((o) => o.slug !== slug);
    for (const o of others) {
      const score = jaccard(mine, shingles(originalText(o)));
      if (score >= DUPLICATE_THRESHOLD) {
        throw new ValidationError(
          `near-duplicate of '${o.slug}' (similarity ${score.toFixed(2)}) — write a distinct prayer`
        );
      }
    }
  }

  for (const k of Object.keys(p)) if (p[k] === undefined) delete p[k];
  return { prayer: p, warnings: seoWarnings(p, total) };
}

function seoWarnings(p, total) {
  const w = [];
  if (p.excerpt.length < 120 || p.excerpt.length > 165) w.push(`excerpt is ${p.excerpt.length} chars; aim for 120-165`);
  if (p.title.length > 60) w.push(`title is ${p.title.length} chars; Google truncates around 60`);
  if (!p.keyword) w.push("no keyword set");
  else {
    const kw = p.keyword.toLowerCase();
    if (!p.title.toLowerCase().includes(kw)) w.push(`keyword '${p.keyword}' is not in the title`);
    const lead = words(p.traditional ? p.traditional.text + " " + (p.body_markdown || "") : p.body_markdown).slice(0, 120).join(" ");
    const kwWords = words(kw).join(" ");
    if (!lead.includes(kwWords) && !p.excerpt.toLowerCase().includes(kw)) {
      w.push(`keyword '${p.keyword}' is not in the excerpt or the first 120 words`);
    }
  }
  if (total < 400) w.push(`${total} words; pages ranking for prayer keywords usually have 600+`);
  if (!p.faq) w.push("no faq — FAQs answer People Also Ask questions");
  if (!p.verses && p.category === "bible-verses") w.push("bible-verses page with no verses");
  return w;
}

// ---- categories ------------------------------------------------------------
function category(slug, payload) {
  validateSlug(slug);
  if (!payload || typeof payload !== "object") throw new ValidationError("body must be a JSON object");
  const known = [...gitPrayers(), ...store.prayers.all()];
  if (known.some((p) => p.slug === slug)) throw new ValidationError(`slug '${slug}' collides with a prayer`);
  const isGit = gitCategories().some((c) => c.slug === slug);
  const c = {
    slug,
    title: str(payload.title, "title", { required: !isGit, max: 80 }),
    headline: str(payload.headline, "headline", { max: 120 }),
    rubric: str(payload.rubric, "rubric", { max: 40 }),
    icon: str(payload.icon, "icon", { max: 40 }),
    description: str(payload.description, "description", { required: !isGit, max: 220 }),
    intro: str(payload.intro, "intro", { max: 8000 }),
    faq: list(payload.faq, "faq", { q: { required: true, max: 200 }, a: { required: true, max: 2000 } }, 10),
  };
  if (c.icon && !/^[a-z0-9_]+$/.test(c.icon)) throw new ValidationError("icon must be a Material Symbols ligature name");
  for (const k of Object.keys(c)) if (c[k] === undefined) delete c[k];
  return c;
}

module.exports = { ValidationError, prayer, category, validateSlug, gitPrayers, allCategories };
