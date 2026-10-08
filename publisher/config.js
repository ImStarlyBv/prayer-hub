// Runtime configuration. In Docker every path below is set by the compose file;
// the defaults make `node publisher/server.js` work from a local checkout.
const path = require("path");

const APP_DIR = path.resolve(__dirname, "..");

module.exports = {
  APP_DIR,
  // Prayer + category JSON (source of truth). Bind-mounted on the server.
  DATA_DIR: path.resolve(process.env.PRAYER_DATA_DIR || path.join(APP_DIR, "data")),
  // Shared volume the web server reads. Holds releases/<id>/ and the `current` link.
  SITE_ROOT: path.resolve(process.env.SITE_ROOT || path.join(APP_DIR, "_publish")),
  SITE_URL: (process.env.SITE_URL || "https://prayerhub.space").replace(/\/$/, ""),
  PUBLISH_TOKEN: process.env.PUBLISH_TOKEN || "",
  PORT: Number(process.env.PORT || 8000),
  KEEP_RELEASES: 3,
  INDEXNOW_KEY: "28838593acfd4edea389c011ee1cab3b",
  INDEXNOW: process.env.INDEXNOW !== "0",
};
