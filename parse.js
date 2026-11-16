// A fast drop-in for marked 18.1.3 (default options: gfm on, breaks off).
// Written from scratch in this session against the CommonMark 0.31.2 /
// GFM 0.29 specs and black-box probes of marked's output.
//
// Layout: entity table + small char helpers, the inline parser (scanner
// plus delimiter stack), the block parser (line cursor with tab-aware
// columns, container stack, paragraph finalisation with link reference
// definitions and GFM tables), and the renderer.

export function parse(markdown) {
  const parsed = blockParse(String(markdown));
  return renderBlocks(parsed.root, parsed.refs);
}

// Named entities are NOT decoded: marked passes a reference such as
// &copy; or &notanentity; through unchanged (the '&' is left alone by
// the no-encode rule). Only numeric references (&#65;, &#x41;) are
// decoded, with 0, surrogates and values above U+10FFFF becoming U+FFFD,
// and only when they have at most 7 decimal or 6 hex digits.


// Block-level tag names for HTML block type 6 (CommonMark list).
const BLOCK_TAGS = new Set(('address article aside base basefont blockquote body caption center col colgroup ' +
  'dd details dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 ' +
  'head header hr html iframe legend li link main menu menuitem nav noframes ol optgroup option p param ' +
  'search section summary table tbody td tfoot th thead title tr track ul').split(' '));

// ASCII punctuation, for backslash escapes and flanking rules.
function isAsciiPunct(c) {
  return c !== '' && ((c >= '!' && c <= '/') || (c >= ':' && c <= '@') ||
    (c >= '[' && c <= '`') || (c >= '{' && c <= '~'));
}
function isSpaceChar(c) {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v' ||
    c === '\u00A0' || c === '\u1680' || (c >= '\u2000' && c <= '\u200A') ||
    c === '\u202F' || c === '\u205F' || c === '\u3000';
}
const PUNCT_RE = /[\p{P}\p{S}]/u;
function isPunctChar(c) {
  return c !== '' && (isAsciiPunct(c) || PUNCT_RE.test(c));
}
function isWordChar(c) {
  return c !== '' && ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
    (c >= '0' && c <= '9') || c === '_' || c.charCodeAt(0) > 127);
}

// ---------------------------------------------------------------------------
// HTML escaping. Text/attribute escaping leaves an ampersand alone when it
// starts something shaped like an entity reference (&name;, &#123;, &#x1f;),
// exactly as marked does; code escaping is strict.
function looksLikeEntity(s, i) {
  // s[i] === '&'; true when a valid-looking reference follows. Numeric
  // references only count with at most 7 decimal or 6 hex digits (marked
  // escapes the '&' of a longer one, e.g. &#87654321; -> &amp;#87654321;).
  let j = i + 1;
  if (s[j] === '#') {
    j++;
    if (s[j] === 'x' || s[j] === 'X') {
      j++;
      const start = j;
      while (j < s.length && ((s[j] >= '0' && s[j] <= '9') || (s[j] >= 'a' && s[j] <= 'f') || (s[j] >= 'A' && s[j] <= 'F'))) j++;
      return j > start && j - start <= 6 && s[j] === ';';
    }
    const start = j;
    while (j < s.length && s[j] >= '0' && s[j] <= '9') j++;
    return j > start && j - start <= 7 && s[j] === ';';
  }
  const start = j;
  while (j < s.length && ((s[j] >= 'a' && s[j] <= 'z') || (s[j] >= 'A' && s[j] <= 'Z') ||
    (s[j] >= '0' && s[j] <= '9') || s[j] === '_')) j++;
  return j > start && s[j] === ';';
}
function escapeHtml(s) {
  let out = '';
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    let rep = null;
    if (c === '&') { if (!looksLikeEntity(s, i)) rep = '&amp;'; }
    else if (c === '<') rep = '&lt;';
    else if (c === '>') rep = '&gt;';
    else if (c === '"') rep = '&quot;';
    else if (c === "'") rep = '&#39;';
    if (rep !== null) {
      out += s.slice(start, i) + rep;
      start = i + 1;
    }
  }
  return start === 0 ? s : out + s.slice(start);
}
function escapeHtmlStrict(s) {
  let out = '';
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    let rep = null;
    if (c === '&') rep = '&amp;';
    else if (c === '<') rep = '&lt;';
    else if (c === '>') rep = '&gt;';
    else if (c === '"') rep = '&quot;';
    else if (c === "'") rep = '&#39;';
    if (rep !== null) {
      out += s.slice(start, i) + rep;
      start = i + 1;
    }
  }
  return start === 0 ? s : out + s.slice(start);
}

// Percent-encode a link destination the way marked does: keep the
// RFC 3986 unreserved / sub-delim / gen-delim characters and '%', encode
// everything else (including non-ASCII, as UTF-8).
function encodeHref(s) {
  let out = '';
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    let ok = false;
    if (code < 128) {
      const c = s[i];
      ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') ||
        c === '-' || c === '.' || c === '_' || c === '~' || c === ':' || c === '/' ||
        c === '?' || c === '#' || c === '@' || c === '!' || c === '$' || c === '&' ||
        c === "'" || c === '(' || c === ')' || c === '*' || c === '+' || c === ',' ||
        c === ';' || c === '=' || c === '%';
    }
    if (!ok) {
      if (start < i) out += s.slice(start, i);
      if (code < 128) {
        out += '%' + code.toString(16).toUpperCase().padStart(2, '0');
        start = i + 1;
      } else if (code >= 0xD800 && code <= 0xDBFF && i + 1 < s.length) {
        const lo = s.charCodeAt(i + 1);
        if (lo >= 0xDC00 && lo <= 0xDFFF) {
          const cp = 0x10000 + ((code - 0xD800) << 10) + (lo - 0xDC00);
          out += '%' + ((cp >> 18) | 0xF0).toString(16).toUpperCase() +
            '%' + (((cp >> 12) & 0x3F) | 0x80).toString(16).toUpperCase() +
            '%' + (((cp >> 6) & 0x3F) | 0x80).toString(16).toUpperCase() +
            '%' + ((cp & 0x3F) | 0x80).toString(16).toUpperCase();
          i++;
          start = i + 1;
        } else {
          out += '%EF%BF%BD';
          start = i + 1;
        }
      } else if (code >= 0xDC00 && code <= 0xDFFF) {
        out += '%EF%BF%BD';
        start = i + 1;
      } else if (code < 0x800) {
        out += '%' + ((code >> 6) | 0xC0).toString(16).toUpperCase() +
          '%' + ((code & 0x3F) | 0x80).toString(16).toUpperCase();
        start = i + 1;
      } else {
        out += '%' + ((code >> 12) | 0xE0).toString(16).toUpperCase() +
          '%' + (((code >> 6) & 0x3F) | 0x80).toString(16).toUpperCase() +
          '%' + ((code & 0x3F) | 0x80).toString(16).toUpperCase();
        start = i + 1;
      }
    }
  }
  return start === 0 ? s : out + s.slice(start);
}

// Decode one numeric entity reference at s[i] === '&'. Returns
// [decoded, endIndex] or null when this is not a valid numeric reference.
// Named references are not decoded (they pass through raw); a numeric
// reference needs 1-7 decimal digits or 1-6 hex digits, and 0, a
// surrogate, or a value above U+10FFFF becomes U+FFFD.
function decodeEntityAt(s, i) {
  if (s[i + 1] !== '#') return null;
  const semi = s.indexOf(';', i + 2);
  if (semi === -1 || semi - i > 10) return null;
  const body = s.slice(i + 2, semi);
  if (body.length === 0) return null;
  let cp;
  if (body[0] === 'x' || body[0] === 'X') {
    const hex = body.slice(1);
    if (hex.length < 1 || hex.length > 6) return null;
    if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
    cp = parseInt(hex, 16);
  } else {
    if (body.length < 1 || body.length > 7) return null;
    if (!/^[0-9]+$/.test(body)) return null;
    cp = parseInt(body, 10);
  }
  if (cp === 0 || cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF) || isNaN(cp)) cp = 0xFFFD;
  return [String.fromCodePoint(cp), semi + 1];
}

// Normalize a link label: collapse whitespace, trim, lowercase.
// Unicode case folding: ß/ẞ and the Latin ligatures fold to plain
// letters ("[ẞ]" matches "[SS]: /url").
function normalizeLabel(s) {
  let folded = s.replace(/\s+/g, ' ').trim().toLowerCase();
  folded = folded.replace(/ß/g, 'ss').replace(/ﬀ/g, 'ff').replace(/ﬁ/g, 'fi')
    .replace(/ﬂ/g, 'fl').replace(/ﬃ/g, 'ffi').replace(/ﬄ/g, 'ffl')
    .replace(/ﬅ/g, 'st').replace(/ﬆ/g, 'st');
  return folded;
}

// True when a label contains an unescaped '[' or ']': such a label is
// never a valid link label ("[ref[bar]]" is not a definition).
function labelHasBracket(s) {
  let i = 0;
  while (i < s.length) {
    if (s[i] === '\\' && i + 1 < s.length && isAsciiPunct(s[i + 1])) { i += 2; continue; }
    if (s[i] === '[' || s[i] === ']') return true;
    i++;
  }
  return false;
}

// A label is usable only when it has no unescaped brackets and does
// not normalize to empty ("[\n ]" is not a definition or reference).
function isValidLabel(raw) {
  if (labelHasBracket(raw)) return false;
  return normalizeLabel(raw) !== '';
}

// ---------------------------------------------------------------------------
// Inline parsing. Produces HTML for one paragraph / heading / table cell.
// The scanner builds a tree of nodes: text {t:'x'}, raw html {t:'h'} and
// emphasis elements {t:'e', tag, kids}. Delimiter runs are recorded while
// scanning and resolved afterwards by the stack algorithm. Returns
// { html, plain, hasLink }: plain is the text content with all formatting
// stripped (used for image alt text), hasLink says a [...] link was formed
// (used to enforce "links cannot nest").

function renderNodes(nodes) {
  let out = '';
  for (const nd of nodes) {
    const t = nd.t;
    // Text nodes are escaped strictly: any '&' in them is a literal
    // character (from a backslash escape or a decoded numeric reference)
    // and must become &amp;. A reference that looks like an entity is
    // never stored as text -- the scanner emits it as a raw node instead.
    if (t === 'x') out += escapeHtmlStrict(nd.s);
    else if (t === 'h') out += nd.s;
    else out += '<' + nd.tag + '>' + renderNodes(nd.kids) + '</' + nd.tag + '>';
  }
  return out;
}
function plainNodes(nodes) {
  let out = '';
  for (const nd of nodes) {
    const t = nd.t;
    if (t === 'x') out += nd.s;
    else if (t === 'h') out += nd.plain || '';
    else out += plainNodes(nd.kids);
  }
  return out;
}
function countRun(s, i, ch) {
  let j = i;
  while (j < s.length && s[j] === ch) j++;
  return j - i;
}
function countChar(s, ch) {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s[i] === ch) n++;
  return n;
}

