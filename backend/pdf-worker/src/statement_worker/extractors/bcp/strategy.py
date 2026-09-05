"""Estrategia BCP: única capa que une el pipeline BCP con el contrato de salida."""

from __future__ import annotations

from pathlib import Path

from statement_worker.domain.errors import UnexportableStatementError
from statement_worker.exporters.bcp_workbook import build_bcp_workbook_plan
from statement_worker.services.strategy import StatementOutcome

from .document_processor import process_bcp_pdf
from .models import BcpRowType

BCP_STRATEGY_ID = "bcp-coordinate-v1"
BCP_STRATEGY_VERSION = "0.2.0"


class BcpStatementStrategy:
    """Adaptador delgado; las reglas financieras siguen en el pipeline puro."""

    extractor_id = BCP_STRATEGY_ID
    extractor_version = BCP_STRATEGY_VERSION

    def process(
        self,
        pdf_path: Path,
        *,
        default_year: int | None = None,
        temporary_parent: Path | None = None,
    ) -> StatementOutcome:
        result = process_bcp_pdf(
            pdf_path,
            default_year=default_year,
            temporary_parent=temporary_parent,
        )
        try:
            plan = build_bcp_workbook_plan(result)
        except UnexportableStatementError:
            plan = None

        return StatementOutcome(
            detection=result.detection,
            status=result.validation.status,
            row_count=len(result.rows),
            movement_count=sum(1 for row in result.rows if row.row_type is BcpRowType.MOVEMENT),
            page_count=len(result.page_metrics),
            warning_codes=tuple(code.value for code in result.validation.warning_codes),
            check_codes=tuple(
                (check.code.value, check.status.value) for check in result.validation.checks
            ),
            plan=plan,
        )
