# Orbit — Qalam companion app

A small native app (Expo / React Native) that does what a website can't: it logs
into Qalam **on your device**, where a real browser passes Qalam's bot wall, and
sends your attendance + results to your Orbit account. See
`../docs/qalam-integration.md` for why this has to be a native app.

**It never stores your Qalam password.** You log into Qalam's own page inside the
app (a WebView); the app only reads the page you open and posts the normalized
rows to Orbit using a pairing code.

## How it works

1. **Pair** with your Orbit account: in Orbit (web) → Integrations → Qalam →
   *Connect the app* → create a pairing code. Enter your Orbit URL + that code in
   the app.
2. **Open Qalam & sync**: log into Qalam, open your marks / attendance / results
   page, tap **Pull page**. The app reads that page in your session and sends it
   to Orbit. After the first login Qalam stays signed in, so it's one tap next time.

## Run it in development

```bash
cd mobile
npx expo start        # opens the dev server; press 'a' for Android
```

`react-native-webview` is a native module, so Expo Go may not include it. If the
WebView screen is blank in Expo Go, use a development build:

```bash
npx expo run:android   # needs Android SDK + a connected device/emulator
```

## Build an installable APK (no Android Studio needed) — EAS cloud build

```bash
npm i -g eas-cli          # or: npx eas-cli@latest <cmd>
eas login                 # free Expo account
eas build:configure
eas build --platform android --profile preview   # produces an installable .apk
```

EAS runs the build in the cloud and gives you a download/QR link; open it on your
phone to install. The `preview` profile yields an APK you can sideload (set it to
`"buildType": "apk"` in `eas.json` if you customize profiles). For the Play Store
later, use the `production` profile (AAB) and `eas submit`.

## Calibration

The column aliases in `scrape.ts` are best-effort until confirmed against real
Qalam HTML. The app shows the detected data type and row count before sending; if
a page reads but the data looks wrong, adjust `ALIASES` in `scrape.ts` (or share a
redacted copy of the page so it can be tuned).
