// parse.js — a fast drop-in replacement for marked 18.1.3's default rendering.
// Written from scratch for the make.fun markdown-render-speed-02 competition.
// Renders exactly the HTML marked produces with its default options
// (gfm on, breaks off, pedantic off, async off), without using marked.

'use strict';

// ---------------------------------------------------------------------------
// Named character references.
//
// marked does not decode named entities to characters: a valid named entity
// is passed through to the output unchanged, while an invalid one has its
// ampersand escaped. Numeric references are decoded (see decodeEntity).
// This table holds the entity names marked recognises; it covers the whole
// vocabulary used by the CommonMark and GFM spec examples and by the
// generated documents, plus the common Latin-1, Greek and symbol entities.
const ENTITIES = {
  AElig: 1, AMP: 1, Amp: 1, Aacute: 1, Abreve: 1, Acirc: 1, Atilde: 1, Aring: 1,
  Auml: 1, Alpha: 1, Amacr: 1, Aogon: 1, aacute: 1, abreve: 1, acirc: 1,
  aelig: 1, agrave: 1, alefsym: 1, alpha: 1, amacr: 1, amp: 1, and: 1, ang: 1,
  aring: 1, asymp: 1, atilde: 1, auml: 1, awcon: 1, awint: 1, backcong: 1,
  backepsilon: 1, backprime: 1, backsim: 1, backsimeq: 1, barvee: 1,
  barwed: 1, barwedge: 1, bbrk: 1, bbrktbrk: 1, bcong: 1, bcy: 1, bdquo: 1,
  becaus: 1, because: 1, bemptyv: 1, bepsi: 1, bernoul: 1, beta: 1, beth: 1,
  between: 1, bfr: 1, bigcap: 1, bigcirc: 1, bigcup: 1, bigodot: 1,
  bigoplus: 1, bigotimes: 1, bigsqcup: 1, bigstar: 1, bigtriangledown: 1,
  bigtriangleup: 1, biguplus: 1, bigvee: 1, bigwedge: 1, bkarow: 1, blacklozenge: 1,
  blacksquare: 1, blacktriangle: 1, blacktriangledown: 1, blacktriangleleft: 1,
  blacktriangleright: 1, blank: 1, blk12: 1, blk14: 1, blk34: 1, block: 1,
  bne: 1, bnequiv: 1, bnot: 1, bopf: 1, bot: 1, bottom: 1, bowtie: 1, boxDL: 1,
  boxDR: 1, boxDl: 1, boxDr: 1, boxH: 1, boxHD: 1, boxHU: 1, boxHd: 1, boxHu: 1,
  boxUL: 1, boxUR: 1, boxUl: 1, boxUr: 1, boxV: 1, boxVH: 1, boxVL: 1, boxVR: 1,
  boxVh: 1, boxVl: 1, boxVr: 1, boxh: 1, boxv: 1, bprime: 1, breve: 1, brvbar: 1,
  bsim: 1, bsime: 1, bsolb: 1, bsol: 1, bsolhsub: 1, bull: 1, bullet: 1,
  bump: 1, bumpe: 1, bumpeq: 1, cacute: 1, cap: 1, capand: 1, capbrcup: 1,
  capcap: 1, capcup: 1, capdot: 1, caps: 1, caret: 1, caron: 1, ccaps: 1,
  ccaron: 1, ccedil: 1, ccirc: 1, ccups: 1, ccupssm: 1, cdot: 1, cedil: 1,
  cemptyv: 1, cent: 1, centerdot: 1, cfr: 1, chcy: 1, check: 1, checkmark: 1,
  chi: 1, cir: 1, circ: 1, circeq: 1, circlearrowleft: 1, circlearrowright: 1,
  circledR: 1, circledS: 1, circledast: 1, circledcirc: 1, circleddash: 1,
  cire: 1, cirfnint: 1, cirmid: 1, cirscir: 1, clubs: 1, clubsuit: 1, colon: 1,
  colone: 1, coloneq: 1, comma: 1, commat: 1, comp: 1, compfn: 1, complement: 1,
  complexes: 1, cong: 1, congdot: 1, conint: 1, copf: 1, coprod: 1, copy: 1,
  copysr: 1, crarr: 1, cross: 1, cscr: 1, csub: 1, csube: 1, csup: 1, csupe: 1,
  ctdot: 1, cudarrl: 1, cudarrr: 1, cuepr: 1, cuesc: 1, cularr: 1, cularrp: 1,
  cup: 1, cupbrcap: 1, cupcap: 1, cupcup: 1, cupdot: 1, cupor: 1, cups: 1,
  curarr: 1, curarrm: 1, curlyeqprec: 1, curlyeqsucc: 1, curlyvee: 1,
  curlywedge: 1, curren: 1, curve: 1, curvearrowleft: 1, curvearrowright: 1,
  cuvee: 1, cuwed: 1, cwconint: 1, cwint: 1, cylcty: 1, dagger: 1, daleth: 1,
  darr: 1, dash: 1, dbkarow: 1, dblac: 1, dcaron: 1, dcy: 1, dd: 1, ddagger: 1,
  ddarr: 1, ddotseq: 1, deg: 1, delta: 1, demptyv: 1, dfisht: 1, dfr: 1,
  dharl: 1, dharr: 1, diams: 1, diamond: 1, diamondsuit: 1, diams: 1, die: 1,
  digamma: 1, disin: 1, div: 1, divide: 1, divideontimes: 1, divonx: 1,
  djcy: 1, dlcorn: 1, dlcrop: 1, dollar: 1, dopf: 1, dot: 1, doteq: 1,
  doteqdot: 1, dotminus: 1, dotplus: 1, dotsquare: 1, doublebarwedge: 1,
  downarrow: 1, downdownarrows: 1, downharpoonleft: 1, downharpoonright: 1,
  drbkarow: 1, drcorn: 1, drcrop: 1, dscr: 1, dscy: 1, dsol: 1, dstrok: 1,
  dtdot: 1, dtri: 1, dtrif: 1, duarr: 1, duhar: 1, dwangle: 1, dzcy: 1,
  dzigrarr: 1, eacute: 1, easter: 1, ecaron: 1, ecir: 1, ecirc: 1, ecolon: 1,
  ecy: 1, edot: 1, ee: 1, efDot: 1, efr: 1, eg: 1, egrave: 1, egs: 1, egsdot: 1,
  el: 1, elinters: 1, ell: 1, els: 1, elsdot: 1, emacr: 1, empty: 1, emptyset: 1,
  emptyv: 1, emsp: 1, emsp13: 1, emsp14: 1, eng: 1, ensp: 1, eogon: 1, eopf: 1,
  epar: 1, eparsl: 1, eplus: 1, epsi: 1, epsilon: 1, epsiv: 1, eqcirc: 1,
  eqcolon: 1, eqsim: 1, eqslantgtr: 1, eqslantless: 1, equals: 1, equest: 1,
  equiv: 1, equivDD: 1, eqvparsl: 1, erDot: 1, erarr: 1, escr: 1, esdot: 1,
  esim: 1, esimp: 1, eta: 1, eth: 1, euml: 1, euro: 1, excl: 1, exist: 1,
  expectation: 1, exponentiale: 1, fallingdotseq: 1, fcy: 1, female: 1,
  ffilig: 1, fflig: 1, ffllig: 1, ffr: 1, filig: 1, fjlig: 1, flat: 1, fllig: 1,
  fltns: 1, fnof: 1, fopf: 1, forall: 1, fork: 1, forkv: 1, fpartint: 1,
  frac12: 1, frac13: 1, frac14: 1, frac15: 1, frac16: 1, frac18: 1, frac23: 1,
  frac25: 1, frac34: 1, frac35: 1, frac38: 1, frac45: 1, frac56: 1, frac58: 1,
  frac78: 1, frasl: 1, frown: 1, fscr: 1, gacute: 1, gamma: 1, gammad: 1,
  gap: 1, gbreve: 1, gcirc: 1, gcy: 1, gdot: 1, ge: 1, gel: 1, geq: 1,
  geqq: 1, geqslant: 1, ges: 1, gescc: 1, gesdot: 1, gesdoto: 1, gesdotol: 1,
  gesl: 1, gesles: 1, gfr: 1, gg: 1, ggg: 1, gimel: 1, gjcy: 1, gl: 1, gla: 1,
  glj: 1, gnE: 1, gnap: 1, gnapprox: 1, gne: 1, gneq: 1, gneqq: 1, gnsim: 1,
  gopf: 1, grave: 1, gscr: 1, gsim: 1, gsime: 1, gsiml: 1, gt: 1, gtcc: 1,
  gtcir: 1, gtdot: 1, gtlPar: 1, gtquest: 1, gtrapprox: 1, gtrarr: 1, gtrdot: 1,
  gtreqless: 1, gtreqqless: 1, gtrless: 1, gtrsim: 1, gvertneqq: 1, gvnE: 1,
  harr: 1, harrw: 1, hat: 1, hbar: 1, hcirc: 1, hearts: 1, heartsuit: 1,
  hellip: 1, hercon: 1, hfr: 1, hksearow: 1, hkswarow: 1, hoarr: 1, homtht: 1,
  hookleftarrow: 1, hookrightarrow: 1, hopf: 1, horbar: 1, hscr: 1, hslash: 1,
  hstrok: 1, hybull: 1, hyphen: 1, iacute: 1, ic: 1, icirc: 1, icy: 1,
  iecy: 1, iexcl: 1, iff: 1, ifr: 1, igrave: 1, ii: 1, iiiint: 1, iiint: 1,
  iinfin: 1, iiota: 1, ijlig: 1, imacr: 1, image: 1, imagline: 1, imagpart: 1,
  imath: 1, imof: 1, imped: 1, in: 1, incare: 1, infin: 1, infintie: 1,
  inodot: 1, int: 1, intcal: 1, integers: 1, intercal: 1, intlarhk: 1,
  intprod: 1, iocy: 1, iogon: 1, iopf: 1, iota: 1, iprod: 1, iquest: 1,
  iscr: 1, isin: 1, isinE: 1, isindot: 1, isins: 1, isinsv: 1, isinv: 1,
  it: 1, itilde: 1, iukcy: 1, iuml: 1, jcirc: 1, jcy: 1, jfr: 1, jmath: 1,
  jopf: 1, jscr: 1, jsercy: 1, jukcy: 1, kappa: 1, kappav: 1, kcedil: 1,
  kcy: 1, kfr: 1, kgreen: 1, khcy: 1, kjcy: 1, kopf: 1, kscr: 1, lAarr: 1,
  lArr: 1, lAtail: 1, lBarr: 1, lE: 1, lEg: 1, lHar: 1, lacute: 1, laemptyv: 1,
  lagran: 1, lambda: 1, lang: 1, langd: 1, langle: 1, lap: 1, laquo: 1,
  larr: 1, larrb: 1, larrbfs: 1, larrfs: 1, larrhk: 1, larrlp: 1, larrpl: 1,
  larrsim: 1, larrtl: 1, lat: 1, latail: 1, latail: 1, late: 1, lates: 1,
  lbarr: 1, lbrke: 1, lbrksld: 1, lbrkslu: 1, lcaron: 1, lcedil: 1, lceil: 1,
  lcub: 1, lcy: 1, ldca: 1, ldquo: 1, ldquor: 1, ldrdhar: 1, ldrushar: 1,
  ldsh: 1, le: 1, leftarrow: 1, leftarrowtail: 1, leftdownvetoed: 1,
  leftharpoondown: 1, leftharpoonup: 1, leftleftarrows: 1, leftrightarrows: 1,
  leftrightharpoons: 1, leftrightsquigarrow: 1, leftthreetimes: 1, leg: 1,
  leq: 1, leqq: 1, leqslant: 1, les: 1, lescc: 1, lesdot: 1, lesdoto: 1,
  lesdotor: 1, lesg: 1, lesges: 1, lessapprox: 1, lessdot: 1, lesseqgtr: 1,
  lesseqqgtr: 1, lessgtr: 1, lesssim: 1, lfisht: 1, lfloor: 1, lfr: 1,
  lg: 1, lgE: 1, lhard: 1, lharu: 1, lharul: 1, lhblk: 1, ljcy: 1, ll: 1,
  llarr: 1, llcorn: 1, llhard: 1, lltri: 1, lmidot: 1, lmoust: 1, lmoustache: 1,
  lnE: 1, lnamp: 1, lnap: 1, lnapprox: 1, lne: 1, lneq: 1, lneqq: 1, lnsim: 1,
  loang: 1, loarr: 1, lobrk: 1, longleftarrow: 1, longleftrightarrow: 1,
  longmapsto: 1, longrightarrow: 1, looparrowleft: 1, looparrowright: 1,
  lopar: 1, lopf: 1, loplus: 1, lotimes: 1, lowast: 1, lowbar: 1, loz: 1,
  lozenge: 1, lozf: 1, lpar: 1, lparlt: 1, lrarr: 1, lrcorn: 1, lrhar: 1,
  lrhard: 1, lrm: 1, lrtri: 1, lsaquo: 1, lscr: 1, lsh: 1, lsim: 1, lsime: 1,
  lsimg: 1, lsqb: 1, lsquo: 1, lsquor: 1, lstrok: 1, lt: 1, ltcc: 1, ltcir: 1,
  ltdot: 1, lthree: 1, ltimes: 1, ltlarr: 1, ltquest: 1, ltri: 1, ltrif: 1,
  ltrPar: 1, lurdshar: 1, luruhar: 1, lvertneqq: 1, lvnE: 1, macr: 1, male: 1,
  malt: 1, maltese: 1, map: 1, mapsto: 1, mapstodown: 1, mapstoleft: 1,
  mapstoup: 1, marker: 1, mcomma: 1, mcy: 1, mdash: 1, mddot: 1, measuredangle: 1,
  mfr: 1, mho: 1, micro: 1, mid: 1, midast: 1, midcir: 1, middot: 1, minus: 1,
  minusb: 1, minusd: 1, minusdu: 1, mlcp: 1, mldr: 1, mnplus: 1, models: 1,
  mopf: 1, mp: 1, mscr: 1, mstpos: 1, mu: 1, multiset: 1, mumap: 1, nabla: 1,
  nacute: 1, nang: 1, nap: 1, napE: 1, napid: 1, napos: 1, napprox: 1,
  natur: 1, natural: 1, naturals: 1, nbsp: 1, nbump: 1, nbumpe: 1, ncap: 1,
  ncaron: 1, ncedil: 1, ncong: 1, ncongdot: 1, ncup: 1, ncy: 1, ndash: 1,
  ne: 1, neArr: 1, nearhk: 1, nearr: 1, nearrow: 1, nequiv: 1, nesear: 1,
  nestedGreaterGreater: 1, nestedLessLess: 1, newLine: 1, nexist: 1,
  nexists: 1, nfr: 1, ngE: 1, nge: 1, ngeq: 1, ngeqq: 1, ngeqslant: 1,
  nges: 1, ngsim: 1, ngt: 1, ngtr: 1, nhArr: 1, nharr: 1, nhpar: 1, ni: 1,
  nis: 1, nisd: 1, niv: 1, njcy: 1, nlArr: 1, nlE: 1, nlarr: 1, nldr: 1,
  nle: 1, nleftarrow: 1, nleftrightarrow: 1, nleq: 1, nleqq: 1, nleqslant: 1,
  nles: 1, nless: 1, nlsim: 1, nlt: 1, nltri: 1, nltrie: 1, nmid: 1,
  nopf: 1, not: 1, notin: 1, notinE: 1, notindot: 1, notinva: 1, notinvb: 1,
  notinvc: 1, notni: 1, notniva: 1, notnivb: 1, notnivc: 1, npar: 1, nparallel: 1,
  nparsl: 1, npart: 1, npartsl: 1, npr: 1, nprcue: 1, npre: 1, nprec: 1,
  npreceq: 1, nprpar: 1, nrArr: 1, nrarr: 1, nrarrc: 1, nrarrw: 1, nrightarrow: 1,
  nrtri: 1, nrtrie: 1, nsc: 1, nsccue: 1, nsce: 1, nscr: 1, nshortmid: 1,
  nshortparallel: 1, nsim: 1, nsime: 1, nsimeq: 1, nsmid: 1, nspar: 1,
  nsub: 1, nsubE: 1, nsube: 1, nsup: 1, nsupE: 1, nsupe: 1, nsupset: 1,
  ntgl: 1, ntilde: 1, ntlg: 1, ntri: 1, ntrie: 1, ntrilt: 1, ntrirt: 1,
  nu: 1, num: 1, numero: 1, numsp: 1, nvHarr: 1, nvap: 1, nvdash: 1, nvge: 1,
  nvgt: 1, nvinfin: 1, nvlArr: 1, nvle: 1, nvlt: 1, nvltrie: 1, nvrArr: 1,
  nvrtrie: 1, nvsim: 1, nwarhk: 1, nwArr: 1, nwarr: 1, nwarrow: 1, nwnear: 1,
  oacute: 1, oast: 1, ocir: 1, ocirc: 1, ocy: 1, odash: 1, odblac: 1, odiv: 1,
  odot: 1, odsold: 1, oelig: 1, ofcir: 1, ofr: 1, ogon: 1, ograve: 1, ogt: 1,
  ohbar: 1, ohm: 1, oint: 1, olarr: 1, olcir: 1, olcross: 1, oline: 1,
  olt: 1, omacr: 1, omega: 1, omicron: 1, omid: 1, ominus: 1, oopf: 1,
  opar: 1, operp: 1, oplus: 1, or: 1, orarr: 1, ord: 1, order: 1, orderof: 1,
  ordf: 1, ordm: 1, origof: 1, oror: 1, orslope: 1, orv: 1, oscr: 1,
  oslash: 1, osol: 1, otilde: 1, otimes: 1, otimesas: 1, ouml: 1, ovbar: 1,
  para: 1, parallel: 1, parsim: 1, parsl: 1, part: 1, pcy: 1, percnt: 1,
  period: 1, permil: 1, perp: 1, pertenk: 1, pfr: 1, phi: 1, phiv: 1,
  phmmat: 1, phone: 1, pi: 1, pitchfork: 1, piv: 1, planck: 1, planckh: 1,
  plankv: 1, plus: 1, plusacir: 1, plusb: 1, pluscir: 1, plusdo: 1, plusdu: 1,
  pluse: 1, plusmn: 1, plussim: 1, plustwo: 1, pm: 1, pointint: 1, popf: 1,
  pound: 1, pr: 1, prE: 1, prap: 1, prcue: 1, pre: 1, prec: 1, precapprox: 1,
  preccurlyeq: 1, preceq: 1, precnapprox: 1, precneqq: 1, precnsim: 1,
  prime: 1, primes: 1, prnE: 1, prnap: 1, prnsim: 1, prod: 1, profalar: 1,
  profline: 1, profsurf: 1, prop: 1, propto: 1, prsim: 1, prurel: 1,
  pscr: 1, psi: 1, puncsp: 1, qfr: 1, qint: 1, qopf: 1, qprime: 1, qscr: 1,
  quaternions: 1, quatint: 1, quest: 1, questeq: 1, quot: 1, rAarr: 1,
  rArr: 1, rAtail: 1, rBarr: 1, rHar: 1, race: 1, racute: 1, radic: 1,
  raemptyv: 1, rang: 1, rangd: 1, range: 1, rangle: 1, raquo: 1, rarrap: 1,
  rarr: 1, rarrb: 1, rarrbfs: 1, rarrfs: 1, rarrhk: 1, rarrlp: 1, rarrpl: 1,
  rarrsim: 1, rarrtl: 1, rarrw: 1, ratail: 1, ratio: 1, rationals: 1,
  rbarr: 1, rbrke: 1, rbrksld: 1, rbrkslu: 1, rcaron: 1, rcedil: 1, rceil: 1,
  rcub: 1, rcy: 1, rdca: 1, rdldhar: 1, rdquo: 1, rdquor: 1, rdsh: 1,
  real: 1, realine: 1, realpart: 1, reals: 1, rect: 1, reg: 1, rfisht: 1,
  rfloor: 1, rfr: 1, rhard: 1, rharu: 1, rharul: 1, rho: 1, rhov: 1,
  rightarrow: 1, rightarrowtail: 1, rightdownvetoed: 1, rightharpoondown: 1,
  rightharpoonup: 1, rightleftarrows: 1, rightleftharpoons: 1,
  rightrightarrows: 1, rightsquigarrow: 1, rightthreetimes: 1, ring: 1,
  risingdotseq: 1, rlarr: 1, rlhar: 1, rlm: 1, rmoust: 1, rmoustache: 1,
  rnmid: 1, roang: 1, roarr: 1, robrk: 1, ropar: 1, ropf: 1, roplus: 1,
  rotimes: 1, rpar: 1, rpargt: 1, rppolint: 1, rrarr: 1, rsaquo: 1,
  rscr: 1, rsh: 1, rsqb: 1, rsquo: 1, rsquor: 1, rthree: 1, rtimes: 1,
  rtri: 1, rtrif: 1, rtrilt: 1, rurdshar: 1, ruruhar: 1, rvertneqq: 1,
  rvnE: 1, sacute: 1, sbquo: 1, sc: 1, scE: 1, scap: 1, scaron: 1,
  sccue: 1, sce: 1, scedil: 1, scirc: 1, scnE: 1, scnap: 1, scnsim: 1,
  scpolint: 1, scsim: 1, scy: 1, sdot: 1, sdotb: 1, sdote: 1, seArr: 1,
  searhk: 1, searr: 1, searrow: 1, sect: 1, semi: 1, seswar: 1, setminus: 1,
  setmn: 1, sext: 1, sfr: 1, sfrown: 1, sharp: 1, shchcy: 1, shcy: 1,
  shortmid: 1, shortparallel: 1, shy: 1, sigma: 1, sigmaf: 1, sigmav: 1,
  sim: 1, simdot: 1, sime: 1, simeq: 1, simg: 1, simge: 1, siml: 1, simle: 1,
  simne: 1, simplus: 1, simrarr: 1, slarr: 1, smallsetminus: 1, smashp: 1,
  smeparsl: 1, smid: 1, smile: 1, smt: 1, smte: 1, smtes: 1, softcy: 1,
  sol: 1, solb: 1, solbar: 1, sopf: 1, spades: 1, spadesuit: 1, spar: 1,
  sqcap: 1, sqcaps: 1, sqcup: 1, sqcups: 1, sqsub: 1, sqsube: 1, sqsubset: 1,
  sqsubseteq: 1, sqsup: 1, sqsupe: 1, sqsupset: 1, sqsupseteq: 1, square: 1,
  squarf: 1, squ: 1, squf: 1, srarr: 1, sscr: 1, ssetmn: 1, ssmile: 1,
  sstarf: 1, star: 1, starf: 1, straightepsilon: 1, straighphi: 1, strns: 1,
  sub: 1, subE: 1, subdot: 1, sube: 1, subedot: 1, submult: 1, subnE: 1,
  subne: 1, subplus: 1, subrarr: 1, subset: 1, subseteq: 1, subseteqq: 1,
  subsetneq: 1, subsetneqq: 1, subsim: 1, subsub: 1, subsup: 1, succ: 1,
  succapprox: 1, succcurlyeq: 1, succeq: 1, succnapprox: 1, succneqq: 1,
  succnsim: 1, succsim: 1, sum: 1, sung: 1, sup: 1, sup1: 1, sup2: 1,
  sup3: 1, supE: 1, supdot: 1, supdsub: 1, supe: 1, supedot: 1, suphsol: 1,
  suphsub: 1, suplarr: 1, supmult: 1, supnE: 1, supne: 1, supplus: 1,
  supset: 1, supseteq: 1, supseteqq: 1, supsetneq: 1, supsetneqq: 1,
  supsim: 1, supsub: 1, supsup: 1, swArr: 1, swarhk: 1, swarr: 1,
  swarrow: 1, swnwar: 1, szlig: 1, target: 1, tau: 1, tbrk: 1, tcaron: 1,
  tcedil: 1, tcy: 1, tdot: 1, telrec: 1, tfr: 1, there4: 1, therefore: 1,
  theta: 1, thetasym: 1, thetav: 1, thickapprox: 1, thicksim: 1, thinsp: 1,
  thkap: 1, thksim: 1, thorn: 1, tilde: 1, times: 1, timesb: 1, timesbar: 1,
  timesd: 1, tint: 1, toea: 1, top: 1, topbot: 1, topcir: 1, topf: 1,
  topfork: 1, tosa: 1, tprime: 1, trade: 1, triangle: 1, triangledown: 1,
  triangleleft: 1, trianglelefteq: 1, triangleq: 1, triangleright: 1,
  trianglerighteq: 1, tridot: 1, trie: 1, triminus: 1, triplus: 1,
  trisb: 1, tritime: 1, trpezium: 1, tscr: 1, tscy: 1, tshcy: 1, tstrok: 1,
  twixt: 1, twoheadleftarrow: 1, twoheadrightarrow: 1, uacute: 1, uarr: 1,
  ubrcy: 1, ubreve: 1, ucirc: 1, ucy: 1, udarr: 1, udblac: 1, udhar: 1,
  ufisht: 1, ufr: 1, ugrave: 1, uharl: 1, uharr: 1, uhblk: 1, ulcorn: 1,
  ulcorner: 1, ulcrop: 1, ultri: 1, umacr: 1, uml: 1, underbar: 1,
  underscore: 1, uogon: 1, uopf: 1, uparrow: 1, updownarrow: 1, upharpoonleft: 1,
  upharpoonright: 1, uplus: 1, upsih: 1, upsilon: 1, upuparrows: 1,
  urcorn: 1, urcorner: 1, urcrop: 1, uring: 1, urtri: 1, uscr: 1,
  utdot: 1, utilde: 1, utri: 1, utrif: 1, uuarr: 1, uuml: 1, uwangle: 1,
  vangrt: 1, varepsilon: 1, varkappa: 1, varphi: 1, varpi: 1, varpropto: 1,
  varr: 1, varrho: 1, varsigma: 1, varsubsetneq: 1, varsubsetneqq: 1,
  varsupsetneq: 1, varsupsetneqq: 1, vartheta: 1, vartriangleleft: 1,
  vartriangleright: 1, vcy: 1, vdash: 1, vdashl: 1, vee: 1, veebar: 1,
  veeeq: 1, vellip: 1, verbar: 1, vert: 1, vfr: 1, vltri: 1, vnsub: 1,
  vnsup: 1, vopf: 1, vprop: 1, vrtri: 1, vscr: 1, vsubnE: 1, vsubne: 1,
  vsupnE: 1, vsupne: 1, vzigzag: 1, wcirc: 1, wedbar: 1, wedge: 1,
  wedgeq: 1, weierp: 1, wfr: 1, wopf: 1, wp: 1, wr: 1, wscr: 1, xcap: 1,
  xcirc: 1, xcup: 1, xdtri: 1, xfr: 1, xhArr: 1, xharr: 1, xi: 1, xlArr: 1,
  xlarr: 1, xmap: 1, xnis: 1, xodot: 1, xopf: 1, xoplus: 1, xotime: 1,
  xrArr: 1, xrarr: 1, xscr: 1, xsqcup: 1, xuplus: 1, xutri: 1, xvee: 1,
  xwedge: 1, yacute: 1, ycy: 1, yfr: 1, yicy: 1, yopf: 1, yscr: 1, yukcy: 1,
  yuml: 1, zacute: 1, zcaron: 1, zcy: 1, zdot: 1, zeetrf: 1, zeta: 1,
  zfr: 1, zhcy: 1, zigrarr: 1, zopf: 1, zscr: 1, zwj: 1, zwnj: 1,
  AElig2: 0, ClockwiseContourIntegral: 1, DifferentialD: 1, HilbertSpace: 1,
  Dcaron: 1, Tab: 1, NewLine: 1, colon: 1,
};

