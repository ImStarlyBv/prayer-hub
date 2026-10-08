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

module.exports = { submit };
