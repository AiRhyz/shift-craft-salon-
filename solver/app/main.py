"""solver API エントリ（FastAPI）。

エンドポイント:
  GET  /health       ヘルスチェック（Cloud Run 用）
  POST /solve        シフト求解。ボディが空 or staff/patterns 未指定ならデモ既定で解く
  GET  /solve/demo   デモ既定を解いて返す（動作確認用）

CORS は環境変数 ALLOWED_ORIGINS（カンマ区切り）で許可オリジンを指定。
未指定なら "*"（PoC 用途）。本番は Vercel ドメインに限定すること。
"""
from __future__ import annotations

import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from .demo import demo_request
from .engine import solve
from .models import Schedule, SolveRequest

app = FastAPI(
    title="shift-craft-salon solver",
    version="0.1.0",
    description="美容室シフト自動作成の最適化API（CP-SAT / constraint-spec v0.1）",
)

_origins = os.environ.get("ALLOWED_ORIGINS", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _origins == "*" else [o.strip() for o in _origins.split(",")],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/solve", response_model=Schedule)
async def post_solve(request: Request) -> Schedule:
    """シフトを求解する。

    ボディが空、または staff/patterns が無い場合はデモ既定を用いる
    （マスタUI 未実装のフロントからは空ボディ `{}` で叩ける）。
    """
    try:
        body = await request.json()
    except Exception:
        body = None

    if not body or not body.get("staff") or not body.get("patterns"):
        return solve(demo_request())

    try:
        req = SolveRequest.model_validate(body)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=e.errors())
    return solve(req)


@app.get("/solve/demo", response_model=Schedule)
def get_solve_demo() -> Schedule:
    return solve(demo_request())
