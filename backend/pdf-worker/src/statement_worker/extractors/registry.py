"""Registro de estrategias: especializadas por banco, más un respaldo genérico."""

from __future__ import annotations

from pathlib import Path

from statement_worker.domain.errors import UnsupportedDocumentError
from statement_worker.services.strategy import StatementStrategy

from .bcp.strategy import BCP_STRATEGY_ID, BcpStatementStrategy
from .generic.strategy import GENERIC_STRATEGY_ID, GenericStatementStrategy
from .interbank.strategy import INTERBANK_STRATEGY_ID, InterbankStatementStrategy

DEFAULT_STRATEGY_ID = BCP_STRATEGY_ID

# El orden importa: una estrategia especializada conoce la plantilla y puede
# reconciliar; la genérica solo lee lo que sus encabezados le permiten nombrar.
_SPECIALISED: dict[str, type[StatementStrategy]] = {
    BCP_STRATEGY_ID: BcpStatementStrategy,
    INTERBANK_STRATEGY_ID: InterbankStatementStrategy,
}
_FALLBACK: dict[str, type[StatementStrategy]] = {
    GENERIC_STRATEGY_ID: GenericStatementStrategy,
}
_STRATEGIES = {**_SPECIALISED, **_FALLBACK}


def available_strategy_ids() -> tuple[str, ...]:
    return tuple(sorted(_STRATEGIES))


def specialised_strategy_ids() -> tuple[str, ...]:
    return tuple(sorted(_SPECIALISED))


def resolve_strategy(extractor_id: str | None = None) -> StatementStrategy:
    """Devuelve la estrategia pedida o falla con un error tipado y sanitizable."""

    identifier = extractor_id or DEFAULT_STRATEGY_ID
    factory = _STRATEGIES.get(identifier)
    if factory is None:
        raise UnsupportedDocumentError("No registered strategy matches the requested extractor")
    return factory()


def resolve_best_strategy(
    pdf_path: Path,
    *,
    temporary_parent: Path | None = None,
) -> StatementStrategy:
    """Elige la estrategia probando primero las especializadas.

    Cada estrategia decide por sí misma si acepta el documento. La genérica solo
    entra cuando ninguna plantilla conocida lo reconoce, y nunca omite su umbral.
    """

    from statement_worker.services.pdf_sanitizer import sanitized_pdf_path

    from .bcp.detector import BcpTemplateDetector
    from .bcp.pdfplumber_adapter import probe_bcp_pdf_with_pdfplumber
    from .interbank.detector import InterbankTemplateDetector

    # La sonda solo lee la primera página, y ese texto sirve a cualquier detector.
    with sanitized_pdf_path(pdf_path, temporary_parent=temporary_parent) as readable_path:
        probe = probe_bcp_pdf_with_pdfplumber(readable_path)

    if BcpTemplateDetector().accepts(probe):
        return BcpStatementStrategy()
    if InterbankTemplateDetector().accepts(probe):
        return InterbankStatementStrategy()

    # El respaldo decide por sí mismo: necesita ver la estructura del documento
    # completo, no solo la primera página, y rechaza lo que no reconozca.
    return GenericStatementStrategy()
