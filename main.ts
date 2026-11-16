// Driver for the markdown-render-speed-02 competition.
//
// Reads the case array from $MAKEFUN_INPUT_DIR/cases.json (falling back to
// /input/cases.json), renders every case on its own with parse(), and writes
// the resulting HTML strings, in the cases' order, to
// $MAKEFUN_OUTPUT_DIR/html.json (falling back to /output/html.json).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parse.js';

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(inputDir, 'cases.json'), 'utf8'));

const html = [];
for (let i = 0; i < cases.length; i++) {
  const c = cases[i];
  html.push(parse(typeof c === 'string' ? c : c.markdown));
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'html.json'), JSON.stringify(html));
