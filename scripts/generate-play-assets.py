#!/usr/bin/env python3
"""Generate Beast Mode Google Play screenshots and a feature graphic.

This script logs into a real Beast Mode environment, seeds a small amount of
reviewer data when needed, captures phone screenshots via headless Chrome and
the DevTools protocol, then builds a 1024x500 feature graphic from the live UI.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import shutil
import subprocess
import tempfile
import time
import urllib.parse
from pathlib import Path

import requests
import websocket
from PIL import Image, ImageDraw, ImageFilter, ImageFont


DEFAULT_BASE_URL = "https://beastmode.namibarden.com"
DEFAULT_OUTPUT_DIR = Path("docs/play-assets")
VIEWPORT_WIDTH = 360
VIEWPORT_HEIGHT = 640
DEVICE_SCALE = 3


def json_headers(token: str | None = None) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def api(base_url: str, path: str, method: str = "GET", body: dict | None = None, token: str | None = None) -> dict:
    response = requests.request(
        method,
        f"{base_url}{path}",
        headers=json_headers(token),
        json=body,
        timeout=30,
    )
    try:
        payload = response.json()
    except Exception:
        payload = {"raw": response.text}
    if not response.ok:
        raise RuntimeError(f"{method} {path} failed: {response.status_code} {payload}")
    return payload


def ensure_reviewer_state(base_url: str, token: str, reviewer_username: str) -> None:
    api(
        base_url,
        "/api/user/settings",
        method="PUT",
        token=token,
        body={
            "duration": 2,
            "intervalMinutes": 60,
            "selectedExercises": ["pushups", "plank", "squats", "lunges"],
            "activeDays": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
            "startHour": 8,
            "endHour": 17,
            "alarmMessage": "Two-minute reset. Keep the streak alive.",
            "buddyUsername": reviewer_username,
            "teamName": "Desk Ninjas",
            "timezone": "UTC",
        },
    )

    profile = api(base_url, "/api/user/profile", token=token)
    today_points = int(profile.get("progress", {}).get("todayPoints", 0) or 0)

    if today_points >= 40:
        return

    for exercise_id, name, emoji, points in [
        ("pushups", "Push-ups", "P", 12),
        ("plank", "Plank", "L", 10),
    ]:
        api(
            base_url,
            "/api/workout/log",
            method="POST",
            token=token,
            body={
                "exerciseId": exercise_id,
                "exerciseName": name,
                "exerciseEmoji": emoji,
                "points": points,
                "durationMinutes": 2,
                "wasCompleted": True,
                "type": "alarm",
            },
        )


class CDPPage:
    def __init__(self, chrome_binary: str, base_url: str):
        self.chrome_binary = chrome_binary
        self.base_url = base_url
        self._message_id = 0
        self._tmp_dir = tempfile.TemporaryDirectory(prefix="beastmode-play-assets-")
        self._port = 9223
        self._proc = subprocess.Popen(
            [
                self.chrome_binary,
                "--headless=new",
                "--disable-gpu",
                "--hide-scrollbars",
                "--remote-allow-origins=http://127.0.0.1:9223",
                "--no-first-run",
                "--no-default-browser-check",
                f"--user-data-dir={self._tmp_dir.name}",
                f"--remote-debugging-port={self._port}",
                "about:blank",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self._ws = None
        self._connect()

    def _connect(self) -> None:
        version_url = f"http://127.0.0.1:{self._port}/json/version"
        tabs_url = f"http://127.0.0.1:{self._port}/json/list"

        for _ in range(60):
            try:
                requests.get(version_url, timeout=1).raise_for_status()
                break
            except Exception:
                time.sleep(0.25)
        else:
            raise RuntimeError("Chrome DevTools port never became ready")

        tabs = requests.get(tabs_url, timeout=5).json()
        page_tab = next((tab for tab in tabs if tab.get("type") == "page"), None)
        if not page_tab:
            raise RuntimeError("Could not find a page tab for Chrome")

        self._ws = websocket.create_connection(
            page_tab["webSocketDebuggerUrl"],
            timeout=30,
            suppress_origin=True,
        )
        self.send("Page.enable")
        self.send("Runtime.enable")
        self.send("Network.enable")
        self.send(
            "Emulation.setDeviceMetricsOverride",
            {
                "width": VIEWPORT_WIDTH,
                "height": VIEWPORT_HEIGHT,
                "deviceScaleFactor": DEVICE_SCALE,
                "mobile": True,
            },
        )
        self.send(
            "Emulation.setUserAgentOverride",
            {
                "userAgent": (
                    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36"
                )
            },
        )

    def close(self) -> None:
        try:
            if self._ws:
                self._ws.close()
        finally:
            self._proc.terminate()
            try:
                self._proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._proc.kill()
            self._tmp_dir.cleanup()

    def send(self, method: str, params: dict | None = None) -> dict:
        self._message_id += 1
        message_id = self._message_id
        self._ws.send(json.dumps({"id": message_id, "method": method, "params": params or {}}))

        while True:
            raw = self._ws.recv()
            payload = json.loads(raw)
            if payload.get("id") == message_id:
                if "error" in payload:
                    raise RuntimeError(f"CDP {method} failed: {payload['error']}")
                return payload.get("result", {})

    def navigate(self, url: str) -> None:
        self.send("Page.navigate", {"url": url})
        self.wait_for("document.readyState === 'complete'", timeout=20)
        self.wait(1.2)

    def wait(self, seconds: float) -> None:
        time.sleep(seconds)

    def evaluate(self, expression: str, await_promise: bool = False):
        result = self.send(
            "Runtime.evaluate",
            {
                "expression": expression,
                "awaitPromise": await_promise,
                "returnByValue": True,
                "userGesture": True,
            },
        )
        return result.get("result", {}).get("value")

    def wait_for(self, expression: str, timeout: float = 15) -> None:
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                if self.evaluate(expression):
                    return
            except Exception:
                pass
            time.sleep(0.25)
        raise TimeoutError(f"Timed out waiting for condition: {expression}")

    def click_text(self, needle: str) -> None:
        encoded = json.dumps(needle.lower())
        clicked = self.evaluate(
            f"""(() => {{
                const needle = {encoded};
                const nodes = [...document.querySelectorAll('button, a, div[role="button"]')];
                const target = nodes.find((node) => (node.innerText || '').toLowerCase().includes(needle));
                if (!target) return false;
                target.click();
                return true;
            }})()"""
        )
        if not clicked:
            raise RuntimeError(f'Could not find clickable element containing "{needle}"')
        self.wait(1.0)

    def click_gear(self) -> None:
        clicked = self.evaluate(
            """(() => {
                const nodes = [...document.querySelectorAll('button')];
                const target = nodes.find((node) => (node.innerText || '').includes('⚙'));
                if (!target) return false;
                target.click();
                return true;
            })()"""
        )
        if not clicked:
            raise RuntimeError("Could not find settings gear button")
        self.wait(1.0)

    def inject_token_and_reload(self, token: str) -> None:
        encoded = json.dumps(token)
        self.evaluate(
            f"""(() => {{
                localStorage.setItem('bm_token', {encoded});
                location.reload();
                return true;
            }})()"""
        )
        self.wait_for("document.body && document.body.innerText.includes('START 2-MIN RESET')", timeout=30)
        self.wait(1.2)

    def screenshot(self, output_path: Path) -> None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        result = self.send("Page.captureScreenshot", {"format": "png", "fromSurface": True})
        output_path.write_bytes(base64.b64decode(result["data"]))


def fit_text(draw: ImageDraw.ImageDraw, text: str, font_path: str, max_width: int, start_size: int) -> ImageFont.FreeTypeFont:
    size = start_size
    while size >= 18:
        font = ImageFont.truetype(font_path, size)
        bbox = draw.textbbox((0, 0), text, font=font)
        if bbox[2] - bbox[0] <= max_width:
            return font
        size -= 2
    return ImageFont.truetype(font_path, 18)


def create_feature_graphic(output_dir: Path) -> Path:
    feature_path = output_dir / "feature-graphic-1024x500.png"
    dashboard_path = output_dir / "phone" / "02-dashboard.png"
    icon_path = Path("public/icons/icon-512.png")
    bold_font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    regular_font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

    canvas = Image.new("RGBA", (1024, 500), "#0a0a0f")
    gradient = Image.new("RGBA", canvas.size)
    gradient_draw = ImageDraw.Draw(gradient)
    for y in range(canvas.height):
        blend = y / max(canvas.height - 1, 1)
        color = (
            int(10 + 30 * blend),
            int(10 + 16 * blend),
            int(15 + 6 * blend),
            255,
        )
        gradient_draw.line((0, y, canvas.width, y), fill=color)
    canvas = Image.alpha_composite(canvas, gradient)

    glow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse((620, -40, 1080, 440), fill=(255, 77, 0, 60))
    glow_draw.ellipse((-120, 220, 340, 700), fill=(255, 215, 0, 24))
    glow = glow.filter(ImageFilter.GaussianBlur(50))
    canvas = Image.alpha_composite(canvas, glow)

    draw = ImageDraw.Draw(canvas)

    icon = Image.open(icon_path).convert("RGBA").resize((112, 112))
    icon_mask = Image.new("L", icon.size, 0)
    ImageDraw.Draw(icon_mask).rounded_rectangle((0, 0, icon.width, icon.height), radius=28, fill=255)
    icon_holder = Image.new("RGBA", (136, 136), (255, 255, 255, 18))
    holder_mask = Image.new("L", icon_holder.size, 0)
    ImageDraw.Draw(holder_mask).rounded_rectangle((0, 0, icon_holder.width, icon_holder.height), radius=32, fill=255)
    canvas.alpha_composite(icon_holder, (72, 58))
    canvas.paste(icon, (84, 70), icon_mask)

    title_font = fit_text(draw, "BEAST MODE", bold_font_path, 420, 72)
    subtitle_font = fit_text(draw, "Micro-workouts and meditation resets that keep your streak alive.", regular_font_path, 420, 30)
    chip_font = ImageFont.truetype(bold_font_path, 24)
    body_font = ImageFont.truetype(regular_font_path, 22)

    draw.text((72, 214), "BEAST MODE", font=title_font, fill="#ffffff")
    draw.text((72, 286), "Micro-workouts and meditation resets", font=subtitle_font, fill="#f5e7da")
    draw.text((72, 320), "that keep your streak alive.", font=subtitle_font, fill="#f5e7da")

    chip_y = 382
    chip_specs = [
        ("MISSIONS", "#FF8C00"),
        ("STREAKS", "#FFD700"),
        ("MEDITATION", "#A78BFA"),
    ]
    x = 72
    for label, color in chip_specs:
        text_box = draw.textbbox((0, 0), label, font=chip_font)
        chip_w = text_box[2] - text_box[0] + 36
        draw.rounded_rectangle((x, chip_y, x + chip_w, chip_y + 46), radius=22, fill=(255, 255, 255, 16), outline=color, width=2)
        draw.text((x + 18, chip_y + 10), label, font=chip_font, fill=color)
        x += chip_w + 14

    draw.text((72, 448), "Built for daily momentum, not gym guilt.", font=body_font, fill="#c7c2bb")

    dashboard = Image.open(dashboard_path).convert("RGBA")
    dashboard = dashboard.resize((237, 422))
    phone = Image.new("RGBA", (281, 466), (0, 0, 0, 0))
    phone_draw = ImageDraw.Draw(phone)
    phone_draw.rounded_rectangle((0, 0, phone.width, phone.height), radius=42, fill=(9, 9, 13, 255), outline=(255, 255, 255, 40), width=3)
    phone_draw.rounded_rectangle((22, 22, phone.width - 22, phone.height - 22), radius=30, fill=(15, 15, 21, 255))
    canvas.alpha_composite(phone, (706, 38))
    canvas.alpha_composite(dashboard, (728, 60))

    highlight = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    highlight_draw = ImageDraw.Draw(highlight)
    highlight_draw.rounded_rectangle((720, 52, 720 + 255, 52 + 442), radius=36, outline=(255, 255, 255, 30), width=1)
    highlight = highlight.filter(ImageFilter.GaussianBlur(1))
    canvas = Image.alpha_composite(canvas, highlight)

    canvas.convert("RGB").save(feature_path, quality=95)
    return feature_path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate Beast Mode Play screenshots and feature graphic.")
    parser.add_argument("--base-url", default=os.environ.get("BEASTMODE_BASE_URL", DEFAULT_BASE_URL))
    parser.add_argument("--username", default=os.environ.get("BEASTMODE_PLAY_USERNAME"))
    parser.add_argument("--password", default=os.environ.get("BEASTMODE_PLAY_PASSWORD"))
    parser.add_argument("--output-dir", default=os.environ.get("BEASTMODE_PLAY_ASSET_DIR", str(DEFAULT_OUTPUT_DIR)))
    return parser


def chrome_binary() -> str:
    for candidate in ("google-chrome", "chromium", "chromium-browser"):
        path = shutil.which(candidate)
        if path:
            return path
    raise RuntimeError("Chrome or Chromium is required to capture Play screenshots")


def main() -> None:
    args = build_parser().parse_args()
    if not args.username or not args.password:
        raise SystemExit("Set BEASTMODE_PLAY_USERNAME and BEASTMODE_PLAY_PASSWORD before running this script.")

    output_dir = Path(args.output_dir)
    phone_dir = output_dir / "phone"
    output_dir.mkdir(parents=True, exist_ok=True)
    phone_dir.mkdir(parents=True, exist_ok=True)

    login = api(
        args.base_url,
        "/api/auth/login",
        method="POST",
        body={"identifier": args.username, "password": args.password},
    )
    token = login["token"]
    reviewer_username = login.get("user", {}).get("username") or login.get("username") or args.username
    ensure_reviewer_state(args.base_url, token, reviewer_username)

    browser = CDPPage(chrome_binary(), args.base_url)
    try:
        browser.navigate(args.base_url)
        browser.wait_for(
            "document.body && (document.body.innerText || '').toLowerCase().replace(/\\s+/g, ' ').length > 80",
            timeout=30,
        )
        browser.screenshot(phone_dir / "01-auth.png")

        browser.inject_token_and_reload(token)
        browser.screenshot(phone_dir / "02-dashboard.png")

        browser.click_text("meditation")
        browser.wait_for("document.body && document.body.innerText.includes('BEGIN MEDITATION')", timeout=15)
        browser.screenshot(phone_dir / "03-meditation.png")

        browser.click_text("workout")
        browser.wait_for("document.body && document.body.innerText.includes('START 2-MIN RESET')", timeout=15)
        browser.click_text("leaderboard")
        browser.wait_for("document.body && document.body.innerText.includes('LEADERBOARD')", timeout=15)
        browser.screenshot(phone_dir / "04-leaderboard.png")

        browser.click_text("back")
        browser.wait_for("document.body && document.body.innerText.includes('START 2-MIN RESET')", timeout=15)
        browser.click_gear()
        browser.wait_for("document.body && document.body.innerText.includes('DANGER ZONE')", timeout=15)
        browser.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.55)")
        browser.wait(0.8)
        browser.screenshot(phone_dir / "05-settings.png")
    finally:
        browser.close()

    feature_path = create_feature_graphic(output_dir)

    manifest = {
        "base_url": args.base_url,
        "captured_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "reviewer_username": reviewer_username,
        "artifacts": [
            str(phone_dir / "01-auth.png"),
            str(phone_dir / "02-dashboard.png"),
            str(phone_dir / "03-meditation.png"),
            str(phone_dir / "04-leaderboard.png"),
            str(phone_dir / "05-settings.png"),
            str(feature_path),
        ],
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
