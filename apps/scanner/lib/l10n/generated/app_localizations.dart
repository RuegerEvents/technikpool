import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_de.dart';
import 'app_localizations_en.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of S
/// returned by `S.of(context)`.
///
/// Applications need to include `S.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'generated/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: S.localizationsDelegates,
///   supportedLocales: S.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the S.supportedLocales
/// property.
abstract class S {
  S(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static S of(BuildContext context) {
    return Localizations.of<S>(context, S)!;
  }

  static const LocalizationsDelegate<S> delegate = _SDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('de'),
    Locale('en'),
  ];

  /// No description provided for @appTitle.
  ///
  /// In en, this message translates to:
  /// **'Technikpool Scanner'**
  String get appTitle;

  /// No description provided for @connectTitle.
  ///
  /// In en, this message translates to:
  /// **'Connect to Technikpool'**
  String get connectTitle;

  /// No description provided for @serverAddress.
  ///
  /// In en, this message translates to:
  /// **'Server address'**
  String get serverAddress;

  /// No description provided for @serverAddressHint.
  ///
  /// In en, this message translates to:
  /// **'https://technikpool.example.com'**
  String get serverAddressHint;

  /// No description provided for @scanServerQr.
  ///
  /// In en, this message translates to:
  /// **'Scan the QR code on the \"Tools › Scanners\" page, or type the address in by hand.'**
  String get scanServerQr;

  /// No description provided for @continueLabel.
  ///
  /// In en, this message translates to:
  /// **'Continue'**
  String get continueLabel;

  /// No description provided for @codeInstructions.
  ///
  /// In en, this message translates to:
  /// **'Enter this code under \"Tools › Scanners\" in your browser:'**
  String get codeInstructions;

  /// No description provided for @waitingForApproval.
  ///
  /// In en, this message translates to:
  /// **'Waiting for approval…'**
  String get waitingForApproval;

  /// No description provided for @codeExpired.
  ///
  /// In en, this message translates to:
  /// **'The code has expired. Please start over.'**
  String get codeExpired;

  /// No description provided for @accessDenied.
  ///
  /// In en, this message translates to:
  /// **'The request was denied.'**
  String get accessDenied;

  /// No description provided for @startOver.
  ///
  /// In en, this message translates to:
  /// **'Start over'**
  String get startOver;

  /// No description provided for @signInWithPassword.
  ///
  /// In en, this message translates to:
  /// **'Sign in with a password instead'**
  String get signInWithPassword;

  /// No description provided for @useDeviceCode.
  ///
  /// In en, this message translates to:
  /// **'Connect with a code instead'**
  String get useDeviceCode;

  /// No description provided for @email.
  ///
  /// In en, this message translates to:
  /// **'Email'**
  String get email;

  /// No description provided for @password.
  ///
  /// In en, this message translates to:
  /// **'Password'**
  String get password;

  /// No description provided for @signIn.
  ///
  /// In en, this message translates to:
  /// **'Sign in'**
  String get signIn;

  /// No description provided for @location.
  ///
  /// In en, this message translates to:
  /// **'Location'**
  String get location;

  /// No description provided for @production.
  ///
  /// In en, this message translates to:
  /// **'Production'**
  String get production;

  /// No description provided for @startSession.
  ///
  /// In en, this message translates to:
  /// **'Start session'**
  String get startSession;

  /// No description provided for @search.
  ///
  /// In en, this message translates to:
  /// **'Search'**
  String get search;

  /// No description provided for @noResults.
  ///
  /// In en, this message translates to:
  /// **'No matches'**
  String get noResults;

  /// Shown on the session screen while it waits for a scan. 'Trigger' is the physical button on a handheld scanner.
  ///
  /// In en, this message translates to:
  /// **'Ready — pull the trigger'**
  String get scanNow;

  /// No description provided for @scansLabel.
  ///
  /// In en, this message translates to:
  /// **'Scans'**
  String get scansLabel;

  /// No description provided for @okLabel.
  ///
  /// In en, this message translates to:
  /// **'OK'**
  String get okLabel;

  /// A count of failed scans in the session header, so plural in English.
  ///
  /// In en, this message translates to:
  /// **'Errors'**
  String get errorLabel;

  /// No description provided for @sessionEmpty.
  ///
  /// In en, this message translates to:
  /// **'Nothing scanned yet.'**
  String get sessionEmpty;

  /// No description provided for @lookup.
  ///
  /// In en, this message translates to:
  /// **'Look up'**
  String get lookup;

  /// No description provided for @lookupHint.
  ///
  /// In en, this message translates to:
  /// **'Scan a label to see its details.'**
  String get lookupHint;

  /// No description provided for @serialNumber.
  ///
  /// In en, this message translates to:
  /// **'Serial number'**
  String get serialNumber;

  /// No description provided for @status.
  ///
  /// In en, this message translates to:
  /// **'Status'**
  String get status;

  /// No description provided for @currentLocation.
  ///
  /// In en, this message translates to:
  /// **'Current location'**
  String get currentLocation;

