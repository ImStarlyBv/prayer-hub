// Prayer Hub publisher API — the prayer-hub port of mobilepanels' FastAPI publisher.
//
// Reachable only through Caddy at /api/ and protected by a bearer token
// (PUBLISH_TOKEN). It stores prayer JSON as the source of truth, rebuilds the
// static site with Eleventy into a new release, and atomically switches Caddy to
// it. Visitors only ever get static files; this process is never in their path.
//
// Run: node publisher/server.js     (see PUBLISHING.md for the API)
const http = require("http");
const crypto = require("crypto");
const config = require("./config");
const store = require("./store");
const validate = require("./validate");
const { build, currentRelease } = require("./build");
const indexnow = require("./indexnow");

const MAX_BODY = 1024 * 1024;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex",
  });
  res.end(json);
}

function requireToken(req) {
  const token = config.PUBLISH_TOKEN;
  if (!token || token === "changeme") throw new HttpError(503, "PUBLISH_TOKEN not configured on server");
  const got = Buffer.from(req.headers.authorization || "");
  const want = Buffer.from(`Bearer ${token}`);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) {
    throw new HttpError(401, "invalid or missing bearer token");
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, "body too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new HttpError(400, "body is not valid JSON"));
      }
    });
    req.on("error", reject);
  });
}

const today = () => new Date().toISOString().slice(0, 10);
const prayerUrl = (p) => `/${p.category}/${p.slug}/`;
const contentHash = (p) => {
  const { dateAdded, dateModified, ...rest } = p;
  return crypto.createHash("sha256").update(JSON.stringify(rest)).digest("hex");
};

// ---- prayers ----------------------------------------------------------------
function listPrayers() {
  const api = store.prayers.all();
  const apiSlugs = new Set(api.map((p) => p.slug));
  const rows = [
    ...validate.gitPrayers().filter((p) => !apiSlugs.has(p.slug)).map((p) => ({ ...p, source: "git" })),
    ...api.map((p) => ({ ...p, source: "api" })),
  ];
  return rows
    .map((p) => ({
      slug: p.slug,
      title: p.title,
      category: p.category,
      keyword: p.keyword || null,
      url: prayerUrl(p),
      source: p.source,
      dateAdded: p.dateAdded ? String(p.dateAdded instanceof Date ? p.dateAdded.toISOString().slice(0, 10) : p.dateAdded) : null,
    }))
    .sort((a, b) => a.url.localeCompare(b.url));
}

async function publishPrayer(payload, dryRun) {
  const { prayer, warnings } = validate.prayer(payload);
  const existing = store.prayers.get(prayer.slug);
  const gitTwin = validate.gitPrayers().find((p) => p.slug === prayer.slug);
  const fmtDate = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);

  prayer.dateAdded = (existing && existing.dateAdded) || (gitTwin && fmtDate(gitTwin.dateAdded)) || today();
  const unchanged = existing && contentHash(existing) === contentHash(prayer);
  prayer.dateModified = unchanged ? existing.dateModified : today();

  const result = {
    slug: prayer.slug,
    url: prayerUrl(prayer),
    updated: Boolean(existing || gitTwin),
    overrides_git: Boolean(gitTwin),
    unchanged: Boolean(unchanged),
    warnings,
  };
  if (dryRun) return { status: 200, body: { ...result, dry_run: true } };
  if (unchanged) return { status: 200, body: result };

  store.prayers.save(prayer); // persist the source of truth first
  try {
    result.build = await build();
  } catch (e) {
    // Roll the source back so the store matches what is actually live.
    if (existing) store.prayers.save(existing);
    else store.prayers.remove(prayer.slug);
    throw new HttpError(500, `build failed, nothing published: ${e.message}`);
  }
  result.indexnow = await indexnow.submit([result.url, `/${prayer.category}/`, "/", "/archive/"]);
  return { status: result.updated ? 200 : 201, body: result };
}