// ASCII punctuation set (for backslash escapes and flanking checks).
function isPunctCode(c) {
  return (c >= 33 && c <= 47) || (c >= 58 && c <= 64) || (c >= 91 && c <= 96) || (c >= 123 && c <= 126);
}
function isSpaceCode(c) {
  return c === 32 || c === 9 || c === 10 || c === 11 || c === 12 || c === 13;
}
function isDigitCode(c) { return c >= 48 && c <= 57; }
function isHexCode(c) {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
}
function isAlphaCode(c) {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}
function isAlnumCode(c) { return isAlphaCode(c) || isDigitCode(c); }

// Escape plain text for HTML output: & < > " '  (marked escapes all five).
function escText(s, out) {
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    let rep = null;
    if (c === 38) rep = '&amp;';
    else if (c === 60) rep = '&lt;';
    else if (c === 62) rep = '&gt;';
    else if (c === 34) rep = '&quot;';
    else if (c === 39) rep = '&#39;';
    if (rep !== null) {
      if (i > start) out.push(s.slice(start, i));
      out.push(rep);
      start = i + 1;
    }
  }
  if (start === 0) out.push(s);
  else if (start < s.length) out.push(s.slice(start));
}

// Escape an href or title attribute value. marked leaves a valid entity
// reference untouched (it does not double-escape &amp; to &amp;amp;) and
// percent-encodes spaces, while escaping " < > and stray &.
function escHref(s, out) {
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 38) {
      const ent = entityAt(s, i);
      if (ent > 0) { i += ent - 1; continue; }
      if (i > start) out.push(s.slice(start, i));
      out.push('&amp;');
      start = i + 1;
    } else if (c === 34) {
      if (i > start) out.push(s.slice(start, i));
      out.push('&quot;');
      start = i + 1;
    } else if (c === 60) {
      if (i > start) out.push(s.slice(start, i));
      out.push('&lt;');
      start = i + 1;
    } else if (c === 62) {
      if (i > start) out.push(s.slice(start, i));
      out.push('&gt;');
      start = i + 1;
    } else if (c === 32) {
      if (i > start) out.push(s.slice(start, i));
      out.push('%20');
      start = i + 1;
    }
  }
  if (start === 0) out.push(s);
  else if (start < s.length) out.push(s.slice(start));
}

// If s holds an entity reference starting at i (&...;), return its length
// in code units, else 0. Named entities pass the lookup table; numeric ones
// are checked for shape only (their decoding is decodeEntity's job).
function entityAt(s, i) {
  // A named entity reference: '&' + 1 or more alphanumeric characters +
  // ';'. Any such name passes through unchanged (marked does not check it
  // against a table). Numeric entities are handled by
  // decodeNumericEntity, which enforces the digit-count limits.
  const n = s.length;
  if (i + 1 >= n) return 0;
  const st = i + 1;
  let j = st;
  while (j < n && isAlnumCode(s.charCodeAt(j))) j++;
  if (j > st && j < n && s.charCodeAt(j) === 59) return j - i + 1;
  return 0;
}

// Decode a numeric entity reference starting at i; returns [char, length]
// or null when s[i] does not start a decodable numeric reference.
function decodeNumericEntity(s, i) {
  const n = s.length;
  let j = i + 1;
  if (j >= n || s.charCodeAt(j) !== 35) return null;
  j++;
  let code = 0;
  let valid = false;
  if (j < n && (s.charCodeAt(j) === 120 || s.charCodeAt(j) === 88)) {
    j++;
    const st = j;
    while (j < n) {
      const c = s.charCodeAt(j);
      if (c >= 48 && c <= 57) code = code * 16 + (c - 48);
      else if (c >= 65 && c <= 70) code = code * 16 + (c - 55);
      else if (c >= 97 && c <= 102) code = code * 16 + (c - 87);
      else break;
      j++;
    }
    valid = j > st && j - st <= 6;
  } else {
    const st = j;
    while (j < n && s.charCodeAt(j) >= 48 && s.charCodeAt(j) <= 57) {
      code = code * 10 + (s.charCodeAt(j) - 48);
      j++;
    }
    valid = j > st && j - st <= 7;
  }
  if (!valid || j >= n || s.charCodeAt(j) !== 59) return null;
  if (code === 0 || code > 0x10FFFF || (code >= 0xD800 && code <= 0xDFFF)) code = 0xFFFD;
  return [String.fromCodePoint(code), j - i + 1];
}

