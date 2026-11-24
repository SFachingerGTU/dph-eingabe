// QR-Code-Generator nach ISO/IEC 18004, ohne Abhängigkeiten.
// Bewusst eingeschränkt auf das, was die DPH-App braucht:
// nur Numeric-Modus, Fehlerkorrektur M, Versionen 1–15 (max. 991 Ziffern).
//
//   const qr = QR.encodeNumeric('1013000500'); // → { size, version, mask, isDark(row, col) }
//
// Optional (für Tests): QR.encodeNumeric(digits, { mask: 0..7 }) erzwingt eine Maske.
var QR = (function () {
  'use strict';

  // Blockstruktur für Level M je Version:
  // [EC-Codewörter je Block, Blöcke Gruppe 1, Datencodewörter je Block Gruppe 1, Blöcke Gruppe 2, Datencodewörter Gruppe 2]
  var BLOCKS_M = [null,
    [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0],
    [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44],
    [30, 1, 50, 4, 51], [22, 6, 36, 2, 37], [22, 8, 37, 1, 38], [24, 4, 40, 5, 41], [24, 5, 41, 5, 42]
  ];
  // Mittelpunkte der Alignment-Pattern je Version (Zeilen- und Spaltenkoordinaten)
  var ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46],
    [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70]];
  var MAX_VERSION = 15;

  // --- Galois-Feld GF(256) mit Primpolynom x^8 + x^4 + x^3 + x^2 + 1 (0x11D) ---
  var EXP = new Array(512), LOG = new Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();
  function gfMul(a, b) { return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]; }

  // Generatorpolynom (x - α^0)(x - α^1)…(x - α^(n-1)), Koeffizienten ohne führende 1
  function rsGenerator(n) {
    var g = [1];
    for (var i = 0; i < n; i++) {
      var next = new Array(g.length + 1).fill(0);
      for (var j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= gfMul(g[j], EXP[i]); }
      g = next;
    }
    return g.slice(1);
  }

  // Reed-Solomon: Rest von Daten · x^n geteilt durch das Generatorpolynom = Fehlerkorrektur-Codewörter
  function rsRemainder(data, gen) {
    var rem = new Array(gen.length).fill(0);
    for (var i = 0; i < data.length; i++) {
      var factor = data[i] ^ rem.shift();
      rem.push(0);
      for (var j = 0; j < gen.length; j++) rem[j] ^= gfMul(gen[j], factor);
    }
    return rem;
  }

  function dataCodewords(v) { var b = BLOCKS_M[v]; return b[1] * b[2] + b[3] * b[4]; }
  // Länge des Zeichenzählers im Numeric-Modus: 10 Bit (V1–9), 12 Bit (V10–26)
  function countBits(v) { return v < 10 ? 10 : 12; }
  // Bitlänge der Nutzdaten: Modus (4) + Zähler + je 3 Ziffern 10 Bit, Rest 2 Ziffern 7 Bit / 1 Ziffer 4 Bit
  function payloadBits(n, v) { return 4 + countBits(v) + Math.floor(n / 3) * 10 + [0, 4, 7][n % 3]; }

  // --- Schritt 1: Ziffern in einen Bitstrom kodieren und auf die Kapazität auffüllen ---
  function buildData(digits, v) {
    var bits = [];
    function put(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    put(1, 4);                                  // Modusindikator Numeric = 0001
    put(digits.length, countBits(v));           // Zeichenzähler
    for (var i = 0; i < digits.length; i += 3) { // Dreiergruppen → 10/7/4 Bit
      var chunk = digits.substr(i, 3);
      put(parseInt(chunk, 10), [0, 4, 7, 10][chunk.length]);
    }
    var capacity = dataCodewords(v) * 8;
    put(0, Math.min(4, capacity - bits.length));  // Terminator (bis zu 4 Nullbits)
    while (bits.length % 8) bits.push(0);         // auf volle Bytes auffüllen
    var bytes = [];
    for (var b = 0; b < bits.length; b += 8) {
      var byte = 0;
      for (var k = 0; k < 8; k++) byte = (byte << 1) | bits[b + k];
      bytes.push(byte);
    }
    for (var p = 0; bytes.length < capacity / 8; p++) bytes.push(p % 2 ? 0x11 : 0xEC); // Füllbytes
    return bytes;
  }

  // --- Schritt 2: in Blöcke aufteilen, Reed-Solomon je Block, dann verschachteln ---
  function addErrorCorrection(data, v) {
    var b = BLOCKS_M[v], ecLen = b[0], gen = rsGenerator(ecLen);
    var dataBlocks = [], ecBlocks = [], pos = 0;
    var sizes = [];
    for (var i = 0; i < b[1]; i++) sizes.push(b[2]);
    for (var j = 0; j < b[3]; j++) sizes.push(b[4]);
    for (var s = 0; s < sizes.length; s++) {
      var block = data.slice(pos, pos + sizes[s]); pos += sizes[s];
      dataBlocks.push(block); ecBlocks.push(rsRemainder(block, gen));
    }
    var out = [], maxLen = Math.max.apply(null, sizes);
    for (var c = 0; c < maxLen; c++) for (var d = 0; d < dataBlocks.length; d++) if (c < dataBlocks[d].length) out.push(dataBlocks[d][c]);
    for (var e = 0; e < ecLen; e++) for (var f = 0; f < ecBlocks.length; f++) out.push(ecBlocks[f][e]);
    return out;
  }

  // --- Schritt 3: Matrix mit Funktionsmustern (Finder, Timing, Alignment, reservierte Bereiche) ---
  function Matrix(v) {
    var n = 17 + 4 * v;
    this.size = n;
    this.dark = []; this.fn = [];
    for (var r = 0; r < n; r++) { this.dark.push(new Array(n).fill(false)); this.fn.push(new Array(n).fill(false)); }
  }
  Matrix.prototype.set = function (r, c, d) { this.dark[r][c] = d; this.fn[r][c] = true; };

  function drawFunctionPatterns(m, v) {
    var n = m.size, r, c, i, j;
    // Finder-Pattern (7×7) samt hellem Separator in drei Ecken
    [[0, 0], [0, n - 7], [n - 7, 0]].forEach(function (p) {
      for (r = -1; r <= 7; r++) for (c = -1; c <= 7; c++) {
        var y = p[0] + r, x = p[1] + c;
        if (y < 0 || y >= n || x < 0 || x >= n) continue;
        var ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
        m.set(y, x, ring !== 2 && ring !== 4);
      }
    });
    // Timing-Pattern in Zeile 6 und Spalte 6
    for (i = 8; i < n - 8; i++) { m.set(6, i, i % 2 === 0); m.set(i, 6, i % 2 === 0); }
    // Alignment-Pattern (5×5), außer wo sie Finder überdecken würden
    var a = ALIGN[v], last = a.length - 1;
    for (i = 0; i < a.length; i++) for (j = 0; j < a.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      for (r = -2; r <= 2; r++) for (c = -2; c <= 2; c++) m.set(a[i] + r, a[j] + c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
    }
    // Formatinformation vorerst reservieren (wird nach der Maskenwahl geschrieben)
    drawFormat(m, 0);
    // Versionsinformation ab Version 7
    if (v >= 7) {
      var rem = v;
      for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25); // BCH(18,6)
      var bits = (v << 12) | rem;
      for (i = 0; i < 18; i++) {
        var bit = ((bits >>> i) & 1) === 1, x = n - 11 + (i % 3), y = Math.floor(i / 3);
        m.set(y, x, bit); m.set(x, y, bit);
      }
    }
  }

  // Formatinformation: 2 Bit Level (M = 00) + 3 Bit Maske, BCH(15,5), XOR 0x5412, zweimal platziert
  function drawFormat(m, mask) {
    var n = m.size, data = (0 << 3) | mask, rem = data, i;
    for (i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = ((data << 10) | rem) ^ 0x5412;
    function bit(k) { return ((bits >>> k) & 1) === 1; }
    // Kopie 1: um das Finder-Pattern oben links
    for (i = 0; i <= 5; i++) m.set(i, 8, bit(i));
    m.set(7, 8, bit(6)); m.set(8, 8, bit(7)); m.set(8, 7, bit(8));
    for (i = 9; i < 15; i++) m.set(8, 14 - i, bit(i));
    // Kopie 2: unter dem Finder oben rechts und neben dem Finder unten links
    for (i = 0; i < 8; i++) m.set(8, n - 1 - i, bit(i));
    for (i = 8; i < 15; i++) m.set(n - 15 + i, 8, bit(i));
    m.set(n - 8, 8, true); // „Dark Module“, immer dunkel
  }

  // --- Schritt 4: Codewörter im Zickzack von unten rechts in die freien Module setzen ---
  function placeCodewords(m, codewords) {
    var n = m.size, i = 0, total = codewords.length * 8;
    for (var right = n - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;               // Spalte 6 (Timing) überspringen
      var upward = ((right + 1) & 2) === 0;
      for (var vert = 0; vert < n; vert++) {
        var r = upward ? n - 1 - vert : vert;
        for (var j = 0; j < 2; j++) {
          var c = right - j;
          if (m.fn[r][c]) continue;
          if (i < total) m.dark[r][c] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
          i++;                                    // Restbits bleiben hell
        }
      }
    }
  }

  // --- Schritt 5: Masken (nur auf Datenmodule) ---
  var MASKS = [
    function (r, c) { return (r + c) % 2 === 0; },
    function (r) { return r % 2 === 0; },
    function (r, c) { return c % 3 === 0; },
    function (r, c) { return (r + c) % 3 === 0; },
    function (r, c) { return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; },
    function (r, c) { return (r * c) % 2 + (r * c) % 3 === 0; },
    function (r, c) { return ((r * c) % 2 + (r * c) % 3) % 2 === 0; },
    function (r, c) { return ((r + c) % 2 + (r * c) % 3) % 2 === 0; }
  ];
  function applyMask(m, mask) {
    var f = MASKS[mask];
    for (var r = 0; r < m.size; r++) for (var c = 0; c < m.size; c++) if (!m.fn[r][c] && f(r, c)) m.dark[r][c] = !m.dark[r][c];
  }

  // --- Schritt 6: Penalty-Bewertung (Regeln N1–N4) über das vollständige Symbol ---
  function penalty(m) {
    var n = m.size, d = m.dark, score = 0, r, c, k, a, b;
    function at(horiz, a, b) { return horiz ? d[a][b] : d[b][a]; }
    // Zeilen (horiz) und Spalten getrennt auswerten
    for (var pass = 0; pass < 2; pass++) {
      var horiz = pass === 0;
      for (a = 0; a < n; a++) {
        // N1: Folgen von ≥ 5 gleichfarbigen Modulen → 3 + (Länge − 5)
        var run = 1;
        for (b = 1; b < n; b++) {
          if (at(horiz, a, b) === at(horiz, a, b - 1)) run++;
          else { if (run >= 5) score += run - 2; run = 1; }
        }
        if (run >= 5) score += run - 2;
        // N3: Finder-ähnliches Muster 1:1:3:1:1 mit 4 hellen Modulen davor oder dahinter → 40
        for (b = 0; b + 6 < n; b++) {
          if (at(horiz, a, b) && !at(horiz, a, b + 1) && at(horiz, a, b + 2) && at(horiz, a, b + 3) &&
              at(horiz, a, b + 4) && !at(horiz, a, b + 5) && at(horiz, a, b + 6)) {
            var before = true, after = true;
            for (k = 1; k <= 4; k++) {
              if (b - k >= 0 && at(horiz, a, b - k)) before = false;
              if (b + 6 + k < n && at(horiz, a, b + 6 + k)) after = false;
            }
            if (before || after) score += 40;
          }
        }
      }
    }
    // N2: jeder einfarbige 2×2-Block → 3
    for (r = 0; r < n - 1; r++) for (c = 0; c < n - 1; c++) {
      var v = d[r][c];
      if (v === d[r][c + 1] && v === d[r + 1][c] && v === d[r + 1][c + 1]) score += 3;
    }
    // N4: Abweichung des Dunkelanteils von 50 % → 10 je volle 5 %
    var darkCount = 0;
    for (r = 0; r < n; r++) for (c = 0; c < n; c++) if (d[r][c]) darkCount++;
    score += Math.floor(Math.abs(darkCount * 2 - n * n) * 10 / (n * n)) * 10;
    return score;
  }

  function build(codewords, v, mask) {
    var m = new Matrix(v);
    drawFunctionPatterns(m, v);
    placeCodewords(m, codewords);
    applyMask(m, mask);
    drawFormat(m, mask);
    return m;
  }

  // --- Öffentliche Funktion ---
  function encodeNumeric(digits, opts) {
    if (typeof digits !== 'string' || !/^[0-9]+$/.test(digits)) throw new Error('QR: nur Ziffern 0–9 erlaubt');
    // Kleinste Version wählen, in die die Daten passen
    var v = 1;
    while (v <= MAX_VERSION && payloadBits(digits.length, v) > dataCodewords(v) * 8) v++;
    if (v > MAX_VERSION) throw new Error('QR: zu viele Ziffern (max. 991 für Version 15-M)');

    var codewords = addErrorCorrection(buildData(digits, v), v);

    var m, mask;
    if (opts && opts.mask != null) {
      mask = opts.mask;
      if (!(mask >= 0 && mask <= 7 && mask % 1 === 0)) throw new Error('QR: Maske muss 0–7 sein');
      m = build(codewords, v, mask);
    } else {
      // Alle 8 Masken ausprobieren, die mit der geringsten Penalty gewinnt
      var best = Infinity;
      for (var i = 0; i < 8; i++) {
        var cand = build(codewords, v, i), p = penalty(cand);
        if (p < best) { best = p; m = cand; mask = i; }
      }
    }
    var dark = m.dark;
    return {
      size: m.size, version: v, mask: mask,
      isDark: function (row, col) { return dark[row][col]; }
    };
  }

  return { encodeNumeric: encodeNumeric };
})();

if (typeof module === 'object' && module.exports) module.exports = QR;
