// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for German (`de`).
class SDe extends S {
  SDe([String locale = 'de']) : super(locale);

  @override
  String get appTitle => 'Technikpool Scanner';

  @override
  String get connectTitle => 'Mit Technikpool verbinden';

  @override
  String get serverAddress => 'Serveradresse';

  @override
  String get serverAddressHint => 'https://technikpool.example.com';

  @override
  String get scanServerQr =>
      'Scanne den QR-Code auf der Seite \"Werkzeuge › Scanner\" oder gib die Adresse von Hand ein.';

  @override
  String notAServerCode(String code) {
    return '„$code“ ist keine Serveradresse. Inventar- und Seriennummern werden nach dem Verbinden gescannt — oder in der Demo.';
  }

  @override
  String get continueLabel => 'Weiter';

  @override
  String get codeInstructions =>
      'Gib diesen Code unter \"Werkzeuge › Scanner\" im Browser ein:';

  @override
  String get waitingForApproval => 'Warte auf Bestätigung…';

  @override
  String get codeExpired => 'Der Code ist abgelaufen. Bitte neu starten.';

  @override
  String get accessDenied => 'Die Anfrage wurde abgelehnt.';

  @override
  String get startOver => 'Neu starten';

  @override
  String get signInWithPassword => 'Stattdessen mit Passwort anmelden';

  @override
  String get useDeviceCode => 'Stattdessen mit Code verbinden';

  @override
  String get email => 'E-Mail';

  @override
  String get password => 'Passwort';

  @override
  String get signIn => 'Anmelden';

  @override
  String get location => 'Lagerort';

  @override
  String get production => 'Produktion';

  @override
  String get startSession => 'Session starten';

  @override
  String get search => 'Suchen';

  @override
  String get noResults => 'Keine Treffer';

  @override
  String get scanNow => 'Bereit — Auslöser drücken';

  @override
  String get scansLabel => 'Scans';

  @override
  String get okLabel => 'OK';

  @override
  String get errorLabel => 'Fehler';

  @override
  String get sessionEmpty => 'Noch nichts gescannt.';

  @override
  String get serialNumber => 'Seriennummer';

  @override
  String get status => 'Status';

  @override
  String get currentLocation => 'Aktueller Lagerort';

  @override
  String get ways => 'Wege';

  @override
  String get connectors => 'Stecker';

  @override
  String get cableLength => 'Länge';

  @override
  String get cableColor => 'Farbcode';

  @override
  String get cableColors => 'Kabelfarben';

  @override
  String get cableColorsHint => 'Welche Bandfarbe welche Kabellänge markiert';

  @override
  String get cableColorsEmpty =>
      'Noch keine Organisation markiert ihre Kabel mit Farben.';

  @override
  String get cableColorsOtherOrg => 'Andere Organisation';

  @override
  String cableColorUpTo(String length) {
    return 'bis $length';
  }

  @override
  String cableColorRange(String from, String to) {
    return 'über $from bis $to';
  }

  @override
  String cableColorsLonger(String length) {
    return 'Länger als $length: keine Farbe';
  }

  @override
  String get cableColorRed => 'rot';

  @override
  String get cableColorBlue => 'blau';

  @override
  String get cableColorGreen => 'grün';

  @override
  String get cableColorYellow => 'gelb';

  @override
  String get cableColorWhite => 'weiß';

  @override
  String get cableColorBlack => 'schwarz';

  @override
  String get cableColorOrange => 'orange';

  @override
  String get cableColorBrown => 'braun';

  @override
  String get cableColorGrey => 'grau';

  @override
  String get cableColorViolet => 'violett';

  @override
  String get cableColorPink => 'pink';

  @override
  String get cableColorTurquoise => 'türkis';

  @override
  String get checkedOutTo => 'Ausgegeben an';

  @override
  String get history => 'Verlauf';

  @override
  String get scanTones => 'Scan-Töne';

  @override
  String get scanTonesHint =>
      'Pling: erledigt. Zwei tiefe Töne: schon erledigt. Drei steigende Töne: auf den Bildschirm schauen. Zwei fallende Töne: hat nicht geklappt.';

  @override
  String get documents => 'PDFs';

  @override
  String get documentManual => 'Handbuch';

  @override
  String get documentDatasheet => 'Datenblatt';

  @override
  String get documentOther => 'Dokument';

  @override
  String get inventory => 'Bestand';

  @override
  String get filterByLocation => 'Lagerort';

  @override
  String get filterByCategory => 'Kategorie';

  @override
  String get all => 'Alle';

  @override
  String get loadMore => 'Mehr laden';

  @override
  String get settings => 'Einstellungen';

  @override
  String get connectedAs => 'Angemeldet als';

  @override
  String get server => 'Server';

  @override
  String get disconnect => 'Verbindung trennen';

  @override
  String get scannerConfig => 'Scanner-Konfiguration';

  @override
  String get broadcastActions => 'Broadcast-Actions';

  @override
  String get extraKeys => 'Extra-Keys';

  @override
  String get configHint =>
      'Kommagetrennt. Die richtigen Werte findest du über die Diagnose.';

  @override
  String get save => 'Speichern';

  @override
  String get saved => 'Gespeichert';

  @override
  String get diagnostics => 'Diagnose';

  @override
  String get diagnosticsHint =>
      'Drücke den Auslöser. Hier erscheint jeder empfangene Broadcast mit allen Extras.';

  @override
  String get diagnosticsEmpty => 'Noch nichts empfangen.';

  @override
  String get whatsNew => 'Was ist neu';

  @override
  String get legal => 'Rechtliches';

  @override
  String get imprint => 'Impressum';

  @override
  String get privacyPolicy => 'Datenschutzerklärung';

  @override
  String get termsOfUse => 'Nutzungsbedingungen';

  @override
  String get appPrivacyPolicy => 'Datenschutz dieser App';

  @override
  String get appPrivacyPolicyHint =>
      'Die App selbst erhebt nichts. Was der Server speichert, verantwortet sein Betreiber.';

  @override
  String get linkOpenFailed => 'Der Link konnte nicht geöffnet werden.';

  @override
  String versionLabel(String version) {
    return 'Version $version';
  }

