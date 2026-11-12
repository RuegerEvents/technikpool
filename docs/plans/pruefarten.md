# Plan: Prüfarten, V3-Prüfdaten und Prüfplatz

Stand: 11.11.2026. Ergebnis einer Planungsrunde (Grilling). Die Recherche zu den Prüfgeräten
steht in [pruefgeraete-recherche.md](pruefgeraete-recherche.md).

Heute kennt der Technikpool genau eine Prüfung: Ja/Nein pro Kategorie bzw. Produkt, ein
Intervall pro Gerät, faktisch die elektrische Prüfung nach DGUV V3 (siehe „DGUV inspections“
in `CLAUDE.md`). Das reicht nicht für Anschlagmittel, Sichtprüfungen und die Kalibrierung des
Prüfgeräts. Außerdem kommt bald ein Prüfgerät, das in Echtzeit angebunden werden soll, damit
Stammdaten und Ergebnisse nicht in zwei Systemen gepflegt werden.

## Entscheidungen

| Thema                  | Entscheidung                                                                                                                                                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prüfarten              | Gemeinsame Liste, von Systemadmins gepflegt wie Kategorien. Vorbelegt: Elektrisch (DGUV V3), Anschlagmittel, Sichtprüfung, Kalibrierung.                                                                                                                  |
| Zuordnung              | Die Kategorie gibt je Prüfart einen Standard vor, das Produkt schaltet jede Prüfart einzeln an oder ab (wie heute `requiresInspection`, nur pro Art). Ein Produkt kann mehrere haben (Kettenzug: elektrisch + Anschlagmittel).                            |
| Intervalle             | Drei Stufen je Prüfart: Standard der Org, Intervall der Org für ein Produkt (z. B. Kabeltrommeln 6 statt 12 Monate), eigenes Intervall eines Geräts nur als Ausnahme. Eine Änderung an Standard oder Produkt gilt sofort für alle Geräte, die ihr folgen. |
| Nicht bestanden        | Je Prüfart einstellbar: elektrisch → Defekt, Anschlagmittel → Aussondern (ausgemustert), Sichtprüfung → Wartung.                                                                                                                                          |
| Ausgabe                | Überfällige Geräte: deutliche Warnung beim Scannen und auf Pack-/Ausgabelisten, Ausgabe bleibt möglich. Durchgefallene sind über ihren Status ohnehin gesperrt.                                                                                           |
| Sichtprüfung           | Eigene Prüfart. Bei der Rücknahme per Scanner gibt es „Defekt melden“; wer nichts meldet, hat mit „ok“ geprüft, und das wird geschrieben. Darf jeder, der die Rücknahme darf.                                                                             |
| Befähigung             | Am Mitglied hinterlegt ADMIN/OWNER, für welche Prüfarten es befähigt ist (EFK, EuP, Sachkundiger …). Nur Befähigte dürfen diese Prüfarten erfassen; Name und Qualifikation stehen im Protokoll. Ausnahme Sichtprüfung.                                    |
| Prüfer                 | Eigene Leute als App-Nutzer. Ein externer Name bleibt als Freitext möglich.                                                                                                                                                                               |
| Inhalt einer Prüfung   | Ergebnis, Prüfer mit Qualifikation, Datum, Messwerte strukturiert (Wert, Einheit, Grenzwert, bestanden), Prüfprotokoll-PDF, verwendetes Prüfgerät.                                                                                                        |
| Protokoll-PDF          | Erzeugt der Technikpool selbst (Renderer wie Lieferschein/AVV), mit Briefkopf; Sammelprotokolle je Org oder Produktion möglich.                                                                                                                           |
| Produktdaten           | Neu: Schutzklasse (I/II/III, Pflicht für elektrische Prüfung), Geräteart (Gerät, Verlängerung, Mehrfachsteckdose, Verteiler, Kabeltrommel, PRCD), optional Nennleistung. Der Prüfablauf ergibt sich daraus.                                               |
| Prüfmittel             | Das Prüfgerät ist ein Gerät im Technikpool mit Prüfart „Kalibrierung“. Jede Prüfung verweist darauf; abgelaufene Kalibrierung → Warnung am Prüfplatz.                                                                                                     |
| Nachweis               | Lieferschein und Kundenlink zeigen je Gerät „Prüfart gültig bis MM/JJJJ“, Leihende sehen dasselbe; Protokoll auf Wunsch im Kundenlink.                                                                                                                    |
| Stammdaten             | Der Technikpool ist führend. Was am Prüfgerät geändert wird, zählt nicht.                                                                                                                                                                                 |
| Anbindung              | Echtzeit, kein Datei-Import/-Export. Eine eigene kleine App im Repo („Prüfplatz“) auf Pi oder Laptop am Gerät, ein Treiber pro Prüfgerät.                                                                                                                 |
| Anmeldung am Prüfplatz | Jeder Prüfer koppelt den Prüfplatz mit seinem eigenen Konto (Device-Flow wie der Scanner) und meldet sich danach ab.                                                                                                                                      |
| Live-Ansicht           | Die Weboberfläche zeigt verbundene Prüfplätze (online, prüft gerade X, letzte Ergebnisse) und kann eine Liste fälliger Geräte an einen Prüfplatz schicken.                                                                                                |
| Prüfgerät              | Metrel MI 3365 + A 1422 (Drehstrom/CEE). Einzige Option mit öffentlich dokumentierter Fernsteuerung („Black Box protocol“), siehe Recherche. Offene Punkte vor dem Kauf schriftlich klären.                                                               |
| Migration              | Alle bisherigen Prüfungen und Intervalle werden „Elektrisch“. Rigging-Geräte mit Intervall werden „Anschlagmittel“ und behalten Intervalle und Prüfungen.                                                                                                 |
| Messwerte              | Nur vom Prüfgerät über den Prüfplatz, nie abgetippt. Im Web gibt es für „Elektrisch“ nur Ergebnis, Prüfer und Datum (Ausfall des Prüfplatzes, externe Prüffirma).                                                                                         |
| Leihgeräte             | Die Sichtprüfung bei der Rücknahme gilt auch für verliehene Geräte. Sie erfasst, wer zurücknimmt (die Verleih-Org), und steht in der Historie des Geräts beim Eigentümer.                                                                                 |
| API                    | Abwärtskompatibel: Eine Prüfung ohne Prüfart ist „Elektrisch“, damit ältere Scanner-Versionen im Feld weiter funktionieren.                                                                                                                               |

