# DPH Eingabe

Handy-Web-App zum Erfassen von DPH-Schlagzahlen (n10 je 10 cm).
Die Messwerte werden als QR-Code an die Windows-App übertragen oder als JSON exportiert.

## Nutzung

1. Seite am Handy öffnen.
2. DPH wählen oder mit „+ Neue DPH“ anlegen, Vorschachttiefe eintragen (Standard 120 cm).
3. Schlagzahlen eingeben. „+ Zeile“ legt die nächste Zeile mit dem letzten Wert an.
4. „QR groß anzeigen“ und in der Windows-App in der passenden DPH scannen,
   oder „JSON exportieren“ für alle DPHs auf einmal.

**Tipp:** Im Browser „Teilen → Zum Home-Bildschirm“ wählen. Dann startet die Seite wie eine App im Vollbild,
funktioniert offline, und iOS löscht die gespeicherten DPHs nicht automatisch.

Die Seite lädt nichts von fremden Servern: Der QR-Code wird vom eigenen `qr.js` erzeugt,
als Schrift dient die Systemschrift des Geräts. Alle Daten bleiben auf dem Handy.

## Dateien

| Datei | Zweck |
| --- | --- |
| `index.html` | die App (HTML, CSS, JavaScript) |
| `qr.js` | eigener QR-Generator (Numeric-Modus, Fehlerkorrektur M, Version 1–15) |
| `sw.js` | Service Worker für Offline-Betrieb |
| `manifest.webmanifest`, Icons | „Zum Home-Bildschirm“ |
| `test/` | Tests für `qr.js`, nur für die Entwicklung |

## Veröffentlichen mit GitHub Pages

1. Repository auf GitHub anlegen (Public) und diesen Ordner hochladen bzw. pushen.
2. Im Repository: **Settings → Pages → Build and deployment**
   Source „Deploy from a branch“, Branch `main`, Ordner `/ (root)` → Save.
3. Nach ca. 1 Minute erreichbar unter `https://<benutzername>.github.io/<repository>/`.

Änderungen: Dateien ändern, committen, pushen – die URL bleibt gleich.

## Lokal testen

```bash
python -m http.server 8000
```

Dann `http://localhost:8000` öffnen.

## QR-Generator testen

Benötigt [Node.js](https://nodejs.org/). Vergleicht `qr.js` mit der Bibliothek `qrcode-generator`
und liest die erzeugten Codes mit `jsQR` zurück:

```bash
cd test
npm install
npm test
```
