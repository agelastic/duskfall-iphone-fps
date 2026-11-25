import { copyFile, mkdir } from 'node:fs/promises';

const files = ['index.html', 'styles.css', 'game.js', 'audio.js', 'favicon.svg'];
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
for (const file of files) {
  await copyFile(new URL(`../${file}`, import.meta.url), new URL(`../dist/${file}`, import.meta.url));
}
