# App Store screenshots

Source images for the App Store listing, uploaded to App Store Connect **by hand** —
like `ios/fastlane/review_information/`, and for the same reason: the listing is edited
in the console, and a lane that also wrote it would silently revert whatever was changed
there. `upload_to_app_store` runs with `skip_screenshots: true`, so nothing here is ever
uploaded by CI.

Deliberately kept out of `ios/fastlane/metadata/`, which holds `release_notes.txt` per
locale and nothing else — deliver uploads every field it finds a file for.

| Folder            | Pixels      | App Store Connect slot |
| ----------------- | ----------- | ---------------------- |
| `iphone-6.5in/`   | 1284 × 2778 | 6.5-inch iPhone        |
| `ipad-13in/`      | 2064 × 2752 | 12.9-inch / 13-inch iPad |

Both are native simulator captures, not resized. The 6.5-inch slot also accepts
1242 × 2688; the iPad slot also accepts 2048 × 2732.

Screenshots are per-localization **optional** — a localization with none inherits the
default, so the German set alone satisfies the requirement.

The iPad set exists only because `TARGETED_DEVICE_FAMILY = "1,2"` declares the app
universal. It is the phone layout stretched across 13 inches. If the target is ever
narrowed to iPhone (`1`), delete `ipad-13in/` with it.

## Re-capturing

Everything runs in **demo mode**, so there is no server to stand up and no real data on
screen. Tags 40000001–40000012 are the whole warehouse; the session shots scan the first
six against "Lager Hamburg".

```sh
# 1. No installed iPhone produces a size the 6.5-inch slot accepts, so make one.
xcrun simctl create "Shots-iPhone-14-Plus" \
  com.apple.CoreSimulator.SimDeviceType.iPhone-14-Plus \
  com.apple.CoreSimulator.SimRuntime.iOS-26-5
xcrun simctl boot "Shots-iPhone-14-Plus"        # iPad: "iPad Pro 13-inch (M5)"

# 2. A clean status bar, the way Apple's own marketing shots look.
xcrun simctl status_bar booted override --time "09:41" \
  --batteryState charged --batteryLevel 100 --wifiMode active --wifiBars 3

# 3. Run it, tap "Explore the demo", then capture each screen.
flutter run --debug -d "Shots-iPhone-14-Plus"
xcrun simctl io booted screenshot --type=png 01-session-setup.png
```

**Set `debugShowCheckedModeBanner: false` in `lib/main.dart` for the duration, and put it
back afterwards.** Release mode is not supported on the simulator (`flutter run --release`
refuses outright), so the capture has to be a debug build, and the DEBUG ribbon would
otherwise sit in the corner of every shot.

One quirk worth expecting: the category pills read "Licht", "Ton", "Rigging" even in the
English set. Those are demo *data*, not UI strings, so they do not translate.
