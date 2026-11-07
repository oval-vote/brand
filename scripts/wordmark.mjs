import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import * as fontkit from "fontkit";

const FONT_URL =
  "https://github.com/google/fonts/raw/main/ofl/newsreader/Newsreader%5Bopsz%2Cwght%5D.ttf";
const FONT_PATH = ".fonts/Newsreader.ttf";
const WORD = "Oval";
const SIZE = 100;
const PALETTES = {
  "": { ink: "#17150f", mark: "#975cc1" },
  "-reverse": { ink: "#ebe8df", mark: "#975cc1" },
};

async function font() {
  if (!existsSync(FONT_PATH)) {
    mkdirSync(".fonts", { recursive: true });
    const response = await fetch(FONT_URL);
    if (!response.ok) {
      throw new Error(`cannot download Newsreader: ${response.status}`);
    }
    await pipeline(Readable.fromWeb(response.body), createWriteStream(FONT_PATH));
  }
  return fontkit.openSync(FONT_PATH).getVariation({ wght: 500, opsz: 72 });
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
    const offsetX = x + position.xOffset * scale;
    const offsetY = position.yOffset * scale;
    const path = glyph.path.scale(scale, -scale).translate(offsetX, offsetY).toSVG();
    paths.push(path);
    x += position.xAdvance * scale;
  });
  const ascent = round(face.ascent * scale);
  const descent = round(-face.descent * scale);
  const capHeight = round(face.capHeight * scale);
  return { paths, width: round(x), ascent, descent, capHeight };
}

function mark(x, y, height, fill, stroke) {
  const ry = height / 2;
  const rx = ry * 1.75;
  const strokeWidth = round(height * 0.11);
  return `<ellipse cx="${round(x + rx)}" cy="${round(y)}" rx="${round(rx - strokeWidth / 2)}" ry="${round(ry - strokeWidth / 2)}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
}

function svg(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(width)} ${round(height)}" width="${round(width)}" height="${round(height)}">\n${body}\n</svg>\n`;
}

const face = await font();
const word = outline(face, WORD);
const padding = SIZE * 0.08;
const height = word.ascent + word.descent + padding * 2;
const baseline = padding + word.ascent;
const markHeight = word.capHeight * 0.78;
const markWidth = markHeight * 1.75;
const gap = SIZE * 0.22;

function letters(x, ink) {
  return `<g transform="translate(${round(x)} ${round(baseline)})" fill="${ink}">\n${word.paths.map((d) => `<path d="${d}"/>`).join("\n")}\n</g>`;
}

const outputs = {};
for (const [suffix, { ink, mark: markColor }] of Object.entries(PALETTES)) {
  outputs[`logo/wordmark${suffix}.svg`] = svg(
    word.width + padding * 2,
    height,
    letters(padding, ink),
  );
  outputs[`logo/lockup${suffix}.svg`] = svg(
    padding + markWidth + gap + word.width + padding,
    height,
    `${mark(padding, baseline - word.capHeight / 2, markHeight, ink, markColor)}\n${letters(padding + markWidth + gap, ink)}`,
  );
}
const check = process.argv.includes("--check");
let stale = false;
for (const [path, content] of Object.entries(outputs)) {
  const current = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (current === content) continue;
  if (check) {
    console.error(`${path} is out of date; run \`npm run wordmark\``);
    stale = true;
  } else {
    writeFileSync(path, content);
    console.log(`wrote ${path}`);
  }
}
process.exit(stale ? 1 : 0);
