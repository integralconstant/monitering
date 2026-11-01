"""Local demo accounts and account-owned analysis data backed by SQLite."""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import sqlite3
import time
from contextlib import contextmanager
from datetime import date
from pathlib import Path

from werkzeug.security import check_password_hash, generate_password_hash

SESSION_SECONDS = 7 * 24 * 60 * 60
COOKIE_NAME = "scalp_session"
CHECK_IDS = frozenset({"gentle-wash", "low-heat", "observe", "flakes-care", "sebum-care", "hair-care", "redness-care"})
METRIC_IDS = ("flakes", "sebum", "hair_loss", "erythema")
RECORD_FIELDS = ("id", "date", "source", "photo_count", "aggregation", "settings_verified", "warnings", "metrics", "per_photo", "elapsed_ms", "configuration_id")
METRIC_FIELDS = ("id", "label", "class_index", "confidence", "probabilities", "class_labels", "settings_verified", "excluded_classes", "grade_index", "labels_confirmed", "grade_probabilities", "grade_labels", "grade_indices", "grade_confidence", "grading_method", "preprocessing_version")


class AccountError(ValueError):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def valid_date(value):
    if not isinstance(value, str):
        return False
    try:
        return date.fromisoformat(value).isoformat() == value
    except ValueError:
        return False


def record_payload(value):
    """Keep the browser record contract; omit names, photos and transient tokens."""
    if not isinstance(value, dict):
        raise AccountError("저장할 분석 결과를 확인해 주세요.")
    record = {key: value[key] for key in RECORD_FIELDS if key in value}
    def metric_payload(metric):
        if not isinstance(metric, dict):
            raise AccountError("분석 결과의 항목을 확인해 주세요.")
        return {key: metric[key] for key in METRIC_FIELDS if key in metric and metric[key] is not None}
    if "metrics" in record:
        if not isinstance(record["metrics"], list):
            raise AccountError("분석 결과의 항목을 확인해 주세요.")
        record["metrics"] = [metric_payload(metric) for metric in record["metrics"]]
    if "per_photo" in record:
        if not isinstance(record["per_photo"], list) or any(
            not isinstance(photo, dict) or "index" not in photo or not isinstance(photo.get("metrics"), list)
            for photo in record["per_photo"]
        ):
            raise AccountError("사진별 분석 결과를 확인해 주세요.")
        record["per_photo"] = [
            {"index": photo["index"], "metrics": [metric_payload(metric) for metric in photo["metrics"]]}
            for photo in record["per_photo"]
        ]
    return record


