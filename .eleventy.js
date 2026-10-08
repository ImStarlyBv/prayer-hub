const fs = require("fs");
const path = require("path");
const markdownIt = require("markdown-it");
const schema = require("./_includes/schema.js");

const SITEMAP_CHUNK_SIZE = 40000;

// API-published prayers are projected by the publisher (publisher/build.js) into
// content/api/<slug>.md. When one of them shares a slug with a git-tracked prayer
// in content/prayers/, the API version wins: that is how an existing page is
// upgraded in place through the API without its URL ever changing.
const API_DIR = path.join(__dirname, "content", "api");

function apiSlugs() {
  try {
    return fs.readdirSync(API_DIR).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3));
  } catch {
    return [];
  }
}

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ public: "/" });

  // content/api/ is gitignored (it is generated), but it must still be built.
  // Ignores live in .eleventyignore instead.
  eleventyConfig.setUseGitIgnore(false);

  for (const slug of apiSlugs()) {
    eleventyConfig.ignores.add(`content/prayers/${slug}.md`);
  }

  // Raw HTML off: API content is rendered as text, never as markup.
  const md = markdownIt({ html: false, linkify: false });
  eleventyConfig.setLibrary("md", md);
  eleventyConfig.addFilter("md", (value) => (value ? md.render(String(value)) : ""));

  eleventyConfig.addFilter("isoDate", (value) => {
    const d = value ? new Date(value) : new Date();
    return d.toISOString();
  });

  // RSS 2.0 requires RFC-822 dates ("Tue, 15 Sep 2026 00:00:00 GMT").
  eleventyConfig.addFilter("rfc822", (value) => (value ? new Date(value) : new Date()).toUTCString());

  // Truthful <lastmod>: a prayer's own date; a hub's newest prayer in its
  // category; home/archive the newest prayer overall. Template file mtimes are
  // never used, since they change on every deploy.
  eleventyConfig.addFilter("lastmod", (item, prayers) => {
    const date = (p) => new Date(p.data.dateModified || p.data.dateAdded || p.date);
    const newest = (list) => list.reduce((max, p) => (date(p) > max ? date(p) : max), new Date(0));
    const all = prayers || [];
    if (item.data.category && item.data.excerpt) return date(item).toISOString();
    if (item.data.cat) {
      const own = all.filter((p) => p.data.category === item.data.cat.slug);
      if (own.length) return newest(own).toISOString();
    }
    return all.length ? newest(all).toISOString() : new Date(item.date).toISOString();
  });

  eleventyConfig.addFilter("ceilDiv", (total, size) => {
    return Math.max(1, Math.ceil(total / size));
  });

  // Categories that have at least one prayer. Empty hubs stay out of the nav,
  // the home page and the sitemap, and are noindexed, so a new category never
  // ships as a thin page.
  eleventyConfig.addFilter("populated", (categories, prayers) => {
    const used = new Set((prayers || []).map((p) => p.data.category));
    return (categories || []).filter((c) => used.has(c.slug));
  });
  eleventyConfig.addFilter("isPopulated", (slug, prayers) => (prayers || []).some((p) => p.data.category === slug));

  // JSON-LD blocks for prayer pages, category hubs and the home page.
  eleventyConfig.addFilter("prayerJsonLd", schema.prayer);
  eleventyConfig.addFilter("categoryJsonLd", schema.category);
  eleventyConfig.addFilter("homeJsonLd", schema.home);

  // One prayer = one markdown file in content/prayers/** or content/api/**
  eleventyConfig.addCollection("prayers", (api) => {
    return api
      .getFilteredByGlob(["content/prayers/**/*.md", "content/api/**/*.md"])
      .sort((a, b) => new Date(b.data.dateModified || b.date) - new Date(a.data.dateModified || a.date));
  });

  // Every real page that should appear in the sitemap (prayers + category hubs + home)
  eleventyConfig.addCollection("sitemapEntries", (api) => {
    return api.getAll().filter((item) => {
      return item.data.sitemap !== false && item.url && !item.url.startsWith("/sitemap");
    });
  });

  // Feeds list prayers newest-published first (an edit is not a new item).
  eleventyConfig.addCollection("feedItems", (api) => {
    return api
      .getFilteredByGlob(["content/prayers/**/*.md", "content/api/**/*.md"])
      .sort((a, b) => new Date(b.data.dateAdded || b.date) - new Date(a.data.dateAdded || a.date));
  });

  eleventyConfig.addGlobalData("sitemapChunkSize", SITEMAP_CHUNK_SIZE);
  eleventyConfig.addGlobalData("currentYear", new Date().getFullYear());

  return {
    dir: {
      input: ".",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
    templateFormats: ["njk", "md"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
};