  /// No description provided for @checkedOutTo.
  ///
  /// In en, this message translates to:
  /// **'Checked out to'**
  String get checkedOutTo;

  /// No description provided for @history.
  ///
  /// In en, this message translates to:
  /// **'History'**
  String get history;

  /// No description provided for @inventory.
  ///
  /// In en, this message translates to:
  /// **'Inventory'**
  String get inventory;

  /// A dropdown label sitting beside the category filter; both are half-width, so keep it to one word.
  ///
  /// In en, this message translates to:
  /// **'Location'**
  String get filterByLocation;

  /// A dropdown label sitting beside the location filter; both are half-width, so keep it to one word.
  ///
  /// In en, this message translates to:
  /// **'Category'**
  String get filterByCategory;

  /// No description provided for @all.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get all;

  /// No description provided for @loadMore.
  ///
  /// In en, this message translates to:
  /// **'Load more'**
  String get loadMore;

  /// No description provided for @settings.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get settings;

  /// No description provided for @connectedAs.
  ///
  /// In en, this message translates to:
  /// **'Signed in as'**
  String get connectedAs;

  /// No description provided for @server.
  ///
  /// In en, this message translates to:
  /// **'Server'**
  String get server;

  /// No description provided for @disconnect.
  ///
  /// In en, this message translates to:
  /// **'Disconnect'**
  String get disconnect;

  /// No description provided for @scannerConfig.
  ///
  /// In en, this message translates to:
  /// **'Scanner configuration'**
  String get scannerConfig;

  /// No description provided for @broadcastActions.
  ///
  /// In en, this message translates to:
  /// **'Broadcast actions'**
  String get broadcastActions;

  /// No description provided for @extraKeys.
  ///
  /// In en, this message translates to:
  /// **'Extra keys'**
  String get extraKeys;

  /// No description provided for @configHint.
  ///
  /// In en, this message translates to:
  /// **'Comma-separated. Diagnostics will tell you the right values for this device.'**
  String get configHint;

  /// No description provided for @save.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get save;

  /// No description provided for @saved.
  ///
  /// In en, this message translates to:
  /// **'Saved'**
  String get saved;

  /// No description provided for @diagnostics.
  ///
  /// In en, this message translates to:
  /// **'Diagnostics'**
  String get diagnostics;

  /// No description provided for @diagnosticsHint.
  ///
  /// In en, this message translates to:
  /// **'Pull the trigger. Every broadcast received shows up here with all its extras.'**
  String get diagnosticsHint;

  /// No description provided for @diagnosticsEmpty.
  ///
  /// In en, this message translates to:
  /// **'Nothing received yet.'**
  String get diagnosticsEmpty;

  /// No description provided for @useThisPair.
  ///
  /// In en, this message translates to:
  /// **'Use these values'**
  String get useThisPair;

  /// No description provided for @language.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get language;

  /// The option that follows the device language rather than pinning one.
  ///
  /// In en, this message translates to:
  /// **'System language'**
  String get languageSystem;

  /// No description provided for @scanInput.
  ///
  /// In en, this message translates to:
  /// **'Scan input'**
  String get scanInput;

  /// No description provided for @scanWithCamera.
  ///
  /// In en, this message translates to:
  /// **'Scan with camera'**
  String get scanWithCamera;

  /// No description provided for @cameraHint.
  ///
  /// In en, this message translates to:
  /// **'Hold the label inside the frame.'**
  String get cameraHint;

  /// No description provided for @cameraDenied.
  ///
  /// In en, this message translates to:
  /// **'No camera access. Allow it in system settings and try again.'**
  String get cameraDenied;

  /// No description provided for @cameraUnsupported.
  ///
  /// In en, this message translates to:
  /// **'This device has no usable camera.'**
  String get cameraUnsupported;

  /// No description provided for @cameraFailed.
  ///
  /// In en, this message translates to:
  /// **'The camera could not be started.'**
  String get cameraFailed;

  /// The camera flash, used as a lamp while scanning in a dim warehouse.
  ///
  /// In en, this message translates to:
  /// **'Light'**
  String get torch;

  /// No description provided for @scanModeAuto.
  ///
  /// In en, this message translates to:
  /// **'Automatic'**
  String get scanModeAuto;

  /// No description provided for @scanModeAutoHint.
  ///
  /// In en, this message translates to:
  /// **'The hardware trigger on known scanner models, and on any device once it delivers a scan — otherwise the camera.'**
  String get scanModeAutoHint;

  /// No description provided for @scanModeHardware.
  ///
  /// In en, this message translates to:
  /// **'Hardware trigger'**
  String get scanModeHardware;

  /// No description provided for @scanModeHardwareHint.
  ///
  /// In en, this message translates to:
  /// **'Only the device\'s built-in scan engine.'**
  String get scanModeHardwareHint;

  /// No description provided for @scanModeCamera.
  ///
  /// In en, this message translates to:
  /// **'Camera'**
  String get scanModeCamera;

  /// No description provided for @scanModeCameraHint.
  ///
  /// In en, this message translates to:
  /// **'Only the camera. For phones with no scan engine.'**
  String get scanModeCameraHint;

