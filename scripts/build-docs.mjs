import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { marked } from 'marked';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(process.argv[2] || path.join(os.homedir(), 'slopdb'));
const output = path.join(root, 'docs');
const repository = 'https://github.com/midom/slopdb/blob/main/';
const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const groups = [
  ['Start here', [['getting-started', 'Getting started'], ['sql-semantics', 'SQL support & semantics'], ['sql-quoting', 'SQL quoting']]],
  ['Build applications', [['prepared-statements', 'Prepared statements'], ['application-operations', 'Application operations'], ['common-table-expressions', 'Common table expressions'], ['window-functions', 'Window functions'], ['upsert', 'UPSERT'], ['text-collation', 'Unicode & collation']]],
  ['Connect & replicate', [['mysql-server', 'MySQL server'], ['postgres-server', 'PostgreSQL emulation'], ['replication', 'Raft replication']]],
  ['Manage your database', [['alter-table', 'Schema changes'], ['online-indexes', 'Online indexes'], ['schema-change-planning', 'Planning changes'], ['table-status', 'Table status'], ['diagnostics', 'Troubleshooting'], ['sql-surprises', 'Unexpected query results']]],
  ['Understand performance', [['query-profiling', 'Query profiling'], ['query-statistics', 'Query statistics'], ['query-memory', 'Memory & resources'], ['page-sizes', 'Page sizes'], ['catalog-performance', 'Performance measurements'], ['performance-regressions', 'Performance checks'], ['testing', 'Tests & benchmarks']]]
];

