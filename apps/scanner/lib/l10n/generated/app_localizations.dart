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

  /// Shown on the pairing screen when the scanned code is not an http(s) URL, typically an asset tag.
  ///
  /// In en, this message translates to:
  /// **'\"{code}\" is not a server address. Asset tags are scanned after connecting — or in the demo.'**
  String notAServerCode(String code);

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

  /// A loom's ways — the pairs of ends running through one cable. Listed on the lookup screen, one per line.
  ///
  /// In en, this message translates to:
  /// **'Ways'**
  String get ways;

  /// A cable's two ends, shown as "XLR3 M → XLR3 F" on the lookup screen.
  ///
  /// In en, this message translates to:
  /// **'Connectors'**
  String get connectors;

  /// No description provided for @cableLength.
  ///
  /// In en, this message translates to:
  /// **'Length'**
  String get cableLength;

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

  /// No description provided for @whatsNew.
  ///
  /// In en, this message translates to:
  /// **'What\'s new'**
  String get whatsNew;

  /// Heads a changelog entry, and names the running version under Settings.
  ///
  /// In en, this message translates to:
  /// **'Version {version}'**
  String versionLabel(String version);

  /// The banner on the home screen after an update, tapped to open the changelog.
  ///
  /// In en, this message translates to:
  /// **'What\'s new in {version}'**
  String whatsNewIn(String version);

  /// No description provided for @dismiss.
  ///
  /// In en, this message translates to:
  /// **'Dismiss'**
  String get dismiss;

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

  /// No description provided for @statusUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Unavailable'**
  String get statusUnavailable;

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

  /// No description provided for @demoStart.
  ///
  /// In en, this message translates to:
  /// **'Explore the demo'**
  String get demoStart;

  /// No description provided for @demoExplainer.
  ///
  /// In en, this message translates to:
  /// **'No server to hand? The demo runs a small warehouse on this device — nothing is sent anywhere.'**
  String get demoExplainer;

  /// No description provided for @demoBannerText.
  ///
  /// In en, this message translates to:
  /// **'Demo mode — sample data, stored on this device only.'**
  String get demoBannerText;

  /// No description provided for @demoLeave.
  ///
  /// In en, this message translates to:
  /// **'Leave demo'**
  String get demoLeave;

  /// No description provided for @demoTagHint.
  ///
  /// In en, this message translates to:
  /// **'Try tag {tag} — Inventory lists them all'**
  String demoTagHint(String tag);

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

  /// No description provided for @actionRequested.
  ///
  /// In en, this message translates to:
  /// **'Requested'**
  String get actionRequested;

  /// No description provided for @actionAddedToProduction.
  ///
  /// In en, this message translates to:
  /// **'Added to production'**
  String get actionAddedToProduction;

  /// No description provided for @actionApproved.
  ///
  /// In en, this message translates to:
  /// **'Approved'**
  String get actionApproved;

  /// No description provided for @actionDeclined.
  ///
  /// In en, this message translates to:
  /// **'Declined'**
  String get actionDeclined;

  /// No description provided for @actionBookingCancelled.
  ///
  /// In en, this message translates to:
  /// **'Released'**
  String get actionBookingCancelled;

  /// No description provided for @actionAccessoryAttached.
  ///
  /// In en, this message translates to:
  /// **'Accessory attached'**
  String get actionAccessoryAttached;

  /// No description provided for @actionAccessoryDetached.
  ///
  /// In en, this message translates to:
  /// **'Accessory detached'**
  String get actionAccessoryDetached;

  /// No description provided for @actionCredentialsSet.
  ///
  /// In en, this message translates to:
  /// **'Credentials saved'**
  String get actionCredentialsSet;

  /// No description provided for @actionCredentialsRemoved.
  ///
  /// In en, this message translates to:
  /// **'Credentials removed'**
  String get actionCredentialsRemoved;

  /// No description provided for @actionCredentialsRevealed.
  ///
  /// In en, this message translates to:
  /// **'Credentials viewed'**
  String get actionCredentialsRevealed;

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
  /// **'Enter label or serial number by hand'**
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

  /// No description provided for @errorSerialAmbiguous.
  ///
  /// In en, this message translates to:
  /// **'Several devices share this serial number. Scan the asset tag instead.'**
  String get errorSerialAmbiguous;

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

  /// No description provided for @errorAssetUnavailable.
  ///
  /// In en, this message translates to:
  /// **'This device is marked unavailable and cannot be checked out.'**
  String get errorAssetUnavailable;

  /// No description provided for @errorProductionCancelled.
  ///
  /// In en, this message translates to:
  /// **'This production has been cancelled. Nothing can be checked out to it.'**
  String get errorProductionCancelled;

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

  /// No description provided for @cancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get cancel;

  /// Counting what an organization actually has. German: Inventur.
  ///
  /// In en, this message translates to:
  /// **'Stocktake'**
  String get stocktake;

  /// No description provided for @stocktakeNew.
  ///
  /// In en, this message translates to:
  /// **'New stocktake'**
  String get stocktakeNew;

  /// No description provided for @stocktakeNone.
  ///
  /// In en, this message translates to:
  /// **'No stocktake is open.'**
  String get stocktakeNone;

  /// No description provided for @stocktakeProgress.
  ///
  /// In en, this message translates to:
  /// **'{found} of {expected} counted'**
  String stocktakeProgress(int found, int expected);

  /// Units checked out on a production right now.
  ///
  /// In en, this message translates to:
  /// **'{count} out on jobs'**
  String stocktakeOutCount(int count);

  /// No description provided for @stocktakeUnexpectedCount.
  ///
  /// In en, this message translates to:
  /// **'{count} unexpected'**
  String stocktakeUnexpectedCount(int count);

  /// No description provided for @stocktakeWhereAreYou.
  ///
  /// In en, this message translates to:
  /// **'Where are you counting?'**
  String get stocktakeWhereAreYou;

  /// No description provided for @stocktakeOrganization.
  ///
  /// In en, this message translates to:
  /// **'Organization'**
  String get stocktakeOrganization;

  /// No description provided for @stocktakeLocations.
  ///
  /// In en, this message translates to:
  /// **'Locations'**
  String get stocktakeLocations;

  /// No description provided for @stocktakeCategories.
  ///
  /// In en, this message translates to:
  /// **'Categories'**
  String get stocktakeCategories;

  /// No description provided for @stocktakeNoneMeansAll.
  ///
  /// In en, this message translates to:
  /// **'None selected means all.'**
  String get stocktakeNoneMeansAll;

  /// No description provided for @stocktakeName.
  ///
  /// In en, this message translates to:
  /// **'Name'**
  String get stocktakeName;

  /// No description provided for @stocktakeDefaultName.
  ///
  /// In en, this message translates to:
  /// **'Stocktake {date}'**
  String stocktakeDefaultName(String date);

  /// No description provided for @stocktakePreview.
  ///
  /// In en, this message translates to:
  /// **'{units} units to scan · {loose} loose units to count · {out} out on jobs'**
  String stocktakePreview(int units, int loose, int out);

  /// No description provided for @stocktakeOverlap.
  ///
  /// In en, this message translates to:
  /// **'Overlaps with open stocktake {name} ({count} units)'**
  String stocktakeOverlap(String name, int count);

  /// No description provided for @stocktakeStart.
  ///
  /// In en, this message translates to:
  /// **'Start stocktake'**
  String get stocktakeStart;

  /// No description provided for @stocktakeNoOrgs.
  ///
  /// In en, this message translates to:
  /// **'Starting a stocktake needs at least the MEMBER role in an organization.'**
  String get stocktakeNoOrgs;

  /// Tab listing the units still to be found at the counter's location.
  ///
  /// In en, this message translates to:
  /// **'Open here'**
  String get stocktakeTabOpen;

  /// No description provided for @stocktakeFound.
  ///
  /// In en, this message translates to:
  /// **'Counted'**
  String get stocktakeFound;

  /// No description provided for @stocktakeUnexpected.
  ///
  /// In en, this message translates to:
  /// **'Not on the list'**
  String get stocktakeUnexpected;

  /// No description provided for @stocktakeAlready.
  ///
  /// In en, this message translates to:
  /// **'Already counted by {name}'**
  String stocktakeAlready(String name);

  /// No description provided for @stocktakeWasOut.
  ///
  /// In en, this message translates to:
  /// **'checked out to {name}'**
  String stocktakeWasOut(String name);

  /// No description provided for @stocktakeBundle.
  ///
  /// In en, this message translates to:
  /// **'Bundle {name}'**
  String stocktakeBundle(String name);

  /// Sheet after scanning a unit with accessories.
  ///
  /// In en, this message translates to:
  /// **'Is everything with it?'**
  String get stocktakeConfirmAccessories;

  /// Sheet after scanning a bundle's tag.
  ///
  /// In en, this message translates to:
  /// **'Is everything in it?'**
  String get stocktakeConfirmBundle;

  /// Sheet title after scanning an accessory on its own: its parent and the parent's other accessories.
  ///
  /// In en, this message translates to:
  /// **'Belongs with {name}'**
  String groupBelongsWith(String name);

  /// No description provided for @groupOnlyThis.
  ///
  /// In en, this message translates to:
  /// **'Only this one'**
  String get groupOnlyThis;

  /// No description provided for @groupBookHint.
  ///
  /// In en, this message translates to:
  /// **'Only the scanned unit was booked. Book the rest along?'**
  String get groupBookHint;

  /// No description provided for @groupBook.
  ///
  /// In en, this message translates to:
  /// **'Book {count} more'**
  String groupBook(int count);

  /// No description provided for @groupBooked.
  ///
  /// In en, this message translates to:
  /// **'{count} more booked'**
  String groupBooked(int count);

  /// No description provided for @groupAlreadyThere.
  ///
  /// In en, this message translates to:
  /// **'already there'**
  String get groupAlreadyThere;

  /// No description provided for @stocktakeGroupHint.
  ///
  /// In en, this message translates to:
  /// **'The scanned unit is counted. Count the rest too? Uncheck whatever is missing.'**
  String get stocktakeGroupHint;

  /// No description provided for @stocktakeConfirmHint.
  ///
  /// In en, this message translates to:
  /// **'Uncheck whatever is missing.'**
  String get stocktakeConfirmHint;

  /// No description provided for @stocktakeConfirm.
  ///
  /// In en, this message translates to:
  /// **'Confirm'**
  String get stocktakeConfirm;

  /// No description provided for @stocktakeConfirmed.
  ///
  /// In en, this message translates to:
  /// **'{count} confirmed'**
  String stocktakeConfirmed(int count);

  /// No description provided for @stocktakeCountedBy.
  ///
  /// In en, this message translates to:
  /// **'counted by {name}'**
  String stocktakeCountedBy(String name);

  /// No description provided for @stocktakeNothingOpenHere.
  ///
  /// In en, this message translates to:
  /// **'Nothing left to find here.'**
  String get stocktakeNothingOpenHere;

  /// Heading for untagged products, which are counted as a number.
  ///
  /// In en, this message translates to:
  /// **'Count instead of scan'**
  String get stocktakeLoose;

  /// No description provided for @stocktakeLooseLine.
  ///
  /// In en, this message translates to:
  /// **'{expected} expected here · {counted} counted in total'**
  String stocktakeLooseLine(int expected, int counted);

  /// No description provided for @stocktakeYourCount.
  ///
  /// In en, this message translates to:
  /// **'Your count here'**
  String get stocktakeYourCount;

  /// Tooltip of the + button that raises a loose count by one.
  ///
  /// In en, this message translates to:
  /// **'One more'**
  String get stocktakePlusOne;

  /// No description provided for @stocktakeMinusOne.
  ///
  /// In en, this message translates to:
  /// **'One less'**
  String get stocktakeMinusOne;

  /// Shown when a search or category filter leaves the open list empty.
  ///
  /// In en, this message translates to:
  /// **'Nothing open here matches.'**
  String get stocktakeNoMatch;

  /// No description provided for @stocktakeTickHint.
  ///
  /// In en, this message translates to:
  /// **'Tap to count by hand'**
  String get stocktakeTickHint;

  /// No description provided for @stocktakeManualTicked.
  ///
  /// In en, this message translates to:
  /// **'Counted by hand'**
  String get stocktakeManualTicked;

  /// No description provided for @stocktakeUndo.
  ///
  /// In en, this message translates to:
  /// **'Take back count'**
  String get stocktakeUndo;

  /// No description provided for @stocktakeUnticked.
  ///
  /// In en, this message translates to:
  /// **'Count taken back'**
  String get stocktakeUnticked;

  /// No description provided for @stocktakeNote.
  ///
  /// In en, this message translates to:
  /// **'Note'**
  String get stocktakeNote;

  /// Flag on a counted unit that is damaged or dirty.
  ///
  /// In en, this message translates to:
  /// **'Needs attention'**
  String get stocktakeNeedsAttention;

  /// No description provided for @stocktakeEditNote.
  ///
  /// In en, this message translates to:
  /// **'Note and condition'**
  String get stocktakeEditNote;

  /// No description provided for @stocktakeClose.
  ///
  /// In en, this message translates to:
  /// **'Close stocktake'**
  String get stocktakeClose;

  /// No description provided for @stocktakeCloseConfirm.
  ///
  /// In en, this message translates to:
  /// **'{count} units not counted yet will be marked missing. This cannot be undone.'**
  String stocktakeCloseConfirm(int count);

  /// No description provided for @stocktakeClosed.
  ///
  /// In en, this message translates to:
  /// **'Stocktake closed. Corrections, such as marking missing units or moving found ones, are applied on the report in the web app.'**
  String get stocktakeClosed;

  /// No description provided for @stocktakeChangeLocation.
  ///
  /// In en, this message translates to:
  /// **'Change location'**
  String get stocktakeChangeLocation;

  /// No description provided for @reasonOtherOrg.
  ///
  /// In en, this message translates to:
  /// **'Belongs to another organization'**
  String get reasonOtherOrg;

  /// No description provided for @reasonRetired.
  ///
  /// In en, this message translates to:
  /// **'Sold or decommissioned'**
  String get reasonRetired;

  /// No description provided for @reasonOtherLocation.
  ///
  /// In en, this message translates to:
  /// **'Assigned to another location'**
  String get reasonOtherLocation;

  /// No description provided for @reasonOutOfScope.
  ///
  /// In en, this message translates to:
  /// **'Not part of this stocktake'**
  String get reasonOutOfScope;

  /// The STOCKTAKE_COUNTED history entry.
  ///
  /// In en, this message translates to:
  /// **'Stocktake'**
  String get actionStocktakeCounted;

  /// No description provided for @productModeTag.
  ///
  /// In en, this message translates to:
  /// **'Tag units'**
  String get productModeTag;

  /// No description provided for @productModeRegister.
  ///
  /// In en, this message translates to:
  /// **'Register new'**
  String get productModeRegister;

  /// No description provided for @productTagHint.
  ///
  /// In en, this message translates to:
  /// **'Scan a sticker: it goes to the unit you tapped, or else to the next one without a tag.'**
  String get productTagHint;

  /// No description provided for @productRegisterHint.
  ///
  /// In en, this message translates to:
  /// **'Every scanned sticker becomes a new unit here.'**
  String get productRegisterHint;

  /// No description provided for @productRegisterAt.
  ///
  /// In en, this message translates to:
  /// **'New units go to'**
  String get productRegisterAt;

  /// No description provided for @productNoUntagged.
  ///
  /// In en, this message translates to:
  /// **'Every unit already has a tag.'**
  String get productNoUntagged;

  /// No description provided for @productUntagged.
  ///
  /// In en, this message translates to:
  /// **'No tag'**
  String get productUntagged;

  /// Marks the unit the next scanned sticker will be given to.
  ///
  /// In en, this message translates to:
  /// **'next scan'**
  String get productNextScan;

  /// No description provided for @productTagged.
  ///
  /// In en, this message translates to:
  /// **'{tag} given to {unit}'**
  String productTagged(String tag, String unit);

  /// No description provided for @productRegistered.
  ///
  /// In en, this message translates to:
  /// **'{tag} registered'**
  String productRegistered(String tag);

  /// No description provided for @productNeedsAdmin.
  ///
  /// In en, this message translates to:
  /// **'Registering and tagging units takes ADMIN in {org}.'**
  String productNeedsAdmin(String org);

  /// No description provided for @productUnitCount.
  ///
  /// In en, this message translates to:
  /// **'{total} units · {untagged} without a tag'**
  String productUnitCount(int total, int untagged);

  /// No description provided for @errorAssetTagInUse.
  ///
  /// In en, this message translates to:
  /// **'This sticker is already on another unit.'**
  String get errorAssetTagInUse;

  /// No description provided for @errorAssetTagPrefixMismatch.
  ///
  /// In en, this message translates to:
  /// **'This sticker belongs to another organization — its prefix doesn\'t match.'**
  String get errorAssetTagPrefixMismatch;

  /// No description provided for @errorAssetAlreadyTagged.
  ///
  /// In en, this message translates to:
  /// **'This unit already has a tag. Change it on the web.'**
  String get errorAssetAlreadyTagged;

  /// No description provided for @errorStocktakeNotFound.
  ///
  /// In en, this message translates to:
  /// **'This stocktake no longer exists.'**
  String get errorStocktakeNotFound;

  /// No description provided for @errorStocktakeClosed.
  ///
  /// In en, this message translates to:
  /// **'This stocktake is closed.'**
  String get errorStocktakeClosed;

  /// No description provided for @errorStocktakeNotClosed.
  ///
  /// In en, this message translates to:
  /// **'Close the stocktake first.'**
  String get errorStocktakeNotClosed;

  /// No description provided for @errorStocktakeEmpty.
  ///
  /// In en, this message translates to:
  /// **'Nothing matches this selection.'**
  String get errorStocktakeEmpty;

  /// No description provided for @errorStocktakeNotYourTick.
  ///
  /// In en, this message translates to:
  /// **'Only whoever counted a unit can change it.'**
  String get errorStocktakeNotYourTick;

  /// No description provided for @errorStocktakeNotFoundYet.
  ///
  /// In en, this message translates to:
  /// **'This unit has not been counted yet.'**
  String get errorStocktakeNotFoundYet;

  /// No description provided for @errorStocktakeProductNotCounted.
  ///
  /// In en, this message translates to:
  /// **'This product is not counted in this stocktake.'**
  String get errorStocktakeProductNotCounted;

  /// No description provided for @errorStocktakeCountChanged.
  ///
  /// In en, this message translates to:
  /// **'Your count here was changed on another device in the meantime. It shows the current number now — count on from there.'**
  String get errorStocktakeCountChanged;

  /// No description provided for @errorStocktakeActionApplied.
  ///
  /// In en, this message translates to:
  /// **'This correction has already been applied.'**
  String get errorStocktakeActionApplied;
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
