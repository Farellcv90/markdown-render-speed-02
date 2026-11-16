// parse.js — a fast CommonMark 0.31.2 + GFM renderer, written from scratch.
// parse(markdown) returns exactly the HTML marked 18.1.3 produces with its
// default options (gfm on, breaks off, pedantic off). Dependency-free ES module.

// Marked leaks an "inside a link" flag across inline parses in one
// document: an <a ...> opening tag (with a literal space after <a) sets
// it, a </a> clears it, and while set, bare email/URL/www autolinks are
// not created (angle autolinks and markdown links still are). Reset at
// the start of every parse() call; parse() is called sequentially.
let inLink = false;

// Escape &, <, >, ", ' for text and code output.
const NEED_ESC = /[&<>"']/;
function esc(s) {
  if (!NEED_ESC.test(s)) return s;
  let out = '', start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    let rep = null;
    if (c === 38) rep = '&amp;';
    else if (c === 60) rep = '&lt;';
    else if (c === 62) rep = '&gt;';
    else if (c === 34) rep = '&quot;';
    else if (c === 39) rep = '&#39;';
    if (rep !== null) { out += s.slice(start, i) + rep; start = i + 1; }
  }
  return out + s.slice(start);
}

function isSpaceCh(c) {
  return c === 32 || c === 9 || c === 10 || c === 11 || c === 12 || c === 13;
}
function isDigit(c) { return c >= 48 && c <= 57; }
function isAlphaNum(c) {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}
function isPunctCode(c) {
  // ASCII punctuation, per CommonMark.
  return (c >= 33 && c <= 47) || (c >= 58 && c <= 64) ||
    (c >= 91 && c <= 96) || (c >= 123 && c <= 126);
}
const NONASCII_PUNCT = /[\p{P}\p{S}]/u;
const NONASCII_SPACE = /\p{Z}|\u00A0/u;
function isPunctCh(ch) {
  const c = ch.charCodeAt(0);
  if (c < 128) return isPunctCode(c);
  return NONASCII_PUNCT.test(ch);
}
function isSpaceChStr(ch) {
  const c = ch.charCodeAt(0);
  if (c < 128) return isSpaceCh(c);
  return NONASCII_SPACE.test(ch);
}

// If s[i] starts a valid entity reference, return the index just past it:
// a named reference &name; (name = [A-Za-z0-9_]+) or a numeric one
// &#digits; (1-7 digits) / &#x hex; (1-6 hex digits). Else 0.
function entityRefAt(s, i) {
  const n = s.length;
  if (i + 1 >= n) return 0;
  if (s.charCodeAt(i + 1) === 35) {
    let j = i + 2, hex = false;
    if (j < n && (s.charCodeAt(j) === 120 || s.charCodeAt(j) === 88)) { hex = true; j++; }
    const ds = j;
    while (j < n) {
      const c = s.charCodeAt(j);
      if (c >= 48 && c <= 57) j++;
      else if (hex && ((c >= 97 && c <= 102) || (c >= 65 && c <= 70))) j++;
      else break;
    }
    const digits = j - ds;
    if (digits === 0 || digits > (hex ? 6 : 7)) return 0;
    if (j >= n || s.charCodeAt(j) !== 59) return 0;
    return j + 1;
  }
  let j = i + 1;
  while (j < n) {
    const c = s.charCodeAt(j);
    if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95) j++;
    else break;
  }
  if (j === i + 1 || j >= n || s.charCodeAt(j) !== 59) return 0;
  return j + 1;
}

// Resolve an entity starting at s[i] === '&'. Returns ['char', decoded, end]
// for a numeric entity (decoded to a character, U+FFFD when the value is 0,
// a surrogate or above U+10FFFF), ['ent', verbatim, end] for a named one
// (marked leaves named references untouched), or null.
function entityAt(s, i) {
  const n = s.length;
  if (i + 1 >= n) return null;
  if (s.charCodeAt(i + 1) !== 35) {
    const e = entityRefAt(s, i);
    if (!e) return null;
    return ['ent', s.slice(i, e), e];
  }
  let j = i + 2, hex = false;
  if (j < n && (s.charCodeAt(j) === 120 || s.charCodeAt(j) === 88)) { hex = true; j++; }
  let val = 0, digits = 0;
  while (j < n) {
    const c = s.charCodeAt(j);
    let d = -1;
    if (c >= 48 && c <= 57) d = c - 48;
    else if (hex && c >= 97 && c <= 102) d = c - 87;
    else if (hex && c >= 65 && c <= 70) d = c - 55;
    else break;
    if (digits >= (hex ? 6 : 7)) return null;
    val = val * (hex ? 16 : 10) + d;
    digits++;
    j++;
  }
  if (digits === 0 || j >= n || s.charCodeAt(j) !== 59) return null;
  if (val === 0 || val > 0x10FFFF || (val >= 0xD800 && val <= 0xDFFF)) val = 0xFFFD;
  return ['char', String.fromCodePoint(val), j + 1];
}

// Escape HTML, but leave an & alone when it starts a valid entity
// reference. Used for hrefs, titles, fence languages and image alt text.
function escNoEncode(s) {
  let out = '', start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    let rep = null;
    if (c === 38) {
      const e = entityRefAt(s, i);
      if (e) { out += s.slice(start, e); start = e; i = e - 1; continue; }
      rep = '&amp;';
    }
    else if (c === 60) rep = '&lt;';
    else if (c === 62) rep = '&gt;';
    else if (c === 34) rep = '&quot;';
    else if (c === 39) rep = '&#39;';
    if (rep !== null) { out += s.slice(start, i) + rep; start = i + 1; }
  }
  return start === 0 ? s : out + s.slice(start);
}

const HEXD = '0123456789ABCDEF';
function pct(b) { return '%' + HEXD[(b >> 4) & 15] + HEXD[b & 15]; }

// href processing: percent-encode the way marked does (encodeURI's set,
// except a bare % is left alone; non-ASCII is UTF-8 percent-encoded), then
// escape with entities preserved. Never throws.
function hrefOut(url) {
  let out = '', start = 0;
  const n = url.length;
  let i = 0;
  while (i < n) {
    const c = url.charCodeAt(i);
    if (c < 128) {
      if (c === 32 || c === 34 || c === 60 || c === 62 || c === 96 || c === 92 ||
        c === 94 || c === 124 || c === 123 || c === 125 || c === 91 || c === 93 ||
        c < 32 || c === 127) {
        out += url.slice(start, i) + pct(c);
        start = i + 1;
      }
      i++;
      continue;
    }
    let cp = url.codePointAt(i);
    const adv = cp > 0xFFFF ? 2 : 1;
    out += url.slice(start, i);
    start = i + adv;
    if (cp >= 0xD800 && cp <= 0xDFFF) cp = 0xFFFD;
    if (cp < 0x800) {
      out += pct(0xC0 | (cp >> 6)) + pct(0x80 | (cp & 63));
    } else if (cp < 0x10000) {
      out += pct(0xE0 | (cp >> 12)) + pct(0x80 | ((cp >> 6) & 63)) + pct(0x80 | (cp & 63));
    } else {
      out += pct(0xF0 | (cp >> 18)) + pct(0x80 | ((cp >> 12) & 63)) + pct(0x80 | ((cp >> 6) & 63)) + pct(0x80 | (cp & 63));
    }
    i += adv;
  }
  const enc = start === 0 ? url : out + url.slice(start);
  return escNoEncode(enc);
}

// ---------------------------------------------------------------------------
// Inline parsing
// ---------------------------------------------------------------------------

function resolveEscapes(str) {
  if (str.indexOf('\\') === -1) return str;
  let out = '', start = 0;
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) === 92 && i + 1 < str.length && isPunctCode(str.charCodeAt(i + 1))) {
      out += str.slice(start, i) + str[i + 1];
      i++;
      start = i + 1;
    }
  }
  return start === 0 ? str : out + str.slice(start);
}

function normalizeLabel(raw) {
  // Labels use the raw source: whitespace is collapsed and the label is
  // case-folded, but backslash escapes are NOT resolved (foo\! is a
  // different label from foo!). Unicode case folding maps ß and ẞ to ss.
  let s = raw.replace(/\s+/g, ' ');
  if (s.charCodeAt(0) === 32) s = s.slice(1);
  if (s.length && s.charCodeAt(s.length - 1) === 32) s = s.slice(0, -1);
  return s.toLowerCase().replace(/ß/g, 'ss');
}

// Find the closing backtick run of exactly `run` backticks starting at or
// after `from`. Returns the index just past it, or -1.
function scanCodeClose(s, from, run) {
  const n = s.length;
  let i = from;
  while (i < n) {
    if (s.charCodeAt(i) === 96) {
      let j = i;
      while (j < n && s.charCodeAt(j) === 96) j++;
      if (j - i === run) return j;
      i = j;
    } else i++;
  }
  return -1;
}

// Scan link text starting at s[i] (just after '['). Returns the index of the
// ']' that ends the text, or -1. `depth` is the bracket nesting depth of the
// current text (0 for a link's text, 1 inside a group, ...). Groups nest at
// most two deep.
function scanTextInner(s, i, depth) {
  const n = s.length;
  // Code-span state for this bracket level: `spanLen` is the length of the
  // run that opened the current span (0 = outside a span), `spanEnd` the
  // index just past that opening run. A run closes the span whatever its
  // length (marked's link-text scanner pairs a run with the NEXT run, not
  // the next run of the same length). An unclosed run swallows ']' — except
  // a run of length >= 2 immediately followed by ']' at the top level, and
  // any unclosed run inside a nested group, where ']' still closes it.
  // (So `` ``a ` b`` `` at the end of the text forms a link, but
  // `` ``a ` b`` output`` does not; a lone `` ``url` `` always does.)
  let spanLen = 0, spanEnd = -1;
  while (i < n) {
    const c = s.charCodeAt(i);
    if (c === 93) { // ]
      if (spanLen === 0) return i;
      if (depth > 0 || (spanLen >= 2 && i === spanEnd)) return i;
      i++;
      continue;
    }
    if (spanLen !== 0) {
      // Inside a code span: only a backtick run can close it; '[', ']',
      // '\' and '<' are literal content here.
      if (c === 96) {
        let j = i;
        while (j < n && s.charCodeAt(j) === 96) j++;
        spanLen = 0; spanEnd = -1;
        i = j;
        continue;
      }
      i++;
      continue;
    }
    if (c === 92) { // backslash: skip the escaped char
      i += (i + 1 < n) ? 2 : 1;
      continue;
    }
    if (c === 96) { // backtick run: opens a code span
      let j = i;
      while (j < n && s.charCodeAt(j) === 96) j++;
      spanLen = j - i; spanEnd = j;
      i = j;
      continue;
    }
    if (c === 91) { // [ starts a nested group
      if (depth >= 2) return -1;
      const g = scanTextInner(s, i + 1, depth + 1);
      if (g === -1) return -1;
      i = g + 1;
      continue;
    }
    if (c === 60) { // < — skip a complete tag or autolink, so a ] inside
      // it does not close the label
      const al = scanAngleAutolink(s, i);
      if (al) { i = al.end; continue; }
      const he = scanHtml(s, i);
      if (he !== -1) { i = he; continue; }
    }
    i++;
  }
  return -1;
}

