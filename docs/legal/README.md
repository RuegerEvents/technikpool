# Technikpool betreiben: rechtliche Pflichten

> **Keine Rechtsberatung.** Diese Checkliste und die Vorlagen daneben beschreiben, was die
> Software speichert und welche Dokumente ein Betreiber in Deutschland typischerweise braucht.
> Ob sie für deinen Betrieb reichen, klärt eine Anwältin oder ein Anwalt, nicht dieses Repo.

Technikpool ist MIT-lizenziert. Wer eine Instanz betreibt, ist für seine Instanz verantwortlich,
auch wenn er sie kostenlos anbietet.

## Wer ist was?

- **Die Firmen** (Organisationen in der App) sind **Verantwortliche** für das, was sie
  eintragen: Mitarbeitende, Kunden, Crew, Angebote, Rechnungen.
- **Du als Betreiber** bist für diese Inhalte ihr **Auftragsverarbeiter** (Art. 28 DSGVO).
- Für den Betrieb der Plattform selbst (Konten, Login, Sessions, Einladungen,
  Sicherheit) bist du **selbst Verantwortlicher**.

## Checkliste

- [ ] **AVV mit jeder Firma** abschließen, auch wenn der Dienst nichts kostet. Das geht in der
      App: Text aus [avv-vorlage.md](avv-vorlage.md) ausfüllen und unter `/admin/legal` als
      „Auftragsverarbeitungsvertrag“ einfügen. Siehe „Die AVV in der App“ unten.
- [ ] **Unterauftragsverarbeiter** festhalten und in die AVV eintragen:
  - Server- bzw. VPS-Hoster
  - SMTP-Anbieter
  - S3-Speicher, falls nicht auf demselben Server
  - bei allen: mit denen jeweils einen AVV abschließen
- [ ] **Datenschutzerklärung** für die Plattform veröffentlichen.
      Vorlage: [datenschutzerklaerung-vorlage.md](datenschutzerklaerung-vorlage.md).
- [ ] **Impressum** (§ 5 DDG). Ob es bei einem unentgeltlichen Angebot Pflicht ist, ist
      strittig; die Login-Seite ist öffentlich, also im Zweifel eins anbieten.
- [ ] **Nutzungsbedingungen**: Uptime, Haftung, Einstellung des Dienstes.
      Vorlage: [nutzungsbedingungen-vorlage.md](nutzungsbedingungen-vorlage.md).
- [ ] **Backups** einrichten (Datenbank und S3-Bucket) und in der TOM-Anlage beschreiben:
  - wie oft
  - wo
  - wie lange
  - verschlüsselt?
- [ ] **`CREDENTIALS_ENCRYPTION_KEY` sichern**, getrennt vom Datenbank-Backup. Ohne ihn sind
      alle gespeicherten Lizenzzugänge unlesbar, und mit ihm im selben Backup schützt die
      Verschlüsselung nichts mehr.
- [ ] **TLS** vor der App (Reverse Proxy). Die Session-Cookies setzen HTTPS voraus.
- [ ] **Server-Logs** des Reverse Proxys: Speicherdauer festlegen (z. B. 7 bis 14 Tage) und
      in der Datenschutzerklärung nennen.
- [ ] **Scanner-App**: nur relevant, wenn du die App selbst in einem Store veröffentlichst.
      Die Datenschutz-URL gehört zur App, nicht zu deinem Server; siehe
      [../privacy/index.md](../privacy/index.md).

## Wo die Texte in der App erscheinen

- Als Systemadmin unter **`/admin/legal`**. Für jede der drei Seiten (Impressum,
  Datenschutzerklärung, Nutzungsbedingungen) entweder:
  - eine **URL** zu deiner eigenen Website, oder
  - **Markdown-Text**, ein Text in der Sprache deiner Wahl. Er wird allen Lesern gleich angezeigt.
- Anzeige unter `/legal/imprint`, `/legal/privacy` und `/legal/terms`, auch ohne Anmeldung.
  Ist eine URL gesetzt, leitet die Seite dorthin weiter.
- Verlinkt unter den Formularen für Anmeldung und Registrierung, im Benutzermenü und in den
  Einstellungen der Scanner-App.
- Eine leer gelassene Seite wird nirgends verlinkt.

## Was die Software dir schon abnimmt

