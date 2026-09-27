# Vertrag über die Verarbeitung personenbezogener Daten im Auftrag (Art. 28 DSGVO)

> **Vorlage, keine Rechtsberatung.** Vor der Verwendung prüfen lassen. Alle Platzhalter in
> eckigen Klammern betreffen dich als Betreiber: einmal ausfüllen, dann den Text ohne diese
> Notiz unter `/admin/legal` einfügen. Die Firma wird nicht in den Text eingetragen; sie ergibt
> sich aus der Annahme (siehe unten).

zwischen

**[Betreiber]**, [Anschrift des Betreibers]\
– nachfolgend „Auftragnehmer“ –

und

der Organisation auf der unter § 1 genannten Instanz, für die ein Owner diesen Vertrag annimmt\
– nachfolgend „Auftraggeber“ –.

Name und Anschrift des Auftraggebers sowie die Person, die für ihn annimmt, und der Zeitpunkt
der Annahme werden bei der Annahme festgehalten und sind Teil dieses Vertrags.

## § 1 Gegenstand und Dauer

1. Der Auftragnehmer betreibt die Software Technikpool unter **[URL der Instanz]** und stellt
   sie dem Auftraggeber zur Verwaltung von Equipment, Produktionen, Kunden, Angeboten und
   Rechnungen bereit.
2. Die Bereitstellung ist **unentgeltlich**.
3. Der Vertrag gilt, solange der Auftraggeber eine Organisation auf der Instanz unterhält,
   und endet mit deren Auflösung oder mit Einstellung des Dienstes.

## § 2 Art und Zweck der Verarbeitung

- **Art der Verarbeitung:** Speichern, Hosten, Sichern, Übermitteln an berechtigte Nutzer
  und Löschen, im Rahmen des Betriebs der Software.
- **Zweck:** ausschließlich die Bereitstellung der Software für den Auftraggeber.

## § 3 Art der Daten und Kreis der Betroffenen

| Datenkategorie                                                                                                     | Betroffene                                         |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Nutzerkonten: Name, E-Mail-Adresse, Passwort-Hash, Rolle in der Organisation                                       | Beschäftigte und Beauftragte des Auftraggebers     |
| Sitzungsdaten: IP-Adresse, User-Agent, Zeitpunkt (bis Ablauf der Sitzung)                                          | Nutzer                                             |
| Organisationsdaten: Anschrift, Steuernummer, USt-IdNr., Bankverbindung (IBAN, BIC, Kontoinhaber), Rechnungs-E-Mail | Auftraggeber, bei Einzelunternehmen dessen Inhaber |
| Kunden: Firmenname, Ansprechpartner, E-Mail, Telefon, Anschrift, USt-IdNr.                                         | Kunden und deren Ansprechpartner                   |
| Produktionen: Veranstaltungsort, Anschrift, Kunde, Crew-Zuordnung, Stornogrund                                     | Kunden, Crew                                       |
| Angebote und Rechnungen einschließlich erzeugter PDF-Dateien                                                       | Kunden und deren Ansprechpartner                   |
| Bilder: Produkt-, Geräte- und Set-Fotos, Organisationslogo                                                         | ggf. abgebildete Personen                          |
| Lizenzzugangsdaten (Lizenzschlüssel, Benutzername, Passwort), verschlüsselt                                        | ggf. Inhaber der Softwarelizenz                    |
| Prüfprotokolle: Name des Prüfers, Notizen                                                                          | Prüfer, auch externe                               |
| Historie: wer wann welches Gerät gebucht, ausgegeben, zurückgenommen, gezählt oder geändert hat                    | Nutzer                                             |

## § 4 Weisungen

1. Der Auftragnehmer verarbeitet die Daten nur auf dokumentierte Weisung des Auftraggebers.
   Die Nutzung der Software durch den Auftraggeber gilt als Weisung.
2. Hält der Auftragnehmer eine Weisung für rechtswidrig, weist er den Auftraggeber darauf hin.

