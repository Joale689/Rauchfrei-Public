# Rauchfrei Public

Progressive Web App zur strukturierten Erfassung und schrittweisen Reduktion des Rauchkonsums.

Das Projekt ist eine umfangreichere Neuentwicklung meiner persönlichen Rauchfrei-App. Ziel ist eine robuste Anwendung mit sauberer Datenlogik, Offline-Fähigkeit und automatisierten Tests.

## Technischer Schwerpunkt

Eine besondere Herausforderung ist die Zeit- und Tageslogik bei wechselnden Arbeits- und Schlafzeiten.

Berücksichtigt werden unter anderem:

- frei definierbare und manuelle Tagesgrenzen
- Sommer- und Winterzeit
- 23- und 25-Stunden-Tage
- UTC-Zeitstempel
- Ereignisse an Tagesgrenzen
- unvollständige und bestätigte Tage
- Schutz vor beschädigten oder widersprüchlichen Daten

## Funktionen

- Zigaretten und Dampfen getrennt erfassen
- Ereignisse bearbeiten und rückgängig machen
- individuelle Tageslogik
- Verlauf mehrerer Tage
- Kostenberechnung
- Profil- und Einstellungsdaten
- JSON-Export und geprüfter Import
- lokale Datenspeicherung
- Offline-Funktion als Progressive Web App

## Tests

Die Kernlogik wird mit automatisierten Node.js-Tests geprüft.

Getestet werden unter anderem Tagesgrenzen, Zeitumstellung, ungültige Daten, doppelte IDs, Import und Backup, Datenisolation, Kostenberechnung, Profilfunktionen und Service-Worker-Verhalten.

Tests starten mit:

npm test

## Technik

- JavaScript / ES Modules
- Node.js Test Runner
- HTML und CSS
- JSON
- Local Storage
- Progressive Web App
- Service Worker
- Git

## Projektstruktur

- src/core.js - Daten- und Tageslogik
- src/app.js - Anwendung und Benutzeroberfläche
- src/costs.js - Kostenlogik
- src/profile.js - Profilfunktionen
- tests/ - automatisierte Tests

## Status

Das Projekt befindet sich aktiv in Entwicklung. Der aktuelle Schwerpunkt liegt auf einer stabilen technischen Grundlage und nachvollziehbarer Datenlogik.
