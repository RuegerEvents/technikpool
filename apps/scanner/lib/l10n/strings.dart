/// German-first UI copy, kept in one place. The web app defaults to German and
/// the people using these devices work in German, so the app ships German only
/// for now. Structured as a flat class so it can be swapped for
/// flutter_localizations + ARB later without touching call sites.
class S {
  const S._();

  // Pairing
  static const appTitle = 'Technikpool Scanner';
  static const connectTitle = 'Mit Technikpool verbinden';
  static const serverAddress = 'Serveradresse';
  static const serverAddressHint = 'https://technikpool.example.com';
  static const scanServerQr =
      'Scanne den QR-Code auf der Seite "Werkzeuge › Scanner" oder gib die Adresse von Hand ein.';
  static const continueLabel = 'Weiter';
  static const codeInstructions =
      'Gib diesen Code unter "Werkzeuge › Scanner" im Browser ein:';
  static const waitingForApproval = 'Warte auf Bestätigung…';
  static const codeExpired = 'Der Code ist abgelaufen. Bitte neu starten.';
  static const accessDenied = 'Die Anfrage wurde abgelehnt.';
  static const startOver = 'Neu starten';
  static const signInWithPassword = 'Stattdessen mit Passwort anmelden';
  static const useDeviceCode = 'Stattdessen mit Code verbinden';
  static const email = 'E-Mail';
  static const password = 'Passwort';
  static const signIn = 'Anmelden';

  // Home / session
  static const home = 'Start';
  static const target = 'Ziel';
  static const location = 'Lagerort';
  static const production = 'Produktion';
  static const startSession = 'Session starten';
  static const endSession = 'Session beenden';
  static const search = 'Suchen';
  static const noResults = 'Keine Treffer';
  static const scanNow = 'Bereit — Auslöser drücken';
  static const scansLabel = 'Scans';
  static const okLabel = 'OK';
  static const errorLabel = 'Fehler';
  static const sessionEmpty = 'Noch nichts gescannt.';

  // Lookup
  static const lookup = 'Nachschlagen';
  static const lookupHint = 'Etikett scannen, um Details zu sehen.';
  static const serialNumber = 'Seriennummer';
  static const status = 'Status';
  static const currentLocation = 'Aktueller Lagerort';
  static const checkedOutTo = 'Ausgebucht an';
  static const history = 'Verlauf';

  // Inventory
  static const inventory = 'Bestand';
  static const filterByLocation = 'Nach Lagerort filtern';
  static const filterByProduction = 'Nach Produktion filtern';
  static const all = 'Alle';
  static const loadMore = 'Mehr laden';

  // Settings
  static const settings = 'Einstellungen';
  static const connectedAs = 'Angemeldet als';
  static const server = 'Server';
  static const disconnect = 'Verbindung trennen';
  static const scannerConfig = 'Scanner-Konfiguration';
  static const broadcastActions = 'Broadcast-Actions';
  static const extraKeys = 'Extra-Keys';
  static const configHint =
      'Kommagetrennt. Die richtigen Werte findest du über die Diagnose.';
  static const save = 'Speichern';
  static const saved = 'Gespeichert';
  static const diagnostics = 'Diagnose';
  static const diagnosticsHint =
      'Drücke den Auslöser. Hier erscheint jeder empfangene Broadcast mit allen Extras.';
  static const diagnosticsEmpty = 'Noch nichts empfangen.';
  static const useThisPair = 'Diese Werte übernehmen';

  // Scan input
  static const scanInput = 'Scan-Eingabe';
  static const scanWithCamera = 'Mit Kamera scannen';
  static const cameraScanner = 'Kamera-Scanner';
  static const cameraHint = 'Etikett in den Rahmen halten.';
  static const cameraDenied =
      'Kein Kamerazugriff. Erlaube ihn in den Systemeinstellungen und versuche es erneut.';
  static const cameraUnsupported = 'Dieses Gerät hat keine nutzbare Kamera.';
  static const cameraFailed = 'Die Kamera konnte nicht gestartet werden.';
  static const torch = 'Licht';
  static const scanModeAuto = 'Automatisch';
  static const scanModeAutoHint =
      'Hardware-Auslöser bei bekannten Scanner-Modellen und sobald ein Gerät '
      'einen Scan liefert — sonst Kamera.';
  static const scanModeHardware = 'Hardware-Auslöser';
  static const scanModeHardwareHint = 'Nur die eingebaute Scan-Engine des Geräts.';
  static const scanModeCamera = 'Kamera';
  static const scanModeCameraHint = 'Nur die Kamera. Für Telefone ohne Scan-Engine.';
  static const hardwareDetected = 'Hardware-Scanner erkannt';
  static const hardwareNotDetected = 'Noch kein Hardware-Scan empfangen';
  static const knownPdaModel = 'Bekanntes Scanner-Modell';
  static const scanQrWithCamera = 'QR-Code mit Kamera scannen';

  // Generic
  static const retry = 'Erneut versuchen';
  static const cancel = 'Abbrechen';
  static const manualEntry = 'Etikett manuell eingeben';
  static const submit = 'Übernehmen';
  static const close = 'Schließen';
  static const reset = 'Zurücksetzen';
  static const sessionExpired = 'Die Sitzung ist abgelaufen. Bitte erneut verbinden.';
}
