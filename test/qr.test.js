// Entwicklungstest für ../qr.js (wird von der App nicht geladen).
//   cd test && npm install && npm test
// Optional: CASES=1000 SEED=42 npm test
//
// 1. Vergleich mit qrcode-generator (Numeric, M, gleiche Version und Maske): jedes Modul muss gleich sein.
// 2. Die von qr.js automatisch gewählte Maske: Code mit jsQR wieder auslesen, Inhalt muss der Eingabe entsprechen.
// 3. Fehlerfälle: ungültige Eingaben müssen einen Fehler werfen.
'use strict';
const QR = require('../qr.js');
const qrcode = require('qrcode-generator');
const jsQR = require('jsqr');

const CASES = Number(process.env.CASES) || 300;
const SEED = Number(process.env.SEED) || 20261124;

// Reproduzierbarer Zufall (mulberry32)
let seed = SEED >>> 0;
const rand = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const randInt = (a, b) => a + Math.floor(rand() * (b - a + 1));
const digits = n => Array.from({ length: n }, () => randInt(0, 9)).join('');

// Kapazität (Ziffern) Numeric/M je Version 1–15 laut ISO/IEC 18004, Tabelle 7
const CAP_M = [34, 63, 101, 149, 202, 255, 293, 365, 432, 513, 604, 691, 796, 871, 991];

// Maske aus der Formatinformation (Kopie oben links) einer fertigen Matrix lesen
function readFormat(isDark, size) {
  const pos = [];
  for (let i = 0; i <= 5; i++) pos.push([i, 8]);
  pos.push([7, 8], [8, 8], [8, 7]);
  for (let i = 9; i < 15; i++) pos.push([8, 14 - i]);
  let bits = 0;
  pos.forEach(([r, c], i) => { if (isDark(r, c)) bits |= 1 << i; });
  const data = (bits ^ 0x5412) >>> 10;
  return { ecl: data >>> 3, mask: data & 7 };
}

// Matrix als RGBA-Bild rendern (4 px je Modul, 4 Module Ruhezone) und mit jsQR lesen
function decode(qr) {
  const scale = 4, quiet = 4, w = (qr.size + 2 * quiet) * scale;
  const img = new Uint8ClampedArray(w * w * 4).fill(255);
  for (let r = 0; r < qr.size; r++) for (let c = 0; c < qr.size; c++) {
    if (!qr.isDark(r, c)) continue;
    for (let y = 0; y < scale; y++) for (let x = 0; x < scale; x++) {
      const p = (((r + quiet) * scale + y) * w + (c + quiet) * scale + x) * 4;
      img[p] = img[p + 1] = img[p + 2] = 0;
    }
  }
  const res = jsQR(img, w, w, { inversionAttempts: 'dontInvert' });
  return res ? res.data : null;
}

// Testfälle: Zufall (Länge 5–605), Versionsgrenzen, typische DPH-Codes
const inputs = [];
for (let i = 0; i < CASES; i++) inputs.push(digits(randInt(5, 605)));
for (const cap of CAP_M) { inputs.push(digits(cap)); if (cap < 991) inputs.push(digits(cap + 1)); }
inputs.push('10130', '10130999', '1' + '0130' + '005'.repeat(200), '1' + '9999' + '998'.repeat(200), '0'.repeat(605), '9'.repeat(605));

let fails = 0, matrixOk = 0, decodeOk = 0, sameAutoMask = 0;
const versions = {};
const fail = (msg) => { fails++; if (fails <= 20) console.log('FEHLER:', msg); };

for (const s of inputs) {
  const lib = qrcode(0, 'M'); lib.addData(s, 'Numeric'); lib.make();
  const libSize = lib.getModuleCount();
  const fmt = readFormat((r, c) => lib.isDark(r, c), libSize);

  // 1. gleiche Version und Maske wie die Bibliothek erzwingen → Matrix muss identisch sein
  const ours = QR.encodeNumeric(s, { mask: fmt.mask });
  const expectVersion = CAP_M.findIndex(c => s.length <= c) + 1;
  if (ours.size !== libSize) { fail(`Länge ${s.length}: Größe ${ours.size} statt ${libSize}`); continue; }
  if (ours.version !== expectVersion) fail(`Länge ${s.length}: Version ${ours.version} statt ${expectVersion}`);
  if (fmt.ecl !== 0) fail(`Länge ${s.length}: Bibliothek nutzt nicht Level M`);
  let diff = 0;
  for (let r = 0; r < libSize; r++) for (let c = 0; c < libSize; c++) if (ours.isDark(r, c) !== lib.isDark(r, c)) diff++;
  if (diff) fail(`Länge ${s.length}, V${ours.version}, Maske ${fmt.mask}: ${diff} Module abweichend`);
  else matrixOk++;

  // 2. automatische Maskenwahl (so wie in der App) → mit jsQR zurücklesen
  const auto = QR.encodeNumeric(s);
  versions[auto.version] = (versions[auto.version] || 0) + 1;
  if (auto.mask === fmt.mask) sameAutoMask++;
  if (readFormat(auto.isDark, auto.size).mask !== auto.mask) fail(`Länge ${s.length}: Formatinformation passt nicht zur Maske`);
  const got = decode(auto);
  if (got === s) decodeOk++;
  else fail(`Länge ${s.length}, V${auto.version}, Maske ${auto.mask}: jsQR liest ${got === null ? 'nichts' : `"${got.slice(0, 20)}…"`}`);
}

// 3. Fehlerfälle
const mustThrow = { 'Buchstaben': 'abc', 'Ziffern mit Buchstabe': '12a4', 'Leerzeichen': '12 34', 'leer': '', 'keine Zeichenkette': 12345, '992 Ziffern': '1'.repeat(992), 'Maske 8': ['123', { mask: 8 }] };
let throwOk = 0;
for (const [name, arg] of Object.entries(mustThrow)) {
  try { Array.isArray(arg) ? QR.encodeNumeric(...arg) : QR.encodeNumeric(arg); fail(`kein Fehler bei: ${name}`); }
  catch (e) { throwOk++; }
}

const n = inputs.length;
console.log(`Seed ${SEED}, ${n} Eingaben (Länge 5–991), Versionen: ${Object.keys(versions).sort((a, b) => a - b).map(v => `V${v}×${versions[v]}`).join(' ')}`);
console.log(`Matrix identisch mit qrcode-generator (gleiche Version/Maske): ${matrixOk}/${n}`);
console.log(`Mit jsQR korrekt zurückgelesen (automatische Maske):        ${decodeOk}/${n}`);
console.log(`Fehlerfälle werfen Fehler:                                   ${throwOk}/${Object.keys(mustThrow).length}`);
console.log(`Info: automatische Maske = Maske der Bibliothek in ${sameAutoMask}/${n} Fällen` +
  ' (qrcode-generator bewertet vereinfacht, ohne Formatinfo; Abweichungen sind erlaubt)');
console.log(fails ? `\n${fails} FEHLER` : '\nAlle Tests grün.');
process.exit(fails ? 1 : 0);
