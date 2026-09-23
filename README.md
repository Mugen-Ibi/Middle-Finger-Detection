# Middle Finger Detection

Windows webcam demo. Detects a middle-finger gesture and adds comic effects. Video is processed locally and is not saved or sent.

## Run

Requires Windows 11, Python 3.11 and a webcam.

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python app.py
```

Allow camera access and show one hand to the webcam. Press `Q` or `Esc` to quit, or `Space` to pause.

## Build the exe

```powershell
pyinstaller --noconfirm --clean --onefile --windowed --name MiddleFingerDetection --collect-all mediapipe app.py
```

The executable is written to `dist\\MiddleFingerDetection.exe`. GitHub Actions also builds a Windows x64 executable and attaches it as a workflow artifact.

## Notes

- Gesture recognition is a simple demo heuristic. Hand orientation, lighting and camera placement affect detection.
- Windows SmartScreen may warn on first launch because the exe is unsigned.
- No distribution license is configured.