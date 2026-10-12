import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

// GitHub Pages publishes only /docs on the github-pages-redirect branch.
// The Cloudflare Pages project continues to build from main.
const root = process.cwd();
const output = join(root, 'docs');
const destination = 'https://yorozusoudansyo.pages.dev';

const htmlEscape = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');

function redirectPage(relativePath) {
  const cloudflarePath = relativePath === 'index.html' || relativePath === '404.html'
    ? '/'
    : `/${relativePath.endsWith('/index.html') ? relativePath.slice(0, -'index.html'.length) : relativePath}`;
  const fallback = `${destination}${cloudflarePath}`;
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <link rel="canonical" href="${htmlEscape(fallback)}">
  <meta http-equiv="refresh" content="1;url=${htmlEscape(fallback)}">
  <title>公式サイトへ移動します | AI・ITよろず相談所</title>
  <script>
    const oldPath = window.location.pathname;
    const suffix = oldPath === '/home' ? '' : oldPath.startsWith('/home/') ? oldPath.slice('/home/'.length) : '';
    const target = new URL('${destination}/');
    target.pathname = '/' + suffix;
    target.search = window.location.search;
    target.hash = window.location.hash;
    window.location.replace(target.href);
  </script>
</head>
<body>
  <p>公式サイトへ移動しています。自動で移動しない場合は<a href="${htmlEscape(fallback)}">こちら</a>を開いてください。</p>
</body>
</html>
`;
}

await mkdir(output, { recursive: true });
const rootPages = (await readdir(root, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.html')
  .map((entry) => entry.name);
const pages = [...rootPages, 'momoko-event/index.html', '404.html'];

for (const page of pages) {
  const path = join(output, page);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, redirectPage(page), 'utf8');
}
await writeFile(join(output, '.nojekyll'), '', 'utf8');
console.log(`Created ${pages.length} redirect pages in docs/`);
