"""FastAPI app: Squirrel Social Progress & Challenges service.

    uvicorn app.main:app --reload
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.routes import internal, router
from app.db import engine

app = FastAPI(title="Squirrel Social · Progress & Challenges", version="1.0.0")
app.include_router(router)
app.include_router(internal)


@app.exception_handler(HTTPException)
async def http_error(_: Request, exc: HTTPException) -> JSONResponse:
    body = exc.detail if isinstance(exc.detail, dict) else {"code": "error", "detail": str(exc.detail)}
    return JSONResponse(status_code=exc.status_code, content=body, headers=getattr(exc, "headers", None))


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    msgs = "; ".join(f"{'.'.join(str(p) for p in e['loc'][1:])}: {e['msg']}" for e in exc.errors())
    return JSONResponse(status_code=422, content={"code": "invalid_request", "detail": msgs})


@app.get("/healthz")
def healthz() -> dict:
    with engine.connect() as conn:
        conn.execute(text("select 1"))
    return {"ok": True}