## Datenmodell (Entwurf)

Neue Tabellen bekommen ein ID-Präfix in `auth.ts` (`prefixes`), Namensspalten `COLLATE "natural"`.

```prisma
model InspectionType {            // 'inst'
  id                    String  @id
  key                   String  @unique  // electrical, lifting, visual, calibration
  name                  String
  nameDe                String?
  sortOrder             Int
  failStatus            AssetStatus      // BROKEN | MAINTENANCE | DECOMMISSIONED
  requiresQualification Boolean          // false für Sichtprüfung
  hasMeasurements       Boolean          // true für elektrisch
  defaultIntervalMonths Int?             // Fallback, wenn die Org keins hat
}

model CategoryInspectionType { categoryId, typeId }                      // vorhanden = Standard an
model ProductInspectionType  { productId, typeId, required Boolean }     // Override, fehlt = Kategorie
model OrgInspectionInterval  { organizationId, typeId, months Int? }     // ersetzt defaultInspectionIntervalMonths
model OrgProductInspectionInterval { organizationId, productId, typeId, months Int } // je Org und Produkt

model AssetInspectionSchedule {   // ersetzt Asset.inspectionIntervalMonths
  assetId, typeId,
  intervalMonths Int,             // das geltende: eigenes, sonst Org+Produkt, sonst Org, sonst Prüfart
  overrideMonths Int?,            // eigenes Intervall des Geräts (Ausnahme)
  nextDue DateTime
  @@id([assetId, typeId])
}
// Asset.nextInspectionDue bleibt als frühestes nextDue über alle Arten (zum Sortieren).
// reconcileSchedules ist die eine Stelle, die Zeilen anlegt, ändert oder löscht.

model Inspection {                // bestehend, erweitert
  typeId          String          // Migration: electrical
  performedById   String?         // App-Nutzer; onDelete SetNull, Name als Snapshot
  inspectorName   String?         // Snapshot bzw. externer Prüfer
  qualification   String?         // Snapshot: „Elektrofachkraft“
  testerAssetId   String?         // verwendetes Prüfgerät
  testerSnapshot  Json?           // Hersteller, Typ, Seriennummer, Kalibriert bis
  measurements    Json?           // [{ key, label, value, unit, limit, passed }]
  sequence        String?         // Prüfablauf, z. B. „SK I Schuko“
  protocolPath    String?         // PDF, nicht öffentlich (wie DPA-PDFs)
  source          String          // web | scanner | checkin | bench
}

model MemberQualification { membershipId, typeId, kind String, validUntil DateTime? }

// Product: protectionClass (I/II/III)?, equipmentKind?, ratedPowerW Int?

model TestBench {                 // 'tbch' — ein Prüfplatz
  id, organizationId, name, driver (metrel-bb, …), lastSeenAt, state Json
}
model TestBenchQueueItem { benchId, assetId, typeId, addedById, addedAt }
```

