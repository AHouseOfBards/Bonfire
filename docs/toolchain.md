# Toolchain

What it takes to build, test and run Bonfire, and the client builds we make, platform by
platform. Versions are the ones in use on 2026-11-16. Each table names the file that sets
them, so a check is a matter of opening that file.

`tests/js/toolchain.js` fails when a Bonfire row here stops matching the file it names. The
Moonfin rows live in another repository and are checked by hand: open the file named in the
row.

## Bonfire, the plugin

| What | Version | Set in |
| --- | --- | --- |
| Target frameworks | `net9.0` and `net10.0`; only `net9.0` ships | `Jellyfin.Profiles.csproj` |
| .NET SDKs | 9.0.x and 10.0.x (a 10 SDK alone builds both) | `.github/workflows/ci.yml` |
| Jellyfin packages | `Jellyfin.Controller`, `.Model`, `.Common`, `.Extensions` 10.11.5 | `Jellyfin.Profiles.csproj` |
| Plugin `targetAbi` | 10.11.0.0 | `manifest.json` |
| Campground shared code | 1.0.1, vendored in `Campground.Shared/` | `Campground.Shared/campground-shared.json` |

## Servers it runs on

| Server | Versions tested in CI | Set in |
| --- | --- | --- |
| Jellyfin 10.11 | 10.11.11, Docker and Windows | `.github/workflows/ci.yml` |
| Jellyfin 12 | 12.4, Docker and Windows | `.github/workflows/ci.yml` |

The `net9.0` build loads on both: .NET 10 runs a .NET 9 assembly. See `CLAUDE.md` for why
only `net9.0` ships.

## The web client (`Web/profiles.js`, `Web/styles.css`, the dashboard)

| Where it runs | Oldest supported | Why that one |
| --- | --- | --- |
| LG webOS | webOS 4.5 (Chromium 53) | The oldest engine we serve. One token it can't parse stops the whole file. |
| Samsung Tizen | Tizen with the Bonfire loader added once | See `docs/troubleshooting.md#samsung-tizen`. |
| Desktop and phone browsers | Anything newer than Chromium 53, plus Safari | Safari is covered by the WebKit harnesses. |
| Jellyfin Media Player | Current release | Loads the web client. |

The JavaScript floor is checked by `tests/js/jsbaseline.js`; the CSS floor by
`tests/js/cssbaseline.js`.

## Testing

| What | Version | Set in |
| --- | --- | --- |
| Node.js | 22 in CI (24 works locally) | `.github/workflows/ci.yml` |
| Playwright | `playwright-core` 1.65.1, WebKit only | `tests/webkit/package.json` |
| Chrome or Edge | Any current one, for screenshots and videos (`tests/screens/`) | `tests/screens/chrome.js` (set `CHROME` to its path if it isn't found) |

Run everything with `tests/run.sh` (or `tests\run.ps1` on Windows).

## Moonfin, with the Bonfire switcher

Moonfin is a separate, GPL repository. These are its requirements, read from its files.

| What | Version | Set in (Moonfin repo) |
| --- | --- | --- |
| Flutter | 3.47.2 in Moonfin's CI; `>=3.47.0` | `.github/workflows/build.yml`, `pubspec.yaml` |
| Dart | `>=3.13.0 <4.0.0` | `pubspec.yaml` |

Build with Moonfin's own Flutter version. A newer Flutter can refuse Moonfin's Android
Gradle Plugin (3.50 needs AGP 9.1.1; Moonfin has 9.1.0).

### Android and Android TV

| What | Version | Set in |
| --- | --- | --- |
| JDK | 17 (Temurin). 21 fails: a plugin's Kotlin and Java targets disagree | `.github/workflows/build.yml` |
| Android Gradle Plugin | 9.1.0 | `android/settings.gradle.kts` |
| Kotlin | 2.4.0 | `android/settings.gradle.kts` |
| Gradle | 9.3.1 | `android/gradle/wrapper/gradle-wrapper.properties` |
| compileSdk / targetSdk | 36 | `android/app/build.gradle.kts`, Flutter's default |
| minSdk | 24 (Android 7.0) | Flutter's default |
| NDK | 28.2.13676358 | `android/app/build.gradle.kts` |
| Build tools, platform | `build-tools/36.0.0`, `platforms/android-36`, `platform-tools` | Android SDK |
| CPUs | arm64-v8a, armeabi-v7a, x86_64 | `android/app/build.gradle.kts` |
| Test install beside the real app | `MOONFIN_TEST_ID_SUFFIX=.bonfire` gives `org.moonfin.androidtv.bonfire`, "Moonfin Test" | `android/app/build.gradle.kts` |
| Emulator | Google TV, API 36, x86_64 (an x86 image can't run it: no x86 build) | Android SDK |

The Android SDK's `sdkmanager` now hands off to the `android` CLI, which names packages
with `/`, not `;` (`android sdk install platforms/android-36`).

### Windows

| What | Version | Set in |
| --- | --- | --- |
| Visual Studio | 2022 or later with "Desktop development with C++" (2026 works) | Flutter's Windows requirement |
| CMake | Comes with Visual Studio | |
| libarchive | From vcpkg, `libarchive:x64-windows` | `build-windows.ps1` |
| Installer | Inno Setup (CI only; not needed to run the build) | `.github/workflows/build.yml` |
| CPUs | x64; ARM64 on CI | `.github/workflows/build.yml` |

### Linux

| What | Version | Set in |
| --- | --- | --- |
| Packages | clang, cmake, ninja-build, pkg-config, libgtk-3-dev, libglib2.0-dev, libwebkit2gtk-4.1-dev, libmpv-dev, libsecret-1-dev, libasound2-dev, libarchive-dev | `.github/workflows/build.yml` |
| Packaging | rpm, flatpak, flatpak-builder, libfuse2, zsync | `.github/workflows/build.yml` |

### Apple

| What | Version | Set in |
| --- | --- | --- |
| iOS | Xcode 27.2; iOS 18.0 and later | `.github/workflows/build.yml`, `ios/Runner.xcodeproj` |
| macOS | Xcode 26.3; macOS 15.0 and later | `.github/workflows/build.yml`, `macos/Runner.xcodeproj` |
| tvOS | Xcode 26.3 with the tvOS platform downloaded | `.github/workflows/build.yml` |

A Mac is needed for all three. We don't have one, so these are untested with Bonfire.

### Web

| What | Version | Set in |
| --- | --- | --- |
| Flutter web | Same Flutter as above; `flutter build web` | `.github/workflows/build.yml` |

## Other clients

These aren't built by us. Bonfire is tested against the version in brackets in
`docs/clients.md`: Android TV, Roku, Swiftfin, Findroid, Wholphin, Aster, Streamyfin, Plezy
and Tsukimi.