## § 5 Vertraulichkeit

Der Auftragnehmer setzt nur Personen ein, die zur Vertraulichkeit verpflichtet sind. Zugriff
auf die Daten nimmt er nur, soweit Betrieb, Wartung, Fehlerbehebung oder Sicherheit es
erfordern.

## § 6 Technische und organisatorische Maßnahmen

Der Auftragnehmer trifft die Maßnahmen nach Art. 32 DSGVO, die in der **Anlage** beschrieben
sind. Er darf sie weiterentwickeln, solange das Schutzniveau nicht sinkt.

## § 7 Unterauftragsverarbeiter

1. Der Auftraggeber genehmigt die folgenden Unterauftragsverarbeiter:

   | Anbieter        | Leistung                          | Standort der Verarbeitung |
   | --------------- | --------------------------------- | ------------------------- |
   | [Server-Hoster] | Server, auf dem die Instanz läuft | [Land]                    |
   | [SMTP-Anbieter] | Versand von System-E-Mails        | [Land]                    |
   | [S3-Anbieter]   | Speicher für Bilder und PDFs      | [Land]                    |

2. Über neue oder ersetzte Unterauftragsverarbeiter informiert der Auftragnehmer vorab
   per E-Mail an die Owner des Auftraggebers in Technikpool. Der Auftraggeber kann innerhalb
   von [14 Tagen] widersprechen. In dem Fall kann jede Seite den Vertrag beenden.
3. Mit jedem Unterauftragsverarbeiter besteht ein Vertrag nach Art. 28 Abs. 4 DSGVO.

## § 8 Unterstützung des Auftraggebers

1. Der Auftragnehmer unterstützt den Auftraggeber im Rahmen des Zumutbaren bei:
   - Anfragen Betroffener (Auskunft, Berichtigung, Löschung, Einschränkung,
     Datenübertragbarkeit)
   - Meldungen von Datenschutzverletzungen
   - Datenschutz-Folgenabschätzungen
2. Viele dieser Rechte kann der Auftraggeber in der Software selbst erfüllen. Beispiele:
   - Datensätze bearbeiten oder löschen
   - Nutzer aus der Organisation entfernen
   - Nutzer löschen ihr Konto im Profil selbst
3. **Datenschutzverletzungen** meldet der Auftragnehmer unverzüglich, spätestens innerhalb von
   [48 Stunden] nach Kenntnis, per E-Mail an die Owner des Auftraggebers in Technikpool.

## § 9 Löschung und Rückgabe

1. Nach Vertragsende löscht der Auftragnehmer die Daten des Auftraggebers innerhalb von
   [30 Tagen], soweit keine gesetzliche Pflicht zur Aufbewahrung besteht.
2. Aus Backups verschwinden die Daten mit deren turnusmäßigem Ablauf, spätestens nach
   [Aufbewahrungsdauer der Backups].
3. Vorher kann der Auftraggeber seine Daten exportieren:
   - Angebote und Rechnungen als PDF
   - Inventurberichte als CSV
   - auf Anfrage einen Datenbankauszug seiner Organisation
4. Aufbewahrungspflichten für Handels- und Steuerunterlagen (§ 147 AO, § 257 HGB) erfüllt der
   Auftraggeber selbst.

## § 10 Kontrollrechte

Der Auftragnehmer weist die Einhaltung dieses Vertrags auf Anfrage nach, in der Regel durch
Auskunft und Vorlage der Dokumentation. Vor-Ort-Kontrollen sind nach Anmeldung mit
angemessener Frist möglich.

## § 11 Unentgeltlichkeit und Haftung

1. Die Leistung ist unentgeltlich. Für Schäden aus der Bereitstellung haftet der
   Auftragnehmer nur bei Vorsatz und grober Fahrlässigkeit (§§ 521, 599 BGB entsprechend).
2. Unberührt bleiben:
   - die Haftung für die Verletzung von Leben, Körper und Gesundheit
   - die Haftung nach Art. 82 DSGVO
