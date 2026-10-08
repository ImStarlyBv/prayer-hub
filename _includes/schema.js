// JSON-LD builders, exposed as Nunjucks filters in .eleventy.js.
// Called as `{{ page.url | prayerJsonLd | safe }}` — the template context
// (frontmatter + global data) is read from `this.ctx`.

function script(objects) {
  const graph = objects.filter(Boolean);
  // Escape "<" so content can never close the <script> element early.
  const json = JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">${json}</script>`;
}

function org(site) {
  return {
    "@type": "Organization",
    "@id": `${site.url}/#org`,
    name: site.name,
    url: `${site.url}/`,
    logo: { "@type": "ImageObject", url: `${site.url}/images/logo.png`, width: 256, height: 256 },
  };
}

function iso(value) {
  return value ? new Date(value).toISOString() : undefined;
}

function breadcrumb(site, items) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, url], i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
      item: `${site.url}${url}`,
    })),
  };
}

function faqPage(url, faq) {
  if (!Array.isArray(faq) || faq.length === 0) return null;
  return {
    "@type": "FAQPage",
    "@id": `${url}#faq`,
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

function prayer(pageUrl) {
  const d = this.ctx;
  const site = d.site;
  const url = `${site.url}${pageUrl}`;
  const cat = (d.categories || []).find((c) => c.slug === d.category);
  const crumbs = [["Home", "/"]];
  if (cat) crumbs.push([cat.title, `/${cat.slug}/`]);
  crumbs.push([d.title, pageUrl]);

  return script([
    {
      "@type": "Article",
      "@id": `${url}#article`,
      headline: d.title,
      description: d.excerpt,
      url,
      mainEntityOfPage: url,
      datePublished: iso(d.dateAdded),
      dateModified: iso(d.dateModified || d.dateAdded),
      inLanguage: "en",
      articleSection: cat ? cat.title : undefined,
      keywords: [d.keyword, ...(d.secondary_keywords || [])].filter(Boolean).join(", ") || undefined,
      image: `${site.url}/images/logo.png`,
      author: { "@id": `${site.url}/#org` },
      publisher: { "@id": `${site.url}/#org` },
    },
    breadcrumb(site, crumbs),
    faqPage(url, d.faq),
    org(site),
  ]);
}

function category(pageUrl) {
  const d = this.ctx;
  const site = d.site;
  const cat = d.cat;
  const url = `${site.url}${pageUrl}`;
  const items = (d.collections.prayers || []).filter((p) => p.data.category === cat.slug);
  return script([
    {
      "@type": "CollectionPage",
      "@id": `${url}#page`,
      name: cat.title,
      description: cat.description,
      url,
      isPartOf: { "@id": `${site.url}/#website` },
      mainEntity: {
        "@type": "ItemList",
        itemListElement: items.map((p, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: `${site.url}${p.url}`,
          name: p.data.title,
        })),
      },
    },
    breadcrumb(site, [["Home", "/"], [cat.title, pageUrl]]),
    faqPage(url, cat.faq),
  ]);
}

function home() {
  const site = this.ctx.site;
  return script([
    {
      "@type": "WebSite",
      "@id": `${site.url}/#website`,
      name: site.name,
      url: `${site.url}/`,
      description: site.description,
      inLanguage: "en",
      publisher: { "@id": `${site.url}/#org` },
    },
    org(site),
  ]);
}

module.exports = { prayer, category, home };
