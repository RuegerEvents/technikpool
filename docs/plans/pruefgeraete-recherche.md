# Gerätetester mit Echtzeit-Anbindung an Technikpool

Stand der Recherche: 10.11.2026. Ziel ist ein Gerätetester für die Wiederholungsprüfung nach DGUV V3 / DIN VDE 0701-0702 (heute DIN EN 50678 / EN 50699), den eine Bridge (Pi, Laptop oder Tablet) live steuert. Technikpool bleibt Master der Stammdaten.

Legende für jede Aussage:

- **[P]** aus einer Primärquelle gelesen (Herstellerhandbuch, Herstellerdatenblatt, Protokolldokument), Fundstelle angegeben
- **[H]** Händlerangabe (datatec, Bürklin, RS, Conrad …)
- **[I]** meine Schlussfolgerung, nicht belegt

## Kurzfassung

Öffentlich dokumentiert und ohne Herstellersoftware nutzbar ist nur ein Fernsteuerprotokoll, das **Metrel Black Box protocol**. Es läuft auf MI 3360 OmegaPAT XA, MI 3365 OmegaEE XD und MI 3325 MultiServicerXD. Es ist ein Textprotokoll über USB, RS232, Bluetooth oder Ethernet. Der PC startet Einzelmessungen oder ganze Auto-Sequenzen und bekommt jeden Parameter, Grenzwert, Messwert und jede Bewertung zeilenweise zurück. Das Protokoll ist kostenlos, und das komplette Benutzerhandbuch (v1.7.4) liegt öffentlich zum Download. Für eine Bridge auf einem Raspberry Pi ist das der einfachste Weg.

**Gossen Metrawatt SECUTEST** (ST BASE / ST PRO / SECULIFE ST BASE25) hat eine echte Fernsteuerung über USB. Laut Handbuch gibt Gossen die Schnittstellenbefehle aber nur "auf Anfrage" heraus, und offiziell nutzt sie nur IZYTRONIQ. Voraussetzung ist die kostenpflichtige Datenbankerweiterung DB+ (Z853R). Technisch geht es also, ob es für eigene Software klappt, hängt von Gossen ab. Gossen ist in Deutschland und in der Veranstaltungstechnik am weitesten verbreitet.

**Benning ST 760+** hat LAN, WLAN und Bluetooth, eine Fernbedienung per Bildschirmspiegelung (MS Cerhost) und Netzwerkzugriff auf die Gerätedatenbank (SQLite-Datei). Ein Befehlsprotokoll habe ich nicht gefunden. Live-Integration ginge höchstens über das Abfragen der Datenbankdatei, und dieser Weg ist nicht dokumentiert.

**Fluke 6500-2, Beha-Amprobe GT-900, Seaward Apollo, Megger PAT4xx, Kyoritsu** gehen nur über Dateien (USB-Stick, CSV, Herstellersoftware) oder über herstellereigene Cloud/Bluetooth-Synchronisation. Keiner dieser Wege ist eine dokumentierte Echtzeitschnittstelle. Seaward, Megger und Kyoritsu sind außerdem auf UK/AU-Normen ausgelegt und in Deutschland kaum verbreitet.

Meine Empfehlung steht am Ende. Kurz gesagt nehmt ihr Metrel MI 3365 (oder MI 3360) mit A 1422 als Gerät mit der sichersten Echtzeit-Integration, oder SECUTEST ST PRO mit DB+, wenn Gossen euch die Befehlsliste vor dem Kauf schriftlich gibt.

---

## 1. Metrel (MI 3360 OmegaPAT XA, MI 3365 OmegaEE XD, MI 3325 MultiServicerXD, BetaPAT)

### 1.1 Fernsteuerung: Black Box protocol

- **[P]** Metrel-Leaflet "SW 1403 Black Box protocol". Der PC ist Master und schickt Befehle, das Gerät antwortet. Das Protokoll läuft über Ethernet, RS232, USB und Bluetooth, unterstützt "alle Messfunktionen des jeweiligen Geräts, Einzelmessungen und Auto-Sequenzen", ist "kostenlos, keine zusätzlichen Lizenzen". Als unterstützte Geräte nennt das Leaflet unter anderem **MI 3325** und **MI 3360**. Für den PAT-Einsatz wird es ausdrücklich erwähnt.
  - <https://metrel.si/support/confluence/mpd/files/en/15401254/73072641/1/1673512917000/Single_2022_SW+1403+PC+SW+Black+Box+protocol_Ang.pdf>
- **[P]** Die Wissensdatenbank-Seite ordnet die PAT-Messgruppen den Geräten **MI 3325, MI 3340, MI 3360, MI 3365, MI 3394** zu ("without 3309 or 3310", also ohne BetaPAT/kleine Geräte). Dort liegen auch das Handbuch, das Tool "DataDisplay FrameWork Visualizer" (liefert die numerischen IDs von Messungen, Parametern und Grenzwerten) und ein Terminalprogramm.
  - <https://metrel.si/support/confluence/mpd/en/applications-and-tips/black-box-protocol>
- **[P]** Benutzerhandbuch _Black Box protocol Ver. 1.7.4_ (29 Seiten, 2022), öffentlich:
  <https://metrel.si/support/confluence/mpd/files/en/15401254/59703304/1/1660805671000/Black_Box_protocol_ANG_Ver_1.7.4.pdf>

Inhalt des Handbuchs, soweit für uns relevant (alles **[P]**):