3. Ein Anspruch auf eine bestimmte Verfügbarkeit besteht nicht. Einzelheiten regeln die
   Nutzungsbedingungen.

## § 12 Schlussbestimmungen

1. Der Vertrag wird in elektronischem Format geschlossen (Art. 28 Abs. 9 DSGVO): Ein Owner des
   Auftraggebers nimmt ihn in Technikpool an. Gespeichert werden Organisation, annehmende
   Person, Zeitpunkt und der vollständige Text der angenommenen Fassung. Beide Seiten können
   diesen Nachweis jederzeit abrufen.
2. Eine neue Fassung wird dem Auftraggeber beim nächsten Öffnen von Technikpool vorgelegt und
   gilt ab ihrer Annahme. Bis dahin gilt die zuletzt angenommene Fassung.
3. Änderungen bedürfen der Textform. Ist eine Bestimmung unwirksam, bleibt der Rest wirksam.

---

## Anlage: Technische und organisatorische Maßnahmen (Art. 32 DSGVO)

### Vertraulichkeit

- **Serverstandort:** [Land, Rechenzentrum des Hosters].
- **Zutrittskontrolle:** Rechenzentrum des Hosters, siehe dessen Nachweise [Link/Zertifikat].
- **Zugangskontrolle:**
  - Anmeldung mit E-Mail und Passwort.
  - Passwörter werden nur als Hash gespeichert (better-auth).
  - Sitzungen laufen nach 7 Tagen ab.
  - Serverzugang nur per SSH-Schlüssel [anpassen].
- **Zugriffskontrolle:** Rollen je Organisation. Rechnungsdaten sind erst ab ADMIN lesbar.
  Die Rollen, aufsteigend:
  - DEVICE_VIEWER: nur Geräte
  - VIEWER: alles außer Abrechnung
  - MEMBER
  - ADMIN
  - OWNER
- **Trennungskontrolle:**
  - Jeder Datensatz gehört zu einer Organisation, und jede Abfrage ist auf die
    Organisationen des Nutzers beschränkt.
  - Andere Organisationen sehen eine Produktion nur, wenn deren Geräte darin gebucht
    sind, und dann ohne Abrechnung.
- **Verschlüsselung:**
  - Übertragung ausschließlich per TLS.
  - Lizenzzugangsdaten zusätzlich mit AES-256-GCM verschlüsselt, mit einem Schlüssel, der
    getrennt von der Datenbank gehalten wird.
  - Datenträger: [verschlüsselt ja/nein].

### Integrität

- **Eingabekontrolle:** Änderungen an Geräten werden protokolliert:
  - Buchung, Ausgabe, Rücknahme, Inventur und das Anzeigen von Lizenzzugängen in
    `AssetTransaction`
  - Änderungen am Katalog in `CatalogTransaction`
- **Weitergabekontrolle:** keine Übermittlung an Dritte außer den genannten
  Unterauftragsverarbeitern. Keine Analyse- oder Tracking-Dienste. Schriften und das Modell
  für die Hintergrund-Freistellung werden von der eigenen Instanz ausgeliefert.

### Verfügbarkeit und Belastbarkeit

- **Backups:** [Datenbank und S3-Bucket, Häufigkeit, Speicherort, Aufbewahrungsdauer,
  verschlüsselt ja/nein — vom Betreiber auszufüllen].
- **Wiederherstellung:** [getestet am / Verfahren].
- **Updates:** Container-Images werden automatisch aktualisiert (Watchtower) [anpassen].

### Überprüfung und Datensparsamkeit

- Abgelaufene Sitzungen (mit IP-Adresse und User-Agent), Bestätigungslinks, Gerätekopplungen
  und Einladungen werden stündlich gelöscht.
- Gelöschte Konten verschwinden aus der Historie. Einträge zeigen dann „Gelöschtes Konto“.
- Überprüfung dieser Maßnahmen: [jährlich / bei wesentlichen Änderungen].