// The link text, with escapes resolved and code spans removed, must not end
// with an unmatched '['. Code spans use the same toggle rule as
// scanTextInner: a run opens a span, the next run of any length closes it.
function textBalanced(raw) {
  let depth = 0;
  const n = raw.length;
  let i = 0;
  let spanLen = 0;
  while (i < n) {
    const c = raw.charCodeAt(i);
    if (c === 92) { // backslash: skip the escaped char (outside a span)
      if (spanLen === 0) { i += (i + 1 < n) ? 2 : 1; continue; }
      i++;
      continue;
    }
    if (c === 96) {
      let j = i;
      while (j < n && raw.charCodeAt(j) === 96) j++;
      spanLen = spanLen === 0 ? j - i : 0;
      i = j;
      continue;
    }
    if (spanLen === 0) {
      if (c === 91) depth++;
      else if (c === 93 && depth > 0) depth--;
    }
    i++;
  }
  return depth === 0;
}

function skipWsNl(s, i) {
  while (i < s.length) {
    const c = s.charCodeAt(i);
    if (c === 32 || c === 9 || c === 10) i++;
    else break;
  }
  return i;
}

// Parse a link title starting at s[p] ('"', "'" or '('). Returns
// {title, end} or null.
function parseTitle(s, p) {
  const open = s.charCodeAt(p);
  const close = open === 40 ? 41 : open;
  let q = p + 1;
  const n = s.length;
  while (q < n) {
    const c = s.charCodeAt(q);
    if (c === 92 && q + 1 < n) { q += 2; continue; }
    if (c === close) return { title: resolveEscapes(s.slice(p + 1, q)), end: q + 1 };
    if (open === 40 && c === 40) return null;
    q++;
  }
  return null;
}

// Parse an inline link destination starting at s[i] === '('.
// Returns {href, title, end} (end just past ')') or null.
function parseInlineDest(s, i) {
  const n = s.length;
  let p = skipWsNl(s, i + 1);
  if (p >= n) return null;
  let href;
  if (s.charCodeAt(p) === 60) { // <...>
    let q = p + 1;
    let ok = false;
    while (q < n) {
      const c = s.charCodeAt(q);
      if (c === 10 || c === 60) return null;
      if (c === 62) { ok = true; break; }
      if (c === 92 && q + 1 < n) q += 2; else q++;
    }
    if (!ok) return null;
    href = resolveEscapes(s.slice(p + 1, q));
    p = q + 1;
  } else {
    let depth = 0, q = p;
    while (q < n) {
      const c = s.charCodeAt(q);
      if (c <= 32 || c === 127) break;
      if (c === 92 && q + 1 < n) { q += 2; continue; }
      if (c === 40) depth++;
      else if (c === 41) { if (depth === 0) break; depth--; }
      q++;
    }
    href = resolveEscapes(s.slice(p, q));
    p = q;
  }
  p = skipWsNl(s, p);
  let title = null;
  if (p < n) {
    const c = s.charCodeAt(p);
    if (c === 34 || c === 39 || c === 40) {
      const t = parseTitle(s, p);
      if (!t) return null;
      title = t.title;
      p = skipWsNl(s, t.end);
    }
  }
  if (p >= n || s.charCodeAt(p) !== 41) return null;
  return { href, title, end: p + 1 };
}

// Node kinds: 0 text, 1 code, 2 html, 3 hard break, 4 link, 5 image,
// 6 em/strong/del, 7 delimiter (temporary), 8 verbatim entity reference
function plainText(nodes) {
  let out = '';
  for (const nd of nodes) {
    if (nd.k === 0) out += nd.s;
    else if (nd.k === 1) out += nd.s;
    else if (nd.k === 2) out += nd.s;
    else if (nd.k === 4 || nd.k === 6) out += plainText(nd.ch);
    else if (nd.k === 5) out += nd.alt;
    else if (nd.k === 3) out += '\n';
    else if (nd.k === 7) out += nd.ch.repeat(nd.n);
    else if (nd.k === 8) out += nd.s;
  }
  return out;
}
function containsLink(nodes) {
  // Only a bracket link inside the link text blocks the outer link; an
  // autolink (angle, extended, email) inside it does not.
  for (const nd of nodes) {
    if (nd.k === 4 && nd.br) return true;
    if (nd.k === 6 && containsLink(nd.ch)) return true;
  }
  return false;
}

// Case-insensitive scheme check for extended autolinks: returns 8 for
// https://, 7 for http://, 6 for ftp://, else 0. The http/https/ftp
// schemes are case-insensitive (Https:// links); www. and mailto: are not.
function schemeLenAt(s, i) {
  const c = s.charCodeAt(i);
  if (c === 104 || c === 72) { // h/H
    const c1 = s.charCodeAt(i + 1), c2 = s.charCodeAt(i + 2), c3 = s.charCodeAt(i + 3);
    if ((c1 === 116 || c1 === 84) && (c2 === 116 || c2 === 84) && (c3 === 112 || c3 === 80)) {
      if (s.charCodeAt(i + 4) === 58 && s.charCodeAt(i + 5) === 47 && s.charCodeAt(i + 6) === 47) return 7;
      const c4 = s.charCodeAt(i + 4);
      if ((c4 === 115 || c4 === 83) && s.charCodeAt(i + 5) === 58 && s.charCodeAt(i + 6) === 47 && s.charCodeAt(i + 7) === 47) return 8;
    }
  } else if (c === 102 || c === 70) { // f/F
    const c1 = s.charCodeAt(i + 1), c2 = s.charCodeAt(i + 2);
    if ((c1 === 116 || c1 === 84) && (c2 === 112 || c2 === 80) &&
      s.charCodeAt(i + 3) === 58 && s.charCodeAt(i + 4) === 47 && s.charCodeAt(i + 5) === 47) return 6;
  }
  return 0;
}

// Scan for an extended autolink starting at s[i].
// Returns {end, href, text} (end = index just past the URL) or null.
// kind: 'scheme' (http/https/ftp), 'www', 'email'.
function scanExtAutolink(s, i, prevKind) {
  const n = s.length;
  // scheme autolinks: http:// https:// ftp:// (case-insensitive)
  let urlStart = -1, prefix = '', schemeLen = 0;
  const sl = schemeLenAt(s, i);
  if (sl) { urlStart = i; schemeLen = sl; }
  else if (s.startsWith('www.', i)) {
    // preceding-char rule
    if (i > 0 && prevKind !== 'start' && prevKind !== 'escape' && prevKind !== 'nontext') {
      const pc = s.charCodeAt(i - 1);
      if (!(pc === 32 || pc === 9 || pc === 10 || pc === 40 || pc === 91 || pc === 42 || pc === 95 || pc === 126)) return null;
    }
    const fc = i + 4 < n ? s.charCodeAt(i + 4) : -1;
    if (!((fc >= 48 && fc <= 57) || (fc >= 65 && fc <= 90) || (fc >= 97 && fc <= 122) || fc === 45 || fc === 95)) return null;
    urlStart = i; prefix = 'http://'; schemeLen = 4;
  }
  if (urlStart === -1) return null;
  // host's first char must be [A-Za-z0-9_-]
  const hstart = urlStart + schemeLen;
  const hc = hstart < n ? s.charCodeAt(hstart) : -1;
  if (!((hc >= 48 && hc <= 57) || (hc >= 65 && hc <= 90) || (hc >= 97 && hc <= 122) || hc === 45 || hc === 95)) return null;
  // consume until whitespace or <; stop before a named entity reference
  let e = hstart;
  while (e < n) {
    const c = s.charCodeAt(e);
    if (c === 32 || c === 9 || c === 10 || c === 60) break;
    if (c === 38) {
      // &name; ends the URL (a numeric reference does not)
      let j = e + 1;
      while (j < n) {
        const d = s.charCodeAt(j);
        if ((d >= 48 && d <= 57) || (d >= 65 && d <= 90) || (d >= 97 && d <= 122) || d === 95) j++;
        else break;
      }
      if (j > e + 1 && j < n && s.charCodeAt(j) === 59) break;
    }
    e++;
  }
  let url = s.slice(urlStart, e);
  // trim trailing punctuation, then paren handling
  url = trimAutolink(url);
  if (!url) return null;
  return { end: urlStart + url.length, href: prefix + url, text: url };
}

// Trim an extended-autolink candidate: trailing punctuation, unclosed '('
// cut, and trailing ')' balancing. Punctuation revealed by stripping a
// trailing ')' must itself be stripped (e.g. `http://x/a..)` -> `http://x/a`,
// `www.x.com!.)` -> `http://www.x.com`), so the passes repeat until the
// string stops changing.
function trimAutolink(url) {
  const PUNCT = '? ! . , : ; * _ ~ \' "'.split(' ');
  let u = url;
  for (;;) {
    const before = u;
    // trailing punctuation (repeatedly)
    let end = u.length;
    for (;;) {
      if (end === 0) return '';
      const c = u.charCodeAt(end - 1);
      let isP = false;
      for (const p of PUNCT) if (c === p.charCodeAt(0)) { isP = true; break; }
      if (!isP) break;
      end--;
    }
    u = u.slice(0, end);
    // cut at the first '(' that has no ')' anywhere after it
    let cut = -1;
    for (let i = 0; i < u.length; i++) {
      if (u.charCodeAt(i) === 40) {
        let hasClose = false;
        for (let j = i + 1; j < u.length; j++) if (u.charCodeAt(j) === 41) { hasClose = true; break; }
        if (!hasClose) { cut = i; break; }
      }
    }
    if (cut !== -1) u = u.slice(0, cut);
    // trailing ')' handling: strip while more than one ')' follows the last '('
    // (or strip all trailing ')' when there is no '(' at all)
    for (;;) {
      if (u.length === 0 || u.charCodeAt(u.length - 1) !== 41) break;
      let lastOpen = -1;
      for (let i = u.length - 1; i >= 0; i--) if (u.charCodeAt(i) === 40) { lastOpen = i; break; }
      let closes = 0;
      for (let i = lastOpen + 1; i < u.length; i++) if (u.charCodeAt(i) === 41) closes++;
      if (lastOpen === -1) { u = u.slice(0, -1); continue; }
      if (closes > 1) { u = u.slice(0, -1); continue; }
      break;
    }
    if (u === before) return u;
  }
}

// Try to match an email extended autolink whose local part ends at s[at]
// (s[at] === '@'). `runStart` is the index where the current text run began
// (the local part cannot start before it). Returns {start, end, text} or null.
// True when the character at s[pos] is escaped by an odd run of
// backslashes immediately before it.
function isEscapedAt(s, pos) {
  let k = pos - 1, count = 0;
  while (k >= 0 && s.charCodeAt(k) === 92) { count++; k--; }
  return (count % 2) === 1;
}

function scanEmail(s, at, runStart, delims) {
  const n = s.length;
  // Scan the domain first: its end is needed to tell whether a _ before
  // the local part is an emphasis opener (a closer follows the domain).
  let p = at + 1;
  if (p >= n) return null;
  let labels = 0, lastEnd = -1;
  while (p < n) {
    const st = p;
    while (p < n) {
      const c = s.charCodeAt(p);
      if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 45 || c === 95) {
        if (c === 95 && delims) {
          // A run of _ that ends the domain and is a live emphasis
          // closer (an unmatched _ opener precedes it) is not part of
          // the domain; stop the label before the whole run.
          let q = p;
          while (q < n && s.charCodeAt(q) === 95) q++;
          const nc = q < n ? s.charCodeAt(q) : -1;
          const ncDomain = (nc >= 48 && nc <= 57) || (nc >= 65 && nc <= 90) || (nc >= 97 && nc <= 122) || nc === 45 || nc === 95 || nc === 46;
          if (!ncDomain && hasLiveUnderscoreOpener(delims)) break;
        }
        p++;
      }
      else break;
    }
    if (p === st) break;
    labels++;
    lastEnd = p;
    if (p < n && s.charCodeAt(p) === 46) { p++; continue; }
    break;
  }
  if (labels < 2) return null;
  const lc = s.charCodeAt(lastEnd - 1);
  if (lc === 95 || lc === 45) return null;
  // Walk back the local part.
  let ls = at;
  while (ls > runStart) {
    const c = s.charCodeAt(ls - 1);
    if (!((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 46 || c === 95 || c === 43 || c === 45)) break;
    // An escaped character is not part of the local part: stop before it.
    if (isEscapedAt(s, ls - 1)) break;
    // A _ that is part of a live _ opener delimiter is not part of the
    // local part, but only when a _ closer follows the domain (otherwise
    // the _ is a literal underscore in the address).
    if (c === 95 && delims && isLiveUnderscoreOpenerAt(delims, ls - 1) && lastEnd < n && s.charCodeAt(lastEnd) === 95) break;
    ls--;
  }
  if (ls === at) return null;
  return { start: ls, end: lastEnd, text: s.slice(ls, lastEnd) };
}