`inspectionDue` (`src/lib/inspection-due.ts`) bleibt die eine Regel, wird aber je
`AssetInspectionSchedule` angewendet. `refreshInspectionDue` schreibt `nextDue` je Prüfart.
`applyInspectionRequirement` arbeitet je Prüfart. Listen, die heute nach
`nextInspectionDue` sortieren, nehmen das früheste `nextDue` über alle Arten.

## Stufe 1: Prüfarten

Erledigt (11.11.2026, noch nicht ausgeliefert):

- Migration: vier Prüfarten, alles Bisherige → „Elektrisch“; Rigging-Geräte mit Intervall →
  „Anschlagmittel“ samt Prüfungen und Produktkennzeichen; Intervalle, die die Org so nicht
  vergeben würde, bleiben eigene Intervalle der Geräte; prüfpflichtige Geräte ohne Intervall in
  einer Org mit Standard bekommen eins (Signalwerk: 81). An einer Prod-Kopie getestet.
- Prüfpflicht je Art an Kategorie (Admin › Kategorien), Produkt und im Schnellmodus.
- Intervalle in drei Stufen (siehe Entscheidungen), Org-Einstellungen und Produktseite.
- Nicht bestanden setzt den Status der Prüfart.
- Geräteseite je Prüfart, Erfassen mit Prüfart, Prüfungsseite mit Spalte und Filter.
- API: `GET /inspection-types`, Prüfarten an Produkten, Kategorien, Geräten und Prüfungen;
  alte Felder = „Elektrisch“. Scanner-Client neu generiert.
- Admin › Prüfarten: anlegen und bearbeiten (Name, Status bei Nicht bestanden, Befähigung nötig,
  Messwerte, Standard-Intervall, Reihenfolge).
- Befähigungen je Mitglied und Prüfart (Bezeichnung, gültig bis) in der Mitgliederliste, von
  ADMIN+ gepflegt. Eigene Prüfungen einer Art mit Befähigung erfassen nur Befähigte; jede Prüfung
  speichert Prüfer, Qualifikation und wer sie erfasst hat. Externe Prüfungen (TÜV o. ä.) darf
  jeder ab ADMIN eintragen, mit Firma und Qualifikation, markiert als „extern“.

- Rücknahme: „Defekt melden“ in der Rücknahmeliste (Web und Scanner) erfasst eine nicht
  bestandene Sichtprüfung mit Beschreibung, das Gerät geht in Wartung. Wer ein Gerät ohne Meldung
  zurückbucht, schreibt eine bestandene Sichtprüfung, wenn das Produkt die Sichtprüfung braucht
  (Kategorie oder Produkt einschalten). `POST /api/v1/defects`.
