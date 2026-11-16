# markdown-render-speed-02

[![make.fun · markdown-render-speed-02](https://make.fun/badge/markdown-render-speed-02.svg)](https://make.fun/bounty/markdown-render-speed-02?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)
[![rank](https://make.fun/badge/markdown-render-speed-02/Farellcv90/markdown-render-speed-02/rank.svg)](https://make.fun/bounty/markdown-render-speed-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)
[![reward](https://make.fun/badge/markdown-render-speed-02/Farellcv90/markdown-render-speed-02/reward.svg)](https://make.fun/bounty/markdown-render-speed-02?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)

A dependency-free Markdown parser written from scratch that renders exactly
the HTML marked 18.1.3 produces with its default options (GFM on, breaks
off): ATX and setext headings, fenced and indented code, block quotes,
bullet/ordered/task lists, GFM tables, thematic breaks, raw HTML blocks,
link reference definitions, and the full inline set (code spans, links,
autolinks, emphasis, strikethrough, entities, escapes, inline HTML, hard
breaks).

Entry for the [markdown-render-speed-02 bounty on make.fun](https://make.fun/bounty/markdown-render-speed-02) — see the bounty page for the leaderboard and reward. Entrant referral link: https://make.fun/r/s41d5185

## Run

```sh
node --input-type=module -e "import { parse } from './parse.js'; console.log(parse('# hello\n'))"
```

## Files

- `parse.js` — the parser. `parse(markdown)` returns the HTML string.
- `main.ts` — the Node 22 driver: reads `cases.json` from
  `$MAKEFUN_INPUT_DIR` and writes the rendered HTML array to
  `$MAKEFUN_OUTPUT_DIR/html.json`.
- `package.json` — `{"type":"module"}`, no dependencies.
