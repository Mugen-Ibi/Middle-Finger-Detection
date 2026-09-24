"""A tiny webcam demo that celebrates a detected middle-finger gesture."""

from __future__ import annotations

import math
import random
import time

import cv2
import mediapipe as mp


WINDOW_NAME = "Gesture Party | Q: quit  SPACE: pause"
PARTY_SECONDS = 2.8
CAMERA_BACKENDS = (cv2.CAP_DSHOW, cv2.CAP_MSMF)


def open_camera():
    """Try available Windows cameras/backends and return the first usable feed."""
    for index in range(4):
        for backend in CAMERA_BACKENDS:
            camera = cv2.VideoCapture(index, backend)
            if camera.isOpened():
                camera.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
                camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
                for _ in range(5):
                    ok, frame = camera.read()
                    if ok and frame is not None and frame.size:
                        # Skip device entries that open successfully but only return a black frame.
                        if frame.mean() < 2.0 and frame.std() < 1.0:
                            continue
                        print(f"Using camera {index} (backend {backend})")
                        return camera, frame
            camera.release()
    return None, None


def show_camera_error() -> None:
    """Show actionable feedback even when the packaged app has no console."""
    frame = __import__("numpy").zeros((360, 720, 3), dtype="uint8")
    draw_centered_text(frame, "CAMERA NOT AVAILABLE", 135, 0.9, (80, 100, 255), 2)
    draw_centered_text(frame, "Close other camera apps and check Camera privacy settings.", 205,
                       0.42, (255, 255, 255), 1)
    draw_centered_text(frame, "Press Q or Esc to close", 265, 0.5, (210, 210, 210), 1)
    cv2.imshow(WINDOW_NAME, frame)
    while (cv2.waitKey(30) & 0xFF) not in (ord("q"), 27):
        pass


def finger_is_extended(landmarks, tip: int, pip: int, mcp: int) -> bool:
    """Estimate extension using the finger's distance from its MCP joint."""
    tip_point = landmarks[tip]
    pip_point = landmarks[pip]
    mcp_point = landmarks[mcp]
    tip_distance = math.hypot(tip_point.x - mcp_point.x, tip_point.y - mcp_point.y)
    pip_distance = math.hypot(pip_point.x - mcp_point.x, pip_point.y - mcp_point.y)
    return tip_distance > pip_distance * 1.18


def is_middle_finger(landmarks) -> bool:
    """Recognize a raised middle finger with the other three fingers curled."""
    middle_up = finger_is_extended(landmarks, 12, 10, 9)
    index_up = finger_is_extended(landmarks, 8, 6, 5)
    ring_up = finger_is_extended(landmarks, 16, 14, 13)
    pinky_up = finger_is_extended(landmarks, 20, 18, 17)
    return middle_up and not index_up and not ring_up and not pinky_up


def draw_centered_text(frame, text: str, y: int, scale: float, color, thickness: int) -> None:
    font = cv2.FONT_HERSHEY_DUPLEX
    (width, height), _ = cv2.getTextSize(text, font, scale, thickness)
    x = max(8, (frame.shape[1] - width) // 2)
    cv2.putText(frame, text, (x, y), font, scale, (20, 20, 30), thickness + 5, cv2.LINE_AA)
    cv2.putText(frame, text, (x, y), font, scale, color, thickness, cv2.LINE_AA)


def add_party_effect(frame, started_at: float) -> None:
    elapsed = time.monotonic() - started_at
    height, width = frame.shape[:2]
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (width, height), (175, 45, 220), -1)
    strength = max(0.0, 0.15 * (1.0 - elapsed / PARTY_SECONDS))
    cv2.addWeighted(overlay, strength, frame, 1.0 - strength, 0, frame)

    rng = random.Random(int(started_at * 1000))
    for _ in range(42):
        x = rng.randrange(12, max(13, width - 12))
        y = (rng.randrange(height) + int(elapsed * rng.randrange(100, 320))) % height
        color = rng.choice(((40, 230, 255), (255, 110, 55), (90, 255, 120), (255, 255, 255)))
        cv2.circle(frame, (x, y), rng.randrange(3, 8), color, -1, cv2.LINE_AA)

    draw_centered_text(frame, "OH! YOU DID IT!", max(72, height // 5), 1.35, (80, 245, 255), 3)
    draw_centered_text(frame, "ABSOLUTE LEGEND", max(125, height // 5 + 55), 0.8, (255, 255, 255), 2)
    cv2.putText(frame, "* dramatic airhorn *", (22, height - 28), cv2.FONT_HERSHEY_SIMPLEX,
                0.62, (255, 255, 255), 2, cv2.LINE_AA)


def main() -> int:
    camera, first_frame = open_camera()
    if camera is None:
        cv2.namedWindow(WINDOW_NAME, cv2.WINDOW_NORMAL)
        show_camera_error()
        cv2.destroyAllWindows()
        return 1

    cv2.namedWindow(WINDOW_NAME, cv2.WINDOW_NORMAL)
    hands_api = mp.solutions.hands
    last_gesture_at = 0.0
    party_started_at: float | None = None
    paused = False

    with hands_api.Hands(
        static_image_mode=False,
        max_num_hands=1,
        model_complexity=0,
        min_detection_confidence=0.65,
        min_tracking_confidence=0.55,
    ) as hands:
        while True:
            if not paused:
                if first_frame is not None:
                    frame = first_frame
                    first_frame = None
                    ok = True
                else:
                    ok, frame = camera.read()
                if not ok:
                    print("Camera stopped returning frames.")
                    break
                frame = cv2.flip(frame, 1)
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                result = hands.process(rgb)

                detected = False
                if result.multi_hand_landmarks:
                    hand = result.multi_hand_landmarks[0]
                    mp.solutions.drawing_utils.draw_landmarks(
                        frame, hand, hands_api.HAND_CONNECTIONS,
                        mp.solutions.drawing_utils.DrawingSpec(color=(80, 240, 120), thickness=2, circle_radius=3),
                        mp.solutions.drawing_utils.DrawingSpec(color=(255, 190, 60), thickness=2),
                    )
                    detected = is_middle_finger(hand.landmark)

                now = time.monotonic()
                if detected and now - last_gesture_at > 1.1:
                    party_started_at = now
                    last_gesture_at = now

                if party_started_at is not None and now - party_started_at < PARTY_SECONDS:
                    add_party_effect(frame, party_started_at)
                elif detected:
                    draw_centered_text(frame, "GESTURE DETECTED", 70, 0.75, (80, 245, 255), 2)

                cv2.putText(frame, "Show one hand | Q: quit | SPACE: pause", (18, frame.shape[0] - 18),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.58, (255, 255, 255), 2, cv2.LINE_AA)
                cv2.putText(frame, f"CAMERA LIVE  {frame.shape[1]}x{frame.shape[0]}", (18, 34),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.65, (80, 240, 120), 2, cv2.LINE_AA)
                cv2.imshow(WINDOW_NAME, frame)

            key = cv2.waitKey(30) & 0xFF
            if key == ord("q") or key == 27:
                break
            if key == ord(" "):
                paused = not paused

    camera.release()
    cv2.destroyAllWindows()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