- Ausgabe: „Prüfung überfällig“ in der Ausgabeliste (Web und Scanner) und als Warnung beim Scan
  (`overdueInspections` im Scan-Ergebnis); gesperrt wird nichts.
- Nachweis: Lieferschein, Packliste und Geräteliste zeigen je Zeile „Prüfung: Elektrisch gültig
  bis MM/JJJJ“ (frühestes Datum der Geräte der Zeile, überfällig in Rot); der Kundenlink je Gerät
  im Reiter „Packen & prüfen“.
- Scanner: Prüfart und „von einer externen Firma geprüft“ (mit Firma und Qualifikation) im
  Prüfmodus.
- Katalog-Log: Prüfpflicht je Art lesbar.

Offen in Stufe 1: nichts. Nachzuziehen bei Bedarf: Nachweis auch im Reiter „Equipment“ des
Kundenlinks; eigene Befähigungen im Scanner anzeigen (heute meldet der Server die fehlende).

## Stufe 2: V3-Prüfdaten

- Produkt: Schutzklasse, Geräteart, Nennleistung; im Editor nur sichtbar, wenn „Elektrisch“
  gilt; per API setzbar (damit der Katalog per Assistent ergänzt werden kann).
- Abgeleiteter Prüfablauf (`sequence`): Schutzklasse × Geräteart × Anschluss
  (Schuko, CEE 16, CEE 32, aus den Steckern bekannt).
- Prüfung: Messwerte, Prüfgerät, Befähigung als Snapshot. Messwerte kommen nur vom Prüfplatz;
  der Web-Dialog erfasst weiter nur Ergebnis, Prüfer und Datum (Quelle `web`, ohne Messwerte).
- Protokoll-PDF je Prüfung und als Sammelprotokoll (Org, Zeitraum, Produktion); abgelegt wie
  DPA-PDFs außerhalb des öffentlichen S3-Präfixes, ausgeliefert nur an Berechtigte und über
  den Kundenlink, wenn freigegeben.
- Prüfmittel: Prüfart „Kalibrierung“ am Prüfgerät; Warnung, wenn abgelaufen.

## Stufe 3: Prüfplatz

- `apps/pruefplatz` (TypeScript/Node), läuft auf Pi oder Laptop. Treiber-Schnittstelle, erster
  Treiber „Metrel Black Box“ über USB/RS232 (Ablauf in der Recherche, Abschnitt „Was die Bridge
  tun müsste“). Barcode-Scanner per USB als Tastatur.
- Kopplung per Device-Flow mit dem Konto des Prüfers, Abmelden am Prüfplatz.
- Verbindung ausgehend (WebSocket oder SSE plus `POST`), damit der Pi keinen offenen Port braucht.
  Neue `/api/v1`-Endpunkte: Prüfplatz anmelden/Status, Auftrag holen, Messwerte streamen,
  Prüfung abschließen. Erst in `openapi.yaml`, dann beide Seiten generieren.
- Ablauf: Tag scannen → Technikpool liefert Gerät, Prüfart, Ablauf, Intervall → Prüfplatz
  startet die Sequenz, beantwortet Rückfragen des Geräts mit Stammdaten → Messwerte live →
  Ergebnis als `Inspection` (`source: bench`), PDF erzeugt der Technikpool.
- Web: Prüfplätze auf der Prüfungsseite (live), „An Prüfplatz senden“ für gefilterte fällige Geräte.
- Sicherheit in der Brücke: kein Start ohne Bestätigung, Abbruch bei Verbindungsverlust,
  Hochspannungsfreigaben nie hinterlegen. Die normgerechten Abläufe verantwortet, wer die
  Sequenzen auf dem Gerät anlegt; der Technikpool wählt sie nur aus.

## Vor dem Kauf klären (Metrel)

