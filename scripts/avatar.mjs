import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const SOURCE = "logo/avatar.svg";
const TARGET = "logo/avatar.png";
const SIZE = 1024;

const png = new Resvg(readFileSync(SOURCE, "utf8"), { fitTo: { mode: "width", value: SIZE } })
  .render()
  .asPng();

if (process.argv.includes("--check")) {
  let current;
  try {
    current = readFileSync(TARGET);
  } catch {
    current = Buffer.alloc(0);
  }
  if (!current.equals(png)) {
    console.error(`${TARGET} is out of date; run npm run avatar`);
    process.exit(1);
  }
} else {
  writeFileSync(TARGET, png);
}