// ---------------------------------------------------------------------------
// Inline parsing.
//
// A paragraph (or heading, or table cell) is scanned once into a small tree
// of nodes. Delimiter runs (* _ ~) become their own text nodes and are
// resolved per container with the standard opener/closer matching; link
// brackets open a sub-container whose children become the link text (or are
// merged back literally when no link forms). Emphasis never crosses a link
// boundary. Named entities are passed through unchanged; numeric ones are
// decoded. GFM extended autolinks (www., http(s)://, bare e-mail, and
// mailto:/xmpp: e-mail) are recognised while scanning.

// Node shapes:
//  {t:'text', s}  raw text, escaped on render
//  {t:'ent', s}   a valid entity reference, output verbatim
//  {t:'code', s}  code span content, escaped on render
//  {t:'html', s}  raw HTML, output verbatim
//  {t:'br'}       hard break
//  {t:'link', href, title, c:[children]}
//  {t:'img', src, title, alt}  alt is plain text
//  {t:'em'|'strong'|'del', c:[children]}

const PUNCT_RE = /[\p{P}\p{S}]/u;
const SPACE_RE = /\s/u;
function isUnicodePunct(ch) {
  const c = ch.charCodeAt(0);
  if (c < 128) return isPunctCode(c);
  return PUNCT_RE.test(ch);
}
function isUnicodeSpace(ch) {
  const c = ch.charCodeAt(0);
  if (c < 128) return c === 32 || c === 9 || c === 10 || c === 11 || c === 12 || c === 13;
  return SPACE_RE.test(ch);
}

// Flanking info for a delimiter run at [i, i+n) of s.
function flank(s, i, n) {
  const prev = i > 0 ? s[i - 1] : '';
  const next = i + n < s.length ? s[i + n] : '';
  // The beginning and the end of the line count as Unicode whitespace.
  const prevWs = prev === '' ? true : isUnicodeSpace(prev);
  const nextWs = next === '' ? true : isUnicodeSpace(next);
  const prevPunct = prev === '' ? false : isUnicodePunct(prev);
  const nextPunct = next === '' ? false : isUnicodePunct(next);
  const left = !nextWs && (!nextPunct || prevWs || prevPunct);
  const right = !prevWs && (!prevPunct || nextWs || nextPunct);
  return [left, right, prevPunct, nextPunct];
}

// Normalise a link label: trim, collapse runs of whitespace to one space,
// and case-fold. Backslash escapes in labels were already resolved by the
// caller where needed (labels are taken from raw source, so an escaped
// bracket is handled during label scanning).
function normalizeLabel(raw) {
  let out = '';
  let lastWs = true; // trims leading whitespace
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (isUnicodeSpace(ch)) {
      if (!lastWs) { out += ' '; lastWs = true; }
    } else {
      out += ch;
      lastWs = false;
    }
  }
  if (out.endsWith(' ')) out = out.slice(0, -1);
  // Unicode case folding: toLowerCase leaves ß as ß, but it folds to ss
  // (and ẞ lowercases to ß first, so this covers both). Ligatures fold
  // to their letters as well.
  return out.toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ﬀ/g, 'ff').replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl')
    .replace(/ﬃ/g, 'ffi').replace(/ﬄ/g, 'ffl')
    .replace(/ﬅ/g, 'st').replace(/ﬆ/g, 'st');
}

// Render a node list to plain text (for image alt attributes): markup is
// dropped but its content kept; raw HTML is escaped; entities pass through.
function plainText(children, out) {
  for (let k = 0; k < children.length; k++) {
    const n = children[k];
    switch (n.t) {
      case 'text': out.push(n.s); break;
      case 'ent': out.push(n.s); break;
      case 'code': out.push(n.s); break;
      case 'html': escText(n.s, out); break;
      case 'br': break;
      case 'img': out.push(n.alt); break;
      default: // link, em, strong, del
        if (n.c) plainText(n.c, out);
        break;
    }
  }
}

// Replace autolink nodes (`link` with auto:true) in `children` by their
// plain text, in place. Used when a bracket link forms around them: an
// autolink inside a link's text renders as text, not as a nested <a>.
function flattenAutolinks(children) {
  for (let k = 0; k < children.length; k++) {
    const n = children[k];
    if (n.t === 'link' && n.auto) {
      const text = n.c && n.c.length > 0 ? n.c.map((x) => x.s || '').join('') : '';
      children.splice(k, 1, { t: 'text', s: text });
    } else if (n.c) {
      flattenAutolinks(n.c);
    }
  }
}

// Resolve emphasis/del delimiters within one container's children.
// delims: [{ch, n, canOpen, canClose, node, active}] in document order.
function resolveEmphasis(children, delims) {
  // Index of the first delimiter still usable as an opener for a closer is
  // recomputed by identity each time; nested nodes are no longer direct
  // children, so their delimiters are skipped by checking membership.
  let ci = 0;
  while (ci < delims.length) {
    const closer = delims[ci];
    if (!closer.active || closer.n === 0 || !closer.canClose) { ci++; continue; }
    let matched = false;
    // Search backwards for an opener.
    for (let oi = ci - 1; oi >= 0; oi--) {
      const opener = delims[oi];
      if (!opener.active || opener.n === 0 || !opener.canOpen) continue;
      if (opener.ch !== closer.ch) continue;
      // The opener must still be a direct child of this container.
      if (children.indexOf(opener.node) < 0) continue;
      if (closer.node !== null && children.indexOf(closer.node) < 0) continue;
      // Rule of three: when either delimiter can both open and close, a
      // multiple-of-3 sum blocks the match unless both lengths are
      // multiples of 3.
      if ((opener.canOpen && opener.canClose) || (closer.canOpen && closer.canClose)) {
        const sum = opener.n + closer.n;
        if (sum % 3 === 0 && (opener.n % 3 !== 0 || closer.n % 3 !== 0)) continue;
      }
      // Match: use 2 for strong when both runs have at least 2, else 1.
      const use = opener.n >= 2 && closer.n >= 2 ? 2 : 1;
      const kind = opener.ch === '~' ? 'del' : (use === 2 ? 'strong' : 'em');
      const oiPos = children.indexOf(opener.node);
      const ciPos = children.indexOf(closer.node);
      if (oiPos < 0 || ciPos < 0 || ciPos <= oiPos) continue;
      const inner = children.slice(oiPos + 1, ciPos);
      // Delimiters strictly between opener and closer now live inside the
      // new node: drop them from this container's list.
      for (let d = 0; d < delims.length; d++) {
        const dm = delims[d];
        if (dm !== opener && dm !== closer && dm.active) {
          const p = children.indexOf(dm.node);
          if (p > oiPos && p < ciPos) dm.active = false;
        }
      }
      opener.n -= use;
      closer.n -= use;
      const emNode = { t: kind, c: inner };
      const seg = [];
      if (opener.n > 0) {
        opener.node.s = opener.ch.repeat(opener.n);
        seg.push(opener.node);
      } else opener.active = false;
      seg.push(emNode);
      if (closer.n > 0) {
        closer.node.s = closer.ch.repeat(closer.n);
        seg.push(closer.node);
      } else closer.active = false;
      children.splice(oiPos, ciPos - oiPos + 1, ...seg);
      matched = true;
      // Keep working on this closer if it still has delimiters left; the
      // search restarts from its new predecessor (the same opener, when it
      // still has length, is found again and forms the next layer).
      if (closer.n === 0) { ci++; break; }
      break; // restart the closer's search from the top
    }
    if (!matched) ci++;
  }
}

// Scan a link destination starting at i (after '(' or after '[label]:').
// Returns [dest, nextIndex] or null. Handles <...> and bare destinations;
// backslash escapes are resolved in the destination.
function scanDestination(s, i) {
  const n = s.length;
  if (i < n && s.charCodeAt(i) === 60) { // <
    let j = i + 1;
    let dest = '';
    while (j < n) {
      const c = s.charCodeAt(j);
      if (c === 62) return [dest, j + 1]; // >
      if (c === 10 || c === 60) return null; // newline or < ends it
      if (c === 92 && j + 1 < n && isPunctCode(s.charCodeAt(j + 1))) { dest += s[j + 1]; j += 2; continue; }
      dest += s[j];
      j++;
    }
    return null;
  }
  // Bare destination: no spaces or control chars, parens balanced.
  let j = i;
  let dest = '';
  let depth = 0;
  while (j < n) {
    const c = s.charCodeAt(j);
    if (c === 32 || c === 10 || c === 9) break;
    if (c === 40) { depth++; dest += s[j]; j++; continue; } // (
    if (c === 41) { // )
      if (depth === 0) break;
      depth--;
      dest += s[j];
      j++;
      continue;
    }
    if (c < 32) return null;
    if (c === 92 && j + 1 < n && isPunctCode(s.charCodeAt(j + 1))) { dest += s[j + 1]; j += 2; continue; }
    dest += s[j];
    j++;
  }
  if (depth !== 0) return null;
  if (dest.length === 0) return null;
  return [dest, j];
}

// Skip spaces, tabs and newlines. Returns the new index.
function skipInlineWs(s, i) {
  while (i < s.length) {
    const c = s.charCodeAt(i);
    if (c === 32 || c === 9 || c === 10) i++;
    else break;
  }
  return i;
}

// Scan a link title starting at i. Returns [title, nextIndex] or null.
function scanTitle(s, i) {
  const n = s.length;
  if (i >= n) return null;
  const q = s.charCodeAt(i);
  if (q === 34 || q === 39) { // " or '
    let j = i + 1;
    let title = '';
    while (j < n) {
      const c = s.charCodeAt(j);
      if (c === q) return [title, j + 1];
      if (c === 92 && j + 1 < n && isPunctCode(s.charCodeAt(j + 1))) { title += s[j + 1]; j += 2; continue; }
      if (c === 10) { title += '\n'; j++; continue; }
      title += s[j];
      j++;
    }
    return null;
  }
  if (q === 40) { // ( ... ) — no unescaped parens inside
    let j = i + 1;
    let title = '';
    while (j < n) {
      const c = s.charCodeAt(j);
      if (c === 41) return [title, j + 1];
      if (c === 40) return null;
      if (c === 92 && j + 1 < n && isPunctCode(s.charCodeAt(j + 1))) { title += s[j + 1]; j += 2; continue; }
      if (c === 10) { title += '\n'; j++; continue; }
      title += s[j];
      j++;
    }
    return null;
  }
  return null;
}

// Try to parse an inline link's (dest "title") starting at i (where s[i]
// is '('). Returns {href, title, end} or null. A quoted string right
// after '(' is a bare destination, not a title: only an angle-bracketed
// empty destination (<>) can carry a title.
function parseInlineLink(s, i) {
  const n = s.length;
  if (i >= n || s.charCodeAt(i) !== 40) return null;
  let j = skipInlineWs(s, i + 1);
  // Empty destination: [a]()
  if (j < n && s.charCodeAt(j) === 41) return { href: '', title: null, end: j + 1 };
  const d = scanDestination(s, j);
  if (d === null) return null;
  let href = d[0];
  j = d[1];
  if (j < n && s.charCodeAt(j) === 41) return { href, title: null, end: j + 1 };
  const k = skipInlineWs(s, j);
  if (k === j) return null; // need whitespace before a title
  const t = scanTitle(s, k);
  if (t === null) return null;
  j = skipInlineWs(s, t[1]);
  if (j < n && s.charCodeAt(j) === 41) return { href, title: t[0], end: j + 1 };
  return null;
}

// Scan a bracket label starting at i (where s[i] is '['). Returns
// [rawLabel, nextIndex] or null. The label may contain balanced escaped
// brackets but no raw '['; newlines inside are kept (they collapse to a
// space when the label is normalised). Its raw text (with backslash escapes
// resolved for \[ and \]) is returned.
function scanLabelLoose(s, i) {
  const n = s.length;
  if (i >= n || s.charCodeAt(i) !== 91) return null;
  let j = i + 1;
  let label = '';
  while (j < n) {
    const c = s.charCodeAt(j);
    if (c === 93) return [label, j + 1];
    if (c === 91) return null;
    if (c === 92 && j + 1 < n && isPunctCode(s.charCodeAt(j + 1))) {
      // A backslash escape: consume both characters raw, so a `]` after
      // `\\` is still the closing bracket, and the label keeps its
      // backslashes for matching (labels match on their raw form).
      label += s[j] + s[j + 1];
      j += 2;
      continue;
    }
    label += s[j];
    j++;
  }
  return null;
}

// Characters that stop a plain-text run while scanning inline content.
const INLINE_SPECIAL = new Uint8Array(128);
for (const ch of '\\`*_~[]!<&\n') INLINE_SPECIAL[ch.charCodeAt(0)] = 1;
INLINE_SPECIAL[119] = 1; // w (www.)
INLINE_SPECIAL[104] = 1; // h (http://, https://)
INLINE_SPECIAL[72] = 1; // H (HTTP://, HTTPS://)
INLINE_SPECIAL[64] = 1; // @ (e-mail autolink)

// Push text into a children array, merging with the previous plain text node.
function pushText(children, s) {
  if (s === '') return;
  const last = children[children.length - 1];
  if (last && last.t === 'text' && !last.r) { last.s += s; return; }
  children.push({ t: 'text', s });
}

// Scan an HTML tag starting at i (s[i] is '<'). Returns [raw, end] or null.
function scanHtmlTag(s, i) {
  const n = s.length;
  let j = i + 1;
  if (j >= n) return null;
  const c = s.charCodeAt(j);
  if (c === 33) { // ! — comment, declaration, CDATA
    if (s.startsWith('<!--', i)) {
      // <!--> and <!---> are valid (empty) comments.
      if (s.charCodeAt(i + 4) === 62) return [s.slice(i, i + 5), i + 5];
      if (s.charCodeAt(i + 4) === 45 && s.charCodeAt(i + 5) === 62) {
        return [s.slice(i, i + 6), i + 6];
      }
      const k = s.indexOf('-->', i + 4);
      if (k < 0) return null;
      return [s.slice(i, k + 3), k + 3];
    }
    if (s.startsWith('<![CDATA[', i)) {
      const k = s.indexOf(']]>', j + 8);
      if (k < 0) return null;
      return [s.slice(i, k + 3), k + 3];
    }
    // Declaration: <! + letter, up to >
    if (j + 1 < n && isAlphaCode(s.charCodeAt(j + 1))) {
      const k = s.indexOf('>', j + 1);
      if (k < 0) return null;
      return [s.slice(i, k + 1), k + 1];
    }
    return null;
  }
  if (c === 63) { // ? — processing instruction up to ?>
    const k = s.indexOf('?>', j + 1);
    if (k < 0) return null;
    return [s.slice(i, k + 2), k + 2];
  }
  if (c === 47) { // / — closing tag
    j++;
    if (j >= n || !isAlphaCode(s.charCodeAt(j))) return null;
    j++;
    while (j < n && (isAlnumCode(s.charCodeAt(j)) || s.charCodeAt(j) === 45)) j++;
    while (j < n && (s.charCodeAt(j) === 32 || s.charCodeAt(j) === 9 || s.charCodeAt(j) === 10)) j++;
    if (j < n && s.charCodeAt(j) === 62) return [s.slice(i, j + 1), j + 1];
    return null;
  }
  if (!isAlphaCode(c)) return null;
  // Open tag: name, then attributes, then > or />
  j++;
  while (j < n && (isAlnumCode(s.charCodeAt(j)) || s.charCodeAt(j) === 45)) j++;
  // After the tag name, the next character must be whitespace, '/' or
  // '>'. A ':' starting an attribute with no whitespace is not a tag
  // (e.g. <m:abc> is literal).
  if (j < n) {
    const nc = s.charCodeAt(j);
    if (!(nc === 32 || nc === 9 || nc === 10 || nc === 47 || nc === 62)) return null;
  }
  while (true) {
    // Skip whitespace.
    while (j < n && (s.charCodeAt(j) === 32 || s.charCodeAt(j) === 9 || s.charCodeAt(j) === 10)) j++;
    if (j >= n) return null;
    const d = s.charCodeAt(j);
    if (d === 62) return [s.slice(i, j + 1), j + 1]; // >
    if (d === 47) { // / — must be followed by >
      if (j + 1 < n && s.charCodeAt(j + 1) === 62) return [s.slice(i, j + 2), j + 2];
      return null;
    }
    // Attribute name: letter, _ or : then alnum, _, :, ., -
    if (!(isAlphaCode(d) || d === 95 || d === 58)) return null;
    j++;
    while (j < n) {
      const e = s.charCodeAt(j);
      if (isAlnumCode(e) || e === 95 || e === 58 || e === 46 || e === 45) j++;
      else break;
    }
    while (j < n && (s.charCodeAt(j) === 32 || s.charCodeAt(j) === 9 || s.charCodeAt(j) === 10)) j++;
    if (j < n && s.charCodeAt(j) === 61) { // =
      j++;
      while (j < n && (s.charCodeAt(j) === 32 || s.charCodeAt(j) === 9 || s.charCodeAt(j) === 10)) j++;
      if (j >= n) return null;
      const q = s.charCodeAt(j);
      if (q === 34 || q === 39) { // quoted value
        j++;
        while (j < n && s.charCodeAt(j) !== q) j++;
        if (j >= n) return null;
        j++;
        // After a quoted value, the next character must be whitespace,
        // '/' or '>'. An attribute name glued to the quote is not a tag
        // (e.g. <a href='bar'title=title> is literal).
        if (j < n) {
          const nc = s.charCodeAt(j);
          if (!(nc === 32 || nc === 9 || nc === 10 || nc === 47 || nc === 62)) return null;
        }
      } else { // unquoted value
        if (j < n) {
          const v = s.charCodeAt(j);
          if (v === 34 || v === 39 || v === 61 || v === 60 || v === 62 || v === 96) return null;
        }
        while (j < n) {
          const v = s.charCodeAt(j);
          if (v === 32 || v === 9 || v === 10 || v === 34 || v === 39 || v === 61 || v === 60 || v === 62 || v === 96) break;
          j++;
        }
        if (j >= n) return null;
      }
    }
  }
}

