import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'l10n/generated/app_localizations.dart';

/// The app's own privacy policy — what the stores link to. It belongs to the
/// app rather than to any server, so it lives on GitHub Pages (docs/privacy in
/// the repository) and not on a Technikpool instance.
final appPrivacyPolicyUrl = Uri.parse('https://ruegerevents.github.io/technikpool/privacy/');

/// Opens [url] in the device's browser. A device without one (some PDAs ship
/// stripped down) gets a message rather than a silent tap.
Future<void> openExternal(BuildContext context, Uri url) async {
  final messenger = ScaffoldMessenger.of(context);
  final failed = S.of(context).linkOpenFailed;
  final opened = await launchUrl(url, mode: LaunchMode.externalApplication);
  if (!opened) messenger.showSnackBar(SnackBar(content: Text(failed)));
}
