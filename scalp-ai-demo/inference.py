"""Load the supplied state dictionaries without executing checkpoint pickle code."""

from __future__ import annotations

import hashlib
import json
import os
import threading
import time
from datetime import datetime
from pathlib import Path
from uuid import uuid4
from zoneinfo import ZoneInfo

import timm
import torch
from PIL import Image
from torch import nn
from torchvision import models, transforms
from torchvision.transforms import InterpolationMode

BASE_DIR = Path(__file__).resolve().parent
EXPECTED_IDS = ["flakes", "sebum", "hair_loss", "erythema"]
UNVERIFIED_WARNING = (
    "학습 당시 전처리·DINO 특징 결합·클래스 의미가 확인되지 않았습니다. "
    "현재 설정으로 계산한 모델 출력이며 정상/중증 또는 탈모 유무로 해석할 수 없습니다."
)


class ModelUnavailable(RuntimeError):
    pass


class AnalysisBusy(RuntimeError):
    pass


class DinoClassifier(nn.Module):
    def __init__(self, config: dict):
        super().__init__()
        self.backbone = timm.create_model(
            config["architecture"], pretrained=False, num_classes=0,
            img_size=config["input_size"],
        )
        self.pooling = config["pooling"]
        activation = {"identity": nn.Identity, "gelu": nn.GELU, "relu": nn.ReLU}
        self.head = nn.Sequential(
            nn.LayerNorm(1536), activation[config["head_activation"]](),
            nn.Linear(1536, config["num_classes"]),
        )

    def forward(self, image):
        tokens = self.backbone.forward_features(image)
        cls = tokens[:, 0]
        patches = tokens[:, self.backbone.num_prefix_tokens:].mean(dim=1)
        parts = (cls, patches) if self.pooling == "cls_mean" else (patches, cls)
        return self.head(torch.cat(parts, dim=1))


def read_config(path: Path) -> list[dict]:
    configs = json.loads(path.read_text(encoding="utf-8"))["models"]
    if [c["id"] for c in configs] != EXPECTED_IDS:
        raise ValueError("모델 설정은 flakes, sebum, hair_loss, erythema 순서여야 합니다.")
    for c in configs:
        if c["num_classes"] != (4 if c["id"] == "flakes" else 3):
            raise ValueError(f"{c['id']}: 체크포인트 출력 수와 클래스 수가 다릅니다.")
        if c["architecture"] not in {
            "vit_base_patch16_dinov3", "vit_base_patch14_dinov2", "efficientnet_b4"
        }:
            raise ValueError("지원하지 않는 모델 구조입니다.")
        if not (32 <= c["input_size"] <= c["resize_size"] <= 1024):
            raise ValueError("이미지 크기 설정이 올바르지 않습니다.")
        if c["interpolation"] not in {"bicubic", "bilinear", "nearest"}:
            raise ValueError("지원하지 않는 보간법입니다.")
        if any(len(c[k]) != 3 for k in ("mean", "std")) or any(v <= 0 for v in c["std"]):
            raise ValueError("정규화 설정이 올바르지 않습니다.")
        if c.get("pooling", "cls_mean") not in {"cls_mean", "mean_cls"}:
            raise ValueError("지원하지 않는 특징 결합입니다.")
        if c.get("head_activation", "identity") not in {"identity", "gelu", "relu"}:
            raise ValueError("지원하지 않는 head 활성화입니다.")
        labels = c.get("labels")
        if labels is not None and (
            not isinstance(labels, list) or len(labels) != c["num_classes"]
            or not all(isinstance(v, str) and 0 < len(v) < 100 for v in labels)
        ):
            raise ValueError("클래스 이름은 출력 순서에 맞는 문자열 배열이어야 합니다.")
        if c.get("settings_verified") is True and not labels:
            raise ValueError("학습 설정 확인 완료에는 클래스 이름이 필요합니다.")
    return configs