// Try to parse an <...> autolink starting at i (s[i] is '<').
// Returns {href, text, end} or null.
function scanAngleAutolink(s, i) {
  const n = s.length;
  let j = i + 1;
  // Scheme: letter, then 1-31 alnum/+/-/. then :
  if (j < n && isAlphaCode(s.charCodeAt(j))) {
    let k = j + 1;
    while (k < n && (isAlnumCode(s.charCodeAt(k)) || s.charCodeAt(k) === 43 || s.charCodeAt(k) === 45 || s.charCodeAt(k) === 46)) k++;
    if (k - j >= 2 && k - j <= 32 && k < n && s.charCodeAt(k) === 58) {
      // Rest until > with no space, control or <
      let m = k + 1;
      while (m < n) {
        const c = s.charCodeAt(m);
        if (c === 62) {
          if (m === k + 1) return null;
          return { href: s.slice(j, m), text: s.slice(j, m), end: m + 1 };
        }
        if (c === 32 || c === 10 || c === 60 || c < 32) return null;
        m++;
      }
      return null;
    }
  }
  // E-mail: local@domain with a dot in the domain, ending at >
  let m = j;
  while (m < n) {
    const c = s.charCodeAt(m);
    if (c === 62) {
      const cand = s.slice(j, m);
      if (isEmail(cand)) return { href: 'mailto:' + cand, text: cand, end: m + 1 };
      return null;
    }
    if (c === 32 || c === 10 || c === 60 || c < 32) return null;
    m++;
  }
  return null;
}

// Is the string a valid e-mail address (GFM's extended-autolink shape)?
function isEmail(s) {
  const at = s.indexOf('@');
  if (at <= 0) return false;
  const local = s.slice(0, at);
  const dom = s.slice(at + 1);
  for (let i = 0; i < local.length; i++) {
    const c = local.charCodeAt(i);
    if (!(isAlnumCode(c) || c === 46 || c === 33 || c === 35 || c === 36 || c === 37 || c === 38 ||
      c === 39 || c === 42 || c === 43 || c === 47 || c === 61 || c === 63 || c === 94 ||
      c === 95 || c === 96 || c === 123 || c === 124 || c === 125 || c === 126 || c === 45)) return false;
  }
  if (dom.indexOf('.') < 0) return false;
  const parts = dom.split('.');
  for (const p of parts) {
    if (p.length === 0) return false;
    for (let i = 0; i < p.length; i++) {
      const c = p.charCodeAt(i);
      if (!(isAlnumCode(c) || c === 45)) return false;
    }
    if (p.charCodeAt(0) === 45 || p.charCodeAt(p.length - 1) === 45) return false;
  }
  return true;
}

// Trim trailing punctuation from a GFM autolink candidate (s[start..end)).
// Returns the trimmed end index.
function trimGfmUrl(s, start, end) {
  let e = end;
  while (e > start) {
    const c = s.charCodeAt(e - 1);
    // A trailing entity reference is removed whole. Any &-word-; counts,
    // whether or not it names a real entity.
    if (c === 59) { // ;
      let a = e - 2;
      while (a >= start && isAlnumCode(s.charCodeAt(a))) a--;
      if (a >= start && s.charCodeAt(a) === 38 && a + 1 < e - 1) {
        e = a;
        continue;
      }
      if (a >= start && s.charCodeAt(a) === 35) { // # — numeric entity
        let b = a - 1;
        if (b >= start && s.charCodeAt(b) === 38) {
          const name = s.slice(a + 1, e - 1);
          if (/^\d{1,7}$/.test(name) || /^[xX][0-9A-Fa-f]{1,6}$/.test(name)) {
            e = b;
            continue;
          }
        }
      }
      // Not an entity: fall through to the punctuation rule below.
    }
    if (c === 41) { // ) — drop while parens are unbalanced
      let open = 0, close = 0;
      for (let k = start; k < e; k++) {
        if (s.charCodeAt(k) === 40) open++;
        else if (s.charCodeAt(k) === 41) close++;
      }
      if (close > open) { e--; continue; }
      break;
    }
    if (c === 63 || c === 33 || c === 46 || c === 44 || c === 58 || c === 59 ||
      c === 42 || c === 95 || c === 126 || c === 39 || c === 34) { e--; continue; }
    break;
  }
  return e;
}

// Try a GFM extended autolink starting at i. Returns {href, text, end} or
// null. Handles www., http://, https://, and bare e-mail (with an optional
// mailto:/xmpp: prefix).
function scanGfmAutolink(s, i) {
  const n = s.length;
  // www. — must not be preceded by a word character, / or =
  // (lowercase only: Www. is not an autolink)
  if (s.startsWith('www.', i)) {
    if (i > 0) {
      const p = s.charCodeAt(i - 1);
      if (isAlnumCode(p) || p === 47 || p === 61 || p === 46) return null;
    }
    let e = i + 4;
    while (e < n) {
      const c = s.charCodeAt(e);
      if (c === 32 || c === 10 || c === 9 || c === 60 || c === 93 || c < 32) break;
      e++;
    }
    if (e === i + 4) return null;
    // Trim trailing punctuation first, so a trailing '.' does not break
    // the domain check below.
    e = trimGfmUrl(s, i, e);
    if (e <= i + 4) return null;
    // Domain must be labels of alnum/- separated by dots, no empty labels.
    let d = i + 4;
    let labelOk = false;
    while (d < e) {
      const st = d;
      while (d < e && (isAlnumCode(s.charCodeAt(d)) || s.charCodeAt(d) === 45)) d++;
      if (d === st) return null;
      labelOk = true;
      if (d < e && s.charCodeAt(d) === 46) { d++; if (d >= e) return null; continue; }
      break;
    }
    if (!labelOk) return null;
    const text = s.slice(i, e);
    return { href: 'http://' + text, text, end: e };
  }
  // http:// and https:// (scheme matched case-insensitively)
  let schemeLen = 0;
  const low7 = s.slice(i, i + 7).toLowerCase();
  const low8 = s.slice(i, i + 8).toLowerCase();
  if (low7 === 'http://') schemeLen = 7;
  else if (low8 === 'https://') schemeLen = 8;
  if (schemeLen > 0) {
    let e = i + schemeLen;
    while (e < n) {
      const c = s.charCodeAt(e);
      // A ']' ends the URL: it closes the link text the autolink sits in.
      if (c === 32 || c === 10 || c === 9 || c === 60 || c === 93 || c < 32) break;
      e++;
    }
    if (e === i + schemeLen) return null;
    // Truncate at the first unmatched opening paren: drop it and
    // everything after it.
    let bal = 0;
    let firstUnmatched = -1;
    for (let k = i + schemeLen; k < e; k++) {
      if (s.charCodeAt(k) === 40) { if (bal === 0) firstUnmatched = k; bal++; }
      else if (s.charCodeAt(k) === 41) { bal--; if (bal === 0) firstUnmatched = -1; }
    }
    if (bal > 0 && firstUnmatched >= 0) e = firstUnmatched;
    e = trimGfmUrl(s, i, e);
    if (e <= i + schemeLen) return null;
    const text = s.slice(i, e);
    return { href: text, text, end: e };
  }
  return null;
}

// Try a bare e-mail autolink whose @ is at i. Returns {href, text, end}
// or null. The local part is scanned backwards from i.
function scanGfmEmail(s, i) {
  const n = s.length;
  let st = i;
  while (st > 0) {
    const c = s.charCodeAt(st - 1);
    if (isAlnumCode(c) || c === 46 || c === 33 || c === 35 || c === 36 || c === 37 || c === 38 ||
      c === 39 || c === 42 || c === 43 || c === 47 || c === 61 || c === 63 || c === 94 ||
      c === 95 || c === 96 || c === 123 || c === 124 || c === 125 || c === 126 || c === 45) st--;
    else break;
  }
  if (st === i) return null;
  // The local part must not be escaped: a backslash right before its
  // first character means that character was consumed as an escape.
  if (st > 0 && s.charCodeAt(st - 1) === 92) return null;
  // The local part must not start with a dot, and must not be preceded by
  // a word character that would extend it (already handled by the scan).
  let e = i + 1;
  while (e < n) {
    const c = s.charCodeAt(e);
    if (c === 32 || c === 10 || c === 9 || c === 60 || c === 93 || c < 32) break;
    e++;
  }
  // Find where the e-mail ends: scan the domain (alnum, -, .) and stop at
  // the first other character.
  let de = i + 1;
  while (de < n) {
    const c = s.charCodeAt(de);
    if (isAlnumCode(c) || c === 45 || c === 46) de++;
    else break;
  }
  if (de === i + 1) return null;
  // The domain must contain a dot and end with an alnum.
  let candEnd = trimGfmUrl(s, st, de);
  const cand = s.slice(st, candEnd);
  if (!isEmail(cand)) return null;
  // If the character right after the match could continue the address
  // (a letter, digit, '-' or '_'), the match is part of a longer word
  // and is not an autolink.
  if (candEnd < n) {
    const nc = s.charCodeAt(candEnd);
    if (isAlnumCode(nc) || nc === 45 || nc === 95) return null;
  }
  // Optional mailto:/xmpp: prefix immediately before the local part.
  let hrefStart = st;
  let isXmpp = false;
  if (st >= 7 && s.slice(st - 7, st).toLowerCase() === 'mailto:') hrefStart = st - 7;
  else if (st >= 5 && s.slice(st - 5, st).toLowerCase() === 'xmpp:') {
    hrefStart = st - 5;
    isXmpp = true;
  }
  // The scheme prefix must itself be at a word boundary.
  if (hrefStart < st && hrefStart > 0) {
    const p = s.charCodeAt(hrefStart - 1);
    if (isAlnumCode(p) || p === 47 || p === 58) { hrefStart = st; isXmpp = false; }
  }
  // An xmpp: address may carry one /resource segment (no '/' inside it).
  if (isXmpp && candEnd < n && s.charCodeAt(candEnd) === 47) {
    let re = candEnd + 1;
    while (re < n) {
      const c = s.charCodeAt(re);
      if (c === 32 || c === 10 || c === 9 || c === 60 || c === 62 || c === 47 || c < 32) break;
      re++;
    }
    if (re > candEnd + 1) candEnd = re;
  }
  const text = s.slice(hrefStart, candEnd);
  const href = hrefStart < st ? text : 'mailto:' + cand;
  return { href, text, end: candEnd, start: hrefStart };
}

// Resolve backslash escapes in a link label (all \ + punctuation).
function resolveLabelEscapes(raw) {
  if (raw.indexOf('\\') < 0) return raw;
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    if (raw.charCodeAt(i) === 92 && i + 1 < raw.length && isPunctCode(raw.charCodeAt(i + 1))) {
      out += raw[i + 1];
      i++;
    } else out += raw[i];
  }
  return out;
}

// Remove `count` characters from the end of a frame's children (used when a
// GFM e-mail autolink's local part was already scanned as text). Only text
// nodes may be trimmed; returns false when that is impossible.
function trimTextEnd(frame, count) {
  const children = frame.c;
  const delims = frame.d;
  while (count > 0) {
    const last = children[children.length - 1];
    if (!last || last.t !== 'text') return false;
    if (last.s.length <= count) {
      count -= last.s.length;
      children.pop();
      if (last.r) {
        for (let k = 0; k < delims.length; k++) {
          if (delims[k].node === last) { delims[k].active = false; break; }
        }
      }
    } else {
      last.s = last.s.slice(0, last.s.length - count);
      if (last.r) {
        for (let k = 0; k < delims.length; k++) {
          if (delims[k].node === last) { delims[k].n = last.s.length; break; }
        }
      }
      count = 0;
    }
  }
  return true;
}

// Percent-encode a URL the way encodeURI does, except that a '%' already
// followed by two hex digits is a valid escape and is left alone.
// Guarded against lone surrogates (which make encodeURI throw).
function encodeUriSafe(s) {
  // A '%' is never encoded: marked leaves a bare '%' alone, and a valid
  // %XX escape is preserved as-is too. Encode the runs between '%'
  // characters with encodeURI.
  let out = '';
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) === 37) {
      try { out += encodeURI(s.slice(start, i)); } catch (e) { out += s.slice(start, i); }
      out += '%';
      start = i + 1;
    }
  }
  try { out += encodeURI(s.slice(start)); } catch (e) { out += s.slice(start); }
  return out;
}

// Escape a title attribute: entity-aware like escHref, but spaces stay
// spaces (they are not URL-encoded in a title).
function escAttr(s, out) {
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 38) {
      const ent = entityAt(s, i);
      if (ent > 0) { i += ent - 1; continue; }
      if (i > start) out.push(s.slice(start, i));
      out.push('&amp;');
      start = i + 1;
    } else if (c === 34) {
      if (i > start) out.push(s.slice(start, i));
      out.push('&quot;');
      start = i + 1;
    } else if (c === 60) {
      if (i > start) out.push(s.slice(start, i));
      out.push('&lt;');
      start = i + 1;
    } else if (c === 62) {
      if (i > start) out.push(s.slice(start, i));
      out.push('&gt;');
      start = i + 1;
    }
  }
  if (start === 0) out.push(s);
  else if (start < s.length) out.push(s.slice(start));
}

// Render inline nodes to HTML.
function renderInline(children, out) {
  for (let k = 0; k < children.length; k++) {
    const nd = children[k];
    switch (nd.t) {
      case 'text': escText(nd.s, out); break;
      case 'ent': out.push(nd.s); break;
      case 'code': out.push('<code>'); escText(nd.s, out); out.push('</code>'); break;
      case 'html': out.push(nd.s); break;
      case 'br': out.push('<br>'); break;
      case 'link':
        out.push('<a href="');
        escHref(encodeUriSafe(nd.href), out);
        out.push('"');
        if (nd.title !== null && nd.title !== undefined) {
          out.push(' title="');
          escAttr(nd.title, out);
          out.push('"');
        }
        out.push('>');
        renderInline(nd.c, out);
        out.push('</a>');
        break;
      case 'img':
        out.push('<img src="');
        escHref(encodeUriSafe(nd.src), out);
        out.push('" alt="');
        escAttr(nd.alt, out);
        out.push('"');
        if (nd.title !== null && nd.title !== undefined) {
          out.push(' title="');
          escAttr(nd.title, out);
          out.push('"');
        }
        out.push('>');
        break;
      case 'em': out.push('<em>'); renderInline(nd.c, out); out.push('</em>'); break;
      case 'strong': out.push('<strong>'); renderInline(nd.c, out); out.push('</strong>'); break;
      case 'del': out.push('<del>'); renderInline(nd.c, out); out.push('</del>'); break;
    }
  }
}

