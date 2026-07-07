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
- **Multiple providers, each with its own API key** — Anthropic (Messages
  API), OpenAI, Nous Portal, and any custom OpenAI-compatible endpoint. Add
  as many as you like.
- **Automatic model detection** — after entering a key, tap *Detect models*
  to fetch that provider's model list (`GET /v1/models` for Anthropic,
  `GET /models` for OpenAI). No hand-typing model names.
- **In-chat model picker** — switch model from the top bar; every model
  across every configured provider is listed and grouped.
- **Think mode per chat** — toggle extended thinking (reasoning) on/off for
  each conversation. When on, the reasoning stream renders in a collapsible
  *Thinking* block (Anthropic `thinking:{adaptive}` + `thinking_delta`;
  OpenAI `reasoning_effort`).
- **Reasoning effort** — choose **Medium / High / Max** per chat.
- **File & image attachments** — attach images (sent as vision blocks) or
  text files (inlined) directly in the chat input.
- **Memory**: conversations are persisted locally (JSON in app storage),
  each remembering its model, think mode and effort; browsable, reopenable,
  deletable.
- **Skills**: toggle Hermes-style procedural skills; enabled skills are
  injected into the agent's system prompt.
- **Demo mode**: with no key the app still opens and responds locally.
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
A ready-built copy (`Hermes-2.0.0-ostadkachal.apk`) lives in [`dist/`](dist/).

> The release keystore (`app/hermes-release.keystore`) is a **self-signed demo
> key** committed for reproducible builds — replace it before publishing.

## Configure

Open **Settings** → pick a provider → paste your API key → **Save** → tap
**Detect models**. Then go to Chat, tap the model name in the top bar to pick
a model, toggle **Think** and choose an effort if you want reasoning, and
attach files/images with the buttons next to the input. For a self-hosted
Hermes/OpenAI-compatible server, **Add provider** → OpenAI-compatible → set
the base URL (e.g. `http://10.0.2.2:8000/v1` from an emulator).
