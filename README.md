# markdown-render-speed-02

A dependency-free Markdown parser written from scratch that renders exactly
the HTML marked 18.1.3 produces with its default options (GFM on, breaks
off): ATX and setext headings, fenced and indented code, block quotes,
bullet/ordered/task lists, GFM tables, thematic breaks, raw HTML blocks,
link reference definitions, and the full inline set (code spans, links,
autolinks, emphasis, strikethrough, entities, escapes, inline HTML, hard
breaks).

## Files

- `parse.js` — the parser. `parse(markdown)` returns the HTML string.
- `main.ts` — the Node 22 driver: reads `cases.json` from
  `$MAKEFUN_INPUT_DIR` and writes the rendered HTML array to
  `$MAKEFUN_OUTPUT_DIR/html.json`.
- `package.json` — `{"type":"module"}`, no dependencies.
