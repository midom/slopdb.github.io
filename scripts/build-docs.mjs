import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { marked } from 'marked';
import { functionReferencePages } from './function-reference.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(process.argv[2] || path.join(os.homedir(), 'slopdb'));
const output = path.join(root, 'docs');
const repository = 'https://github.com/midom/slopdb/blob/main/';
const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const groups = [
  ['Start here', [['getting-started', 'Getting started'], ['sql-semantics', 'SQL support & semantics'], ['sql-quoting', 'SQL quoting']]],
  ['Function reference', [['sql-functions', 'Find a SQL function'], ['functions-core', 'Core SQL functions'], ['functions-json', 'JSON functions'], ['functions-mysql', 'MySQL-style functions'], ['functions-postgres', 'PostgreSQL functions'], ['functions-aggregate', 'Aggregate functions'], ['functions-window', 'Window function reference']]],
  ['Build applications', [['driver', 'Embedded database/sql driver'], ['prepared-statements', 'Prepared statements'], ['application-operations', 'Application operations'], ['common-table-expressions', 'Common table expressions'], ['window-functions', 'Window functions'], ['upsert', 'UPSERT'], ['text-collation', 'Unicode & collation']]],
  ['Connect & replicate', [['mysql-server', 'MySQL server'], ['postgres-server', 'PostgreSQL emulation'], ['replication', 'Raft replication'], ['mysql-cdc', 'MySQL CDC & typed changefeed']]],
  ['Manage your database', [['catalogs', 'Shared catalogs'], ['activity', 'Live session activity'], ['alter-table', 'Schema changes'], ['online-indexes', 'Online indexes'], ['schema-change-planning', 'Planning changes'], ['table-status', 'Table status'], ['diagnostics', 'Troubleshooting & LSM status'], ['sql-surprises', 'Unexpected query results']]],
  ['SQL compatibility', [['mysql-functions', 'MySQL function compatibility'], ['postgres-compatibility', 'PostgreSQL compatibility']]],
  ['Understand performance', [['read-execution', 'Read execution & allocation reuse'], ['query-profiling', 'Query profiling'], ['query-statistics', 'Query statistics'], ['query-memory', 'Memory & resources'], ['page-sizes', 'Page sizes'], ['catalog-performance', 'Performance measurements'], ['performance-regressions', 'Performance checks'], ['testing', 'Tests & benchmarks']]]
];