- Format `BB; X1; X2; …` als ASCII-Zeilen mit CR-Abschluss, Groß/Kleinschreibung zählt.
- `BB; ENABLE = 1; PASSWORD = …; DEBUG_TEXTS; ACTIONS` schaltet den Black-Box-Modus ein. Das Passwort wird im Account Manager des Geräts gesetzt.
- `BB; START_SINGLETEST 118; P4 = 500 V; P69 = 2 s` startet eine Einzelmessung mit Parametern und Grenzwerten (`L# = …`).
- `BB; START_AUTOTEST; NAME = <Sequenzname>; SEND_ST_INFO = AT_STEP_INFO; SAVE_RESULT` startet eine im Gerät gespeicherte Auto-Sequenz. `SAVE_RESULT` legt die Ergebnisse zusätzlich im Gerätespeicher ab.
- Antworten laufen live mit:
  `BB; ST; START 80`, `BB; ST; PARAMETER 66 = 4 A`, `BB; ST; LIMIT 43 = 0.1 Ohm`,
  `BB; ST; RESULT 135 = 0.05 Ohm; STATUS 135 = pass`, `BB; ST; STATUS = pass`, `BB; ST; END`,
  dazu `BB; AT; STATUS = fail` / `BB; AT; END` für die ganze Sequenz. Mit `INTERMEDIATE_RESULTS` kommen auch Zwischenwerte (Live-Anzeige der RPE-Messung beim Bewegen der Leitung).
- Sichtprüfung: `BB; IS; CHECK_BOX; ID = 30; STATUS = pass` setzt die Checkboxen einer Sichtprüfung **vom PC aus**. Die Sichtprüfung kann also im Scanner/Web-UI stattfinden.
- Dialoge des Geräts kommen als `BB; MSG 0; KEYBOARD 1; NAME = Name`. Der PC antwortet `BB; MSG 0; TEXT = <Text>`. So schiebt der PC während der Sequenz **Asset-ID, Bezeichnung und Prüfintervall in Echtzeit ins Gerät** (Beispiel im Handbuch: Retest-Periode). Das Gerät meldet die Gerätedaten per `BB; AT; APPLIANCE_INFO; ID = …; NAME = …; RETEST_PERIOD = 12` zurück.
- `ACTION = Proceed | Repeat | Stop_test | Break`, `KEY = enter|esc|…`, `HELP; ACTION`, `STATUS`, `RESET`, `WAKE_UP`.
- Sicherheit: Touch-Pretest (`TOUCH_TEST = REQUIRED` verlangt einen Tastendruck am Gerät). Hochspannungsprüfungen brauchen `HV_PASSWORD`. Das Handbuch weist ausdrücklich darauf hin, dass der Programmierer für die Sicherheit verantwortlich ist.

Zwei Grenzen:

- **[P]** Das Protokoll liefert keine PDF. Das Prüfprotokoll erzeugt die Bridge oder Technikpool selbst aus den Messwerten. Alternativ speichert das Gerät per `SAVE_RESULT`, und Metrel ES Manager erzeugt den Bericht später.
- **[P]** Eine Auto-Sequenz muss im Gerät vorhanden sein (Gruppe gewählt, Name gültig, Workspace im Memory Organizer gesetzt). Neue Sequenzen spielt man über Metrel ES Manager (oder das SDK) ins Gerät. Das ist ein einmaliger Schritt pro Prüfablauf, nicht pro Prüfung. Alternativ baut die Bridge die Sequenz selbst aus `START_SINGLETEST`-Aufrufen.
- **[I]** Die Messwerte sind Strings mit Einheit (`>199.9 MOhm`, `0.05 Ohm`). Der Parser muss `>`/`<`, Präfixe (m, k, M) und `Percent` behandeln.

### 1.2 SDK und PC-Software

- **[P]** Metrel SDK (SW 1203). Das ZIP ist kostenlos (Paketname `ion_sdk_15.2.60…_netstandard2.0_Client.zip`, also .NET Standard 2.0). Es tauscht Daten außerhalb von Metrel ES Manager aus und enthält den Black-Box-Zugang.
  <https://www.metrel.si/support/confluence/mpd/en/applications-and-tips/metrel-sdk/metrel-sdk-description-and-sw-package>
- **[P/H]** Für Up- und Download (Strukturen/Objekte ins Gerät, Ergebnisse heraus) brauchen die neuen Geräte eine SDK-Lizenz (Metrel-Lizenzseite: "SDK License Key P 1104"). Bürklin listet "P 1203" für 1.016,26 € netto. Die Teilenummern widersprechen sich, also beim Händler nachfragen.
- **[I]** .NET Standard 2.0 läuft grundsätzlich unter .NET 8 auf Linux/ARM, also auf einem Pi. Ob die USB-Treiber/Transportschicht dort funktioniert, ist nicht belegt. Für Black Box braucht man das SDK nicht, eine serielle Schnittstelle reicht.
- Metrel ES Manager (MESM) ist die normale Windows-Software, aMESM die Android-App für QR-Codes und Sequenzen **[P]** (Datenblatt MI 3360/MI 3365). Eine API von MESM habe ich nicht gefunden.

### 1.3 Messumfang, Drehstrom, RCD, Barcode

