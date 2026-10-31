"""Exercise the guided photo flow against the running, real four-model API.

Synthetic patterns exercise integration only; they do not measure scalp accuracy.
"""

import argparse
import base64
import io
import json
import os
import time
import urllib.request
from pathlib import Path

from PIL import Image
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
KEY = "scalp-ai-model-records-v2"


def browser_executable():
    override = os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE")
    if override:
        return override
    for base, relative in [
        ("PROGRAMFILES", "Google/Chrome/Application/chrome.exe"),
        ("PROGRAMFILES(X86)", "Microsoft/Edge/Application/msedge.exe"),
    ]:
        candidate = Path(os.environ.get(base, "")) / relative
        if candidate.is_file():
            return str(candidate)
    return None


def test_photo(index):
    image = Image.new("RGB", (320, 280))
    image.putdata([
        ((x * (index + 1) + index * 70) % 256, (y * 2 + index * 40) % 256,
         (x + y + index * 100) % 256)
        for y in range(image.height) for x in range(image.width)
    ])
    output = io.BytesIO()
    image.save(output, format="PNG")
    image.close()
    return {"name": f"synthetic-integration-{index}.png", "mimeType": "image/png", "buffer": output.getvalue()}


def assert_result(result, count):
    assert result["source"] == "model" and result["photo_count"] == count
    assert len(result["metrics"]) == 4 and len(result["per_photo"]) == count
    assert result["configuration_id"] and result["aggregation"] == "mean_probabilities"
    for j, metric in enumerate(result["metrics"]):
        assert len(metric["probabilities"]) == (4 if j == 0 else 3)
        assert abs(sum(metric["probabilities"]) - 1) < 1e-5
        for k, value in enumerate(metric["probabilities"]):
            expected = sum(p["metrics"][j]["probabilities"][k] for p in result["per_photo"]) / count
            assert abs(value - expected) < 1e-6
        assert metric["class_index"] == max(range(len(metric["probabilities"])), key=metric["probabilities"].__getitem__)


def ready(page):
    page.wait_for_function("document.querySelector('#server-status').textContent === 'AI 모델 연결됨'")


def next_step(page):
    page.locator('[data-action="next"]').click()


def expect_photos(page, count):
    expect(page.locator(".upload-slot img")).to_have_count(count)


def screenshot(page, output, name):
    page.evaluate("window.scrollTo({top: 0, behavior: 'instant'}); document.activeElement.blur()")
    page.evaluate("() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")
    page.screenshot(path=str(output / name), full_page=True)


def assert_layout(page, output, width, route):
    if page.evaluate("document.documentElement.scrollWidth <= innerWidth"):
        return
    screenshot(page, output, f"overflow-{width}-{route}.png")
    outside = page.evaluate("""() => [...document.querySelectorAll('main *')]
        .map(el => ({tag: el.tagName, cls: el.className, right: el.getBoundingClientRect().right,
                     width: el.getBoundingClientRect().width}))
        .filter(el => el.width > 1 && el.right > innerWidth + 1).slice(0, 20)""")
    raise AssertionError((width, route, outside))


def drop_photo(page, photo):
    page.locator(".drop-zone").evaluate(
        """(zone, photo) => {
            const bytes = Uint8Array.from(atob(photo.data), char => char.charCodeAt(0));
            const transfer = new DataTransfer();
            transfer.items.add(new File([bytes], photo.name, {type: photo.mimeType}));
            zone.dispatchEvent(new DragEvent('drop', {
                bubbles: true, cancelable: true, dataTransfer: transfer
            }));
        }""",
        {"name": photo["name"], "mimeType": photo["mimeType"],
         "data": base64.b64encode(photo["buffer"]).decode("ascii")},
    )


