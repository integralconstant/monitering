"""Exercise upload boundaries and inference semantics without real model weights.

Run: .venv\\Scripts\\python.exe -m unittest discover -s tests -v
Real checkpoint loading and browser integration are checked separately.
"""

from __future__ import annotations

import io
import threading
import unittest
from unittest.mock import patch

import torch
from flask import request
from PIL import Image
from torch import nn

import server
from inference import AnalysisBusy, ModelService, ModelUnavailable, read_config


def photo_bytes(mode="RGB", image_format="PNG", size=(8, 6), **save_options):
    stream = io.BytesIO()
    with Image.new(mode, size, color=128 if mode == "L" else (32, 64, 96)) as image:
        image.save(stream, format=image_format, **save_options)
    stream.seek(0)
    return stream


class RecordingService:
    def __init__(self):
        self.images = []
        self.observed = []
        self.streams_in_memory = False
        self.failure = None

    def health(self):
        return {"status": "ready", "models": [], "device": "cpu"}

    def analyze(self, images):
        self.images = list(images)
        self.observed = [(image.mode, image.size) for image in images]
        self.streams_in_memory = all(
            isinstance(upload.stream, io.BytesIO)
            for upload in request.files.getlist("photos")
        )
        if self.failure:
            raise self.failure
        return {"source": "model", "photo_count": len(images)}


class UploadApiTests(unittest.TestCase):
    def setUp(self):
        self.service = RecordingService()
        self.app = server.create_app(self.service)
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()

    def upload(self, photos=None, **kwargs):
        return self.client.post(
            "/api/analyze", data={"photos": photos or []},
            content_type="multipart/form-data", **kwargs,
        )

    def assert_error(self, response, status):
        self.assertEqual(response.status_code, status)
        self.assertIsInstance(response.json["error"], str)
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertNotIn("Access-Control-Allow-Origin", response.headers)

    def test_site_and_health_are_served_without_loading_real_models(self):
        site = self.client.get("/")
        self.assertEqual(site.status_code, 200)
        self.assertIn(b'<html lang="ko">', site.data)
        site.close()
        health = self.client.get("/api/health")
        self.assertEqual(health.json["status"], "ready")
        self.assertEqual(health.headers["Cache-Control"], "no-store")

    def test_one_grayscale_image_is_rgb_and_never_spooled_to_disk(self):
        response = self.upload([(photo_bytes(mode="L"), "scalp.png")])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["photo_count"], 1)
        self.assertEqual(self.service.observed, [("RGB", (8, 6))])
        self.assertTrue(self.service.streams_in_memory)
        with self.assertRaises(ValueError):
            self.service.images[0].getpixel((0, 0))

    def test_three_jpeg_png_webp_images_reach_the_service(self):
        response = self.upload([
            (photo_bytes(image_format=fmt), f"scalp.{fmt.lower()}")
            for fmt in ("JPEG", "PNG", "WEBP")
        ])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["photo_count"], 3)
        self.assertTrue(all(mode == "RGB" for mode, _ in self.service.observed))

    def test_exif_orientation_is_applied_before_inference(self):
        exif = Image.Exif()
        exif[274] = 6  # Rotate 90 degrees clockwise.
        response = self.upload([
            (photo_bytes(image_format="JPEG", size=(8, 6), exif=exif), "scalp.jpg")
        ])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.service.observed, [("RGB", (6, 8))])

    def test_missing_or_four_photos_are_rejected(self):
        for count in (0, 4):
            with self.subTest(count=count):
                response = self.upload([(photo_bytes(), f"{i}.png") for i in range(count)])
                self.assert_error(response, 400)
        self.assertFalse(self.service.images)

    def test_unexpected_multipart_file_field_is_rejected(self):
        response = self.client.post("/api/analyze", data={
            "photos": (photo_bytes(), "scalp.png"),
            "other": (photo_bytes(), "unexpected.png"),
        })
        self.assert_error(response, 400)

    def test_svg_gif_and_corrupt_photo_are_rejected_by_decoding(self):
        payloads = [
            (io.BytesIO(b'<svg xmlns="http://www.w3.org/2000/svg"/>'), "scalp.png"),
            (photo_bytes(image_format="GIF"), "scalp.png"),
            (io.BytesIO(b"not a photo"), "scalp.jpg"),
        ]
        for payload, filename in payloads:
            with self.subTest(filename=filename, payload=payload.getvalue()[:8]):
                self.assert_error(self.upload([(payload, filename)]), 400)
        self.assertFalse(self.service.images)

    def test_per_file_limit_and_total_request_limit_are_enforced(self):
        with patch.object(server, "MAX_FILE_BYTES", 32):
            self.assert_error(self.upload([(io.BytesIO(b"x" * 33), "large.jpg")]), 400)
        self.app.config["MAX_CONTENT_LENGTH"] = 256
        self.assert_error(self.upload([(io.BytesIO(b"x" * 1024), "large.jpg")]), 413)

    def test_pixel_limit_is_enforced_before_conversion(self):
        with patch.object(server, "MAX_PIXELS", 16):
            self.assert_error(self.upload([(photo_bytes(size=(8, 6)), "large.png")]), 400)

    def test_same_origin_is_allowed_but_cross_origin_is_rejected(self):
        response = self.upload([(photo_bytes(), "scalp.png")], headers={"Origin": "http://localhost"})
        self.assertEqual(response.status_code, 200)
        self.assert_error(self.upload(
            [(photo_bytes(), "scalp.png")], headers={"Origin": "https://unrelated.example"},
        ), 403)

    def test_unavailable_busy_and_failed_inference_never_return_fake_success(self):
        for failure, status in [
            (ModelUnavailable("models loading"), 503),
            (AnalysisBusy("already analyzing"), 429),
            (RuntimeError("private/local/path"), 500),
        ]:
            with self.subTest(status=status):
                self.service.failure = failure
                if status == 500:
                    with self.assertLogs(self.app.logger, level="ERROR"):
                        response = self.upload([(photo_bytes(), "scalp.png")])
                    self.assertNotIn("private/local/path", response.get_data(as_text=True))
                else:
                    response = self.upload([(photo_bytes(), "scalp.png")])
                self.assert_error(response, status)
                with self.assertRaises(ValueError):
                    self.service.images[0].getpixel((0, 0))

    def test_api_not_found_and_wrong_method_are_json_errors(self):
        self.assert_error(self.client.get("/api/not-found"), 404)
        self.assert_error(self.client.put("/api/analyze"), 405)


