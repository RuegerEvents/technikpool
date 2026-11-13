# Verschachtelte Bundles, Tausch und Pack-Kisten

Konzept aus der Grilling-Runde vom 2026-11-13, nach der Inventur für die 80er-Party. Alle drei Teile
gehen ins nächste Release. Reihenfolge der Umsetzung: verschachtelte Bundles → Tausch → Pack-Kisten.

## 1. Verschachtelte Bundles

Ein festes Bundle kann in genau **einem** anderen Bundle stecken, **eine Ebene** tief (PowerCon-
Adapter-Set im FOH Case). Ein Bundle mit innerem Bundle steckt selbst in keinem.

- **Hineinlegen:** im Web-Dialog „Geräte hinzufügen“ (der Picker listet auch Bundles der Org, mit
  derselben Umzugs-Rückfrage wie Geräte) und in der App per Scan des Bundle-Etiketts im
  Bearbeiten-Modus (heute `is_bundle`).
- **Buchen:** Das äußere Bundle nimmt das innere mit (Planer, Ausgabe-Scan, Kit-Scan). Das innere
  lässt sich auch allein buchen und scannen; das äußere gilt dann als unvollständig, wie heute ein
  Kit, aus dem ein Gerät fehlt.
- **Bundle-Typ:** Die Typ-Liste zählt Produkte **und Bundle-Typen** („FOH Case: 1× PowerCon-Set,
  4× Gender Changer …“). Weitere Bundles des Typs müssen ein Bundle des inneren Typs enthalten;
  Unvollständig-Anzeige und `assertAdditionsFitType` / `assertNewInstanceMatchesType` greifen.
- **Darstellung:** Kistenetikett: das innere Set als **eine Zeile**. Packliste, Lieferschein und
  Kisten-Check: **aufgeklappt** (Set als Überschrift, darunter seine Teile).
- **Angenommen:** Das innere Bundle folgt dem Lagerort des äußeren. Die Inventur behandelt es wie
  der Kisten-Check (aufgeklappt).

## 2. Austausch statt fester Paare

Gilt für Bundle-Inhalte (DMX-Ring = je ein 5→3- und 3→5-Pol-Adapter) und für Zubehör (Netzteil am
ArtNet-Node). Geräte bleiben **fest verknüpft**; die bestehende Stellvertreter-Regel (`findStandIns`
in `checkout.ts`, heute nur für lose gebuchte Geräte) wird auf beide ausgeweitet.

- **Wann:** beim **Ausgeben** (Ausgabe-Liste Web/App, Scan-Session) und im **Kisten-Check**. Nicht
  bei der Rücknahme, nicht in der Inventur (die ändert weiterhin nie ein Gerät).
- **Wer:** ein Gerät desselben Produkts und derselben Org, das verfügbar ist (nicht defekt, nicht
  in Wartung, nicht unterwegs).
- **Wie:** Gegentausch. Steckte das gescannte Gerät in einem anderen Bundle / an einem anderen
  Gerät, bekommt dieses das ersetzte; war es lose, wird das ersetzte lose. Ohne Rückfrage, mit
  Hinweis („getauscht mit Ring 3“) und Eintrag in der Historie beider Geräte.
- **Abwahl:** pro Produkt „nicht austauschbar“ (kalibriertes Objektiv zu genau dieser Kamera), unter
  `productControl`, mit Eintrag im Katalog-Protokoll.

### 2b. Ganzes Kit statt des gebuchten (nachgetragen)

Gebucht ist Ring 1, gescannt wird das Etikett von Ring 2: **die Buchung wechselt auf Ring 2**, beide
Kits behalten ihren Inhalt (Stellvertreter auf Kit-Ebene, kein Umbau). Bedingungen wie beim
Gerätetausch: gleicher Bundle-Typ, gleiche Org, das gescannte Kit ganz verfügbar (nichts unterwegs,
nicht für dieselben Tage gebucht), Produkt-/Typ-Abwahl respektiert. Hinweis im Scan („Ring 2 statt
Ring 1“) und Eintrag in der Historie. Gilt auch für innere Kits (anderes PowerCon-Set im FOH Case).
**Nur solange aus dem gebuchten Kit noch nichts ausgegeben ist** — ist es durch Gerätetausch schon
angefangen (z. B. A2 per Adapter-Scan in Ring 1), lehnt der Kit-Scan mit Hinweis ab („Ring 1 ist
schon angefangen – Adapter einzeln scannen“). Gerätetausch (Etikett eines Geräts) und Kit-Tausch
(Etikett eines Kits) hängen an verschiedenen Etiketten und kommen sich sonst nicht in die Quere;
ein Gerät, dessen eigenes Kit ebenfalls gebucht ist, geht mit diesem raus statt zu tauschen.
Umsetzung nach Teil 3, weil beide den Kit-Scan beim Ausgeben anfassen.

## 3. Pack-Kisten (Transflex & Co.)

**Ein Merkmal „Behälter“ für beide Fälle** (Ergänzung vom 2026-11-13): Ein Behälter-Gerät **in
einem festen Bundle** ist dessen Kiste, und **seine Inventarnummer ist die Nummer des Bundles**: auf
dem Kistenetikett, und ihr Scan meint überall das ganze Kit (Ausgabe, Rücknahme, Kisten-Check,
Inventur, Hineinlegen per Scan). Ein eigener Bundle-Tag bleibt die Ausnahme für Bundles ohne Kiste
(DMX-Ringe haben gar keinen Code); hat ein Bundle beides, druckt das Etikett den eigenen Tag. Nur die
leere Kiste bucht man über die Geräteseite oder nach dem Herausnehmen — keine Rückfrage beim Scan.
Ein Behälter-Gerät **ohne Bundle** ist eine Pack-Kiste wie unten.

Eine Pack-Kiste ist ein **normales Gerät** mit Etikett, dessen Produkt das Merkmal
**„Pack-Behälter“** trägt. Inhalt hat sie nur **während einer Produktion** (Zuordnung an der
Buchung, nicht am Gerät).

- **Packen** (App und Web, Ausgabe-Liste): Kiste scannen, dann alles, was hineinkommt. Der Scan einer
  anderen Kiste wechselt, „Kiste zu“ beendet; die offene Kiste steht sichtbar oben. Scannt man bei
  offener Kiste eine andere Kiste, fragt die App: hinein oder wechseln? Im Web zusätzlich Zuordnen
  per Auswahl in der Liste.
- **Inhalt:** alles — Geräte, Kabel per Anzahl, ganze Bundles und **andere Kisten, beliebig tief**
  (ohne Kreise).
- **Listen:** Lieferschein, Packliste und Ausgabe-Liste gruppieren **nach Kiste** („Kiste 3
  (Transflex 60×40)“, verschachtelt), der Rest steht unter „lose“ in der heutigen Sortierung.
- **Etikett:** pro Produktion druckbar (App): Produktionsname, Kistennummer, aktueller Inhalt.
- **Rücknahme:** Der Scan der Kiste bucht die Kiste zurück und öffnet die **Checkliste** ihres
  Inhalts; Nicht-Abgehaktes bleibt ausgegeben. Mit der Rücknahme der Produktion ist die Kiste leer.
- **Abrechnung:** wie jedes Gerät — hat ihr Produkt einen Preis, steht sie auf Angebot und Rechnung.
- **Angenommen:** Der Scan einer Kiste auf der Ausgabe-Liste bucht sie selbst mit aus, auch
  ungebucht (wie die Namenssuche beim Packen).