// Is the _ at source position p part of a live _ opener delimiter
// (a delimiter run that can open emphasis and has not been used up)?
function isLiveUnderscoreOpenerAt(delims, p) {
  for (let d = delims.length - 1; d >= 0; d--) {
    const nd = delims[d];
    if (nd.ch === '_' && nd.o && nd.n > 0 && nd.pos !== undefined && p >= nd.pos && p < nd.pos + nd.n) return true;
  }
  return false;
}

// Is there a live (unmatched) _ opener before the current position?
// The most recent _ delimiter decides: if it can open, its opener is
// still live; if it can only close, any earlier opener is already
// paired with it (or with a closer after it).
function hasLiveUnderscoreOpener(delims) {
  for (let d = delims.length - 1; d >= 0; d--) {
    const nd = delims[d];
    if (nd.ch !== '_') continue;
    return nd.o && nd.n > 0;
  }
  return false;
}

// Parse an inline HTML construct starting at s[i] === '<'.
// Returns the end index (just past the construct) or -1.
function scanHtml(s, i) {
  const n = s.length;
  if (i + 1 >= n) return -1;
  const c1 = s.charCodeAt(i + 1);
  if (c1 === 33) { // ! -- comment, CDATA, declaration
    if (s.startsWith('<!--', i)) {
      // <!--> and <!---> are abruptly-closed comments; otherwise the
      // comment runs to the first -->.
      if (s.charCodeAt(i + 4) === 62) return i + 5;
      if (s.charCodeAt(i + 4) === 45 && s.charCodeAt(i + 5) === 62) return i + 6;
      const e = s.indexOf('-->', i + 4);
      return e === -1 ? -1 : e + 3;
    }
    if (s.startsWith('<![CDATA[', i)) {
      const e = s.indexOf(']]>', i + 9);
      return e === -1 ? -1 : e + 3;
    }
    if (i + 2 < n) {
      const c2 = s.charCodeAt(i + 2);
      if (c2 >= 65 && c2 <= 90) {
        const e = s.indexOf('>', i + 3);
        return e === -1 ? -1 : e + 1;
      }
    }
    return -1;
  }
  if (c1 === 63) { // <? ... ?>
    const e = s.indexOf('?>', i + 2);
    return e === -1 ? -1 : e + 2;
  }
  // open or close tag
  let p = i + 1;
  let closing = false;
  if (p < n && s.charCodeAt(p) === 47) { closing = true; p++; }
  if (p >= n) return -1;
  const tc = s.charCodeAt(p);
  if (!((tc >= 65 && tc <= 90) || (tc >= 97 && tc <= 122))) return -1;
  while (p < n) {
    const c = s.charCodeAt(p);
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 45) p++;
    else break;
  }
  // After the tag name only whitespace, / or > may follow.
  if (p < n) {
    const d = s.charCodeAt(p);
    if (d !== 32 && d !== 9 && d !== 10 && d !== 47 && d !== 62) return -1;
  } else return -1;
  // A closing tag takes no attributes: only whitespace, then >.
  if (closing) {
    while (p < n && (s.charCodeAt(p) === 32 || s.charCodeAt(p) === 9 || s.charCodeAt(p) === 10)) p++;
    return (p < n && s.charCodeAt(p) === 62) ? p + 1 : -1;
  }
  // attributes / close
  for (;;) {
    while (p < n && (s.charCodeAt(p) === 32 || s.charCodeAt(p) === 9 || s.charCodeAt(p) === 10)) p++;
    if (p >= n) return -1;
    const c = s.charCodeAt(p);
    if (c === 62) return p + 1; // >
    if (c === 47) { // / — must be followed by >
      if (p + 1 < n && s.charCodeAt(p + 1) === 62) return p + 2;
      return -1;
    }
    // attribute name: [A-Za-z_:][A-Za-z0-9_.:-]*
    if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 58)) return -1;
    while (p < n) {
      const d = s.charCodeAt(p);
      if ((d >= 65 && d <= 90) || (d >= 97 && d <= 122) || (d >= 48 && d <= 57) || d === 95 || d === 58 || d === 46 || d === 45) p++;
      else break;
    }
    while (p < n && (s.charCodeAt(p) === 32 || s.charCodeAt(p) === 9 || s.charCodeAt(p) === 10)) p++;
    if (p < n && s.charCodeAt(p) === 61) { // =
      p++;
      while (p < n && (s.charCodeAt(p) === 32 || s.charCodeAt(p) === 9 || s.charCodeAt(p) === 10)) p++;
      if (p >= n) return -1;
      const q = s.charCodeAt(p);
      if (q === 34 || q === 39) {
        const e = s.indexOf(String.fromCharCode(q), p + 1);
        if (e === -1) return -1;
        p = e + 1;
      } else {
        if (q === 32 || q === 9 || q === 10 || q === 61 || q === 62 || q === 60 || q === 96) return -1;
        while (p < n) {
          const d = s.charCodeAt(p);
          if (d === 32 || d === 9 || d === 10 || d === 61 || d === 62 || d === 60 || d === 96 || d === 34 || d === 39) break;
          p++;
        }
      }
      // After a value, only whitespace, / or > may follow.
      if (p < n) {
        const d = s.charCodeAt(p);
        if (d !== 32 && d !== 9 && d !== 10 && d !== 47 && d !== 62) return -1;
      }
    }
  }
}

// Try an autolink <...> starting at s[i] === '<'. Returns {href, text, end}
// or null (then the caller tries inline HTML).
function scanAngleAutolink(s, i) {
  const n = s.length;
  let j = i + 1;
  // scheme: letter, then 1..31 [A-Za-z0-9+.-], then :
  if (j < n) {
    const c0 = s.charCodeAt(j);
    if ((c0 >= 65 && c0 <= 90) || (c0 >= 97 && c0 <= 122)) {
      let k = j + 1;
      while (k < n && k - j <= 32) {
        const c = s.charCodeAt(k);
        if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 43 || c === 46 || c === 45) k++;
        else break;
      }
      if (k - j >= 2 && k < n && s.charCodeAt(k) === 58) {
        // content until > : no space, no <, no newline
        let e = k + 1;
        while (e < n) {
          const c = s.charCodeAt(e);
          if (c === 62) {
            const text = s.slice(i + 1, e);
            return { href: text, text, end: e + 1 };
          }
          if (c === 32 || c === 60 || c === 10) return null;
          e++;
        }
        return null;
      }
    }
  }
  // email: local@domain (CommonMark email pattern)
  const m = /^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*>/.exec(s.slice(i + 1));
  if (m) {
    const text = m[0].slice(0, -1);
    return { href: 'mailto:' + text, text, end: i + 1 + m[0].length };
  }
  return null;
}

// The inline scanner. Returns an array of nodes with emphasis resolved.
function isWordCh(c) {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
}

// Remove `count` characters from the end of the accumulated inline
// content: first from the pending text buffer, then from the nodes in
// reverse order (text and delimiter nodes only). Returns the new text
// buffer. Delimiter nodes that are removed entirely are also dropped
// from the delims list.
function truncateTail(nodes, delims, text, count) {
  let need = count;
  if (text.length >= need) return text.slice(0, text.length - need);
  need -= text.length;
  text = '';
  while (need > 0 && nodes.length > 0) {
    const last = nodes[nodes.length - 1];
    if (last.k === 0) {
      const sl = last.s.length;
      if (sl > need) { last.s = last.s.slice(0, sl - need); need = 0; }
      else { need -= sl; nodes.pop(); }
    } else if (last.k === 7) {
      if (last.n > need) { last.n -= need; need = 0; }
      else {
        need -= last.n;
        nodes.pop();
        const di = delims.indexOf(last);
        if (di !== -1) delims.splice(di, 1);
      }
    } else break;
  }
  return text;
}

