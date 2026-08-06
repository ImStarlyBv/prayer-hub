const SITEMAP_CHUNK_SIZE = 40000;

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ public: "/" });

  eleventyConfig.addFilter("isoDate", (value) => {
    const d = value ? new Date(value) : new Date();
    return d.toISOString();
  });

  eleventyConfig.addFilter("ceilDiv", (total, size) => {
    return Math.max(1, Math.ceil(total / size));
  });

  // One prayer = one markdown file in content/prayers/**
  eleventyConfig.addCollection("prayers", (api) => {
    return api
      .getFilteredByGlob("content/prayers/**/*.md")
      .sort((a, b) => (b.data.dateModified || b.date) - (a.data.dateModified || a.date));
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
