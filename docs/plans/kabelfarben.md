# Plan: Farbcodierung der Kabellängen

Stand: 13.11.2026. Ergebnis einer Planungsrunde (Grilling).

Viele Verleiher markieren ihre Kabel mit einer Farbe für die Länge, meist mit Isolierband an
beiden Enden. So greift man im Lager oder auf der Bühne ohne Nachmessen zum richtigen Kabel.
Heute weiß der Technikpool davon nichts. Wer packt, sucht „XLR 10 m“, und wer leiht, kennt die
Farben des Verleihers nicht.

## Entscheidungen

| Thema       | Entscheidung                                                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema      | Eins pro Org, nur nach Länge. Gilt für jedes Produkt mit `lengthCm` (Kabel und Multicores), unabhängig von Steckern und Kabelart.                             |
| Zuordnung   | Längenbereiche: „bis 1 m rot, bis 3 m blau, bis 5 m grün …“. Jede Länge bis zur letzten Grenze bekommt eine Farbe, eine längere bleibt ohne.                  |
| Farbe       | Genau eine pro Bereich, keine zweifarbigen Markierungen.                                                                                                      |
| Farbauswahl | Feste Palette der üblichen Isolierband-Farben mit übersetzten Namen. Zusätzlich eine eigene Farbe mit selbst vergebenem Namen und Farbwert (etwa „neongelb“). |
| Verleih     | Es gilt das Schema der Org, der das Gerät gehört, denn das Band klebt am Kabel. Auf einer Produktion mit Kabeln aus mehreren Orgs sieht man mehrere Schemata. |
| Rechte      | ADMIN+ der Org pflegt das Schema, auf einer Karte der Org-Seite (wie Preise und Miet-AGB).                                                                    |
| Historie    | Keine. Es gilt der aktuelle Stand, und eine Änderung wirkt sofort überall. Schon erzeugte PDFs bleiben, wie sie sind.                                         |

## Wo die Farbe auftaucht

- **Listen:** ein Farbpunkt neben der Länge. Das betrifft Geräte- und Produktlisten, den Inhalt
  eines Kits, die Ausgabe-, Rücknahme- und Prüfliste, die Inventur und das Kanban-Board.
- **Suche:** Der Farbname findet die Kabel dieser Länge, also „rot“ (bzw. „red“) oder
  „XLR rot“. Er geht in die gemeinsame Suche ein (`#lib/search.ts`), als zusätzlicher Begriff am
  Gerät. Maßgeblich ist das Schema der Org, der das Gerät gehört.
- **Legende für Ausleihende:** Die Tabelle Farbe → Längenbereich jeder verleihenden Org ist
  sichtbar für Orgs, die von ihr leihen, und auf dem Kundenlink (`/share/…`), wie die
  Handbücher. Auf der eigenen Org-Seite steht sie natürlich auch.
- **Packliste und Lieferschein:** die Farbe in der Zeile (Punkt plus Name, denn die PDFs werden
  auch schwarz-weiß gedruckt) und die Legende am Ende, wenn Kabel auf der Liste stehen.
- **Scanner-App:** ein Farbpunkt in den Listen und auf dem Gerät. Die Legende steht unter
  Einstellungen bzw. auf der Produktionsliste.

Bewusst nicht: das Case-Etikett. Der Drucker kann nur schwarz, und der Inhalt des Cases steht
dort schon mit Länge.

## Datenmodell (Skizze)

```prisma
model CableColorBand {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  /// Obere Grenze des Bereichs, einschließlich. Der Bereich beginnt hinter der
  /// nächstkleineren Grenze der Org.
  maxLengthCm    Int
  /// Schlüssel der festen Palette ("red", "blue" …) oder null für eine eigene Farbe.
  paletteKey     String?
  /// Nur für eine eigene Farbe.
  customName     String?
  customHex      String?

  @@unique([organizationId, maxLengthCm])
}
```

- Die Palette steht als Konstante im Code (`#lib/cable-colors.svelte.ts`: Schlüssel, Hex für
  hell und dunkel, Name). Als `.svelte.ts` werden die Namen von wuchale übersetzt.
- `cableColorFor(lengthCm, bands)` ist eine reine Funktion: der Bereich mit der kleinsten
  `maxLengthCm` ≥ Länge, sonst null. Server, Web und Scanner (`lib/cable_colors.dart`) rechnen
  gleich.
- Kein Feld an `Asset` oder `Product`: Die Farbe wird immer aus der Länge des Produkts und dem
  Schema der Org des Geräts berechnet, also kann sie nie veralten.
- `/api/v1`: `GET /orgs/{id}/cable-colors` liefert das Schema. Die Liste der Geräte bekommt ein
  optionales `cableColor` (Name, Hex), damit die App nicht selbst rechnen muss. Zuerst
  `openapi.yaml`, dann beide Seiten generieren.
- Für eine neue Tabelle braucht es das Präfix in `auth.ts` (etwa `CableColorBand: 'ccol'`).

## Geklärt danach

- Die Legende steht auf dem Kundenlink immer, sobald ein Kabel mit Farbe darauf ist.
- Ausleihende sehen ein Schema erst, wenn ein Verleih besteht, also auf der Produktion.
- Keine Markierung „noch nicht beklebt“.
