import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '/Users/nicholassoh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(here, 'di-deck.html');
const outputDir = path.join(here, 'output', 'pdf');

await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
  colorScheme: 'light',
});

await page.addInitScript(() => {
  localStorage.removeItem('di-deck-slide');
  localStorage.setItem('di-deck-theme', 'light');
});

await page.goto(pathToFileURL(source).href, { waitUntil: 'networkidle' });
await page.emulateMedia({ media: 'screen', colorScheme: 'light', reducedMotion: 'reduce' });
await page.addStyleTag({
  content: `
    @page { size: 1280px 720px; margin: 0; }
    html, body, .well { width: 1280px !important; height: 720px !important; }
    body { overflow: hidden !important; background: var(--bg) !important; }
    .well { position: absolute !important; inset: 0 !important; background: var(--bg) !important; }
    .frame {
      position: absolute !important;
      inset: 0 !important;
      width: 1280px !important;
      height: 720px !important;
      transform: none !important;
    }
    .stage {
      border: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
    }
    .slide, .slide * {
      transition: none !important;
      animation: none !important;
    }
  `,
});

await page.evaluate(() => document.fonts.ready);

const slides = await page.locator('.slide').evaluateAll((nodes) =>
  nodes.map((node, index) => ({
    index,
    title: node.getAttribute('data-section') || `Slide ${index + 1}`,
  })),
);

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

for (const slide of slides) {
  await page.locator('.slide').evaluateAll((nodes, activeIndex) => {
    nodes.forEach((node, index) => {
      node.classList.toggle('active', index === activeIndex);
      node.classList.remove('prevOf');
    });
  }, slide.index);

  await page.evaluate((activeIndex) => {
    const count = document.getElementById('navCount');
    const section = document.getElementById('fbSection');
    const progress = document.getElementById('progress');
    const active = document.querySelectorAll('.slide')[activeIndex];
    if (count) count.textContent = `${activeIndex + 1} / ${document.querySelectorAll('.slide').length}`;
    if (section) section.textContent = `\u00b7 ${active.getAttribute('data-section')}`;
    if (progress) progress.style.width = `${((activeIndex + 1) / document.querySelectorAll('.slide').length) * 100}%`;
  }, slide.index);

  const number = String(slide.index + 1).padStart(2, '0');
  const filename = `slide-${number}-${slugify(slide.title)}.pdf`;
  await page.pdf({
    path: path.join(outputDir, filename),
    width: '1280px',
    height: '720px',
    printBackground: true,
    preferCSSPageSize: true,
    tagged: true,
  });
}

await browser.close();
console.log(`Exported ${slides.length} slides to ${outputDir}`);