function parseInline(s, refs, noAuto) {
  const nodes = [];
  const delims = [];
  let text = '';
  let prevKind = 'start'; // start | text | entity | escape | nontext
  const n = s.length;
  let i = 0;
  function flushText() {
    if (text !== '') { nodes.push({ k: 0, s: text }); text = ''; }
  }
  function pushText(str, kind) { text += str; prevKind = kind; }

  while (i < n) {
    const c = s.charCodeAt(i);
    // plain-text run: jump to the next trigger char
    if (c !== 92 && c !== 96 && c !== 60 && c !== 38 && c !== 91 && c !== 93 &&
      c !== 42 && c !== 95 && c !== 126 && c !== 64 && c !== 10 &&
      !(c === 33 && i + 1 < n && s.charCodeAt(i + 1) === 91) &&
      !((c === 104 || c === 72 || c === 102 || c === 70) && schemeLenAt(s, i)) &&
      !(c === 119 && s.startsWith('www.', i))) {
      let j = i + 1;
      while (j < n) {
        const d = s.charCodeAt(j);
        if (d === 92 || d === 96 || d === 60 || d === 38 || d === 91 || d === 93 ||
          d === 42 || d === 95 || d === 126 || d === 64 || d === 10) break;
        if (d === 33 && j + 1 < n && s.charCodeAt(j + 1) === 91) break;
        if ((d === 104 || d === 72 || d === 102 || d === 70) && schemeLenAt(s, j)) break;
        if (d === 119 && s.startsWith('www.', j)) break;
        j++;
      }
      text += s.slice(i, j);
      prevKind = 'text';
      i = j;
      continue;
    }
    if (c === 10) { // newline: soft break, or hard break after 2+ spaces
      let sp = 0;
      for (let q = text.length - 1; q >= 0 && text.charCodeAt(q) === 32; q--) sp++;
      if (sp >= 2) {
        text = text.slice(0, text.length - sp);
        flushText();
        nodes.push({ k: 3 });
        prevKind = 'nontext';
        // A hard break discards the next line's leading whitespace.
        i++;
        while (i < n && (s.charCodeAt(i) === 32 || s.charCodeAt(i) === 9)) i++;
        continue;
      } else {
        text += '\n';
        prevKind = 'text';
      }
      i++;
      continue;
    }
    if (c === 92) { // backslash
      if (i + 1 < n) {
        const d = s.charCodeAt(i + 1);
        if (d === 10) {
          flushText();
          nodes.push({ k: 3 });
          prevKind = 'nontext';
          i += 2;
          // A hard break discards the next line's leading whitespace.
          while (i < n && (s.charCodeAt(i) === 32 || s.charCodeAt(i) === 9)) i++;
          continue;
        }
        if (isPunctCode(d)) { pushText(s[i + 1], 'escape'); i += 2; continue; }
      }
      pushText('\\', 'text');
      i++;
      continue;
    }
    if (c === 96) { // code span
      let j = i;
      while (j < n && s.charCodeAt(j) === 96) j++;
      const run = j - i;
      const k = scanCodeClose(s, j, run);
      if (k === -1) { pushText('`'.repeat(run), 'text'); i = j; continue; }
      let content = s.slice(j, k - run);
      if (content.indexOf('\n') !== -1) content = content.split('\n').join(' ');
      if (content.length > 1 && content.charCodeAt(0) === 32 && content.charCodeAt(content.length - 1) === 32) {
        let allSp = true;
        for (let q = 0; q < content.length; q++) if (content.charCodeAt(q) !== 32) { allSp = false; break; }
        if (!allSp) content = content.slice(1, -1);
      }
      flushText();
      nodes.push({ k: 1, s: content });
      prevKind = 'nontext';
      i = k;
      continue;
    }
    if (c === 60) { // < autolink or inline HTML
      const al = scanAngleAutolink(s, i);
      if (al) {
        flushText();
        nodes.push({ k: 4, href: al.href, title: null, ch: [{ k: 0, s: al.text }] });
        prevKind = 'nontext';
        i = al.end;
        continue;
      }
      const he = scanHtml(s, i);
      if (he !== -1) {
        // Track marked's leaked inLink flag: <a␣ opens it, </a> closes it.
        const a1 = s.charCodeAt(i + 1);
        if ((a1 === 97 || a1 === 65) && s.charCodeAt(i + 2) === 32) inLink = true;
        else if (a1 === 47) {
          const a2 = s.charCodeAt(i + 2);
          const a3 = s.charCodeAt(i + 3);
          if ((a2 === 97 || a2 === 65) && (a3 === 62 || a3 === 32 || a3 === 9 || a3 === 10 || a3 === 13)) inLink = false;
        }
        flushText();
        nodes.push({ k: 2, s: s.slice(i, he) });
        prevKind = 'nontext';
        i = he;
        continue;
      }
      pushText('<', 'text');
      i++;
      continue;
    }
    if (c === 38) { // & entity: numeric decodes, named stays verbatim
      const e = entityAt(s, i);
      if (e) {
        if (e[0] === 'char') { pushText(e[1], 'text'); i = e[2]; continue; }
        flushText();
        nodes.push({ k: 8, s: e[1] });
        prevKind = 'entity';
        i = e[2];
        continue;
      }
      pushText('&', 'text');
      i++;
      continue;
    }
    if (c === 91 || (c === 33 && i + 1 < n && s.charCodeAt(i + 1) === 91)) {
      const img = c === 33;
      const ts = i + (img ? 2 : 1);
      const closeIdx = scanTextInner(s, ts, 0);
      let done = false;
      if (closeIdx !== -1) {
        const textSrc = s.slice(ts, closeIdx);
        const after = closeIdx + 1;
        let dest = null;
        if (after < n && s.charCodeAt(after) === 40) {
          dest = parseInlineDest(s, after);
          if (!dest) {
            // A failed inline destination falls back to the shortcut
            // reference link.
            const ref = refs.get(normalizeLabel(textSrc));
            if (ref) dest = { href: ref.href, title: ref.title, end: after };
          }
        } else if (after < n && s.charCodeAt(after) === 91) {
          const labClose = scanTextInner(s, after + 1, 0);
          if (labClose !== -1) {
            const labRaw = s.slice(after + 1, labClose);
            const label = labRaw === '' ? normalizeLabel(textSrc) : normalizeLabel(labRaw);
            const ref = refs.get(label);
            if (ref) dest = { href: ref.href, title: ref.title, end: labClose + 1 };
          } else {
            // label brackets do not close: fall back to shortcut
            const ref = refs.get(normalizeLabel(textSrc));
            if (ref) dest = { href: ref.href, title: ref.title, end: after };
          }
        } else {
          const ref = refs.get(normalizeLabel(textSrc));
          if (ref) dest = { href: ref.href, title: ref.title, end: after };
        }
        if (dest && textBalanced(textSrc)) {
          const savedLink = inLink;
          const children = parseInline(textSrc, refs, true);
          if (!img && containsLink(children)) {
            inLink = savedLink;
            pushText(img ? '![' : '[', 'text');
            i = ts;
            continue;
          }
          flushText();
          if (img) nodes.push({ k: 5, src: dest.href, title: dest.title, alt: plainText(children) });
          else nodes.push({ k: 4, href: dest.href, title: dest.title, ch: children, br: true });
          prevKind = 'nontext';
          i = dest.end;
          done = true;
        }
      }
      if (!done) {
        pushText(img ? '![' : '[', 'text');
        i = ts;
      }
      continue;
    }
    if (c === 93) { pushText(']', 'text'); i++; continue; } // ]
    if (c === 42 || c === 95 || c === 126) { // * _ ~ runs
      let j = i;
      while (j < n && s.charCodeAt(j) === c) j++;
      const run = j - i;
      // A tilde run of 3+ is never a delimiter: it stays literal.
      if (c === 126 && run >= 3) { pushText('~'.repeat(run), 'text'); i = j; continue; }
      const prevCh = i > 0 ? s[i - 1] : undefined;
      const nextCh = j < n ? s[j] : undefined;
      const prevWs = prevCh === undefined || isSpaceChStr(prevCh);
      const nextWs = nextCh === undefined || isSpaceChStr(nextCh);
      const prevPunct = prevCh !== undefined && isPunctCh(prevCh);
      const nextPunct = nextCh !== undefined && isPunctCh(nextCh);
      const leftFl = !nextWs && (!nextPunct || prevWs || prevPunct);
      const rightFl = !prevWs && (!prevPunct || nextWs || nextPunct);
      let canOpen, canClose;
      if (c === 95) {
        canOpen = leftFl && (!rightFl || prevPunct);
        canClose = rightFl && (!leftFl || nextPunct);
      } else {
        canOpen = leftFl;
        canClose = rightFl;
      }
      flushText();
      const nd = { k: 7, ch: String.fromCharCode(c), n: run, o: canOpen, c: canClose, pos: i, nw: nextCh !== undefined && !nextWs && !nextPunct };
      nodes.push(nd);
      delims.push(nd);
      prevKind = 'nontext';
      i = j;
      continue;
    }
    if (c === 104 || c === 102 || c === 119 || c === 72 || c === 70) { // scheme or www. autolink (scheme case-insensitive; www. is lowercase-only)
      const a = (!inLink && !noAuto) ? scanExtAutolink(s, i, prevKind) : null;
      if (a) {
        flushText();
        nodes.push({ k: 4, href: a.href, title: null, ch: [{ k: 0, s: a.text }] });
        prevKind = 'nontext';
        i = a.end;
        continue;
      }
      pushText(s[i], 'text');
      i++;
      continue;
    }
    if (c === 64) { // @ — possible email autolink
      const em = (!inLink && !noAuto) ? scanEmail(s, i, 0, delims) : null;
      if (em) {
        // A mailto: or xmpp: prefix immediately before the local part (at
        // a word boundary) is part of the link.
        let linkStart = em.start;
        let url = em.text;
        let href = 'mailto:' + em.text;
        const pre = em.start;
        if (pre >= 7 && s.slice(pre - 7, pre) === 'mailto:' && (pre === 7 || !isWordCh(s.charCodeAt(pre - 8)))) {
          linkStart = pre - 7;
          url = 'mailto:' + em.text;
          href = url;
        } else if (pre >= 5 && s.slice(pre - 5, pre) === 'xmpp:' && (pre === 5 || !isWordCh(s.charCodeAt(pre - 6)))) {
          linkStart = pre - 5;
          url = 'xmpp:' + em.text;
          let q = em.end;
          if (q < n && s.charCodeAt(q) === 47) {
            let r = q + 1;
            while (r < n) {
              const d = s.charCodeAt(r);
              if ((d >= 48 && d <= 57) || (d >= 65 && d <= 90) || (d >= 97 && d <= 122) || d === 46 || d === 64) r++;
              else break;
            }
            if (r > q + 1) url += s.slice(q, r);
          }
          url = trimAutolink(url);
          href = url;
        }
        const localLen = i - linkStart;
        if (localLen > 0) text = truncateTail(nodes, delims, text, localLen);
        flushText();
        nodes.push({ k: 4, href, title: null, ch: [{ k: 0, s: url }] });
        prevKind = 'nontext';
        i = linkStart + url.length;
        continue;
      }
      pushText('@', 'text');
      i++;
      continue;
    }
    // anything else: plain char
    pushText(s[i], 'text');
    i++;
  }
  flushText();
  processEmphasis(nodes, delims);
  return nodes;
}

// The cmark delimiter-stack algorithm over the flat node list, with one
// deviation marked exhibits: when a both-capable closer forms emphasis
// with an open-only opener, it sets a floor — a later closer cannot use
// an opener before that pair whose run length differs from the inner
// opener's (e.g. in `*a **b**c*` the outer `*...*` stays literal, while
// in `**a **b**c**` it still forms). The floor is one-time.
function processEmphasis(nodes, delims) {
  // delims is in document order. Work with indices into it.
  let floorPos = -1, floorLen = 0, floorCh = '';
  let ci = 0;
  while (ci < delims.length) {
    const closer = delims[ci];
    if (closer.n === 0 || !closer.c) { ci++; continue; }
    // find the nearest earlier opener of the same char
    let oi = ci - 1;
    let opener = null;
    while (oi >= 0) {
      const cand = delims[oi];
      if (cand.n > 0 && cand.o && cand.ch === closer.ch) {
        if (floorPos !== -1 && floorCh === closer.ch && cand.pos < floorPos && cand.n !== floorLen) break;
        // Tildes pair only with a run of the same length.
        if (closer.ch === '~' && cand.n !== closer.n) { oi--; continue; }
        const odd = (cand.c || closer.o) &&
          (cand.n + closer.n) % 3 === 0 &&
          (cand.n % 3 !== 0 || closer.n % 3 !== 0);
        if (odd) { oi--; continue; }
        opener = cand;
        break;
      }
      oi--;
    }
    if (!opener) { if (floorPos !== -1 && floorCh === closer.ch) { floorPos = -1; floorLen = 0; floorCh = ''; } ci++; continue; }
    const use = (opener.n >= 2 && closer.n >= 2) ? 2 : 1;
    const tag = closer.ch === '~' ? 'del' : (use === 2 ? 'strong' : 'em');
    // locate opener and closer in the nodes array
    const oIdx = nodes.indexOf(opener);
    const cIdx = nodes.indexOf(closer, oIdx);
    if (oIdx === -1 || cIdx === -1 || cIdx <= oIdx) { ci++; continue; }
    const children = nodes.slice(oIdx + 1, cIdx);
    const emNode = { k: 6, tag, ch: children };
    opener.n -= use;
    closer.n -= use;
    const repl = [];
    if (opener.n > 0) repl.push(opener);
    repl.push(emNode);
    if (closer.n > 0) repl.push(closer);
    nodes.splice(oIdx, cIdx - oIdx + 1, ...repl);
    // Delimiters strictly between opener and closer in document order now
    // sit inside the emphasis node: drop them from the top-level list.
    // (oi and ci are their indices in the delims array.)
    delims.splice(oi + 1, ci - oi - 1);
    // closer's new index in delims: oi + 1 (opener is at oi, closer follows)
    ci = oi + 1;
    if (closer.n === 0) ci++;
    // otherwise retry the same closer
    // The floor fires only when the inner closer is followed by a word
    // character (not by another delimiter run, as in `***` at the end of
    // `*a **b***`, where the outer pair still forms).
    if (closer.o && closer.c && opener.o && !opener.c && closer.nw) { floorPos = closer.pos; floorLen = opener.n + use; floorCh = closer.ch; }
    else if (floorCh === closer.ch) { floorPos = -1; floorLen = 0; floorCh = ''; }
  }
}

