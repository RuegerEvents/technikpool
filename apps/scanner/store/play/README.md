# Play Store listing assets

Source files for the Google Play listing. Nothing here is uploaded by CI: the
fastlane lanes set `skip_upload_metadata` and `skip_upload_images` on purpose,
because a lane that also wrote the listing would revert whatever was edited in
the console. These are the files a human uploads once, kept in the repo so the
next version starts from what is already published rather than from scratch.

| File                     | Play field                                    |
| ------------------------ | --------------------------------------------- |
| `listing-de.txt`         | App-Name, Kurzbeschreibung, Beschreibung (de) |
| `listing-en.txt`         | the same three fields for the en-US listing   |
| `icon-512.png`           | App-Symbol, 512x512                           |
| `feature-graphic.png`    | Vorstellungsgrafik, 1024x500                  |
| `phone/*.png`            | Screenshots für Telefon, 1080x1920            |
| `tablet7/*.png`          | Screenshots für 7"-Tablet, 1080x1920          |
| `tablet10/*.png`         | Screenshots für 10"-Tablet, 1440x2560         |

Upload the screenshots in filename order. Play shows them in upload order and
the captions read as a sequence.

## Regenerating

`./build.sh` rebuilds the icon and the feature graphic from `brand/mark.svg`,
the same master `scripts/brand.sh` uses for every other icon in the repo. Needs
`rsvg-convert` and `magick`.

The screenshots are real captures of the app in demo mode, framed on the brand
background afterwards. Play wants 16:9 or 9:16, which no current phone screen
is, so they were taken on throwaway emulators sized to the target ratio
(1080x1920 at 420dpi for the phone, 1440x2560 at 320dpi for the tablet) and the
capture is used at its native size. To redo them:

1. Create an AVD, then set `hw.lcd.width`, `hw.lcd.height` and `hw.lcd.density`
   in its `config.ini` to the values above.
2. `flutter build apk --release --target-platform android-arm64`, install it.
3. Put the status bar in demo mode so it shows a fixed clock and no
   notifications:
   `adb shell settings put global sysui_demo_allowed 1`, then
   `adb shell am broadcast -a com.android.systemui.demo -e command enter` plus
   the `clock`, `battery`, `network` and `notifications` commands.
4. Switch the app to German with the globe in the pairing screen's app bar, tap
   "Demo ausprobieren", and capture with `adb exec-out screencap -p`.
5. Frame each capture: drop the status bar, and on the tab screens drop the
   demo banner as well and splice its height back as white, so every shot has
   the same proportions. Both heights are in dp, so they scale with the
   device's **density**, not its pixel width: 45.7dp of status bar and 85.7dp
   down to the end of the banner.