class ModelService:
    def __init__(self, model_dir: Path | None = None, config_path: Path | None = None):
        self.configs = read_config(config_path or BASE_DIR / "model_config.json")
        self.model_dir = model_dir or self._find_model_dir()
        requested_device = os.environ.get("SCALP_DEVICE", "cpu")
        if requested_device not in {"cpu", "cuda"}:
            raise ValueError("SCALP_DEVICE는 cpu 또는 cuda여야 합니다.")
        if requested_device == "cuda" and not torch.cuda.is_available():
            raise ValueError("CUDA를 사용할 수 없습니다. CPU 설정으로 실행하세요.")
        self.device = torch.device(requested_device)
        torch.set_num_threads(max(1, int(os.environ.get("SCALP_THREADS", min(4, os.cpu_count() or 1)))))
        self.models: dict[str, nn.Module] = {}
        self.transforms = {}
        self.status = "loading"
        self.error = None
        self.configuration_id = None
        self._lock = threading.Lock()
        self._load_lock = threading.Lock()

    def _find_model_dir(self) -> Path:
        configured = os.environ.get("SCALP_MODEL_DIR")
        if configured:
            return Path(configured).expanduser().resolve()
        local = BASE_DIR / "models"
        if all((local / c["filename"]).is_file() for c in self.configs):
            return local
        return Path.home() / "Downloads" / "scalp_4indicator_models"

    def start_loading(self):
        threading.Thread(target=self.load, name="model-loader", daemon=True).start()

    def load(self):
        with self._load_lock:
            if self.status == "ready":
                return
            try:
                missing = [c["filename"] for c in self.configs if not (self.model_dir / c["filename"]).is_file()]
                if missing:
                    raise FileNotFoundError("모델 파일을 찾을 수 없습니다: " + ", ".join(missing))
                signature = hashlib.sha256(json.dumps(self.configs, sort_keys=True).encode())
                for c in self.configs:
                    path = self.model_dir / c["filename"]
                    checkpoint = torch.load(path, map_location="cpu", weights_only=True, mmap=True)
                    if not isinstance(checkpoint, dict) or not all(isinstance(v, torch.Tensor) for v in checkpoint.values()):
                        raise ValueError(f"{c['id']}: 순수 state_dict 형식이 아닙니다.")
                    if c["architecture"] == "efficientnet_b4":
                        model = models.efficientnet_b4(weights=None, num_classes=c["num_classes"])
                    else:
                        model = DinoClassifier(c)
                    # No missing keys, silent random layers, or downloaded base weights.
                    model.load_state_dict(checkpoint, strict=True)
                    del checkpoint
                    model.requires_grad_(False).eval().to(self.device)
                    self.models[c["id"]] = model
                    self.transforms[c["id"]] = transforms.Compose([
                        transforms.Resize(c["resize_size"], interpolation=InterpolationMode(c["interpolation"])),
                        transforms.CenterCrop(c["input_size"]), transforms.ToTensor(),
                        transforms.Normalize(mean=c["mean"], std=c["std"]),
                    ])
                    # Stream the file to keep provenance stable across model replacements.
                    with path.open("rb") as source:
                        while block := source.read(1024 * 1024):
                            signature.update(block)
                self.configuration_id = signature.hexdigest()[:24]
                self.status = "ready"
            except Exception as exc:
                self.models.clear()
                self.transforms.clear()
                self.error = str(exc)
                self.status = "error"
                import logging
                logging.exception("Model loading failed")

    def health(self) -> dict:
        return {
            "status": self.status, "device": str(self.device),
            "message": {"loading": "4개 모델을 불러오는 중입니다.", "ready": "4개 모델이 연결되었습니다.",
                        "error": "모델을 불러오지 못했습니다. 서버 로그와 모델 경로를 확인하세요."}[self.status],
            "settings_verified": all(c.get("settings_verified") is True for c in self.configs),
            "configuration_id": self.configuration_id,
            "models": [{"id": c["id"], "name": c["name"], "ready": c["id"] in self.models,
                        "num_classes": c["num_classes"], "labels": self._labels(c),
                        "settings_verified": c.get("settings_verified") is True} for c in self.configs],
        }

    @staticmethod
    def _labels(config):
        # Unverified mappings never acquire medical meaning just by editing labels.
        if config.get("settings_verified") is True:
            return config["labels"]
        return [f"클래스 {i}" for i in range(config["num_classes"])]

    def _metric(self, config, probabilities):
        values = [float(v) for v in probabilities]
        index = max(range(len(values)), key=values.__getitem__)
        labels = self._labels(config)
        return {"id": config["id"], "name": config["name"], "class_index": index,
                "label": labels[index], "confidence": values[index], "probabilities": values,
                "class_labels": labels, "settings_verified": config.get("settings_verified") is True}

    def analyze(self, images: list[Image.Image]) -> dict:
        if self.status != "ready":
            raise ModelUnavailable(self.health()["message"])
        if not self._lock.acquire(blocking=False):
            raise AnalysisBusy("다른 사진을 분석 중입니다. 잠시 후 다시 시도하세요.")
        started = time.perf_counter()
        try:
            per_photo = [{"index": i, "metrics": []} for i in range(len(images))]
            metrics = []
            with torch.inference_mode():
                for c in self.configs:
                    # Process one image at a time to bound CPU memory use.
                    outputs = []
                    for i, image in enumerate(images):
                        tensor = self.transforms[c["id"]](image).unsqueeze(0).to(self.device)
                        logits = self.models[c["id"]](tensor)
                        if logits.shape != (1, c["num_classes"]) or not torch.isfinite(logits).all():
                            raise RuntimeError("모델 출력이 올바르지 않습니다.")
                        probabilities = logits.softmax(dim=-1)[0].cpu()
                        outputs.append(probabilities)
                        per_photo[i]["metrics"].append(self._metric(c, probabilities))
                    metrics.append(self._metric(c, torch.stack(outputs).mean(dim=0)))
            verified = all(c.get("settings_verified") is True for c in self.configs)
            return {
                "id": str(uuid4()), "date": datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat(),
                "source": "model", "photo_count": len(images), "aggregation": "mean_probabilities",
                "settings_verified": verified, "warnings": [] if verified else [UNVERIFIED_WARNING],
                "metrics": metrics, "per_photo": per_photo,
                "elapsed_ms": round((time.perf_counter() - started) * 1000),
                "configuration_id": self.configuration_id,
            }
        finally:
            self._lock.release()
