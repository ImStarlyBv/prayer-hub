// Renders a prayer as a share-ready image in the site's illuminated-missal design.
// Usage: node scripts/prayer-image.js night-prayer
//        node scripts/prayer-image.js content/prayers/night-prayer.md --size=square
//        node scripts/prayer-image.js --all --size=portrait --out=social
//
// Writes PNG (and the source SVG with --keep-svg) to ./social/.
// PNG rasterization needs @resvg/resvg-js; without it the script still emits SVG.

const fs = require("fs");
const path = require("path");

const site = require("../_data/site.js");
const categories = require("../_data/categories.json");

const ROOT = path.join(__dirname, "..");
const PRAYERS_DIR = path.join(ROOT, "content", "prayers");

/* ---------- Palette (mirrors public/css/styles.css) ---------- */

const C = {
  surface: "#fff9ea",
  surfaceHigh: "#eee8d8",
  onSurface: "#1a1a1a",
  onSurfaceVariant: "#544341",
  primaryContainer: "#5c1a1a",
  secondary: "#7b5800",
  secondaryFixed: "#ffdea6",
};

const FONT_DISPLAY = "EB Garamond, Garamond, Georgia, Times New Roman, serif";
const FONT_BODY = "Source Serif 4, Georgia, Times New Roman, serif";

/* ---------- Presets ---------- */

const SIZES = {
  x: { w: 1600, h: 900 },          // X / Twitter in-stream, 16:9
  landscape: { w: 1600, h: 900 },
  og: { w: 1200, h: 630 },         // Open Graph / link preview
  square: { w: 1080, h: 1080 },    // Instagram feed
  portrait: { w: 1080, h: 1350 },  // Instagram portrait
  story: { w: 1080, h: 1920 },     // Stories / Reels covers
};

/* ---------- Text measurement -----------------------------------------
   SVG has no auto-wrap, so lines are measured with a serif advance-width
   table. Values are ems relative to font-size, tuned against Georgia. */

const NARROW = { " ": 0.25, i: 0.28, j: 0.28, l: 0.28, t: 0.35, f: 0.34, r: 0.39, I: 0.39, J: 0.42, ".": 0.25, ",": 0.25, ";": 0.27, ":": 0.27, "!": 0.32, "'": 0.2, "’": 0.2, '"': 0.4, "“": 0.4, "”": 0.4, "-": 0.33, "—": 1.0, "(": 0.33, ")": 0.33, "/": 0.28 };
const WIDE = { m: 0.78, w: 0.72, M: 0.89, W: 1.0, A: 0.72, B: 0.67, C: 0.67, D: 0.72, G: 0.72, H: 0.72, K: 0.72, N: 0.72, O: 0.72, Q: 0.72, R: 0.67, U: 0.72, V: 0.72, X: 0.72, Y: 0.72 };

function charWidth(ch) {
  if (NARROW[ch] !== undefined) return NARROW[ch];
  if (WIDE[ch] !== undefined) return WIDE[ch];
  if (ch >= "A" && ch <= "Z") return 0.66;
  if (ch >= "0" && ch <= "9") return 0.5;
  return 0.5;
}

// Width of `text` in px at `fontSize`, including per-character letter-spacing.
function measure(text, fontSize, { letterSpacing = 0, bold = false } = {}) {
  let ems = 0;
  for (const ch of text) ems += charWidth(ch);
  return ems * fontSize * (bold ? 1.04 : 1) + letterSpacing * text.length;
}

// Greedy word wrap. `widthAt(lineIndex)` lets early lines be narrower (drop cap).
function wrap(text, fontSize, widthAt, opts = {}) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measure(candidate, fontSize, opts) > widthAt(lines.length)) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/* ---------- Prayer loading ---------- */

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error("no frontmatter found");
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    data[kv[1]] = kv[2].trim().replace(/^["'](.*)["']$/, "$1");
  }
  return { data, body: match[2] };
}

// Markdown paragraphs -> plain text, one entry per paragraph.
function toParagraphs(body) {
  return body
    .split(/\r?\n\s*\r?\n/)
    .map((p) =>
      p
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/\*(.*?)\*/g, "$1")
        .replace(/\[(.*?)\]\(.*?\)/g, "$1")
        .replace(/\s*\r?\n\s*/g, " ")
        .trim()
    )
    .filter(Boolean);
}

