# DPH-QR-Code – Formatbeschreibung (aktuell Version 2)

Verbindliche Beschreibung des QR-Codes, den die Web-App **DPH Eingabe** erzeugt.
Grundlage für den Importer in der Windows-App (Flutter/Dart).

## 1. QR-Symbol

| Eigenschaft | Wert |
| --- | --- |
| Norm | ISO/IEC 18004 (QR Code Model 2) |
| Kodiermodus | Numeric (nur Ziffern `0–9`) |
| Fehlerkorrektur | M (ca. 15 %) |
| Version | automatisch, kleinste passende; bei max. 200 Werten höchstens Version 12 (65×65 Module) |
| Ruhezone | 4 Module, schwarz auf weiß |
| Inhalt | reine Ziffernfolge, **kein** Präfix, keine Trennzeichen, kein Zeilenumbruch |

Der dekodierte Inhalt ist ein String aus Ziffern. Manche Scanner hängen `\r` / `\n` an:
Der Importer entfernt Leerraum am Anfang und Ende (`trim()`), weitere Toleranz gibt es nicht.

## 2. Aufbau des Inhalts (Formatversion 2 – erzeugt die Web-App)

```
2 F TTTT WWW WWW WWW …
│ │ │    └─ n10-Werte, je genau 3 Ziffern (App: 1–200 Werte)
│ │ └────── Tiefe des ersten Messwerts in cm, genau 4 Ziffern (= Vorschacht + 10)
│ └──────── Abschluss der Sondierung, genau 1 Ziffer
└────────── Formatversion, genau 1 Ziffer = „2“
```

| Position (0-basiert) | Länge | Feld | Wertebereich | Bedeutung |
| --- | --- | --- | --- | --- |
| 0 | 1 | `version` | `2` | Formatversion. |
| 1 | 1 | `abschluss` | `0`, `1`, `2` | `0` = keine Angabe, `1` = Abbruch wegen Geräteauslastung, `2` = Endteufe erreicht. |
| 2–5 | 4 | `startCm` | `0010`–`9990`, Vielfaches von 10 | Tiefe des ersten Werts in cm. Tiefen gibt es nur in 10-cm-Schritten. |
| 6 + 3·i | 3 | `n10[i]` | `000`–`120`, `999` | Schlagzahl je 10 cm, höchstens 120. `999` = kein Wert (`null`). |

Gesamtlänge: `6 + 3 · Anzahl` Ziffern, also z. B. 9 Ziffern bei 1 Wert und 606 Ziffern bei 200 Werten.

Die beiden Angaben schließen sich aus (in der App zwei Checkboxen, von denen höchstens eine gesetzt ist).
Abbildung auf das JSON-Format der Windows-App:

| `abschluss` | `abbruchGeraeteauslastung` | `endteufeErreicht` |
| --- | --- | --- |
| `0` | `false` | `false` |
| `1` | `true` | `false` |
| `2` | `false` | `true` |

### Abgeleitete Werte

- Tiefe von Wert `i` (0-basiert): `depthCm = startCm + 10 · i`
- Vorschachttiefe: `preExcavationDepthCm = startCm − 10`
- Ein Wert bei `depthCm = d` ist die Schlagzahl für das Intervall `d − 10 … d` cm
  (Beispiel: `depthCm = 150` → 1,40–1,50 m).

### Formatversion 1 (alt, nur noch lesen)

Ältere, noch nicht aktualisierte Installationen der Web-App können Version 1 erzeugen:
`1 TTTT WWW …`, also gleicher Aufbau **ohne** die Ziffer `abschluss` (Länge `5 + 3 · Anzahl`).
Der Importer soll Version 1 weiter akzeptieren. Da sie keine Abschlussangabe enthält,
bleiben `abbruchGeraeteauslastung` und `endteufeErreicht` beim Import dann **unverändert**.

## 3. Gültigkeitsprüfung (Importer)

Prüfreihenfolge und Fehlermeldungen (Vorschlag):

| # | Prüfung | Bei Verstoß |
| --- | --- | --- |
| 1 | nach `trim()` nur Ziffern, nicht leer | „Kein DPH-Messwert-Code“ |
| 2 | erste Ziffer `1` oder `2` | „QR-Code hat ein neueres Format – bitte Windows-App aktualisieren“ |
| 3 | Länge ≥ Kopf (V1: 5, V2: 6) und `(Länge − Kopf)` durch 3 teilbar | „Kein DPH-Messwert-Code“ |
| 4 | nur V2: `abschluss` ist `0`, `1` oder `2` | „Ungültige Abschlussangabe“ |
| 5 | mindestens 1 Wert | „QR-Code enthält keine Messwerte“ |
| 6 | höchstens 200 Werte | „Zu viele Messwerte (max. 200)“ |
| 7 | `startCm ≥ 10` und Vielfaches von 10 | „Ungültige Starttiefe“ |
| 8 | jeder Wert `000`–`120` oder `999` | „Ungültiger Messwert bei X,XX m (max. 120)“ |

Reguläre Ausdrücke für den Grobcheck (Prüfungen 1–5):

```
Version 2:  ^2[0-2]\d{4}(\d{3})+$
Version 1:  ^1\d{4}(\d{3})+$
```

Werte `000`–`120` werden unverändert übernommen, `999` wird zu `null`.
Die Web-App erzeugt keine Werte über 120 (Eingabe wird markiert und auf 120 begrenzt);
ein Code mit `121`–`998` ist daher fehlerhaft und wird komplett abgelehnt, nicht teilweise importiert.

