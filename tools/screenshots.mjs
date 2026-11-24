// Captures the entry's screenshots from the game's own showcase scenes (?shot=...) in headless Chrome.
// Usage: node tools/screenshots.mjs [outDir]   — writes 1280x720 JPEGs, each kept under 256 KiB.
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { openGame } from './browser.mjs';

const outDir = process.argv[2] || fileURLToPath(new URL('../screenshots', import.meta.url));
const SCENES = [
  ['1-chase', 'chase'],
  ['2-night-pursuit', 'night'],
  ['3-gunfight', 'combat'],
  ['4-coast-drive', 'beach'],
];
const LIMIT = 256 * 1024;

await mkdir(outDir, { recursive: true });
for (const [file, scene] of SCENES) {
  const page = await openGame(`?shot=${scene}`);
  try {
    await page.waitFor('window.__shotReady === true', 120000);
    await page.sleep(500);
    let quality = 90, buf;
    do { buf = await page.screenshot(null, { quality }); quality -= 6; } while (buf.length > LIMIT && quality > 40);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(outDir, `${file}.jpg`), buf);
    console.log(`${file}.jpg  ${(buf.length / 1024).toFixed(0)} KiB  q${quality + 6}  errors: ${page.errors.length ? page.errors.join(' | ') : 'none'}`);
  } catch (e) {
    console.log(`${file}: FAILED ${e.message}; errors: ${page.errors.join(' | ')}`);
  }
  await page.close();
}
process.exit(0);