// Scan a raw HTML tag starting at s[i] === '<'. Returns the tag text or null.
function scanHtmlTag(s, i) {
  let j = i + 1;
  if (s[j] === '!') {
    if (s.startsWith('<!--', i)) {
      // "<!-->" and "<!--->" are complete (empty) comments; they do
      // not run on to a later "-->". (j is the '!', so the '>' of
      // "<!-->" is at j+3 and of "<!--->" at j+4.)
      if (s[j + 3] === '>') return s.slice(i, j + 4);
      if (s[j + 3] === '-' && s[j + 4] === '>') return s.slice(i, j + 5);
      const k = s.indexOf('-->', j + 4);
      return k === -1 ? null : s.slice(i, k + 3);
    }
    if (s.startsWith('<![CDATA[', i)) {
      const k = s.indexOf(']]>', i + 9);
      return k === -1 ? null : s.slice(i, k + 3);
    }
    if (j + 1 < s.length && ((s[j + 1] >= 'A' && s[j + 1] <= 'Z') || (s[j + 1] >= 'a' && s[j + 1] <= 'z'))) {
      const k = s.indexOf('>', j + 1);
      return k === -1 ? null : s.slice(i, k + 1);
    }
    return null;
  }
  if (s[j] === '?') {
    const k = s.indexOf('?>', j + 1);
    return k === -1 ? null : s.slice(i, k + 2);
  }
  let k = j;
  let isClose = false;
  if (s[k] === '/') { isClose = true; k++; }
  if (k >= s.length || !((s[k] >= 'A' && s[k] <= 'Z') || (s[k] >= 'a' && s[k] <= 'z'))) return null;
  while (k < s.length && ((s[k] >= 'A' && s[k] <= 'Z') || (s[k] >= 'a' && s[k] <= 'z') ||
    (s[k] >= '0' && s[k] <= '9') || s[k] === '-')) k++;
  // A closing tag takes no attributes: only whitespace then '>'.
  if (isClose) {
    while (k < s.length && (s[k] === ' ' || s[k] === '\t' || s[k] === '\n' || s[k] === '\r' || s[k] === '\f')) k++;
    return s[k] === '>' ? s.slice(i, k + 1) : null;
  }
  // An attribute must follow whitespace ("<m:abc>" and
  // "<a href='bar'title=title>" are not tags).
  let sawWs = false;
  while (k < s.length) {
    const ch = s[k];
    if (ch === '>') return s.slice(i, k + 1);
    if (ch === '/' && s[k + 1] === '>') return s.slice(i, k + 2);
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f') { sawWs = true; k++; continue; }
    if (!sawWs) return null;
    // attribute name: [A-Za-z_:][A-Za-z0-9_.:-]*
    if (!((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_' || ch === ':')) return null;
    k++;
    while (k < s.length && ((s[k] >= 'A' && s[k] <= 'Z') || (s[k] >= 'a' && s[k] <= 'z') ||
      (s[k] >= '0' && s[k] <= '9') || s[k] === '_' || s[k] === ':' || s[k] === '.' || s[k] === '-')) k++;
    sawWs = false;
    let m = k;
    while (m < s.length && (s[m] === ' ' || s[m] === '\t' || s[m] === '\n' || s[m] === '\r' || s[m] === '\f')) m++;
    if (s[m] === '=') {
      m++;
      while (m < s.length && (s[m] === ' ' || s[m] === '\t' || s[m] === '\n' || s[m] === '\r' || s[m] === '\f')) m++;
      const q = s[m];
      if (q === '"' || q === "'") {
        const end = s.indexOf(q, m + 1);
        if (end === -1) return null;
        k = end + 1;
      } else {
        if (m >= s.length || s[m] === '>' || s[m] === ' ' || s[m] === '\t' || s[m] === '\n') return null;
        // An unquoted value may not contain " ' = < > or backtick.
        while (m < s.length && s[m] !== ' ' && s[m] !== '\t' && s[m] !== '\n' && s[m] !== '\r' && s[m] !== '\f' && s[m] !== '>') {
          if (s[m] === '"' || s[m] === "'" || s[m] === '=' || s[m] === '<' || s[m] === '`') return null;
          m++;
        }
        k = m;
      }
    } else {
      // A valueless attribute: the whitespace skipped while looking
      // for '=' still separates it from the next attribute.
      sawWs = m > k;
      k = m;
    }
  }
  return null;
}

// Scan an <...> autolink starting at s[i] === '<'. Returns [html, endIndex]
// or null. The link text is the raw inner text; the href is percent-encoded.
function scanAngleAutolink(s, i) {
  let j = i + 1;
  while (j < s.length && s[j] !== '>' && s[j] !== '<' && s[j] !== '\n' && s[j] !== ' ') j++;
  if (j >= s.length || s[j] !== '>') return null;
  const inner = s.slice(i + 1, j);
  const m = /^([A-Za-z][A-Za-z0-9+.-]{1,31}):/.exec(inner);
  if (m && inner.length > m[0].length) {
    return ['<a href="' + escapeHtml(encodeHref(inner)) + '">' + escapeHtml(inner) + '</a>', j + 1];
  }
  if (/^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(inner)) {
    return ['<a href="mailto:' + escapeHtml(encodeHref(inner)) + '">' + escapeHtml(inner) + '</a>', j + 1];
  }
  return null;
}

// Find the index of the ']' matching the '[' at s[start]. Skips code spans
// and escaped brackets. Returns { closeIdx, bracketFail }: closeIdx is the
// ']' index (-1 when there is none), and bracketFail is true when a code
// span in the text contains a backtick and is not immediately followed by
// the closing ']' ("[a ``b`c`` d][x]" is not a link, while
// "[a ``b`c``][x]" is). When the rule fires, the scan continues to the
// ']' so the caller still learns where the attempted text ends.
function findMatchingBracketInfo(s, start) {
  let depth = 0;
  let bracketFail = false;
  let i = start + 1;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length && isAsciiPunct(s[i + 1])) { i += 2; continue; }
    if (c === '`') {
      const runLen = countRun(s, i, '`');
      let j = i + runLen;
      let found = -1;
      let hasInnerBacktick = false;
      let hasBracket = false;
      let localDepth = depth;
      // A code span's closing run must be on the same line as its
      // opener: a run on a later line belongs to a different span, so
      // a ']' before it still closes the link text ("[docs each
      // ``url`](...)" with "`` a ` b ``" on the next line is a link).
      while (j < s.length && s[j] !== '\n') {
        const cj = s[j];
        if (cj === '\\' && j + 1 < s.length && isAsciiPunct(s[j + 1])) { j += 2; continue; }
        if (cj === '[') { localDepth++; j++; continue; }
        if (cj === ']') {
          if (localDepth === 0) hasBracket = true;
          else localDepth--;
          j++; continue;
        }
        if (cj === '`') {
          const r2 = countRun(s, j, '`');
          if (r2 === runLen) { found = j; break; }
          hasInnerBacktick = true;
          j += r2;
        } else j++;
      }
      // A code span whose content contains a backtick (a run of a
      // different length inside it) must be immediately followed by
      // the closing ']' for the bracket to count ("[a ``b`c`` d][x]"
      // is not a link, while "[a ``b`c``][x]" is). But when the
      // content also holds the ']' that would close the bracket
      // text, the span is unclosed inside the text instead: the
      // ']' closes the text and the link may still form ("[docs
      // each ``url`](...)" with "`` a ` b ``" later on the same
      // line is a link). A run with no closing run of its own
      // length may still close as a shorter run: the first
      // backtick of "``small`" pairs with the single backtick
      // after "small", so "[issue read two ``small`](...)" is a
      // link, while "[not a `link](/foo`)" is not (its single
      // backtick pairs with the one after "/foo", swallowing the
      // ']').
      if (found !== -1 && hasInnerBacktick && s[found + runLen] !== ']') {
        if (hasBracket) { i += runLen; continue; }
        bracketFail = true;
        i = found + runLen;
        continue;
      }
      if (found === -1 && runLen > 1) {
        // No closing run of this length on the line: try a shorter
        // run (a prefix of this one) for a closer.
        let shortFound = -1;
        let shortLen = 0;
        for (let k = runLen - 1; k >= 1; k--) {
          let m = i + runLen;
          while (m < s.length && s[m] !== '\n') {
            if (s[m] === '\\' && m + 1 < s.length && isAsciiPunct(s[m + 1])) { m += 2; continue; }
            if (s[m] === '`') {
              const r3 = countRun(s, m, '`');
              if (r3 === k) { shortFound = m; shortLen = k; break; }
              m += r3;
            } else m++;
          }
          if (shortFound !== -1) break;
        }
        if (shortFound !== -1) { i = shortFound + shortLen; continue; }
      }
      i = found === -1 ? i + runLen : found + runLen;
      continue;
    }
    // An autolink or HTML tag can swallow the ']' that would close
    // the link text ("[foo<https://x/?a=](uri)>" is an autolink, not
    // a link; "[foo <bar attr="](baz)>" is one tag, not a link).
    if (c === '<') {
      const auto = scanAngleAutolink(s, i);
      if (auto) { i = auto[1]; continue; }
      const tag = scanHtmlTag(s, i);
      if (tag) { i += tag.length; continue; }
    }
    if (c === '[') depth++;
    else if (c === ']') { if (depth === 0) return { closeIdx: i, bracketFail }; depth--; }
    i++;
  }
  return { closeIdx: -1, bracketFail };
}

// The plain form, for callers that only need the bracket (a failed
// bracket rule means no matching bracket for them).
function findMatchingBracket(s, start) {
  const info = findMatchingBracketInfo(s, start);
  return info.bracketFail ? -1 : info.closeIdx;
}

// Whether the link text contains a backtick run with no closing run of
// the same length later on the same line (an unclosed code span).
function textHasUnclosedBacktick(text) {
  let i = 0;
  while (i < text.length) {
    if (text[i] === '\\' && i + 1 < text.length && isAsciiPunct(text[i + 1])) { i += 2; continue; }
    if (text[i] === '`') {
      const runLen = countRun(text, i, '`');
      let j = i + runLen;
      let found = false;
      while (j < text.length && text[j] !== '\n') {
        if (text[j] === '`') {
          const r2 = countRun(text, j, '`');
          if (r2 === runLen) { found = true; break; }
          j += r2;
        } else j++;
      }
      if (!found) return true;
      i = j + runLen;
      continue;
    }
    i++;
  }
  return false;
}

// Whether the text holds an unescaped '[' outside a code span (a
// nested bracket). A failed inline link whose text holds one does not
// suppress the emphasis inside it ("[a _x_ [b]](...)" and
// "[a _x_ [b](...)](/uri)" keep the em, while "[a _x_](...)" with a
// bad tail does not; a '[' inside a code span or an escaped one does
// not count).
function textHasRealBracket(text) {
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '\\' && i + 1 < text.length && isAsciiPunct(text[i + 1])) { i += 2; continue; }
    if (c === '`') {
      const runLen = countRun(text, i, '`');
      let j = i + runLen;
      let found = -1;
      while (j < text.length && text[j] !== '\n') {
        if (text[j] === '`') {
          const r2 = countRun(text, j, '`');
          if (r2 === runLen) { found = j; break; }
          j += r2;
        } else j++;
      }
      i = found === -1 ? i + runLen : found + runLen;
      continue;
    }
    if (c === '[') return true;
    i++;
  }
  return false;
}

// The start index of the last run of backticks in s at or after
// `from` (-1 when there is none). Escaped backticks count: the span
// an unclosed run would have closed ends at the last backtick in the
// text, escaped or not.
function lastBacktickRunStart(s, from) {
  let k = s.length - 1;
  while (k >= from) {
    if (s[k] === '`') {
      let start = k;
      while (start > from && s[start - 1] === '`') start--;
      return start;
    }
    k--;
  }
  return -1;
}

// Whether the text at s[i] === '(' holds a complete parenthesised tail
// (a ')' that balances the '('), ignoring ')' inside quotes and
// escapes. A link whose tail is complete but invalid still counts as
// an attempted inline link; one with no closing ')' does not.
function hasCompleteInlineTail(s, i) {
  let depth = 1;
  let j = i + 1;
  while (j < s.length) {
    const ch = s[j];
    if (ch === '\\' && j + 1 < s.length && isAsciiPunct(s[j + 1])) { j += 2; continue; }
    if (ch === '"' || ch === "'") {
      const q = ch;
      let k = j + 1;
      while (k < s.length && s[k] !== q) {
        if (s[k] === '\\' && k + 1 < s.length && isAsciiPunct(s[k + 1])) k += 2;
        else k++;
      }
      // An unclosed quote does not hide the ')' that closes the tail.
      if (k >= s.length) { j++; continue; }
      j = k + 1;
      continue;
    }
    if (ch === '(') { depth++; j++; continue; }
    if (ch === ')') { depth--; if (depth === 0) return true; j++; continue; }
    j++;
  }
  return false;
}

// Parse the destination/title tail of an inline link, starting at s[i] === '('.
// Returns { dest, title, end } or null.
function parseInlineLinkTail(s, i) {
  let j = i + 1;
  while (j < s.length && (s[j] === ' ' || s[j] === '\t' || s[j] === '\n')) j++;
  let dest = '';
  if (s[j] === '<') {
    // An angle destination ends at the first UNESCAPED '>'.
    // "\>" is a literal '>' inside the destination, "\\" a literal
    // backslash; a bare '<' or a newline inside is not allowed.
    let k = j + 1;
    let inner = '';
    let closed = false;
    while (k < s.length) {
      const ch = s[k];
      if (ch === '\\' && k + 1 < s.length && isAsciiPunct(s[k + 1])) {
        inner += s[k + 1];
        k += 2;
        continue;
      }
      if (ch === '>') { closed = true; break; }
      if (ch === '<' || ch === '\n') return null;
      inner += ch;
      k++;
    }
    if (!closed) return null;
    dest = inner;
    j = k + 1;
  } else {
    let depth = 0;
    while (j < s.length) {
      const ch = s[j];
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v') break;
      if (ch === '\\' && j + 1 < s.length && isAsciiPunct(s[j + 1])) { dest += s[j + 1]; j += 2; continue; }
      if (ch === '(') { depth++; dest += ch; j++; continue; }
      if (ch === ')') {
        if (depth === 0) break;
        depth--; dest += ch; j++; continue;
      }
      if (ch.charCodeAt(0) < 32) return null;
      dest += ch; j++;
    }
    if (j >= s.length) return null;
  }
  while (j < s.length && (s[j] === ' ' || s[j] === '\t' || s[j] === '\n')) j++;
  let title = null;
  if (s[j] === ')') return { dest, title, end: j + 1 };
  if (s[j] === '"' || s[j] === "'") {
    const q = s[j];
    let k = j + 1;
    let t = '';
    while (k < s.length) {
      if (s[k] === '\\' && k + 1 < s.length && isAsciiPunct(s[k + 1])) { t += s[k + 1]; k += 2; continue; }
      if (s[k] === q) break;
      t += s[k]; k++;
    }
    if (k >= s.length) return null;
    title = t;
    j = k + 1;
  } else if (s[j] === '(') {
    let k = j + 1;
    let depth = 1;
    let t = '';
    while (k < s.length) {
      if (s[k] === '\\' && k + 1 < s.length && isAsciiPunct(s[k + 1])) { t += s[k + 1]; k += 2; continue; }
      if (s[k] === '(') depth++;
      else if (s[k] === ')') { depth--; if (depth === 0) break; }
      t += s[k]; k++;
    }
    if (k >= s.length || depth !== 0) return null;
    title = t;
    j = k + 1;
  } else {
    return null;
  }
  while (j < s.length && (s[j] === ' ' || s[j] === '\t' || s[j] === '\n')) j++;
  if (s[j] !== ')') return null;
  return { dest, title, end: j + 1 };
}

