# Emberforge — Android Build Guide (Capacitor)

Emberforge is built to run offline on Android via Capacitor with zero network calls or API keys.

## Prerequisites

- Node.js 20+ and npm
- Android Studio (with Android SDK Platform 34+ and Build-Tools)
- JDK 17 (bundled with recent Android Studio releases)

## 1. Install Capacitor Packages

From the project root:

```bash
npm install @capacitor/core @capacitor/android
npm install -D @capacitor/cli
```

## 2. Initialize Capacitor (if not already initialized)

`capacitor.config.ts` is already included with placeholder App ID `com.emberforge.game` (edit `src/data/config.ts` and `capacitor.config.ts` to customize). If initializing fresh:

```bash
npx cap init "Emberforge" "com.emberforge.game" --web-dir=dist
```

## 3. Bundle Offline Fonts (Optional Custom Pixel Font)

Emberforge ships with zero external font network requests (using crisp monospace + custom canvas pixel bitmap glyphs) so it works 100% offline out of the box. If you wish to bundle a custom `.woff2` pixel font (such as `Press Start 2P` or `Silkscreen`):

1. Place the `.woff2` file inside `public/assets/fonts/` (e.g. `public/assets/fonts/pixel.woff2`).
2. Add an `@font-face` rule in `src/index.css`:
   ```css
   @font-face {
     font-family: 'EmberPixel';
     src: url('./assets/fonts/pixel.woff2') format('woff2');
     font-display: swap;
   }
   ```
3. Update `--font-pixel` in `src/index.css` to `'EmberPixel', "Courier New", monospace`.

## 4. Build Web Bundle & Sync Android

```bash
npm run build
npx cap add android
npx cap sync android
```

*(On subsequent updates after editing web code, run `npm run build && npx cap sync android`.)*

## 5. Configure Orientation & Fullscreen in Android Studio

Open the Android project:

```bash
npx cap open android
```

Recommended edits in `android/app/src/main/AndroidManifest.xml`:
- Set `android:screenOrientation="sensorLandscape"` on `<activity>` for optimal landscape play.
- Ensure `android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"` is present.

## 6. Build Debug APK or Release AAB

In Android Studio:
- **Test on device / emulator:** Click **Run** (`Shift+F10`).
- **Debug APK:** **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
- **Play Store Release AAB:** **Build → Generate Signed Bundle / APK → Android App Bundle**, create/select your upload keystore, and export `app-release.aab`.
