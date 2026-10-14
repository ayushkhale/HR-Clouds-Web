# 04 · Environment setup — React Native CLI (bare)

Target: **RN 0.76+** (New Architecture on by default), Hermes, JavaScript.

Verify the current version before you start — `npx react-native@latest --version`
— and read that release's upgrade notes. Versions below are what was current at
the time of writing; pin them in `package.json` once the app builds.

---

## 1. Toolchain

### Both platforms

```bash
node -v        # 20 LTS or 22 LTS. Not 23+
npm -v         # or use yarn/pnpm consistently — never mix lockfiles
watchman --version   # optional on Windows, strongly recommended on macOS
```

### Android (you are on Windows — this is your main path)

| Tool | Version |
|---|---|
| JDK | **17** (Temurin). Not 21, not 11 |
| Android Studio | Ladybug or newer |
| Android SDK Platform | 35 (compileSdk / targetSdk) |
| Build Tools | 35.0.0 |
| NDK | whatever the RN version pins — don't choose your own |
| Platform Tools | latest |

Environment variables (user scope, PowerShell):

```powershell
[Environment]::SetEnvironmentVariable('ANDROID_HOME', "$env:LOCALAPPDATA\Android\Sdk", 'User')
[Environment]::SetEnvironmentVariable('JAVA_HOME', 'C:\Program Files\Eclipse Adoptium\jdk-17.0.13.11-hotspot', 'User')
# Add to PATH: %ANDROID_HOME%\platform-tools, %ANDROID_HOME%\emulator
```

Then **restart the terminal** and confirm:

```bash
adb devices        # your phone, with USB debugging on
java -version      # 17.x
```

### iOS (needs a Mac — plan for this, you cannot cross-build)

| Tool | Version |
|---|---|
| macOS | Sonoma or newer |
| Xcode | 16+ |
| CocoaPods | 1.15+ (`sudo gem install cocoapods`) |
| Ruby | use the system Ruby via `rbenv`, not Homebrew's |

If there is no Mac in the project, **ship Android first** and say so in the
plan. Don't build iOS-shaped abstractions you can't test.

---

## 2. Create the project

```bash
cd C:/Freelance Projects
npx @react-native-community/cli@latest init HRCloudsEmployee
cd HRCloudsEmployee
```

Do **not** use a template that bundles navigation or styling — the starter kit
in `NativeRef/50-starter/` is the template.

Sanity check before adding anything:

```bash
npx react-native run-android     # must build and show the welcome screen
```

If that fails, fix it before installing a single dependency. Debugging a native
build with 25 libraries in it is a different job.

---

## 3. Dependencies

Install in these groups, and **run a build after each group**. That is the whole
trick to bare RN: you always know which library broke it.

### Group A — navigation (required)

```bash
npm i @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs
npm i react-native-screens react-native-safe-area-context
npm i react-native-gesture-handler react-native-reanimated
```

Then:

- `babel.config.js` → add `'react-native-reanimated/plugin'` as the **last**
  plugin in the array. Nothing works if it isn't last.
- `index.js` → `import 'react-native-gesture-handler';` as the **first** line.
- `App.jsx` → wrap everything in `<GestureHandlerRootView style={{flex:1}}>`.
- Android: `MainActivity.kt` must extend `ReactActivity` with
  `react-native-screens`' fragment fix — the CLI template already does this in
  0.76+; verify `onCreate` calls `super.onCreate(null)`.

### Group B — storage, session, device

```bash
npm i @react-native-async-storage/async-storage   # non-sensitive prefs only
npm i react-native-keychain                       # the access token lives HERE
npm i react-native-device-info                    # punch metadata, app version
npm i @react-native-community/netinfo             # offline detection
npm i react-native-config                         # .env → native build
```

`react-native-config` needs manual wiring on both platforms — follow its README
exactly; it is the one library in this list where a half-done setup silently
yields `undefined` for every key. Verify with
`console.log(Config.API_BASE_URL)` on a real build, not in Metro.

### Group C — location (the reason this app exists)

```bash
npm i react-native-permissions
npm i react-native-geolocation-service
```

`react-native-geolocation-service` over `@react-native-community/geolocation`:
it uses FusedLocationProvider on Android, honours `enableHighAccuracy`
properly, and reports `PERMISSION_DENIED` vs `POSITION_UNAVAILABLE`
distinguishably — which `lib/location.js` needs to produce the right
`GEO_STATUS`.

