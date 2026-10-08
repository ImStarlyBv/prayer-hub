// Categories = the git-tracked list in categoryList.json, plus any added through
// the publisher API (stored as <data>/categories/<slug>.json). An API entry with
// the same slug as a git entry overrides it, so hub copy can be edited without a
// deploy. Order: git list first (nav order), then API-only categories.
const fs = require("fs");
const path = require("path");

const base = require("./categoryList.json");
const dataDir = process.env.PRAYER_DATA_DIR || path.join(__dirname, "..", "data");

function apiCategories() {
  const dir = path.join(dataDir, "categories");
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  } catch {
    return [];
  }
}

module.exports = function () {
  const extra = apiCategories();
  const bySlug = new Map(extra.map((c) => [c.slug, c]));
  const merged = base.map((c) => (bySlug.has(c.slug) ? { ...c, ...bySlug.get(c.slug) } : c));
  for (const c of extra) {
    if (!base.some((b) => b.slug === c.slug)) merged.push(c);
  }
  return merged;
};
