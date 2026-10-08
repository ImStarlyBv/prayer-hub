// Source-of-truth store for API-published prayers and categories.
// One JSON file per item under DATA_DIR (bind-mounted on the server, like
// mobilepanels' app/data). The rendered HTML is always a regenerable projection.
const fs = require("fs");
const path = require("path");
const config = require("./config");

const PRAYERS = path.join(config.DATA_DIR, "prayers");
const CATEGORIES = path.join(config.DATA_DIR, "categories");

function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content, "utf8");
  fs.renameSync(tmp, file);
}

function readDir(dir) {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
}

function readOne(dir, slug) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, `${slug}.json`), "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

function remove(dir, slug) {
  try {
    fs.unlinkSync(path.join(dir, `${slug}.json`));
    return true;
  } catch (e) {
    if (e.code === "ENOENT") return false;
    throw e;
  }
}

module.exports = {
  atomicWrite,
  prayers: {
    all: () => readDir(PRAYERS),
    get: (slug) => readOne(PRAYERS, slug),
    save: (p) => atomicWrite(path.join(PRAYERS, `${p.slug}.json`), JSON.stringify(p, null, 2) + "\n"),
    remove: (slug) => remove(PRAYERS, slug),
  },
  categories: {
    all: () => readDir(CATEGORIES),
    get: (slug) => readOne(CATEGORIES, slug),
    save: (c) => atomicWrite(path.join(CATEGORIES, `${c.slug}.json`), JSON.stringify(c, null, 2) + "\n"),
    remove: (slug) => remove(CATEGORIES, slug),
  },
};