async function markdownFiles(directory) {
  const entries = await readdir(path.join(source, directory), { withFileTypes: true });
  const nested = await Promise.all(entries.filter(entry => !entry.name.startsWith('.')).map(async entry => {
    const relative = path.posix.join(directory, entry.name);
    return entry.isDirectory() ? markdownFiles(relative) : entry.name.endsWith('.md') ? [relative] : [];
  }));
  return nested.flat().sort();
}
const documents = [...await markdownFiles('docs'), ...await markdownFiles('cmd').then(files => files.filter(file => file.endsWith('/README.md'))), 'README.md', 'TESTING.md'];
const pages = new Map();
for (const document of documents) {
  const slug = document === 'README.md' ? 'project-overview' : document === 'TESTING.md' ? 'testing' : document.startsWith('cmd/') ? `benchmark-tool-${document.slice(4, -10).replaceAll('/', '-')}` : document.startsWith('docs/benchmarks/') ? `benchmark-report-${document.slice(16, -3).replace(/\/README$/, '').replaceAll('/', '-')}` : document.slice(5, -3).replaceAll('/', '-');
  if (pages.has(slug)) throw new Error(`Duplicate documentation slug: ${slug}`);
  pages.set(slug, document);
}
const functionPages = await functionReferencePages(root);
const guideCorrections = JSON.parse(await readFile(path.join(root, 'content/guide-corrections.json'), 'utf8'));
const guideAdditions = JSON.parse(await readFile(path.join(root, 'content/guide-additions.json'), 'utf8'));
for (const addition of guideAdditions) {
  if (!documents.includes(addition.source)) throw new Error(`Missing source guide for addition: ${addition.source}`);
  for (const evidence of addition.evidence) await readFile(path.join(source, evidence), 'utf8');
}
for (const page of functionPages) pages.set(page.slug, `@functions/${page.slug}`);
const grouped = new Set(groups.flatMap(([, links]) => links.map(([slug]) => slug)));
for (const [label, matches] of [
  ['Benchmark tools', document => document.startsWith('cmd/')],
  ['Engine & query details', document => document.startsWith('docs/') && !document.startsWith('docs/benchmarks/')],
  ['Benchmark reports', document => document.startsWith('docs/benchmarks/')],
  ['Project overview', document => document === 'README.md']
]) {
  const links = [];
  for (const [slug, document] of pages) {
    if (grouped.has(slug) || !matches(document)) continue;
    const markdown = await readFile(path.join(source, document), 'utf8');
    links.push([slug, markdown.match(/^#\s+(.+)$/m)?.[1] || slug]);
    grouped.add(slug);
  }
  if (links.length) groups.push([label, links]);
}
let revision = 'local checkout';
try { revision = execFileSync('git', ['-C', source, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch {}
let sourceOnOriginMain = false;
try {
  execFileSync('git', ['-C', source, 'merge-base', '--is-ancestor', 'HEAD', 'refs/remotes/origin/main'], { stdio: 'ignore' });
  sourceOnOriginMain = true;
} catch {}
await mkdir(output, { recursive: true });

function navigation(current) {
  return `<button class="docs-toggle" aria-expanded="false" aria-controls="docs-sidebar">Browse documentation <span aria-hidden="true">⌄</span></button><aside class="docs-sidebar" id="docs-sidebar" aria-label="Documentation navigation"><label class="visually-hidden" for="docs-search">Filter guides by title</label><input type="search" id="docs-search" placeholder="Filter guides…" autocomplete="off"><a href="./"${current === 'index' ? ' aria-current="page"' : ''}>Documentation overview</a>${groups.map(([title, links]) => `<div class="nav-section"><p class="nav-group">${escape(title)}</p>${links.filter(([slug]) => pages.has(slug)).map(([slug, title]) => `<a href="${slug}.html"${slug === current ? ' aria-current="page"' : ''}>${escape(title)}</a>`).join('')}</div>`).join('')}<p class="no-results" hidden>No matching guides.</p></aside>`;
}

function shell({ slug, title, body, original, credit = "Rendered from the project documentation", revisionLabel = revision, sourceUrl }) {
  return `<!doctype html>
<html lang="en" class="documentation"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${escape(title)} — SlopDB documentation. An embedded SQL database written in Go."><meta name="theme-color" content="#f6f7f1"><title>${escape(title)} — SlopDB</title><link rel="icon" href="../assets/icon.svg" type="image/svg+xml"><link rel="stylesheet" href="../styles.css"><script src="../site.js" defer></script></head><body><a class="skip-link" href="#main">Skip to content</a><header class="site-header docs-header wrap"><a class="brand" href="../" aria-label="SlopDB home"><img src="../assets/logo.svg" width="140" height="38" alt="slopdb"></a><nav aria-label="Main navigation"><a href="../">← Home</a><a href="./">Documentation</a></nav><a class="github-link" href="https://github.com/midom/slopdb">GitHub ↗</a></header><div class="docs-layout wrap">${navigation(slug)}<main class="doc-article" id="main"><p class="doc-breadcrumb">SLOPDB / DOCUMENTATION${slug === 'index' ? '' : ` / ${escape(title).toUpperCase()}`}</p>${body}<div class="doc-meta"><span>${escape(credit)} · ${escape(revisionLabel)}</span>${sourceUrl ? `<a href="${sourceUrl}">Edit the function reference ↗</a>` : original && sourceOnOriginMain ? `<a href="${repository}${original}">View source on GitHub ↗</a>` : original ? `<span>Source: ${escape(original)}</span>` : '<a href="https://github.com/midom/slopdb">Explore the source ↗</a>'}</div></main></div><footer class="site-footer wrap"><a class="brand" href="../" aria-label="SlopDB home"><img src="../assets/logo.svg" width="120" height="32" alt="slopdb"></a><p>An embedded SQL database. A little personality.</p><div><a href="../">Home</a><a href="https://github.com/midom/slopdb">Source ↗</a><a href="https://github.com/midom/slopdb/blob/main/LICENSE">Apache 2.0</a></div></footer></body></html>\n`;
}

for (const [slug, original] of pages) {
  if (original.startsWith('@functions/')) continue;
  let markdown = await readFile(path.join(source, original), 'utf8');
  for (const correction of guideCorrections.filter(item => item.source === original)) {
    if (markdown.includes(correction.old)) markdown = markdown.replace(correction.old, correction.replacement);
    else if (!markdown.includes(correction.replacement)) throw new Error(`Review outdated guide correction for ${original}`);
  }
  for (const addition of guideAdditions.filter(item => item.source === original)) {
    markdown += `\n\n${addition.markdown}\n`;
  }
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
  const credit = guideAdditions.some(item => item.source === original) ? 'Project documentation and source-verified API notes' : undefined;
  await writeFile(path.join(output, `${slug}.html`), shell({ slug, title, body, original, credit }));
}

for (const page of functionPages) {
  await writeFile(path.join(output, `${page.slug}.html`), shell({ ...page, credit: "Function reference checked against engine source", revisionLabel: page.revision.slice(0, 7), sourceUrl: "https://github.com/midom/slopdb.github.io/blob/main/content/functions.json" }));
}

const cards = [
  ['getting-started', 'Your first database', 'Build SlopDB, create a table, and run your first queries.'],
  ['driver', 'Embed with database/sql', 'Use the standard Go pool with shared engines and independent sessions.'],
  ['sql-functions', 'Find a SQL function', 'Search every native, JSON, MySQL, PostgreSQL, aggregate, and window function.'],
  ['catalogs', 'Explore shared catalogs', 'Inspect schema, types, indexes, and constraints through one native catalog view.'],
  ['activity', 'See live session activity', 'Inspect PROCESSLIST, pg_stat_activity, query text, and actual lock waits.'],
  ['replication', 'Explore replication', 'Bootstrap a Raft cluster and understand read consistency.'],
  ['mysql-cdc', 'Consume committed changes', 'Use row-based MySQL binlog streaming or the native typed changefeed.'],
  ['read-execution', 'Understand read execution', 'Explore exact COUNT scans, allocation reuse, prepared mutations, and join execution.']
];
const overview = `<h1>A little guidance.<br>A lot of possibilities.</h1><p>SlopDB is an embedded SQL database written in Go. Start with a local database directory, embed it in an application, or enable a SQL protocol listener.</p><p>These guides are rendered directly from the project’s documentation. They describe supported behavior, operational settings, and compatibility limits.</p><div class="guide-grid">${cards.map(([slug, title, description]) => `<a class="guide-card" href="${slug}.html"><h3>${title} ↗</h3><p>${description}</p></a>`).join('')}</div><h2>Start small</h2><p>Build from the repository root with Go 1.22.2 or newer:</p><pre><code>git clone https://github.com/midom/slopdb.git\ncd slopdb\ngo build -o slopdb .\n./slopdb ./example-db</code></pre><h2>Recent additions</h2><ul><li><a href="read-execution.html">Read execution and allocation reuse</a>: exact COUNT scans, typed predicates and aggregates, prepared mutation buffers, and compact join predicates. Scans execute on the calling query’s goroutine; independent sessions remain concurrent.</li><li><a href="application-operations.html#bounded-primary-key-reads">Bounded primary-key reads</a> reuse result storage for eligible small IN and range queries, with snapshot-preserving fallback for larger data.</li><li><a href="application-operations.html#reusable-streaming-and-storage-buffers">Reusable streaming buffers</a> reduce row and BLOB decoding allocations across native queries, database/sql, MySQL streaming, and PostgreSQL COPY while preserving public result ownership.</li><li><a href="mysql-server.html#queries-and-connections">Lean MySQL responses</a>: negotiated optional result metadata, EOF deprecation, and bounded response buffers for text and prepared queries.</li><li><a href="application-operations.html">Reusable row values</a>: ValuesInto reuses caller-owned slices and BLOB buffers while preserving NULL and empty-BLOB semantics.</li><li><a href="application-operations.html#execute-an-already-parsed-select">Parsed SELECT execution</a>: reusable primary-key point, IN, and range results or a rows fallback under one statement snapshot.</li><li><a href="prepared-statements.html">Retained prepared bindings</a>: session-owned execution trees survive garbage collection, with catalog, statistics, and rollback invalidation.</li><li><a href="driver.html#plain-queries-and-prepared-execution">Direct database/sql text queries</a> avoid allocating prepared-statement pools for calls without arguments.</li><li><a href="application-operations.html#observe-session-shutdown">Session shutdown contexts</a> let protocol adapters cancel blocked response writes after row iteration finishes.</li><li><a href="benchmark-tool-select-bench.html">SELECT benchmark updates</a>: a typed mysql-lean wire control and opt-in server profiles, with explicit client-cost and profiling caveats.</li></ul><h2>Choose your path</h2>${groups.map(([title, links]) => `<h3>${title}</h3><ul>${links.filter(([slug]) => pages.has(slug)).map(([slug, label]) => `<li><a href="${slug}.html">${label}</a></li>`).join('')}</ul>`).join('')}<h2>Performance with context</h2><p>The project includes <a href="testing.html">regression tests and SQL reference fixtures</a>, plus TPC-C-inspired and TPC-H development workloads. These are development benchmarks, not certified TPC scores. Compare runs using matching datasets, concurrency, execution modes, and durability settings.</p>`;
await writeFile(path.join(output, 'index.html'), shell({ slug: 'index', title: 'Documentation', body: overview }));
// Retire generated guides that no longer exist in the source documentation.
const expectedFiles = new Set(['index.html', ...[...pages.keys()].map(slug => `${slug}.html`)]);
for (const filename of await readdir(output)) {
  if (!filename.endsWith('.html') || expectedFiles.has(filename)) continue;
  const file = path.join(output, filename);
  if ((await readFile(file, 'utf8')).includes('<p class="doc-breadcrumb">SLOPDB / DOCUMENTATION')) {
    await unlink(file);
    console.log(`Removed retired guide: ${filename}`);
  }
}
console.log(`Rendered ${pages.size + 1} documentation pages from ${source} (${revision}).`);
