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
await writeFile(join(outputRoot, '404.html'), `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>ページが見つかりません | AI・ITよろず相談所</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f8f9fb; color: #1f2937; font-family: system-ui, sans-serif; }
    main { max-width: 36rem; padding: 2rem; text-align: center; }
    h1 { font-size: clamp(1.5rem, 5vw, 2rem); }
    a { color: #b71c1c; font-weight: 700; }
  </style>
</head>
<body>
  <main>
    <h1>ページが見つかりません</h1>
    <p>URLをご確認ください。</p>
    <a href="/">トップページへ戻る</a>
  </main>
</body>
</html>
`, 'utf8');

console.log(`Cloudflare Pages output ready in dist for ${newBase}`);