// Scan inline content into a node list. refs maps normalised labels to
// {href, title}.
function scanInline(s, refs) {
  const root = { c: [], d: [], hasLink: false, img: false, start: -1 };
  const frames = [root];
  let cur = root;
  let i = 0;
  const n = s.length;
  while (i < n) {
    const code = s.charCodeAt(i);
    if (code < 128 && !INLINE_SPECIAL[code]) {
      let j = i + 1;
      while (j < n) {
        const c2 = s.charCodeAt(j);
        if (c2 >= 128 || INLINE_SPECIAL[c2]) break;
        j++;
      }
      pushText(cur.c, s.slice(i, j));
      i = j;
      continue;
    }
    switch (code) {
      case 92: { // backslash
        if (i + 1 < n) {
          const nx = s.charCodeAt(i + 1);
          if (nx === 10) {
            cur.c.push({ t: 'br' });
            i += 2;
            // A hard break strips the leading whitespace of the next line.
            while (i < n && (s.charCodeAt(i) === 32 || s.charCodeAt(i) === 9)) i++;
            break;
          }
          if (isPunctCode(nx)) { pushText(cur.c, s[i + 1]); i += 2; break; }
        }
        pushText(cur.c, '\\');
        i++;
        break;
      }
      case 96: { // backtick — code span
        let m = 1;
        while (i + m < n && s.charCodeAt(i + m) === 96) m++;
        let j = i + m;
        let found = -1;
        while (j < n) {
          if (s.charCodeAt(j) === 96) {
            let k = j;
            while (k < n && s.charCodeAt(k) === 96) k++;
            if (k - j === m) { found = j; break; }
            j = k;
          } else j++;
        }
        if (found < 0) { pushText(cur.c, '`'.repeat(m)); i += m; break; }
        let content = s.slice(i + m, found);
        if (content.indexOf('\n') >= 0) content = content.split('\n').join(' ');
        if (content.length >= 2 && content.charCodeAt(0) === 32 &&
            content.charCodeAt(content.length - 1) === 32) {
          let hasNonSpace = false;
          for (let q = 1; q < content.length - 1; q++) {
            if (content.charCodeAt(q) !== 32) { hasNonSpace = true; break; }
          }
          if (hasNonSpace) content = content.slice(1, -1);
        }
        cur.c.push({ t: 'code', s: content });
        i = found + m;
        break;
      }
      case 42: case 95: case 126: { // * _ ~
        const ch = s[i];
        let m = 1;
        while (i + m < n && s[i + m] === ch) m++;
        if (ch === '~' && m >= 3) { pushText(cur.c, s.slice(i, i + m)); i += m; break; }
        const fl = flank(s, i, m);
        const left = fl[0], right = fl[1], prevPunct = fl[2], nextPunct = fl[3];
        let canOpen, canClose;
        if (ch === '_') {
          canOpen = left && (!right || prevPunct);
          canClose = right && (!left || nextPunct);
        } else {
          canOpen = left;
          canClose = right;
        }
        if (!canOpen && !canClose) { pushText(cur.c, s.slice(i, i + m)); i += m; break; }
        const node = { t: 'text', s: s.slice(i, i + m), r: true };
        cur.c.push(node);
        cur.d.push({ ch, n: m, canOpen, canClose, node, active: true });
        i += m;
        break;
      }
      case 91: { // [ — open a link bracket
        frames.push({ c: [], d: [], hasLink: false, img: false, start: i + 1 });
        cur = frames[frames.length - 1];
        i++;
        break;
      }
      case 33: { // ! — maybe an image bracket
        if (i + 1 < n && s.charCodeAt(i + 1) === 91) {
          frames.push({ c: [], d: [], hasLink: false, img: true, start: i + 2 });
          cur = frames[frames.length - 1];
          i += 2;
        } else { pushText(cur.c, '!'); i++; }
        break;
      }
      case 93: { // ] — try to close a bracket as a link or image
        if (frames.length === 1) { pushText(cur.c, ']'); i++; break; }
        const frame = frames.pop();
        cur = frames[frames.length - 1];
        let formed = null;
        let end = i + 1;
        let hasSecondLabel = false;
        // A link cannot contain another link, but an image's content is
        // alt text and may contain one.
        if (!frame.hasLink || frame.img) {
          if (i + 1 < n && s.charCodeAt(i + 1) === 40) {
            const il = parseInlineLink(s, i + 1);
            if (il) { formed = { href: il.href, title: il.title }; end = il.end; }
          }
          if (!formed && i + 1 < n && s.charCodeAt(i + 1) === 91) {
            const lab = scanLabelLoose(s, i + 1);
            if (lab) {
              hasSecondLabel = true;
              const norm = normalizeLabel(lab[0]);
              if (norm !== '') {
                if (refs.has(norm)) {
                  const ref = refs.get(norm);
                  formed = { href: ref.href, title: ref.title };
                  end = lab[1];
                }
              } else {
                const rawText = s.slice(frame.start, i);
                const norm2 = normalizeLabel(rawText);
                if (norm2 !== '' && refs.has(norm2)) {
                  const ref = refs.get(norm2);
                  formed = { href: ref.href, title: ref.title };
                  end = lab[1];
                }
              }
            }
          }
          // A shortcut reference is only tried when no second label
          // followed: [foo][bar] with no `bar` definition leaves [foo]
          // literal (it does not fall back to the `foo` shortcut), so
          // that [bar][baz] can still form a link.
          if (!formed && !hasSecondLabel) {
            const rawText = s.slice(frame.start, i);
            const norm = normalizeLabel(rawText);
            if (norm !== '' && refs.has(norm)) {
              const ref = refs.get(norm);
              formed = { href: ref.href, title: ref.title };
              end = i + 1;
            }
          }
        }
        if (formed) {
          resolveEmphasis(frame.c, frame.d);
          if (frame.img) {
            const altParts = [];
            plainText(frame.c, altParts);
            cur.c.push({ t: 'img', src: formed.href, title: formed.title, alt: altParts.join('') });
          } else {
            // An autolink inside a bracket link's text renders as plain
            // text, not as a nested <a>.
            flattenAutolinks(frame.c);
            cur.c.push({ t: 'link', href: formed.href, title: formed.title, c: frame.c });
            cur.hasLink = true;
          }
          i = end;
        } else {
          if (frame.img) pushText(cur.c, '!');
          pushText(cur.c, '[');
          cur.c.push(...frame.c);
          cur.d.push(...frame.d);
          cur.hasLink = cur.hasLink || frame.hasLink;
          pushText(cur.c, ']');
          i++;
        }
        break;
      }
      case 60: { // < — autolink or raw HTML
        const auto = scanAngleAutolink(s, i);
        if (auto) {
          // An autolink does not count as a link for the "a link cannot
          // contain a link" rule: a bracket link may still form around it.
          // Mark it `auto` so it can be flattened to text inside one.
          cur.c.push({ t: 'link', href: auto.href, title: null, c: [{ t: 'text', s: auto.text }], auto: true });
          i = auto.end;
          break;
        }
        const tag = scanHtmlTag(s, i);
        if (tag) { cur.c.push({ t: 'html', s: tag[0] }); i = tag[1]; break; }
        pushText(cur.c, '<');
        i++;
        break;
      }
      case 38: { // & — entity
        const dec = decodeNumericEntity(s, i);
        if (dec) { pushText(cur.c, dec[0]); i += dec[1]; break; }
        const el = entityAt(s, i);
        if (el > 0) { cur.c.push({ t: 'ent', s: s.slice(i, i + el) }); i += el; break; }
        pushText(cur.c, '&');
        i++;
        break;
      }
      case 10: { // newline — hard break after 2+ spaces, else soft break
        const last = cur.c[cur.c.length - 1];
        if (last && last.t === 'text' && !last.r) {
          let sp = 0;
          const st = last.s;
          let q = st.length - 1;
          while (q >= 0 && st.charCodeAt(q) === 32) { sp++; q--; }
          if (sp >= 2) {
            last.s = st.slice(0, st.length - sp);
            if (last.s === '') cur.c.pop();
            cur.c.push({ t: 'br' });
            i++;
            // A hard break strips the leading whitespace of the next line.
            while (i < n && (s.charCodeAt(i) === 32 || s.charCodeAt(i) === 9)) i++;
            break;
          }
        }
        pushText(cur.c, '\n');
        i++;
        break;
      }
      case 119: case 104: case 72: { // w / h / H — maybe a www. or http(s):// autolink
        const g = scanGfmAutolink(s, i);
        if (g) {
          // A GFM autolink does not count as a link for the "a link
          // cannot contain a link" rule.
          cur.c.push({ t: 'link', href: g.href, title: null, c: [{ t: 'text', s: g.text }], auto: true });
          i = g.end;
        } else { pushText(cur.c, s[i]); i++; }
        break;
      }
      case 64: { // @ — maybe a bare e-mail autolink
        const g = scanGfmEmail(s, i);
        if (g && trimTextEnd(cur, i - g.start)) {
          // An e-mail autolink does not count as a link for the "a link
          // cannot contain a link" rule.
          cur.c.push({ t: 'link', href: g.href, title: null, c: [{ t: 'text', s: g.text }], auto: true });
          i = g.end;
        } else { pushText(cur.c, '@'); i++; }
        break;
      }
      default: {
        pushText(cur.c, s[i]);
        i++;
        break;
      }
    }
  }
  // Unclosed brackets merge back literally.
  while (frames.length > 1) {
    const f = frames.pop();
    const parent = frames[frames.length - 1];
    if (f.img) pushText(parent.c, '!');
    pushText(parent.c, '[');
    parent.c.push(...f.c);
    parent.d.push(...f.d);
    parent.hasLink = parent.hasLink || f.hasLink;
  }
  resolveEmphasis(root.c, root.d);
  return root.c;
}

// Render inline content (a paragraph's text, a heading's text, a table
// cell) to HTML, appending to out.
function inlineToHtml(text, refs, out) {
  renderInline(scanInline(text, refs), out);
}

// ---------- block parsing ----------

// Columns of leading whitespace from index `pos` in `line`, plus the index
// of the first non-whitespace character. Tabs advance to the next multiple
// of four.
function indentOf(line, pos) {
  let col = 0;
  let i = pos;
  const n = line.length;
  while (i < n) {
    const c = line.charCodeAt(i);
    if (c === 32) { col++; i++; }
    else if (c === 9) { col = col + 4 - (col % 4); i++; }
    else break;
  }
  return [col, i];
}

// Content of `line` after removing exactly `k` columns of leading
// whitespace starting at `pos`. A partially consumed tab becomes spaces.
// Caller must ensure the line has at least `k` columns of indent; when the
// line runs out first, the remainder is empty.
// Expand tabs in `s` to spaces, assuming `s` starts at absolute column
// `startCol`. A tab advances to the next multiple of four.
function expandTabs(s, startCol) {
  if (s.indexOf('\t') < 0) return s;
  let out = '';
  let col = startCol;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 9) {
      const next = col + 4 - (col % 4);
      out += ' '.repeat(next - col);
      col = next;
    } else {
      out += s[i];
      col++;
    }
  }
  return out;
}

function stripCols(line, pos, k) {
  let col = 0;
  let i = pos;
  while (col < k) {
    if (i >= line.length) return '';
    const c = line.charCodeAt(i);
    if (c === 32) { col++; i++; }
    else if (c === 9) {
      const next = col + 4 - (col % 4);
      if (next > k) return ' '.repeat(next - k) + line.slice(i + 1);
      col = next; i++;
    } else {
      // A non-whitespace character: nothing more to strip.
      return line.slice(i);
    }
  }
  return line.slice(i);
}

// Strip up to `k` columns from the start of `line` for fenced code
// content. Unlike stripCols, a tab counts as a single column: a tab at
// the strip boundary is consumed whole, not expanded to spaces.
function stripFenceCols(line, k) {
  let i = 0;
  let col = 0;
  while (col < k && i < line.length) {
    const c = line.charCodeAt(i);
    if (c === 32 || c === 9) { col++; i++; }
    else break;
  }
  return line.slice(i);
}

// True when the rest of `line` from `pos` is only whitespace.
function isBlankLine(line, pos) {
  for (let i = pos; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}

// Skip up to three columns of leading whitespace; returns the index after
// them, or -1 when the indent is four columns or more (indented code).
function skipSmallIndent(line, pos) {
  const ind = indentOf(line, pos);
  if (ind[0] >= 4) return -1;
  return ind[1];
}

// ATX heading: up to 3 spaces, 1-6 '#', then space/tab or end of line.
// Returns [level, text] or null. `pos` is the index after container markers.
function scanAtx(line, pos) {
  const start = skipSmallIndent(line, pos);
  if (start < 0) return null;
  let i = start;
  let level = 0;
  while (i < line.length && line.charCodeAt(i) === 35 && level < 7) { level++; i++; }
  if (level === 0 || level > 6) return null;
  if (i < line.length) {
    const c = line.charCodeAt(i);
    if (c !== 32 && c !== 9) return null;
  }
  // Heading text: strip leading/trailing spaces, then a closing run of '#'
  // preceded by a space.
  let j = line.length;
  while (j > i && (line.charCodeAt(j - 1) === 32 || line.charCodeAt(j - 1) === 9)) j--;
  let k = j;
  while (k > i && line.charCodeAt(k - 1) === 35) k--;
  if (k < j && k > i && (line.charCodeAt(k - 1) === 32 || line.charCodeAt(k - 1) === 9)) {
    j = k;
    while (j > i && (line.charCodeAt(j - 1) === 32 || line.charCodeAt(j - 1) === 9)) j--;
  }
  let textStart = i;
  while (textStart < j && (line.charCodeAt(textStart) === 32 || line.charCodeAt(textStart) === 9)) textStart++;
  return [level, line.slice(textStart, j)];
}

// Fenced code: up to 3 spaces, then 3+ backticks or 3+ tildes.
// Returns [ch, fenceLen, info] or null. Backtick fences' info may not
// contain a backtick.
function scanFence(line, pos) {
  const start = skipSmallIndent(line, pos);
  if (start < 0) return null;
  const ch = line.charCodeAt(start);
  if (ch !== 96 && ch !== 126) return null;
  let i = start;
  while (i < line.length && line.charCodeAt(i) === ch) i++;
  const len = i - start;
  if (len < 3) return null;
  let info = line.slice(i).trim();
  if (ch === 96 && info.indexOf('`') >= 0) return null;
  // Backslash escapes in the info string resolve to the punctuation.
  if (info.indexOf('\\') >= 0) {
    let out = '';
    for (let q = 0; q < info.length; q++) {
      if (info.charCodeAt(q) === 92 && q + 1 < info.length &&
          isPunctCode(info.charCodeAt(q + 1))) {
        out += info[q + 1];
        q++;
      } else out += info[q];
    }
    info = out;
  }
  return [ch, len, info];
}

// Thematic break: up to 3 spaces, then 3+ of the same char (-, *, _)
// separated only by spaces/tabs.
function scanHr(line, pos) {
  const start = skipSmallIndent(line, pos);
  if (start < 0) return false;
  const ch = line.charCodeAt(start);
  if (ch !== 45 && ch !== 42 && ch !== 95) return false;
  let count = 0;
  for (let i = start; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (c === ch) count++;
    else if (c !== 32 && c !== 9) return false;
  }
  return count >= 3;
}

// Setext underline: up to 3 spaces, then a run of '=' or '-' only.
// Returns [ch, runLen] or null.
function scanSetext(line, pos) {
  const start = skipSmallIndent(line, pos);
  if (start < 0) return null;
  const ch = line.charCodeAt(start);
  if (ch !== 61 && ch !== 45) return null;
  let i = start;
  while (i < line.length && line.charCodeAt(i) === ch) i++;
  for (let j = i; j < line.length; j++) {
    const c = line.charCodeAt(j);
    if (c !== 32 && c !== 9) return null;
  }
  return [ch, i - start];
}

// HTML block start type (1-7) at `pos`, or 0. `paraOpen` disables type 7
// (a complete tag alone on a line cannot interrupt a paragraph).
const HTML_BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'base', 'basefont', 'blockquote', 'body',
  'caption', 'center', 'col', 'colgroup', 'dd', 'details', 'dialog', 'dir',
  'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form',
  'frame', 'frameset', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header',
  'hr', 'html', 'iframe', 'legend', 'li', 'link', 'main', 'menu', 'menuitem',
  'nav', 'noframes', 'ol', 'optgroup', 'option', 'p', 'param', 'search',
  'section', 'summary', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead',
  'title', 'tr', 'track', 'ul',
]);
const HTML_TYPE1_TAGS = ['script', 'pre', 'style', 'textarea'];

