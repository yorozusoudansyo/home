import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const sourceRoot = process.cwd();
const outputRoot = join(sourceRoot, 'dist');
const oldBase = 'https://yorozusoudansyo.github.io/home/';
const oldDisplayBase = 'yorozusoudansyo.github.io/home/';
const requestedOrigin = process.env.SITE_ORIGIN;

if (!requestedOrigin) {
  throw new Error('SITE_ORIGIN must be set to the new public site origin.');
}

const siteUrl = new URL(requestedOrigin);
if (
  siteUrl.protocol !== 'https:' ||
  siteUrl.pathname !== '/' ||
  siteUrl.search ||
  siteUrl.hash ||
  siteUrl.username ||
  siteUrl.password
) {
  throw new Error('SITE_ORIGIN must be an HTTPS origin without a path, query, or credentials.');
}
const newBase = `${siteUrl.origin}/`;
const newDisplayBase = `${siteUrl.host}/`;

const allowedExtensions = new Set([
  '.css', '.gif', '.html', '.ico', '.jpeg', '.jpg', '.js', '.json',
  '.png', '.svg', '.webp',
]);

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

async function publishFile(sourcePath) {
  const destinationPath = join(outputRoot, relative(sourceRoot, sourcePath));
  await mkdir(join(destinationPath, '..'), { recursive: true });
  const extension = extname(sourcePath).toLowerCase();
  if (['.html', '.css', '.js', '.json'].includes(extension)) {
    const content = await readFile(sourcePath, 'utf8');
    await writeFile(
      destinationPath,
      content.replaceAll(oldBase, newBase).replaceAll(oldDisplayBase, newDisplayBase),
      'utf8',
    );
  } else {
    await copyFile(sourcePath, destinationPath);
  }
}

async function publishDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const sourcePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      await publishDirectory(sourcePath);
    } else if (entry.isFile() && allowedExtensions.has(extname(entry.name).toLowerCase())) {
      await publishFile(sourcePath);
    }
  }
}

for (const entry of await readdir(sourceRoot, { withFileTypes: true })) {
  if (entry.isFile() && ['.html', '.png'].includes(extname(entry.name).toLowerCase())) {
    await publishFile(join(sourceRoot, entry.name));
  }
}
await publishDirectory(join(sourceRoot, 'assets'));
await publishDirectory(join(sourceRoot, 'momoko-event'));
await publishFile(join(sourceRoot, 'data', 'articles.json'));

console.log(`Cloudflare Pages output ready in dist for ${newBase}`);
