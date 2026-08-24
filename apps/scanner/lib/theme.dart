import 'package:flutter/material.dart';

/// The web app's design tokens, ported.
///
/// `apps/web/src/routes/layout.css` defines them as oklch with zero chroma —
/// pure neutrals, which land exactly on Tailwind's `neutral` scale, so they are
/// written here as the hex they resolve to. Keep the two in step: if a token
/// moves there, move it here.
///
/// The palette has no accent hue at all. That is deliberate on the web and it
/// matters more on a handheld: the only colour in the UI is status, so a green
/// or red row means something rather than being decoration.
abstract final class _N {
  static const white = Color(0xFFFFFFFF);
  static const n50 = Color(0xFFFAFAFA); // oklch(0.985)
  static const n100 = Color(0xFFF5F5F5); // oklch(0.97)
  static const n200 = Color(0xFFE5E5E5); // oklch(0.922)
  static const n400 = Color(0xFFA1A1A1); // oklch(0.708)
  static const n500 = Color(0xFF737373); // oklch(0.556)
  static const n700 = Color(0xFF404040); // oklch(0.371)
  static const n800 = Color(0xFF262626); // oklch(0.269)
  static const n900 = Color(0xFF171717); // oklch(0.205)
  static const n950 = Color(0xFF0A0A0A); // oklch(0.145)
}

/// Status colours, which the neutral scale deliberately has no room for.
///
/// Material's ColorScheme carries `error` but has nothing meaning "this went
/// through", and a scan session is mostly a list of exactly that. The values
/// are the Tailwind greens the web uses for the same job.
@immutable
class StatusColors extends ThemeExtension<StatusColors> {
  const StatusColors({
    required this.success,
    required this.onSuccess,
    required this.successContainer,
    required this.onSuccessContainer,
  });

  final Color success;
  final Color onSuccess;
  final Color successContainer;
  final Color onSuccessContainer;

  static const light = StatusColors(
    success: Color(0xFF15803D), // green-700
    onSuccess: Color(0xFFFFFFFF),
    successContainer: Color(0xFFDCFCE7), // green-100
    onSuccessContainer: Color(0xFF14532D), // green-900
  );

  static const dark = StatusColors(
    success: Color(0xFF4ADE80), // green-400
    onSuccess: Color(0xFF052E16), // green-950
    successContainer: Color(0xFF14532D), // green-900
    onSuccessContainer: Color(0xFFDCFCE7), // green-100
  );

  static StatusColors of(BuildContext context) =>
      Theme.of(context).extension<StatusColors>() ?? light;

  @override
  StatusColors copyWith({
    Color? success,
    Color? onSuccess,
    Color? successContainer,
    Color? onSuccessContainer,
  }) => StatusColors(
    success: success ?? this.success,
    onSuccess: onSuccess ?? this.onSuccess,
    successContainer: successContainer ?? this.successContainer,
    onSuccessContainer: onSuccessContainer ?? this.onSuccessContainer,
  );

  @override
  StatusColors lerp(StatusColors? other, double t) {
    if (other == null) return this;
    return StatusColors(
      success: Color.lerp(success, other.success, t)!,
      onSuccess: Color.lerp(onSuccess, other.onSuccess, t)!,
      successContainer: Color.lerp(successContainer, other.successContainer, t)!,
      onSuccessContainer: Color.lerp(onSuccessContainer, other.onSuccessContainer, t)!,
    );
  }
}

/// Colours for content drawn over the camera preview.
///
/// The camera screen is the one place the theme cannot reach: the ground is a
/// live video feed, which is neither the light nor the dark surface, so a
/// theme-following banner would be unreadable half the time. These are fixed
/// on purpose, and taken from the same palette so they still look like the rest
/// of the app.
abstract final class OverlayColors {
  static const foreground = Color(0xFFFAFAFA);
  static const mutedForeground = Color(0xB3FAFAFA);
  static const scrim = Color(0x99000000);
  static const success = Color(0xFF15803D); // green-700
  static const error = Color(0xFFDC2626); // red-600
  static const guide = Color(0xB3FAFAFA);
}

/// `--radius: 0.625rem`, and the steps shadcn derives from it.
abstract final class Radii {
  static const md = 8.0; // buttons, inputs
  static const lg = 10.0;
  static const xl = 14.0; // cards, sheets
}