- **MI 3360 OmegaPAT XA [P]** (Datenblatt, tester.co.uk): RPE 200 mA und 10 A/25 A je nach Variante, Isolation, Ersatzableitstrom (auch "S"), Differenzstrom, PE-Ableitstrom, Berührungsstrom, **PRCD** (2-/3-polig, K/Di, S, PE-Sonde), **RCD Typ A, AC, B, B+, F**, Prüfung 3-phasiger Geräte und mobiler Verteiler mit PRCD. VDE 0701-0702, IEC 62353, IEC 60974-4. Barcode/QR-Scanner und RFID, laut Datenblatt "in Bluetooth- und kabelgebundener Ausführung". Anschlüsse für PC und Barcodescanner, USB 2.0.
  <https://tester.co.uk/files/get/download/id/5916/metrel-mi3360-omegapat-xa-pat-tester-datasheet.pdf>
- **Drehstrom/CEE [P]**: A 1322 / **A 1422 Active 3-phase Adapter (Plus)** hängt am Kommunikationsport des Geräts. Dazu die passiven Adapter A 1316 (CEE 16 A), A 1317 (CEE 32 A) und CEE-5P-Adapter.
- **MI 3365 OmegaEE XD [P]** (Brochure 2024): neueres Gerät, ausdrücklich nach **EN 50678 (VDE 0701) und EN 50699 (VDE 0702)**. 0,2/10/25 A, alle Ableitstromverfahren, PRCD (PRCD-S, PRCD-S pro, K), RCD-Tests, EV-Mode-2-Kabel, Zusammenspiel mit A 1422. Barcode/QR, NFC, RFID (nur lesen).
  <https://www.metrel.si/assets/Metrel/PDF_dokumentacija/Brochure/Ang/MI_3365_OmegaEE_XD/Ang/Brochure_MI%203365%20OmegaEE%20XD_2024_Ang_Main%20features.pdf>
- **[P]** Black-Box-Unterstützung des MI 3365 steht nur in der Messungstabelle der Wissensdatenbank, nicht im (älteren) Leaflet. Die physischen Schnittstellen des MI 3365 standen in den gelesenen Unterlagen nicht im Detail. **Vor dem Kauf bestätigen lassen.**
- **MI 3325 MultiServicerXD**: PAT- und Installationstester, Black Box laut Leaflet **[P]**. Für eine reine PAT-Station ist er weniger passend **[I]**.
- **BetaPAT (MI 3309)**: laut Wissensdatenbank ausgenommen ("without 3309 or 3310") **[P]**. Damit ist er nicht steuerbar.
- **[H]** Laut Metrel-Shop ist der MI 3360 nur noch in "limited quantity" verfügbar. Nachfolger dürfte der MI 3365 sein **[I]**.

### 1.4 Open Source

