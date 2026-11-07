import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as fontkit from "fontkit";

const FONT_URL =
  "https://github.com/google/fonts/raw/main/ofl/instrumentserif/InstrumentSerif-Regular.ttf";
const FONT_PATH = ".fonts/InstrumentSerif-Regular.ttf";
const WORD = "Oval";
const SIZE = 100;
const TRACKING = -0.01;
const THEMES = {
  "": { paper: "#f2f1ec", ink: "#17150f", ring: "#8347ae" },
  "-reverse": { paper: "#131313", ink: "#e8e6e1", ring: "#b48ad9" },
};

async function font() {
  if (!existsSync(FONT_PATH)) {
    mkdirSync(".fonts", { recursive: true });
    const response = await fetch(FONT_URL);
    if (!response.ok) {
      throw new Error(`cannot download Instrument Serif: ${response.status}`);
    }
    await pipeline(Readable.fromWeb(response.body), createWriteStream(FONT_PATH));
  }
  return fontkit.openSync(FONT_PATH);
}

function round(value) {
  return Number(value.toFixed(2));
}

function outline(face, text) {
  const scale = SIZE / face.unitsPerEm;
  const run = face.layout(text);
  const paths = [];
  let x = 0;
  run.glyphs.forEach((glyph, i) => {
    const position = run.positions[i];
    const path = glyph.path
      .scale(scale, -scale)
      .translate(x + position.xOffset * scale, position.yOffset * scale)
      .toSVG();
    paths.push(path);
    x += position.xAdvance * scale + (i < run.glyphs.length - 1 ? TRACKING * SIZE : 0);
  });
  return {
    paths,
    width: round(x),
    ascent: round(face.ascent * scale),
    descent: round(-face.descent * scale),
    capHeight: round(face.capHeight * scale),
  };
}

function mark(x, y, height, { ink, ring, stroke = height * 0.075 }) {
  const cx = round(x + height * 0.875);
  const ringPart =
    ring === null
      ? ""
      : `<ellipse cx="${cx}" cy="${round(y)}" rx="${round(height * 0.875 - stroke / 2)}" ry="${round(height / 2 - stroke / 2)}" fill="none" stroke="${ring}" stroke-width="${round(stroke)}"/>\n`;
  const inner =
    ink === null
      ? `<ellipse cx="${cx}" cy="${round(y)}" rx="${round(height * 0.65 - stroke / 2)}" ry="${round(height * 0.325 - stroke / 2)}" fill="none" stroke="${ring}" stroke-width="${round(stroke)}"/>`
      : `<ellipse cx="${cx}" cy="${round(y)}" rx="${round(height * 0.65)}" ry="${round(height * 0.325)}" fill="${ink}"/>`;
  return ringPart + inner;
}

function svg(width, height, body, attributes = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(width)} ${round(height)}" width="${round(width)}" height="${round(height)}"${attributes}>\n${body}\n</svg>\n`;
}

const face = await font();
const word = outline(face, WORD);
const padding = SIZE * 0.08;
const height = word.ascent + word.descent + padding * 2;
const baseline = padding + word.ascent;
const markHeight = word.capHeight * 0.8;
const markWidth = markHeight * 1.75;
const gap = SIZE * 0.2;

function letters(x, ink) {
  return `<g transform="translate(${round(x)} ${round(baseline)})" fill="${ink}">\n${word.paths.map((d) => `<path d="${d}"/>`).join("\n")}\n</g>`;
}

const outputs = {
  "logo/mark-mono.svg": svg(70, 40, mark(0, 20, 40, { ink: "currentColor", ring: "currentColor" })),
  "logo/mark-outline.svg": svg(70, 40, mark(0, 20, 40, { ink: null, ring: "currentColor" })),
  "logo/favicon.svg": svg(
    32,
    32,
    mark(0.5, 16, 17.71, { ink: "#17150f", ring: "#8347ae", stroke: 2 }),
  ),
};
for (const [suffix, theme] of Object.entries(THEMES)) {
  outputs[`logo/mark${suffix}.svg`] = svg(70, 40, mark(0, 20, 40, theme));
  outputs[`logo/wordmark${suffix}.svg`] = svg(
    word.width + padding * 2,
    height,
    letters(padding, theme.ink),
  );
  outputs[`logo/lockup${suffix}.svg`] = svg(
    padding + markWidth + gap + word.width + padding,
    height,
    `${mark(padding, baseline - word.capHeight / 2, markHeight, theme)}\n${letters(padding + markWidth + gap, theme.ink)}`,
  );
}
for (const [name, radius] of [
  ["icon", 224],
  ["avatar", 0],
]) {
  const theme = THEMES[""];
  outputs[`logo/${name}.svg`] = svg(
    1024,
    1024,
    `<rect width="1024" height="1024"${radius ? ` rx="${radius}"` : ""} fill="${theme.paper}"/>\n${mark(512 - 350, 512, 400, theme)}`,
  );
}

const check = process.argv.includes("--check");
let stale = false;
for (const [path, content] of Object.entries(outputs)) {
  const current = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (current === content) continue;
  if (check) {
    console.error(`${path} is out of date; run \`npm run logo\``);
    stale = true;
  } else {
    writeFileSync(path, content);
    console.log(`wrote ${path}`);
  }
}
process.exit(stale ? 1 : 0);