function renderInline(nodes, out) {
  for (const nd of nodes) {
    switch (nd.k) {
      case 0: out.push(esc(nd.s)); break;
      case 1: out.push('<code>', esc(nd.s), '</code>'); break;
      case 2: out.push(nd.s); break;
      case 3: out.push('<br>'); break;
      case 4:
        out.push('<a href="', hrefOut(nd.href), '"');
        if (nd.title != null) out.push(' title="', escNoEncode(nd.title), '"');
        out.push('>');
        renderInline(nd.ch, out);
        out.push('</a>');
        break;
      case 5:
        out.push('<img src="', hrefOut(nd.src), '" alt="', escNoEncode(nd.alt), '"');
        if (nd.title != null) out.push(' title="', escNoEncode(nd.title), '"');
        out.push('>');
        break;
      case 6:
        out.push('<', nd.tag, '>');
        renderInline(nd.ch, out);
        out.push('</', nd.tag, '>');
        break;
      case 7:
        if (nd.n > 0) out.push(nd.ch.repeat(nd.n));
        break;
      case 8:
        out.push(nd.s);
        break;
    }
  }
}

// Render inline source to a string (convenience wrapper).
function inlineToString(s, refs) {
  const out = [];
  renderInline(parseInline(s, refs), out);
  return out.join('');
}

// ---------------------------------------------------------------------------
// Block parsing
// ---------------------------------------------------------------------------

