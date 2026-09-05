"""Punto de entrada ASGI: `uvicorn statement_worker.api.main:app`."""

from __future__ import annotations

from fastapi import FastAPI

from .app import create_app

app: FastAPI = create_app()
