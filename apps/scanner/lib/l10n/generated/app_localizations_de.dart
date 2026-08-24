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
  String get lookup => 'Nachschlagen';

  @override
  String get lookupHint => 'Etikett scannen, um Details zu sehen.';

  @override
  String get serialNumber => 'Seriennummer';

  @override
  String get status => 'Status';

  @override
  String get currentLocation => 'Aktueller Lagerort';

  @override
  String get checkedOutTo => 'Ausgebucht an';

  @override
  String get history => 'Verlauf';

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
  String get cameraHint => 'Etikett in den Rahmen halten.';

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
    return 'Etikett $tag probieren — im Inventar stehen alle';
  }

  @override
  String get statusDecommissioned => 'Ausgemustert';

  @override
  String get actionCreated => 'Angelegt';

  @override
  String get actionCheckedOut => 'Ausgebucht';

  @override
  String get actionReturned => 'Zurückgegeben';

  @override
  String get actionLocationAssigned => 'Eingelagert';

  @override
  String get actionUpdated => 'Geändert';

  @override
  String get actionDeleted => 'Gelöscht';

  @override
  String get actionInspected => 'Geprüft';

  @override
  String get retry => 'Erneut versuchen';

  @override
  String get manualEntry => 'Etikett manuell eingeben';

  @override
  String get reset => 'Zurücksetzen';

  @override
  String returnedFrom(String names) {
    return 'zurück von $names';
  }

  @override
  String get errorAssetNotFound => 'Dieses Etikett ist unbekannt.';

  @override
  String get errorForbidden => 'Kein Zugriff auf diesen Artikel.';

  @override
  String get errorWrongOrganization =>
      'Der Lagerort gehört zu einer anderen Organisation.';

  @override
  String get errorAssetRetired =>
      'Dieses Gerät ist verkauft oder ausgemustert und kann nicht mehr gebucht werden.';

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
}