## 4. Testvektoren

Erzeugt mit der Kodierlogik der Web-App (`encode()` in `index.html`).

Gültig, Version 2:

| Vorschacht | Abschluss | Werte (App) | QR-Inhalt | Ergebnis |
| --- | --- | --- | --- | --- |
| 120 | keine | `[5, 5, 6, null]` | `200130005005006999` | pre 120; 130→5, 140→5, 150→6, 160→null; beide `false` |
| 120 | keine | `[null]` | `200130999` | pre 120; 130→null |
| 0 | Endteufe | `[0, 1, 2]` | `220010000001002` | pre 0; 10→0, 20→1, 30→2; `endteufeErreicht = true` |
| 250 | Abbruch | `[12, 15, 120, null, 7]` | `210260012015120999007` | pre 250; 260→12, 270→15, 280→120, 290→null, 300→7; `abbruchGeraeteauslastung = true` |
| 120 | keine | 200 × `5` | `200130` + 200 × `005` (606 Ziffern) | pre 120; 130…2120 → 5; QR-Version 12 |

Gültig, Version 1 (alt):

| QR-Inhalt | Ergebnis |
| --- | --- |
| `10130005005006999` | pre 120; 130→5, 140→5, 150→6, 160→null; Abschluss-Felder unverändert |

Ungültig (müssen abgelehnt werden):

| Inhalt | Grund |
| --- | --- |
| `200130` | keine Messwerte |
| `2001300` | Länge − 6 nicht durch 3 teilbar |
| `230130005` | Abschluss 3 gibt es nicht |
| `30130005` | Formatversion 3 |
| `2001300O5` | enthält Buchstabe O |
| `https://example.com` | kein DPH-Code |
| `200000005` | Starttiefe 0 |
| `200135005` | Starttiefe 135 cm, kein 10-cm-Schritt |
| `200130005121` | Wert 121 > 120 |
| `200130998` | Wert 998 > 120 (und ≠ 999) |
| `200130` + 201 × `005` | mehr als 200 Werte |
| `10130` | Version 1 ohne Messwerte |

## 5. Referenz-Decoder (Dart)

```dart
enum DphAbschluss { keineAngabe, abbruchGeraeteauslastung, endteufeErreicht }

class DphQrData {
  final int formatVersion;
  final int preExcavationDepthCm;
  /// null bei Formatversion 1: keine Angabe im Code → Felder beim Import nicht ändern.
  final DphAbschluss? abschluss;
  final List<({int depthCm, int? n10})> measurements;
  const DphQrData(this.formatVersion, this.preExcavationDepthCm, this.abschluss, this.measurements);
}

DphQrData decodeDphQr(String raw) {
  const invalid = FormatException('Kein DPH-Messwert-Code');
  final s = raw.trim();
  if (!RegExp(r'^\d+$').hasMatch(s)) throw invalid;

  final version = int.parse(s[0]);
  if (version != 1 && version != 2) {
    throw const FormatException('QR-Code hat ein neueres Format – bitte Windows-App aktualisieren');
  }
  final head = version == 1 ? 5 : 6;
  if (s.length < head || (s.length - head) % 3 != 0) throw invalid;

  final DphAbschluss? abschluss = version == 1
      ? null
      : switch (s[1]) {
          '0' => DphAbschluss.keineAngabe,
          '1' => DphAbschluss.abbruchGeraeteauslastung,
          '2' => DphAbschluss.endteufeErreicht,
          _ => throw const FormatException('Ungültige Abschlussangabe'),
        };

  final count = (s.length - head) ~/ 3;
  if (count == 0) throw const FormatException('QR-Code enthält keine Messwerte');
  if (count > 200) throw const FormatException('Zu viele Messwerte (max. 200)');

  final start = int.parse(s.substring(head - 4, head));
  if (start < 10 || start % 10 != 0) throw const FormatException('Ungültige Starttiefe');

  final measurements = <({int depthCm, int? n10})>[];
  for (var i = 0; i < count; i++) {
    final depthCm = start + i * 10;
    final v = int.parse(s.substring(head + i * 3, head + i * 3 + 3));
    if (v > 120 && v != 999) {
      final m = (depthCm / 100).toStringAsFixed(2).replaceAll('.', ',');
      throw FormatException('Ungültiger Messwert bei $m m (max. 120)');
    }
    measurements.add((depthCm: depthCm, n10: v == 999 ? null : v));
  }
  return DphQrData(version, start - 10, abschluss, measurements);
}
```

## 6. Was der Code bewusst nicht enthält

Name, Datum, ID und Koordinaten der DPH stehen **nicht** im QR-Code. Der Code wird in der
Windows-App immer in die gerade geöffnete DPH importiert und ersetzt dort alle Messwerte,
die Vorschachttiefe und (ab Version 2) die Abschlussangabe.
Für die Übertragung vollständiger DPHs gibt es den JSON-Export (siehe `CLAUDE.md`).

## 7. Änderungen am Format

Jede inkompatible Änderung bekommt eine neue Formatversion (erste Ziffer `3`, `4`, …).
Ein Importer lehnt unbekannte Versionen ab, statt sie falsch zu lesen.

| Version | Änderung |
| --- | --- |
| 1 | `1 TTTT WWW…` – Starttiefe und n10-Werte |
| 2 | `2 F TTTT WWW…` – zusätzlich Abschluss (Abbruch Geräteauslastung / Endteufe erreicht) |
