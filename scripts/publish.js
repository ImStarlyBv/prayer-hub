// Command-line client for the publisher API (see PUBLISHING.md).
//
//   node scripts/publish.js prayer.json            publish / update a prayer
//   node scripts/publish.js prayer.json --dry-run  validate only, show warnings
//   node scripts/publish.js --list                 list every prayer (git + api)
//   node scripts/publish.js --get <slug>           fetch an API prayer's source JSON
//   node scripts/publish.js --delete <slug>        unpublish an API prayer
//   node scripts/publish.js --category cat.json    create/update a category (slug in the file)
//   node scripts/publish.js --backup <dir>         save every API prayer's JSON to <dir>
//
// Reads PUBLISH_TOKEN and PUBLISH_URL (default https://prayerhub.space/api) from
// the environment or from a .env file in the repo root.
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const file = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

async function call(method, route, body) {
  const base = (process.env.PUBLISH_URL || "https://prayerhub.space/api").replace(/\/$/, "");
  const res = await fetch(`${base}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.PUBLISH_TOKEN || ""}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), file), "utf8"));
}

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  const flag = (name) => args.indexOf(name);
  let result;

  if (flag("--list") >= 0) result = await call("GET", "/prayers");
  else if (flag("--get") >= 0) result = await call("GET", `/prayers/${args[flag("--get") + 1]}`);
  else if (flag("--delete") >= 0) result = await call("DELETE", `/prayers/${args[flag("--delete") + 1]}`);
  else if (flag("--category") >= 0) {
    const cat = readJson(args[flag("--category") + 1]);
    result = await call("PUT", `/categories/${cat.slug}`, cat);
  } else if (flag("--backup") >= 0) {
    const dir = path.resolve(process.cwd(), args[flag("--backup") + 1] || "backup");
    fs.mkdirSync(dir, { recursive: true });
    const list = await call("GET", "/prayers");
    if (list.status !== 200) result = list;
    else {
      let n = 0;
      for (const p of list.data.filter((x) => x.source === "api")) {
        const one = await call("GET", `/prayers/${p.slug}`);
        fs.writeFileSync(path.join(dir, `${p.slug}.json`), JSON.stringify(one.data, null, 2) + "\n");
        n++;
      }
      result = { status: 200, data: { saved: n, dir } };
    }
  } else if (args[0] && !args[0].startsWith("--")) {
    const dry = flag("--dry-run") >= 0 ? "?dry_run=1" : "";
    result = await call("POST", `/prayers${dry}`, readJson(args[0]));
  } else {
    console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 12).join("\n"));
    process.exit(2);
  }

  console.log(JSON.stringify(result.data, null, 2));
  console.error(`HTTP ${result.status}`);
  process.exit(result.status >= 400 ? 1 : 0);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
