// Captures README screenshots from the running dev server.
// Port 3711 matches .claude/launch.json; override with PORT=xxxx.
// Usage: node scripts/screenshots.mjs
import puppeteer from "puppeteer-core";
import { mkdirSync } from "fs";

const BASE = `http://localhost:${process.env.PORT ?? 3711}`;
const OUT = "screenshots";
mkdirSync(OUT, { recursive: true });

const ANSWERS = [
  "television snow on a warm night",
  "teal velvet with rust around the edges",
  "a fax machine dreaming of the ocean",
];

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--window-size=1100,900"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 900, deviceScaleFactor: 2 });

await page.goto(BASE, { waitUntil: "networkidle0" });
await page.screenshot({ path: `${OUT}/01-intro.png` });

await page.click(".inner button");
await page.waitForSelector('input[type="text"]');
for (const answer of ANSWERS) {
  await page.type('input[type="text"]', answer);
  if (answer === ANSWERS[0]) await page.screenshot({ path: `${OUT}/02-question.png` });
  await page.click(".inner button");
  await new Promise((r) => setTimeout(r, 600));
}

await page.waitForSelector("input.rename", { timeout: 60000 });
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: `${OUT}/03-result.png` });

// open Webamp preview and let it render
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) =>
    b.textContent.includes("Webamp"),
  );
  btn?.click();
});
await page.waitForSelector("#webamp", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 4000));
await page.evaluate(() =>
  document.querySelector(".webamp-stage")?.scrollIntoView({ block: "center" }),
);
await page.screenshot({ path: `${OUT}/04-webamp.png` });

await browser.close();
console.log("screenshots written to", OUT);