**Android** `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<!-- Do NOT add ACCESS_BACKGROUND_LOCATION. We never punch in the background,
     and asking for it triggers a Play Store policy review you do not want. -->
```

**iOS** `ios/HRCloudsEmployee/Info.plist`:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>HR Clouds records where you clocked in, so your attendance can be
verified against your work location.</string>
```

Write that string carefully — it is shown to the user and reviewed by Apple.
Say *why*, in the employee's words. See
[60-ops/02-permissions-and-native.md](../60-ops/02-permissions-and-native.md).

**iOS** `ios/Podfile` — `react-native-permissions` needs the handlers you use
declared at build time:

```ruby
setup_permissions([
  'LocationWhenInUse',
  'Camera',
  'PhotoLibrary',
  'Notifications',
])
```

### Group D — files, documents, media

```bash
npm i react-native-blob-util          # authenticated binary download to disk
npm i react-native-file-viewer        # hand a PDF to the OS viewer
npm i react-native-share              # share a payslip
npm i react-native-image-picker       # camera + gallery, for receipts
npm i @react-native-documents/picker  # file picker (the maintained fork)
```

Android 13+: image picker needs `READ_MEDIA_IMAGES`, not
`READ_EXTERNAL_STORAGE`. Android 14+ adds the partial-access path — handle the
"selected photos only" result, don't treat it as a denial.

### Group E — UI and charts

```bash
npm i react-native-svg
npm i react-native-gifted-charts
npm i @gorhom/bottom-sheet            # RecordSheet / FormSheet
npm i @react-native-community/datetimepicker   # TimeField / DateField
npm i react-native-bootsplash         # splash, no white flash
```

`@gorhom/bottom-sheet` v5 needs Reanimated 3 and gesture-handler — already in
Group A. It is what makes `RecordSheet` feel native rather than like a web modal.

### Group F — auth and comms (as needed)

```bash
npm i @react-native-google-signin/google-signin   # Google SSO → idToken → /auth/google
npm i react-native-keyboard-controller            # form screens that don't jump
```

### Group G — later phases

```bash
npm i @notifee/react-native @react-native-firebase/app @react-native-firebase/messaging  # push (phase 6+)
npm i react-native-biometrics                                                            # app lock (phase 8)
npm i @sentry/react-native                                                               # crash reporting (phase 8)
```

### iOS after every group

```bash
cd ios && pod install && cd ..
```

---

## 4. Project configuration

### `babel.config.js`

```js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // module resolver so you can write "@/api" instead of "../../../api"
    ['module-resolver', { root: ['./src'], alias: { '@': './src' } }],
    'react-native-reanimated/plugin',   // MUST be last
  ],
};
```

```bash
npm i -D babel-plugin-module-resolver
```

Mirror the alias in `jsconfig.json` so the editor follows it:

```json
{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"] } } }
```

### `metro.config.js`

Leave the default unless you add SVG-as-component (`react-native-svg-transformer`).
If you do, remember Metro config changes need a `--reset-cache` start.

### `android/app/build.gradle`

```gradle
android {
    compileSdk 35
    defaultConfig {
        applicationId "in.hrclouds.employee"
        minSdk 24          // Android 7. Below this, nothing in the dep list is tested
        targetSdk 35
        versionCode 1
        versionName "1.0.0"
    }
}
```

Set `applicationId` and the iOS bundle id **before** you create signing keys,
Firebase projects or store listings. Changing it later means redoing all three.

### `ios/.../Info.plist` extras

```xml
<key>UIViewControllerBasedStatusBarAppearance</key><false/>
<key>UIUserInterfaceStyle</key><string>Light</string>
```

`UIUserInterfaceStyle: Light` locks out dark mode — deliberate for v1 (see
[20-design/01-design-tokens.md](../20-design/01-design-tokens.md) § Dark mode).
The Android equivalent is `android:forceDarkAllowed="false"` on the application
theme plus a light-only `values/themes.xml` (no `values-night/`).

### Fonts — Manrope

The web app uses **Manrope** (and Poppins on the marketing site, which this app
doesn't need). Ship Manrope as a bundled asset; do not load it from Google Fonts
at runtime.

1. Download Manrope 300/400/500/600/700/800 `.ttf` from Google Fonts.
2. Put them in `src/assets/fonts/`.
3. `react-native.config.js`:
   ```js
   module.exports = { assets: ['./src/assets/fonts'] };
   ```
4. `npx react-native-asset`
5. iOS: confirm the files landed in `Info.plist` → `UIAppFonts`.
6. **The font family name is not the file name.** Check the real PostScript
   name (`Manrope-Bold`, not `Manrope Bold` or `manrope_bold`) or text renders
   in the system font with no error. Verify on both platforms before building
   `theme/typography.js` on top of it.

---

## 5. Scripts

```json
{
  "scripts": {
    "android": "react-native run-android",
    "android:release": "react-native run-android --mode=release",
    "ios": "react-native run-ios",
    "start": "react-native start",
    "start:clean": "react-native start --reset-cache",
    "lint": "eslint .",
    "pod": "cd ios && pod install && cd ..",
    "clean:android": "cd android && ./gradlew clean && cd ..",
    "bundle:android": "cd android && ./gradlew bundleRelease && cd .."
  }
}
```

---

## 6. ESLint

Keep the RN default and add the two rules the web repo relies on:

```js
// eslint.config.js (flat)
rules: {
  'react/no-unescaped-entities': 'error',   // forces the ’ (U+2019) habit
  'react-refresh/only-export-components': 'warn',
  'no-restricted-imports': ['error', {
    paths: [
      { name: 'react-native', importNames: ['Modal'],
        message: 'Use ui/RecordSheet or ui/FormSheet — never a raw Modal for data.' },
    ],
    patterns: [
      { group: ['**/api/client'], message: 'Screens call api/<domain>.api.js, never client.js directly.' },
    ],
  }],
}
```

That last rule mechanically enforces house rule §7. Add more as you find
yourself repeating a code review.

---

## 7. First-run checklist

- [ ] `npm run android` builds and launches on a **physical** device
- [ ] `npm run ios` builds (or: documented as deferred, with a reason)
- [ ] Reanimated works: a `withSpring` animation runs
- [ ] `Config.API_BASE_URL` prints the dev gateway on a **release** build too
- [ ] Manrope renders (compare a heading against the web app on screen)
- [ ] Keychain round-trips a string
- [ ] Location permission prompt appears with **your** copy, and a coordinate
      comes back on a real device outdoors
- [ ] `@gorhom/bottom-sheet` opens, drags and dismisses
- [ ] A `react-native-blob-util` download writes a file and `file-viewer`
      opens it
- [ ] Release build of the Android app runs (`--mode=release`) — debug-only
      success hides ProGuard and Hermes problems until the worst moment

---

## 8. Optional: NativeWind

Not recommended (see [02-architecture.md](02-architecture.md) § Why StyleSheet),
but if you choose it:

```bash
npm i nativewind tailwindcss@3.4.17 react-native-css-interop
npx tailwindcss init
```

- `tailwind.config.js` → `content: ['./src/**/*.{js,jsx}']`, and **import the
  token values from `src/theme/tokens.js`** so there is still one source of
  truth.
- `babel.config.js` → add `'nativewind/babel'`, still keeping the Reanimated
  plugin last.
- `metro.config.js` → wrap with `withNativeWind`.
- Add `global.css` with the three `@tailwind` directives and import it in
  `index.js`.

Then read [20-design/08-tailwind-to-native-map.md](../20-design/08-tailwind-to-native-map.md)
anyway — it lists which web classes are meaningless in RN, which is the part
NativeWind will not warn you about.

---

## 9. Known bare-RN gotchas on Windows

| Symptom | Cause | Fix |
|---|---|---|
| `Could not determine java version` | JDK 21 or 11 | Install JDK 17, set `JAVA_HOME` |
| Build hangs at `Configure project` | Gradle daemon out of memory | `org.gradle.jvmargs=-Xmx4096m` in `android/gradle.properties` |
| `Unable to load script` | Metro not running, or device can't reach it | `adb reverse tcp:8081 tcp:8081` |
| Path-too-long errors | Deep `node_modules` + long project path | Move the project nearer the drive root. **`C:/Freelance Projects/HR Clouds/…` is already long — put the app repo at `C:/hrc-employee/`** |
| `Intl` / `toLocaleDateString` returns odd output on Android | Hermes ICU variance | `lib/dates.js` and `lib/format.js` in the starter kit avoid `Intl` for every string a user sees, precisely for this. Don't "simplify" them back to `toLocaleString` |
| Reanimated crash on release only | Plugin not last, or stale cache | Reorder, then `npm run start:clean` and a clean Gradle build |
