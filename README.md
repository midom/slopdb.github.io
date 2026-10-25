# SlopDB website

Static landing page and documentation for [SlopDB](https://github.com/midom/slopdb).
Serve this directory directly; there is no runtime framework or application server.
All links and assets work under a subdirectory such as `/slopdb/`.

```sh
python3 -m http.server 8080
```

Open `http://localhost:8080/`. The generated documentation is included in `docs/`.

To refresh the documentation from the database checkout (defaults to `~/slopdb`):

```sh
npm ci
npm run build:docs
# Or use a different checkout:
node scripts/build-docs.mjs /path/to/slopdb
```

The generator converts project guides, nested benchmark reports, command README
files, the project overview, and `TESTING.md` to HTML. It retains source revision
information, rewrites links between local guides, and makes every rendered guide
available through the documentation navigation.
Links to source code and benchmark artifacts open the upstream repository.
The homepage examples and copy are maintained in `index.html`.

The SQL function reference is maintained in `content/functions.json`, with a
source-verified inventory in `content/function-inventory.json`. Every public
function name and dialect variant in the inventory must have a signature,
description, return type, and example; the documentation build fails on missing
or stale entries.

```sh
npm run sync:functions   # Inspect current engine registries without changing its checkout
npm run build:docs      # Check coverage and render the reference and guides
npm run check:examples  # Execute standalone examples in isolated temporary databases
npm run check:docs      # Check local links, anchors, and duplicate IDs
```

These scripts accept an alternate source checkout as an argument. Inventory and
example checks use Go test overlays and require the engine's Go toolchain and
dependencies. They leave its working tree unchanged. Examples requiring a live
protocol connection or pre-created schema are identified in the reference and
skipped by the standalone example check. The function pages record the exact
engine revision and source file locations used for the inventory. A source
checkout may contain unpublished engine commits; file references do not assume
that those commits are available on GitHub.

Implementation-verified corrections to stale source prose are recorded in
`content/guide-corrections.json`, with evidence locations. The build applies
them without modifying the engine checkout and requires review if the source
paragraph changes. Edit these inputs rather than generated HTML.

Source-verified additions for APIs not yet covered by the upstream guides live
in `content/guide-additions.json`. The generator appends them to the matching
guide and checks that their source guide and evidence files still exist. Review
these additions when refreshing the source to avoid duplicating upstream prose.

`assets/icon.svg` and `assets/logo.svg` are vector adaptations of the supplied
[slime-database logo reference](https://chatgpt.com/s/m_6add258a37248191a1638421f881c125).
The downloaded reference is retained in `assets/brand-reference.jpg`.
DM Sans and DM Mono are self-hosted in `assets/fonts/`, including their open
font licenses. The website makes no third-party font or script requests.