  @override
  String whatsNewIn(String version) {
    return 'Was ist neu in $version';
  }

  @override
  String get dismiss => 'Ausblenden';

  @override
  String get useThisPair => 'Diese Werte übernehmen';

  @override
  String get language => 'Sprache';

  @override
  String get languageSystem => 'Systemsprache';

  @override
  String get scanInput => 'Scan-Eingabe';

  @override
  String get scanWithCamera => 'Mit Kamera scannen';

  @override
  String get cameraHint => 'Code in den Rahmen halten.';

  @override
  String get cameraDenied =>
      'Kein Kamerazugriff. Erlaube ihn in den Systemeinstellungen und versuche es erneut.';

  @override
  String get cameraUnsupported => 'Dieses Gerät hat keine nutzbare Kamera.';

  @override
  String get cameraFailed => 'Die Kamera konnte nicht gestartet werden.';

  @override
  String get torch => 'Licht';

  @override
  String get scanModeAuto => 'Automatisch';

  @override
  String get scanModeAutoHint =>
      'Hardware-Auslöser bei bekannten Scanner-Modellen und sobald ein Gerät einen Scan liefert — sonst Kamera.';

  @override
  String get scanModeHardware => 'Hardware-Auslöser';

  @override
  String get scanModeHardwareHint =>
      'Nur die eingebaute Scan-Engine des Geräts.';

  @override
  String get scanModeCamera => 'Kamera';

  @override
  String get scanModeCameraHint =>
      'Nur die Kamera. Für Telefone ohne Scan-Engine.';

  @override
  String get hardwareDetected => 'Hardware-Scanner erkannt';

  @override
  String get hardwareNotDetected => 'Noch kein Hardware-Scan empfangen';

  @override
  String get knownPdaModel => 'Bekanntes Scanner-Modell';

  @override
  String get scanQrWithCamera => 'QR-Code mit Kamera scannen';

  @override
  String get statusAvailable => 'Verfügbar';

  @override
  String get statusUnavailable => 'Nicht verfügbar';

  @override
  String get statusMaintenance => 'In Wartung';

  @override
  String get statusBroken => 'Defekt';

  @override
  String get statusSold => 'Verkauft';

  @override
  String get demoStart => 'Demo ausprobieren';

  @override
  String get demoExplainer =>
      'Kein Server zur Hand? Die Demo betreibt ein kleines Lager auf diesem Gerät — es wird nichts übertragen.';

  @override
  String get demoBannerText =>
      'Demo-Modus — Beispieldaten, nur auf diesem Gerät.';

  @override
  String get demoLeave => 'Demo verlassen';

  @override
  String demoTagHint(String tag) {
    return 'Inventarnummer $tag probieren: eingeben und suchen öffnet das Gerät';
  }

  @override
  String get statusDecommissioned => 'Ausgemustert';

  @override
  String get actionCreated => 'Angelegt';

  @override
  String get actionCheckedOut => 'Ausgegeben';

  @override
  String get actionReturned => 'Zurückgegeben';

  @override
  String get actionLocationAssigned => 'Eingelagert';

  @override
  String get actionUpdated => 'Geändert';

  @override
  String get actionRequested => 'Angefragt';

  @override
  String get actionAddedToProduction => 'Zur Produktion hinzugefügt';

  @override
  String get actionApproved => 'Genehmigt';

  @override
  String get actionDeclined => 'Abgelehnt';

  @override
  String get actionBookingCancelled => 'Freigegeben';

  @override
  String get actionBookingReplaced => 'Gegen anderes Gerät getauscht';

  @override
  String get actionAccessoryAttached => 'Zubehör angehängt';

  @override
  String get actionAccessoryDetached => 'Zubehör abgehängt';

  @override
  String get actionCredentialsSet => 'Zugangsdaten gespeichert';

  @override
  String get actionCredentialsRemoved => 'Zugangsdaten entfernt';

  @override
  String get actionCredentialsRevealed => 'Zugangsdaten angezeigt';

  @override
  String get actionDeleted => 'Gelöscht';

  @override
  String get actionInspected => 'Geprüft';

  @override
  String get retry => 'Erneut versuchen';

  @override
  String get manualEntry => 'Inventar- oder Seriennummer eingeben';

  @override
  String get reset => 'Zurücksetzen';

  @override
  String returnedFrom(String names) {
    return 'zurück von $names';
  }

  @override
  String get errorAssetNotFound =>
      'Unbekannt: weder eine Inventarnummer noch eine Seriennummer.';

  @override
  String get errorSerialAmbiguous =>
      'Mehrere Geräte haben diese Seriennummer. Bitte die Inventarnummer scannen.';

  @override
  String get errorForbidden => 'Kein Zugriff auf diesen Artikel.';

  @override
  String get errorWrongOrganization =>
      'Der Lagerort gehört zu einer anderen Organisation.';

  @override
  String get errorAssetRetired =>
      'Dieses Gerät ist verkauft oder ausgemustert und kann nicht mehr gebucht werden.';

  @override
  String get errorAssetUnavailable =>
      'Dieses Gerät ist als nicht verfügbar markiert und kann nicht ausgegeben werden.';

  @override
  String get errorProductionCancelled =>
      'Diese Produktion wurde abgesagt. Es kann nichts mehr an sie ausgegeben werden.';

  @override
  String get errorUnauthorized =>
      'Die Sitzung ist abgelaufen. Bitte erneut verbinden.';

  @override
  String get errorInvalidRequest => 'Ungültige Anfrage.';

  @override
  String get errorInvalidLimit => 'Ungültige Seitengröße.';

  @override
  String get errorNetwork => 'Server nicht erreichbar.';

  @override
  String get errorInternal => 'Serverfehler.';

  @override
  String get errorNoToken =>
      'Der Server hat kein Sitzungs-Token zurückgegeben.';

  @override
  String get cancel => 'Abbrechen';

  @override
  String get stocktake => 'Inventur';

  @override
  String get stocktakeNew => 'Neue Inventur';

  @override
  String get stocktakeNone => 'Keine Inventur offen.';

  @override
  String stocktakeProgress(int found, int expected) {
    return '$found von $expected gezählt';
  }

  @override
  String stocktakeOutCount(int count) {
    return '$count unterwegs';
  }