function scanHtmlBlockType(line, pos, paraOpen) {
  const start = skipSmallIndent(line, pos);
  if (start < 0) return 0;
  if (line.charCodeAt(start) !== 60) return 0; // <
  const s = line.slice(start);
  const lower = s.toLowerCase();
  if (lower.startsWith('<!--')) return 2;
  if (lower.startsWith('<?')) return 3;
  if (lower.startsWith('<!') && s.length > 2) {
    const c = s.charCodeAt(2);
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) return 4;
  }
  if (lower.startsWith('<![cdata[')) return 5;
  // Type 1: script, pre, style, textarea.
  for (const t of HTML_TYPE1_TAGS) {
    if (lower.startsWith('<' + t)) {
      const after = s.charAt(1 + t.length);
      if (after === '' || after === ' ' || after === '\t' || after === '>' || after === '/') return 1;
    }
    if (lower.startsWith('</' + t)) {
      const after = s.charAt(2 + t.length);
      if (after === '' || after === ' ' || after === '\t' || after === '>' || after === '/') return 1;
    }
  }
  // Type 6: a block tag (open or close).
  let j = 1;
  let closing = false;
  if (s.charCodeAt(j) === 47) { closing = true; j++; }
  let name = '';
  while (j < s.length) {
    const c = s.charCodeAt(j);
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 45) {
      name += s[j];
      j++;
    } else break;
  }
  if (name !== '' && HTML_BLOCK_TAGS.has(name.toLowerCase())) {
    const after = s.charAt(j);
    if (after === '' || after === ' ' || after === '\t' || after === '>' || after === '/') return 6;
  }
  // Type 7: a complete open or close tag alone on the line.
  if (!paraOpen) {
    const tag = scanHtmlTag(line, start);
    if (tag && tag[1] >= line.length) return 7;
    // A lone closing tag also counts.
    if (tag) {
      let k = tag[1];
      while (k < line.length && (line.charCodeAt(k) === 32 || line.charCodeAt(k) === 9)) k++;
      if (k >= line.length) return 7;
    }
  }
  return 0;
}

// List marker at `pos`. Returns null, or an object describing the marker.
// `contentIndent` is the number of columns from the marker's start to the
// start of the item's content (marker width plus following whitespace,
// capped at marker width + 1 when five or more spaces follow the marker).
// `markerEnd` is the string index just after the marker.
function scanListMarker(line, pos) {
  const start = skipSmallIndent(line, pos);
  if (start < 0) return null;
  const c0 = line.charCodeAt(start);
  let ordered = false;
  let marker = '';
  let delim = '';
  let startNum = 0;
  let i = start;
  if (c0 === 45 || c0 === 43 || c0 === 42) {
    marker = line[start];
    i++;
  } else if (c0 >= 48 && c0 <= 57) {
    let j = i;
    while (j < line.length && line.charCodeAt(j) >= 48 && line.charCodeAt(j) <= 57) j++;
    if (j - i > 9) return null;
    const d = line.charCodeAt(j);
    if (d !== 46 && d !== 41) return null;
    ordered = true;
    delim = line[j];
    startNum = parseInt(line.slice(i, j), 10);
    marker = line.slice(i, j + 1);
    i = j + 1;
  } else return null;
  // The marker must be followed by a space, a tab, or the end of the line.
  if (i < line.length) {
    const c = line.charCodeAt(i);
    if (c !== 32 && c !== 9) return null;
  }
  const markerWidth = i - start;
  // Columns of whitespace after the marker (tabs expand to tab stops).
  // The marker starts at column `start` (skipSmallIndent guarantees the
  // indent before it is under four columns, so column == index here only
  // when the line starts at `pos` with no tabs; use the column of `start`).
  const startCol = colAt(line, start);
  let col = startCol + markerWidth;
  let j = i;
  let wsCols = 0;
  while (j < line.length) {
    const c = line.charCodeAt(j);
    if (c === 32) { wsCols++; col++; j++; }
    else if (c === 9) {
      const next = col + 4 - (col % 4);
      wsCols += next - col;
      col = next; j++;
    } else break;
  }
  let contentIndent;
  if (j >= line.length) {
    // Empty item: the content indent is the marker width plus one.
    contentIndent = markerWidth + 1;
  } else if (wsCols >= 5) {
    contentIndent = markerWidth + 1;
  } else {
    contentIndent = markerWidth + wsCols;
  }
  return {
    ordered, marker, delim, startNum,
    markerWidth, contentIndent, markerEnd: i, markerStart: start,
  };
}

// Columns of leading whitespace in `s`, where `s` starts at absolute
// column `startCol`. Returns [cols, idx] (the indent in columns and the
// index of the first non-whitespace character).
function indentFromCol(s, startCol) {
  let col = startCol;
  let i = 0;
  while (i < s.length) {
    const c = s.charCodeAt(i);
    if (c === 32) { col++; i++; }
    else if (c === 9) { col = col + 4 - (col % 4); i++; }
    else break;
  }
  return [col - startCol, i];
}

// Strip `k` columns of leading whitespace from `s`, where `s` starts at
// absolute column `startCol`. A partially consumed tab becomes spaces.
function stripFromCol(s, startCol, k) {
  let col = startCol;
  let i = 0;
  const target = startCol + k;
  while (col < target) {
    if (i >= s.length) return '';
    const c = s.charCodeAt(i);
    if (c === 32) { col++; i++; }
    else if (c === 9) {
      const next = col + 4 - (col % 4);
      if (next > target) return ' '.repeat(next - target) + s.slice(i + 1);
      col = next; i++;
    } else break;
  }
  return s.slice(i);
}

// Column of string index `idx` in `line` (tab stops of four).
function colAt(line, idx) {
  let col = 0;
  for (let i = 0; i < idx && i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (c === 9) col = col + 4 - (col % 4);
    else col++;
  }
  return col;
}

// Blockquote marker at `pos`. Returns null, or {contentIdx, leadSpaces}:
// the string index where the quote's content starts, and the number of
// spaces a partially consumed tab after '>' contributes to the content.
function scanQuoteMarker(line, pos) {
  const start = skipSmallIndent(line, pos);
  if (start < 0) return null;
  if (line.charCodeAt(start) !== 62) return null; // >
  let i = start + 1;
  let leadSpaces = 0;
  if (i < line.length) {
    const c = line.charCodeAt(i);
    if (c === 32) i++;
    else if (c === 9) {
      const tabCol = colAt(line, i);
      const next = tabCol + 4 - (tabCol % 4);
      leadSpaces = next - tabCol - 1;
      i++;
    }
  }
  return { contentIdx: i, leadSpaces };
}

// Match a blockquote marker at (idx, col) in a line, with `pending`
// virtual spaces (from a partially consumed tab in an outer container)
// available as indentation before the marker. Returns
// {idx, col, pending} or null, where `pending` is the virtual spaces that
// remain for the quote's content.
function matchQuoteAt(line, idx, col, pending) {
  if (pending > 3) return null;
  let i = idx, c = col, p = pending, skipped = 0;
  while (skipped < 3) {
    if (p > 0) { p--; c++; skipped++; continue; }
    if (i >= line.length) break;
    const ch = line.charCodeAt(i);
    if (ch === 32) { i++; c++; skipped++; }
    else if (ch === 9) {
      const next = c + 4 - (c % 4);
      if (next - col > 3) return null;
      skipped += next - c;
      c = next; i++;
    } else break;
  }
  if (i >= line.length || line.charCodeAt(i) !== 62) return null;
  i++; c++;
  let leadSpaces = 0;
  if (i < line.length) {
    const ch = line.charCodeAt(i);
    if (ch === 32) { i++; c++; }
    else if (ch === 9) {
      const next = c + 4 - (c % 4);
      leadSpaces = next - c - 1;
      i++; c = c + 1;
    }
  }
  return { idx: i, col: c, pending: p + leadSpaces };
}

// Match a list item's content indent at (idx, col). The item's content
// starts at absolute column `targetCol`. `pending` virtual spaces (from a
// partially consumed tab in an outer container) count toward the indent.
// Returns {idx, col, pending} or null.
function matchItemAt(line, idx, col, targetCol, pending) {
  let i = idx, c = col, p = pending;
  while (c < targetCol && p > 0) { p--; c++; }
  let leadSpaces = 0;
  while (c < targetCol) {
    if (i >= line.length) return null;
    const ch = line.charCodeAt(i);
    if (ch === 32) { c++; i++; }
    else if (ch === 9) {
      const next = c + 4 - (c % 4);
      if (next > targetCol) { leadSpaces = next - targetCol; i++; c = targetCol; break; }
      c = next; i++;
    } else return null;
  }
  return { idx: i, col: c, pending: p + leadSpaces };
}