class SequenceModel(nn.Module):
    def __init__(self, probabilities):
        super().__init__()
        self.outputs = [torch.tensor(row, dtype=torch.float32).log().unsqueeze(0) for row in probabilities]
        self.index = 0

    def forward(self, _):
        output = self.outputs[self.index]
        self.index += 1
        return output


def simulated_service(photo_count=3):
    service = ModelService.__new__(ModelService)
    service.configs = read_config(server.BASE_DIR / "model_config.json")
    service.status = "ready"
    service.device = torch.device("cpu")
    service.configuration_id = "test-configuration"
    service._lock = threading.Lock()
    service.models = {}
    service.transforms = {}
    for config in service.configs:
        rows = [[0.8, 0.1, 0.1], [0.2, 0.7, 0.1], [0.2, 0.2, 0.6]]
        if config["num_classes"] == 4:
            rows = [[0.7, 0.1, 0.1, 0.1], [0.2, 0.6, 0.1, 0.1], [0.2, 0.1, 0.6, 0.1]]
        service.models[config["id"]] = SequenceModel(rows[:photo_count])
        service.transforms[config["id"]] = lambda _: torch.zeros(3, 4, 4)
    return service


class AggregationTests(unittest.TestCase):
    def test_three_photos_use_mean_probabilities_and_keep_all_individual_outputs(self):
        service = simulated_service()
        result = service.analyze([object(), object(), object()])
        self.assertEqual(result["aggregation"], "mean_probabilities")
        self.assertEqual([m["id"] for m in result["metrics"]], [c["id"] for c in service.configs])
        self.assertEqual([p["index"] for p in result["per_photo"]], [0, 1, 2])
        for metric in result["metrics"]:
            expected = [1.1 / 3, 0.8 / 3, 0.8 / 3, 0.1] if metric["id"] == "flakes" else [0.4, 1 / 3, 0.8 / 3]
            torch.testing.assert_close(torch.tensor(metric["probabilities"]), torch.tensor(expected))
            self.assertEqual(metric["class_index"], 0)
            self.assertAlmostEqual(sum(metric["probabilities"]), 1, places=6)
        for photo, expected_index in zip(result["per_photo"], (0, 1, 2)):
            self.assertEqual([m["class_index"] for m in photo["metrics"]], [expected_index] * 4)
        self.assertFalse(result["settings_verified"])
        self.assertTrue(result["warnings"])
        self.assertEqual(result["configuration_id"], "test-configuration")

    def test_single_photo_matches_aggregate_and_unverified_labels_remain_neutral(self):
        service = simulated_service(photo_count=1)
        for config in service.configs:
            config["labels"] = ["medical-label"] * config["num_classes"]
        result = service.analyze([object()])
        self.assertEqual(result["metrics"], result["per_photo"][0]["metrics"])
        for metric in result["metrics"]:
            self.assertEqual(metric["label"], "클래스 0")
            self.assertNotIn("medical-label", metric["class_labels"])

    def test_busy_lock_prevents_parallel_inference(self):
        service = simulated_service(photo_count=1)
        with service._lock:
            with self.assertRaises(AnalysisBusy):
                service.analyze([object()])
        self.assertEqual(service.models["flakes"].index, 0)

    def test_invalid_output_shape_or_nan_fails_and_releases_lock(self):
        for output in (torch.full((1, 4), float("nan")), torch.zeros(1, 3)):
            with self.subTest(shape=tuple(output.shape)):
                service = simulated_service(photo_count=1)
                service.models["flakes"].outputs = [output]
                with self.assertRaisesRegex(RuntimeError, "모델 출력"):
                    service.analyze([object()])
                self.assertTrue(service._lock.acquire(blocking=False))
                service._lock.release()


if __name__ == "__main__":
    unittest.main()
