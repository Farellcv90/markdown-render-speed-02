// Entrypoint for the make.fun markdown-render-speed-02 entry.
// Wires the from-scratch parser (parse.js) to the competition's
// Node 22 driver contract: cases.json in, html.json out.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parse.js';

// Driver for the make.fun markdown-render-speed competition: read the
// case array, render each case on its own with parse(), and write the
// resulting HTML strings (in the cases' order) as a JSON array.
const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const raw = readFileSync(join(inputDir, 'cases.json'), 'utf8');
const cases = JSON.parse(raw);

const rendered = [];
for (const c of cases) rendered.push(parse(c.markdown));

writeFileSync(join(outputDir, 'html.json'), JSON.stringify(rendered));