def canonical(value):
    # JSON.stringify turns integer-valued floats into integers. Normalize these
    # before signing so a browser's lossless numeric roundtrip keeps the token.
    def normalized(item):
        if isinstance(item, float) and item.is_integer():
            return int(item)
        if isinstance(item, list):
            return [normalized(child) for child in item]
        if isinstance(item, dict):
            return {key: normalized(child) for key, child in item.items()}
        return item
    try:
        payload = json.dumps(normalized(value), ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    except (TypeError, ValueError) as exc:
        raise AccountError("분석 결과의 형식이 올바르지 않습니다.") from exc
    if len(payload.encode("utf-8")) > 256 * 1024:
        raise AccountError("저장할 분석 결과가 너무 큽니다.")
    return payload


class AccountStore:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nickname TEXT NOT NULL, password_hash TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS users_nickname ON users(nickname);
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    expires_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS records (
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    record_id TEXT NOT NULL, record_date TEXT NOT NULL, payload TEXT NOT NULL,
                    PRIMARY KEY(user_id, record_id)
                );
                CREATE TABLE IF NOT EXISTS care_checks (
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    check_date TEXT NOT NULL, checks TEXT NOT NULL,
                    PRIMARY KEY(user_id, check_date)
                );
                CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            """)
            db.execute("INSERT OR IGNORE INTO metadata(key,value) VALUES ('signing_secret',?)", (secrets.token_hex(32),))
            self.signing_secret = db.execute("SELECT value FROM metadata WHERE key='signing_secret'").fetchone()[0].encode()

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        try:
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def credentials(body):
        nickname, password = body.get("nickname"), body.get("password")
        if not isinstance(nickname, str) or not 1 <= len(nickname.strip()) <= 40:
            raise AccountError("닉네임을 1~40자로 입력해 주세요.")
        if not isinstance(password, str) or not 1 <= len(password) <= 128:
            raise AccountError("시연용 비밀번호를 1~128자로 입력해 주세요.")
        return nickname.strip(), password

    def register(self, body):
        nickname, password = self.credentials(body)
        password_hash = generate_password_hash(password)
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            candidates = db.execute("SELECT password_hash FROM users WHERE nickname=?", (nickname,)).fetchall()
            if any(check_password_hash(row["password_hash"], password) for row in candidates):
                raise AccountError("같은 닉네임과 시연용 비밀번호로 만든 계정이 있어요. 로그인해 주세요.", 409)
            cursor = db.execute("INSERT INTO users(nickname,password_hash,created_at) VALUES (?,?,?)", (nickname, password_hash, int(time.time())))
            return {"id": cursor.lastrowid, "nickname": nickname}

    def login(self, body):
        nickname, password = self.credentials(body)
        with self.connection() as db:
            candidates = db.execute("SELECT id,nickname,password_hash FROM users WHERE nickname=? ORDER BY id", (nickname,)).fetchall()
        for row in candidates:
            if check_password_hash(row["password_hash"], password):
                return {"id": row["id"], "nickname": row["nickname"]}
        raise AccountError("닉네임과 시연용 비밀번호를 다시 확인해 주세요.", 401)

    def new_session(self, user_id, old_token=None):
        token = secrets.token_urlsafe(32)
        with self.connection() as db:
            db.execute("DELETE FROM sessions WHERE expires_at<=?", (int(time.time()),))
            if old_token:
                db.execute("DELETE FROM sessions WHERE token_hash=?", (self.token_hash(old_token),))
            db.execute("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)", (self.token_hash(token), user_id, int(time.time()) + SESSION_SECONDS))
        return token

    @staticmethod
    def token_hash(token):
        return hashlib.sha256(token.encode()).hexdigest()

    def current_user(self, token):
        if not token or len(token) > 200:
            return None
        with self.connection() as db:
            row = db.execute("SELECT users.id,users.nickname FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.expires_at>?", (self.token_hash(token), int(time.time()))).fetchone()
        return dict(row) if row else None

    def logout(self, token):
        if token:
            with self.connection() as db:
                db.execute("DELETE FROM sessions WHERE token_hash=?", (self.token_hash(token),))

    def sign_result(self, result, user_id):
        digest = hashlib.sha256(canonical(record_payload(result)).encode()).hexdigest()
        message = f"{user_id if user_id is not None else 'guest'}.{digest}"
        return message + "." + hmac.new(self.signing_secret, message.encode(), hashlib.sha256).hexdigest()

    def save_record(self, user_id, body):
        record = record_payload(body.get("record"))
        token = body.get("save_token") or body["record"].get("save_token")
        expected = self.sign_result(record, user_id)
        if not isinstance(token, str) or not token.isascii() or len(token) > 200 or not hmac.compare_digest(token, expected):
            raise AccountError("이 계정에서 분석한 결과만 저장할 수 있어요. 사진을 다시 분석해 주세요.", 403)
        if (set(record) != set(RECORD_FIELDS) or record["source"] != "model"
                or not isinstance(record["id"], str) or not 1 <= len(record["id"]) <= 200
                or not valid_date(record["date"]) or record["aggregation"] != "mean_probabilities"
                or type(record["photo_count"]) is not int or not 1 <= record["photo_count"] <= 3
                or len(record["metrics"]) != 4 or tuple(metric["id"] for metric in record["metrics"]) != METRIC_IDS
                or len(record["per_photo"]) != record["photo_count"]):
            raise AccountError("저장할 분석 결과의 형식이 올바르지 않습니다.")
        payload = canonical(record)
        with self.connection() as db:
            cursor = db.execute("INSERT OR IGNORE INTO records(user_id,record_id,record_date,payload) VALUES (?,?,?,?)", (user_id, record["id"], record["date"], payload))
            created = cursor.rowcount == 1
            saved = json.loads(db.execute("SELECT payload FROM records WHERE user_id=? AND record_id=?", (user_id, record["id"])).fetchone()[0])
        return saved, created

    def records(self, user_id):
        with self.connection() as db:
            rows = db.execute("SELECT payload FROM records WHERE user_id=? ORDER BY record_date, rowid", (user_id,)).fetchall()
        return [json.loads(row[0]) for row in rows]

    def clear_records(self, user_id):
        with self.connection() as db:
            return db.execute("DELETE FROM records WHERE user_id=?", (user_id,)).rowcount

    def care_checks(self, user_id, check_date, checks=None):
        if not valid_date(check_date):
            raise AccountError("관리 기록의 날짜를 확인해 주세요.")
        if checks is not None and (not isinstance(checks, list) or len(checks) > len(CHECK_IDS)
                                  or any(not isinstance(item, str) or item not in CHECK_IDS for item in checks)
                                  or len(set(checks)) != len(checks)):
            raise AccountError("관리 체크 항목을 확인해 주세요.")
        with self.connection() as db:
            if checks is not None:
                db.execute("INSERT INTO care_checks(user_id,check_date,checks) VALUES (?,?,?) ON CONFLICT(user_id,check_date) DO UPDATE SET checks=excluded.checks", (user_id, check_date, json.dumps(sorted(checks))))
            row = db.execute("SELECT checks FROM care_checks WHERE user_id=? AND check_date=?", (user_id, check_date)).fetchone()
        return {"date": check_date, "checks": json.loads(row[0]) if row else []}