  @override
  String stocktakeUnexpectedCount(int count) {
    return '$count unerwartet';
  }

  @override
  String get stocktakeWhereAreYou => 'Wo zählst du?';

  @override
  String get stocktakeOrganization => 'Organisation';

  @override
  String get stocktakeLocations => 'Lagerorte';

  @override
  String get stocktakeCategories => 'Kategorien';

  @override
  String get stocktakeNoneMeansAll => 'Keine Auswahl heißt alle.';

  @override
  String get stocktakeName => 'Name';

  @override
  String stocktakeDefaultName(String date) {
    return 'Inventur $date';
  }

  @override
  String stocktakePreview(int units, int loose, int out) {
    return '$units Geräte zu scannen · $loose lose Stück zu zählen · $out unterwegs';
  }

  @override
  String stocktakeOverlap(String name, int count) {
    return 'Überschneidet sich mit der offenen Inventur $name ($count Stück)';
  }

  @override
  String get stocktakeStart => 'Inventur starten';

  @override
  String get stocktakeNoOrgs =>
      'Um eine Inventur zu starten, brauchst du mindestens die Rolle MEMBER in einer Organisation.';

  @override
  String get stocktakeTabOpen => 'Offen hier';

  @override
  String get stocktakeFound => 'Gezählt';

  @override
  String get stocktakeUnexpected => 'Nicht auf der Liste';

  @override
  String stocktakeAlready(String name) {
    return 'Bereits gezählt von $name';
  }

  @override
  String stocktakeWasOut(String name) {
    return 'ausgegeben an $name';
  }

  @override
  String stocktakeBundle(String name) {
    return 'Bundle $name';
  }

  @override
  String get stocktakeConfirmAccessories => 'Ist alles dabei?';

  @override
  String get stocktakeConfirmBundle => 'Ist alles drin?';

  @override
  String groupBelongsWith(String name) {
    return 'Gehört zu $name';
  }

  @override
  String get groupOnlyThis => 'Nur dieses';

  @override
  String get groupBookHint =>
      'Nur das gescannte Gerät wurde gebucht. Den Rest mitbuchen?';

  @override
  String groupBook(int count) {
    return '$count mitbuchen';
  }

  @override
  String groupBooked(int count) {
    return '$count mitgebucht';
  }

  @override
  String get groupAlreadyThere => 'schon dort';

  @override
  String get stocktakeGroupHint =>
      'Das gescannte Gerät ist gezählt. Den Rest mitzählen? Entferne den Haken bei allem, was fehlt.';

  @override
  String get stocktakeConfirmHint => 'Entferne den Haken bei allem, was fehlt.';

  @override
  String get stocktakeConfirm => 'Bestätigen';

  @override
  String stocktakeConfirmed(int count) {
    return '$count bestätigt';
  }

  @override
  String stocktakeCountedBy(String name) {
    return 'gezählt von $name';
  }

  @override
  String get stocktakeNothingOpenHere => 'Hier ist nichts mehr offen.';

  @override
  String get stocktakeLoose => 'Zählen statt scannen';

  @override
  String stocktakeLooseLine(int expected, int counted) {
    return '$expected hier erwartet · $counted insgesamt gezählt';
  }

  @override
  String get stocktakeYourCount => 'Deine Zählung hier';

  @override
  String get stocktakePlusOne => 'Eins mehr';

  @override
  String get stocktakeMinusOne => 'Eins weniger';

  @override
  String get stocktakeNoMatch => 'Nichts Offenes passt dazu.';

  @override
  String get stocktakeTickHint => 'Tippen, um von Hand zu zählen';

  @override
  String get stocktakeManualTicked => 'Von Hand gezählt';

  @override
  String get stocktakeUndo => 'Zählung zurücknehmen';

  @override
  String get stocktakeUnticked => 'Zählung zurückgenommen';

  @override
  String get stocktakeNote => 'Notiz';

  @override
  String get stocktakeNeedsAttention => 'Muss geprüft werden';

  @override
  String get stocktakeEditNote => 'Notiz und Zustand';

  @override
  String get stocktakeClose => 'Inventur abschließen';

  @override
  String stocktakeCloseConfirm(int count) {
    return '$count noch nicht gezählte Stück werden als fehlend markiert. Das lässt sich nicht rückgängig machen.';
  }

  @override
  String get stocktakeClosed =>
      'Inventur abgeschlossen. Korrekturen wie fehlende Geräte markieren oder gefundene umbuchen werden im Bericht in der Web-App vorgenommen.';

  @override
  String get stocktakeChangeLocation => 'Ort wechseln';

  @override
  String get reasonOtherOrg => 'Gehört einer anderen Organisation';

  @override
  String get reasonRetired => 'Verkauft oder ausgemustert';

  @override
  String get reasonOtherLocation => 'Einem anderen Lagerort zugeordnet';

  @override
  String get reasonOutOfScope => 'Nicht Teil dieser Inventur';

  @override
  String get actionStocktakeCounted => 'Inventur';

  @override
  String get productModeTag => 'Inventarnummern vergeben';

  @override
  String get productModeRegister => 'Neu anlegen';

  @override
  String get productNotInterchangeable => 'Nicht austauschbar';

  @override
  String get productNotInterchangeableHint =>
      'Nicht austauschbar: Die Geräte werden bei der Ausgabe und beim Kiste-Checken nie gegeneinander getauscht.';

  @override
  String get productNotInterchangeableOn =>
      'Als nicht austauschbar markiert – die Geräte behalten ihren Platz.';

  @override
  String get productNotInterchangeableOff =>
      'Wieder austauschbar – ein Gerät, das zur Hand ist, darf den Platz eines anderen einnehmen.';

  @override
  String get productTagHint =>
      'Inventarnummer scannen: sie kommt an das angetippte Gerät, sonst an das nächste ohne Inventarnummer.';

  @override
  String get productNoUntagged =>
      'Alle Geräte haben schon eine Inventarnummer.';

  @override
  String get productUntagged => 'Ohne Inventarnummer';

  @override
  String get productNextScan => 'nächster Scan';

  @override
  String productTagged(String tag, String unit) {
    return '$tag an $unit vergeben';
  }