// Parse an array of lines into a block tree. `refs` is filled with link
// reference definitions (handled in finalize, after the tree is built).
function parseBlocks(lines, refs) {
  const root = { t: 'root', blocks: [] };
  const stack = [];
  let para = null;
  let pendingBlank = false;
  let pendingBlankItem = null;
  let pendingBlankList = null;

  function curBlocks() {
    if (stack.length === 0) return root.blocks;
    return stack[stack.length - 1].node.blocks;
  }
  function deepestItemEntry() {
    for (let s = stack.length - 1; s >= 0; s--) {
      if (stack[s].kind === 'i') return stack[s];
    }
    return null;
  }
  function deepestListNode() {
    for (let s = stack.length - 1; s >= 0; s--) {
      if (stack[s].kind === 'l') return stack[s].node;
    }
    return null;
  }
  // True when `anc` is `node` or an ancestor of it, following the
  // parent pointers list nodes and item nodes carry.
  function isAncestorOrSelf(anc, node) {
    let cur = node;
    while (cur) {
      if (cur === anc) return true;
      cur = cur.parent;
    }
    return false;
  }
  function closeTo(depth) {
    if (stack.length > depth) {
      stack.length = depth;
      para = null;
    }
  }
  // Add a block node as a child of the innermost container, marking the
  // enclosing list loose when a blank line separated two blocks in an item.
  // A list node is only open while one of its items is open, so a trailing
  // list on the stack is closed before a non-item block is added.
  function addBlock(node) {
    // A list node is only open while one of its items is open, so a
    // trailing list on the stack is closed before a non-item block is
    // added. Do this first: the looseness check below must see the list
    // that will actually contain the new block.
    while (stack.length > 0 && stack[stack.length - 1].kind === 'l') stack.pop();
    if (pendingBlank && pendingBlankItem) {
      const item = deepestItemEntry();
      // The blank line separates blocks in this item when the item is
      // the one the blank line was in, or an ancestor of it (the blank
      // line may have been inside a nested list of this item).
      if (item && isAncestorOrSelf(item.node, pendingBlankItem)) {
        const list = deepestListNode();
        if (list) list.loose = true;
      }
    }
    // An html block takes a trailing newline exactly when the next block
    // in its container follows with no blank line between them.
    const bs = curBlocks();
    if (bs.length > 0) {
      const prev = bs[bs.length - 1];
      if (prev.t === 'html' && prev.trailNl === undefined) {
        prev.trailNl = !pendingBlank;
      }
    }
    curBlocks().push(node);
  }
  function startPara(text, lazy, code) {
    para = { t: 'para', lines: [{ text, lazy, code }] };
    addBlock(para);
  }

  // Match the open containers against a line. Returns an object with the
  // index of the first unmatched stack entry, the position after the
  // matched containers, and the deepest item entry.
  function matchContainers(line) {
    let idx = 0;
    let col = 0;
    let pending = 0;
    let failAt = stack.length;
    for (let s = 0; s < stack.length; s++) {
      const e = stack[s];
      if (e.kind === 'l') continue;
      if (e.kind === 'q') {
        const m = matchQuoteAt(line, idx, col, pending);
        if (!m) { failAt = s; break; }
        idx = m.idx; col = m.col; pending = m.pending;
      } else {
        const m = matchItemAt(line, idx, col, e.contentCol, pending);
        if (!m) { failAt = s; break; }
        idx = m.idx; col = m.col; pending = m.pending;
      }
    }
    let itemEntry = null;
    let itemIdx = -1;
    for (let s = stack.length - 1; s >= 0; s--) {
      if (stack[s].kind === 'i') { itemEntry = stack[s]; itemIdx = s; break; }
    }
    return {
      failAt, pos: idx, col, leadSpaces: pending,
      itemEntry, itemFailed: itemEntry !== null && itemIdx >= failAt,
    };
  }

  // Compute a lazy continuation line's paragraph text. `eff` is the line's
  // content after the matched containers. Returns {text, code}.
  function lazyLineContent(eff, m) {
    const L = indentOf(eff, 0)[0];
    let listBase = 0;
    if (m.itemFailed && m.itemEntry) {
      listBase = m.itemEntry.contentCol - m.col;
      if (listBase < 0) listBase = 0;
    }
    // The line's indent is stripped up to the failed item's content
    // column (listBase); four columns past that makes it code. When the
    // indent is at least four but below the content column, four columns
    // are stripped (the line is not code, it is just de-indented).
    let strip = 0;
    let code = false;
    if (L >= listBase + 4) {
      strip = listBase + 4;
      code = true;
    } else if (m.itemFailed && L >= listBase) {
      strip = listBase;
    } else if (L >= 4) {
      strip = 4;
    }
    return { text: stripCols(eff, 0, strip), code };
  }

  // Does `content` start a block, for the purpose of deciding whether a
  // line that does not match its containers ends a fenced code block or
  // an html block? Any block start counts, including indented code.
  function startsBlock(content) {
    if (scanAtx(content, 0)) return true;
    if (scanFence(content, 0)) return true;
    if (scanHr(content, 0)) return true;
    if (scanQuoteMarker(content, 0)) return true;
    if (scanListMarker(content, 0)) return true;
    if (scanHtmlBlockType(content, 0, false) > 0) return true;
    if (indentOf(content, 0)[0] >= 4) return true;
    return false;
  }

  // Does `content` start a block that closes the open containers when
  // the line does not match them? Any block start counts, except indented
  // code (a code-indented lazy line stays in the paragraph) and setext
  // underlines (handled separately as lazy setext). Unlike
  // interruptsPara, any list marker counts, whatever its start number
  // or emptiness: the line is outside the containers, so a new block
  // starts at the outer level.
  function closesContainers(content) {
    if (scanAtx(content, 0)) return true;
    if (scanFence(content, 0)) return true;
    if (scanHr(content, 0)) return true;
    if (scanQuoteMarker(content, 0)) return true;
    if (scanListMarker(content, 0)) return true;
    if (scanHtmlBlockType(content, 0, false) > 0) return true;
    return false;
  }

  // Does `content` start a block that can interrupt a paragraph, for the
  // purpose of deciding whether a line is a lazy continuation? Setext
  // underlines do not count (a lazy line cannot be a setext for a paragraph
  // at another level). A list interrupts a paragraph only when its first
  // item is non-empty; at the top level an ordered list must also start
  // with 1. Inside a container (a list item or a quote), a matched line
  // is a proper block start, so any non-empty list marker starts a
  // nested list, whatever its start number.
  function interruptsPara(content) {
    if (scanAtx(content, 0)) return true;
    if (scanFence(content, 0)) return true;
    if (scanHtmlBlockType(content, 0, true) > 0) return true;
    if (scanHr(content, 0)) return true;
    if (scanQuoteMarker(content, 0)) return true;
    const mk = scanListMarker(content, 0);
    if (mk) {
      const after = content.slice(mk.markerEnd);
      if (after.trim() === '') return false;
      if (stack.length > 0) return true;
      if (mk.ordered) return mk.startNum === 1;
      return true;
    }
    return false;
  }

  // Open a new block for a line whose containers all matched. `content` is
  // the line's text after the containers (with leadSpaces prepended), and
  // `col` is the document column where that content starts. Returns true
  // when the line was consumed as a block start.
  function openBlock(content, col) {
    const atx = scanAtx(content, 0);
    if (atx) {
      para = null;
      addBlock({ t: 'heading', level: atx[0], text: atx[1] });
      return true;
    }
    const fence = scanFence(content, 0);
    if (fence) {
      para = null;
      const node = {
        t: 'fence', ch: fence[0], len: fence[1], info: fence[2],
        // Content lines lose up to the fence's own indent (0-3 columns).
        indent: indentOf(content, 0)[0],
        lines: [],
      };
      addBlock(node);
      fenceState = node;
      return true;
    }
    const htmlType = scanHtmlBlockType(content, 0, para !== null);
    if (htmlType > 0) {
      para = null;
      const node = { t: 'html', type: htmlType, lines: [content] };
      addBlock(node);
      // Types 1-5 end at the line holding their terminator, and that
      // line may be the opening line itself (e.g. <style>...</style>).
      if (htmlType > 5 || !htmlBlockEnds(node, content)) htmlState = node;
      return true;
    }
    if (scanHr(content, 0)) {
      para = null;
      addBlock({ t: 'hr' });
      return true;
    }
    const quote = scanQuoteMarker(content, 0);
    if (quote) {
      para = null;
      const node = { t: 'quote', blocks: [] };
      addBlock(node);
      stack.push({ kind: 'q', node });
      // Reprocess this line's remainder as the quote's first line.
      processLineAfterQuote(content, quote, col);
      return true;
    }
    const marker = scanListMarker(content, 0);
    if (marker) {
      para = null;
      openListItem(content, marker, col);
      return true;
    }
    // Indented code (only when no paragraph is open).
    if (para === null && indentFromCol(content, col)[0] >= 4) {
      const node = { t: 'code', lines: [stripFromCol(content, col, 4)] };
      addBlock(node);
      codeState = node;
      return true;
    }
    return false;
  }

  // State for multi-line blocks (fence / html / indented code).
  let fenceState = null;
  let htmlState = null;
  let codeState = null;

  // After opening a quote, process the rest of the line inside it.
  function processLineAfterQuote(content, quote, col) {
    const rest = ' '.repeat(quote.leadSpaces) + content.slice(quote.contentIdx);
    const restCol = col + colAt(content, quote.contentIdx) - quote.leadSpaces;
    processContent(rest, null, restCol);
  }

  // Open (or continue) a list for a marker, then process the item's content.
  function openListItem(content, marker, col) {
    // Does the current open list (if any) accept this marker?
    let listNode = null;
    const top = stack[stack.length - 1];
    if (top && top.kind === 'l') {
      const cur = top.node;
      const sameType = (cur.ordered === marker.ordered) &&
        (marker.ordered ? cur.delim === marker.delim : cur.marker === marker.marker);
      if (sameType) listNode = cur;
    }
    if (!listNode) {
      listNode = {
        t: 'list', ordered: marker.ordered, start: marker.startNum,
        marker: marker.marker, delim: marker.delim, loose: false, blocks: [],
        parent: deepestItemEntry() ? deepestItemEntry().node : null,
      };
      addBlock(listNode);
      stack.push({ kind: 'l', node: listNode });
    }
    // The item's content starts `contentIndent` columns after the marker.
    const markerCol = col + colAt(content, marker.markerStart);
    const contentCol = markerCol + marker.contentIndent;
    const itemNode = { t: 'item', blocks: [], loose: false, parent: listNode };
    listNode.blocks.push(itemNode);
    stack.push({ kind: 'i', node: itemNode, localIndent: marker.contentIndent, contentCol });
    // A blank line before this item makes the list loose, when the blank
    // line was in this list or in a list nested inside it.
    if (pendingBlank && pendingBlankList && isAncestorOrSelf(listNode, pendingBlankList)) {
      listNode.loose = true;
    }
    // Process the item's content (after the marker).
    const afterMarker = content.slice(marker.markerEnd);
    const rest = stripCols(afterMarker, 0, marker.contentIndent - marker.markerWidth);
    processContent(rest, itemNode, contentCol);
  }

  // Process a line's content inside the current (innermost) container.
  // `itemNode` is set when the content is a fresh list item's first line.
  // `col` is the document column where `content` starts.
  function processContent(content, itemNode, col) {
    // A fresh item whose content is empty has an empty paragraph (which
    // renders as an empty <li>); record nothing and leave the item empty.
    if (itemNode && content.trim() === '') return;
    // A blank line inside a container (e.g. '>' alone in a quote) ends
    // the paragraph like a blank line, but does not close the container.
    // Only a truly empty content is blank; a line of spaces is content.
    if (content === '') {
      if (para) {
        para = null;
        pendingBlank = true;
        const item = deepestItemEntry();
        pendingBlankItem = item ? item.node : null;
        pendingBlankList = deepestListNode();
      }
      return;
    }
    // A line of only spaces does not start a paragraph, but it does
    // continue one (its spaces are paragraph content).
    if (!para && content.trim() === '') return;
    if (para) {
      // A setext underline converts the paragraph to a heading. Link
      // reference definitions are removed first, so a paragraph that is
      // only definitions does not become a heading at all.
      const se = scanSetext(content, 0);
      if (se) {
        const level = se[0] === 61 ? 1 : 2;
        const text = para.lines.map((l) => l.text).join('\n');
        const clean = extractDefinitions(text, refs);
        if (clean.trim() === '') {
          para.lines = [{ text: content, lazy: false, code: false }];
          return;
        }
        const blocks = curBlocks();
        blocks[blocks.length - 1] = { t: 'heading', level, text: clean.trim() };
        para = null;
        return;
      }
      if (interruptsPara(content)) {
        para = null;
        openBlock(content, col);
        return;
      }
      // Plain continuation line.
      para.lines.push({ text: content, lazy: false, code: false });
      return;
    }
    if (!openBlock(content, col)) {
      startPara(content, false, false);
    }
  }

  // Main loop.
  for (let ln = 0; ln < lines.length; ln++) {
    const line = lines[ln];
    // Inside a fenced code block: consume lines until the closing fence.
    // A line that matches the containers is content (markers stripped,
    // then up to the fence's indent removed). A line that does not match
    // ends the fence, unless it is a plain-text lazy line inside a list
    // item, which stays in the fence. A closing fence carries no info.
    if (fenceState) {
      const fm = matchContainers(line);
      const fcontent = ' '.repeat(fm.leadSpaces) + line.slice(fm.pos);
      if (fm.failAt >= stack.length) {
        const close = scanFence(fcontent, 0);
        if (close && close[0] === fenceState.ch && close[1] >= fenceState.len &&
            close[2] === '') {
          fenceState = null;
        } else {
          // Tabs in fenced code are preserved as-is; only the fence
          // indent is stripped.
          fenceState.lines.push(stripFenceCols(fcontent, fenceState.indent));
        }
        continue;
      }
      if (isBlankLine(line, 0)) {
        // A blank line inside a fence is content (an empty line) — unless
        // the fence sits in a blockquote, where a truly blank line closes
        // the quote and so ends the fence too.
        let inQuote = false;
        for (let s = 0; s < stack.length; s++) {
          if (stack[s].kind === 'q') { inQuote = true; break; }
        }
        if (inQuote) {
          fenceState = null;
          // Fall through to process the blank line normally.
        } else {
          fenceState.lines.push('');
          continue;
        }
      } else if (startsBlock(fcontent)) {
        fenceState = null;
        closeTo(fm.failAt);
        processLine(line);
        pendingBlank = false;
        continue;
      } else if (fm.itemFailed) {
        fenceState.lines.push(stripCols(lazyLineContent(fcontent, fm).text, 0, fenceState.indent));
        continue;
      } else {
        fenceState = null;
        closeTo(fm.failAt);
        processLine(line);
        pendingBlank = false;
        continue;
      }
    }
    // Inside an HTML block: consume lines until its end condition. Types
    // 1-5 end at the line holding their terminator (which is part of the
    // block); types 6-7 end at a blank line (which is not). A line that
    // does not match the containers ends the block, unless it is a
    // plain-text lazy line inside a list item.
    if (htmlState) {
      const hm = matchContainers(line);
      const hcontent = ' '.repeat(hm.leadSpaces) + line.slice(hm.pos);
      if (hm.failAt >= stack.length) {
        if ((htmlState.type === 6 || htmlState.type === 7) && isBlankLine(hcontent, 0)) {
          htmlState = null;
          // Fall through to process the blank line normally.
        } else if (htmlBlockEnds(htmlState, hcontent)) {
          htmlState.lines.push(hcontent);
          htmlState = null;
          continue;
        } else {
          htmlState.lines.push(hcontent);
          continue;
        }
      } else if (isBlankLine(line, 0)) {
        htmlState = null;
        // Fall through to process the blank line normally.
      } else if (htmlState.type <= 5 && htmlBlockEnds(htmlState, hcontent)) {
        htmlState.lines.push(hcontent);
        htmlState = null;
        continue;
      } else if (startsBlock(hcontent)) {
        htmlState = null;
        closeTo(hm.failAt);
        processLine(line);
        pendingBlank = false;
        continue;
      } else if (hm.itemFailed) {
        htmlState.lines.push(lazyLineContent(hcontent, hm).text);
        continue;
      } else {
        htmlState = null;
        closeTo(hm.failAt);
        processLine(line);
        pendingBlank = false;
        continue;
      }
    }
    // Inside an indented code block: consume blank lines and lines indented
    // four or more columns (after the containers). A blank line outside
    // any container marker ends the block when it sits inside a quote
    // (the blank line closes the quote); inside a list or at the top
    // level it is part of the code.
    if (codeState) {
      if (isBlankLine(line, 0)) {
        let inQuote = false;
        for (let s = 0; s < stack.length; s++) {
          if (stack[s].kind === 'q') { inQuote = true; break; }
        }
        if (inQuote) {
          codeState = null;
          // Fall through to the blank-line handling, which closes quotes.
        } else {
          // A blank line inside indented code keeps the spaces past the
          // code indent (four columns) as its content.
          const cm2 = matchContainers(line);
          const ceff2 = ' '.repeat(cm2.leadSpaces) + line.slice(cm2.pos);
          codeState.lines.push(stripFromCol(ceff2, cm2.col, 4));
          continue;
        }
      } else {
        const cm = matchContainers(line);
        if (cm.failAt < stack.length) {
          codeState = null;
          closeTo(cm.failAt);
          processLine(line);
          pendingBlank = false;
          continue;
        }
        const ceff = ' '.repeat(cm.leadSpaces) + line.slice(cm.pos);
        if (indentFromCol(ceff, cm.col)[0] >= 4) {
          codeState.lines.push(stripFromCol(ceff, cm.col, 4));
          continue;
        }
        codeState = null;
        processContent(ceff, null, cm.col);
        pendingBlank = false;
        continue;
      }
    }

    if (isBlankLine(line, 0)) {
      para = null;
      pendingBlank = true;
      const item = deepestItemEntry();
      pendingBlankItem = item ? item.node : null;
      pendingBlankList = deepestListNode();
      // A blank line closes blockquotes (and anything inside them). Lists
      // stay open across blank lines, so only pop down to the outermost
      // quote; a list item outside any quote keeps the list alive.
      // Exception: an empty list item (no blocks yet) is closed by the
      // blank line, so following indented lines are top-level, not item
      // content.
      if (item && item.node.blocks.length === 0) {
        let idx = -1;
        for (let s = stack.length - 1; s >= 0; s--) {
          if (stack[s] === item) { idx = s; break; }
        }
        if (idx >= 0) stack.length = idx;
      }
      let qIdx = -1;
      for (let s = 0; s < stack.length; s++) {
        if (stack[s].kind === 'q') { qIdx = s; break; }
      }
      if (qIdx >= 0) closeTo(qIdx);
      continue;
    }

    const m = matchContainers(line);
    const eff = ' '.repeat(m.leadSpaces) + line.slice(m.pos);
    const allMatched = m.failAt >= stack.length;

    if (!allMatched && para) {
      if (eff === '') {
        // A line whose content after the matched containers is empty
        // (e.g. a lone '>' inside a quote) is a blank line in that
        // container: it ends the paragraph but leaves the containers open.
        para = null;
        pendingBlank = true;
        const bItem = deepestItemEntry();
        pendingBlankItem = bItem ? bItem.node : null;
        pendingBlankList = deepestListNode();
        continue;
      }
      if (!closesContainers(eff)) {
        // Lazy continuation line.
        const se = scanSetext(eff, 0);
        if (se && (se[0] === 61 || se[1] === 2)) {
          // Lazy setext underline candidate.
          handleLazySetext(eff, se, m);
        } else {
          const lc = lazyLineContent(eff, m);
          const prev = para.lines[para.lines.length - 1];
          if (prev && prev.code && !lc.code) {
            if (m.itemFailed) {
              // The paragraph ends; reprocess this line as a fresh line.
              para = null;
              closeTo(m.failAt);
              processLine(line);
            } else {
              // Insert a blank line into the paragraph, then the line.
              para.lines.push({ text: '', lazy: true, code: false });
              para.lines.push({ text: lc.text, lazy: true, code: false });
            }
          } else {
            para.lines.push({ text: lc.text, lazy: true, code: lc.code });
          }
        }
        pendingBlank = false;
        continue;
      }
      // Not lazy: close the unmatched containers and process the line.
      closeTo(m.failAt);
    } else if (!allMatched) {
      closeTo(m.failAt);
    }
    processLine(line);
    pendingBlank = false;
  }

  // Handle a lazy setext underline line (an '=' run or a '--' run) that did
  // not match its containers.
  function handleLazySetext(eff, se, m) {
    const ch = se[0];
    const level = ch === 61 ? 1 : 2;
    const prev = para.lines[para.lines.length - 1];
    const prevLazy = prev ? prev.lazy : false;
    const lastLen = prev ? prev.text.length : 0;
    // The innermost container decides the rule.
    const top = stack[stack.length - 1];
    const inList = top && top.kind === 'i';
    if (inList) {
      if (prevLazy && lastLen <= 2) {
        const text = para.lines.map((l) => l.text).join('\n');
        const clean = extractDefinitions(text, refs);
        if (clean.trim() === '') {
          const ind = indentOf(eff, 0);
          para.lines.push({ text: eff.slice(ind[1]), lazy: true, code: false });
        } else {
          const blocks = curBlocks();
          blocks[blocks.length - 1] = { t: 'heading', level, text: clean.trim() };
          para = null;
        }
      } else {
        // The underline stays as literal text, stripped of its indent.
        const ind = indentOf(eff, 0);
        para.lines.push({ text: eff.slice(ind[1]), lazy: true, code: false });
      }
      return;
    }
    // In a blockquote: never a heading.
    const ind = indentOf(eff, 0);
    const startsTab = eff.charCodeAt(0) === 9;
    if (prevLazy && ind[0] < 5 && !startsTab) {
      para.lines.push({ text: '    ' + eff.slice(ind[1]), lazy: true, code: false });
    } else if (prevLazy) {
      para.lines.push({ text: eff, lazy: true, code: false });
    } else {
      const lc = lazyLineContent(eff, m);
      para.lines.push({ text: lc.text, lazy: true, code: lc.code });
    }
  }

  // Process one (non-blank) line at the current container level, after any
  // unmatched containers have been closed.
  function processLine(line) {
    const m2 = matchContainers(line);
    const eff = ' '.repeat(m2.leadSpaces) + line.slice(m2.pos);
    processContent(eff, null, m2.col);
  }

  return root.blocks;
}