function leadInfo(line) {
  let cols = 0, i = 0;
  const n = line.length;
  while (i < n) {
    const c = line.charCodeAt(i);
    if (c === 32) { cols++; i++; }
    else if (c === 9) { cols += 4 - (cols % 4); i++; }
    else break;
  }
  return [cols, i];
}
function isBlank(line) {
  for (let i = 0; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}
// A whitespace-only line of 0-3 spaces followed by a single tab: in a
// table body this is an (empty) row, not a blank line.
function isTabRowLine(line) {
  let k = 0;
  while (k < line.length && line.charCodeAt(k) === 32) k++;
  return k <= 3 && k + 1 === line.length && line.charCodeAt(k) === 9;
}
// Strip n columns from the start of line, counting every character
// (marker included) as its column width, expanding a partially
// stripped tab to spaces and the remaining leading tabs to spaces.
function stripLeadingCols(line, n) {
  let col = 0, i = 0;
  const len = line.length;
  while (i < len && col < n) {
    const c = line.charCodeAt(i);
    if (c === 32) { col++; i++; }
    else if (c === 9) {
      const w = 4 - (col % 4);
      if (col + w <= n) { col += w; i++; }
      else {
        const rem = col + w - n;
        return ' '.repeat(rem) + expandLeadingTabs(line.slice(i + 1), n + rem);
      }
    } else { col++; i++; }
  }
  return expandLeadingTabs(line.slice(i), col);
}

function stripCols(line, n) {
  let cols = 0, i = 0;
  const len = line.length;
  while (i < len && cols < n) {
    const c = line.charCodeAt(i);
    if (c === 32) { cols++; i++; }
    else if (c === 9) {
      const w = 4 - (cols % 4);
      if (cols + w <= n) { cols += w; i++; }
      else return ' '.repeat(cols + w - n) + line.slice(i + 1);
    } else break;
  }
  return line.slice(i);
}

// Expand tabs in the leading whitespace of s to spaces, where s starts
// at virtual column startCol. Tabs after the leading whitespace are kept.
function expandLeadingTabs(s, startCol) {
  let col = startCol, i = 0;
  let out = '';
  while (i < s.length) {
    const c = s.charCodeAt(i);
    if (c === 32) { out += ' '; col++; i++; }
    else if (c === 9) { const w = 4 - (col % 4); out += ' '.repeat(w); col += w; i++; }
    else break;
  }
  if (i === 0) return s;
  return out + s.slice(i);
}

// Strip n columns from line, expanding the remaining leading tabs to
// spaces using the original columns, so the result's own columns match
// the original line's columns minus n.
function stripColsNorm(line, n) {
  let cols = 0, i = 0;
  const len = line.length;
  while (i < len && cols < n) {
    const c = line.charCodeAt(i);
    if (c === 32) { cols++; i++; }
    else if (c === 9) {
      const w = 4 - (cols % 4);
      if (cols + w <= n) { cols += w; i++; }
      else {
        const rem = cols + w - n;
        return ' '.repeat(rem) + expandLeadingTabs(line.slice(i + 1), n + rem);
      }
    } else break;
  }
  return expandLeadingTabs(line.slice(i), cols);
}

// Strip a blockquote marker ('>' plus one following space, or one column
// of a following tab) from line at idx, expanding the remaining leading
// tabs to spaces using the original columns.
function stripQuoteMarker(line, idx) {
  let k = idx + 1;
  let col = idx + 1;
  if (k < line.length) {
    const c = line.charCodeAt(k);
    if (c === 32) { k++; col++; }
    else if (c === 9) {
      const w = 4 - (col % 4);
      return ' '.repeat(w - 1) + expandLeadingTabs(line.slice(k + 1), col + w);
    }
  }
  return expandLeadingTabs(line.slice(k), col);
}
function isSpaceCode(c) { return c === 32 || c === 9; }

function atxLevel(line, idx) {
  let j = idx, level = 0;
  while (j < line.length && line.charCodeAt(j) === 35) { level++; j++; }
  if (level === 0 || level > 6) return 0;
  if (j >= line.length) return level;
  const c = line.charCodeAt(j);
  if (c !== 32 && c !== 9) return 0;
  return level;
}
function atxContent(line, idx, level) {
  let j = idx + level;
  while (j < line.length && isSpaceCode(line.charCodeAt(j))) j++;
  let end = line.length;
  while (end > j && isSpaceCode(line.charCodeAt(end - 1))) end--;
  let k = end;
  while (k > j && line.charCodeAt(k - 1) === 35) k--;
  if (k < end && k > 0 && isSpaceCode(line.charCodeAt(k - 1))) {
    end = k;
    while (end > j && isSpaceCode(line.charCodeAt(end - 1))) end--;
  }
  return line.slice(j, end);
}

function fenceStart(line, idx) {
  const ch = line.charCodeAt(idx);
  if (ch !== 96 && ch !== 126) return null;
  let j = idx;
  while (j < line.length && line.charCodeAt(j) === ch) j++;
  const len = j - idx;
  if (len < 3) return null;
  let info = line.slice(j);
  let a = 0;
  while (a < info.length && isSpaceCode(info.charCodeAt(a))) a++;
  let b = info.length;
  while (b > a && isSpaceCode(info.charCodeAt(b - 1))) b--;
  info = info.slice(a, b);
  if (ch === 96 && info.indexOf('`') !== -1) return null;
  return { ch, len, info };
}
function isFenceClose(line, idx, fch, flen) {
  if (line.charCodeAt(idx) !== fch) return false;
  let j = idx;
  while (j < line.length && line.charCodeAt(j) === fch) j++;
  if (j - idx < flen) return false;
  while (j < line.length && isSpaceCode(line.charCodeAt(j))) j++;
  return j >= line.length;
}

function isHr(line, idx) {
  const ch = line.charCodeAt(idx);
  if (ch !== 45 && ch !== 95 && ch !== 42) return false;
  let count = 0, j = idx;
  while (j < line.length) {
    const c = line.charCodeAt(j);
    if (c === ch) { count++; j++; }
    else if (c === 32 || c === 9) j++;
    else return false;
  }
  return count >= 3;
}
function isSetext(line, idx) {
  const ch = line.charCodeAt(idx);
  if (ch !== 61 && ch !== 45) return false;
  let j = idx;
  while (j < line.length && line.charCodeAt(j) === ch) j++;
  while (j < line.length && isSpaceCode(line.charCodeAt(j))) j++;
  return j >= line.length;
}

// --- HTML blocks ---
const HTML1 = new Set(['script', 'pre', 'style', 'textarea']);
const HTML6 = new Set(['address', 'article', 'aside', 'base', 'basefont', 'blockquote', 'body', 'caption', 'center', 'col', 'colgroup', 'dd', 'details', 'dialog', 'dir', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'frame', 'frameset', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hr', 'html', 'iframe', 'legend', 'li', 'link', 'main', 'menu', 'menuitem', 'nav', 'noframes', 'ol', 'optgroup', 'option', 'p', 'param', 'search', 'section', 'summary', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'title', 'tr', 'track', 'ul']);

// Returns the HTML block type (1..7) starting at line[idx], or 0.
function htmlBlockType(line, idx) {
  if (line.charCodeAt(idx) !== 60) return 0;
  if (line.startsWith('<!--', idx)) return 2;
  if (line.startsWith('<?', idx)) return 3;
  if (line.startsWith('<![CDATA[', idx)) return 5;
  if (line.charCodeAt(idx + 1) === 33) {
    const c2 = line.charCodeAt(idx + 2);
    if (c2 >= 65 && c2 <= 90) return 4;
    return 0;
  }
  let p = idx + 1;
  let closing = false;
  if (line.charCodeAt(p) === 47) { closing = true; p++; }
  if (p >= line.length) return 0;
  const tc = line.charCodeAt(p);
  if (!((tc >= 65 && tc <= 90) || (tc >= 97 && tc <= 122))) return 0;
  let q = p;
  while (q < line.length) {
    const c = line.charCodeAt(q);
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 45) q++;
    else break;
  }
  const name = line.slice(p, q).toLowerCase();
  // A closing tag starts a type-6 block only when well-formed (no
  // attributes); otherwise it may still be a type-7 block (the whole
  // line is this one tag).
  if (closing) {
    if (HTML6.has(name) && scanHtml(line, idx) !== -1) return 6;
  } else {
    if (q >= line.length) {
      if (HTML1.has(name)) return 1;
      if (HTML6.has(name)) return 6;
      return 0;
    }
    const nc = line.charCodeAt(q);
    if (nc !== 32 && nc !== 9 && nc !== 47 && nc !== 62) return 0;
    if (HTML1.has(name)) return 1;
    if (HTML6.has(name)) return 6;
  }
  // type 7: the whole line must be this one tag
  const he = scanHtml(line, idx);
  if (he === -1) return 0;
  let r = he;
  while (r < line.length && isSpaceCode(line.charCodeAt(r))) r++;
  return r >= line.length ? 7 : 0;
}

// --- list markers ---
function listMarker(line, idx, cols) {
  const c = line.charCodeAt(idx);
  let markerEnd, w, type, ch, delim, startNum = 0;
  if (c === 45 || c === 43 || c === 42) {
    type = 'bullet'; ch = c; markerEnd = idx + 1; w = 1;
  } else if (c >= 48 && c <= 57) {
    let j = idx;
    while (j < line.length && line.charCodeAt(j) >= 48 && line.charCodeAt(j) <= 57) j++;
    if (j - idx > 9 || j >= line.length) return null;
    const d = line.charCodeAt(j);
    if (d !== 46 && d !== 41) return null;
    type = 'ordered'; delim = d; startNum = parseInt(line.slice(idx, j), 10);
    markerEnd = j + 1; w = j - idx + 1;
  } else return null;
  // must be followed by space/tab/EOL
  if (markerEnd >= line.length) {
    return { type, ch, delim, start: startNum, contentIndent: cols + w + 1, contentStart: line.length, markerWidth: w };
  }
  const d = line.charCodeAt(markerEnd);
  if (d !== 32 && d !== 9) return null;
  // expand the following whitespace
  const mcol = cols + w;
  let col = mcol, p = markerEnd;
  while (p < line.length) {
    const ch2 = line.charCodeAt(p);
    if (ch2 === 32) { col++; p++; }
    else if (ch2 === 9) { col += 4 - (col % 4); p++; }
    else break;
  }
  if (p >= line.length) {
    return { type, ch, delim, start: startNum, contentIndent: mcol + 1, contentStart: line.length, markerWidth: w };
  }
  const ws = col - mcol;
  if (ws >= 1 && ws <= 4) {
    return { type, ch, delim, start: startNum, contentIndent: col, contentStart: p, markerWidth: w };
  }
  return { type, ch, delim, start: startNum, contentIndent: mcol + 1, contentStart: markerEnd + 1, markerWidth: w };
}
function sameList(a, b) {
  if (a.type !== b.type) return false;
  if (a.type === 'bullet') return a.ch === b.ch;
  return a.delim === b.delim;
}

// Is this line (after indent) a paragraph-continuation-like line, i.e. not
// the start of a new block? Used for lazy continuation.
function isParaLike(line) {
  const [cols, idx] = leadInfo(line);
  if (idx >= line.length) return false;
  if (cols >= 4) return false; // indented code, not a paragraph line
  const c = line.charCodeAt(idx);
  if (c === 35 && atxLevel(line, idx) > 0) return false;
  if ((c === 96 || c === 126) && fenceStart(line, idx)) return false;
  if ((c === 45 || c === 95 || c === 42) && isHr(line, idx)) return false;
  if (c === 61 || c === 45) {
    // a setext underline line ends the container
    let j = idx;
    const ch = c;
    while (j < line.length && line.charCodeAt(j) === ch) j++;
    let k = j;
    while (k < line.length && isSpaceCode(line.charCodeAt(k))) k++;
    if (k >= line.length) return false;
  }
  if (c === 60) {
    const t = htmlBlockType(line, idx);
    if (t >= 1 && t <= 6) return false;
  }
  if (c === 62) return isParaLike(line.slice(idx + 1 + (line.charCodeAt(idx + 1) === 32 || line.charCodeAt(idx + 1) === 9 ? 1 : 0)));
  const m = listMarker(line, idx, cols);
  if (m) {
    const content = line.slice(m.contentStart);
    if (content === '') return false;
    return isParaLike(content);
  }
  return true;
}

// --- tables ---
function splitTableRow(s) {
  // Cells split on an unescaped | only; a pipe inside a code span
  // still splits (GFM). \| becomes a literal | and does not split.
  const cells = [];
  let cur = '';
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s.charCodeAt(i);
    if (c === 92 && i + 1 < n) {
      if (s.charCodeAt(i + 1) === 124) { cur += '|'; i += 2; continue; }
      cur += s[i] + s[i + 1]; i += 2; continue;
    }
    if (c === 124) { cells.push(cur); cur = ''; i++; continue; }
    cur += s[i];
    i++;
  }
  cells.push(cur);
  return cells;
}
function tableCells(line, idx) {
  const raw = splitTableRow(line.slice(idx));
  const cells = new Array(raw.length);
  for (let k = 0; k < raw.length; k++) {
    let s = raw[k];
    let a = 0;
    while (a < s.length && isSpaceCode(s.charCodeAt(a))) a++;
    let b = s.length;
    while (b > a && isSpaceCode(s.charCodeAt(b - 1))) b--;
    cells[k] = s.slice(a, b);
  }
  if (cells.length && line.charCodeAt(idx) === 124) cells.shift();
  let e = line.length;
  while (e > idx && isSpaceCode(line.charCodeAt(e - 1))) e--;
  if (cells.length && e > idx && line.charCodeAt(e - 1) === 124) cells.pop();
  return cells;
}
function parseTableDelim(line, idx) {
  const cells = tableCells(line, idx);
  if (cells.length === 0) return null;
  const aligns = new Array(cells.length);
  for (let k = 0; k < cells.length; k++) {
    const s = cells[k];
    let a = 0, b = s.length;
    let left = false, right = false;
    if (a < b && s.charCodeAt(a) === 58) { left = true; a++; }
    if (b > a && s.charCodeAt(b - 1) === 58) { right = true; b--; }
    if (b - a < 1) return null;
    for (let q = a; q < b; q++) if (s.charCodeAt(q) !== 45) return null;
    aligns[k] = left && right ? 'center' : (left ? 'left' : (right ? 'right' : null));
  }
  return { cells: aligns };
}

// --- link reference definitions ---
// Parse a destination (+ optional title) starting at s[pos].
// Returns {dest, title, end} or null.
function parseDestTitle(s, pos) {
  let p = skipWsNl(s, pos);
  if (p >= s.length) return null;
  let dest, q;
  if (s.charCodeAt(p) === 60) {
    let k = p + 1;
    while (k < s.length) {
      const c = s.charCodeAt(k);
      if (c === 62) break;
      if (c === 10 || c === 60) return null;
      if (c === 92 && k + 1 < s.length) { k += 2; continue; }
      k++;
    }
    if (k >= s.length) return null;
    dest = resolveEscapes(s.slice(p + 1, k));
    q = k + 1;
  } else {
    let k = p, depth = 0;
    while (k < s.length) {
      const c = s.charCodeAt(k);
      if (c <= 32 || c === 127) break;
      if (c === 92 && k + 1 < s.length) { k += 2; continue; }
      if (c === 40) depth++;
      else if (c === 41) { if (depth === 0) break; depth--; }
      k++;
    }
    if (k === p) return null;
    dest = s.slice(p, k);
    q = k;
  }
  let title;
  const t = skipWsNl(s, q);
  if (t < s.length) {
    const tp = parseTitle(s, t);
    if (tp) { title = tp.title; q = tp.end; }
  }
  return { dest, title, end: q };
}

// Try to parse a link reference definition at lines[i]. Returns the number of
// source lines consumed (0 if not a definition). First definition wins.
function tryRefDef(lines, i, hi, refs) {
  const line = lines[i];
  const [cols, idx] = leadInfo(line);
  if (cols > 3 || idx >= line.length || line.charCodeAt(idx) !== 91) return 0;
  // The label, destination and title may span lines, but not a blank
  // line. Combine this line with up to 5 following non-blank lines.
  let combined = line.slice(idx);
  const starts = [0];
  let added = 0;
  for (let k = i + 1; k < hi && added < 5; k++) {
    if (isBlank(lines[k])) break;
    starts.push(combined.length + 1);
    combined += '\n' + lines[k];
    added++;
  }
  const lineOf = (pos) => {
    let ln = 0;
    for (let k = 0; k < starts.length; k++) if (starts[k] <= pos) ln = k;
    return ln;
  };
  // Label: [ ... ] up to the first unescaped ]. A label containing an
  // unescaped [ is invalid (the definition is not collected).
  let j = 1, labelEnd = -1, hasOpen = false;
  while (j < combined.length) {
    const c = combined.charCodeAt(j);
    if (c === 92 && j + 1 < combined.length) { j += 2; continue; }
    if (c === 91) { hasOpen = true; j++; continue; }
    if (c === 93) { labelEnd = j; break; }
    j++;
  }
  if (labelEnd === -1 || hasOpen) return 0;
  const label = normalizeLabel(combined.slice(1, labelEnd));
  if (label === '') return 0;
  let q = labelEnd + 1;
  while (q < combined.length && (combined.charCodeAt(q) === 32 || combined.charCodeAt(q) === 9)) q++;
  if (q >= combined.length || combined.charCodeAt(q) !== 58) return 0;
  q++;
  // Destination: skip whitespace (including newlines) first.
  let p = skipWsNl(combined, q);
  if (p >= combined.length) return 0;
  let dest, afterDest;
  if (combined.charCodeAt(p) === 60) {
    let k = p + 1;
    while (k < combined.length) {
      const c = combined.charCodeAt(k);
      if (c === 62) break;
      if (c === 10 || c === 60) return 0;
      if (c === 92 && k + 1 < combined.length) { k += 2; continue; }
      k++;
    }
    if (k >= combined.length) return 0;
    dest = resolveEscapes(combined.slice(p + 1, k));
    afterDest = k + 1;
  } else {
    let k = p, depth = 0;
    while (k < combined.length) {
      const c = combined.charCodeAt(k);
      if (c <= 32 || c === 127) break;
      if (c === 92 && k + 1 < combined.length) { k += 2; continue; }
      if (c === 40) depth++;
      else if (c === 41) { if (depth === 0) break; depth--; }
      k++;
    }
    if (k === p) return 0;
    dest = resolveEscapes(combined.slice(p, k));
    afterDest = k;
  }
  // After the destination, skip spaces/tabs on the same line.
  let r = afterDest;
  while (r < combined.length && (combined.charCodeAt(r) === 32 || combined.charCodeAt(r) === 9)) r++;
  let title = null;
  let consumed = lineOf(afterDest) + 1;
  const isTitleStart = (ch) => ch === 34 || ch === 39 || ch === 40;
  if (r >= combined.length || combined.charCodeAt(r) === 10) {
    // The destination ends its line: a title may follow on the next
    // line. If it has junk after it, the title is dropped but the
    // definition (destination only) still stands.
    const nextStart = (r < combined.length) ? r + 1 : combined.length;
    if (nextStart < combined.length) {
      let t = nextStart;
      while (t < combined.length && (combined.charCodeAt(t) === 32 || combined.charCodeAt(t) === 9)) t++;
      if (t < combined.length && combined.charCodeAt(t) !== 10 && isTitleStart(combined.charCodeAt(t))) {
        const tp = parseTitle(combined, t);
        if (tp) {
          let e = tp.end;
          while (e < combined.length && (combined.charCodeAt(e) === 32 || combined.charCodeAt(e) === 9)) e++;
          if (e >= combined.length || combined.charCodeAt(e) === 10) {
            title = tp.title;
            consumed = lineOf(tp.end) + 1;
          }
        }
      }
    }
  } else {
    // A non-whitespace character follows the destination on its line:
    // it must be a valid title, separated from the destination by
    // whitespace, and the rest of the line must be whitespace only,
    // or the definition is invalid.
    if (r === afterDest) return 0;
    if (!isTitleStart(combined.charCodeAt(r))) return 0;
    const tp = parseTitle(combined, r);
    if (!tp) return 0;
    let e = tp.end;
    while (e < combined.length && (combined.charCodeAt(e) === 32 || combined.charCodeAt(e) === 9)) e++;
    if (e < combined.length && combined.charCodeAt(e) !== 10) return 0;
    title = tp.title;
    consumed = lineOf(tp.end) + 1;
  }
  if (!refs.has(label)) refs.set(label, { href: dest, title });
  return consumed;
}

// A line that may continue a paragraph inside a container (lazy continuation):
// it must not start any block of its own.
// Dedent a lazy continuation line: a line with 4+ leading columns
// loses 4 (it would otherwise be an indented code block), and a line
// that would then be a setext underline is indented so it is not.
// A dedented line that would interrupt a paragraph as a new block
// (list, heading, fence, hr, html, quote) is prefixed with a NUL
// sentinel so the sub-render keeps it as a paragraph continuation;
// paraSource strips the sentinel.
function dedentLazy(line, inList) {
  const [cols, idx] = leadInfo(line);
  let s = line;
  if (cols >= 4) s = stripColsNorm(line, 4);
  const [c2, i2] = leadInfo(s);
  if (isSetext(s, i2)) s = '    ' + s;
  else if (canInterrupt(s, i2, c2, inList)) s = ' ' + s;
  return s;
}

function isLazyLine(line) {
  const [cols, idx] = leadInfo(line);
  if (idx >= line.length) return false;
  if (cols >= 4) return true;
  const c = line.charCodeAt(idx);
  if (c === 35 && atxLevel(line, idx) > 0) return false;
  if ((c === 96 || c === 126) && fenceStart(line, idx)) return false;
  if ((c === 45 || c === 95 || c === 42) && isHr(line, idx)) return false;
  if (c === 60) { const t = htmlBlockType(line, idx); if (t >= 1 && t <= 6) return false; }
  if (c === 62) return false;
  if (listMarker(line, idx, cols)) return false;
  return true;
}

function canInterrupt(line, idx, cols, inList) {
  const c = line.charCodeAt(idx);
  if (c === 35 && atxLevel(line, idx) > 0) return true;
  if ((c === 96 || c === 126) && fenceStart(line, idx)) return true;
  if ((c === 45 || c === 95 || c === 42) && isHr(line, idx)) return true;
  if (c === 60) { const t = htmlBlockType(line, idx); if (t >= 1 && t <= 6) return true; }
  if (c === 62) return true;
  const m = listMarker(line, idx, cols);
  if (m) {
    // An empty list item cannot interrupt a paragraph.
    if (m.contentStart >= line.length) return false;
    if (m.type === 'bullet') return true;
    if (m.type === 'ordered' && (inList || m.start === 1)) return true;
  }
  return false;
}

function collectParagraph(lines, i, hi, firstIdx, endsNL, inList) {
  let j = i + 1;
  let setext = 0;
  let table = null;
  while (j < hi) {
    const line = lines[j];
    if (isBlank(line)) {
      // A whitespace-only last line joins the paragraph when the
      // source has no final newline (a blank line still ends it).
      if (j === hi - 1 && !endsNL && line.length > 0) { j++; continue; }
      // Inside a table body, a line of 0-3 spaces + a single tab is
      // an (empty) row, not a blank line.
      if (table && isTabRowLine(line)) { j++; continue; }
      break;
    }
    const [cols, idx] = leadInfo(line);
    if (cols >= 4) { j++; continue; }
    if (!table && isSetext(line, idx)) {
      setext = line.charCodeAt(idx) === 61 ? 1 : 2;
      return { end: j + 1, setext, table: null };
    }
    if (j === i + 1) {
      const d = parseTableDelim(line, idx);
      if (d) {
        const hc = tableCells(lines[i], firstIdx).length;
        if (hc === d.cells.length && hc > 0) {
          table = { delimIdx: j, aligns: d.cells };
          j++;
          continue;
        }
      }
    }
    if (canInterrupt(line, idx, cols, inList)) break;
    j++;
  }
  return { end: j, setext, table };
}

function paraSource(lines, i, end, trimEnds) {
  // Paragraph lines are kept verbatim (marked keeps their leading and
  // trailing whitespace); a setext heading's source has the first line's
  // leading and the last line's trailing whitespace stripped.
  // A leading NUL sentinel (a dedented lazy line) is stripped.
  if (!trimEnds) {
    const parts = [];
    for (let k = i; k < end; k++) {
      const line = lines[k];
      parts.push(line.charCodeAt(0) === 0 ? line.slice(1) : line);
    }
    return parts.join('\n');
  }
  const parts = [];
  for (let k = i; k < end; k++) {
    let line = lines[k];
    if (line.charCodeAt(0) === 0) line = line.slice(1);
    if (k === i) {
      let a = 0;
      while (a < line.length && isSpaceCode(line.charCodeAt(a))) a++;
      line = line.slice(a);
    }
    if (k === end - 1) {
      let b = line.length;
      while (b > 0 && isSpaceCode(line.charCodeAt(b - 1))) b--;
      line = line.slice(0, b);
    }
    parts.push(line);
  }
  return parts.join('\n');
}

function renderIndentedCode(lines, i, hi, out) {
  const parts = [];
  let j = i;
  while (j < hi) {
    const line = lines[j];
    if (isBlank(line)) {
      let k = j;
      while (k < hi && isBlank(lines[k])) k++;
      if (k < hi) {
        const [c2] = leadInfo(lines[k]);
        if (c2 >= 4) {
          for (let b = j; b < k; b++) { parts.push(stripCols(lines[b], 4)); parts.push('\n'); }
          j = k;
          continue;
        }
      }
      break;
    }
    const [cols] = leadInfo(line);
    if (cols < 4) break;
    parts.push(stripCols(line, 4));
    parts.push('\n');
    j++;
  }
  out.push('<pre><code>', esc(parts.join('')), '</code></pre>\n');
  return j;
}

function renderFence(lines, i, hi, f, out) {
  let lang = f.info;
  const sp = lang.search(/[ \t]/);
  if (sp !== -1) lang = lang.slice(0, sp);
  // A backtick fence strips up to its own indent (leading whitespace
  // characters of the opening line) from each content line; a tilde
  // fence does not.
  let indent = 0;
  if (f.ch === 96) {
    const line = lines[i];
    while (indent < line.length && (line.charCodeAt(indent) === 32 || line.charCodeAt(indent) === 9)) indent++;
  }
  const clines = [];
  let j = i + 1;
  while (j < hi) {
    const [cols, idx] = leadInfo(lines[j]);
    if (cols <= 3 && isFenceClose(lines[j], idx, f.ch, f.len)) { j++; break; }
    let content = lines[j];
    if (indent > 0) {
      let k = 0;
      while (k < indent && k < content.length && (content.charCodeAt(k) === 32 || content.charCodeAt(k) === 9)) k++;
      if (k > 0) content = content.slice(k);
    }
    clines.push(content);
    j++;
  }
  // A trailing empty content line is dropped; the remaining lines are
  // joined with \n and a final \n is added when any line remains.
  if (clines.length && clines[clines.length - 1] === '') clines.pop();
  const code = clines.length ? clines.join('\n') + '\n' : '';
  out.push('<pre><code');
  if (lang) out.push(' class="language-', escNoEncode(resolveEscapes(lang)), '"');
  out.push('>', esc(code), '</code></pre>\n');
  return j;
}

// Lowercased tag name of the (opening) tag starting at line[idx].
function htmlTagName(line, idx) {
  let p = idx + 1;
  let q = p;
  while (q < line.length) {
    const c = line.charCodeAt(q);
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 45) q++;
    else break;
  }
  return line.slice(p, q).toLowerCase();
}