const sourceFiles = (await readdir(path.join(source, 'docs'))).filter(name => name.endsWith('.md'));
const pages = new Map(sourceFiles.map(name => [name.slice(0, -3), `docs/${name}`]));
pages.set('testing', 'TESTING.md');
let revision = 'local checkout';
try { revision = execFileSync('git', ['-C', source, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch {}
await mkdir(output, { recursive: true });

function navigation(current) {
  return `<button class="docs-toggle" aria-expanded="false" aria-controls="docs-sidebar">Browse documentation <span aria-hidden="true">⌄</span></button><aside class="docs-sidebar" id="docs-sidebar" aria-label="Documentation navigation"><label class="visually-hidden" for="docs-search">Filter guides by title</label><input type="search" id="docs-search" placeholder="Filter guides…" autocomplete="off"><a href="./"${current === 'index' ? ' aria-current="page"' : ''}>Documentation overview</a>${groups.map(([title, links]) => `<div class="nav-section"><p class="nav-group">${escape(title)}</p>${links.filter(([slug]) => pages.has(slug)).map(([slug, title]) => `<a href="${slug}.html"${slug === current ? ' aria-current="page"' : ''}>${escape(title)}</a>`).join('')}</div>`).join('')}<p class="no-results" hidden>No matching guides.</p></aside>`;
}

function shell({ slug, title, body, original }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${escape(title)} — SlopDB documentation. An embedded SQL database written in Go."><meta name="theme-color" content="#f6f7f1"><title>${escape(title)} — SlopDB</title><link rel="icon" href="../assets/icon.svg" type="image/svg+xml"><link rel="stylesheet" href="../styles.css"><script src="../site.js" defer></script></head><body><a class="skip-link" href="#main">Skip to content</a><header class="site-header docs-header wrap"><a class="brand" href="../" aria-label="SlopDB home"><img src="../assets/logo.svg" width="140" height="38" alt="slopdb"></a><nav aria-label="Main navigation"><a href="../">← Home</a><a href="./">Documentation</a></nav><a class="github-link" href="https://github.com/midom/slopdb">GitHub ↗</a></header><div class="docs-layout wrap">${navigation(slug)}<main class="doc-article" id="main"><p class="doc-breadcrumb">SLOPDB / DOCUMENTATION${slug === 'index' ? '' : ` / ${escape(title).toUpperCase()}`}</p>${body}<div class="doc-meta"><span>Rendered from the project documentation · ${escape(revision)}</span>${original ? `<a href="${repository}${original}">View source on GitHub ↗</a>` : '<a href="https://github.com/midom/slopdb">Explore the source ↗</a>'}</div></main></div><footer class="site-footer wrap"><a class="brand" href="../" aria-label="SlopDB home"><img src="../assets/logo.svg" width="120" height="32" alt="slopdb"></a><p>An embedded SQL database. A little personality.</p><div><a href="../">Home</a><a href="https://github.com/midom/slopdb">Source ↗</a><a href="https://github.com/midom/slopdb/blob/main/LICENSE">Apache 2.0</a></div></footer></body></html>\n`;
}

for (const [slug, original] of pages) {
  const markdown = await readFile(path.join(source, original), 'utf8');
  const title = markdown.match(/^#\s+(.+)$/m)?.[1] || slug;
  const usedIds = new Map();
  const renderer = new marked.Renderer();
  renderer.heading = function({ tokens, depth }) {
    const text = this.parser.parseInline(tokens);
    const base = text.replace(/<[^>]*>/g, '').toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
    const count = usedIds.get(base) || 0;
    usedIds.set(base, count + 1);
    return `<h${depth} id="${base}${count ? `-${count}` : ''}">${text}</h${depth}>\n`;
  };
  renderer.link = function({ href, title, tokens }) {
    let target = href;
    if (!/^(?:[a-z]+:|#|\/\/)/i.test(href)) {
      const [file, anchor] = href.split('#');
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(original), file));
      const localSlug = [...pages].find(([, name]) => name === resolved)?.[0];
      target = localSlug ? `${localSlug}.html${anchor ? `#${anchor}` : ''}` : `${repository}${resolved}${anchor ? `#${anchor}` : ''}`;
    }
    return `<a href="${escape(target)}"${title ? ` title="${escape(title)}"` : ''}>${this.parser.parseInline(tokens)}</a>`;
  };
  renderer.table = function(token) {
    return `<div class="table-scroll">${marked.Renderer.prototype.table.call(this, token)}</div>`;
  };
  const body = marked.parse(markdown, { renderer, gfm: true });
  await writeFile(path.join(output, `${slug}.html`), shell({ slug, title, body, original }));
}

const cards = [
  ['getting-started', 'Your first database', 'Build SlopDB, create a table, and run your first queries.'],
  ['sql-semantics', 'Work with SQL', 'Understand types, constraints, queries, and supported behavior.'],
  ['prepared-statements', 'Build with Go', 'Bind typed parameters and work with sessions and transactions.'],
  ['application-operations', 'Keep things running', 'Load data, stream results, back up, and check integrity.'],
  ['mysql-server', 'Connect your tools', 'Use the optional MySQL listener with familiar clients.'],
  ['replication', 'Explore replication', 'Bootstrap a Raft cluster and understand read consistency.']
];
const overview = `<h1>A little guidance.<br>A lot of possibilities.</h1><p>SlopDB is an embedded SQL database written in Go. Start with a local database directory, embed it in an application, or enable a SQL protocol listener.</p><p>These guides are rendered directly from the project’s documentation. They describe supported behavior, operational settings, and compatibility limits.</p><div class="guide-grid">${cards.map(([slug, title, description]) => `<a class="guide-card" href="${slug}.html"><h3>${title} ↗</h3><p>${description}</p></a>`).join('')}</div><h2>Start small</h2><p>Build from the repository root with Go 1.22.2 or newer:</p><pre><code>git clone https://github.com/midom/slopdb.git\ncd slopdb\ngo build -o slopdb .\n./slopdb ./example-db</code></pre><h2>Choose your path</h2>${groups.map(([title, links]) => `<h3>${title}</h3><ul>${links.filter(([slug]) => pages.has(slug)).map(([slug, label]) => `<li><a href="${slug}.html">${label}</a></li>`).join('')}</ul>`).join('')}<h2>Performance with context</h2><p>The project includes <a href="testing.html">regression tests and SQL reference fixtures</a>, plus TPC-C-inspired and TPC-H development workloads. These are development benchmarks, not certified TPC scores. Compare runs using matching datasets, concurrency, execution modes, and durability settings.</p>`;
await writeFile(path.join(output, 'index.html'), shell({ slug: 'index', title: 'Documentation', body: overview }));
console.log(`Rendered ${pages.size + 1} documentation pages from ${source} (${revision}).`);
