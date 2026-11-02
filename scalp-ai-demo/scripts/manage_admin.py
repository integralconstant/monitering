"""Create an administrator through the local operator terminal."""
from __future__ import annotations
import argparse
import getpass
import json
import os
import secrets
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from accounts import AccountStore, AccountError


def main():
    parser = argparse.ArgumentParser(description="로컬 관리자 계정 생성")
    parser.add_argument("--database", type=Path, default=Path(os.environ.get("SCALP_DB_PATH") or ROOT / "data" / "scalp.sqlite3"))
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create", help="관리자 계정 만들기")
    create.add_argument("--nickname", required=True)
    create.add_argument("--generate-password", action="store_true")
    args = parser.parse_args()
    if args.generate_password:
        password = secrets.token_urlsafe(12)
    else:
        password = getpass.getpass("관리자 비밀번호: ")
        if password != getpass.getpass("관리자 비밀번호 확인: "):
            parser.error("입력한 비밀번호가 서로 다릅니다.")
    try:
        user = AccountStore(args.database).create_admin(args.nickname, password)
    except AccountError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    result = {"user": user}
    if args.generate_password:
        result["temporary_password"] = password
    print(json.dumps(result, ensure_ascii=False))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