- **Kein Tracking, keine Analyse, keine Werbung.** Cookies und localStorage sind rein
  funktional. Einen Cookie-Banner braucht es deshalb nicht (§ 25 Abs. 2 TDDDG).
- **Keine Drittanbieter im Browser:**
  - Die Schriften werden von der eigenen Instanz ausgeliefert.
  - Das Modell für die Hintergrund-Freistellung ebenfalls; die Bildbearbeitung läuft
    im Browser.
- **Sessions werden aufgeräumt.** Eine Session gilt 7 Tage. Ein stündlicher Job löscht
  abgelaufene Sessions mitsamt IP-Adresse und User-Agent, außerdem abgelaufene
  Bestätigungslinks, Gerätekopplungen und Einladungen.
- **Konto löschen.** Jede Person kann ihr Konto im Profil selbst löschen. Einträge in der
  Historie bleiben erhalten, zeigen aber „Gelöschtes Konto“ statt des Namens.
  Blockiert wird das Löschen nur, solange die Person letzte Inhaberin (OWNER) einer
  Organisation ist.
- **Lizenzzugänge** werden mit AES-256-GCM verschlüsselt gespeichert, und jedes Anzeigen wird
  protokolliert.

## Was bei den Firmen bleibt

- Aufbewahrungspflichten für Angebote und Rechnungen (§ 147 AO, § 257 HGB) treffen die Firma,
  nicht den Betreiber. Wer ein Konto oder eine Organisation auflöst, exportiert vorher, was
  er aufbewahren muss.
- Eine Rechtsgrundlage für die Daten, die sie eintragen (Kunden, Crew), braucht die Firma
  selbst.

## Die AVV in der App

Art. 28 Abs. 9 DSGVO lässt die AVV in einem elektronischen Format zu. Deshalb muss nichts
unterschrieben und verschickt werden:

- Sobald unter `/admin/legal` ein AVV-Text steht, muss der **Owner jeder Organisation** ihn
  annehmen. Bis dahin sieht er beim Öffnen der App einen Dialog, der sich nicht wegklicken lässt.
  Die Alternative ist Abmelden.
- **Der Text ist für alle Firmen gleich.** Die Platzhalter der Vorlage betreffen nur dich
  (Betreiber, Anschrift, URL, Unterauftragsverarbeiter, TOM) und werden einmal ausgefüllt. Der
  Auftraggeber steht nicht im Text: Er ist die Organisation, deren Owner annimmt. Ihr Name und
  ihre Anschrift werden mit der Annahme festgehalten. Der Editor warnt, solange noch
  `[Platzhalter]` im Text stehen.
- Jede Annahme wird gespeichert mit Organisation samt Anschrift, Name und E-Mail der annehmenden Person,
  Zeitpunkt, SHA-256 der Fassung und dem **vollständigen Text**. Das bleibt auch, wenn das
  Konto oder die Organisation später gelöscht wird.
- **Änderst du den Text**, zum Beispiel für einen neuen Unterauftragsverarbeiter, ist das eine
  neue Fassung. Alle Owner werden erneut gefragt. Die alten Annahmen bleiben als Nachweis.
- Jede Annahme wird zum **PDF**: oben der Nachweis (Organisation, Anschrift, wer, wann,
  Fassung), darunter der Vertragstext. Die Person, die annimmt, bekommt es per Mail. Es liegt
  im S3-Bucket außerhalb des öffentlichen Bereichs und ist nur für Owner der Organisation und
  Systemadmins abrufbar.
- Übersicht im Tab „Auftragsverarbeitungsvertrag“ unter `/admin/legal`: welche Organisation
  welche Fassung angenommen hat, mit dem PDF. Owner finden es auf der Seite ihrer
  Organisation.
- **Systemadmins werden nicht gefragt**, weil sie den Server betreiben. Für deine eigene
  Organisation verarbeitest du nichts im Auftrag.
- Die Vorlage ist fürs Einfügen in `/admin/legal` geschrieben. Schließt du die AVV lieber auf
  Papier, ersetze § 12 Abs. 1 und 2 durch Ort, Datum und Unterschrift beider Seiten.
- Die AVV ist nur Text, kein Link: Eine Annahme muss festhalten, was genau angenommen wurde.
  Unter `/legal/dpa` ist sie außerdem öffentlich lesbar.