  /// No description provided for @hardwareDetected.
  ///
  /// In en, this message translates to:
  /// **'Hardware scanner detected'**
  String get hardwareDetected;

  /// No description provided for @hardwareNotDetected.
  ///
  /// In en, this message translates to:
  /// **'No hardware scan received yet'**
  String get hardwareNotDetected;

  /// No description provided for @knownPdaModel.
  ///
  /// In en, this message translates to:
  /// **'Known scanner model'**
  String get knownPdaModel;

  /// No description provided for @scanQrWithCamera.
  ///
  /// In en, this message translates to:
  /// **'Scan QR code with camera'**
  String get scanQrWithCamera;

  /// No description provided for @statusAvailable.
  ///
  /// In en, this message translates to:
  /// **'Available'**
  String get statusAvailable;

  /// No description provided for @statusMaintenance.
  ///
  /// In en, this message translates to:
  /// **'In maintenance'**
  String get statusMaintenance;

  /// No description provided for @statusBroken.
  ///
  /// In en, this message translates to:
  /// **'Broken'**
  String get statusBroken;

  /// No description provided for @statusSold.
  ///
  /// In en, this message translates to:
  /// **'Sold'**
  String get statusSold;

  /// No description provided for @statusDecommissioned.
  ///
  /// In en, this message translates to:
  /// **'Decommissioned'**
  String get statusDecommissioned;

  /// No description provided for @actionCreated.
  ///
  /// In en, this message translates to:
  /// **'Created'**
  String get actionCreated;

  /// No description provided for @actionCheckedOut.
  ///
  /// In en, this message translates to:
  /// **'Checked out'**
  String get actionCheckedOut;

  /// No description provided for @actionReturned.
  ///
  /// In en, this message translates to:
  /// **'Returned'**
  String get actionReturned;

  /// The LOCATION_ASSIGNED transaction: kit going back on a shelf.
  ///
  /// In en, this message translates to:
  /// **'Put away'**
  String get actionLocationAssigned;

  /// No description provided for @actionUpdated.
  ///
  /// In en, this message translates to:
  /// **'Updated'**
  String get actionUpdated;

  /// No description provided for @actionDeleted.
  ///
  /// In en, this message translates to:
  /// **'Deleted'**
  String get actionDeleted;

  /// No description provided for @actionInspected.
  ///
  /// In en, this message translates to:
  /// **'Inspected'**
  String get actionInspected;

  /// No description provided for @retry.
  ///
  /// In en, this message translates to:
  /// **'Try again'**
  String get retry;

  /// No description provided for @manualEntry.
  ///
  /// In en, this message translates to:
  /// **'Enter label by hand'**
  String get manualEntry;

  /// No description provided for @reset.
  ///
  /// In en, this message translates to:
  /// **'Reset'**
  String get reset;

  /// Appended to a scan result when putting an asset away also returned it from productions.
  ///
  /// In en, this message translates to:
  /// **'returned from {names}'**
  String returnedFrom(String names);

  /// No description provided for @errorAssetNotFound.
  ///
  /// In en, this message translates to:
  /// **'This label is unknown.'**
  String get errorAssetNotFound;

  /// No description provided for @errorForbidden.
  ///
  /// In en, this message translates to:
  /// **'No access to this item.'**
  String get errorForbidden;

  /// No description provided for @errorWrongOrganization.
  ///
  /// In en, this message translates to:
  /// **'That location belongs to a different organisation.'**
  String get errorWrongOrganization;

  /// No description provided for @errorAssetRetired.
  ///
  /// In en, this message translates to:
  /// **'This device has been sold or decommissioned and can no longer be booked.'**
  String get errorAssetRetired;

  /// No description provided for @errorUnauthorized.
  ///
  /// In en, this message translates to:
  /// **'The session has expired. Please connect again.'**
  String get errorUnauthorized;

  /// No description provided for @errorInvalidRequest.
  ///
  /// In en, this message translates to:
  /// **'Invalid request.'**
  String get errorInvalidRequest;

  /// No description provided for @errorInvalidLimit.
  ///
  /// In en, this message translates to:
  /// **'Invalid page size.'**
  String get errorInvalidLimit;

  /// No description provided for @errorNetwork.
  ///
  /// In en, this message translates to:
  /// **'Server unreachable.'**
  String get errorNetwork;

  /// No description provided for @errorInternal.
  ///
  /// In en, this message translates to:
  /// **'Server error.'**
  String get errorInternal;

  /// No description provided for @errorNoToken.
  ///
  /// In en, this message translates to:
  /// **'The server returned no session token.'**
  String get errorNoToken;
}

class _SDelegate extends LocalizationsDelegate<S> {
  const _SDelegate();

  @override
  Future<S> load(Locale locale) {
    return SynchronousFuture<S>(lookupS(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['de', 'en'].contains(locale.languageCode);

  @override
  bool shouldReload(_SDelegate old) => false;
}

S lookupS(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'de':
      return SDe();
    case 'en':
      return SEn();
  }

  throw FlutterError(
    'S.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