Aus der Recherche, schriftlich beim Händler oder bei Metrel:

1. Hat das MI 3365 (Firmwarestand) Black Box über USB und RS232/Bluetooth, gibt es Ethernet?
2. Wie meldet sich USB unter Linux (CDC-ACM, FTDI, eigener Treiber)? Reicht ein Pi ohne Windows?
3. Laufen Auto-Sequenzen mit dem A 1422 (Drehstrom, CEE 32 A) und RCD/PRCD-Prüfungen im
   Black-Box-Modus vollständig, inklusive Rückfragen?
4. Lassen sich ID, Bezeichnung und Intervall direkt setzen oder nur über Rückfrage-Dialoge?
5. Ist Black Box ohne Lizenz nutzbar, wann braucht man die SDK-Lizenz, was kostet sie?
6. Gibt es das Dokument mit Messstatus- und Icon-IDs (Appendix)?

## Gerätearten und Prüfabläufe (Entwurf für die Elektrofachkraft)

Startliste nach DIN VDE 0701-0702:2020. Die Grenzwerte sind die üblichen Werte der Norm und
müssen von der Elektrofachkraft bestätigt werden, bevor sie im Code stehen. Jeder Ablauf beginnt
mit der Sichtprüfung und endet mit der Funktionsprüfung.

| Geräteart                                              | Schutzklasse | Messungen                                                                                                        |
| ------------------------------------------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------- |
| Gerät                                                  | I            | Schutzleiterwiderstand, Isolationswiderstand, Schutzleiterstrom (oder Ersatzableitstrom)                         |
| Gerät                                                  | II           | Isolationswiderstand, Berührungsstrom an berührbaren leitfähigen Teilen                                          |
| Gerät                                                  | III          | Isolationswiderstand (Prüfspannung 250 V DC), wenn sinnvoll messbar                                              |
| Verlängerungsleitung, Kaltgerätekabel                  | I            | Schutzleiterwiderstand, Isolationswiderstand, Durchgang und Vertauschung der Leiter                              |
| Mehrfachsteckdose, Kabeltrommel                        | I            | wie Verlängerungsleitung, je Steckplatz Schutzleiter; Kabeltrommel abgewickelt bzw. mit Überhitzungsschutz       |
| Verteiler (CEE/Schuko)                                 | I            | wie Mehrfachsteckdose, je Abgang; Isolationswiderstand aller Außenleiter; eingebauter FI: Auslösezeit und -strom |
| PRCD (ortsveränderliche Fehlerstrom-Schutzeinrichtung) | I            | Schutzleiterwiderstand, Isolationswiderstand, Auslösezeit und Auslösestrom                                       |

Übliche Grenzwerte, zur Bestätigung:

- Schutzleiterwiderstand: ≤ 0,3 Ω bis 5 m Leitungslänge, je weitere 7,5 m + 0,1 Ω, höchstens 1 Ω.
- Isolationswiderstand (500 V DC): SK I ≥ 1 MΩ (Heizgeräte ≥ 0,3 MΩ), SK II ≥ 2 MΩ,
  SK III ≥ 0,25 MΩ.
- Schutzleiterstrom: ≤ 3,5 mA; Heizgeräte über 3,5 kW 1 mA/kW, höchstens 10 mA.
- Berührungsstrom: ≤ 0,5 mA.
- FI/PRCD: Auslösung bei ≤ I∆n, Auslösezeit ≤ 300 ms bei I∆n.

Fragen an die Elektrofachkraft:

- Fehlt eine Geräteart, die bei uns vorkommt (z. B. Dimmer- und Switchpacks, Netzteile,
  Geräte mit mehreren Netzanschlüssen, Drehstromgeräte ohne Verteilerfunktion)?
- Schutzleiterstrom direkt, differenz oder als Ersatzableitstrom: was ist bei uns Standard?
- Wird die Leitungslänge (für den Grenzwert des Schutzleiterwiderstands) am Produkt gepflegt
  oder am Prüfplatz eingegeben?
