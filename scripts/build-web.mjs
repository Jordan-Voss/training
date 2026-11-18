import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
// Cache only this application's static shell, never API responses or private media.
const files = [];
async function walk(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) await walk(path);
    else if (!path.endsWith('.map') && !path.endsWith('metadata.json'))
      files.push('/' + path.slice('dist/'.length));
  }
}
await walk('dist');
const version = Date.now().toString(36);
await writeFile(
  'dist/sw.js',
  `const CACHE='training-${version}';const ASSETS=${JSON.stringify(files)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('training-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname.startsWith('/viewer'))return;if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match('/index.html')));return;}event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request)));});`,
);
let html = await readFile('dist/index.html', 'utf8');
html = html
  .replace(
    '<head>',
    '<head><meta name="theme-color" content="#F7F8FA"><meta name="description" content="Your private training notebook."><link rel="manifest" href="/manifest.json">',
  )
  .replace('<title>', '<title>')
  .replace(/<title>.*?<\/title>/, '<title>Training</title>');
html = html.replace(
  '</body>',
  `<script>if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));}</script></body>`,
);
await writeFile('dist/index.html', html);
await writeFile(
  'dist/manifest.json',
  JSON.stringify({
    name: 'Training',
    short_name: 'Training',
    start_url: '/',
    display: 'standalone',
    background_color: '#F7F8FA',
    theme_color: '#2457F5',
  }),
);
await writeFile(
  'dist/_headers',
  `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Frame-Options: DENY\n/auth/*\n  Cache-Control: no-store\n/sw.js\n  Cache-Control: no-cache\n`,
);
console.log(
  `Prepared Training web shell: ${files.length} assets. Private data stays out of the service-worker cache.`,
);
