# Hermes Agent — Android

A native Android client for **[Hermes Agent](https://hermes-agent.nousresearch.com/)**,
Nous Research's open-source, self-improving AI agent. This app is the mobile
counterpart of the official Electron desktop app (`hermes-desktop`): it provides the
same user-facing surface — chat, sessions, skills, memory, persona, scheduler,
gateways, model/provider configuration — in a native Jetpack Compose UI.

> Splash screen credit: **developed by ostad kachal**

## What this is (and how it maps to Hermes)

Hermes Agent is a **server-side agent**: the intelligence (agent core, tool
execution, LLM inference) runs on a backend, and the desktop app is a **GUI client**
that talks to it over HTTP/SSE (`localhost:8642` locally, or a remote URL).

This Android app follows the exact same client architecture. It connects to any
**OpenAI-compatible** endpoint — Nous Portal, OpenRouter, OpenAI, a local
Ollama/vLLM/LM Studio server, or a remote Hermes backend — streams responses over
SSE, and stores your sessions on-device. Point it at a running Hermes backend (via
the "Hermes backend (remote)" preset) and it becomes a true mobile head for Hermes.

Out of the box it runs in **Demo mode** (offline canned replies) so it's usable with
no configuration; add a provider + API key in Settings and turn Demo mode off for
real, streaming answers.

## Features

| Area | Implemented |
| --- | --- |
| Splash screen | Animated Hermes emblem + `developed by ostad kachal` |
| Chat workspace | Streaming (SSE) chat, markdown + code rendering, per-session token counter |
| Slash commands | 16 commands surfaced in the composer |
| Sessions | On-device archive, full-text search, resume, delete |
| Skills | Catalog of 48 skills across 20 categories, search, enable/disable |
| Memory | 4 layers (Prompt/Session/Semantic/Procedural), add & recall |
| Persona | Editable system prompt applied to every chat |
| Scheduler | Cron tasks with delivery targets, enable/disable |
| Gateways | 16 messaging integrations, connect toggles |
| Settings | Provider presets, base URL, API key, model, temperature, streaming, profiles |
| Providers | Nous Portal, OpenRouter, OpenAI, local (Ollama/vLLM/LM Studio), remote Hermes, custom |
| Navigation | Drawer with 8 destinations, Material 3 dark theme |

## Tech stack

- Kotlin + Jetpack Compose (Material 3)
- Navigation Compose
- OkHttp (SSE streaming)
- SharedPreferences + JSON file store (no external DB)
- Min SDK 26, Target SDK 34

## Build

```bash
cd hermes-android
# SDK path
echo "sdk.dir=/path/to/Android/sdk" > local.properties

# Debug APK
gradle assembleDebug
# -> app/build/outputs/apk/debug/app-debug.apk

# Signed release APK (needs keystore.properties + keystore, see below)
gradle assembleRelease
# -> app/build/outputs/apk/release/app-release.apk
```

`keystore.properties` (for a signed release build):

```
storeFile=hermes-release.keystore
storePassword=...
keyAlias=hermes
keyPassword=...
```

## Notes on installation / Play Protect

To keep sideloaded installs clean and free of false positives, the app:

- requests only `INTERNET` + `ACCESS_NETWORK_STATE` (no SMS/contacts/location/etc.),
- ships **unobfuscated, non-minified** code (nothing to look like packed malware),
- is signed with a standard v1+v2+v3 release key,
- contains no dynamic code loading, reflection tricks, or hidden payloads.

This is the legitimate way to avoid scanner warnings — there is no evasion of malware
detection, because there is nothing malicious to hide. On first sideload Android may
still show the standard "unknown source" prompt; that is expected for any app not
installed from the Play Store.