function renderHtmlBlock(lines, i, hi, t, idx, out) {
  const parts = [];
  let j = i;
  if (t === 6 || t === 7) {
    while (j < hi) {
      if (isBlank(lines[j])) break;
      parts.push(lines[j]);
      j++;
    }
  } else {
    // Type 1 ends at the matching end tag; types 2-5 at their ender.
    let ender, mlen;
    if (t === 1) { ender = '</' + htmlTagName(lines[i], idx) + '>'; mlen = 1; }
    else if (t === 2) { ender = '-->'; mlen = 4; }
    else if (t === 3) { ender = '?>'; mlen = 2; }
    else if (t === 4) { ender = '>'; mlen = 3; }
    else { ender = ']]>'; mlen = 9; }
    while (j < hi) {
      const line = lines[j];
      const from = (j === i) ? idx + mlen : 0;
      parts.push(line);
      j++;
      if (line.toLowerCase().indexOf(ender, from) !== -1) break;
    }
  }
  // Lines are joined with \n and no trailing newline; the caller adds
  // one when the block is followed by a non-blank line or runs to the
  // end of a document that ends with a newline.
  out.push(parts.join('\n'));
  return j;
}

function collectBlockquote(lines, i, hi) {
  const sub = [];
  let j = i;
  let lastPara = false;
  // An open fenced code block inside the quote: its content lines are
  // not paragraph lines, so a lazy line must not join them (a lazy
  // line ends the blockquote and the fence instead).
  let fenceCh = 0, fenceLen = 0;
  while (j < hi) {
    const line = lines[j];
    const [cols, idx] = leadInfo(line);
    if (cols <= 3 && idx < line.length && line.charCodeAt(idx) === 62) {
      const s = stripQuoteMarker(line, idx);
      sub.push(s);
      const [sc, si] = leadInfo(s);
      if (fenceCh) {
        if (sc <= 3 && isFenceClose(s, si, fenceCh, fenceLen)) { fenceCh = 0; fenceLen = 0; }
        lastPara = false;
      } else {
        const f = (sc <= 3) ? fenceStart(s, si) : null;
        if (f) { fenceCh = f.ch; fenceLen = f.len; lastPara = false; }
        else lastPara = isParaLike(s);
      }
      j++;
      continue;
    }
    if (isBlank(line)) {
      // A blank line with no > marker ends the blockquote.
      break;
    }
    if (lastPara && isLazyLine(line)) {
      // A lazy line joins the paragraph, dedented so a 4+ indented
      // line cannot become a code block or a setext underline.
      const sub2 = dedentLazy(line, false);
      sub.push(sub2);
      lastPara = isParaLike(sub2);
      j++;
      continue;
    }
    break;
  }
  while (sub.length && sub[sub.length - 1] === '') sub.pop();
  return { sub, next: j };
}

// Append a (non-blank) line to a list item. Looseness is determined
// structurally in collectList (itemHasBlankBetweenBlocks), not here.
function pushItemLine(item, sub, st) {
  if (sub === '') return;
  item.lines.push(sub);
}

// Task marker at the start of an item's first line content.
// Returns {checked, html, rest} or null.
function taskMarker(content) {
  if (content.length < 4) return null;
  if (content.charCodeAt(0) !== 91) return null;
  const ch = content.charCodeAt(1);
  if (ch !== 32 && ch !== 120 && ch !== 88) return null;
  if (content.charCodeAt(2) !== 93) return null;
  let p = 3, spaces = 0;
  while (p < content.length && (content.charCodeAt(p) === 32 || content.charCodeAt(p) === 9)) { spaces++; p++; }
  if (spaces === 0 || p >= content.length) return null;
  const rest = content.slice(p);
  if (!isLazyLine(rest)) return null;
  const checked = ch === 120 || ch === 88;
  const html = checked ? '<input checked="" disabled="" type="checkbox">' : '<input disabled="" type="checkbox">';
  return { checked, html, rest };
}

// Skip one top-level block starting at lines[i] (non-blank). Mirrors
// renderBlocks' dispatch, but returns the index after the block instead of
// rendering. Used to decide list looseness structurally: a list is loose
// when an item's top-level blocks are separated by a blank line.
function skipBlock(lines, i, hi) {
  const line = lines[i];
  const [cols, idx] = leadInfo(line);
  if (cols >= 4) return skipIndentedCode(lines, i, hi);
  const c = line.charCodeAt(idx);
  if (c === 35) {
    if (atxLevel(line, idx) > 0) return i + 1;
  }
  if (c === 96 || c === 126) {
    const f = fenceStart(line, idx);
    if (f) return skipFence(lines, i, hi, f);
  }
  if ((c === 45 || c === 95 || c === 42) && isHr(line, idx)) return i + 1;
  if (c === 60) {
    const t = htmlBlockType(line, idx);
    if (t > 0) return skipHtmlBlock(lines, i, hi, t, idx);
  }
  if (c === 62) return collectBlockquote(lines, i, hi).next;
  const m = listMarker(line, idx, cols);
  if (m) {
    // collectList advances past the list's trailing blank lines; walk
    // back over them so a blank between this list and the next block of
    // the enclosing item is still visible to the caller.
    let next = collectList(lines, i, hi, m).next;
    while (next > i && isBlank(lines[next - 1])) next--;
    return next;
  }
  return collectParagraph(lines, i, hi, idx, false, true).end;
}

// Does this list item's line array contain a blank line between two of
// the item's top-level blocks? (Blanks inside a nested list, quote,
// fence or code block do not count; neither do leading/trailing blanks.)
function itemHasBlankBetweenBlocks(lines) {
  let i = 0;
  const hi = lines.length;
  let seenBlock = false;
  while (i < hi) {
    let blanks = 0;
    while (i < hi && isBlank(lines[i])) { blanks++; i++; }
    if (i >= hi) break;
    if (seenBlock && blanks > 0) return true;
    i = skipBlock(lines, i, hi);
    seenBlock = true;
  }
  return false;
}

