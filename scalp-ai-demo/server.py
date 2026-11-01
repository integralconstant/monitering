"""Serve the existing website and its local four-model inference API."""

from __future__ import annotations

import argparse
import io
import logging
import os
import sqlite3
import warnings
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from PIL import Image, ImageOps, UnidentifiedImageError
from werkzeug.exceptions import HTTPException, RequestEntityTooLarge

from accounts import AccountError, AccountStore, COOKIE_NAME, SESSION_SECONDS

BASE_DIR = Path(__file__).resolve().parent
MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 20_000_000
Image.MAX_IMAGE_PIXELS = MAX_PIXELS


def decode_photo(upload) -> Image.Image:
    payload = upload.read(MAX_FILE_BYTES + 1)
    if not payload or len(payload) > MAX_FILE_BYTES:
        raise ValueError("사진은 장당 10MB 이하의 파일이어야 합니다.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(payload)) as probe:
                if probe.format not in {"JPEG", "PNG", "WEBP"}:
                    raise ValueError("JPG, PNG, WEBP 사진만 사용할 수 있습니다.")
                if probe.width * probe.height > MAX_PIXELS:
                    raise ValueError("사진 해상도는 2,000만 화소 이하여야 합니다.")
                probe.verify()
            with Image.open(io.BytesIO(payload)) as source:
                return ImageOps.exif_transpose(source).convert("RGB")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ValueError("읽을 수 없는 사진입니다. JPG, PNG, WEBP 파일을 확인하세요.") from exc


def create_app(service=None, database_path=None) -> Flask:
    app = Flask(__name__, static_folder=str(BASE_DIR / "dist"), static_url_path="")
    app.config.update(MAX_CONTENT_LENGTH=32 * 1024 * 1024, MAX_FORM_PARTS=6)
    # Keep multipart uploads in memory; do not spool scalp photos to a temp file.
    from flask import Request

    class MemoryRequest(Request):
        def _get_file_stream(self, total_content_length, content_type, filename=None, content_length=None):
            return io.BytesIO()

    app.request_class = MemoryRequest
    if service is None:
        from inference import ModelService
        service = ModelService()
        service.start_loading()
    app.extensions["model_service"] = service
    accounts = AccountStore(database_path or os.environ.get("SCALP_DB_PATH") or BASE_DIR / "data" / "scalp.sqlite3")
    app.extensions["account_store"] = accounts

    @app.before_request
    def local_api_context():
        if not request.path.startswith("/api/"):
            return None
        if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            origin = request.headers.get("Origin")
            if (origin and origin != request.host_url.rstrip("/")) or request.headers.get("Sec-Fetch-Site") == "cross-site":
                return jsonify(error="이 웹 서버에서 다시 시도해 주세요."), 403
        g.user = accounts.current_user(request.cookies.get(COOKIE_NAME))
        if request.path in {"/api/records", "/api/care-checks", "/api/analyze"} and "X-Scalp-Account" in request.headers:
            expected_account = str(g.user["id"]) if g.user else "guest"
            if request.headers["X-Scalp-Account"] != expected_account:
                return jsonify(error="계정이 변경됐어요. 로그인 상태를 다시 확인해 주세요.", code="account_changed"), 409

    def require_user():
        if not g.user:
            raise AccountError("로그인 후 이용해 주세요.", 401)
        return g.user["id"]

    def json_body():
        if request.mimetype != "application/json":
            raise AccountError("JSON 형식으로 요청해 주세요.", 415)
        if request.content_length and request.content_length > 512 * 1024:
            raise AccountError("요청 내용이 너무 큽니다.", 413)
        body = request.get_json()
        if not isinstance(body, dict):
            raise AccountError("요청 내용을 확인해 주세요.")
        return body

    def session_response(user, status=200):
        token = accounts.new_session(user["id"], request.cookies.get(COOKIE_NAME))
        response = jsonify(user=user)
        response.set_cookie(COOKIE_NAME, token, max_age=SESSION_SECONDS, httponly=True,
                            secure=request.is_secure, samesite="Lax", path="/")
        return response, status

    @app.get("/api/auth/me")
    def current_account():
        return jsonify(user=g.user)

    @app.post("/api/auth/register")
    def register():
        return session_response(accounts.register(json_body()), 201)

    @app.post("/api/auth/login")
    def login():
        return session_response(accounts.login(json_body()))

    @app.post("/api/auth/logout")
    def logout():
        json_body()
        accounts.logout(request.cookies.get(COOKIE_NAME))
        response = jsonify(user=None)
        response.delete_cookie(COOKIE_NAME, httponly=True, samesite="Lax", path="/")
        return response

    @app.get("/api/records")
    def account_records():
        return jsonify(records=accounts.records(require_user()))

    @app.post("/api/records")
    def save_account_record():
        user_id = require_user()
        record, created = accounts.save_record(user_id, json_body())
        return jsonify(record=record), 201 if created else 200

    @app.delete("/api/records")
    def delete_account_records():
        return jsonify(deleted=accounts.clear_records(require_user()))

    @app.get("/api/care-checks")
    def get_care_checks():
        return jsonify(accounts.care_checks(require_user(), request.args.get("date")))

    @app.put("/api/care-checks")
    def save_care_checks():
        user_id = require_user()
        body = json_body()
        if "checks" not in body or body["checks"] is None:
            raise AccountError("관리 체크 항목을 확인해 주세요.")
        return jsonify(accounts.care_checks(user_id, body.get("date"), body["checks"]))

    @app.errorhandler(AccountError)
    def account_error(exc):
        return jsonify(error=str(exc)), exc.status

    @app.errorhandler(sqlite3.Error)
    def database_error(exc):
        app.logger.exception("Account database operation failed")
        return jsonify(error="기록 저장소에 연결하지 못했어요. 잠시 후 다시 시도해 주세요."), 500

    @app.get("/")
    def index():
        return send_from_directory(BASE_DIR / "dist", "index.html")

    @app.get("/api/health")
    def health():
        return jsonify(service.health())

    @app.post("/api/analyze")
    def analyze():
        # Local same-origin website only. No permissive CORS for private photos.
        origin = request.headers.get("Origin")
        if origin and origin != request.host_url.rstrip("/"):
            return jsonify(error="웹 서버 주소에서 사진을 다시 업로드하세요."), 403
        from inference import AnalysisBusy, ModelUnavailable
        images = []
        try:
            uploads = request.files.getlist("photos")
            if set(request.files) - {"photos"} or not 1 <= len(uploads) <= 3:
                raise ValueError("두피 사진을 1~3장 선택하세요.")
            for upload in uploads:
                images.append(decode_photo(upload))
            result = service.analyze(images)
            result["save_token"] = accounts.sign_result(result, g.user["id"] if g.user else None)
            return jsonify(result)
        except ValueError as exc:
            return jsonify(error=str(exc)), 400
        except ModelUnavailable as exc:
            return jsonify(error=str(exc)), 503
        except AnalysisBusy as exc:
            return jsonify(error=str(exc)), 429
        except RequestEntityTooLarge:
            raise
        except Exception:
            app.logger.exception("Inference failed")
            return jsonify(error="분석 중 오류가 발생했습니다. 서버 로그를 확인한 뒤 다시 시도하세요."), 500
        finally:
            for image in images:
                image.close()

    @app.errorhandler(RequestEntityTooLarge)
    def too_large(_):
        return jsonify(error="업로드 용량을 초과했습니다. 사진은 장당 10MB, 최대 3장입니다."), 413

    @app.errorhandler(HTTPException)
    def http_error(exc):
        if request.path.startswith("/api/"):
            return jsonify(error=exc.description), exc.code
        return exc

    @app.after_request
    def response_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    return app


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="두피 사진 분석 웹 서버")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8000, type=int)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    from waitress import serve
    print(f"Scalp AI: http://{args.host}:{args.port}", flush=True)
    serve(create_app(), host=args.host, port=args.port, threads=4,
          max_request_body_size=32 * 1024 * 1024,
          inbuf_overflow=33 * 1024 * 1024)
