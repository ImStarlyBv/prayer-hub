// Best-effort IndexNow ping (Bing, Yandex, Seznam, Naver…). Never throws, so a
// publish never fails because of a ping.
const config = require("./config");

async function submit(paths) {
  if (!config.INDEXNOW || !paths.length) return { skipped: true };
  const host = new URL(config.SITE_URL).host;
  try {
    const res = await fetch("https://api.indexnow.org/IndexNow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key: config.INDEXNOW_KEY,
        keyLocation: `${config.SITE_URL}/${config.INDEXNOW_KEY}.txt`,
        urlList: paths.map((p) => `${config.SITE_URL}${p}`),
      }),
      signal: AbortSignal.timeout(10000),
    });
    console.log(`[indexnow] ${res.status} — ${paths.length} URLs`);
    return { status: res.status };
  } catch (e) {
    console.error(`[indexnow] failed: ${e.message}`);
    return { error: e.message };
  }
}

// WebSub ping for the RSS feeds. Google's feed fetcher subscribes through the
// hub announced in the feeds (<atom:link rel="hub">), so this is the fast path
// for Google to see new items; IndexNow covers Bing/Yandex.
const WEBSUB_HUB = "https://pubsubhubbub.appspot.com/";

async function websub() {
  if (!config.INDEXNOW) return { skipped: true };
  const results = {};
  for (const feed of ["/rss.xml", "/feed.rss"]) {
    try {
      const res = await fetch(WEBSUB_HUB, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ "hub.mode": "publish", "hub.url": `${config.SITE_URL}${feed}` }),
        signal: AbortSignal.timeout(10000),
      });
      results[feed] = res.status;
    } catch (e) {
      results[feed] = e.message;
    }
  }
  console.log("[websub]", results);
  return results;
}

module.exports = { submit, websub };
