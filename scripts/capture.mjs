// Capture README media from the built site (vite preview must be running).
//   node scripts/capture.mjs
// Outputs: docs/media/{hero,modules,network,contact}.png + scroll frames for GIF.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PAGE_URL = 'http://localhost:4173/Karte.github.io/';
const OUT = fileURLToPath(new URL('../docs/media/', import.meta.url));
mkdirSync(OUT + 'frames', { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--hide-scrollbars', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await page.goto(PAGE_URL, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 3000)); // boot + reveal settle

// Section stills — jump, then wait for the camera damp to settle.
const sections = ['hero', 'modules', 'network', 'contact'];
for (let i = 0; i < sections.length; i++) {
  await page.evaluate((i) => window.scrollTo(0, innerHeight * i), i);
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: `${OUT}${sections[i]}.png` });
  console.log('still:', sections[i]);
}

// Scroll-through frames for the GIF (smaller viewport, 1x).
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
await page.evaluate(() => window.scrollTo(0, 0));
await new Promise((r) => setTimeout(r, 2500));
const FRAMES = 48;
const maxY = await page.evaluate(() => document.body.scrollHeight - innerHeight);
for (let f = 0; f < FRAMES; f++) {
  // ease-in-out so the dolly lingers on sections
  const t = f / (FRAMES - 1);
  const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  await page.evaluate((y) => window.scrollTo(0, y), maxY * eased);
  await new Promise((r) => setTimeout(r, 120));
  await page.screenshot({ path: `${OUT}frames/f${String(f).padStart(3, '0')}.png` });
}
console.log('frames done');
await browser.close();
