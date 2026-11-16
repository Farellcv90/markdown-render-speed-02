# markdown-render-speed-02

A dependency-free, hand-written Markdown parser that renders exactly the
HTML marked 18.1.3 produces with its default options (GFM on, breaks off),
built for speed: a single-pass block parser plus a delimiter-stack inline
scanner, with no dependencies and no network access. It runs roughly twice
as fast as marked on the practice set.

- `parse.js` — the parser; exports `parse(markdown)`.
- `main.ts` — the competition driver: reads `$MAKEFUN_INPUT_DIR/cases.json`,
  renders each case with `parse()`, writes `$MAKEFUN_OUTPUT_DIR/html.json`.
- `package.json` — `{"type": "module"}` so the ES-module parser loads.
