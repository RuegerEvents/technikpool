// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class SEn extends S {
  SEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'Technikpool Scanner';

  @override
  String get connectTitle => 'Connect to Technikpool';

  @override
  String get serverAddress => 'Server address';

  @override
  String get serverAddressHint => 'https://technikpool.example.com';

  @override
  String get scanServerQr =>
      'Scan the QR code on the \"Tools › Scanners\" page, or type the address in by hand.';

  @override
  String get continueLabel => 'Continue';

  @override
  String get codeInstructions =>
      'Enter this code under \"Tools › Scanners\" in your browser:';

  @override
  String get waitingForApproval => 'Waiting for approval…';

  @override
  String get codeExpired => 'The code has expired. Please start over.';

  @override
  String get accessDenied => 'The request was denied.';

  @override
  String get startOver => 'Start over';

  @override
  String get signInWithPassword => 'Sign in with a password instead';

  @override
  String get useDeviceCode => 'Connect with a code instead';

  @override
  String get email => 'Email';

  @override
  String get password => 'Password';

  @override
  String get signIn => 'Sign in';

  @override
  String get location => 'Location';

  @override
  String get production => 'Production';

  @override
  String get startSession => 'Start session';

  @override
  String get search => 'Search';

  @override
  String get noResults => 'No matches';

  @override
  String get scanNow => 'Ready — pull the trigger';

  @override
  String get scansLabel => 'Scans';

  @override
  String get okLabel => 'OK';

  @override
  String get errorLabel => 'Errors';

  @override
  String get sessionEmpty => 'Nothing scanned yet.';

  @override
  String get lookup => 'Look up';

  @override
  String get lookupHint => 'Scan a label to see its details.';

  @override
  String get serialNumber => 'Serial number';

  @override
  String get status => 'Status';

  @override
  String get currentLocation => 'Current location';

  @override
  String get checkedOutTo => 'Checked out to';

  @override
  String get history => 'History';

  @override
  String get inventory => 'Inventory';

  @override
  String get filterByLocation => 'Location';

  @override
  String get filterByCategory => 'Category';

  @override
  String get all => 'All';

  @override
  String get loadMore => 'Load more';

  @override
  String get settings => 'Settings';

  @override
  String get connectedAs => 'Signed in as';

  @override
  String get server => 'Server';

  @override
  String get disconnect => 'Disconnect';

  @override
  String get scannerConfig => 'Scanner configuration';

  @override
  String get broadcastActions => 'Broadcast actions';

  @override
  String get extraKeys => 'Extra keys';

  @override
  String get configHint =>
      'Comma-separated. Diagnostics will tell you the right values for this device.';

  @override
  String get save => 'Save';

  @override
  String get saved => 'Saved';

  @override
  String get diagnostics => 'Diagnostics';

  @override
  String get diagnosticsHint =>
      'Pull the trigger. Every broadcast received shows up here with all its extras.';

  @override
  String get diagnosticsEmpty => 'Nothing received yet.';

  @override
  String get useThisPair => 'Use these values';

  @override
  String get language => 'Language';

  @override
  String get languageSystem => 'System language';

  @override
  String get scanInput => 'Scan input';

  @override
  String get scanWithCamera => 'Scan with camera';

  @override
  String get cameraHint => 'Hold the label inside the frame.';

  @override
  String get cameraDenied =>
      'No camera access. Allow it in system settings and try again.';

  @override
  String get cameraUnsupported => 'This device has no usable camera.';

  @override
  String get cameraFailed => 'The camera could not be started.';

  @override
  String get torch => 'Light';

  @override
  String get scanModeAuto => 'Automatic';

  @override
  String get scanModeAutoHint =>
      'The hardware trigger on known scanner models, and on any device once it delivers a scan — otherwise the camera.';

  @override
  String get scanModeHardware => 'Hardware trigger';

  @override
  String get scanModeHardwareHint => 'Only the device\'s built-in scan engine.';

  @override
  String get scanModeCamera => 'Camera';

  @override
  String get scanModeCameraHint =>
      'Only the camera. For phones with no scan engine.';

  @override
  String get hardwareDetected => 'Hardware scanner detected';

  @override
  String get hardwareNotDetected => 'No hardware scan received yet';

  @override
  String get knownPdaModel => 'Known scanner model';

  @override
  String get scanQrWithCamera => 'Scan QR code with camera';

  @override
  String get statusAvailable => 'Available';

  @override
  String get statusMaintenance => 'In maintenance';

  @override
  String get statusBroken => 'Broken';

  @override
  String get statusSold => 'Sold';

  @override
  String get demoStart => 'Explore the demo';

  @override
  String get demoExplainer =>
      'No server to hand? The demo runs a small warehouse on this device — nothing is sent anywhere.';

  @override
  String get demoBannerText =>
      'Demo mode — sample data, stored on this device only.';

  @override
  String get demoLeave => 'Leave demo';

  @override
  String demoTagHint(String tag) {
    return 'Try tag $tag — Inventory lists them all';
  }

  @override
  String get statusDecommissioned => 'Decommissioned';

  @override
  String get actionCreated => 'Created';

  @override
  String get actionCheckedOut => 'Checked out';

  @override
  String get actionReturned => 'Returned';

  @override
  String get actionLocationAssigned => 'Put away';

  @override
  String get actionUpdated => 'Updated';

  @override
  String get actionDeleted => 'Deleted';

  @override
  String get actionInspected => 'Inspected';

  @override
  String get retry => 'Try again';

  @override
  String get manualEntry => 'Enter label by hand';

  @override
  String get reset => 'Reset';

  @override
  String returnedFrom(String names) {
    return 'returned from $names';
  }

  @override
  String get errorAssetNotFound => 'This label is unknown.';

  @override
  String get errorForbidden => 'No access to this item.';

  @override
  String get errorWrongOrganization =>
      'That location belongs to a different organisation.';

  @override
  String get errorAssetRetired =>
      'This device has been sold or decommissioned and can no longer be booked.';

  @override
  String get errorUnauthorized =>
      'The session has expired. Please connect again.';

  @override
  String get errorInvalidRequest => 'Invalid request.';

  @override
  String get errorInvalidLimit => 'Invalid page size.';

  @override
  String get errorNetwork => 'Server unreachable.';

  @override
  String get errorInternal => 'Server error.';

  @override
  String get errorNoToken => 'The server returned no session token.';
}