async function unpublishPrayer(slug) {
  validate.validateSlug(slug);
  const existing = store.prayers.get(slug);
  if (!existing) {
    const git = validate.gitPrayers().some((p) => p.slug === slug);
    throw new HttpError(git ? 409 : 404, git ? `'${slug}' is a git-tracked page; remove it in the repo` : `prayer '${slug}' not found`);
  }
  store.prayers.remove(slug);
  try {
    await build();
  } catch (e) {
    store.prayers.save(existing);
    throw new HttpError(500, `build failed, nothing unpublished: ${e.message}`);
  }
  const gitTwin = validate.gitPrayers().some((p) => p.slug === slug);
  await indexnow.submit([prayerUrl(existing), `/${existing.category}/`]);
  return { slug, unpublished: true, git_version_restored: gitTwin };
}

// ---- categories ---------------------------------------------------------------
async function putCategory(slug, payload) {
  const cat = validate.category(slug, payload);
  const previous = store.categories.get(slug);
  store.categories.save(cat);
  try {
    await build();
  } catch (e) {
    if (previous) store.categories.save(previous);
    else store.categories.remove(slug);
    throw new HttpError(500, `build failed: ${e.message}`);
  }
  await indexnow.submit([`/${slug}/`]);
  return { status: previous ? 200 : 201, body: { slug, url: `/${slug}/`, updated: Boolean(previous) } };
}

async function deleteCategory(slug) {
  validate.validateSlug(slug);
  if (!store.categories.get(slug)) throw new HttpError(404, `no API category '${slug}'`);
  const used = listPrayers().filter((p) => p.category === slug);
  if (used.length) throw new HttpError(409, `category '${slug}' still has ${used.length} prayers`);
  const previous = store.categories.get(slug);
  store.categories.remove(slug);
  try {
    await build();
  } catch (e) {
    store.categories.save(previous);
    throw new HttpError(500, `build failed: ${e.message}`);
  }
  return { slug, deleted: true };
}

// ---- router -------------------------------------------------------------------
async function route(req, res) {
  const url = new URL(req.url, "http://localhost");
  const parts = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean); // ["api", ...]
  const m = req.method;
  if (parts[0] !== "api") throw new HttpError(404, "not found");
  const [, resource, slug] = parts;

  if (resource === "health" && m === "GET") {
    return send(res, 200, { status: "ok", prayers: listPrayers().length, release: currentRelease() });
  }

  requireToken(req);

  if (resource === "prayers") {
    if (!slug && m === "GET") return send(res, 200, listPrayers());
    if (!slug && m === "POST") {
      const { status, body } = await publishPrayer(await readJson(req), url.searchParams.get("dry_run") === "1");
      return send(res, status, body);
    }
    if (slug && m === "GET") {
      const p = store.prayers.get(slug);
      if (!p) throw new HttpError(404, `no API prayer '${slug}'`);
      return send(res, 200, p);
    }
    if (slug && m === "DELETE") return send(res, 200, await unpublishPrayer(slug));
  }

  if (resource === "categories") {
    if (!slug && m === "GET") return send(res, 200, validate.allCategories());
    if (slug && m === "PUT") {
      const { status, body } = await putCategory(slug, await readJson(req));
      return send(res, status, body);
    }
    if (slug && m === "DELETE") return send(res, 200, await deleteCategory(slug));
  }

  if (resource === "rebuild" && m === "POST") return send(res, 200, await build());

  throw new HttpError(404, "not found");
}

const server = http.createServer((req, res) => {
  route(req, res).catch((e) => {
    if (e instanceof validate.ValidationError) return send(res, 422, { detail: e.message });
    if (e instanceof HttpError) return send(res, e.status, { detail: e.message });
    console.error(e);
    send(res, 500, { detail: "internal error" });
  });
});

if (require.main === module) {
  (async () => {
    if (process.argv.includes("--build-only")) {
      console.log("[publisher] build", await build());
      return;
    }
    console.log("[publisher] initial build…");
    try {
      console.log("[publisher] built", await build());
    } catch (e) {
      // Keep serving the API (and the previous release) even if the boot build fails.
      console.error("[publisher] initial build FAILED:", e.message);
    }
    server.listen(config.PORT, () => console.log(`[publisher] API on :${config.PORT}`));
  })();
}

module.exports = { server };
