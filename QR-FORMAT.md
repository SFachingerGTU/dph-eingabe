# DPH-QR-Code – Formatbeschreibung (Version 1)

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

## 2. Aufbau des Inhalts

```
1 TTTT WWW WWW WWW …
│ │    └─ n10-Werte, je genau 3 Ziffern, beliebig viele (App: 1–200)
│ └────── Tiefe des ersten Messwerts in cm, genau 4 Ziffern (= Vorschacht + 10)
└──────── Formatversion, genau 1 Ziffer, aktuell immer „1“
```

| Position (0-basiert) | Länge | Feld | Wertebereich | Bedeutung |
| --- | --- | --- | --- | --- |
| 0 | 1 | `version` | `1` | Formatversion. Andere Werte → ablehnen (neueres Format). |
| 1–4 | 4 | `startCm` | `0010`–`9999` | Tiefe des ersten Werts in cm. In der App immer ein Vielfaches von 10. |
| 5 + 3·i | 3 | `n10[i]` | `000`–`998`, `999` | Schlagzahl je 10 cm. `999` = kein Wert (`null`). |

Gesamtlänge: `5 + 3 · Anzahl` Ziffern, also z. B. 8 Ziffern bei 1 Wert und 605 Ziffern bei 200 Werten.

### Abgeleitete Werte

- Tiefe von Wert `i` (0-basiert): `depthCm = startCm + 10 · i`
- Vorschachttiefe: `preExcavationDepthCm = startCm − 10`
- Ein Wert bei `depthCm = d` ist die Schlagzahl für das Intervall `d − 10 … d` cm
  (Beispiel: `depthCm = 150` → 1,40–1,50 m).

## 3. Gültigkeitsprüfung (Importer)

Prüfreihenfolge und Fehlermeldungen (Vorschlag):

| # | Prüfung | Bei Verstoß |
| --- | --- | --- |
| 1 | nach `trim()` nur Ziffern, Länge ≥ 5 | „Kein DPH-Messwert-Code“ |
| 2 | erstes Zeichen = `1` | „QR-Code hat ein neueres Format – bitte Windows-App aktualisieren“ |
| 3 | `(Länge − 5)` durch 3 teilbar | „Kein DPH-Messwert-Code“ |
| 4 | mindestens 1 Wert | „QR-Code enthält keine Messwerte“ |
| 5 | höchstens 200 Werte | „Zu viele Messwerte (max. 200)“ |
| 6 | `startCm ≥ 10` | „Ungültige Starttiefe“ |

Zusammengefasster regulärer Ausdruck für die Formatversion 1 (Prüfungen 1–3):

```
^1\d{4}(\d{3})+$
```

Werte `000`–`998` werden unverändert übernommen, `999` wird zu `null`.
Ein Wert > 998 außer 999 kann nicht vorkommen, weil drei Ziffern nicht mehr zulassen.

## 4. Testvektoren

Erzeugt mit der Kodierlogik der Web-App (`encode()` in `index.html`).

| Vorschacht | Werte (App) | QR-Inhalt | Ergebnis |
| --- | --- | --- | --- |
| 120 | `[5, 5, 6, null]` | `10130005005006999` | pre 120; 130→5, 140→5, 150→6, 160→null |
| 120 | `[null]` | `10130999` | pre 120; 130→null |
| 0 | `[0, 1, 2]` | `10010000001002` | pre 0; 10→0, 20→1, 30→2 |
| 250 | `[12, 15, 998, null, 7]` | `10260012015998999007` | pre 250; 260→12, 270→15, 280→998, 290→null, 300→7 |
| 120 | 200 × `5` | `10130` + 200 × `005` (605 Ziffern) | pre 120; 130…2120 → 5; QR-Version 12 |

Ungültige Eingaben (müssen abgelehnt werden):

| Inhalt | Grund |
| --- | --- |
| `10130` | keine Messwerte |
| `1013000` | Länge − 5 nicht durch 3 teilbar |
| `20130005` | Formatversion 2 |
| `1013O005` | enthält Buchstabe O |
| `https://example.com` | kein DPH-Code |
| `10000005` | Starttiefe 0 |
| `10130` + 201 × `005` | mehr als 200 Werte |

## 5. Referenz-Decoder (Dart)

```dart
class DphQrData {
  final int preExcavationDepthCm;
  final List<({int depthCm, int? n10})> measurements;
  const DphQrData(this.preExcavationDepthCm, this.measurements);
}

DphQrData decodeDphQr(String raw) {
  final s = raw.trim();
  if (!RegExp(r'^\d{5,}$').hasMatch(s)) throw const FormatException('Kein DPH-Messwert-Code');
  if (s[0] != '1') throw const FormatException('QR-Code hat ein neueres Format – bitte Windows-App aktualisieren');
  if ((s.length - 5) % 3 != 0) throw const FormatException('Kein DPH-Messwert-Code');
  final count = (s.length - 5) ~/ 3;
  if (count == 0) throw const FormatException('QR-Code enthält keine Messwerte');
  if (count > 200) throw const FormatException('Zu viele Messwerte (max. 200)');
  final start = int.parse(s.substring(1, 5));
  if (start < 10) throw const FormatException('Ungültige Starttiefe');
  return DphQrData(start - 10, [
    for (var i = 0; i < count; i++)
      (
        depthCm: start + i * 10,
        n10: switch (int.parse(s.substring(5 + i * 3, 8 + i * 3))) { 999 => null, final v => v },
      ),
  ]);
}
```

## 6. Was der Code bewusst nicht enthält

Name, Datum, GUID und Koordinaten der DPH stehen **nicht** im QR-Code. Der Code wird in der
Windows-App immer in die gerade geöffnete DPH importiert und ersetzt dort alle Messwerte.
Für die Übertragung vollständiger DPHs gibt es den JSON-Export (siehe `CLAUDE.md`).

## 7. Änderungen am Format

Jede inkompatible Änderung bekommt eine neue Formatversion (erste Ziffer `2`, `3`, …).
Ein Importer für Version 1 lehnt unbekannte Versionen ab, statt sie falsch zu lesen.
