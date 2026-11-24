# DPH Eingabe – Projektkontext

Mobile Web-App (eine statische Seite, gehostet auf GitHub Pages) zum Erfassen von
DPH-Sondierungen (Schwere Rammsondierung, Schlagzahlen n10 je 10 cm) im Feld.
Die Daten gehen per QR-Code oder JSON-Export an eine Flutter-Windows-App.

## Aufbau

- `index.html` – die App: HTML, CSS und JavaScript in einer Datei, kein Build-Schritt.
- `qr.js` – eigener QR-Generator (ISO/IEC 18004), ohne Abhängigkeiten: nur Numeric-Modus,
  Fehlerkorrektur M, Versionen 1–15 (max. 991 Ziffern), alle 8 Masken mit Penalty N1–N4.
  API: `QR.encodeNumeric(digits)` → `{ size, version, mask, isDark(row, col) }`; wirft bei
  Nicht-Ziffern oder zu langer Eingabe. `{ mask: 0..7 }` als 2. Argument erzwingt eine Maske (nur für Tests).
- `sw.js` – Service Worker für Offline-Betrieb. Bei Änderungen an gecachten Dateien (`CORE`) `CACHE` hochzählen (aktuell `dph-v2`).
- `manifest.webmanifest`, `icon*.png`, `icon.svg`, `apple-touch-icon.png` – „Zum Home-Bildschirm“ / PWA.
- `.nojekyll` – verhindert, dass GitHub Pages die Seite durch Jekyll schickt.
- `test/` – nur Entwicklung (Node-Testskript + `package.json`), wird von der App nicht geladen.
- Keine externen Abhängigkeiten: Die Seite lädt nichts von fremden Servern (keine CDNs, keine Web-Fonts).
  Schrift ist der System-Font-Stack (`--font` in `index.html`). So soll es bleiben.

## Konventionen

- Oberfläche auf Deutsch, Tiefen in Metern mit Komma (`1,30 m`), intern in cm.
- Zielgerät ist das Handy (iPhone Safari/Firefox, Android Chrome). Bedienelemente mind. 44 px, Eingabefelder 16 px+ (sonst zoomt iOS).
- Kein Framework, kein Build. Werte aus Eingaben nie als HTML einsetzen ohne `esc()`.
- Daten liegen nur im `localStorage` des Geräts (Schlüssel `dph-qr-v2`), es gibt kein Backend.

## Datenmodell (localStorage `dph-qr-v2`)

```json
{ "cur": "<id>", "list": [
  { "id": "<intern>", "date": "YYYY-MM-DD", "name": "DPH 1", "pre": 120,
    "values": [5, 5, 6, null], "abbruch": false, "endteufe": false }
]}
```

- `id` ist nur intern (Tabs/Auswahl). Eine GUID erzeugt die Web-App nicht mehr (alte `guid`-Felder werden beim Laden entfernt).
- `pre` = Vorschachttiefe in cm (Standard 120), **immer ein Vielfaches von 10**. Erster Messwert liegt bei `pre + 10`.
  Eingabe wie 125 wird rot markiert und beim Verlassen des Felds aufgerundet (130), siehe `up10()`.
- `values[i]` = n10 bei Tiefe `pre + 10 * (i + 1)`; `null` = kein Wert; **0–120** (`N10_MAX`).
  Höhere Eingaben werden markiert und als 120 übernommen.
- `abbruch` / `endteufe` = Checkboxen „Abbruch wegen Geräteauslastung“ / „Endteufe erreicht“; schließen sich gegenseitig aus.
  Im JSON-Export und im QR-Code (Ziffer `F`, siehe unten).
- In der Liste zeigt die letzte Zeile den Bereich, z. B. `1,40–1,50 m`.

## QR-Format (nur Ziffern → QR-Numeric-Modus, Fehlerkorrektur M)

Vollständige Beschreibung mit Prüfregeln und Testvektoren für den Importer: `QR-FORMAT.md`.
Bei Änderungen am Format dort und in `encode()` (`index.html`) gleichzeitig anpassen.

```
2 F TTTT WWW WWW WWW …
│ │ │    └ je n10-Wert 3 Ziffern, 000–120, 999 = kein Wert (null)
│ │ └ Tiefe des ersten Messwerts in cm, 4 Ziffern (= pre + 10, Vielfaches von 10)
│ └ Abschluss: 0 keine Angabe, 1 Abbruch wegen Geräteauslastung, 2 Endteufe erreicht
└ Formatversion (aktuell 2; Version 1 = gleicher Aufbau ohne F, nur noch vom Importer gelesen)
```

Max. 200 Werte (20 m) → 606 Ziffern → QR-Version 12.
Inkompatible Änderungen am Aufbau immer mit neuer Formatversion.
Gegenstück in der Windows-App (Dart): Referenz-Decoder in `QR-FORMAT.md`, Abschnitt 5.

## JSON-Export (Format der Windows-App)

Alle DPHs in einer Datei `DPH-Export_YYYY-MM-DD.json`:

```json
{ "indirekt-drillings": [ {
  "id": "", "type": "dph", "name": "DPH 1",
  "bearbeiter_sondierung": "", "datum": "2026-11-16", "date": "2026-11-16",
  "DatumSondierung": "2026-11-16", "BearbeiterSondierung": "",
  "xKoordinate": "", "yKoordinate": "", "lageNhn": "",
  "groundwaterLevels": [], "coordinateSystemEpsgCode": "", "connectedBoreholeId": "",
  "measurements": [ { "depthCm": 130, "n10": 5 } ],
  "status": "feld_fertig", "preExcavationDepthCm": 120,
  "abbruchGeraeteauslastung": false, "endteufeErreicht": false, "bemerkungen": ""
} ] }
```

`id` bleibt leer – die Web-App erzeugt keine ID, das übernimmt die Windows-App.
`abbruchGeraeteauslastung` / `endteufeErreicht` kommen aus den Checkboxen, `n10` ist auf 120 begrenzt.
Export am Handy über `navigator.share` (Teilen-Menü), sonst normaler Download.

## Testen

- QR-Generator (Node.js nötig): `cd test && npm install && npm test`.
  Vergleicht für ≥ 300 zufällige Ziffernfolgen (Länge 5–605) plus Versionsgrenzen die Matrix aus `qr.js`
  Modul für Modul mit `qrcode-generator` 1.4.4 (Numeric, M, gleiche Version, Maske aus dessen Formatinfo),
  liest die automatisch maskierten Codes mit `jsQR` zurück und prüft die Fehlerfälle.
  Optional `CASES=1000 SEED=42`. Nach jeder Änderung an `qr.js` ausführen.
  Die automatische Maskenwahl weicht von `qrcode-generator` ab – erwartet, die Bibliothek bewertet vereinfacht.
- Lokal: `npx serve .` oder `python -m http.server` im Projektordner, dann `http://localhost:8000`.
  Am Handy im selben WLAN über die IP des PCs testen (Service Worker läuft dann nicht, da kein HTTPS – das ist ok).
- Nach dem Push auf GitHub Pages ca. 1 Minute warten; das Handy lädt die neue Version beim nächsten Öffnen mit Netz.

## Sicherheit

- Öffentliches Repository: keine echten Messdaten, Projektnamen, Exporte oder Zugangsdaten committen (`.gitignore` schließt `*.json` aus).
- Keine Daten verlassen das Gerät außer über QR-Code bzw. Export durch den Nutzer.
