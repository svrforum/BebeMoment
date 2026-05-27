# bebe Android shell

A single public Android app (Capacitor) for the self-hosted **bebe** family photo
journal. Immich-style: the user enters their own server URL; the app loads that
family server in a WebView and receives push via FCM using **each admin's own
Firebase keys** (BYO-FCM).

This project lives **outside** the pnpm workspace (it uses npm) so its Capacitor
dependencies never churn the monorepo's React-pinned lockfile.

## What it does

- **Server URL onboarding** (`www/onboarding.js`): enter `https://your-server`,
  validated against `/api/health`, persisted in Capacitor Preferences; the
  WebView then loads the server.
- **BebePush plugin** (`android/.../BebePushPlugin.java`): initializes a secondary
  `FirebaseApp` from the admin-provided public Firebase config (fetched by the web
  app from `/api/push/fcm-config`) and returns the FCM device token. The web app
  POSTs it to `/api/notifications/register-device`.
- **BebeMessagingService**: shows incoming pushes and deep-links into the WebView
  via the notification's `data.url`.

The server side (token storage, FCM HTTP v1 sending, admin settings) lives in
`apps/web` — see `docs/superpowers/plans/2026-05-27-android-server-fcm-push.md`.

## Prerequisites

- JDK 17, Android SDK (platform 34, build-tools 34), Node 18+.
- On this server they're already installed: `~/android-sdk` +
  `/usr/lib/jvm/java-17-openjdk-amd64`.

## Build

```bash
cd android-app
npm install
npx cap sync android        # after changing www/ or plugins

cd android
export ANDROID_HOME=~/android-sdk
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
./gradlew assembleDebug      # -> app/build/outputs/apk/debug/app-debug.apk
```

The **debug** APK is signed with the debug key — fine for sideloading/testing.
For distribution build a **release** APK with your own keystore:

```bash
keytool -genkey -v -keystore bebe-release.jks -keyalg RSA -keysize 2048 \
  -validity 10000 -alias bebe          # keep this file OUT of the repo
# add a signingConfigs.release reading keystore path/passwords from
# ~/.gradle/gradle.properties, then:
./gradlew assembleRelease
```

## Enabling push (admin, one-time)

1. Create a Firebase project; add an Android app with package `im.bebe.app`.
2. In bebe **Admin → 알림 (Notifications)**:
   - paste the **service account JSON** (Project settings → Service accounts →
     Generate new private key) into "서비스 계정 JSON",
   - paste the **public app config** (apiKey/appId/projectId/messagingSenderId)
     into "앱 Firebase 설정",
   - turn the **FCM** toggle ON.
3. In the app: open Settings → toggle "이 기기에서 알림 받기" to register the device.

The service account is stored encrypted (AES-256-GCM via `SECRET_KEY`) and never
returned by any API. Only the public client config is exposed (`/api/push/fcm-config`).
