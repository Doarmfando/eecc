"""Detección de un estado de cuenta genérico.

No basta con que el PDF tenga tablas: debe declarar que es un estado de cuenta y
nombrar columnas reconocibles. Un documento cualquiera con números se rechaza.
"""

from __future__ import annotations

import re
from decimal import Decimal

from statement_worker.domain.models import Detection, DocumentProbe
from statement_worker.parsing.columns import ColumnRole, roles_present
from statement_worker.parsing.text import normalized_upper

_STATEMENT_MARKERS = (
    "ESTADO DE CUENTA",
    "ESTADO DE CTA",
    "MOVIMIENTOS DE LA CUENTA",
    "DETALLE DE MOVIMIENTOS",
    "RESUMEN DE CUENTA",
    "EXTRACTO DE CUENTA",
    "ACCOUNT STATEMENT",
    "STATEMENT OF ACCOUNT",
    "BANK STATEMENT",
)

# Una tabla con esta cantidad de filas fechadas con importes ya no es casualidad.
MINIMUM_MOVEMENT_ROWS = 5

_DATE_PATTERN = re.compile(r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b")
_AMOUNT_PATTERN = re.compile(r"\b\d{1,3}(?:[.,]\d{3})*[.,]\d{2}\b")


class GenericStatementDetector:
    extractor_id = "generic-table-v1"
    version = "0.1.0"
    minimum_confidence = Decimal("0.70")

    def detect(self, probe: DocumentProbe, *, movement_rows: int = 0) -> Detection:
        """Puntúa el documento; `movement_rows` es la estructura ya observada.

        El peso mayor lo lleva la existencia de una tabla de movimientos alineada,
        porque es lo que no depende del idioma ni del banco. Las palabras solo
        confirman que el documento se presenta como un estado de cuenta.
        """

        text = normalized_upper(probe.first_page_text)
        confidence = Decimal("0")
        evidence: list[str] = []

        if any(marker in text for marker in _STATEMENT_MARKERS):
            confidence += Decimal("0.30")
            evidence.append("STATEMENT_MARKER")

        if movement_rows >= MINIMUM_MOVEMENT_ROWS:
            confidence += Decimal("0.45")
            evidence.append("MOVEMENT_GRID_PRESENT")

        roles = roles_present(text)
        if ColumnRole.DESCRIPTION in roles and ColumnRole.POSTING_DATE in roles:
            confidence += Decimal("0.15")
            evidence.append("COLUMN_NAMES_PRESENT")
        if roles & {ColumnRole.DEBIT, ColumnRole.CREDIT, ColumnRole.BALANCE}:
            confidence += Decimal("0.10")
            evidence.append("MONETARY_COLUMN_PRESENT")

        if len(_DATE_PATTERN.findall(text)) >= 3:
            confidence += Decimal("0.10")
            evidence.append("DATE_SERIES_PRESENT")
        if len(_AMOUNT_PATTERN.findall(text)) >= 3:
            confidence += Decimal("0.10")
            evidence.append("AMOUNT_SERIES_PRESENT")

        return Detection(
            extractor_id=self.extractor_id,
            extractor_version=self.version,
            confidence=min(confidence, Decimal("1")),
            evidence_codes=tuple(evidence),
        )

    def accepts(self, probe: DocumentProbe, *, movement_rows: int = 0) -> bool:
        detection = self.detect(probe, movement_rows=movement_rows)
        return detection.confidence >= self.minimum_confidence
