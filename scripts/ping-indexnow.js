// Submits every URL in the built sitemap to IndexNow (Bing, Yandex, Seznam, Naver…).
// Usage: node scripts/ping-indexnow.js   (run after `npm run build`)

const fs = require("fs");
const path = require("path");
const https = require("https");

const site = require("../_data/site.js");

const KEY = "28838593acfd4edea389c011ee1cab3b";
const SITE_DIR = path.join(__dirname, "..", "_site");

function extractUrls(xml) {
  const matches = xml.matchAll(/<loc>(.*?)<\/loc>/g);
  return [...matches].map((m) => m[1]);
}

function collectSitemapUrls() {
  const files = fs.readdirSync(SITE_DIR).filter((f) => /^sitemap-\d+\.xml$/.test(f));
  let urls = [];
  for (const file of files) {
    const xml = fs.readFileSync(path.join(SITE_DIR, file), "utf8");
    urls = urls.concat(extractUrls(xml));
  }
  return urls;
}

function ping(urls) {
  const host = new URL(site.url).host;
  const payload = JSON.stringify({
    host,
    key: KEY,
    keyLocation: `${site.url}/${KEY}.txt`,
    urlList: urls,
  });

  const req = https.request(
    "https://api.indexnow.org/IndexNow",
    {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
    },
    (res) => {
      console.log(`[indexnow] ${res.statusCode} — ${urls.length} URLs submitted`);
      res.on("data", () => {});
    }
  );
  req.on("error", (err) => console.error("[indexnow] ERROR:", err.message));
  req.write(payload);
  req.end();
}

const urls = collectSitemapUrls();
if (urls.length === 0) {
  console.error("No URLs found in _site/sitemap-*.xml — run `npm run build` first.");
  process.exit(1);
}
ping(urls);