function resolvePrayerFile(input) {
  const candidates = [
    input,
    path.join(ROOT, input),
    path.join(PRAYERS_DIR, input),
    path.join(PRAYERS_DIR, `${input}.md`),
  ];
  const found = candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
  if (!found) throw new Error(`prayer not found: ${input}`);
  return found;
}

function loadPrayer(input) {
  const file = resolvePrayerFile(input);
  const { data, body } = parseFrontmatter(fs.readFileSync(file, "utf8"));
  const category = categories.find((c) => c.slug === data.category);
  return {
    file,
    title: data.title || "Untitled",
    excerpt: data.excerpt || "",
    slug: data.slug || path.basename(file, ".md"),
    rubric: category ? category.rubric : "",
    url: data.category && data.slug ? `${site.url}/${data.category}/${data.slug}/` : site.url,
  };
}

/* ---------- Layout ---------- */

// The site uses "❦ ✠ ❦" as its divider, but those glyphs are missing from most
// system serifs and rasterize to tofu — so the ornament is drawn as paths.
function fleuron(cx, cy, size) {
  const s = size;
  const arm = s * 0.42;
  const bar = s * 0.13;
  const g = { fill: C.secondary, opacity: 0.75 };
  const parts = [
    // Central cross, with flared tips.
    `<rect x="${cx - bar / 2}" y="${cy - arm}" width="${bar}" height="${arm * 2}" fill="${g.fill}"/>`,
    `<rect x="${cx - arm}" y="${cy - bar / 2}" width="${arm * 2}" height="${bar}" fill="${g.fill}"/>`,
    `<rect x="${cx - bar}" y="${cy - arm}" width="${bar * 2}" height="${bar * 0.5}" fill="${g.fill}"/>`,
    `<rect x="${cx - bar}" y="${cy + arm - bar * 0.5}" width="${bar * 2}" height="${bar * 0.5}" fill="${g.fill}"/>`,
    `<rect x="${cx - arm}" y="${cy - bar}" width="${bar * 0.5}" height="${bar * 2}" fill="${g.fill}"/>`,
    `<rect x="${cx + arm - bar * 0.5}" y="${cy - bar}" width="${bar * 0.5}" height="${bar * 2}" fill="${g.fill}"/>`,
  ];
  // Flanking leaves (the ❦ stand-ins) and hairlines.
  for (const dir of [-1, 1]) {
    const lx = cx + dir * s * 1.15;
    const r = s * 0.19;
    parts.push(
      `<path d="M ${lx} ${cy + r} C ${lx - r * 1.6} ${cy + r * 0.2} ${lx - r * 0.9} ${cy - r * 1.5} ${lx} ${cy - r * 0.35} C ${lx + r * 0.9} ${cy - r * 1.5} ${lx + r * 1.6} ${cy + r * 0.2} ${lx} ${cy + r} Z" fill="${g.fill}"/>`
    );
    parts.push(
      `<line x1="${cx + dir * s * 1.6}" y1="${cy}" x2="${cx + dir * s * 3.1}" y2="${cy}" stroke="${g.fill}" stroke-width="${Math.max(1, s * 0.05)}"/>`
    );
  }
  return `<g opacity="${g.opacity}">${parts.join("")}</g>`;
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Lays the prayer out at `bodyFont`, returning one entry per slide.
// Returns null if it needs more slides than `maxSlides`.
function layout(prayer, paragraphs, geo, bodyFont, opts) {
  const { w, h } = geo;
  const pad = Math.round(Math.min(w, h) * 0.075);
  const contentW = w - pad * 2;
  const bodyW = Math.min(contentW * 0.92, bodyFont * 34);
  const bodyX = Math.round((w - bodyW) / 2);
  const lineHeight = bodyFont * 1.62;
  const paraGap = bodyFont * 0.7;

  const capFont = bodyFont * 2.7;
  const capChar = paragraphs[0] ? paragraphs[0][0] : "";
  const capW = capChar ? measure(capChar, capFont, { bold: true }) + bodyFont * 0.35 : 0;

  // Wrap every paragraph once; the first two lines of paragraph 1 clear the drop cap.
  const lines = [];
  paragraphs.forEach((para, pi) => {
    const useCap = pi === 0 && opts.dropCap;
    const text = useCap ? para.slice(capChar.length).replace(/^\s+/, "") : para;
    const widthAt = (i) => (useCap && i < 2 ? bodyW - capW : bodyW);
    const wrapped = wrap(text, bodyFont, widthAt);
    wrapped.forEach((line, i) => {
      lines.push({
        text: line,
        indent: useCap && i < 2 ? capW : 0,
        firstOfPara: i === 0,
        paraIndex: pi,
      });
    });
  });

  // Header block heights.
  const fleuronFont = Math.round(bodyFont * 1.15);
  const titleFont = Math.round(Math.min(bodyFont * 1.9, contentW / 9));
  const titleLS = titleFont * 0.06;
  const excerptFont = Math.round(bodyFont * 0.95);
  const footerFont = Math.round(bodyFont * 0.62);

  const titleLines = wrap(prayer.title.toUpperCase(), titleFont, () => contentW, {
    letterSpacing: titleLS,
    bold: true,
  });
  const excerptLines = opts.excerpt && prayer.excerpt
    ? wrap(prayer.excerpt, excerptFont, () => Math.min(contentW * 0.8, excerptFont * 46))
    : [];

  const slides = [];
  let cursor = 0;
  while (cursor < lines.length) {
    const first = slides.length === 0;
    let y = pad + fleuronFont * 1.6;

    const head = { fleuronY: y };
    y += fleuronFont * 1.5;

    head.titleY = y + titleFont;
    const shownTitle = first ? titleLines : titleLines.slice(0, 1);
    y += shownTitle.length * titleFont * 1.28 + titleFont * 0.35;

    head.excerptY = y + excerptFont;
    const shownExcerpt = first ? excerptLines : [];
    if (shownExcerpt.length) y += shownExcerpt.length * excerptFont * 1.45 + excerptFont * 0.6;

    if (!first) {
      head.continuedY = y + footerFont;
      y += footerFont * 2.1;
    }

    head.ruleY = Math.round(y + bodyFont * 0.4);
    y = head.ruleY + bodyFont * 1.5;

    const bodyTop = y;
    const bodyBottom = h - pad - footerFont * 2.6;
    const available = bodyBottom - bodyTop;
    if (available < lineHeight * 3) return null;

    // Fill this slide line by line, keeping paragraph gaps in the budget.
    const taken = [];
    let used = 0;
    while (cursor < lines.length) {
      const line = lines[cursor];
      const gap = line.firstOfPara && taken.length > 0 ? paraGap : 0;
      if (used + gap + lineHeight > available) break;
      used += gap;
      taken.push({ ...line, y: bodyTop + used + bodyFont });
      used += lineHeight;
      cursor += 1;
    }
    if (taken.length === 0) return null;

    slides.push({
      first,
      head,
      titleLines: shownTitle,
      excerptLines: shownExcerpt,
      lines: taken,
      geo: { w, h, pad, contentW, bodyX, bodyW },
      fonts: { fleuronFont, titleFont, titleLS, excerptFont, bodyFont, footerFont, capFont },
      cap: first && opts.dropCap && capChar
        ? { char: capChar, x: bodyX, y: taken[0].y + lineHeight * 0.86 }
        : null,
      slack: available - used,
    });

    if (slides.length > opts.maxSlides) return null;
  }

  // A prayer that fits on one slide reads better optically centred than top-aligned.
  if (slides.length === 1) shiftDown(slides[0], slides[0].slack * 0.45);
  return slides;
}

function shiftDown(slide, dy) {
  if (dy <= 0) return;
  slide.head.fleuronY += dy;
  slide.head.titleY += dy;
  slide.head.excerptY += dy;
  slide.head.ruleY += dy;
  if (slide.head.continuedY) slide.head.continuedY += dy;
  slide.lines.forEach((line) => { line.y += dy; });
  if (slide.cap) slide.cap.y += dy;
}

/* ---------- SVG ---------- */

function renderSVG(prayer, slide, index, total) {
  const { w, h, pad, contentW, bodyX, bodyW } = slide.geo;
  const f = slide.fonts;
  const cx = w / 2;
  const parts = [];

  parts.push(`<rect width="${w}" height="${h}" fill="${C.surface}"/>`);

  // Double gold frame, matching .prayer-frame / .prayer-frame-inner.
  const o = Math.round(Math.min(w, h) * 0.032);
  const ow = w - o * 2;
  const oh = h - o * 2;
  const gap = Math.max(4, Math.round(Math.min(w, h) * 0.008));
  parts.push(`<rect x="${o}" y="${o}" width="${ow}" height="${oh}" fill="none" stroke="${C.secondary}" stroke-width="3"/>`);
  parts.push(`<rect x="${o + gap}" y="${o + gap}" width="${ow - gap * 2}" height="${oh - gap * 2}" fill="none" stroke="${C.secondary}" stroke-width="1.5"/>`);

  const text = (str, opts) => {
    const a = [
      `x="${opts.x}"`,
      `y="${Math.round(opts.y)}"`,
      `font-family="${esc(opts.family || FONT_BODY)}"`,
      `font-size="${opts.size}"`,
      `fill="${opts.fill}"`,
    ];
    if (opts.anchor) a.push(`text-anchor="${opts.anchor}"`);
    if (opts.weight) a.push(`font-weight="${opts.weight}"`);
    if (opts.style) a.push(`font-style="${opts.style}"`);
    if (opts.letterSpacing) a.push(`letter-spacing="${opts.letterSpacing.toFixed(2)}"`);
    if (opts.opacity) a.push(`opacity="${opts.opacity}"`);
    parts.push(`<text ${a.join(" ")}>${esc(str)}</text>`);
  };

  parts.push(fleuron(cx, slide.head.fleuronY - f.fleuronFont * 0.35, f.fleuronFont));

  slide.titleLines.forEach((line, i) => {
    text(line, {
      x: cx, y: slide.head.titleY + i * f.titleFont * 1.28, anchor: "middle",
      family: FONT_DISPLAY, size: f.titleFont, fill: C.primaryContainer,
      weight: 600, letterSpacing: f.titleLS,
    });
  });

  if (!slide.first) {
    text("CONTINUED", {
      x: cx, y: slide.head.continuedY, anchor: "middle",
      family: FONT_DISPLAY, size: f.footerFont, fill: C.secondary,
      letterSpacing: f.footerFont * 0.18, opacity: 0.8,
    });
  }

  slide.excerptLines.forEach((line, i) => {
    text(line, {
      x: cx, y: slide.head.excerptY + i * f.excerptFont * 1.45, anchor: "middle",
      size: f.excerptFont, fill: C.onSurfaceVariant, style: "italic",
    });
  });

  const ruleW = Math.round(contentW * 0.22);
  parts.push(`<line x1="${cx - ruleW / 2}" y1="${slide.head.ruleY}" x2="${cx + ruleW / 2}" y2="${slide.head.ruleY}" stroke="${C.secondary}" stroke-width="1" opacity="0.5"/>`);

  if (slide.cap) {
    text(slide.cap.char, {
      x: slide.cap.x, y: slide.cap.y,
      family: FONT_DISPLAY, size: f.capFont, fill: C.primaryContainer, weight: 700,
    });
  }

  slide.lines.forEach((line) => {
    text(line.text, { x: bodyX + line.indent, y: line.y, size: f.bodyFont, fill: C.onSurface });
  });

  const footerY = h - pad + f.footerFont * 0.4;
  const host = site.url.replace(/^https?:\/\//, "");
  const footer = { family: FONT_DISPLAY, size: f.footerFont, fill: C.secondary, letterSpacing: f.footerFont * 0.16, opacity: 0.85 };
  if (prayer.rubric) text(prayer.rubric.toUpperCase(), { ...footer, x: bodyX, y: footerY });
  if (total > 1) text(`${index + 1} / ${total}`, { ...footer, x: cx, y: footerY, anchor: "middle" });
  text(host.toUpperCase(), { ...footer, x: bodyX + bodyW, y: footerY, anchor: "end" });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n${parts.join("\n")}\n</svg>\n`;
}

/* ---------- Rasterize ---------- */

let resvgModule;
function getResvg() {
  if (resvgModule !== undefined) return resvgModule;
  try {
    resvgModule = require("@resvg/resvg-js");
  } catch {
    resvgModule = null;
  }
  return resvgModule;
}

function toPNG(svg, fontDirs) {
  const mod = getResvg();
  if (!mod) return null;
  const renderer = new mod.Resvg(svg, {
    background: C.surface,
    font: { loadSystemFonts: true, fontDirs, defaultFontFamily: "Georgia" },
  });
  return renderer.render().asPng();
}

/* ---------- CLI ---------- */

function parseArgs(argv) {
  const opts = {
    size: "x", out: "social", maxSlides: 6, excerpt: true,
    dropCap: true, keepSvg: false, all: false, fonts: null, inputs: [],
  };
  for (const arg of argv) {
    if (!arg.startsWith("--")) { opts.inputs.push(arg); continue; }
    const [flag, value] = arg.slice(2).split("=");
    switch (flag) {
      case "size": opts.size = value; break;
      case "out": opts.out = value; break;
      case "max-slides": opts.maxSlides = Number(value); break;
      case "no-excerpt": opts.excerpt = false; break;
      case "no-drop-cap": opts.dropCap = false; break;
      case "keep-svg": opts.keepSvg = true; break;
      case "svg-only": opts.keepSvg = true; opts.svgOnly = true; break;
      case "all": opts.all = true; break;
      case "fonts": opts.fonts = value; break;
      default: throw new Error(`unknown flag: --${flag}`);
    }
  }
  return opts;
}

function render(prayer, opts) {
  const geo = SIZES[opts.size];
  if (!geo) throw new Error(`unknown size: ${opts.size} (have: ${Object.keys(SIZES).join(", ")})`);

  const paragraphs = toParagraphs(parseFrontmatter(fs.readFileSync(prayer.file, "utf8")).body);
  if (paragraphs.length === 0) throw new Error(`${prayer.slug}: no prayer text`);

  // Prefer the largest body size that fits on one slide; paginate only if none does.
  const maxFont = Math.round(Math.min(geo.w, geo.h) * 0.036);
  const minFont = Math.round(maxFont * 0.78);
  let slides = null;
  for (let fontSize = maxFont; fontSize >= minFont; fontSize -= 1) {
    const attempt = layout(prayer, paragraphs, geo, fontSize, { ...opts, maxSlides: 1 });
    if (attempt) { slides = attempt; break; }
  }
  if (!slides) {
    slides = layout(prayer, paragraphs, geo, minFont, opts);
    if (!slides) throw new Error(`${prayer.slug}: too long for ${opts.size} in ${opts.maxSlides} slides`);
  }

  const outDir = path.isAbsolute(opts.out) ? opts.out : path.join(ROOT, opts.out);
  fs.mkdirSync(outDir, { recursive: true });
  const fontDirs = opts.fonts ? [path.resolve(ROOT, opts.fonts)] : [];
  const written = [];

  slides.forEach((slide, i) => {
    const svg = renderSVG(prayer, slide, i, slides.length);
    const suffix = slides.length > 1 ? `-${i + 1}` : "";
    const base = path.join(outDir, `${prayer.slug}-${opts.size}${suffix}`);

    if (opts.keepSvg) {
      fs.writeFileSync(`${base}.svg`, svg);
      written.push(`${base}.svg`);
    }
    if (!opts.svgOnly) {
      const png = toPNG(svg, fontDirs);
      if (png) {
        fs.writeFileSync(`${base}.png`, png);
        written.push(`${base}.png`);
      } else if (!opts.keepSvg) {
        fs.writeFileSync(`${base}.svg`, svg);
        written.push(`${base}.svg`);
      }
    }
  });

  return written;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!opts.all && opts.inputs.length === 0) {
    console.error("Usage: node scripts/prayer-image.js <slug|file> [--size=x|og|square|portrait|story]");
    console.error("       node scripts/prayer-image.js --all --size=square");
    console.error("Flags: --out=dir --keep-svg --svg-only --no-excerpt --no-drop-cap --max-slides=N --fonts=dir");
    process.exit(1);
  }

  const inputs = opts.all
    ? fs.readdirSync(PRAYERS_DIR).filter((f) => f.endsWith(".md")).map((f) => path.join(PRAYERS_DIR, f))
    : opts.inputs;

  if (!opts.svgOnly && !getResvg()) {
    console.warn("[prayer-image] @resvg/resvg-js not installed — writing SVG instead of PNG.");
    console.warn("[prayer-image] Run `npm install` to enable PNG output.");
  }

  let failed = 0;
  for (const input of inputs) {
    try {
      const prayer = loadPrayer(input);
      for (const file of render(prayer, opts)) {
        console.log(`[prayer-image] ${path.relative(ROOT, file)}`);
      }
    } catch (err) {
      failed += 1;
      console.error(`[prayer-image] ERROR ${input}: ${err.message}`);
    }
  }
  if (failed) process.exit(1);
}

if (require.main === module) main();

module.exports = { loadPrayer, render, renderSVG, layout, SIZES };
