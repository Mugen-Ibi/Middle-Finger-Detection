# Third-party components

- **MediaPipe Tasks Vision 1.0.1** — Copyright The MediaPipe Authors. Apache License 2.0. [Source](https://github.com/google-ai-edge/mediapipe), [license included in the app](web/MEDIAPIPE_LICENSE.txt). The JavaScript bundle and WASM files are copied from the version pinned by `package-lock.json` during asset preparation.
- **MediaPipe Hand Landmarker, float16, version 1** — Google / MediaPipe. [Model documentation](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker), [original model](https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task). SHA-256: `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1`.
- **right_hands.jpg** — MediaPipe public test fixture, used only by tests and excluded from the executable. [Original asset](https://storage.googleapis.com/mediapipe-assets/right_hands.jpg). SHA-256: `4b5134daa4cb60465535239535f9f74c2842aba3aa5fd30bf04ef5678f93d87f`. [MediaPipe repository](https://github.com/google-ai-edge/mediapipe).
- **Playwright** — Microsoft, Apache License 2.0. Development/test dependency only.
- **PyInstaller** — GPL 2.0 or later with the bootloader distribution exception. Used to produce the launcher; see [license](https://pyinstaller.org/en/stable/license.html).

Python and its standard library are included in the frozen launcher under the Python Software Foundation License. No application-wide license is granted by this notice.