- Ich habe kein öffentliches Black-Box-Projekt gefunden. `JanSustar/metrelSDK` (C#, 2025, leer beschrieben) und ein privater NuGet-Feed tauchen auf GitHub auf, ohne erkennbare Doku. Das Protokoll ist aber einfach genug, dass man keinen Reverse-Engineering-Aufwand hat **[I]**.

### 1.5 Preise

- **[H]** MI 3360 bei Bürklin 2.499 € brutto (ca. 2.100 € netto), MI 3360 F 3.153,50 €. **A 1422 3.094 €** (Bürklin). MI 3365 Set bei Voelkner 2.276 € brutto (ca. 1.910 € netto), bei Conrad 2.925 € brutto, MI 3365 25A 3.415 € brutto.
- **[I]** In der deutschen Veranstaltungstechnik ist Metrel seltener als Gossen und Benning, aber bei Prüfdienstleistern bekannt.

---

## 2. Gossen Metrawatt SECUTEST ST BASE(10) / ST PRO / SECULIFE ST BASE(25)

### 2.1 Fernsteuerung

- **[P]** Bedienungsanleitung SECUTEST ST BASE(10)/PRO und SECULIFE ST BASE(25), Ausgabe 1/10.20, Kap. 15.5 "Remote Control Interface". Fernsteuerung "via the USB interface with the help of IZYTRONIQ". Voraussetzung ist Merkmal KB01 bzw. die kostenpflichtige Erweiterung **Z853R SECUTEST DB+**. Messwerte erscheinen dann nicht auf dem Display, sondern gehen über die Schnittstelle. In den technischen Daten steht: _"In the remote operating mode, the test instrument can be controlled via the USB slave data interface. **Pertinent interface commands are available upon request.**"_
  <https://media.distrelec.com/Web/Downloads/_m/an/Gossen_Metrawatt-M707A_eng_man.pdf>
- **[P]** Kap. 11.2: Bei Fernsteuerung (IZYTRONIQ "IZY-Remote-Sequenzen") trägt der Ersteller der Sequenz die Verantwortung für die Normkonformität.
- **[P]** IZYTRONIQ-Handbuch (3-349-999-01, 9/12.24), Kap. 27 "Remote-Funktion". IZYTRONIQ sendet dem Gerät über USB oder Bluetooth Steuerbefehle, die Messwerte kommen per Polling. Das Handbuch warnt vor Datenverlust bei hoher CPU-Last. Die Remote-Funktion gibt es ab **IZYTRONIQ BUSINESS Professional**. Ohne DB+ lassen sich Daten nur auslesen, nichts ins Gerät schreiben.
  <https://www.datatec.eu/media/e6/c3/e4/1740493814/Gossen-Metrawatt-S101V-HB-1_DE_(1).pdf>
- **[P]** Datenblatt SECUTEST ST BASE/PRO: USB-Slave für PC/Fernsteuerung, 2× USB-Master für Barcode-/RFID-Leser (HID), Tastatur, Drucker, USB-Stick. Bluetooth 2.1 nur mit Merkmal M01 bzw. ST PRO BT. "Push-Print" schickt Daten direkt zu IZYTRONIQ.
  <https://www.meilhaus.de/cosmoshop/default/articleMedia/m708e/en/Datasheet_GMC-I_SECUTEST-STBASE-PRO_en.pdf>
- **[H/Forum]** Auf mikrocontroller.net heißt es, die alten SECUTEST mit RS232 hätten ein dokumentiertes Protokoll, die aktuellen ein serielles Protokoll über USB, "das aber nicht dokumentiert zu sein scheint".
  <https://www.mikrocontroller.net/topic/555251>

Bewertung **[I]**: Die Hardware kann alles, was wir brauchen, inklusive Live-Werten. Das Hindernis ist rechtlich und organisatorisch, denn der Befehlssatz gibt es nur auf Anfrage, vermutlich mit NDA, und eventuell nur für Partner. Ohne diese Doku bleibt nur Reverse Engineering des USB-Verkehrs zwischen IZYTRONIQ und Gerät. Für ein Prüfgerät mit Netzspannung an der Prüfdose würde ich das nicht tun.

### 2.2 Stammdaten ins Gerät

- **[P]** Offiziell gehen Objekte, Kataloge und Sequenzen über IZYTRONIQ (USB/Bluetooth) oder USB-Stick ins Gerät, nur mit DB+.
- **[P]** IZYTRONIQ importiert Stammdaten aus Dateien, je nach Variante XML, CSV, IZY, ZIP (Kap. 13.3). Das Modul PC DOC IQ bietet eine Excel-Schnittstelle.
- **[I]** Live per eigener Software ginge es nur mit dem Befehlssatz. Ohne ihn wäre der Ablauf Technikpool → Export-Datei → IZYTRONIQ-Import → Gerät. Das ist Dateiaustausch, also genau das, was ihr nicht wollt.

### 2.3 IZYTRONIQ als Zwischenschicht

- **[P]** Ich habe keine API, keine Webhooks und keine Plugin-Schnittstelle gefunden. Die ENTERPRISE-Varianten nutzen ein Backend mit **Microsoft SQL Server 2016+**, Anwendungsserver und Synchronisierungsdienst (Windows Server).
- **[I]** Theoretisch könnte eine Bridge das SQL-Schema lesen, also neue Prüfungen pollen, Messwerte und PDF-Anhänge holen. Das Schema ist undokumentiert, ändert sich vermutlich mit Updates, und ENTERPRISE ist teuer. Das ist eine Notlösung, kein Echtzeitweg.

### 2.4 Messumfang

- **[P]** RPE 200 mA, 10 A (G01), 25 A (G02, SECULIFE ST BASE25). Isolation, Schutzleiterstrom und Berührungsstrom (Ersatzableit-, Differenz-, Direktverfahren), **PRCD** (PRCD-S, PRCD-K, Auslösezeit tPRCD für 30 mA). Einen allgemeinen RCD-Test (Typ A/B in Verteilern) nennt das Datenblatt nicht. Dafür nimmt man bei Gossen typischerweise einen PROFITEST **[I]**.
- **[P]** CEE und Drehstrom über Z745A CEE-Adapter (16 A 5-polig, 32 A 5-polig, 16 A 3-polig, passiv: RPE, Riso, Ersatzableitstrom), **VL2E** (bis CEE 32 A), **AT16-DI / AT32-DI** (aktive Differenzstromadapter für CEE 16/32 A: RPE, Riso, Ersatz-, Differenz-, Direktverfahren, Funktionsprüfung).
- **[P]** Barcodescanner Z751A (1D/2D, USB), Barcodedrucker Z721E, RFID SCANBASE Z751E.

### 2.5 Open Source

- **[P]** `fablabnbg/gossen_m701x` (Python, Fab Lab Nürnberg) ist per Reverse Engineering entstandener Code für die **alte** SECUTEST-Familie M701x. <https://github.com/fablabnbg/gossen_m701x>
- **[P]** `mxxmxn/GMC-Opentest` (Python, GPL-3.0) liefert Interface und Doku für SECUTEST 07xx / SII / SIII. <https://github.com/mxxmxn/GMC-Opentest>
- **[P]** `Ujap1994/Gossen-Metrawatt-Secutest-0701S-…` ist ein komplettes Prüfprogramm für SECUTEST 0701S/0702S über RS232, mit PC-gesteuerter Messung (`MES!`/`WER?`) und Ergebnisübernahme (`PRO?`), SQLite. <https://github.com/Ujap1994/Gossen-Metrawatt-Secutest-0701S-Pr-f--und-Datenbank-Programm>
- **[P]** Centix (kommerzielles Asset-Management) liest alte SECUTEST über RS232 und neue (BASE/PRO IQ) nur über `.secu`-Exportdateien (XML) vom USB-Stick. <https://www.centix.com/en/application/pat-testers/gossen-metrawatt/>
- **[I]** Für die aktuelle Generation gibt es kein öffentliches Projekt. Ein gebrauchter SECUTEST 0701S/0702S mit RS232 wäre steuerbar, kennt aber die heutigen Normabläufe nicht (EN 50678/50699).

### 2.6 Preise und Verbreitung

- **[H]** SECUTEST PRO (M7050) bei RS ca. 3.190 bis 3.265 € netto, Z853R DB+ 708,88 € netto (bei einigen Paketen enthalten). IZYTRONIQ BUSINESS Professional liegt einigen Paketen bei (M708B/M708C laut Datenblatt).
- **[I]** In Deutschland ist das der Marktführer, auch bei Verleihern und Prüfdienstleistern in der Veranstaltungstechnik.

---

## 3. Benning ST 755+ / ST 760+ (und ST 750A)

- **[P]** Benning-Katalog 2021 (über datatec). Schnittstellen WLAN, Bluetooth, 4× USB, Mini-USB, RJ45. "Touch Screen lässt sich auf PC oder Tablet spiegeln", "Externer Prüfdatenzugriff auf netzwerkgekoppelte Gerätetester". PC-Win ST 750-760 bietet eine "Suchfunktion für im Netzwerk eingebundene Gerätetester mit Speicherzugriff" und "Gerätetester fernsteuern über MS Cerhost®". Prüflingsdatenbanken importiert man aus fremden Systemen über MS Excel.
  <https://www.datatec.eu/media/f6/0b/bb/1682497629/Benning-Katalog-2021-BRO-1_DE.pdf>
- **[P]** PC-Win-Handbuch: Die Datenbank des ST 755/760 ist eine `*.db`-Datei auf der SD-Karte (ST 750: `*.sdf`). PC-Win liest sie über USB, SD-Karte oder Netzwerk.
  <https://www.datatec.eu/media/73/8c/c5/1708336809/Benning-047002-HB-1_DE.pdf>
- **[P]** Das Open-Source-Tool `tobyw121/Benning_ST755_ST760_GUI` öffnet diese `.db` mit `sqlite3`, das Format ist also SQLite. <https://github.com/tobyw121/Benning_ST755_ST760_GUI>
- **[I]** "MS Cerhost" ist der Remote-Desktop von Windows CE, also Bildschirmspiegelung und keine Befehlsschnittstelle. Ein dokumentiertes Fernsteuerprotokoll habe ich nicht gefunden. Machbar wäre, dass die Bridge über das Netzwerk die SQLite-Datenbank des Geräts liest bzw. Prüflinge hineinschreibt. Das ist undokumentiert und riskant, weil das Gerät gleichzeitig darauf schreibt. Ob der Netzwerk-"Speicherzugriff" eine SMB-Freigabe ist, weiß ich nicht.
- **Messumfang [P/H]**: RPE mit >600 mA und 10 A, Riso 100 bis 1000 V, Schutzleiter-/Berührungsstrom in Differenz-, Direkt- und Ersatzverfahren, **PRCD S, S+, K (2-/3-polig)**, **RCD AC, A, F, B, B+ in mobilen Stromverteilern**, Schweißgeräte (ST 760). Drehstrom über die aktiven Adapter **MA 4** (bis CEE 32 A: RPE, Riso, Ersatzableit-, Differenz-, Direktstrom, Drehfeld, PRCD) und MA 2-16 (CEE 16 A). Laut Händler ist EN 50678/50699 "vorbereitet" **[H]**.
- **Barcode [H]**: USB-1D-Scanner 009369, im Set enthalten.
- **Preis [H]**: ST 760+ bei datatec 1.892,40 € netto. PC-Win 047002 kommt extra.
- **[I]** Sehr verbreitet bei Elektrikern und Verleihern. Für Verteiler mit eingebauten RCDs ist der Messumfang ab Werk der beste der Liste, eine Echtzeit-Integration ist aber nicht belegt.
- Ältere ST 725: Die Druckerschnittstelle gibt den Bericht als ASCII über RS232 aus (9600 8N1, CP437). Das ist eine Ausgabe nach der Prüfung, keine Steuerung **[Forum]**.

---

## 4. Fluke 6500-2 / 6200-2

- **[H]** Datenübertragung per USB-Port und USB-Stick, Software TruTest bzw. früher Fluke DMS. Nach datatec nur RPE < 200 mA, **keine 10/25 A**, Riso 250/500 V, Differenzstrom, PRCD-A, keine RCD Typ B. Barcodescanner SPSCAN6000 (USB) 517,92 €. Preis 2.009 € netto.
  <https://datatec.eu/de/en/fluke-fluke-6500-2-de>
- **[P]** Fluke-FAQ KA-01091 beschreibt den CSV-Export (feste Spalten: Ort, Kunde, Prüfer, Datum, Gerätenummer, RPE×4, Riso×4, Ersatzableit-/Berührungsstrom, Leistung, RCD …). Das ist Dateiexport. <https://my.fluke.com/en-US/article/KA-01091>
- **[I]** Ein Fernsteuerprotokoll habe ich nicht gefunden. Für Drehstrom/CEE und 10-A-Schutzleiterprüfung ungeeignet, scheidet also aus.

## 5. Beha-Amprobe GT-900

- **[H]** USB 2.0 zum PC (Messwerte heraus, Prüfdatenbank und Prüfabläufe hinein), 2× USB-HID für Tastatur, Barcodescanner, Bluetooth-Dongle. PC-Software von Fluke (Lite/Advanced).
  <https://content.voltimum.com/at/27919/gt-900.pdf>
- **[I]** Keine dokumentierte Fernsteuerung. Datenbank-Sync über Herstellersoftware. Die Marke gehört zu Fluke und ist in Deutschland rückläufig.

## 6. Seaward Apollo 600+ / 500+

- **[P]** Seaward-Support: Die Apollo+ übertragen Daten seit 2023 per **WLAN-Hotspot** statt Bluetooth, an PATGuard 3/Elite bzw. PATGuard Cloud. Bluetooth gibt es für Scanner und Drucker.
  <https://seaward.com/de/support/pat-testing/380a926-apollo-600-plus/specifications-and-manuals/814-how-to-download-and-upload-using-the-wifi-hotspot-feature-on-the-apollo-plus>
- **[H]** Normen laut Händler: IET Code of Practice 5th Ed., BS EN 50699. VDE 0701-0702 habe ich nicht belegt gefunden, ebenso wenig Drehstrom. Preis ca. 1.270 bis 1.370 £ netto.
- **[P]** Open Source arbeitet nur mit Dateien: `XBigRiceH/SeawardSuperStringParser` (.sss-Dateien), `fluffycheese/seaward-pat-converter` (TXT→CSV), `BrusherTheHusky/SeawardPATImporter` (→ Google Sheets).
- **[P]** Current RMS (Vermietsoftware) bindet PAT-Ergebnisse über PATorganiser bzw. PATGuard Cloud an, abgeglichen über die Asset-Nummer. Das ist Cloud-Sync nach der Prüfung, keine Gerätesteuerung. <https://help.current-rms.com/en/articles/3822294-how-does-testing-inspection-work>
- **[I]** Für Deutschland und Drehstrom ungeeignet. Interessant ist nur das Muster "Vermietsoftware gleicht über die Asset-Nummer ab".

## 7. Megger PAT420/450

- **[H]** Daten gehen über Bluetooth/USB an PowerSuite / CertSuite PAT. Ich habe keine öffentliche API gefunden. Megger bietet APIs für andere Geräte an (TTRU3), für PAT nicht belegt. UK-Fokus.

## 8. HT Italia / HT Instruments

- **[H]** HT-Power 0701/0702 3P CL ist ein Drehstrom-Gerätetester für ca. 8.455 €. Dazu gibt es die Software "HT-Power Remote-ST" (2006420, 780 €), die als "Fernsteuerungs- und Datenbanksoftware für VDE-Prüfgeräte" beschrieben wird. Ein Protokoll oder SDK habe ich nicht gefunden. MultiTest HT700 hat die Software HT-Multi und einen RS232-Barcodescanner.
- **[I]** Wegen der Fernsteuerung und des eingebauten Drehstroms bei HT nachfragen, ob Remote-ST auf einem offenen Protokoll beruht. Der Preis ist hoch.

## 9. Kyoritsu KEW 6202

- **[H]** Abgekündigt, Handgerät mit vier Funktionen, ohne Bluetooth. KEW Smart (Bluetooth-App) gibt es nur für andere Modelle (6516BT, 4202), die 6205PRO ist für AS/NZS 3760. Für VDE und Integration nicht relevant.

## 10. Chauvin Arnoux

- **[H]** DataView unterstützt vor allem Netzanalysatoren und Logger. Für Gerätetester (C.A 6155 o. ä.) habe ich keine Fernsteuerdoku gefunden. **Nicht verifiziert**, in Deutschland bei Gerätetestern kaum vertreten.

## 11. Was sonst für Fernsteuerung auffällt

- **Metrel MI 3394 CE MultiTesterXA** hat Ethernet und Black Box. Gedacht ist es für Fertigungslinien (Leaflet-Beispiel mit zwei MI 3394 an einem PC). Es ist kein Gerätetester für den Einsatz in der Halle, aber derselbe Protokollstack **[P]**.
- **Fertigungsprüfplätze** (Schleich, Chroma, Seaward HAL u. ä.) haben üblicherweise SCPI/LAN, sind aber stationär, teuer und nicht auf Wiederholungsprüfung mit Sichtprüfung und CEE-Verteilern ausgelegt **[I, nicht recherchiert]**.

---

## Vergleichstabelle

| Gerät                                     | Physische Schnittstelle                                              | Fernsteuerprotokoll                | Doku öffentlich?          | Stammdaten live ins Gerät                          | Messwerte live heraus                            | CEE 16/32 A / Drehstrom                  | PRCD / RCD                               | Barcode                   | Preis netto (ca.)                    | Verbreitung DE      |
| ----------------------------------------- | -------------------------------------------------------------------- | ---------------------------------- | ------------------------- | -------------------------------------------------- | ------------------------------------------------ | ---------------------------------------- | ---------------------------------------- | ------------------------- | ------------------------------------ | ------------------- |
| **Metrel MI 3365 OmegaEE XD**             | USB, RS232, BT, (Ethernet?) laut Protokoll-Doku, Gerätedetails offen | Black Box (ASCII)                  | **ja** [P]                | ja, über MSG/KEYBOARD-Antworten [P]                | ja, Zeile für Zeile, inkl. Zwischenwerte [P]     | ja, A 1422 aktiv, A 1316/1317 passiv [P] | PRCD alle Typen, RCD [P]                 | QR/Barcode, NFC, RFID [P] | ~1.900 bis 2.500 € + A 1422 ~2.600 € | mittel              |
| **Metrel MI 3360 OmegaPAT XA**            | USB 2.0, RS232, BT                                                   | Black Box                          | **ja** [P]                | ja [P]                                             | ja [P]                                           | ja, A 1322/A 1422 [P]                    | PRCD alle, RCD A/AC/B/B+/F [P]           | ja, BT und Kabel [P]      | ~2.100 € (+ A 1422)                  | mittel, Restbestand |
| **Gossen SECUTEST ST PRO / BASE10 + DB+** | USB-Slave, BT (M01)                                                  | proprietär, "auf Anfrage"          | **nein**, auf Anfrage [P] | nur über IZYTRONIQ, eigene SW nur mit Befehlsliste | über IZYTRONIQ ja (Polling) [P], eigene SW offen | ja, Z745A, VL2E, AT16-DI, AT32-DI [P]    | PRCD ja, RCD in Verteilern nicht genannt | 1D/2D USB, RFID [P]       | ~3.200 € + DB+ 709 €                 | **sehr hoch**       |
| **Benning ST 760+**                       | LAN, WLAN, BT, USB                                                   | keins gefunden, Cerhost-Spiegelung | nein                      | nur über PC-Win / SQLite-Datei [I]                 | nein, höchstens DB-Polling [I]                   | ja, MA 4 / MA 2-16 [P]                   | PRCD S/S+/K, RCD AC/A/F/B/B+ [P]         | USB 1D [H]                | ~1.900 €                             | hoch                |
| **Fluke 6500-2**                          | USB                                                                  | keins gefunden                     | nein                      | nein                                               | nein (CSV-Export) [P]                            | kein 10-A-RPE, kein Drehstrom belegt     | PRCD-A                                   | USB [H]                   | ~2.000 €                             | mittel              |
| **Beha-Amprobe GT-900**                   | USB                                                                  | keins gefunden                     | nein                      | über PC-Software                                   | nein                                             | nicht geprüft                            | PRCD (laut Presse)                       | USB HID [H]               | k. A.                                | gering              |
| **Seaward Apollo 600+**                   | WLAN-Hotspot, BT                                                     | keins gefunden                     | nein                      | über PATGuard                                      | nein (Datei/Cloud)                               | nicht belegt                             | k. A.                                    | BT [P]                    | ~1.300 £                             | sehr gering         |
| **Megger PAT4xx**                         | BT, USB                                                              | keins gefunden                     | nein                      | über PowerSuite                                    | nein                                             | nicht belegt                             | k. A.                                    | ja                        | k. A.                                | sehr gering         |
| **HT-Power 0701/0702 3P CL**              | ?                                                                    | "Remote-ST"-Software               | nein                      | ?                                                  | ?                                                | ja, eingebaut [H]                        | ?                                        | ?                         | ~8.450 € + 780 €                     | gering              |

---

## Empfehlung

### Welche Geräte eine echte PC-gesteuerte Echtzeit-Integration erlauben

1. **Metrel MI 3365 OmegaEE XD (oder MI 3360) mit A 1422.** Das ist die einzige Kombination, bei der ich den ganzen Ablauf aus öffentlichen Herstellerunterlagen belegen kann. Start vom PC, Gerätedaten live ins Gerät, Sichtprüfung vom PC, alle Messwerte mit Grenzwert und pass/fail zurück. Den Code dafür kann man ohne NDA und ohne Lizenz schreiben. Das MI 3365 ist nach EN 50678/50699 ausgelegt, das ist der aktuelle Normstand.
2. **Gossen SECUTEST ST PRO/BASE10 mit DB+**, nur unter Bedingung. Die Hardware kann es, und für SECUTEST spricht die Verbreitung (Kalibrierdienste, Kollegen, Mietgeräte). Kauft ihn aber erst, wenn Gossen die USB-Befehlsliste schriftlich herausgibt und ihre Nutzung in eigener Software erlaubt. Ohne sie bleibt nur IZYTRONIQ, und das ist ein Datensilo ohne API.
3. Alle anderen sind nach meinem Kenntnisstand nur über Dateien oder Herstellersoftware anzubinden. Wenn ihr dort Echtzeit wollt, sind die Optionen Polling einer Datenbankdatei (Benning, IZYTRONIQ ENTERPRISE/SQL) oder Reverse Engineering. Beides würde ich für ein Gerät, das Netzspannung schaltet, nicht empfehlen.

### Was die Bridge tun müsste (Metrel-Variante)

Hardware: Raspberry Pi 4/5 oder ein kleiner Linux-PC, per USB (CDC/seriell) oder RS232 am Tester. Optional Bluetooth SPP. Ein Ethernet-Anschluss am Tester wäre bequemer, ist aber für MI 3360/3365 nicht belegt.

Ablauf **[I]**, gestützt auf die Befehle im Handbuch:

1. Die Bridge hält die serielle Verbindung, schickt beim Start `BB; ENABLE = 1; PASSWORD = …; DEBUG_TEXTS; ACTIONS` und fragt regelmäßig `BB; STATUS`. Bei Schlafmodus sendet sie `WAKE_UP`.
2. Die Bridge verbindet sich ausgehend mit Technikpool (WebSocket oder Long-Poll auf einen neuen `/api/v1`-Endpunkt mit Device-Token, wie beim Scanner-Pairing). So braucht der Pi keinen offenen Port und kein festes Netz am Einsatzort.
3. Jemand scannt den Asset-Tag (Scanner-App oder Barcodescanner an der Bridge). Technikpool kennt Produkt, Schutzklasse, Anschluss (Schuko, CEE 16, CEE 32) und Prüfintervall und wählt den Prüfablauf. Er schickt der Bridge `{assetId, Bezeichnung, Sequenzname, Intervall}`.
4. Die Bridge startet `BB; START_AUTOTEST; NAME = <Sequenz>; SEND_ST_INFO = AT_STEP_INFO; SAVE_RESULT`. Fragt das Gerät per `MSG … KEYBOARD` nach ID oder Name, antwortet die Bridge mit den Technikpool-Werten. Bei `STEP_END_DECISION` schickt sie `ACTION = Proceed`, oder sie fragt den Prüfer im UI.
5. Die Bridge parst jede `ST; RESULT`- und `STATUS`-Zeile in strukturierte Messwerte (RPE, Riso, Ersatzableitstrom, Differenzstrom, Berührungsstrom, PRCD-Auslösezeit …) und streamt sie live an Technikpool. Am Ende kommt `AT; STATUS`.
6. Technikpool speichert die Prüfung als `Inspection` (das Modell gibt es schon, siehe "DGUV inspections") mit den Messwerten. Das **Prüfprotokoll-PDF erzeugt Technikpool selbst**, mit demselben Renderer wie Lieferschein und AVV. Die Black Box liefert keine PDF.
7. Sicherheitslogik in der Bridge: kein Start ohne Bestätigung am Gerät oder im UI, `TOUCH_TEST` nie abschalten, `HV_PASSWORD` nicht hinterlegen, `Break` bei Verbindungsabbruch. Die Verantwortung für normgerechte Abläufe bleibt beim Ersteller der Sequenz und bei der befähigten Person. Das steht bei Metrel und Gossen gleichermaßen im Handbuch.
8. Die Sequenzen pflegt ihr einmalig in Metrel ES Manager und spielt sie aufs Gerät, pro Schutzklasse und Anschlussart (SK I Schuko, SK II, Verlängerung, CEE-16-Verteiler mit RCD, CEE-32 …). Alternativ fährt die Bridge Einzelmessungen (`START_SINGLETEST`) in eigener Reihenfolge. Das ist flexibler, macht euch aber für den Ablauf normativ verantwortlich.

Für die SECUTEST-Variante sähe die Bridge genauso aus, nur mit dem Gossen-Befehlssatz. Den Aufwand kann ich ohne die Doku nicht abschätzen.

### Vor dem Kauf beim Hersteller klären

**Metrel (oder Händler):**

- Unterstützt das konkrete Gerät (MI 3365, Firmwarestand) Black Box über USB **und** RS232/Bluetooth? Gibt es Ethernet?
- Wie meldet sich USB am Linux-Host (CDC-ACM, FTDI, proprietärer Treiber)? Davon hängt ab, ob ein Pi ohne Windows reicht.
- Funktionieren Auto-Sequenzen mit dem A 1422 (Drehstrom, CEE 32 A) und die RCD-/PRCD-Prüfungen im Black-Box-Modus vollständig, inklusive Rückfragen und Adapterauswahl (`X0 = A1422`?)?
- Kann man Gerätedaten (ID, Name, Intervall) auch ohne Sequenz-Dialog direkt setzen, oder nur über `MSG … KEYBOARD`?
- Lizenzbedarf: Ist Black Box wirklich ohne Lizenz nutzbar (Leaflet sagt ja)? Wann braucht man die SDK-Lizenz (P 1104/P 1203), und was kostet sie?
- Ist das Appendix-Dokument mit Messstatus- und Icon-IDs erhältlich?
- Liefertermin und Nachfolgeplanung (MI 3360 "limited quantity").

**Gossen Metrawatt:**

- Bekommen wir die "interface commands" für den Remote-Modus des SECUTEST ST PRO/BASE10? Unter welchen Bedingungen (NDA, Lizenz, Partnerstatus)? Dürfen wir sie in eigener Software nutzen?
- Deckt der Befehlssatz Start einer Sequenz, Live-Messwerte, Übergabe von ID/Bezeichnung und Sichtprüfung ab? Gilt er auch mit AT16-DI/AT32-DI?
- Gibt es für IZYTRONIQ eine API, einen Webservice oder ein dokumentiertes Datenbankschema (ENTERPRISE/SQL)?
- Prüfen RCDs in mobilen Verteilern (Typ A/B) mit SECUTEST, oder braucht ihr zusätzlich einen PROFITEST?

**Benning:**

- Gibt es ein Befehlsprotokoll über LAN/WLAN, oder nur Cerhost und Datenbankzugriff? Darf die Bridge die SQLite-Datenbank im laufenden Betrieb lesen bzw. Prüflinge anlegen, und über welches Protokoll (SMB, FTP)?

**Allgemein:**

- Normstand EN 50678/50699 im Gerät (Benning nur "vorbereitet").
- Kalibrierdienst in Deutschland (DAkkS), Leihgerät während der Kalibrierung.

### Was unsicher bleibt

- Die physischen Schnittstellen des MI 3365 und ob Black Box dort über Bluetooth/Ethernet geht, habe ich nur indirekt (Wissensdatenbank) belegt.
- Ob Gossen die Befehlsliste herausgibt, kann nur Gossen beantworten. Die Formulierung "available upon request" steht in der Ausgabe 1/10.20 des Handbuchs. Neuere Ausgaben habe ich nicht gesehen.
- Bei Benning ist der Netzwerkzugriff auf die Datenbank im Katalog genannt, das Protokoll aber nicht.
- Die Preise sind Händlerpreise von 2025/2026 und schwanken zwischen brutto und netto. Für Pakete mit Adaptern bitte Angebote einholen.
- Zur Verbreitung in der Veranstaltungstechnik habe ich keine Statistik, nur Händlersortimente und Forenbeiträge.
