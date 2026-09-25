# Public test fixtures

`right_hands.jpg` is a public MediaPipe test asset. It is not captured from an application user's camera and is not bundled in the executable.

- Source: https://storage.googleapis.com/mediapipe-assets/right_hands.jpg
- Project: https://github.com/google-ai-edge/mediapipe
- SHA-256: `4b5134daa4cb60465535239535f9f74c2842aba3aa5fd30bf04ef5678f93d87f`
- Purpose: verify that the actual hand-landmark model finds two hands and does not classify open palms as a raised middle finger.

See [third-party notices](../../THIRD_PARTY_NOTICES.md). Do not replace this fixture with personal camera images. New fixtures must be synthetic or have a documented public source and an appropriate redistribution basis.

`background.webm` is a synthetic, silent VP8 video created for this project and covered by the repository's MIT License. It contains 12 frames at 10 fps, each 96 × 64 pixels: a solid blue background with a rectangle alternating between orange and green. It was encoded with OpenCV's FFmpeg backend. It contains no camera footage or user files and is not bundled in the executable. Tests use it to verify local video loading, looping, gesture-controlled visibility and playback cleanup; no encoder is needed to run the tests.
