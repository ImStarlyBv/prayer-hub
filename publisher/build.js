// Renders the site into a fresh release directory and atomically switches the
// web server to it. Builds are serialized: one Eleventy run at a time.
//
//   SITE_ROOT/releases/<id>/   full static site (Eleventy output)
//   SITE_ROOT/current          relative symlink -> releases/<id>  (what Caddy serves)
//
// Swapping a symlink with rename() is atomic, so visitors never see a half-built
// site — the same guarantee mobilepanels gets from its tmp-file + os.replace writes.
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const config = require("./config");
const store = require("./store");

const API_CONTENT = path.join(config.APP_DIR, "content", "api");
const RELEASES = path.join(config.SITE_ROOT, "releases");
const CURRENT = path.join(config.SITE_ROOT, "current");

// Keys copied from the stored JSON into the page frontmatter.
const FRONTMATTER_KEYS = [
  "title", "slug", "category", "keyword", "secondary_keywords", "excerpt", "prayer_heading",
  "traditional", "short_version", "variants", "days", "how_to_pray_heading", "how_to_pray", "verses", "faq",
  "dateAdded", "dateModified",
];

// JSON source -> content/api/<slug>.md. Frontmatter is JSON (valid for
// gray-matter's `---json` fence), and templateEngineOverride keeps API text from
// being evaluated as Nunjucks.
function projection(p) {
  const fm = {
    layout: "layouts/prayer.njk",
    permalink: `/${p.category}/${p.slug}/`,
    templateEngineOverride: "md",
  };
  for (const k of FRONTMATTER_KEYS) if (p[k] !== undefined) fm[k] = p[k];
  return `---json\n${JSON.stringify(fm, null, 2)}\n---\n\n${p.body_markdown || ""}\n`;
}

function writeProjections() {
  fs.rmSync(API_CONTENT, { recursive: true, force: true });
  fs.mkdirSync(API_CONTENT, { recursive: true });
  const prayers = store.prayers.all();
  for (const p of prayers) fs.writeFileSync(path.join(API_CONTENT, `${p.slug}.md`), projection(p), "utf8");
  return prayers.length;
}

function runEleventy(outDir) {
  return new Promise((resolve, reject) => {
    const bin = require.resolve("@11ty/eleventy/cmd.js", { paths: [config.APP_DIR] });
    // Relative, forward-slash output path: Eleventy 2's passthrough-copy guard
    // mis-compares absolute Windows paths.
    const rel = path.relative(config.APP_DIR, outDir).split(path.sep).join("/");
    const child = spawn(process.execPath, [bin, `--output=${rel}`, "--quiet"], {
      cwd: config.APP_DIR,
      env: { ...process.env, PRAYER_DATA_DIR: config.DATA_DIR, SITE_URL: config.SITE_URL },
    });
    let log = "";
    child.stdout.on("data", (d) => (log += d));
    child.stderr.on("data", (d) => (log += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(log.trim());
      else reject(new Error(`eleventy exited ${code}: ${log.trim().slice(-2000)}`));
    });
  });
}

function currentRelease() {
  try {
    return path.basename(fs.readlinkSync(CURRENT));
  } catch {
    return null;
  }
}

function swap(id) {
  const tmpLink = path.join(config.SITE_ROOT, `current.${process.pid}.tmp`);
  fs.rmSync(tmpLink, { force: true });
  try {
    fs.symlinkSync(path.join("releases", id), tmpLink, "dir");
    fs.renameSync(tmpLink, CURRENT);
  } catch (e) {
    // Windows without symlink rights (local dev only): fall back to a directory copy.
    if (e.code !== "EPERM" && e.code !== "EACCES") throw e;
    fs.rmSync(CURRENT, { recursive: true, force: true });
    fs.cpSync(path.join(RELEASES, id), CURRENT, { recursive: true });
  }
}

function prune(keepId) {
  const ids = fs.readdirSync(RELEASES).sort();
  const stale = ids.filter((id) => id !== keepId).slice(0, Math.max(0, ids.length - config.KEEP_RELEASES));
  for (const id of stale) fs.rmSync(path.join(RELEASES, id), { recursive: true, force: true });
}

async function buildAndSwap() {
  const started = Date.now();
  const prayers = writeProjections();
  fs.mkdirSync(RELEASES, { recursive: true });
  const id = `${new Date().toISOString().replace(/[-:.TZ]/g, "")}-${process.pid}`;
  const out = path.join(RELEASES, id);
  try {
    await runEleventy(out);
  } catch (e) {
    fs.rmSync(out, { recursive: true, force: true });
    throw e;
  }
  swap(id);
  prune(id);
  return { release: id, api_prayers: prayers, ms: Date.now() - started };
}

// Serialize builds; callers await their own turn.
let queue = Promise.resolve();
function build() {
  const run = queue.then(buildAndSwap, buildAndSwap);
  queue = run.catch(() => {});
  return run;
}

module.exports = { build, currentRelease, projection };
