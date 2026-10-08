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