function collectList(lines, i, hi, m0) {
  const items = [];
  const st = { loose: false };
  let j = i;
  while (j < hi) {
    const line = lines[j];
    if (isBlank(line)) {
      if (items.length === 0) break;
      // A blank line after an empty item ends the list, unless the
      // next non-blank line is a new item of the same list.
      const cur0 = items[items.length - 1];
      if (cur0.lines.every(l => l === '')) {
        let q = j + 1;
        while (q < hi && isBlank(lines[q])) q++;
        let same = false;
        if (q < hi) {
          const [qc, qi] = leadInfo(lines[q]);
          const qm = (qc <= 3) ? listMarker(lines[q], qi, qc) : null;
          if (qm && sameList(qm, m0)) same = true;
        }
        if (!same) break;
      }
      cur0.lines.push('');
      cur0.lastPara = false;
      j++;
      continue;
    }
    const [cols, idx] = leadInfo(line);
    const cur = items[items.length - 1];
    // A line indented to the current item's content belongs to that item
    // (a nested list), even when it carries a list marker of its own.
    if (cur) {
      const lc = cols;
      if (lc >= cur.contentIndent) {
        const sub = stripColsNorm(line, cur.contentIndent);
        pushItemLine(cur, sub, st);
        cur.lastPara = isParaLike(sub);
        j++;
        continue;
      }
    }
    const m = (cols <= 3) ? listMarker(line, idx, cols) : null;
    // A thematic break ends the list rather than starting a new item.
    if (m && (line.charCodeAt(idx) === 45 || line.charCodeAt(idx) === 95 || line.charCodeAt(idx) === 42) && isHr(line, idx)) break;
    if (m && sameList(m, m0)) {
      const prev = items[items.length - 1];
      if (prev) {
        let b = prev.lines.length;
        while (b > 0 && prev.lines[b - 1] === '') b--;
        if (b < prev.lines.length) { st.loose = true; prev.trailBlank = true; }
        prev.lines.length = b;
      }
      const item = { lines: [], contentIndent: m.contentIndent, lastPara: false };
      items.push(item);
      let content = stripLeadingCols(line, m.contentIndent);
      const tm = taskMarker(content);
      if (tm) content = tm.html + ' ' + tm.rest;
      pushItemLine(item, content, st);
      item.lastPara = isParaLike(content);
      j++;
      continue;
    }
    if (!cur) break;
    if (cur.lastPara && isLazyLine(line)) {
      // A lazy line joins the paragraph, dedented so a 4+ indented
      // line cannot become a code block or a setext underline.
      const sub2 = dedentLazy(line, true);
      pushItemLine(cur, sub2, st);
      cur.lastPara = isParaLike(sub2);
      j++;
      continue;
    }
    break;
  }
  const last = items[items.length - 1];
  if (last) {
    let b = last.lines.length;
    while (b > 0 && last.lines[b - 1] === '') b--;
    if (b < last.lines.length) last.trailBlank = true;
    last.lines.length = b;
  }
  // Looseness, determined structurally (CommonMark): a blank line between
  // two items (handled above, via trailing blanks) or between two
  // top-level blocks of one item. Blanks nested inside a sub-list, quote,
  // fence or code block do not loosen this list.
  if (!st.loose) {
    for (const item of items) {
      if (itemHasBlankBetweenBlocks(item.lines)) { st.loose = true; break; }
    }
  }
  return { items, next: j, loose: st.loose };
}

function renderList(lines, i, hi, m0, refs, out) {
  const { items, next, loose } = collectList(lines, i, hi, m0);
  const ordered = m0.type === 'ordered';
  out.push(ordered ? '<ol' : '<ul');
  if (ordered && m0.start !== 1) out.push(' start="', String(m0.start), '"');
  out.push('>\n');
  for (const item of items) {
    out.push('<li>');
    if (item.lines.length === 0) { out.push('</li>\n'); continue; }
    // An item's sub-document ends with a newline only when its lines
    // ended with a blank line.
    renderBlocks(item.lines, 0, item.lines.length, refs, out, !loose, !!item.trailBlank, true);
    out.push('</li>\n');
  }
  out.push(ordered ? '</ol>\n' : '</ul>\n');
  return next;
}

function renderParagraph(lines, i, hi, firstIdx, refs, out, tight, endsNL, inList) {
  const { end, setext, table } = collectParagraph(lines, i, hi, firstIdx, endsNL, inList);
  if (table) {
    const headerCells = tableCells(lines[i], firstIdx);
    const aligns = table.aligns;
    out.push('<table>\n<thead>\n<tr>\n');
    for (let k = 0; k < headerCells.length; k++) {
      out.push('<th');
      if (aligns[k]) out.push(' align="', aligns[k], '"');
      out.push('>', inlineToString(headerCells[k], refs), '</th>\n');
    }
    out.push('</tr>\n</thead>\n');
    const bodyStart = table.delimIdx + 1;
    if (bodyStart < end) {
      out.push('<tbody>');
      for (let r = bodyStart; r < end; r++) {
        const rowCells = tableCells(lines[r], leadInfo(lines[r])[1]);
        out.push('<tr>\n');
        for (let k = 0; k < headerCells.length; k++) {
          const cell = k < rowCells.length ? rowCells[k] : '';
          out.push('<td');
          if (aligns[k]) out.push(' align="', aligns[k], '"');
          out.push('>', inlineToString(cell, refs), '</td>\n');
        }
        out.push('</tr>\n');
      }
      out.push('</tbody></table>\n');
    } else {
      out.push('</table>\n');
    }
    return end;
  }
  if (setext > 0) {
    const src = paraSource(lines, i, end - 1, true);
    out.push('<h', String(setext), '>', inlineToString(src, refs), '</h', String(setext), '>\n');
    return end;
  }
  const src = paraSource(lines, i, end, false);
  if (tight) out.push(inlineToString(src, refs));
  else out.push('<p>', inlineToString(src, refs), '</p>\n');
  return end;
}

// Skip an indented code block starting at lines[i]. Returns the index
// after the block.
function skipIndentedCode(lines, i, hi) {
  let j = i;
  while (j < hi) {
    const line = lines[j];
    if (isBlank(line)) {
      let k = j;
      while (k < hi && isBlank(lines[k])) k++;
      if (k < hi) {
        const [c2] = leadInfo(lines[k]);
        if (c2 >= 4) { j = k; continue; }
      }
      break;
    }
    const [cols] = leadInfo(line);
    if (cols < 4) break;
    j++;
  }
  return j;
}
function skipFence(lines, i, hi, f) {
  let j = i + 1;
  while (j < hi) {
    const [cols, idx] = leadInfo(lines[j]);
    if (cols <= 3 && isFenceClose(lines[j], idx, f.ch, f.len)) { j++; break; }
    j++;
  }
  return j;
}
function skipHtmlBlock(lines, i, hi, t, idx) {
  let j = i;
  if (t === 6 || t === 7) {
    while (j < hi) {
      if (isBlank(lines[j])) break;
      j++;
    }
  } else {
    let ender, mlen;
    if (t === 1) { ender = '</' + htmlTagName(lines[i], idx) + '>'; mlen = 1; }
    else if (t === 2) { ender = '-->'; mlen = 4; }
    else if (t === 3) { ender = '?>'; mlen = 2; }
    else if (t === 4) { ender = '>'; mlen = 3; }
    else { ender = ']]>'; mlen = 9; }
    while (j < hi) {
      const line = lines[j];
      const from = (j === i) ? idx + mlen : 0;
      j++;
      if (line.toLowerCase().indexOf(ender, from) !== -1) break;
    }
  }
  return j;
}

// Collect link reference definitions from the whole document before
// rendering: marked makes them available to paragraphs that precede them.
// Mirrors renderBlocks' block walk, but only records definitions.
function collectDefs(lines, lo, hi, refs, inList) {
  let i = lo;
  while (i < hi) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }
    const [cols, idx] = leadInfo(line);
    if (cols >= 4) { i = skipIndentedCode(lines, i, hi); continue; }
    const c = line.charCodeAt(idx);
    if (c === 35 && atxLevel(line, idx) > 0) { i++; continue; }
    if (c === 96 || c === 126) {
      const f = fenceStart(line, idx);
      if (f) { i = skipFence(lines, i, hi, f); continue; }
    }
    if ((c === 45 || c === 95 || c === 42) && isHr(line, idx)) { i++; continue; }
    if (c === 60) {
      const t = htmlBlockType(line, idx);
      if (t > 0) { i = skipHtmlBlock(lines, i, hi, t, idx); continue; }
    }
    if (c === 62) {
      const { sub, next } = collectBlockquote(lines, i, hi);
      collectDefs(sub, 0, sub.length, refs, false);
      i = next;
      continue;
    }
    const m = listMarker(line, idx, cols);
    if (m) {
      const { items, next } = collectList(lines, i, hi, m);
      for (const item of items) collectDefs(item.lines, 0, item.lines.length, refs, true);
      i = next;
      continue;
    }
    if (c === 91) {
      const used = tryRefDef(lines, i, hi, refs);
      if (used > 0) { i += used; continue; }
    }
    i = collectParagraph(lines, i, hi, idx, true, inList).end;
  }
}

function renderBlocks(lines, lo, hi, refs, out, tight, endsNL, inList) {
  let i = lo;
  while (i < hi) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }
    const [cols, idx] = leadInfo(line);
    if (cols >= 4) { i = renderIndentedCode(lines, i, hi, out); continue; }
    const c = line.charCodeAt(idx);
    if (c === 35) {
      const level = atxLevel(line, idx);
      if (level > 0) {
        out.push('<h', String(level), '>', inlineToString(atxContent(line, idx, level), refs), '</h', String(level), '>\n');
        i++;
        continue;
      }
    }
    if (c === 96 || c === 126) {
      const f = fenceStart(line, idx);
      if (f) { i = renderFence(lines, i, hi, f, out); continue; }
    }
    if ((c === 45 || c === 95 || c === 42) && isHr(line, idx)) {
      out.push('<hr>\n');
      i++;
      continue;
    }
    if (c === 60) {
      const t = htmlBlockType(line, idx);
      if (t > 0) {
        const j = renderHtmlBlock(lines, i, hi, t, idx, out);
        // The block's text ends with a newline exactly when the next
        // line is not blank, or the block runs to the end of a document
        // whose source ends with a newline. Types 1-5 end at an end
        // marker, so a whitespace-only next line still counts as a
        // following line (it is non-empty); types 6-7 end at a blank
        // line, so only a non-blank next line counts.
        if ((j < hi && (t <= 5 ? lines[j].length > 0 : !isBlank(lines[j]))) || (j >= hi && endsNL)) out.push('\n');
        i = j;
        continue;
      }
    }
    if (c === 62) {
      const { sub, next } = collectBlockquote(lines, i, hi);
      out.push('<blockquote>\n');
      // A blockquote's sub-lines are joined without a trailing newline.
      renderBlocks(sub, 0, sub.length, refs, out, false, false, false);
      out.push('</blockquote>\n');
      i = next;
      continue;
    }
    const m = listMarker(line, idx, cols);
    if (m) {
      i = renderList(lines, i, hi, m, refs, out);
      continue;
    }
    if (c === 91) {
      const used = tryRefDef(lines, i, hi, refs);
      if (used > 0) { i += used; continue; }
    }
    i = renderParagraph(lines, i, hi, idx, refs, out, tight, endsNL, inList);
  }
}

export function parse(src) {
  inLink = false;
  let s = src;
  if (s.indexOf('\r') !== -1) s = s.replace(/\r\n?/g, '\n');
  const endsNL = s.endsWith('\n');
  const lines = s.split('\n');
  // A trailing newline does not create a final empty line.
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const refs = new Map();
  collectDefs(lines, 0, lines.length, refs, false);
  const out = [];
  renderBlocks(lines, 0, lines.length, refs, out, false, endsNL, false);
  return out.join('');
}
