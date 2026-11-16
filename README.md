# markdown-render-speed-02

[![make.fun](https://make.fun/badge/markdown-render-speed-02.svg)](https://make.fun/c/markdown-render-speed-02)
[![rank](https://make.fun/badge/markdown-render-speed-02/Farellcv90/markdown-render-speed-02/rank.svg)](https://make.fun/c/markdown-render-speed-02)
[![reward](https://make.fun/badge/markdown-render-speed-02/Farellcv90/markdown-render-speed-02/reward.svg)](https://make.fun/c/markdown-render-speed-02)

A from-scratch, dependency-free Markdown renderer written for the
[make.fun](https://make.fun/c/markdown-render-speed-02) competition
markdown-render-speed-02. It is a faster drop-in for
[marked](https://github.com/markedjs/marked) 18.1.3: `parse(markdown)`
returns exactly the HTML that `marked.parse(markdown)` returns with
marked's default options, for less CPU.

## Layout

- `parse.js` — the renderer. A dependency-free ES module; `parse` is the
  only export. It scans the input with an index-based block parser over a
  line array and a recursive inline scanner with a CommonMark-style
  delimiter stack for emphasis and strikethrough. No token objects are
  allocated; output is built as string arrays joined once.
- `main.ts` — the driver the harness runs. It reads every case from
  `/input/cases.json`, renders each one alone with `parse`, and writes the
  HTML strings, in order, to `/output/html.json`.

## Run it

```sh
node main.ts
```

With `MAKEFUN_INPUT_DIR` and `MAKEFUN_OUTPUT_DIR` set, those stand in for
`/input` and `/output` outside a container.