// ---------------------------------------------------------------------------
// GFM extended autolinks. A candidate is the run of characters up to
// whitespace or '<'. Trailing punctuation is stripped, then closing
// parentheses are balanced, then a run is cut at an unmatched '('.
const GFM_TRAIL_PUNCT = new Set(['?', '!', '.', ',', ':', ';', '*', '_', '~', "'", '"']);
const EMAIL_LOCAL_RE = /[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]/;
// The character before an email start: an email-local character other
// than a delimiter (* _ ~), which the scanner consumes first, so an
// address right after an emphasis marker still links ("*a@b.c*").
const EMAIL_PREV_RE = /[A-Za-z0-9.!#$%&'+\/=?^`{|}-]/;
// Domain labels end in an alphanumeric but may start with, and
// contain, '_' or '-' ("a@b.c_d", "a@b._c.d" link; "a@b.c_" does not).
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9_-]*[A-Za-z0-9](?:\.[A-Za-z0-9_-]*[A-Za-z0-9])+/;
function scanGfmCandidate(s, i) {
  let j = i;
  while (j < s.length) {
    const c = s[j];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v' || c === '<') break;
    j++;
  }
  return s.slice(i, j);
}
function trimGfmUrl(url) {
  // A trailing entity reference (&word;) is not part of the URL.
  const ent = /&[A-Za-z0-9_]+;$/.exec(url);
  if (ent) url = url.slice(0, url.length - ent[0].length);
  // Repeat until stable: cut at an unmatched '(', balance a trailing
  // ')', then strip trailing punctuation. The order matters: the
  // punctuation strip must see the ')' balance first, and the '(' cut
  // must see the punctuation ("www.echo.com!.)" -> "www.echo.com",
  // "https://example.com/foo_(bar." -> "https://example.com/foo").
  let prev;
  do {
    prev = url;
    for (let k = 0; k < url.length; k++) {
      if (url[k] === '(' && url.indexOf(')', k + 1) === -1) { url = url.slice(0, k); break; }
    }
    let opens = countChar(url, '(');
    let closes = countChar(url, ')');
    while (url.length > 0 && url[url.length - 1] === ')' &&
      (closes > opens || (closes === opens && url.length > 1 && url[url.length - 2] === ')'))) {
      // A trailing ')' is only stripped when it is unmatched: one
      // that closes an earlier '(' stays ("https://img.shields.io?q=1&page=2)](./docs/create.md)"
      // keeps its final ')', because it matches the '(' of
      // "(./docs/create.md)", and "https://example.com/a)b(c)"
      // keeps its own). The equal-counts case still strips, as
      // before ("https://example.com/((x))" -> "https://example.com/((x)").
      if (closes > opens) {
        let depth = 0;
        for (let k = 0; k < url.length - 1; k++) {
          if (url[k] === '(') depth++;
          else if (url[k] === ')') { if (depth > 0) depth--; }
        }
        if (depth > 0) break;
      }
      url = url.slice(0, -1);
      closes--;
    }
    let end = url.length;
    while (end > 0 && GFM_TRAIL_PUNCT.has(url[end - 1])) end--;
    url = url.slice(0, end);
  } while (url !== prev);
  return url;
}
function wwwPrecededOk(s, i) {
  if (i === 0) return true;
  const p = s[i - 1];
  return p === ' ' || p === '\t' || p === '\n' || p === '\r' || p === '\f' || p === '\v' ||
    p === '(' || p === '[' || p === '*' || p === '_' || p === '~' || p === '\\';
}