ColorScheme _scheme(Brightness brightness) => switch (brightness) {
  Brightness.light => const ColorScheme(
    brightness: Brightness.light,
    primary: _N.n900,
    onPrimary: _N.n50,
    secondary: _N.n100,
    onSecondary: _N.n900,
    surface: _N.white,
    onSurface: _N.n900,
    surfaceContainerHighest: _N.n200,
    surfaceContainerHigh: _N.n100,
    surfaceContainer: _N.n100,
    onSurfaceVariant: _N.n500,
    outline: _N.n500,
    outlineVariant: _N.n200,
    error: Color(0xFFDC2626), // red-600
    onError: _N.white,
    errorContainer: Color(0xFFFEE2E2), // red-100
    onErrorContainer: Color(0xFF991B1B), // red-800
    inverseSurface: _N.n900,
    onInverseSurface: _N.n50,
  ),
  Brightness.dark => const ColorScheme(
    brightness: Brightness.dark,
    primary: _N.n200,
    onPrimary: _N.n900,
    secondary: _N.n800,
    onSecondary: _N.n50,
    surface: _N.n900,
    onSurface: _N.n50,
    surfaceContainerHighest: _N.n800,
    surfaceContainerHigh: _N.n800,
    surfaceContainer: _N.n900,
    onSurfaceVariant: _N.n400,
    outline: _N.n400,
    outlineVariant: _N.n700,
    error: Color(0xFFF87171), // red-400
    onError: Color(0xFF450A0A), // red-950
    errorContainer: Color(0xFF7F1D1D), // red-900
    onErrorContainer: Color(0xFFFEE2E2), // red-100
    inverseSurface: _N.n50,
    onInverseSurface: _N.n900,
  ),
};

ThemeData technikpoolTheme(Brightness brightness) {
  final scheme = _scheme(brightness);
  final isLight = brightness == Brightness.light;

  // The web shell sits one step off its cards: bg-zinc-50 behind bg-background.
  final canvas = isLight ? _N.n50 : _N.n950;
  // bg-background — what the header and the nav sit on.
  final chrome = isLight ? _N.white : _N.n950;
  final border = isLight ? _N.n200 : _N.n800;

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    fontFamily: 'Inter',
    scaffoldBackgroundColor: canvas,
    extensions: [isLight ? StatusColors.light : StatusColors.dark],

    appBarTheme: AppBarTheme(
      backgroundColor: chrome,
      foregroundColor: scheme.onSurface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        fontFamily: 'Inter',
        fontSize: 19,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.4, // tracking-tight, as on the web wordmark
        color: scheme.onSurface,
      ),
      // The web header is `border-b`, not a shadow.
      shape: Border(bottom: BorderSide(color: border)),
    ),

    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: chrome,
      surfaceTintColor: Colors.transparent,
      indicatorColor: isLight ? _N.n100 : _N.n800,
      elevation: 0,
      height: 68,
      labelTextStyle: WidgetStateProperty.all(
        const TextStyle(fontFamily: 'Inter', fontSize: 12, fontWeight: FontWeight.w500),
      ),
    ),

    // Warehouse use: gloves, poor light, arm's length. Bigger touch targets and
    // text than Material's defaults, and than the web's — that sizing assumes a
    // mouse.
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.md)),
        textStyle: const TextStyle(
          fontFamily: 'Inter',
          fontSize: 17,
          fontWeight: FontWeight.w600,
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        side: BorderSide(color: border),
        foregroundColor: scheme.onSurface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.md)),
        textStyle: const TextStyle(
          fontFamily: 'Inter',
          fontSize: 16,
          fontWeight: FontWeight.w500,
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: scheme.onSurface,
        textStyle: const TextStyle(
          fontFamily: 'Inter',
          fontSize: 15,
          fontWeight: FontWeight.w500,
        ),
      ),
    ),

    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: scheme.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 18),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(Radii.md),
        borderSide: BorderSide(color: border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(Radii.md),
        borderSide: BorderSide(color: border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(Radii.md),
        borderSide: BorderSide(color: scheme.onSurface, width: 1.5),
      ),
      labelStyle: TextStyle(color: scheme.onSurfaceVariant),
    ),

    cardTheme: CardThemeData(
      color: scheme.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(Radii.xl),
        side: BorderSide(color: border),
      ),
    ),

    dividerTheme: DividerThemeData(color: border, thickness: 1, space: 1),
    listTileTheme: ListTileThemeData(
      iconColor: scheme.onSurfaceVariant,
      titleTextStyle: TextStyle(
        fontFamily: 'Inter',
        fontSize: 16,
        fontWeight: FontWeight.w500,
        color: scheme.onSurface,
      ),
      subtitleTextStyle: TextStyle(
        fontFamily: 'Inter',
        fontSize: 13.5,
        color: scheme.onSurfaceVariant,
      ),
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: SegmentedButton.styleFrom(
        selectedBackgroundColor: scheme.primary,
        selectedForegroundColor: scheme.onPrimary,
        side: BorderSide(color: border),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.md)),
        textStyle: const TextStyle(fontFamily: 'Inter', fontWeight: FontWeight.w500),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: scheme.inverseSurface,
      contentTextStyle: TextStyle(fontFamily: 'Inter', color: scheme.onInverseSurface),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.md)),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(
      color: scheme.onSurface,
      linearTrackColor: border,
    ),
  );
}
