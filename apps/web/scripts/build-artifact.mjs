/**
 * Package the demo as a single self-contained HTML fragment (inline CSS + JS)
 * plus the model files, for hosts that only allow inline code and same-origin
 * fetches. Run after `vite build --mode artifact`.
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist-artifact');
const out = join(root, 'artifact');
const html = readFileSync(join(dist, 'index.html'), 'utf8');

const assets = readdirSync(join(dist, 'assets'));
const css = assets.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(dist, 'assets', f), 'utf8')).join('\n');
const jsFile = /<script type="module" crossorigin src="\.\/assets\/([^"]+)"><\/script>/.exec(html)?.[1];
if (!jsFile) throw new Error('main script not found');
const js = readFileSync(join(dist, 'assets', jsFile), 'utf8').replace(/<\/script/gi, '<\\/script');

const fonts = [...html.matchAll(/<link[^>]+fonts\.(googleapis|gstatic)[^>]*>/g)].map((m) => m[0]).join('\n');
const desc = /<meta name="description"[^>]*>/.exec(html)?.[0] ?? '';

const page = `<title>Poker RL</title>
${desc}
${fonts}
<style>
${css}
</style>
<div id="root"></div>
<script type="module">
${js}
</script>
`;

mkdirSync(join(out, 'models'), { recursive: true });
writeFileSync(join(out, 'index.html'), page);
for (const f of ['blueprint.json', 'exploit.json']) copyFileSync(join(root, 'public/models', f), join(out, 'models', f));
console.log(`artifact/index.html: ${(page.length / 1024).toFixed(0)} KB`);
