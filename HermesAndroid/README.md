# Hermes — Android

A native **Android client** for [Hermes Agent](https://github.com/nousresearch/hermes-agent)
(the open-source autonomous AI agent by Nous Research). It reproduces the core
experience of *Hermes Desktop* on a phone: chat with the agent, persistent
on-device memory, a skills catalogue, and provider/API-key settings.

> Splash screen credit: **developed by ostad kachal**

## Why a client (and not a 1:1 port)

Hermes' core is a **server-side Python agent** that relies on Docker, SSH,
subprocess execution, terminal backends (Modal/Daytona/Singularity), ripgrep,
ffmpeg and full filesystem access. None of that runs inside a normal Android
app sandbox, so a literal "everything on the phone" port isn't possible. Instead
this app talks directly to an LLM provider and delivers the parts of Hermes that
*do* make sense on mobile — the agent chat, memory and skills — as a clean,
installable APK.

## Features

- **Splash screen** with the Hermes mark and `developed by ostad kachal`.
- **Streaming chat** with the agent (token-by-token, with a stop button).
- **Providers**: Anthropic (Messages API), OpenAI, Nous Portal, and any
  custom OpenAI-compatible endpoint. Configurable base URL, model,
  temperature and system prompt.
- **Memory**: conversations are persisted locally (JSON in app storage) and
  browsable/reopenable/deletable.
- **Skills**: toggle Hermes-style procedural skills; enabled skills are
  injected into the agent's system prompt.
- **Demo mode**: with no API key the app still opens and responds locally,
  so it's demoable out of the box.
- Material 3, dark-first theme, edge-to-edge, RTL-safe.

Everything (keys, history) stays **on the device**.

## Tech

- Kotlin 2.0 · Jetpack Compose (Material 3) · AGP 8.6 · Gradle 8.9
- OkHttp (SSE streaming) · DataStore (settings) · `org.json` (persistence)
- `minSdk 24` … `targetSdk 35`, package `net.ostadkachal.hermes`

## Build

```bash
export ANDROID_HOME=/path/to/android-sdk
./gradlew :app:assembleRelease      # signed release APK
./gradlew :app:assembleDebug        # debug APK
```

Output: `app/build/outputs/apk/release/app-release.apk`
A ready-built copy lives in [`dist/`](dist/).

> The release keystore (`app/hermes-release.keystore`) is a **self-signed demo
> key** committed for reproducible builds — replace it before publishing.

## Configure

Open **Settings** → pick a provider → paste your API key → set the model →
**Save**. Then chat. For a self-hosted Hermes/OpenAI-compatible server, choose
**Custom** and set the base URL (e.g. `http://10.0.2.2:8000/v1` from an emulator).