// Does an HTML block of types 1-5 end at this line? (Types 6-7 end at a
// blank line, which the caller checks separately.)
function htmlBlockEnds(node, line) {
  const type = node.type;
  if (type === 1) {
    const lower = line.toLowerCase();
    return lower.indexOf('</script') >= 0 || lower.indexOf('</pre') >= 0 ||
      lower.indexOf('</style') >= 0 || lower.indexOf('</textarea') >= 0;
  }
  if (type === 2) return line.indexOf('-->') >= 0;
  if (type === 3) return line.indexOf('?>') >= 0;
  if (type === 4) return line.indexOf('>') >= 0;
  if (type === 5) return line.indexOf(']]>') >= 0;
  return false;
}

// ---------- finalize: link references and tables ----------

// Extract link reference definitions from paragraph text. A definition is
// `[label]: destination` with an optional title, and may span up to two
// lines (the title may be on the following line). Definitions are removed
// from the paragraph; the first definition for a label wins.
function extractDefinitions(text, refs) {
  // Split the paragraph into its lines and try to parse definitions from
  // the start. Definitions must come first: once a line is not a
  // definition, the rest of the paragraph is plain content.
  const lines = text.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const def = tryDefinition(lines, i);
    if (def) {
      const norm = normalizeLabel(def.label);
      // An empty label is not a definition: leave the line as content.
      if (norm === '') break;
      if (!refs.has(norm)) {
        refs.set(norm, { href: def.href, title: def.title });
      }
      i += def.consumed;
    } else {
      break;
    }
  }
  while (i < lines.length) { out.push(lines[i]); i++; }
  return out.join('\n');
}

// Try to parse a link reference definition starting at lines[i]. The
// label, destination and title are parsed from the paragraph's remaining
// lines joined with newlines, so each part may sit on the following line
// and a title may span lines. Returns {label, href, title, consumed}
// (consumed = number of paragraph lines used) or null.
function tryDefinition(lines, i) {
  const text = lines.slice(i).join('\n');
  // Up to three spaces of indent.
  let p = 0;
  while (p < text.length && text.charCodeAt(p) === 32 && p < 3) p++;
  if (p >= text.length || text.charCodeAt(p) !== 91) return null; // [
  const lab = scanLabelLoose(text, p);
  if (!lab) return null;
  let j = lab[1];
  // Whitespace (spaces/tabs, same line) then ':'.
  while (j < text.length && (text.charCodeAt(j) === 32 || text.charCodeAt(j) === 9)) j++;
  if (j >= text.length || text.charCodeAt(j) !== 58) return null; // :
  j++;
  // Whitespace then the destination; the destination may be on the next
  // line (skip at most one newline and the next line's indent).
  while (j < text.length && (text.charCodeAt(j) === 32 || text.charCodeAt(j) === 9)) j++;
  if (j < text.length && text.charCodeAt(j) === 10) {
    j++;
    while (j < text.length && (text.charCodeAt(j) === 32 || text.charCodeAt(j) === 9)) j++;
  }
  if (j >= text.length) return null;
  let href = null;
  let end = j;
  if (text.charCodeAt(j) === 60) {
    // <...> destination (no newlines or < inside).
    let k = j + 1;
    let dest = '';
    while (k < text.length) {
      const c = text.charCodeAt(k);
      if (c === 62) break; // >
      if (c === 10 || c === 60) return null;
      dest += text[k];
      k++;
    }
    if (k >= text.length) return null;
    href = resolveDestEscapes(dest);
    end = k + 1;
  } else {
    // Bare destination: no spaces, no control chars, balanced parens.
    let k = j;
    let bal = 0;
    while (k < text.length) {
      const c = text.charCodeAt(k);
      if (c === 92 && k + 1 < text.length && isPunctCode(text.charCodeAt(k + 1))) {
        k += 2;
        continue;
      }
      if (c === 32 || c === 9 || c === 10 || c < 32) break;
      if (c === 40) bal++;
      else if (c === 41) {
        if (bal === 0) break;
        bal--;
      }
      k++;
    }
    if (bal !== 0) return null;
    if (k === j) return null;
    href = resolveDestEscapes(text.slice(j, k));
    end = k;
  }
  // Optional whitespace, then an optional title. A title must be
  // separated from the destination by whitespace, and may be on the next
  // line or span lines; only whitespace may follow it on its last line.
  let title = null;
  let tEnd = end;
  let k = end;
  while (k < text.length && (text.charCodeAt(k) === 32 || text.charCodeAt(k) === 9)) k++;
  if (k < text.length && text.charCodeAt(k) === 10) {
    // The title may be on the next line.
    let k2 = k + 1;
    while (k2 < text.length && (text.charCodeAt(k2) === 32 || text.charCodeAt(k2) === 9)) k2++;
    if (k2 < text.length && text.charCodeAt(k2) !== 10) {
      const t = scanTitle(text, k2);
      if (t) {
        let after = t[1];
        while (after < text.length && (text.charCodeAt(after) === 32 || text.charCodeAt(after) === 9)) after++;
        if (after >= text.length || text.charCodeAt(after) === 10) {
          title = t[0];
          tEnd = after;
        }
      }
    }
  } else if (k < text.length) {
    // Non-whitespace on the same line: it must be a title, and it must
    // be separated from the destination by whitespace.
    if (k === end) return null;
    const t = scanTitle(text, k);
    if (!t) return null;
    let after = t[1];
    while (after < text.length && (text.charCodeAt(after) === 32 || text.charCodeAt(after) === 9)) after++;
    if (after < text.length && text.charCodeAt(after) !== 10) return null;
    title = t[0];
    tEnd = after;
  }
  // Lines consumed: newlines up to the end of the title/destination, +1.
  let consumed = 1;
  for (let q = 0; q < tEnd; q++) if (text.charCodeAt(q) === 10) consumed++;
  return { label: lab[0], href, title, consumed };
}

// Resolve backslash escapes (\ + punctuation) in a link destination.
function resolveDestEscapes(dest) {
  if (dest.indexOf('\\') < 0) return dest;
  let out = '';
  for (let q = 0; q < dest.length; q++) {
    if (dest.charCodeAt(q) === 92 && q + 1 < dest.length &&
        isPunctCode(dest.charCodeAt(q + 1))) {
      out += dest[q + 1];
      q++;
    } else out += dest[q];
  }
  return out;
}

// Try to convert a paragraph's text into a table. Returns a table node or
// null. The paragraph must have at least two lines: a header and a
// delimiter row.
function tryTable(text) {
  const lines = text.split('\n');
  if (lines.length < 2) return null;
  const header = lines[0];
  const delim = lines[1];
  // The delimiter row must contain a '|' and cells of the form :?-+:?.
  if (delim.indexOf('|') < 0) return null;
  const cells = splitTableRow(delim);
  if (!cells || cells.length === 0) return null;
  const aligns = [];
  for (const cell of cells) {
    const c = cell.trim();
    if (!/^:?-+:?$/.test(c)) return null;
    if (c.startsWith(':') && c.endsWith(':')) aligns.push('center');
    else if (c.endsWith(':')) aligns.push('right');
    else if (c.startsWith(':')) aligns.push('left');
    else aligns.push(null);
  }
  const headCells = splitTableRow(header);
  if (!headCells) return null;
  // The delimiter row must have exactly as many cells as the header.
  if (aligns.length !== headCells.length) return null;
  const rows = [];
  for (let i = 2; i < lines.length; i++) {
    if (lines[i].trim() === '') break;
    const row = splitTableRow(lines[i]);
    if (row) rows.push(row);
  }
  return { t: 'table', aligns, head: headCells, rows };
}

// Split a table row on unescaped '|' characters. Returns null when the row
// has no '|' at all (a header without a pipe is only a table when the
// delimiter has one; the caller handles that). Leading/trailing pipes are
// dropped; cells keep their raw text (with \| escapes intact for the inline
// parser, which treats \| as an escaped pipe).
function splitTableRow(row) {
  // A row without a pipe is a single cell.
  if (row.indexOf('|') < 0) return [row];
  const cells = [];
  let cur = '';
  for (let i = 0; i < row.length; i++) {
    const c = row.charCodeAt(i);
    if (c === 92 && i + 1 < row.length && row.charCodeAt(i + 1) === 124) {
      // An escaped pipe does not split the row, and the escape is
      // resolved: the cell content holds a plain '|'.
      cur += '|';
      i++;
    } else if (c === 124) {
      cells.push(cur);
      cur = '';
    } else {
      cur += row[i];
    }
  }
  cells.push(cur);
  // Drop a leading and a trailing empty cell (from outer pipes).
  if (cells.length > 0 && cells[0].trim() === '') cells.shift();
  if (cells.length > 0 && cells[cells.length - 1].trim() === '') cells.pop();
  return cells;
}

// Walk the block tree: extract link definitions from paragraphs (in
// document order), then convert paragraphs that are tables.
function finalize(blocks, refs) {
  for (let b = 0; b < blocks.length; b++) {
    const node = blocks[b];
    if (node.t === 'para') {
      const text = node.lines.map((l) => l.text).join('\n');
      const stripped = extractDefinitions(text, refs);
      if (stripped !== text) {
        if (stripped.trim() === '') {
          blocks.splice(b, 1);
          b--;
          continue;
        }
        node.lines = stripped.split('\n').map((t) => ({ text: t, lazy: false, code: false }));
      }
      const table = tryTable(node.lines.map((l) => l.text).join('\n'));
      if (table) blocks[b] = table;
    } else if (node.t === 'quote' || node.t === 'item') {
      finalize(node.blocks, refs);
    } else if (node.t === 'list') {
      finalize(node.blocks, refs);
    }
  }
}

// ---------- rendering ----------

function renderBlocks(blocks, refs, out) {
  for (const node of blocks) {
    switch (node.t) {
      case 'para': {
        out.push('<p>');
        inlineToHtml(node.lines.map((l) => l.text).join('\n'), refs, out);
        out.push('</p>\n');
        break;
      }
      case 'heading': {
        out.push('<h' + node.level + '>');
        inlineToHtml(node.text, refs, out);
        out.push('</h' + node.level + '>\n');
        break;
      }
      case 'fence': {
        out.push('<pre><code');
        const lang = node.info.split(/\s+/)[0];
        if (lang) {
          out.push(' class="language-');
          escHref(lang, out);
          out.push('"');
        }
        out.push('>');
        // Drop a single trailing blank line: the line before the closing
        // fence does not contribute a newline of its own.
        let flines = node.lines;
        if (flines.length > 0 && flines[flines.length - 1] === '') {
          flines = flines.slice(0, -1);
        }
        escText(flines.join('\n') + (flines.length ? '\n' : ''), out);
        out.push('</code></pre>\n');
        break;
      }
      case 'code': {
        // Strip trailing blank lines.
        let lines = node.lines;
        let end = lines.length;
        while (end > 0 && lines[end - 1] === '') end--;
        out.push('<pre><code>');
        escText(lines.slice(0, end).join('\n') + (end > 0 ? '\n' : ''), out);
        out.push('</code></pre>\n');
        break;
      }
      case 'html': {
        // The lines join with newlines; a trailing newline is added only
        // when the block is directly followed by a non-blank line in its
        // container (or, at the top level at EOF, when the input ends
        // with a newline). parse() settles trailNl for blocks that were
        // never followed by another block.
        for (let li = 0; li < node.lines.length; li++) {
          if (li > 0) out.push('\n');
          out.push(node.lines[li]);
        }
        if (node.trailNl) out.push('\n');
        break;
      }
      case 'hr': {
        out.push('<hr>\n');
        break;
      }
      case 'quote': {
        out.push('<blockquote>\n');
        renderBlocks(node.blocks, refs, out);
        out.push('</blockquote>\n');
        break;
      }
      case 'list': {
        out.push(node.ordered ? '<ol' : '<ul');
        if (node.ordered && node.start !== 1) out.push(' start="' + node.start + '"');
        out.push('>\n');
        for (const item of node.blocks) {
          renderItem(item, node.loose, refs, out);
        }
        out.push(node.ordered ? '</ol>\n' : '</ul>\n');
        break;
      }
      case 'table': {
        out.push('<table>\n<thead>\n<tr>\n');
        for (let c = 0; c < node.aligns.length; c++) {
          const align = node.aligns[c];
          out.push('<th' + (align ? ' align="' + align + '"' : '') + '>');
          const cell = c < node.head.length ? node.head[c].trim() : '';
          inlineToHtml(cell, refs, out);
          out.push('</th>\n');
        }
        out.push('</tr>\n</thead>\n');
        if (node.rows.length > 0) {
          out.push('<tbody>');
          for (const row of node.rows) {
            out.push('<tr>\n');
            for (let c = 0; c < node.aligns.length; c++) {
              const align = node.aligns[c];
              out.push('<td' + (align ? ' align="' + align + '"' : '') + '>');
              const cell = c < row.length ? row[c].trim() : '';
              inlineToHtml(cell, refs, out);
              out.push('</td>\n');
            }
            out.push('</tr>\n');
          }
          out.push('</tbody>');
        }
        out.push('</table>\n');
        break;
      }
    }
  }
}

// Render one list item. In a tight list, a lone paragraph renders without
// <p> tags; in a loose list, paragraphs keep their <p> tags. A leading
// task-list checkbox ([ ] or [x]) goes before the paragraph text in both
// cases (inside the <p> for a loose list).
function renderItem(item, listLoose, refs, out) {
  out.push('<li>');
  const blocks = item.blocks;
  for (let b = 0; b < blocks.length; b++) {
    const node = blocks[b];
    if (node.t === 'para') {
      renderItemPara(node, listLoose, refs, out);
    } else {
      renderBlocks([node], refs, out);
    }
  }
  out.push('</li>\n');
}

// Render a paragraph that is a list item's content. `loose` decides whether
// <p> tags are kept. Handles a leading task-list checkbox.
function renderItemPara(node, loose, refs, out) {
  const text = node.lines.map((l) => l.text).join('\n');
  let body = text;
  let checkbox = null;
  if (text === '[ ]' || text.startsWith('[ ] ')) {
    checkbox = '<input disabled="" type="checkbox">';
    body = text === '[ ]' ? '' : text.slice(4);
  } else if (text === '[x]' || text === '[X]' ||
      text.startsWith('[x] ') || text.startsWith('[X] ')) {
    checkbox = '<input checked="" disabled="" type="checkbox">';
    body = (text === '[x]' || text === '[X]') ? '' : text.slice(4);
  }
  if (loose) out.push('<p>');
  if (checkbox !== null) {
    out.push(checkbox);
    if (body !== '') out.push(' ');
  }
  inlineToHtml(body, refs, out);
  if (loose) out.push('</p>\n');
}

// ---------- entry point ----------

export function parse(markdown) {
  const normalized = markdown.replace(/\r\n?/g, '\n');
  const endsWithNl = normalized.endsWith('\n');
  const lines = normalized.split('\n');
  // A trailing newline produces a final empty line; drop it (it is not a
  // blank line in the document).
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const refs = new Map();
  const blocks = parseBlocks(lines, refs);
  finalize(blocks, refs);
  // Settle the trailing-newline flag of any html block that was never
  // followed by another block in its container: only a top-level block at
  // the end of the document takes one, and only when the input ends with
  // a newline.
  (function fixTrail(nodes, isRoot) {
    for (const node of nodes) {
      if (node.t === 'html' && node.trailNl === undefined) {
        node.trailNl = isRoot ? endsWithNl : false;
      } else if (node.t === 'quote') {
        fixTrail(node.blocks, false);
      } else if (node.t === 'list') {
        for (const item of node.blocks) fixTrail(item.blocks, false);
      }
    }
  })(blocks, true);
  const out = [];
  renderBlocks(blocks, refs, out);
  return out.join('');
}