function inlineParse(s, refs, inLink, state) {
  const nodes = [];
  const delims = [];
  let hasLink = false;
  let delimSeq = 0;
  // Emphasis suppression from link/code-span interaction (marked
  // masks a code span's extent when it meets a link):
  // - suppressEnd: an index in s; '*'/'_'/'~' runs before it make no
  //   delimiter. A failed inline link attempt leaves the emphasis
  //   inside its attempted text literal (suppressEnd is the text's
  //   closing ']'); a link whose text holds an unclosed backtick run
  //   suppresses emphasis up to the last backtick run after the link
  //   (the span the unclosed run would have closed).
  let suppressEnd = -1;

  // Whether the character after an email match ends the address. A
  // trailing '-' always invalidates it; a trailing '_' does too,
  // unless it closes an open '_' emphasis delimiter (the address sits
  // inside _..._ or __...__).
  function emailTrailOk(cand, len) {
    const nx = cand[len];
    if (nx !== '-' && nx !== '_') return true;
    if (nx === '-') return false;
    for (const d of delims) {
      if (d.ch === '_' && d.canOpen) return true;
    }
    return false;
  }

  function pushText(str) {
    if (!str) return;
    const last = nodes[nodes.length - 1];
    if (last && last.t === 'x') last.s += str;
    else nodes.push({ t: 'x', s: str });
  }
  function pushHtml(str, plain) { nodes.push({ t: 'h', s: str, plain: plain === undefined ? '' : plain }); }
  function pushDelim(ch, len, canOpen, canClose) {
    const last = nodes[nodes.length - 1];
    delims.push({ ch, len, canOpen, canClose, node: last, off: last.s.length - len, seq: delimSeq++ });
  }
  function splitTextNode(node, pos) {
    const idx = nodes.indexOf(node);
    const after = { t: 'x', s: node.s.slice(pos) };
    node.s = node.s.slice(0, pos);
    nodes.splice(idx + 1, 0, after);
    for (const d of delims) {
      if (d.node === node && d.off >= pos) { d.node = after; d.off -= pos; }
    }
    return after;
  }

  // Try to form a link/image whose text ends at closeIdx (the ']').
  // Returns the node html and the index to continue from, or null.
  function tryLink(start, closeIdx, isImage) {
    const textSpan = s.slice(start + 1, closeIdx);
    const pos = closeIdx + 1;
    // Build the inner rendering lazily: only parse the text span when a
    // destination is actually found.
    function build(dest, title, end) {
      // An '<a>' tag inside link text must not leak the document
      // in-link flag: save and restore it around the recursion.
      const saved = state ? state.inLink : false;
      const inner = inlineParse(textSpan, refs, true, state);
      if (state) state.inLink = saved;
      if (!isImage && inner.hasLink) return null;
      const href = escapeHtml(encodeHref(dest));
      const titleAttr = title !== null ? ' title="' + escapeHtml(title) + '"' : '';
      if (isImage) {
        const alt = escapeHtmlStrict(inner.plain);
        return { html: '<img src="' + href + '" alt="' + alt + '"' + titleAttr + '>', end, isLink: false, plain: inner.plain };
      }
      return { html: '<a href="' + href + '"' + titleAttr + '>' + inner.html + '</a>', end, isLink: true, plain: inner.plain };
    }
    if (s[pos] === '(') {
      const tail = parseInlineLinkTail(s, pos);
      if (tail) {
        const built = build(tail.dest, tail.title, tail.end);
        if (built) return built;
      }
      // A failed inline link falls through to the shortcut reference.
    } else if (s[pos] === '[') {
      const labelEnd = findMatchingBracket(s, pos);
      if (labelEnd !== -1) {
        const rawLabel = s.slice(pos + 1, labelEnd);
        const label = rawLabel === '' ? textSpan : rawLabel;
        if (label.length <= 999 && isValidLabel(label)) {
          const def = refs[normalizeLabel(label)];
          if (def) {
            const built = build(def.dest, def.title, labelEnd + 1);
            if (built) return built;
          }
        }
      }
      return null;
    }
    if (textSpan.length <= 999 && isValidLabel(textSpan)) {
      const def = refs[normalizeLabel(textSpan)];
      if (def) {
        const built = build(def.dest, def.title, pos);
        if (built) return built;
      }
    }
    return null;
  }

  const n = s.length;
  let i = 0;
  while (i < n) {
    const c = s[i];
    if (c === '\\') {
      const nxt = s[i + 1];
      if (nxt === '\n') {
        pushHtml('<br>');
        i += 2;
        while (i < n && (s[i] === ' ' || s[i] === '\t')) i++;
        continue;
      }
      if (nxt !== undefined && isAsciiPunct(nxt)) { pushText(nxt); i += 2; continue; }
      pushText('\\');
      i++;
      continue;
    }
    if (c === '`') {
      const runLen = countRun(s, i, '`');
      let j = i + runLen;
      let found = -1;
      while (j < n) {
        if (s[j] === '`') {
          const r2 = countRun(s, j, '`');
          if (r2 === runLen) { found = j; break; }
          j += r2;
        } else j++;
      }
      if (found === -1) { pushText(s.slice(i, i + runLen)); i += runLen; continue; }
      let content = s.slice(i + runLen, found).replace(/\n/g, ' ');
      if (content.length >= 2 && content[0] === ' ' && content[content.length - 1] === ' ' && content.trim() !== '') {
        content = content.slice(1, -1);
      }
      pushHtml('<code>' + escapeHtmlStrict(content) + '</code>', content);
      i = found + runLen;
      continue;
    }
    if (c === '*' || c === '_' || c === '~') {
      const runLen = countRun(s, i, c);
      // Suppressed emphasis (a failed inline link's text, or the
      // stretch after a link whose text holds an unclosed backtick
      // run, up to the last backtick run after the link) stays
      // literal text: no delimiter is created.
      if (i < suppressEnd) {
        pushText(s.slice(i, i + runLen));
        i += runLen;
        continue;
      }
      const before = i > 0 ? s[i - 1] : '';
      const after = i + runLen < n ? s[i + runLen] : '';
      // The start and end of the string count as whitespace for the
      // flanking rules (a delimiter next to punctuation still closes at
      // the end of a line, and still opens at the start of one).
      const beforeSpace = before === '' || isSpaceChar(before);
      const afterSpace = after === '' || isSpaceChar(after);
      const beforePunct = before !== '' && isPunctChar(before);
      const afterPunct = after !== '' && isPunctChar(after);
      const leftFlank = !afterSpace && (!afterPunct || beforeSpace || beforePunct);
      const rightFlank = !beforeSpace && (!beforePunct || afterSpace || afterPunct);
      let canOpen, canClose;
      if (c === '~') {
        canOpen = leftFlank && runLen <= 2;
        canClose = rightFlank && runLen <= 2;
      } else if (c === '*') {
        canOpen = leftFlank;
        canClose = rightFlank;
      } else {
        canOpen = leftFlank && (!rightFlank || isPunctChar(before));
        canClose = rightFlank && (!leftFlank || isPunctChar(after));
      }
      pushText(s.slice(i, i + runLen));
      if (!(c === '~' && runLen > 2)) pushDelim(c, runLen, canOpen, canClose);
      i += runLen;
      continue;
    }
    if (c === '&') {
      const dec = decodeEntityAt(s, i);
      if (dec) { pushText(dec[0]); i = dec[1]; continue; }
      // A named reference (&word;) is passed through raw, never decoded
      // and never escaped. Anything else leaves a literal '&', which the
      // strict text escaper turns into &amp;.
      let j = i + 1;
      const start = j;
      while (j < n && ((s[j] >= 'a' && s[j] <= 'z') || (s[j] >= 'A' && s[j] <= 'Z') ||
        (s[j] >= '0' && s[j] <= '9') || s[j] === '_')) j++;
      if (j > start && s[j] === ';') {
        const raw = s.slice(i, j + 1);
        pushHtml(raw, raw);
        i = j + 1;
        continue;
      }
      pushText('&');
      i++;
      continue;
    }
    if (c === '<') {
      const tag = scanHtmlTag(s, i);
      if (tag !== null) {
        pushHtml(tag);
        // A document-level in-link flag: an inline '<a ...>' open
        // tag suppresses later GFM extended autolinks until an
        // inline '</a>' closes it. Only an '<a' followed by a
        // literal space sets it ('<a>', '<a/>', '<a\n...' do not).
        if (state) {
          if (/^<a /i.test(tag)) state.inLink = true;
          else if (/^<\/a[\s>]/i.test(tag)) state.inLink = false;
        }
        i += tag.length;
        continue;
      }
      const auto = scanAngleAutolink(s, i);
      if (auto) {
        pushHtml(auto[0], s.slice(i + 1, auto[1] - 1));
        i = auto[1];
        continue;
      }
      pushText('<');
      i++;
      continue;
    }
    if (c === '\n') {
      // Hard break: two or more spaces before the newline.
      let k = i - 1;
      let spaces = 0;
      while (k >= 0 && s[k] === ' ') { spaces++; k--; }
      if (spaces >= 2) {
        const last = nodes[nodes.length - 1];
        if (last && last.t === 'x') last.s = last.s.slice(0, last.s.length - spaces);
        pushHtml('<br>');
        i++;
        while (i < n && (s[i] === ' ' || s[i] === '\t')) i++;
        continue;
      }
      pushText('\n');
      i++;
      continue;
    }
    if (c === '[' || (c === '!' && s[i + 1] === '[')) {
      const isImage = c === '!';
      const start = isImage ? i + 1 : i;
      const info = findMatchingBracketInfo(s, start);
      const closeIdx = info.closeIdx;
      if (closeIdx !== -1 && !info.bracketFail) {
        const res = tryLink(start, closeIdx, isImage);
        if (res) {
          pushHtml(res.html, res.plain);
          if (res.isLink) hasLink = true;
          // A link whose text holds an unclosed backtick run
          // suppresses emphasis after it up to the last backtick
          // run after the link (the span the unclosed run would
          // have closed); with no backtick after the link there is
          // no suppression ("[docs each ``url`](...)" leaves a
          // following "_issue table_" literal until "`` a ` b ``",
          // but not when no backtick follows).
          if (textHasUnclosedBacktick(s.slice(start + 1, closeIdx))) {
            const lastBt = lastBacktickRunStart(s, res.end);
            if (lastBt !== -1 && lastBt > suppressEnd) suppressEnd = lastBt;
          }
          i = res.end;
          continue;
        }
        // A failed inline link attempt (a complete "(...)" tail
        // follows but the destination, title or angle is bad)
        // leaves the emphasis inside its attempted text literal --
        // unless the text holds a nested bracket ("[a _x_](bad
        // dest)" keeps "_x_" literal, while "[a _x_ [b]](bad
        // dest)" and "[foo *[bar [baz](/uri)](/uri)*](/uri)" keep
        // the emphasis).
        if (s[closeIdx + 1] === '(' && hasCompleteInlineTail(s, closeIdx + 1) &&
          !textHasRealBracket(s.slice(start + 1, closeIdx))) {
          if (closeIdx > suppressEnd) suppressEnd = closeIdx;
        }
      } else if (closeIdx !== -1) {
        // The bracket rule failed (a code span in the text holds a
        // backtick and is not followed by ']'): the same failed
        // inline link attempt suppresses the emphasis inside the
        // attempted text, again unless the text holds a nested
        // bracket.
        if (s[closeIdx + 1] === '(' && hasCompleteInlineTail(s, closeIdx + 1) &&
          !textHasRealBracket(s.slice(start + 1, closeIdx))) {
          if (closeIdx > suppressEnd) suppressEnd = closeIdx;
        }
      }
      pushText(c);
      i++;
      continue;
    }
    if (!inLink && !(state && state.inLink)) {
      // GFM extended autolinks: www., scheme, mailto:, email.
      if (c === 'm' && s.startsWith('mailto:', i)) {
        const cand = scanGfmCandidate(s, i + 7);
        const m = EMAIL_RE.exec(cand);
        if (m && emailTrailOk(cand, m[0].length)) {
          const email = m[0];
          pushHtml('<a href="mailto:' + escapeHtml(encodeHref(email)) + '">' + escapeHtml('mailto:' + email) + '</a>', 'mailto:' + email);
          i += 7 + email.length;
          continue;
        }
      }
      if (c === 'x' && s.slice(i, i + 5).toLowerCase() === 'xmpp:') {
        // xmpp: is the one other scheme that takes an email-like
        // address (like mailto:), with at most one path segment:
        // "xmpp:foo@bar.baz/txt/bin" links only up to "/txt".
        const cand = scanGfmCandidate(s, i + 5);
        const m = EMAIL_RE.exec(cand);
        if (m && emailTrailOk(cand, m[0].length)) {
          let url = 'xmpp:' + m[0];
          const rest = cand.slice(m[0].length);
          if (rest.startsWith('/')) {
            let segEnd = 1;
            while (segEnd < rest.length && rest[segEnd] !== '/' && rest[segEnd] !== ' ' &&
              rest[segEnd] !== '\t' && rest[segEnd] !== '\n' && rest[segEnd] !== '<') segEnd++;
            const seg = trimGfmUrl(rest.slice(0, segEnd));
            if (seg.length > 1) url += seg;
          }
          url = trimGfmUrl(url);
          if (url.length > 5) {
            pushHtml('<a href="' + escapeHtml(encodeHref(url)) + '">' + escapeHtml(url) + '</a>', url);
            i += url.length;
            continue;
          }
        }
      }
      if (c === 'w' && s.startsWith('www.', i) && wwwPrecededOk(s, i)) {
        const url = trimGfmUrl(scanGfmCandidate(s, i));
        if (url.length > 4) {
          pushHtml('<a href="http://' + escapeHtml(encodeHref(url)) + '">' + escapeHtml(url) + '</a>', url);
          i += url.length;
          continue;
        }
      }
      if (c === 'h' || c === 'H' || c === 'f' || c === 'F') {
        const low = s.slice(i, i + 8).toLowerCase();
        let schemeLen = 0;
        if (low.startsWith('http://')) schemeLen = 7;
        else if (low.startsWith('https://')) schemeLen = 8;
        else if (low.startsWith('ftp://')) schemeLen = 6;
        if (schemeLen > 0) {
          const url = trimGfmUrl(scanGfmCandidate(s, i));
          if (url.length > schemeLen) {
            pushHtml('<a href="' + escapeHtml(encodeHref(url)) + '">' + escapeHtml(url) + '</a>', url);
            i += url.length;
            continue;
          }
        }
      }
      if (EMAIL_LOCAL_RE.test(c) && (i === 0 || !EMAIL_PREV_RE.test(s[i - 1]))) {
        const cand = scanGfmCandidate(s, i);
        const m = EMAIL_RE.exec(cand);
        // The address is used raw (not trimmed): a trailing '-' or '_'
        // means the domain label is invalid, so no link forms at all
        // ("a.b@a.b-" and "a.b@a.b_" stay literal), while trailing
        // punctuation such as '.' is simply left outside the link.
        // A trailing '_' that closes an open '_' emphasis run is the
        // one exception (see emailTrailOk).
        if (m && emailTrailOk(cand, m[0].length)) {
          const email = m[0];
          pushHtml('<a href="mailto:' + escapeHtml(encodeHref(email)) + '">' + escapeHtml(email) + '</a>', email);
          i += email.length;
          continue;
        }
      }
    }
    pushText(c);
    i++;
  }

  // Resolve emphasis / strong / strikethrough with the delimiter stack.
  // openerFromStart: the opener consumes the FIRST `use` chars of its
  // run (the excess stays inside the emphasis) instead of the last
  // (the excess stays outside). Used for matches allowed only by the
  // closer-length escape (see the openers_bottom rule below), where
  // marked takes the outermost delimiters of both runs.
  function makeEmphasis(opener, closer, use, openerFromStart) {
    const tag = opener.ch === '~' ? 'del' : (use === 2 ? 'strong' : 'em');
    const closerAfter = splitTextNode(closer.node, closer.off);
    const openerAfter = splitTextNode(opener.node, openerFromStart ? opener.off : opener.off + opener.len - use);
    openerAfter.s = openerAfter.s.slice(use);
    closerAfter.s = closerAfter.s.slice(use);
    for (const d of delims) {
      if (d.node === closerAfter && d.off > 0) d.off -= use;
    }
    if (openerFromStart) {
      for (const d of delims) {
        if (d.node === openerAfter && d.off > 0) d.off -= use;
      }
    }
    const oi = nodes.indexOf(openerAfter);
    const ci = nodes.indexOf(closerAfter);
    const kids = nodes.slice(oi, ci);
    const el = { t: 'e', tag, kids };
    nodes.splice(oi, ci - oi, el);
    const oIdx = delims.indexOf(opener);
    const cIdx = delims.indexOf(closer);
    delims.splice(oIdx + 1, cIdx - oIdx - 1);
    opener.len -= use;
    closer.len -= use;
    if (opener.len === 0) delims.splice(delims.indexOf(opener), 1);
    if (closer.len === 0) delims.splice(delims.indexOf(closer), 1);
  }

  let di = 0;
  // openers_bottom: when a closer that can also open is used in a
  // match, later closers of the same character may not use an opener
  // strictly before the matched opener ("*x **y**z*" leaves the outer
  // '*' literal, while "*x **y** z*" still forms it). The bottom is
  // the matched opener's sequence number, and it is only set when
  // that opener was not itself a failed closer ("*foo**bar**baz*"
  // still forms the outer em, and "**foo*bar*baz**" the outer
  // strong). The bottom has a flavour: set by an em match it blocks
  // everything except a match that fully consumes a one-character
  // opener ("*uses state *callback*markdown**" still forms the outer
  // em, while "**a *b*c**" leaves both '**' literal); set by a
  // strong match it blocks everything except a strong match
  // ("**line **same**private**" forms the outer strong, while
  // "*a **b**c**" does not form the outer em). Either flavour is
  // escaped when the closer run has at least 3 delimiters
  // ("**return that *old*two***" and "*a **b**c***" both form, while
  // "**a *b*c**" and "*a **b**c**" do not); a match allowed only by
  // that escape consumes the outermost delimiters of both runs, so
  // the excess stays inside ("***a *b*c***" ->
  // "<em>**a <em>b</em>c**</em>"). It is only set when
  // the closer run is fully consumed: the remainder of a partly used
  // run ("*then is **next type when (x)***.") may still match an
  // opener before it. A closer that fails after an odd-match skip clears the
  // bottom ("*a **b**c** d*" closes at the last '*').
  const openersBottom = { '*': -1, '_': -1, '~': -1 };
  const bottomStrong = { '*': false, '_': false, '~': false };
  // Whether any delimiter was marked failed as a closer (used by the
  // closer-consumption rule below), whether the closer of the
  // most recent emphasis match could open, and that match's use (1
  // for em, 2 for strong).
  let sawFailed = false;
  let lastCloserCanOpen = false;
  let lastMatchUse = 0;
  while (di < delims.length) {
    const closer = delims[di];
    if (!closer.canClose) { di++; continue; }
    let opener = null;
    let skippedOdd = false;
    let viaExcess = false;
    for (let j = di - 1; j >= 0; j--) {
      const cand = delims[j];
      if (cand.ch !== closer.ch || !cand.canOpen) continue;
      // A failed opener is skipped when the closer has the same
      // length, cannot open, and is the last delimiter ("*foo**bar**"
      // closes at the last '*', forming the em, instead of the
      // strong); otherwise the failed opener is still usable
      // ("*a**b**c" forms the strong, and "*foo**bar***" uses the
      // failed opener for the strong).
      if (cand.failed && closer.len === cand.len && !closer.canOpen && di === delims.length - 1) continue;
      if (closer.ch === '~' && cand.len !== closer.len) continue;
      // The odd-match rule: if ONE of the two delimiters can both
      // open and close, and the sum of their lengths is a multiple
      // of 3, they cannot match unless both lengths are multiples
      // of 3. ("*foo**bar*" leaves the ** literal for this reason.)
      const eitherBoth = (cand.canOpen && cand.canClose) || (closer.canOpen && closer.canClose);
      const sum3 = ((cand.len + closer.len) % 3 === 0) &&
        !((cand.len % 3 === 0) && (closer.len % 3 === 0));
      if (eitherBoth && sum3) { skippedOdd = true; continue; }
      // openers_bottom: an opener strictly before the bottom cannot
      // be used -- unless the bottom was set by a strong match and
      // this match would be a strong (both lengths >= 2), or the
      // bottom was set by an em match and this match would fully
      // consume a one-character opener; or the closer run has at
      // least 3 delimiters, which escapes either flavour; or the
      // lengths sum to a multiple of 3, which clears the bottom
      // instead.
      const primaryAllows = bottomStrong[closer.ch]
        ? (cand.len >= 2 && closer.len >= 2)
        : cand.len === 1;
      const escapeAllows = closer.len >= 3;
      if (cand.seq < openersBottom[closer.ch] && !primaryAllows && !escapeAllows) {
        if (sum3) { openersBottom[closer.ch] = -1; bottomStrong[closer.ch] = false; continue; }
        break;
      }
      if (cand.seq < openersBottom[closer.ch] && !primaryAllows) viaExcess = true;
      opener = cand;
      break;
    }
    if (!opener) {
      // A closer that could open but found none after skipping an
      // opener for the odd-match rule is a failed closer (so a later
      // match with it as opener does not set the bottom), and it
      // clears the bottom.
      if (closer.canOpen && skippedOdd) {
        closer.failed = true;
        sawFailed = true;
        openersBottom[closer.ch] = -1;
        bottomStrong[closer.ch] = false;
      }
      di++;
      continue;
    }
    const use = (opener.len >= 2 && closer.len >= 2) ? 2 : 1;
    // The bottom is set on any match whose closer can open and is
    // fully consumed by the match -- an em match sets the em-flavoured
    // bottom, a strong match the strong-flavoured one. A partly used
    // closer run sets no bottom: its remainder may still match an
    // opener before the matched one.
    if (closer.canOpen && !opener.failed && closer.len === use) {
      openersBottom[closer.ch] = opener.seq;
      bottomStrong[closer.ch] = use === 2;
    }
    // Closer consumption: a closer normally consumes from the start
    // of its run (the excess stays outside: "*ab**" -> "<em>ab</em>*",
    // "**foo***" -> "<strong>foo</strong>*"). It consumes from the
    // end (the excess stays inside the emphasis) when no other
    // opener remains for that excess to pair with and either the
    // match was allowed only by the closer-length escape (which
    // also takes the opener from the start of its run, so the
    // opener's excess stays inside too: "***a *b*c***" ->
    // "<em>**a <em>b</em>c**</em>"), or the opener is fully used,
    // the closer has exactly one excess delimiter, and either a
    // delimiter failed earlier ("*foo**bar**" ->
    // "<em>foo**bar*</em>") or the match is a strong, the previous
    // match was an em, and its closer could open
    // ("**return that *old*two***" ->
    // "<strong>return that <em>old</em>two*</strong>", while
    // "**a *b* c***" and "**a **b**c***" keep the excess outside).
    const excess = closer.len - use;
    const fromEnd = viaExcess ||
      (opener.len === use && excess === 1 && (sawFailed || (use === 2 && lastCloserCanOpen && lastMatchUse === 1)));
    if (excess >= 1 && fromEnd) {
      const cIdx = delims.indexOf(closer);
      let hasOpener = false;
      for (let k = 0; k < cIdx; k++) {
        if (delims[k] !== opener && delims[k].canOpen && !delims[k].failed) { hasOpener = true; break; }
      }
      if (!hasOpener) {
        closer.off += excess;
        closer.len = use;
      }
    }
    const oIdx = delims.indexOf(opener);
    makeEmphasis(opener, closer, use, viaExcess);
    lastCloserCanOpen = closer.canOpen;
    lastMatchUse = use;
    // Restart the scan at the opener (or where it was): the match
    // removed delimiters, so the old index is stale. Re-examining
    // from the opener lets a remaining opener or closer match again
    // and guarantees the delimiters after the old closer are reached.
    let ni = delims.indexOf(opener);
    if (ni === -1) ni = delims.indexOf(closer);
    if (ni === -1) ni = oIdx;
    di = ni;
  }
  return { html: renderNodes(nodes), plain: plainNodes(nodes), hasLink };
}