  @override
  String productRegistered(String tag) {
    return '$tag angelegt';
  }

  @override
  String productUnitCount(int total, int untagged) {
    return '$total Geräte · $untagged ohne Inventarnummer';
  }

  @override
  String get errorAssetTagInUse =>
      'Diese Inventarnummer ist schon an ein anderes Gerät vergeben.';

  @override
  String get errorAssetTagPrefixMismatch =>
      'Diese Inventarnummer gehört zu einer anderen Organisation – das Präfix passt nicht.';

  @override
  String get errorAssetAlreadyTagged =>
      'Dieses Gerät hat schon eine Inventarnummer. Ändern geht im Web.';

  @override
  String get errorStocktakeNotFound => 'Diese Inventur gibt es nicht mehr.';

  @override
  String get errorStocktakeClosed => 'Diese Inventur ist abgeschlossen.';

  @override
  String get errorStocktakeNotClosed => 'Schließe die Inventur zuerst ab.';

  @override
  String get errorStocktakeEmpty => 'Zu dieser Auswahl gibt es keine Geräte.';

  @override
  String get errorStocktakeNotYourTick =>
      'Nur wer ein Gerät gezählt hat, kann das ändern.';

  @override
  String get errorStocktakeNotFoundYet =>
      'Dieses Gerät wurde noch nicht gezählt.';

  @override
  String get errorStocktakeProductNotCounted =>
      'Dieses Produkt wird in dieser Inventur nicht gezählt.';

  @override
  String get errorStocktakeCountChanged =>
      'Deine Zählung hier wurde inzwischen auf einem anderen Gerät geändert. Jetzt steht die aktuelle Zahl da – zähl von dort weiter.';

  @override
  String get errorStocktakeActionApplied =>
      'Diese Korrektur wurde bereits angewendet.';

  @override
  String get errorNotACase =>
      'Dieses Gerät ist weder in einem Bundle noch hat es Zubehör – hier gibt es keine Kiste zu checken.';

  @override
  String get actionCaseChecked => 'Kiste gecheckt';

  @override
  String get caseCheck => 'Kiste checken';

  @override
  String get caseCheckScanCase =>
      'Kiste scannen: die Inventarnummer des Bundles oder eines Geräts darin.';

  @override
  String caseCheckProgress(int found, int expected) {
    return '$found von $expected da';
  }

  @override
  String caseCheckOutTo(String name) {
    return 'Ausgecheckt an $name';
  }

  @override
  String caseCheckLast(String date, String user, int found, int expected) {
    return 'Zuletzt gecheckt $date von $user: $found von $expected da';
  }

  @override
  String get caseCheckNever => 'Noch nie gecheckt';

  @override
  String get caseCheckShortOfType =>
      'Andere Kisten dieses Bundle-Typs enthalten mehr:';

  @override
  String caseCheckAwayOn(String name) {
    return 'Unterwegs auf $name';
  }

  @override
  String get caseCheckForeign => 'Gehört nicht in diese Kiste';

  @override
  String get caseCheckUnknownCode => 'Unbekannter Code';

  @override
  String get caseCheckItself => 'Das ist die Kiste selbst';

  @override
  String get caseCheckAlready => 'Schon abgehakt';

  @override
  String get caseCheckFound => 'Gefunden';

  @override
  String get caseCheckNoTag => 'Keine Inventarnummer: von Hand abhaken';

  @override
  String caseCheckMissingCount(int count) {
    return '$count fehlen';
  }

  @override
  String caseCheckAwayCount(int count) {
    return '$count auf anderen Jobs unterwegs';
  }

  @override
  String get caseCheckComplete => 'Alles da';

  @override
  String get caseCheckFinish => 'Abschließen und speichern';

  @override
  String get caseCheckSaved =>
      'In der Historie jedes Geräts der Kiste gespeichert.';

  @override
  String get caseCheckNext => 'Nächste Kiste';

  @override
  String get caseCheckNotSaved =>
      'Du kannst die Kiste checken, zum Speichern brauchst du aber die Rolle Mitglied.';

  @override
  String caseCheckDemoHint(String tag) {
    return 'Inventarnummer $tag der Kabelkiste probieren';
  }

  @override
  String get errorNotApproved =>
      'Dieses Gerät ist auf der Produktion nicht gebucht und genehmigt – nur die eigene Organisation der Produktion kann es hinzufügen.';

  @override
  String get errorCheckClosed =>
      'Diese Prüfung ist bereits abgeschlossen. Starte eine neue.';

  @override
  String get errorTickNotYours =>
      'Nur wer ein Gerät abgehakt hat, kann den Haken zurücknehmen.';

  @override
  String get errorReceiptForbidden =>
      'Nur die eigene Organisation der Produktion oder ihre Crew kann eine Übergabe bestätigen.';

  @override
  String get actionProductionChecked => 'Auf Produktion geprüft';

  @override
  String get actionHandoverReceived => 'Empfang bestätigt';

  @override
  String get actionReturnReported => 'Rückgabe gemeldet';

  @override
  String get productionCheck => 'Prüfen';

  @override
  String get productionCheckLenderOnly => 'nur eure Geräte';

  @override
  String get productionCheckEverything => 'Alles auf der Produktion';

  @override
  String productionCheckUnitsOf(String org) {
    return 'Nur die Geräte von $org';
  }

  @override
  String get productionCheckFound => 'Gefunden';

  @override
  String productionCheckFoundBy(String name) {
    return 'Gefunden von $name';
  }

  @override
  String get productionCheckAlready => 'Schon abgehakt';

  @override
  String get productionCheckNotOnList => 'Nicht auf dieser Liste';

  @override
  String productionCheckWithAccessories(String name, int count) {
    return '$name (+$count Zubehör)';
  }

  @override
  String get productionCheckNotOut => 'Noch nicht ausgegeben';

  @override
  String get productionCheckReceiptOpen => 'Empfang offen';

  @override
  String get productionCheckReceived => 'Empfangen';

  @override
  String get productionCheckReturnReported => 'Rückgabe gemeldet';

  @override
  String productionCheckLentBy(String org) {
    return 'von $org';
  }

  @override
  String get productionCheckEmpty =>
      'Für diese Produktion ist noch nichts gebucht.';

