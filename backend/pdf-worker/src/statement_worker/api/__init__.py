"""Adaptador HTTP interno; no contiene reglas de extracción."""

from .app import API_TITLE, API_VERSION, create_app

__all__ = ["API_TITLE", "API_VERSION", "create_app"]