// ---------------------------------------------------------------------------
// Block parsing.

// A cursor over one source line, tracking a virtual column so tabs expand
// the way CommonMark measures them (width 4 - col % 4). A partially
// consumed tab leaves its remaining columns as virtual spaces (pend).
function makeCursor(line) { return { s: line, i: 0, col: 0, pend: 0, sub: 0, msub: 0 }; }
function curPeek(cur) {
  if (cur.pend > 0) return ' ';
  return cur.i < cur.s.length ? cur.s[cur.i] : '';
}
function curWidth(cur) {
  if (cur.pend > 0) return 1;
  // Tab stops are measured from the column where the deepest container
  // started (cur.sub), not from the line start: a tab after "> " inside
  // a list item is 2 columns wide, not 4.
  return cur.s[cur.i] === '\t' ? 4 - ((cur.col - cur.sub) % 4) : 1;
}
function curAdvance(cur, n) {
  while (n > 0) {
    if (cur.pend > 0) {
      cur.pend--; cur.col++; n--;
      if (cur.pend === 0) cur.i++;
      continue;
    }
    if (cur.i >= cur.s.length) return;
    const w = curWidth(cur);
    if (w <= n) { n -= w; cur.col += w; cur.i++; }
    else { cur.pend = w - n; cur.col += n; n = 0; }
  }
}
function curRest(cur) {
  if (cur.pend > 0) return ' '.repeat(cur.pend) + cur.s.slice(cur.i + 1);
  return cur.s.slice(cur.i);
}
// Columns of leading whitespace from the cursor, without consuming.
function curIndent(cur) {
  let col = cur.col;
  let i = cur.i;
  let pend = cur.pend;
  while (true) {
    if (pend > 0) { col++; pend--; if (pend === 0) i++; continue; }
    const ch = cur.s[i];
    if (ch === ' ') { col++; i++; continue; }
    if (ch === '\t') { col += 4 - ((col - cur.sub) % 4); i++; continue; }
    break;
  }
  return col - cur.col;
}
// The line's content from the cursor. When expandLead is true the leading
// whitespace is expanded to spaces first (lines inside containers); when
// false the raw remainder is used (root level and lazy lines).
function lineContent(cur, expandLead) {
  if (!expandLead) return curRest(cur);
  let col = cur.col;
  let i = cur.i;
  let pend = cur.pend;
  let lead = 0;
  while (true) {
    if (pend > 0) { lead++; col++; pend--; if (pend === 0) i++; continue; }
    const ch = cur.s[i];
    if (ch === ' ') { lead++; col++; i++; continue; }
    if (ch === '\t') { const w = 4 - ((col - cur.sub) % 4); lead += w; col += w; i++; continue; }
    break;
  }
  return ' '.repeat(lead) + cur.s.slice(i);
}
function isBlankLine(line) {
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== ' ' && line[i] !== '\t') return false;
  }
  return true;
}
function trimLine(s) {
  let a = 0;
  let b = s.length;
  while (a < b && (s[a] === ' ' || s[a] === '\t')) a++;
  while (b > a && (s[b - 1] === ' ' || s[b - 1] === '\t')) b--;
  return s.slice(a, b);
}

// Skip spaces/tabs (column-wise) in a plain string, from index i.
function skipInlineWs(s, i) {
  while (i < s.length && (s[i] === ' ' || s[i] === '\t' || s[i] === '\n')) i++;
  return i;
}

// Parse a link reference definition at text[pos]. Returns
// { label, dest, title, end } (end = index of the newline ending the
// definition, or the end of the text) or null.
function parseOneDef(text, pos) {
  let i = pos;
  // Up to 3 columns of leading whitespace before the label.
  let col = 0;
  while (i < text.length && col < 3) {
    if (text[i] === ' ') { i++; col++; continue; }
    if (text[i] === '\t' && col === 0) break;
    break;
  }
  if (text[i] !== '[') return null;
  const closeIdx = findMatchingBracket(text, i);
  if (closeIdx === -1) return null;
  const label = text.slice(i + 1, closeIdx);
  if (label.length === 0 || label.length > 999) return null;
  if (!isValidLabel(label)) return null;
  if (text[closeIdx + 1] !== ':') return null;
  // Skip whitespace to the destination; it may be on the next line (any
  // indent), but not after a blank line.
  let j = closeIdx + 2;
  let seenNl = false;
  while (j < text.length) {
    const ch = text[j];
    if (ch === ' ' || ch === '\t') { j++; continue; }
    if (ch === '\n') {
      if (seenNl) return null;
      seenNl = true;
      j++;
      continue;
    }
    break;
  }
  if (j >= text.length) return null;
  let dest = '';
  if (text[j] === '<') {
    // An angle destination ends at the first UNESCAPED '>'.
    let k = j + 1;
    let inner = '';
    let closed = false;
    while (k < text.length) {
      const ch = text[k];
      if (ch === '\\' && k + 1 < text.length && isAsciiPunct(text[k + 1])) {
        inner += text[k + 1];
        k += 2;
        continue;
      }
      if (ch === '>') { closed = true; break; }
      if (ch === '<' || ch === '\n') return null;
      inner += ch;
      k++;
    }
    if (!closed) return null;
    dest = inner;
    j = k + 1;
  } else {
    let depth = 0;
    const start = j;
    while (j < text.length) {
      const ch = text[j];
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') break;
      if (ch === '\\' && j + 1 < text.length && isAsciiPunct(text[j + 1])) { j += 2; continue; }
      if (ch === '(') depth++;
      else if (ch === ')') { if (depth === 0) break; depth--; }
      if (ch.charCodeAt(0) < 32) return null;
      j++;
    }
    if (j === start) return null;
    dest = text.slice(start, j);
    // Unescape backslash escapes in the destination.
    let d = '';
    for (let k = 0; k < dest.length; k++) {
      if (dest[k] === '\\' && k + 1 < dest.length && isAsciiPunct(dest[k + 1])) { d += dest[k + 1]; k++; }
      else d += dest[k];
    }
    dest = d;
  }
  // An optional title follows the destination, separated by whitespace.
  // Skip spaces/tabs on the destination's own line first.
  let j2 = j;
  while (j2 < text.length && (text[j2] === ' ' || text[j2] === '\t')) j2++;
  let title = null;
  let end;
  if ((text[j2] === '"' || text[j2] === "'" || text[j2] === '(') && j2 > j) {
    // Title on the same line: it must be well-formed and the line must
    // end after it; any junk invalidates the whole definition.
    const t = parseTitle(text, j2);
    if (!t) return null;
    let m = t.end;
    while (m < text.length && (text[m] === ' ' || text[m] === '\t')) m++;
    if (m < text.length && text[m] !== '\n') return null;
    title = t.title;
    end = m;
  } else if (text[j2] === '\n') {
    // The title may be on the next line (any indent). If it is
    // malformed or followed by junk, the definition stands without it
    // and the next line is left as text.
    let k = j2 + 1;
    while (k < text.length && (text[k] === ' ' || text[k] === '\t')) k++;
    if (text[k] === '"' || text[k] === "'" || text[k] === '(') {
      const t = parseTitle(text, k);
      if (t) {
        let m = t.end;
        while (m < text.length && (text[m] === ' ' || text[m] === '\t')) m++;
        if (m >= text.length || text[m] === '\n') {
          title = t.title;
          end = m;
        }
      }
    }
    if (title === null) end = j2;
  } else if (j2 >= text.length) {
    end = j2;
  } else {
    // Junk after the destination on its own line.
    return null;
  }
  return { label, dest, title, end };
}

// Parse a link title starting at text[k] ('"', "'" or '('). Returns
// { title, end } (end = index just past the closing delimiter) or null
// when the title is not closed.
function parseTitle(text, k) {
  const q = text[k];
  let t = '';
  if (q === '(') {
    let depth = 1;
    let p = k + 1;
    while (p < text.length) {
      if (text[p] === '\\' && p + 1 < text.length && isAsciiPunct(text[p + 1])) { t += text[p + 1]; p += 2; continue; }
      if (text[p] === '(') depth++;
      else if (text[p] === ')') { depth--; if (depth === 0) return { title: t, end: p + 1 }; }
      t += text[p]; p++;
    }
    return null;
  }
  let p = k + 1;
  while (p < text.length) {
    if (text[p] === '\\' && p + 1 < text.length && isAsciiPunct(text[p + 1])) { t += text[p + 1]; p += 2; continue; }
    if (text[p] === q) return { title: t, end: p + 1 };
    t += text[p]; p++;
  }
  return null;
}

// Extract leading link reference definitions from a paragraph's text.
// Returns { rest, defs } where defs are in order and rest is the remaining
// text ('' when the paragraph was only definitions).
function extractDefs(text, refs) {
  let pos = 0;
  const defs = [];
  while (true) {
    const def = parseOneDef(text, pos);
    if (!def) break;
    defs.push(def);
    pos = def.end;
    // Move to the next line for the next definition attempt. Leading
    // whitespace of that line is left in place: if the next definition
    // fails to parse, the rest keeps its indent.
    if (text[pos] === '\n') {
      pos++;
    } else {
      break;
    }
    if (pos >= text.length) { pos = text.length; break; }
  }
  return { rest: text.slice(pos), defs };
}

// Split a table row line into cells. Escaped pipes do not split.
function splitTableRow(line) {
  const t = trimLine(line);
  const cells = [];
  let cur = '';
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    // An escaped pipe does not split the row, and the backslash is
    // gone before inline parsing (so `\|` inside a code span is "|").
    if (c === '\\' && i + 1 < t.length && t[i + 1] === '|') { cur += '|'; i++; continue; }
    if (c === '|') { cells.push(cur); cur = ''; continue; }
    cur += c;
  }
  cells.push(cur);
  if (cells.length > 0 && trimLine(cells[0]) === '' && t.startsWith('|')) cells.shift();
  if (cells.length > 0 && trimLine(cells[cells.length - 1]) === '' && t.endsWith('|')) cells.pop();
  return cells.map(c => trimLine(c));
}
function isDelimiterRow(line) {
  const cells = splitTableRow(line);
  if (cells.length === 0) return null;
  const aligns = [];
  for (const cell of cells) {
    const m = /^:?-+:?$/.exec(cell);
    if (!m) return null;
    if (cell.startsWith(':') && cell.endsWith(':') && cell.length >= 3) aligns.push('center');
    else if (cell.startsWith(':')) aligns.push('left');
    else if (cell.endsWith(':')) aligns.push('right');
    else aligns.push(null);
  }
  return aligns;
}
// Whether a paragraph's lines form a GFM table (same check as the
// table branch of finalizeLeaf, on the raw lines).
function paragraphIsTable(ls) {
  for (let k = 1; k < ls.length; k++) {
    if (lineIndentCols(ls[k]) > 3) continue;
    const al = isDelimiterRow(ls[k]);
    if (al) {
      const hc = splitTableRow(ls[k - 1]);
      if (hc.length === al.length) return true;
    }
  }
  return false;
}

// Columns of leading whitespace in a line (a tab is 4 - col % 4 wide).
function lineIndentCols(line) {
  let col = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === ' ') col++;
    else if (line[i] === '\t') col += 4 - (col % 4);
    else break;
  }
  return col;
}

// True when a line is shaped like a setext underline made of '='
// (optional spaces/tabs around a run of one or more '=').
function isSetextEq(line) {
  let a = 0;
  while (a < line.length && (line[a] === ' ' || line[a] === '\t')) a++;
  let b = line.length;
  while (b > a && (line[b - 1] === ' ' || line[b - 1] === '\t')) b--;
  if (b - a < 1) return false;
  for (let k = a; k < b; k++) if (line[k] !== '=') return false;
  return true;
}