  @override
  String get productionCheckTickAll => 'Alle abhaken';

  @override
  String get productionCheckFinish => 'Abschließen und speichern';

  @override
  String productionCheckSaved(int found, int missing) {
    return 'Prüfung gespeichert: $found gefunden, $missing fehlen.';
  }

  @override
  String productionCheckConfirmReceipt(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Empfang von $count Geräten bestätigen',
      one: 'Empfang von 1 Gerät bestätigen',
    );
    return '$_temp0';
  }

  @override
  String productionCheckReportReturn(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count Geräte als zurückgegeben melden',
      one: '1 Gerät als zurückgegeben melden',
    );
    return '$_temp0';
  }

  @override
  String productionCheckReceiptDone(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Empfang für $count Geräte bestätigt',
      one: 'Empfang für 1 Gerät bestätigt',
    );
    return '$_temp0';
  }

  @override
  String productionCheckReturnDone(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count Geräte als zurückgegeben gemeldet',
      one: '1 Gerät als zurückgegeben gemeldet',
    );
    return '$_temp0';
  }

  @override
  String get productionCheckLentHint =>
      'Gilt für die abgehakten Geräte, die andere Organisationen dieser Produktion geliehen haben.';

  @override
  String get productionCheckClosed => 'Diese Prüfung ist abgeschlossen.';

  @override
  String productionCheckLentBySection(String org) {
    return 'Geliehen von $org';
  }

  @override
  String get productionCheckNoLocation => 'Ohne Lagerort';

  @override
  String get productionCheckTickSection => 'Abschnitt abhaken';

  @override
  String get productionActionBook => 'Ausgeben';

  @override
  String get productionActionBookHint =>
      'Scannen, abhaken oder zählen, was rausgeht. Jeder Haken bucht das Gerät sofort aus.';

  @override
  String get productionActionCheckHint =>
      'Abhaken, was da ist, gegen die Liste. Ändert nichts.';

  @override
  String get productionActionReturn => 'Zurücknehmen';

  @override
  String get productionActionReturnHint =>
      'Scannen, abhaken oder zählen, was zurückkommt. Jeder Haken bucht das Gerät zurück an seinen Lagerort.';

  @override
  String get listCountedLine => 'Ohne Inventarnummer · gezählt';

  @override
  String countOverMax(int max) {
    return 'Höchstens $max — so viele stehen auf der Liste.';
  }

  @override
  String accessoryDialogTitle(String name) {
    return 'Zubehör von $name';
  }

  @override
  String get accessoryDialogCheck => 'Ist alles da? Was fehlt, abwählen.';

  @override
  String get accessoryDialogCheckout =>
      'Geht alles mit? Was nicht mitgeht, abwählen.';

  @override
  String get accessoryDialogCheckin => 'Ist alles zurück? Was fehlt, abwählen.';

  @override
  String get accessoryDialogConfirm => 'Fertig';

  @override
  String listHowMany(int total) {
    return 'Wie viele von $total?';
  }

  @override
  String get handoutOut => 'Ausgegeben';

  @override
  String get handoutBack => 'Zurück';

  @override
  String get handoutEmptyCheckout =>
      'Für diese Produktion ist nichts gebucht, was du ausgeben könntest.';

  @override
  String get handoutEmptyCheckin =>
      'Von euch ist nichts für diese Produktion gebucht.';

  @override
  String handoutOthers(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other:
          '$count weitere Geräte gehören anderen Organisationen, die sie selbst buchen.',
      one: '1 weiteres Gerät gehört einer anderen Organisation, die es selbst bucht.',
    );
    return '$_temp0';
  }

  @override
  String get handoutCancelled =>
      'Diese Produktion wurde abgesagt. Es geht nichts mehr raus.';

  @override
  String get handoutAllOut => 'Alles ausgegeben';

  @override
  String get handoutAllBack => 'Alles zurück';

  @override
  String handoutOpen(int count) {
    return '$count noch offen';
  }

  @override
  String handoutRestOf(String name, int count) {
    return 'Auch den Rest von $name ($count)';
  }

  @override
  String get actionCheckoutUndone => 'Ausgabe zurückgenommen';

  @override
  String handoutOthersElsewhere(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other:
          '$count weitere Geräte der Produktion stehen nicht auf dieser Liste.',
      one: '1 weiteres Gerät der Produktion steht nicht auf dieser Liste.',
    );
    return '$_temp0';
  }

  @override
  String get handoutTakenBack =>
      'Zurückgenommen · abhaken, um es wieder auszugeben';

  @override
  String get handoutKitAddition => 'Neu im Bundle, noch nicht gebucht';

  @override
  String get listTickKit => 'Bundle abhaken';

  @override
  String kitDialogTitle(String name) {
    return 'Bundle $name';
  }

  @override
  String kitScanned(String name, int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$name: $count Geräte',
      one: '$name: 1 Gerät',
    );
    return '$_temp0';
  }

  @override
  String kitLeftOut(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count Geräte nicht dabei',
      one: '1 Gerät nicht dabei',
    );
    return '$_temp0';
  }

  @override
  String get lookupKit => 'Bundle';

  @override
  String get actionInspectionDeleted => 'Prüfung gelöscht';

  @override
  String get inspectionHeading => 'DGUV-Prüfung';

  @override
  String get historyInspectionPassed => 'DGUV-Prüfung bestanden';

  @override
  String get historyInspectionFailed => 'DGUV-Prüfung nicht bestanden';

  @override
  String historyInspectionDeleted(String date) {
    return 'DGUV-Prüfung vom $date gelöscht';
  }

  @override
  String historyInspectedOn(String date) {
    return 'am $date';
  }

  @override
  String get inspection => 'Prüfen (DGUV)';

  @override
  String get inspectionDate => 'Prüfdatum';

  @override
  String get inspectionInspector => 'Prüfer';

  @override
  String get inspectionInspectorHint => 'Name oder Firma';

  @override
  String get inspectionNotes => 'Bemerkung (optional)';

  @override
  String get inspectionNotesHint =>
      'Wird bei jedem Gerät dieses Durchgangs gespeichert';

  @override
  String get inspectionStart => 'Prüfung starten';

  @override
  String get inspectionEditSetup => 'Datum oder Prüfer ändern';

  @override
  String get inspectionPassed => 'Bestanden';

  @override
  String get inspectionFailed => 'Nicht bestanden';

  @override
  String get inspectionNextResult => 'Ergebnis für den nächsten Scan';

  @override
  String get inspectionFailedHint =>
      'Der nächste Scan wird als nicht bestanden erfasst und das Gerät auf Defekt gesetzt. Danach steht es wieder auf Bestanden.';

  @override
  String get inspectionEmpty => 'Noch kein Gerät geprüft. Scanne das erste.';

  @override
  String inspectionTally(int passed, int failed) {
    return '$passed bestanden · $failed nicht bestanden';
  }

  @override
  String inspectionNextDue(String date) {
    return 'Nächste Prüfung $date';
  }

  @override
  String get inspectionNotTracked => 'Kein Prüfintervall';

  @override
  String get inspectionMarkedBroken => 'Auf Defekt gesetzt';

  @override
  String get inspectionUndo => 'Rückgängig';

  @override
  String get inspectionUndone => 'Rückgängig gemacht';

  @override
  String get inspectionUndoneKeepsBroken =>
      'Prüfung gelöscht. Das Gerät bleibt auf Defekt.';

  @override
  String get inspectionAlreadyDeleted => 'Diese Prüfung ist schon gelöscht.';

  @override
  String get inspectionAlreadyTitle => 'Schon geprüft';

  @override
  String inspectionAlreadyBody(String name, String result) {
    return '$name wurde in diesem Durchgang schon als „$result“ erfasst. Nochmal erfassen?';
  }

  @override
  String get inspectionRecordAgain => 'Nochmal erfassen';

  @override
  String get inspectionRetired =>
      'Verkaufte oder ausgemusterte Geräte werden nicht geprüft.';

  @override
  String get inspectionForbidden =>
      'Prüfungen erfassen dürfen nur Admins der Organisation, der das Gerät gehört.';

  @override
  String get inspectionInterval => 'Prüfintervall';

  @override
  String inspectionIntervalMonths(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Alle $count Monate',
      one: 'Jeden Monat',
    );
    return '$_temp0';
  }

  @override
  String get inspectionNextDueLabel => 'Nächste Prüfung';

  @override
  String get inspectionOverdue => 'überfällig';

  @override
  String get inspectionDueToday => 'heute fällig';

  @override
  String get inspectionNeverInspected => 'noch nie geprüft';

  @override
  String get inspectionRecent => 'Letzte Prüfungen';

  @override
  String get caseLabel => 'Etikett drucken';

  @override
  String get caseLabelLarge => 'Groß · 4×6″';

  @override
  String get caseLabelSmall => 'Klein · 80×55 mm';

  @override
  String get caseLabelLayoutList => 'Liste';

  @override
  String get caseLabelLayoutGrid => 'Kacheln mit Bildern';

  @override
  String get caseLabelContentsAuto => 'Inhalt, wenn er passt';

  @override
  String get caseLabelContentsShow => 'Mit Inhalt';

  @override
  String get caseLabelContentsHide => 'Nur Name';

  @override
  String get caseLabelContentsDidNotFit =>
      'Der Inhalt passt nicht aufs kleine Etikett, darum steht nur der Name darauf.';

  @override
  String get caseLabelIncludeCase => 'Behälter mit aufführen';

  @override
  String get caseLabelIncludeCaseHint =>
      'Das Etikett klebt auf diesem Behälter, darum fehlt er standardmäßig im Inhalt.';

  @override
  String get caseLabelPictures => 'Produktbilder';

  @override
  String get caseLabelPicturesHint =>
      'Ohne Bilder zeigt jede Kachel groß die Anzahl, und es passen mehr auf ein Etikett.';

  @override
  String get caseLabelPreviewHintServer =>
      'Vorschau von deinem Technikpool-Server gerendert. Der Drucker zeichnet Schriften womöglich etwas anders.';

  @override
  String get caseLabelPrint => 'Drucken';

  @override
  String caseLabelSent(String printer) {
    return 'An $printer gesendet';
  }

  @override
  String get caseLabelOpenLabelary => 'In Labelary öffnen';

  @override
  String caseLabelPreviewFailed(String detail) {
    return 'Keine Vorschau: $detail';
  }

  @override
  String get caseLabelPreviewHint =>
      'Vorschau gerendert von labelary.com, das dafür den Text des Etiketts erhält. Der Drucker zeichnet Schriften womöglich etwas anders.';

  @override
  String get labelPrinter => 'Etikettendrucker';

  @override
  String get labelPrinterNone => 'Nicht eingerichtet';

  @override
  String get labelPrinterAddress => 'Druckeradresse';

  @override
  String get labelPrinterHelp =>
      'Die IP-Adresse des Druckers in diesem Netzwerk, wahlweise mit Port (Standard 9100). Er muss ZPL verstehen – bei Honeywell-Druckern die Befehlssprache auf ZSim stellen.';

  @override
  String get labelPrinterInvalid => 'Keine gültige Adresse';

  @override
  String get labelPrinterTest => 'Testdruck';

  @override
  String get labelPrinterSetUp => 'Drucker einrichten';

  @override
  String get labelPrinterRemove => 'Drucker entfernen';

  @override
  String labelPrinterUnreachable(String printer, String detail) {
    return 'Drucker unter $printer nicht erreichbar: $detail';
  }

  @override
  String labelPrinterTimeout(String printer) {
    return 'Der Drucker unter $printer antwortet nicht';
  }

  @override
  String caseLabelPage(int page, int count) {
    return 'Etikett $page von $count';
  }

  @override
  String get inspectionType => 'Prüfart';

  @override
  String get inspectionExternal => 'Von einer externen Firma geprüft';

  @override
  String get inspectionExternalHint =>
      'Firma oder Prüfer und deren Qualifikation eintragen.';

  @override
  String get inspectionOwnHint =>
      'Erfasst unter deinem Namen. Prüfarten mit Befähigung brauchen eine in der Organisation des Geräts.';

  @override
  String get inspectionExternalShort => 'extern';

  @override
  String get inspectionQualification => 'Deren Qualifikation';

  @override
  String get inspectionQualificationHint => 'z. B. Elektrofachkraft';

  @override
  String get inspectionOverdueNote => 'Prüfung überfällig';

  @override
  String inspectionOverdueOf(String types) {
    return 'Prüfung überfällig: $types';
  }

  @override
  String get reportDefect => 'Defekt melden';

  @override
  String get defectWhatIsWrong => 'Was ist kaputt?';

  @override
  String get defectHint =>
      'Wird als nicht bestandene Sichtprüfung erfasst. Das Gerät kommt in Wartung; zurückbuchen geht trotzdem.';

  @override
  String get defectReported => 'Defekt gemeldet';

  @override
  String get defectReportedDone => 'Defekt gemeldet · das Gerät ist in Wartung';

  @override
  String get createNew => 'Neu anlegen';

  @override
  String get bundle => 'Bundle';

  @override
  String get bundleNew => 'Neues Bundle';

  @override
  String get bundleNewHint => 'Eine leere Kiste, gefüllt per Scan';

  @override
  String get bundleName => 'Name';

  @override
  String get bundleCategory => 'Kategorie';

  @override
  String get bundleTag => 'Inventarnummer (optional)';

  @override
  String get bundleTagHint => 'Etikett der Kiste scannen oder eintippen';

  @override
  String get bundleCaption => 'Beschreibung (optional)';

  @override
  String get bundleCreate => 'Bundle anlegen';

  @override
  String bundleCreated(String name) {
    return 'Bundle $name angelegt';
  }

  @override
  String get bundleEdit => 'Bundle bearbeiten';

  @override
  String get bundleReadOnly =>
      'Nur ein Admin der Organisation kann dieses Bundle ändern.';

  @override
  String get bundleScanHint =>
      'Gerät oder Etikett eines anderen Bundles scannen, um es hineinzulegen';

  @override
  String get bundleNoTag => 'Ohne Etikett';

  @override
  String bundleUnitCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count Geräte',
      one: '1 Gerät',
    );
    return '$_temp0';
  }

  @override
  String get bundleEmpty => 'Noch nichts in diesem Bundle.';

  @override
  String get bundleEmptyEdit =>
      'Noch nichts in diesem Bundle. Scanne ein Gerät, um es hineinzulegen, oder füge lose Geräte per Name hinzu.';

  @override
  String get bundleAccessory => 'Zubehör';

  @override
  String bundleUnitOut(String production) {
    return 'Unterwegs bei $production';
  }

  @override
  String bundleScanAdded(String name) {
    return '$name liegt jetzt im Bundle';
  }

  @override
  String bundleScanAlreadyIn(String name) {
    return '$name ist schon in diesem Bundle';
  }

  @override
  String get bundleScanIsBundle =>
      'Das ist die Nummer eines Bundles. Bundles kommen nicht in Bundles.';

  @override
  String bundleInside(String kit) {
    return 'Steckt in $kit';
  }

  @override
  String get bundleInnerKits => 'Enthaltene Bundles';

  @override
  String bundleInnerRemoveQuestion(String name) {
    return '$name aus diesem Bundle herausnehmen? Es bleibt, wo es ist, mit allem, was darin ist.';
  }

  @override
  String get bundleScanUnknown =>
      'Der Server hat nicht gesagt, was mit diesem Scan passiert ist.';

  @override
  String get bundleMoveTitle => 'In einem anderen Bundle';

  @override
  String bundleMoveQuestion(String unit, String kit) {
    return '$unit liegt im Bundle $kit. Dort herausnehmen und hier hineinlegen?';
  }

  @override
  String get bundleMoveConfirm => 'Hierher umlegen';

  @override
  String bundleMoveSkipped(String unit, String kit) {
    return '$unit bleibt in $kit';
  }

  @override
  String get bundleRemove => 'Herausnehmen';

  @override
  String get bundleRemoveTitle => 'Aus dem Bundle nehmen?';

  @override
  String bundleRemoveQuestion(String name) {
    return '$name aus dem Bundle nehmen? Das Gerät bleibt, wo es ist.';
  }

  @override
  String bundleRemoveWithAccessories(String name, int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Die $count Zubehörteile kommen mit.',
      one: 'Das Zubehör kommt mit.',
    );
    return '$name aus dem Bundle nehmen? $_temp0';
  }

  @override
  String bundleRemoved(String name) {
    return '$name herausgenommen';
  }

  @override
  String get bundleAddLoose => 'Lose Geräte hinzufügen';

  @override
  String bundleLooseAdded(int count, String name) {
    return '$count × $name ins Bundle gelegt';
  }

  @override
  String get add => 'Hinzufügen';

  @override
  String availableUntagged(int available, int untagged) {
    return '$available verfügbar ($untagged ohne Etikett)';
  }

  @override
  String get searchMinLength => 'Mindestens zwei Buchstaben eingeben.';

  @override
  String get countLess => 'Eins weniger';

  @override
  String get countMore => 'Eins mehr';

  @override
  String get handoutAddByName => 'Per Name ausgeben';

  @override
  String get handoutAddHandOut => 'Ausgeben';

  @override
  String handoutAddedCount(int count, String name) {
    return '$count × $name ausgegeben';
  }

  @override
  String get bundleEditDone => 'Bearbeiten beenden';

  @override
  String get bundleScanViewMode =>
      'Bearbeiten ist aus. Tippe auf den Stift, um Geräte hineinzulegen.';

  @override
  String get done => 'Fertig';

  @override
  String get deviceNew => 'Neues Gerät';

  @override
  String get deviceNewHint =>
      'Geräte eines Produkts erfassen, mit oder ohne Etikett';

  @override
  String get deviceProduct => 'Produkt';

  @override
  String get deviceProductSearch => 'Im Katalog suchen';

  @override
  String get deviceProductChange => 'Ändern';

  @override
  String get deviceProductNew => 'Neues Produkt';

  @override
  String get deviceProductSearchInstead => 'Doch im Katalog suchen';

  @override
  String get deviceProductName => 'Produktname';

  @override
  String get deviceManufacturer => 'Hersteller (optional)';

  @override
  String deviceProductCreated(String name) {
    return 'Produkt $name angelegt';
  }

  @override
  String get deviceLocation => 'Lagerort';

  @override
  String get deviceBundle => 'In Bundle (optional)';

  @override
  String get deviceNoBundle => 'Kein Bundle';

  @override
  String get deviceModeScan => 'Etiketten scannen';

  @override
  String get deviceModeUntagged => 'Ohne Etikett';

  @override
  String get deviceScanHint => 'Jedes gescannte Etikett wird ein neues Gerät.';

  @override
  String get deviceScanOtherMode =>
      'Zum Erfassen per Scan auf „Etiketten scannen“ wechseln.';

  @override
  String get deviceUntaggedCount => 'Wie viele?';

  @override
  String deviceRegisterUntagged(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count Geräte erfassen',
      one: '1 Gerät erfassen',
    );
    return '$_temp0';
  }

  @override
  String deviceRegisteredUntagged(int count) {
    return '$count × ohne Etikett';
  }

  @override
  String deviceRegistered(int count) {
    return 'Erfasst ($count)';
  }

  @override
  String get deviceNeedsProduct => 'Zuerst ein Produkt wählen.';

  @override
  String get deviceNeedsNewProduct =>
      'Das neue Produkt braucht einen Namen und eine Kategorie.';

  @override
  String get deviceNeedsLocation => 'Zuerst einen Lagerort wählen.';

  @override
  String get inventoryBundleView => 'Bundle-Ansicht';

  @override
  String get inventoryAllProducts => 'Alle Produkte';

  @override
  String get inventoryAllDevices => 'Alle Geräte';

  @override
  String get productScanViewMode =>
      'Nichts geändert. Zum Vergeben „Inventarnummern vergeben“ im ⋮-Menü wählen.';

  @override
  String get productTagDone => 'Vergeben beenden';

  @override
  String get inventorySearch => 'Suchen oder Inventarnummer eingeben';

  @override
  String get actionSwapped => 'Getauscht';

  @override
  String swapIn(String partner, String place) {
    return 'Getauscht mit $partner ($place)';
  }

  @override
  String swapPartnerMoved(String partner, String place) {
    return '$partner gehört jetzt zu $place';
  }

  @override
  String swapPartnerLoose(String partner) {
    return '$partner ist jetzt lose';
  }

  @override
  String historySwapNow(String partner, String place) {
    return 'Mit $partner, jetzt in $place';
  }

  @override
  String historySwapLoose(String partner) {
    return 'Mit $partner, jetzt lose';
  }

  @override
  String packCase(String title) {
    return 'Kiste $title';
  }

  @override
  String packCaseInside(String number) {
    return 'in Kiste $number';
  }

  @override
  String get packCaseOpenNote => 'offen';

  @override
  String get packLoose => 'Lose';

  @override
  String packOpenBanner(String title) {
    return 'Packen in Kiste $title';
  }

  @override
  String get packOpenHint =>
      'Was du scannst, kommt hinein und geht mit ihr raus. Scanne eine andere Kiste, um zu wechseln.';

  @override
  String get packClose => 'Kiste zu';

  @override
  String get packOpen => 'In diese Kiste packen';

  @override
  String packOpened(String title) {
    return 'Kiste $title ist offen';
  }

  @override
  String get packScanNext => 'Was du jetzt scannst, kommt hinein.';

  @override
  String get packChoiceTitle => 'Andere Kiste';

  @override
  String packChoiceQuestion(String open, String scanned) {
    return 'Kiste $open ist offen. Kommt Kiste $scanned hinein, oder willst du jetzt Kiste $scanned packen?';
  }

  @override
  String get packChoiceInto => 'Hineinlegen';

  @override
  String get packChoiceSwitch => 'Stattdessen öffnen';

  @override
  String packNested(String inner, String outer) {
    return 'Kiste $inner steckt in Kiste $outer';
  }

  @override
  String packInto(String number) {
    return 'In Kiste $number';
  }

  @override
  String packTakeOut(String number) {
    return 'Aus Kiste $number nehmen';
  }

  @override
  String packReturned(String title) {
    return 'Zurückgenommen: Kiste $title';
  }

  @override
  String get packReturnedQuestion =>
      'Die Kiste ist zurück. Ist all das wieder darin? Nimm den Haken bei dem weg, was fehlt – es bleibt ausgegeben.';

  @override
  String get packNothingElse => 'Sonst ist nichts darin.';

  @override
  String packStaysOut(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count Einträge bleiben ausgegeben',
      one: '1 Eintrag bleibt ausgegeben',
    );
    return '$_temp0';
  }

  @override
  String get packAllBack => 'Ihr ganzer Inhalt ist zurück.';

  @override
  String get errorNotAPackCase => 'Das ist keine Pack-Kiste dieser Produktion.';

  @override
  String get errorPackCircle =>
      'Eine Kiste kann nicht in sich selbst oder in etwas, das in ihr steckt.';

  @override
  String bundleNumberFromCase(String number) {
    return 'Nummer: $number';
  }

  @override
  String bundleExtraCases(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other:
          '$count weitere Behälter darin – die niedrigste Gerätenummer ist seine Kiste',
      one: '1 weiterer Behälter darin – die niedrigste Gerätenummer ist seine Kiste',
    );
    return '$_temp0';
  }

  @override
  String caseOfKit(String kit) {
    return 'Kiste von $kit';
  }

  @override
  String kitSwapIn(String replaced, String kit) {
    return 'Statt $replaced · Buchung auf $kit umgestellt';
  }

  @override
  String get actionKitReplaced => 'Kit getauscht';

  @override
  String historyKitTookOver(String kit) {
    return 'Buchung von $kit übernommen';
  }

  @override
  String historyKitReleased(String kit) {
    return 'Stattdessen ging $kit raus';
  }

  @override
  String errorKitStarted(String kit) {
    return '$kit ist schon angefangen – Geräte einzeln scannen.';
  }

  @override
  String errorKitNotInterchangeable(String kit, String scanned) {
    return '$kit ist gebucht, und in $scanned steckt ein Gerät, das als nicht austauschbar markiert ist – $kit scannen.';
  }

  @override
  String errorKitUnavailable(String kit, String scanned) {
    return '$kit ist gebucht, und $scanned ist unterwegs oder für dieselben Tage anderweitig gebucht – $kit scannen.';
  }
}
