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
  String notAServerCode(String code) {
    return '\"$code\" is not a server address. Asset tags are scanned after connecting — or in the demo.';
  }

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
  String get ways => 'Ways';

  @override
  String get connectors => 'Connectors';

  @override
  String get cableLength => 'Length';

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
  String get whatsNew => 'What\'s new';

  @override
  String versionLabel(String version) {
    return 'Version $version';
  }

  @override
  String whatsNewIn(String version) {
    return 'What\'s new in $version';
  }

  @override
  String get dismiss => 'Dismiss';

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
  String get statusUnavailable => 'Unavailable';

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
  String get actionRequested => 'Requested';

  @override
  String get actionAddedToProduction => 'Added to production';

  @override
  String get actionApproved => 'Approved';

  @override
  String get actionDeclined => 'Declined';

  @override
  String get actionBookingCancelled => 'Released';

  @override
  String get actionAccessoryAttached => 'Accessory attached';

  @override
  String get actionAccessoryDetached => 'Accessory detached';

  @override
  String get actionCredentialsSet => 'Credentials saved';

  @override
  String get actionCredentialsRemoved => 'Credentials removed';

  @override
  String get actionCredentialsRevealed => 'Credentials viewed';

  @override
  String get actionDeleted => 'Deleted';

  @override
  String get actionInspected => 'Inspected';

  @override
  String get retry => 'Try again';

  @override
  String get manualEntry => 'Enter label or serial number by hand';

  @override
  String get reset => 'Reset';

  @override
  String returnedFrom(String names) {
    return 'returned from $names';
  }

  @override
  String get errorAssetNotFound => 'This label is unknown.';

  @override
  String get errorSerialAmbiguous =>
      'Several devices share this serial number. Scan the asset tag instead.';

  @override
  String get errorForbidden => 'No access to this item.';

  @override
  String get errorWrongOrganization =>
      'That location belongs to a different organisation.';

  @override
  String get errorAssetRetired =>
      'This device has been sold or decommissioned and can no longer be booked.';

  @override
  String get errorAssetUnavailable =>
      'This device is marked unavailable and cannot be checked out.';

  @override
  String get errorProductionCancelled =>
      'This production has been cancelled. Nothing can be checked out to it.';

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

  @override
  String get cancel => 'Cancel';

  @override
  String get stocktake => 'Stocktake';

  @override
  String get stocktakeNew => 'New stocktake';

  @override
  String get stocktakeNone => 'No stocktake is open.';

  @override
  String stocktakeProgress(int found, int expected) {
    return '$found of $expected counted';
  }

  @override
  String stocktakeOutCount(int count) {
    return '$count out on jobs';
  }

  @override
  String stocktakeUnexpectedCount(int count) {
    return '$count unexpected';
  }

  @override
  String get stocktakeWhereAreYou => 'Where are you counting?';

  @override
  String get stocktakeOrganization => 'Organization';

  @override
  String get stocktakeLocations => 'Locations';

  @override
  String get stocktakeCategories => 'Categories';

  @override
  String get stocktakeNoneMeansAll => 'None selected means all.';

  @override
  String get stocktakeName => 'Name';

  @override
  String stocktakeDefaultName(String date) {
    return 'Stocktake $date';
  }

  @override
  String stocktakePreview(int units, int loose, int out) {
    return '$units units to scan · $loose loose units to count · $out out on jobs';
  }

  @override
  String stocktakeOverlap(String name, int count) {
    return 'Overlaps with open stocktake $name ($count units)';
  }

  @override
  String get stocktakeStart => 'Start stocktake';

  @override
  String get stocktakeNoOrgs =>
      'Starting a stocktake needs at least the MEMBER role in an organization.';

  @override
  String get stocktakeTabOpen => 'Open here';

  @override
  String get stocktakeFound => 'Counted';

  @override
  String get stocktakeUnexpected => 'Not on the list';

  @override
  String stocktakeAlready(String name) {
    return 'Already counted by $name';
  }

  @override
  String stocktakeWasOut(String name) {
    return 'checked out to $name';
  }

  @override
  String stocktakeBundle(String name) {
    return 'Bundle $name';
  }

  @override
  String get stocktakeConfirmAccessories => 'Is everything with it?';

  @override
  String get stocktakeConfirmBundle => 'Is everything in it?';

  @override
  String groupBelongsWith(String name) {
    return 'Belongs with $name';
  }

  @override
  String get groupOnlyThis => 'Only this one';

  @override
  String get groupBookHint =>
      'Only the scanned unit was booked. Book the rest along?';

  @override
  String groupBook(int count) {
    return 'Book $count more';
  }

  @override
  String groupBooked(int count) {
    return '$count more booked';
  }

  @override
  String get groupAlreadyThere => 'already there';

  @override
  String get stocktakeGroupHint =>
      'The scanned unit is counted. Count the rest too? Uncheck whatever is missing.';

  @override
  String get stocktakeConfirmHint => 'Uncheck whatever is missing.';

  @override
  String get stocktakeConfirm => 'Confirm';

  @override
  String stocktakeConfirmed(int count) {
    return '$count confirmed';
  }

  @override
  String stocktakeCountedBy(String name) {
    return 'counted by $name';
  }

  @override
  String get stocktakeNothingOpenHere => 'Nothing left to find here.';

  @override
  String get stocktakeLoose => 'Count instead of scan';

  @override
  String stocktakeLooseLine(int expected, int counted) {
    return '$expected expected here · $counted counted in total';
  }

  @override
  String get stocktakeYourCount => 'Your count here';

  @override
  String get stocktakePlusOne => 'One more';

  @override
  String get stocktakeMinusOne => 'One less';

  @override
  String get stocktakeNoMatch => 'Nothing open here matches.';

  @override
  String get stocktakeTickHint => 'Tap to count by hand';

  @override
  String get stocktakeManualTicked => 'Counted by hand';

  @override
  String get stocktakeUndo => 'Take back count';

  @override
  String get stocktakeUnticked => 'Count taken back';

  @override
  String get stocktakeNote => 'Note';

  @override
  String get stocktakeNeedsAttention => 'Needs attention';

  @override
  String get stocktakeEditNote => 'Note and condition';

  @override
  String get stocktakeClose => 'Close stocktake';

  @override
  String stocktakeCloseConfirm(int count) {
    return '$count units not counted yet will be marked missing. This cannot be undone.';
  }

  @override
  String get stocktakeClosed =>
      'Stocktake closed. Corrections, such as marking missing units or moving found ones, are applied on the report in the web app.';

  @override
  String get stocktakeChangeLocation => 'Change location';

  @override
  String get reasonOtherOrg => 'Belongs to another organization';

  @override
  String get reasonRetired => 'Sold or decommissioned';

  @override
  String get reasonOtherLocation => 'Assigned to another location';

  @override
  String get reasonOutOfScope => 'Not part of this stocktake';

  @override
  String get actionStocktakeCounted => 'Stocktake';

  @override
  String get errorStocktakeNotFound => 'This stocktake no longer exists.';

  @override
  String get errorStocktakeClosed => 'This stocktake is closed.';

  @override
  String get errorStocktakeNotClosed => 'Close the stocktake first.';

  @override
  String get errorStocktakeEmpty => 'Nothing matches this selection.';

  @override
  String get errorStocktakeNotYourTick =>
      'Only whoever counted a unit can change it.';

  @override
  String get errorStocktakeNotFoundYet => 'This unit has not been counted yet.';

  @override
  String get errorStocktakeProductNotCounted =>
      'This product is not counted in this stocktake.';

  @override
  String get errorStocktakeCountChanged =>
      'Your count here was changed on another device in the meantime. It shows the current number now — count on from there.';

  @override
  String get errorStocktakeActionApplied =>
      'This correction has already been applied.';
}