function blockParse(src) {
  const normalized = src.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  // Whether the source's last line ends with a newline: an HTML block
  // whose last line is the document's last line renders no trailing
  // newline when the source has none.
  const srcEndsWithNL = normalized.endsWith('\n');
  const refs = {};
  const root = { type: 'doc', children: [] };
  const stack = [root];
  let blankStack = null;

  function lastChildOf(c) { return c.children[c.children.length - 1]; }
  function commitDefs(text) {
    const r = extractDefs(text, refs);
    for (const def of r.defs) {
      const key = normalizeLabel(def.label);
      if (!(key in refs)) refs[key] = { dest: def.dest, title: def.title };
    }
    return r.rest;
  }
  function defsOnly(text) {
    return extractDefs(text, refs).rest.trim() === '';
  }
  function finalizeLeaf(leaf, parent) {
    if (!leaf.open) {
      // An HTML block closed by its close marker still needs its
      // trailing-newline rule computed.
      if (leaf.type === 'html') setHtmlStrip(leaf);
      return;
    }
    leaf.open = false;
    if (leaf.type === 'paragraph') {
      const idx = parent.children.indexOf(leaf);
      const rest = commitDefs(leaf.lines.join('\n'));
      const restLines = rest === '' ? [] : rest.split('\n');
      const out = [];
      let tableIdx = -1;
      let aligns = null;
      for (let k = 1; k < restLines.length; k++) {
        // A delimiter row indented four or more columns is not a table.
        if (lineIndentCols(restLines[k]) > 3) continue;
        const al = isDelimiterRow(restLines[k]);
        if (al) {
          const hc = splitTableRow(restLines[k - 1]);
          if (hc.length === al.length) { tableIdx = k; aligns = al; break; }
        }
      }
      if (tableIdx === -1) {
        if (restLines.length > 0) out.push({ type: 'paragraph', text: rest });
      } else {
        if (tableIdx > 1) out.push({ type: 'paragraph', text: restLines.slice(0, tableIdx - 1).join('\n') });
        const header = splitTableRow(restLines[tableIdx - 1]);
        const rows = [];
        for (let r = tableIdx + 1; r < restLines.length; r++) {
          const cells = splitTableRow(restLines[r]);
          while (cells.length < header.length) cells.push('');
          rows.push(cells.slice(0, header.length));
        }
        out.push({ type: 'table', aligns, header, rows });
      }
      parent.children.splice(idx, 1, ...out);
    } else if (leaf.type === 'code') {
      while (leaf.lines.length > 0 && leaf.lines[leaf.lines.length - 1] === '') leaf.lines.pop();
    } else if (leaf.type === 'html') {
      setHtmlStrip(leaf);
    }
  }
  // An HTML block loses its trailing newline when the next source line
  // is blank. Close-marker types (1-5) lose it only when the next
  // line is truly empty; a spaces- or tab-only line keeps the newline
  // ("<!--\nfoo\n-->\n   \npara" keeps it). Other types lose it on any
  // blank line. It also loses the newline after its last line when
  // that line is the document's last line and the source does not end
  // with a newline.
  function setHtmlStrip(html) {
    if (html.stripTrailing === undefined) {
      const next = html.lastLine + 1;
      html.stripTrailing = next < lines.length &&
        (html.htmlType <= 5 ? lines[next].length === 0 : isBlankLine(lines[next]));
    }
    if (html.lastLine === lines.length - 1 && !srcEndsWithNL) html.noTrailingNL = true;
  }
  function closeFrom(idx) {
    while (stack.length > idx) {
      const c = stack.pop();
      const lc = lastChildOf(c);
      if (lc && lc.open) finalizeLeaf(lc, c);
      c.open = false;
    }
  }
  function deepestParagraph(container) {
    let c = container;
    while (c) {
      const lc = lastChildOf(c);
      if (!lc || !lc.open) return null;
      if (lc.type === 'paragraph') return lc;
      if (lc.type === 'quote' || lc.type === 'list' || lc.type === 'item') { c = lc; continue; }
      return null;
    }
    return null;
  }
  function openLeafOf(container) {
    const lc = lastChildOf(container);
    if (lc && lc.open && (lc.type === 'paragraph' || lc.type === 'fence' || lc.type === 'code' || lc.type === 'html')) return lc;
    return null;
  }
  // The open fence deepest inside a container, with the path to it:
  // whether any container on the path is a list item (a fence keeps
  // lazy lines only inside an item), and the type of the container
  // that directly holds the fence. A fence keeps its lines even when
  // they do not match the item it sits in ("  ~~~c++" inside an item,
  // followed by an unindented line, is still fence content until its
  // closing fence).
  function deepestFence(container) {
    let c = container;
    let inItem = false;
    while (c) {
      if (c.type === 'item') inItem = true;
      const lc = lastChildOf(c);
      if (!lc || !lc.open) return null;
      if (lc.type === 'fence') return { fence: lc, inItem, parentType: c.type };
      if (lc.type === 'quote' || lc.type === 'list' || lc.type === 'item') { c = lc; continue; }
      return null;
    }
    return null;
  }
  // Columns to subtract from a fence content line's tab columns. A
  // fence directly in a quote is measured from the columns of all
  // containers above it; a fence directly in an item is measured
  // from the quote columns above it, except the innermost quote
  // (the one holding the list), which is not subtracted.
  function fenceTabSubtract(parentType, aboveCols, quoteColsTotal, innermostQuoteCols) {
    if (parentType === 'item') {
      const s = quoteColsTotal - innermostQuoteCols;
      return s < 0 ? 0 : s;
    }
    return aboveCols < 0 ? 0 : aboveCols;
  }
  // Push one fence content line. A tilde fence keeps its content
  // lines verbatim (no indent strip); a backtick fence strips up to
  // its indent. A surviving leading tab is expanded at its effective
  // column (absolute column minus `subtract`), and stays a literal
  // tab at the root ("```toml\n\tindented" keeps "\t").
  function pushFenceLine(leaf, cur, li, expandLead, subtract) {
    if (leaf.char === '`') {
      let stripped = 0;
      while (stripped < leaf.indent) {
        if (cur.pend > 0) { curAdvance(cur, 1); stripped++; continue; }
        const ch = cur.s[cur.i];
        if (ch === ' ') { cur.i++; cur.col++; stripped++; continue; }
        if (ch === '\t') { cur.i++; cur.col += 4 - (cur.col % 4); stripped++; continue; }
        break;
      }
    }
    // The fence's own subtract now sets the tab origin (cur.sub) for
    // this line instead of shifting cur.col: the widths lineContent
    // computes are the same, and a tab partly consumed while matching
    // a quote keeps the width it was measured with.
    const savedSub = cur.sub;
    cur.sub = subtract <= cur.col ? subtract : cur.col;
    leaf.lines.push(lineContent(cur, expandLead));
    cur.sub = savedSub;
    leaf.lastLine = li;
  }

  // Detect the block a line starts, given the cursor (after containers) and
  // the line's full content (after containers, indent preserved). Creates
  // the block and returns its kind ('paragraph' for a plain paragraph).
  // True when the line at the cursor (after any indent) is a thematic
  // break: three or more of -, _ or * with only spaces between them.
  function isThematicBreakAt(cur) {
    const ch = curPeek(cur);
    if (ch !== '-' && ch !== '_' && ch !== '*') return false;
    let k = cur.i;
    let count = 0;
    while (k < cur.s.length) {
      const c2 = cur.s[k];
      if (c2 === ch) { count++; k++; continue; }
      if (c2 === ' ' || c2 === '\t') { k++; continue; }
      return false;
    }
    return count >= 3;
  }

  function startBlock(cur, fullContent, li, pendingBlankStack) {
    const indent = curIndent(cur);
    // A list only stays open for a new item of its own; any other block
    // ends it first. A thematic break is not a list item even when it
    // starts with a list marker.
    let inner = stack[stack.length - 1];
    if (inner.type === 'list') {
      let isItem = false;
      if (indent <= 3) {
        const saved = { i: cur.i, col: cur.col, pend: cur.pend };
        curAdvance(cur, indent);
        if (detectListMarker(cur) && !isThematicBreakAt(cur)) isItem = true;
        cur.i = saved.i; cur.col = saved.col; cur.pend = saved.pend;
      }
      if (!isItem) {
        closeFrom(stack.length - 1);
        inner = stack[stack.length - 1];
      }
    }
    if (indent >= 4) {
      const code = { type: 'code', lines: [], open: true };
      stack[stack.length - 1].children.push(code);
      curAdvance(cur, 4);
      code.lines.push(curRest(cur));
      code.lastLine = li;
      return 'code';
    }
    const saved = { i: cur.i, col: cur.col, pend: cur.pend };
    curAdvance(cur, indent);
    const ch = curPeek(cur);
    inner = stack[stack.length - 1];
    // ATX heading.
    if (ch === '#') {
      const run = countRun(cur.s, cur.i, '#');
      const after = cur.s[cur.i + run];
      if (run >= 1 && run <= 6 && (after === undefined || after === ' ' || after === '\t')) {
        let text = cur.s.slice(cur.i + run);
        text = text.replace(/[ \t]+$/, '');
        text = text.replace(/[ \t]+#+$/, '');
        text = text.replace(/^[ \t]+/, '');
        text = text.replace(/[ \t]+$/, '');
        inner.children.push({ type: 'heading', level: run, text, open: false });
        return 'heading';
      }
    }
    // Fenced code.
    if (ch === '`' || ch === '~') {
      const run = countRun(cur.s, cur.i, ch);
      if (run >= 3) {
        let info = cur.s.slice(cur.i + run).trim();
        if (ch === '`' && info.indexOf('`') !== -1) {
          // not a fence; fall through
        } else {
          // Backslash escapes in the info string are decoded before the
          // language is taken (``` foo\+bar -> language-foo+bar).
          const lang = info.replace(/\\([!-/:-@\[-`{-~])/g, '$1').split(/[ \t]/)[0] || '';
          const fence = { type: 'fence', char: ch, len: run, indent, lang, lines: [], open: true, lastLine: li };
          inner.children.push(fence);
          return 'fence';
        }
      }
    }
    // HTML block.
    const htmlInfo = detectHtmlBlock(cur);
    if (htmlInfo) {
      const html = { type: 'html', htmlType: htmlInfo.type, closeTag: htmlInfo.closeTag, lines: [fullContent], open: true, lastLine: li };
      inner.children.push(html);
      // Types 1-5 end at a close marker, which may already be on this
      // very line (<style>x</style>, <!-- c -->); then the block is done
      // and the next line is a fresh block.
      if (htmlInfo.type <= 5 && htmlCloseMarker(html, fullContent)) {
        html.open = false;
        setHtmlStrip(html);
      }
      return 'html';
    }
    // Thematic break.
    if (ch === '-' || ch === '_' || ch === '*') {
      let k = cur.i;
      let count = 0;
      let ok = true;
      while (k < cur.s.length) {
        const c2 = cur.s[k];
        if (c2 === ch) { count++; k++; continue; }
        if (c2 === ' ' || c2 === '\t') { k++; continue; }
        ok = false;
        break;
      }
      if (ok && count >= 3) {
        inner.children.push({ type: 'hr', open: false });
        return 'hr';
      }
    }
    // Blockquote.
    if (ch === '>') {
      const quote = { type: 'quote', children: [], open: true };
      inner.children.push(quote);
      stack.push(quote);
      cur.i++; cur.col++;
      // Tabs after a new quote marker are measured from the columns
      // the containers above it stripped (cur.msub), not from the
      // quote's own column: "  > \tfoo" inside an item is 2 spaces,
      // while "   > \tfoo" at the root is 3.
      cur.sub = cur.msub;
      if (cur.s[cur.i] === ' ' || cur.s[cur.i] === '\t') curAdvance(cur, 1);
      const rest = lineContent(cur, true);
      return startBlockRest(cur, rest, li, pendingBlankStack);
    }
    // List.
    const marker = detectListMarker(cur);
    if (marker) {
      return startList(cur, marker, li, pendingBlankStack, indent);
    }
    // Paragraph.
    cur.i = saved.i; cur.col = saved.col; cur.pend = saved.pend;
    const para = { type: 'paragraph', lines: [fullContent], open: true, lastLazy: false };
    inner.children.push(para);
    return 'paragraph';
  }

  // Continue block detection on the remainder of a line after a blockquote
  // marker was consumed. Returns the kind created.
  function startBlockRest(cur, rest, li, pendingBlankStack) {
    if (trimLine(rest) === '') return 'empty';
    // The remainder is treated as a fresh line at the new container level:
    // reuse startBlock with a cursor over the remainder text.
    const sub = makeCursor(rest);
    return startBlock(sub, rest, li, pendingBlankStack);
  }

  function detectHtmlBlock(cur) {
    if (curPeek(cur) !== '<') return null;
    const s = cur.s;
    const i = cur.i;
    const rest = s.slice(i);
    const m1 = /^<(script|pre|style|textarea)(?=[\s>\/]|$)/i.exec(rest);
    if (m1) return { type: 1, closeTag: m1[1].toLowerCase() };
    if (rest.startsWith('<!--')) return { type: 2, closeTag: null };
    if (rest.startsWith('<?')) return { type: 3, closeTag: null };
    if (/^<![A-Za-z]/.test(rest)) return { type: 4, closeTag: null };
    if (rest.startsWith('<![CDATA[')) return { type: 5, closeTag: null };
    const m6 = /^<\/?([A-Za-z][A-Za-z0-9-]*)(?=[\s>\/]|$)/.exec(rest);
    if (m6 && BLOCK_TAGS.has(m6[1].toLowerCase())) return { type: 6, closeTag: null };
    // Type 7: a complete open or close tag alone on the line.
    const tag = scanHtmlTag(s, i);
    if (tag !== null && trimLine(s.slice(i + tag.length)) === '') return { type: 7, closeTag: null };
    return null;
  }

  // Detect a list marker at the cursor. Returns
  // { bullet, marker, markerWidth, ws, start, empty } or null. markerWidth
  // is the marker's width in columns and ws is the columns of whitespace
  // after it (capped at 5); empty says nothing follows the marker on the
  // line. The caller turns those into a content indent relative to the
  // line's own indent, which is what makes nested lists match.
  function detectListMarker(cur) {
    const s = cur.s;
    let i = cur.i;
    const startCol = cur.col;
    const ch = s[i];
    if (ch === '-' || ch === '+' || ch === '*') {
      const after = s[i + 1];
      if (after !== undefined && after !== ' ' && after !== '\t') return null;
      // Columns of whitespace after the marker (capped at 5). Tab
      // stops here are measured from the columns the containers
      // stripped (cur.msub): "- a\n  - \tfoo" has a 2-wide tab, while
      // the same line at the root has a 4-wide one.
      let col = startCol + 1;
      let j = i + 1;
      let ws = 0;
      while (j < s.length && ws < 5) {
        if (s[j] === ' ') { ws++; col++; j++; continue; }
        if (s[j] === '\t') { const w = 4 - ((col - cur.msub) % 4); ws += w; col += w; j++; continue; }
        break;
      }
      return { bullet: true, marker: ch, markerWidth: 1, ws, start: null, empty: j >= s.length };
    }
    if (ch >= '0' && ch <= '9') {
      let j = i;
      while (j < s.length && s[j] >= '0' && s[j] <= '9') j++;
      const digits = j - i;
      if (digits === 0 || digits > 9) return null;
      const delim = s[j];
      if (delim !== '.' && delim !== ')') return null;
      const after = s[j + 1];
      if (after !== undefined && after !== ' ' && after !== '\t') return null;
      const num = parseInt(s.slice(i, j), 10);
      let col = startCol + digits + 1;
      let k = j + 1;
      let ws = 0;
      while (k < s.length && ws < 5) {
        if (s[k] === ' ') { ws++; col++; k++; continue; }
        if (s[k] === '\t') { const w = 4 - ((col - cur.msub) % 4); ws += w; col += w; k++; continue; }
        break;
      }
      return { bullet: false, marker: delim, markerWidth: digits + 1, ws, start: num, empty: k >= s.length };
    }
    return null;
  }

  function startList(cur, marker, li, pendingBlankStack, indent) {
    let inner = stack[stack.length - 1];
    if (inner.type === 'list' && (inner.bullet !== marker.bullet || inner.marker !== marker.marker)) {
      closeFrom(stack.length - 1);
      inner = stack[stack.length - 1];
    }
    let list = null;
    // A blank line inside a nested quote is inside that quote, not
    // between this list's blocks, so a new item after it does not make
    // the list loose.
    const blankInQuote = (lst) => {
      if (!pendingBlankStack) return false;
      const bi = pendingBlankStack.indexOf(lst);
      return bi !== -1 && pendingBlankStack[bi + 1] && pendingBlankStack[bi + 1].type === 'item' && pendingBlankStack.slice(bi + 2).some(x => x.type === 'quote');
    };
    if (inner.type === 'list' && inner.bullet === marker.bullet && inner.marker === marker.marker) {
      list = inner;
      if (pendingBlankStack && pendingBlankStack.includes(list) && !blankInQuote(list)) list.loose = true;
    } else {
      const last = lastChildOf(inner);
      if (last && last.type === 'list' && !last.open && last.bullet === marker.bullet && last.marker === marker.marker) {
        list = last;
        list.open = true;
        stack.push(list);
        if (pendingBlankStack && pendingBlankStack.includes(list) && !blankInQuote(list)) list.loose = true;
      } else {
        list = { type: 'list', bullet: marker.bullet, marker: marker.marker, start: marker.bullet ? null : marker.start, loose: false, children: [], open: true };
        inner.children.push(list);
        stack.push(list);
      }
    }
    // Columns from the marker to its content: the whitespace after the
    // marker, or one column when there is none, five or more, or the item
    // is empty (trailing spaces on an empty item line do not count). The
    // content indent is measured from the line's own indent, not from the
    // document column, so a nested list's items match their own lines.
    const advance = (marker.ws === 0 || marker.ws >= 5 || marker.empty)
      ? marker.markerWidth + 1 : marker.markerWidth + marker.ws;
    const item = { type: 'item', contentIndent: indent + advance, children: [], open: true };
    list.children.push(item);
    stack.push(item);
    // Position the cursor at the item's content start. The marker's
    // whitespace was measured from cur.msub, so advance with that
    // origin too, or a tab is consumed by a different width than it
    // was measured with.
    cur.sub = cur.msub;
    curAdvance(cur, advance);
    const rest = lineContent(cur, true);
    if (trimLine(rest) === '') return 'list';
    return startBlockRest(cur, rest, li, pendingBlankStack);
  }

  // Whether a line starts a block that interrupts a paragraph. When
  // forLazy is true (the line failed to match a container, so it would
  // start a new item of an open list or a new list), any list marker
  // interrupts. Otherwise (the line matched the paragraph's container,
  // so it would start a NEW list) an empty item does not interrupt and
  // an ordered list must start with 1.
  function interruptsParagraph(cur, forLazy) {
    const indent = curIndent(cur);
    if (indent > 3) return false;
    const saved = { i: cur.i, col: cur.col, pend: cur.pend };
    curAdvance(cur, indent);
    const ch = curPeek(cur);
    let result = false;
    if (ch === '#') {
      const run = countRun(cur.s, cur.i, '#');
      const after = cur.s[cur.i + run];
      if (run >= 1 && run <= 6 && (after === undefined || after === ' ' || after === '\t')) result = true;
    } else if (ch === '`' || ch === '~') {
      const run = countRun(cur.s, cur.i, ch);
      if (run >= 3) {
        const info = cur.s.slice(cur.i + run).trim();
        if (!(ch === '`' && info.indexOf('`') !== -1)) result = true;
      }
    } else if (ch === '<') {
      const info = detectHtmlBlock(cur);
      if (info && info.type <= 6) result = true;
    } else if (ch === '-' || ch === '_' || ch === '*') {
      let k = cur.i;
      let count = 0;
      let ok = true;
      while (k < cur.s.length) {
        const c2 = cur.s[k];
        if (c2 === ch) { count++; k++; continue; }
        if (c2 === ' ' || c2 === '\t') { k++; continue; }
        ok = false;
        break;
      }
      if (ok && count >= 3) result = true;
    } else if (ch === '>') {
      result = true;
    }
    if (!result) {
      if (forLazy) result = detectListMarker(cur) !== null;
      else result = listInterruptsParagraph(cur);
    }
    cur.i = saved.i; cur.col = saved.col; cur.pend = saved.pend;
    return result;
  }

  // A list marker interrupts a paragraph only when the item is not
  // empty and (for an ordered list) it starts with 1: "foo\n*\n" and
  // "foo\n14. x\n" stay one paragraph.
  function listInterruptsParagraph(cur) {
    const saved = { i: cur.i, col: cur.col, pend: cur.pend };
    const ind = curIndent(cur);
    let result = false;
    if (ind <= 3) {
      curAdvance(cur, ind);
      const m = detectListMarker(cur);
      // An ordered list starting with a number other than 1 does not
      // interrupt a paragraph at the root, but it does when the
      // paragraph sits inside a list item and the new list nests
      // inside that same item ("+ foo\n  2. nested" is a nested list).
      const paraInItem = stack.some(c => c.type === 'item');
      if (m && !m.empty && (m.bullet || m.start === 1 || paraInItem)) result = true;
    }
    cur.i = saved.i; cur.col = saved.col; cur.pend = saved.pend;
    return result;
  }

  function htmlCloseMarker(html, content) {
    if (html.htmlType === 1) {
      return new RegExp('</' + html.closeTag + '\\s*>', 'i').test(content);
    }
    if (html.htmlType === 2) return content.indexOf('-->') !== -1;
    if (html.htmlType === 3) return content.indexOf('?>') !== -1;
    if (html.htmlType === 4) return content.indexOf('>') !== -1;
    if (html.htmlType === 5) return content.indexOf(']]>') !== -1;
    return false;
  }

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const blank = isBlankLine(line);
    const cur = makeCursor(line);
    // ---- container matching ----
    let failIdx = -1;
    let matchedDepth = 1;
    // Columns consumed by the containers above the deepest one: the
    // column a tab in a fence content line is measured from. The
    // quote columns are tracked separately (total, and the innermost
    // quote's) for a fence inside a list item.
    let colBeforeDeepest = 0;
    let quoteColsTotal = 0;
    let innermostQuoteCols = 0;
    // Column where the deepest container that matched started: tab
    // stops for the leaf's content are measured from there.
    let deepStart = 0;
    for (let si = 1; si < stack.length; si++) {
      if (si === stack.length - 1) colBeforeDeepest = cur.col;
      // Each container measures the tabs in its own prefix from the
      // column where that container started.
      const startCol = cur.col;
      cur.sub = startCol;
      const c = stack[si];
      if (c.type === 'quote') {
        const saved = { i: cur.i, col: cur.col, pend: cur.pend };
        let skipped = 0;
        while (skipped < 3 && cur.s[cur.i] === ' ') { cur.i++; cur.col++; skipped++; }
        if (cur.s[cur.i] === '>') {
          cur.i++; cur.col++;
          if (cur.s[cur.i] === ' ' || cur.s[cur.i] === '\t') curAdvance(cur, 1);
          const qCols = cur.col - saved.col;
          quoteColsTotal += qCols;
          innermostQuoteCols = qCols;
          matchedDepth = si + 1;
          deepStart = startCol;
          continue;
        }
        cur.i = saved.i; cur.col = saved.col; cur.pend = saved.pend;
        failIdx = si;
        break;
      } else if (c.type === 'item') {
        if (blank) { matchedDepth = si + 1; deepStart = startCol; continue; }
        // A line with nothing after the container prefixes (">>") is
        // blank at this level: the item matches it, so a following
        // indented line can still join the item instead of the item
        // being closed by the blank line.
        let k = cur.i, restBlank = true;
        while (k < cur.s.length) { if (cur.s[k] !== ' ' && cur.s[k] !== '\t') { restBlank = false; break; } k++; }
        if (restBlank) { matchedDepth = si + 1; deepStart = startCol; continue; }
        if (curIndent(cur) >= c.contentIndent) {
          curAdvance(cur, c.contentIndent);
          matchedDepth = si + 1;
          deepStart = startCol;
          continue;
        }
        failIdx = si;
        break;
      } else {
        matchedDepth = si + 1;
        deepStart = startCol;
        continue;
      }
    }
    // Leaf content measures its tabs from where the deepest matched
    // container started (not from where a container that failed did).
    // Tabs after a NEW container's marker are measured from the columns
    // the containers stripped (cur.msub) instead: see startBlock.
    cur.sub = deepStart;
    cur.msub = cur.col;
    const allMatched = failIdx === -1;
    const inner = stack[matchedDepth - 1];
    let leaf = openLeafOf(inner);
    // A fence inside a container keeps lazy lines (see the fence
    // branch); this also covers a fence in an item inside a quote,
    // where the failing container is the quote.
    let fenceInfo = null;
    if (!leaf && !allMatched && !blank) {
      fenceInfo = deepestFence(stack[failIdx]);
      if (fenceInfo) leaf = fenceInfo.fence;
    }
    const expandLead = matchedDepth > 1;
    let pendingBlankStack = null;
    if (!blank && blankStack) {
      pendingBlankStack = blankStack;
      blankStack = null;
      for (const c of pendingBlankStack) {
        if (c.type !== 'list') continue;
        const listIdx = stack.indexOf(c);
        if (listIdx === -1) continue;
        // Loose only when the blank line is directly inside this list:
        // the line lands in one of its items (a new block there), or it
        // is a new item of this list. A line that merely passes the list
        // on its way out, or that lands in a nested list, does not make
        // this list loose. A blank line inside a nested quote is inside
        // that quote, not between this list's blocks.
        const itemIdx = listIdx + 1;
        const inQuote = pendingBlankStack.slice(itemIdx + 1).some(x => x.type === 'quote');
        // The line lands in this list's item when it fails inside the
        // item's subtree and is not itself a new list marker -- but
        // not when it lands in a nested list inside that item (a
        // fence or new block in a nested list does not make the
        // parent list loose). Matching a nested list container is
        // not enough: the line must match into a nested item.
        const full = lineContent(cur, expandLead);
        let isMarker = false;
        if (!blank) {
          const saved = { i: cur.i, col: cur.col, pend: cur.pend };
          const ind = curIndent(cur);
          if (ind <= 3) { curAdvance(cur, ind); isMarker = !!detectListMarker(cur); }
          cur.i = saved.i; cur.col = saved.col; cur.pend = saved.pend;
        }
        const inNestedList = stack.slice(itemIdx + 1, matchedDepth).some(x => x.type === 'item');
        if ((matchedDepth === listIdx + 2 || (failIdx !== -1 && failIdx > itemIdx && !isMarker && !inNestedList)) && stack[itemIdx].type === 'item') {
          c.loose = true;
          continue;
        }
        if (failIdx === listIdx + 1 && !inQuote) {
          const saved = { i: cur.i, col: cur.col, pend: cur.pend };
          const ind = curIndent(cur);
          if (ind <= 3) {
            curAdvance(cur, ind);
            const m = detectListMarker(cur);
            if (m && m.bullet === c.bullet && m.marker === c.marker) c.loose = true;
          }
          cur.i = saved.i; cur.col = saved.col; cur.pend = saved.pend;
        }
      }
    }

    // ---- open leaf handling ----
    if (leaf && leaf.type === 'fence') {
      const lazy = !allMatched;
      const parentType = lazy ? (fenceInfo ? fenceInfo.parentType : null) : inner.type;
      const aboveCols = lazy ? cur.col : colBeforeDeepest;
      const subtract = fenceTabSubtract(parentType, aboveCols, quoteColsTotal, innermostQuoteCols);
      if (lazy) {
        // A fence inside a list item keeps a lazy line as content
        // only once it has started (a non-blank content line), its
        // last line is not blank, and the line is not a block start
        // (heading, fence, html block, thematic break, quote, list).
        // Any other lazy line ends the fence; it never closes on a
        // lazy line, so an under-indented closer is reprocessed
        // outside and may open a new fence there.
        const inItem = fenceInfo ? fenceInfo.inItem : false;
        const started = leaf.lines.some(l => l.trim() !== '');
        const lastBlank = leaf.lines.length === 0 || leaf.lines[leaf.lines.length - 1].trim() === '';
        if (!inItem || !started || lastBlank || interruptsParagraph(cur, true)) {
          leaf.open = false;
          // Fall through: the containers close and the line starts a
          // new block below. (No `continue` here.)
        } else {
          pushFenceLine(leaf, cur, li, expandLead, subtract);
          continue;
        }
      } else {
        const saved = { i: cur.i, col: cur.col, pend: cur.pend };
        const ind = curIndent(cur);
        let closed = false;
        if (ind <= 3) {
          curAdvance(cur, ind);
          const run = countRun(cur.s, cur.i, leaf.char);
          if (run >= leaf.len) {
            let k = cur.i + run;
            let ok = true;
            while (k < cur.s.length) {
              if (cur.s[k] !== ' ' && cur.s[k] !== '\t') { ok = false; break; }
              k++;
            }
            if (ok) { leaf.open = false; closed = true; }
          }
        }
        if (!closed) {
          cur.i = saved.i; cur.col = saved.col; cur.pend = saved.pend;
          pushFenceLine(leaf, cur, li, expandLead, subtract);
        }
        continue;
      }
    }
    if (leaf && leaf.type === 'code') {
      if (blank) {
        // A blank line inside a code block keeps what is left after
        // stripping up to four columns ("      " contributes "  ").
        const ind = curIndent(cur);
        curAdvance(cur, Math.min(4, ind));
        leaf.lines.push(curRest(cur));
        leaf.lastLine = li;
        continue;
      }
      if (curIndent(cur) >= 4) {
        curAdvance(cur, 4);
        leaf.lines.push(curRest(cur));
        leaf.lastLine = li;
        continue;
      }
      finalizeLeaf(leaf, inner);
    }
    if (leaf && leaf.type === 'html') {
      const content = lineContent(cur, expandLead);
      if (leaf.htmlType <= 5) {
        leaf.lines.push(content);
        leaf.lastLine = li;
        if (htmlCloseMarker(leaf, content)) {
          leaf.open = false;
          setHtmlStrip(leaf);
        }
        continue;
      }
      if (blank) {
        finalizeLeaf(leaf, inner);
      } else {
        leaf.lines.push(content);
        leaf.lastLine = li;
        continue;
      }
    }

    // ---- blank line ----
    // A line whose content is EMPTY once the container prefixes are
    // stripped (">", ">>") is a blank line at that level: it closes an
    // open paragraph and separates blocks. A line whose content is only
    // whitespace (">  ") is not blank: it continues an open paragraph
    // (keeping the spaces) and creates nothing on its own.
    const contentBlank = !blank && lineContent(cur, expandLead) === '';
    // A whitespace-only line containing a tab continues a table
    // paragraph as an empty row (marked treats the tab line as a
    // row, while a spaces-only or empty line ends the table), and
    // the paragraph stays open so following row lines join the
    // table too. A tab line in a non-table paragraph is still a
    // blank line.
    if (blank && line.includes('\t')) {
      const top = stack[stack.length - 1];
      const lc = lastChildOf(top);
      if (lc && lc.open && lc.type === 'paragraph' && paragraphIsTable(lc.lines)) {
        lc.lines.push(lineContent(cur, false));
        continue;
      }
    }
    if (blank || contentBlank) {
      if (!allMatched) closeFrom(failIdx);
      const top = stack[stack.length - 1];
      const lc = lastChildOf(top);
      if (lc && lc.open && lc.type === 'paragraph') finalizeLeaf(lc, top);
      // An empty list item is closed by a blank line, so a following
      // indented line does not join it ("-\n\n foo" leaves the item
      // empty; contrast "-\n foo", which has no blank line).
      if (top.type === 'item' && top.open && top.children.length === 0) {
        closeFrom(stack.length - 1);
      }
      blankStack = stack.slice();
      continue;
    }

    // ---- containers failed: lazy continuation or a new block ----
    if (!allMatched) {
      const para = deepestParagraph(stack[failIdx]);
      if (para && !interruptsParagraph(cur, true)) {
        if (curIndent(cur) >= 4) curAdvance(cur, 4);
        // A lazy line's leading tab expands at its effective column
        // (measured from the deepest matched container), like a
        // matched line's does; spaces are unaffected.
        let content = lineContent(cur, true);
        // A lazy line shaped like a setext underline ("===") is not an
        // underline at all: it joins the paragraph. When the paragraph's
        // previous line was itself lazy and the failing container is a
        // blockquote, it is indented by four spaces.
        if (para.lastLazy && stack[failIdx].type === 'quote' && isSetextEq(content)) {
          content = '    ' + content.replace(/^[ \t]+/, '');
        }
        para.lines.push(content);
        para.lastLazy = true;
        continue;
      }
      closeFrom(failIdx);
    }

    // ---- open paragraph ----
    const curLeaf = openLeafOf(stack[stack.length - 1]);
    if (curLeaf && curLeaf.type === 'paragraph') {
      const parent = stack[stack.length - 1];
      const paraText = curLeaf.lines.join('\n');
      let isDefsOnly = null;
      const getDefsOnly = () => {
        if (isDefsOnly === null) isDefsOnly = defsOnly(paraText);
        return isDefsOnly;
      };
      const ind = curIndent(cur);
      let setextLevel = 0;
      if (ind <= 3) {
        const saved = { i: cur.i, col: cur.col, pend: cur.pend };
        curAdvance(cur, ind);
        const ch = curPeek(cur);
        if (ch === '=' || ch === '-') {
          const run = countRun(cur.s, cur.i, ch);
          let k = cur.i + run;
          let ok = true;
          while (k < cur.s.length) {
            if (cur.s[k] !== ' ' && cur.s[k] !== '\t') { ok = false; break; }
            k++;
          }
          if (ok && run >= 1) setextLevel = ch === '=' ? 1 : 2;
        }
        cur.i = saved.i; cur.col = saved.col; cur.pend = saved.pend;
      }
      // A paragraph that will finalize as a GFM table is not a
      // setext heading: an '=' line is a table body row (it joins
      // the paragraph), and a '-' line falls through to the
      // thematic-break/list handling below ('---' ends the table
      // with an <hr>, '-' and '--' join it as rows).
      if (setextLevel > 0 && !getDefsOnly() && !paragraphIsTable(curLeaf.lines)) {
        const rest = commitDefs(paraText);
        let t = rest;
        let a = 0;
        while (a < t.length && (t[a] === ' ' || t[a] === '\t')) a++;
        t = t.slice(a);
        // The last line's trailing spaces/tabs are stripped; a middle
        // line's trailing spaces stay (two or more make a hard break).
        t = t.replace(/[ \t]+$/, '');
        const idx = parent.children.indexOf(curLeaf);
        parent.children[idx] = { type: 'heading', level: setextLevel, text: t, open: false };
        continue;
      }
      if (interruptsParagraph(cur)) {
        finalizeLeaf(curLeaf, parent);
        const fullContent = lineContent(cur, expandLead);
        startBlock(cur, fullContent, li, pendingBlankStack);
        continue;
      }
      if (ind >= 4 && getDefsOnly()) {
        // A line that could be a title continuation of a definition
        // ("title", 'title', or (title)) is not code: it stays in the
        // paragraph so the definition can claim it.
        const saved2 = { i: cur.i, col: cur.col, pend: cur.pend };
        curAdvance(cur, ind);
        const firstCh = curPeek(cur);
        cur.i = saved2.i; cur.col = saved2.col; cur.pend = saved2.pend;
        if (firstCh !== '"' && firstCh !== "'" && firstCh !== '(') {
          finalizeLeaf(curLeaf, parent);
          const fullContent = lineContent(cur, expandLead);
          startBlock(cur, fullContent, li, pendingBlankStack);
          continue;
        }
      }
      let content = lineContent(cur, expandLead);
      // Four leading spaces are stripped only when the paragraph sits
      // directly in a list item (its code-indent compensation); a
      // paragraph inside a quote keeps them ("  > foo\n  >     bar"
      // keeps all four spaces).
      if (parent.type === 'item') {
        let sp = 0;
        while (sp < content.length && content[sp] === ' ') sp++;
        if (sp >= 4) content = content.slice(4);
      }
      curLeaf.lines.push(content);
      curLeaf.lastLazy = false;
      continue;
    }

    // ---- new block ----
    const fullContent = lineContent(cur, expandLead);
    if (trimLine(fullContent) === '') {
      // A whitespace-only line with no paragraph to continue creates
      // nothing; it still counts as a blank line for list looseness.
      blankStack = stack.slice();
      continue;
    }
    startBlock(cur, fullContent, li, pendingBlankStack);
  }

  closeFrom(0);
  return { root, refs };
}

// ---------------------------------------------------------------------------
// Rendering. Sibling blocks are concatenated directly; each block supplies
// its own trailing newline where marked does (html blocks supply none).
function renderBlocks(root, refs) {
  // Document-level inline state shared by every inlineParse call in
  // document order (an unclosed '<a>' suppresses later GFM
  // autolinks). One fresh state per document.
  const state = { inLink: false };
  let out = '';
  for (const node of root.children) out += renderBlock(node, refs, null, state);
  return out;
}
function renderBlock(node, refs, listCtx, state) {
  switch (node.type) {
    case 'paragraph': {
      const html = inlineParse(node.text, refs, false, state).html;
      if (listCtx && !listCtx.loose) return html;
      return '<p>' + html + '</p>\n';
    }
    case 'heading': {
      const html = inlineParse(node.text, refs, false, state).html;
      return '<h' + node.level + '>' + html + '</h' + node.level + '>\n';
    }
    case 'hr':
      return '<hr>\n';
    case 'fence': {
      // A fenced block's content loses exactly one trailing blank
      // line: "b\n\n" (a single trailing blank) becomes "b\n", while
      // "b\n\n\n" (two blanks) becomes "b\n\n".
      let lines = node.lines;
      if (lines.length > 0 && lines[lines.length - 1] === '') lines = lines.slice(0, -1);
      const code = lines.length ? lines.join('\n') + '\n' : '';
      const cls = node.lang ? ' class="language-' + escapeHtml(node.lang) + '"' : '';
      return '<pre><code' + cls + '>' + escapeHtmlStrict(code) + '</code></pre>\n';
    }
    case 'code': {
      const code = node.lines.length ? node.lines.join('\n') + '\n' : '';
      return '<pre><code>' + escapeHtmlStrict(code) + '</code></pre>\n';
    }
    case 'html': {
      let text = node.lines.map((l, idx) => l + (idx === node.lines.length - 1 && node.noTrailingNL ? '' : '\n')).join('');
      if (node.stripTrailing && text.endsWith('\n')) text = text.slice(0, -1);
      return text;
    }
    case 'quote': {
      let out = '<blockquote>\n';
      for (const child of node.children) out += renderBlock(child, refs, null, state);
      return out + '</blockquote>\n';
    }
    case 'list': {
      const tag = node.bullet ? 'ul' : 'ol';
      let open = '<' + tag;
      if (!node.bullet && node.start !== null && node.start !== 1) open += ' start="' + node.start + '"';
      open += '>\n';
      let out = open;
      for (const item of node.children) out += renderItem(item, refs, node.loose, state);
      return out + '</' + tag + '>\n';
    }
    case 'table': {
      let out = '<table>\n<thead>\n<tr>\n';
      for (let c = 0; c < node.header.length; c++) {
        const al = node.aligns[c];
        out += '<th' + (al ? ' align="' + al + '"' : '') + '>' +
          inlineParse(node.header[c], refs, false, state).html + '</th>\n';
      }
      out += '</tr>\n</thead>\n';
      if (node.rows.length > 0) {
        out += '<tbody>';
        for (const row of node.rows) {
          out += '<tr>\n';
          for (let c = 0; c < row.length; c++) {
            const al = node.aligns[c];
            out += '<td' + (al ? ' align="' + al + '"' : '') + '>' +
              inlineParse(row[c], refs, false, state).html + '</td>\n';
          }
          out += '</tr>\n';
        }
        out += '</tbody>';
      }
      return out + '</table>\n';
    }
  }
  return '';
}
function renderItem(item, refs, loose, state) {
  let out = '<li>';
  const ctx = { loose };
  let first = true;
  for (let idx = 0; idx < item.children.length; idx++) {
    const child = item.children[idx];
    if (first && child.type === 'paragraph') {
      const m = /^\[([ xX])\] /.exec(child.text);
      if (m) {
        const checked = m[1] === 'x' || m[1] === 'X';
        const box = checked
          ? '<input checked="" disabled="" type="checkbox">'
          : '<input disabled="" type="checkbox">';
        const html = inlineParse(child.text.slice(4), refs, false, state).html;
        if (!loose) out += box + ' ' + html;
        else out += '<p>' + box + ' ' + html + '</p>\n';
        first = false;
        continue;
      }
    }
    if (child.type === 'html') {
      // An HTML block in a list item loses its trailing newline when
      // it is the last child (the </li> follows directly) or when
      // the next source line is blank (stripTrailing); otherwise the
      // newline is kept before the following block.
      let text = child.lines.map((l, idx) => l + (idx === child.lines.length - 1 && child.noTrailingNL ? '' : '\n')).join('');
      const isLast = idx === item.children.length - 1;
      if ((isLast || child.stripTrailing) && text.endsWith('\n')) text = text.slice(0, -1);
      out += text;
      first = false;
      continue;
    }
    out += renderBlock(child, refs, ctx, state);
    first = false;
  }
  return out + '</li>\n';
}
