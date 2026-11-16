// Driver for this entry: it reads every case from
// $MAKEFUN_INPUT_DIR/cases.json (falling back to /input/cases.json),
// renders each case on its own with parse() from ./parse.js, and writes
// the resulting HTML strings, in the cases' order, to
// $MAKEFUN_OUTPUT_DIR/html.json (falling back to /output/html.json).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parse.js';

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(inputDir, 'cases.json'), 'utf8'));
const html = new Array(cases.length);
for (let i = 0; i < cases.length; i++) html[i] = parse(cases[i].markdown);
mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'html.json'), JSON.stringify(html));
