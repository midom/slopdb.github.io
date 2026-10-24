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

The generator converts the top-level project guides and `TESTING.md` to HTML,
retains source revision information, and rewrites links between local guides.
Links to source code and benchmark artifacts open the upstream repository.
The homepage examples and copy are maintained in `index.html`.

`assets/icon.svg` and `assets/logo.svg` are vector adaptations of the supplied
[slime-database logo reference](https://chatgpt.com/s/m_6add258a37248191a1638421f881c125).
The downloaded reference is retained in `assets/brand-reference.jpg`.
DM Sans and DM Mono are self-hosted in `assets/fonts/`, including their open
font licenses. The website makes no third-party font or script requests.