def open_details_for(page, selector):
    details = page.locator("details.details-panel").filter(has=page.locator(selector)).first
    if details.count() and details.get_attribute("open") is None:
        details.locator("summary").first.click()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    args = parser.parse_args()
    url = args.url.rstrip("/")
    deadline = time.monotonic() + 90
    while True:
        health = json.loads(urllib.request.urlopen(url + "/api/health", timeout=10).read())
        if health["status"] == "ready":
            break
        assert health["status"] != "error", health
        assert time.monotonic() < deadline, "Models did not become ready"
        time.sleep(1)
    assert len(health["models"]) == 4 and all(m["ready"] for m in health["models"])

    output = ROOT / "test-results"
    output.mkdir(exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, executable_path=browser_executable())
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = context.new_page()
        errors, analysis_requests = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("request", lambda req: analysis_requests.append(req.url)
                if req.url.endswith("/api/analyze") and req.method == "POST" else None)
        page.goto(url)
        ready(page)
        expect(page.locator(".sidebar")).to_have_count(0)
        expect(page.locator(".journey")).to_be_visible()
        expect(page.locator('[data-action="analyze"]')).to_have_count(0)
        screenshot(page, output, "analysis-desktop.png")

        # Skipping navigation must keep the current page and move focus to its content.
        page.locator('[data-nav="care"]').click()
        expect(page.locator("h1")).to_have_text("이렇게 찍으면 준비 끝이에요.")
        page.locator(".skip-link").focus()
        page.keyboard.press("Enter")
        expect(page.locator("#main")).to_be_focused()
        assert page.evaluate("location.hash") == "#care"
        page.locator('[data-nav="analysis"]').click()
        expect(page.locator('[data-action="next"]')).to_be_visible()

        # The first screen explains preparation; selecting files is a deliberate next step.
        next_step(page)
        expect(page.locator("#photos-bulk")).to_have_count(1)
        expect(page.locator('[data-action="next"]')).to_be_disabled()
        assert not analysis_requests
        page.locator("#photo-0").set_input_files(
            {"name": "invalid.svg", "mimeType": "image/svg+xml", "buffer": b"<svg/>"}
        )
        expect(page.locator("#upload-error")).not_to_have_text("")

        # Bulk picking, removal, and drag-and-drop all feed the same photo collection.
        page.locator("#photos-bulk").set_input_files([test_photo(0), test_photo(1)])
        expect_photos(page, 2)
        drop_photo(page, test_photo(2))
        expect_photos(page, 3)
        page.locator('[data-remove="1"]').click()
        expect_photos(page, 2)
        page.locator("#photo-1").set_input_files(test_photo(1))
        expect_photos(page, 3)
        screenshot(page, output, "upload-desktop.png")
        next_step(page)
        expect(page.locator('[data-action="analyze"]')).to_be_enabled()
        page.locator('[data-action="back"]').click()
        expect_photos(page, 3)
        next_step(page)
        assert not analysis_requests, "Navigating/reviewing photos must not send them for analysis"
        screenshot(page, output, "review-desktop.png")

        with page.expect_response(
            lambda response: response.url.endswith("/api/analyze") and response.request.method == "POST",
            timeout=180000,
        ) as pending:
            page.locator('[data-action="analyze"]').click()
            expect(page.locator(".loading-panel")).to_be_visible()
            assert page.locator('[data-file]:enabled, [data-bulk]:enabled').count() == 0
        response = pending.value
        assert response.ok, response.text()
        result = response.json()
        assert_result(result, 3)
        page.wait_for_url("**#report")
        expect(page.locator(".metric")).to_have_count(4)
        for index, metric in enumerate(result["metrics"]):
            label = metric["label"] if metric["settings_verified"] else f"참고번호 {metric['class_index']}"
            expect(page.locator(".metric-value").nth(index)).to_have_text(label)
        open_details_for(page, ".photo-results")
        expect(page.locator(".photo-results tbody tr")).to_have_count(3)
        open_details_for(page, ".probability-list")
        expect(page.locator(".probability-list")).to_have_count(4)

        page.locator('[data-action="save"]').click()
        saved = page.evaluate("key => JSON.parse(localStorage.getItem(key))", KEY)
        assert len(saved) == 1
        assert saved[0]["metrics"][0]["probabilities"] == result["metrics"][0]["probabilities"]
        assert saved[0]["configuration_id"] == result["configuration_id"]
        encoded = json.dumps(saved)
        assert "blob:" not in encoded and "data:image" not in encoded and "synthetic-integration" not in encoded
        screenshot(page, output, "report-desktop.png")

        page.reload()
        expect(page.locator(".empty-state")).to_have_count(1)
        page.locator('[data-nav="history"]').click()
        expect(page.locator("[data-record]")).to_have_count(1)
        expect(page.locator(".chart circle")).to_have_count(4)
        day = page.locator('[data-date]').first
        selected_date = day.get_attribute('data-date')
        day.focus()
        page.keyboard.press('Enter')
        expect(page.locator(f'[data-date="{selected_date}"]')).to_be_focused()
        open_details_for(page, '.chart')
        page.locator('[data-range="week"]').focus()
        page.keyboard.press('Enter')
        expect(page.locator('[data-range="week"]')).to_be_focused()
        expect(page.locator('[data-range="week"]')).to_have_attribute('aria-pressed', 'true')
        page.locator("[data-record]").click()
        expect(page.locator(".metric")).to_have_count(4)
        expect(page.locator(".result-thumbnail")).to_have_count(0)
        expect(page.locator('[data-action="save"]')).to_have_count(0)
        expect(page.get_by_role("heading", name="내 기록에 잘 보관했어요")).to_be_visible()

        # Check the real report and the other routes at small, phone, and tablet widths.
        for width in (320, 390, 768):
            page.set_viewport_size({"width": width, "height": 900})
            for route in ("analysis", "history", "care", "about"):
                page.goto(url + f"/?layout={width}-{route}#" + route)
                page.wait_for_function("document.querySelector('#main').children.length > 0")
                assert_layout(page, output, width, route)
            page.locator('[data-nav="history"]').click()
            page.locator("[data-record]").click()
            expect(page.locator(".metric")).to_have_count(4)
            assert_layout(page, output, width, "report")
            if width == 390:
                screenshot(page, output, "report-mobile.png")

        # A new analysis starts with a clean selection, without repeating the introduction.
        page.set_viewport_size({"width": 390, "height": 844})
        page.locator('[data-action="new"]').click()
        ready(page)
        expect_photos(page, 0)
        page.locator("#photo-0").set_input_files(test_photo(2))
        expect_photos(page, 1)
        screenshot(page, output, "upload-mobile.png")
        next_step(page)
        assert len(analysis_requests) == 1
        with page.expect_response(lambda response: response.url.endswith("/api/analyze"), timeout=180000) as pending:
            page.locator('[data-action="analyze"]').click()
        assert pending.value.ok, pending.value.text()
        one = pending.value.json()
        assert_result(one, 1)
        page.wait_for_url("**#report")
        expect(page.locator(".metric")).to_have_count(4)

        # API failures preserve the selected photo for retry and never fabricate a report.
        page.locator('[data-action="new"]').click()
        page.locator("#photos-bulk").set_input_files(test_photo(0))
        expect_photos(page, 1)
        next_step(page)
        page.route("**/api/analyze", lambda route: route.fulfill(status=503, json={"error": "Smoke unavailable"}))
        page.locator('[data-action="analyze"]').click()
        expect(page.locator("#upload-error")).not_to_have_text("")
        expect(page.locator('[data-action="analyze"]')).to_be_enabled()
        page.locator('[data-action="back"]').click()
        expect_photos(page, 1)
        page.evaluate("location.hash = 'report'")
        expect(page.locator(".empty-state")).to_have_count(1)

        # Opening the IDE file directly gives a recoverable entry point.
        local = context.new_page()
        local.goto((ROOT / "dist" / "index.html").as_uri())
        assert "start.cmd" in local.locator("#main").text_content()
        expect(local.locator('[data-action="analyze"]')).to_have_count(0)
        assert not errors, errors
        browser.close()
    print(json.dumps({
        "result": "PASS", "models": 4, "three_photo_ms": result["elapsed_ms"],
        "one_photo_ms": one["elapsed_ms"], "configuration_id": result["configuration_id"],
        "checks": "guided steps, keyboard navigation, bulk/drop/remove, preserved photos, no premature upload, real inference, "
                  "mean aggregation, storage/reload, history, 320/390/768 layouts, API failure/retry, file entry",
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()

