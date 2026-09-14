"""Detección de la plantilla Interbank por señales de su primera página."""

from __future__ import annotations

import re
from decimal import Decimal

from statement_worker.domain.models import Detection, DocumentProbe
from statement_worker.parsing.text import normalized_upper

INTERBANK_EXTRACTOR_ID = "interbank-savings-v1"


class InterbankTemplateDetector:
    extractor_id = INTERBANK_EXTRACTOR_ID
    version = "0.1.0"
    minimum_confidence = Decimal("0.75")

    def detect(self, probe: DocumentProbe) -> Detection:
        """Pesa la estructura de la plantilla por encima de la marca.

        El nombre del banco va en el logo, que es imagen y no deja texto. Lo que
        identifica la plantilla es la combinación de su cabecera de columnas con la
        fila `EMPEZASTE <MES> CON`, que ningún otro banco usa. La cabecera sola no
        basta: `Ingresos` y `Gastos` son rótulos corrientes.
        """

        text = normalized_upper(probe.first_page_text)
        confidence = Decimal("0")
        evidence: list[str] = []

        if "INTERBANK" in text:
            confidence += Decimal("0.30")
            evidence.append("BANK_MARKER_INTERBANK")

        if all(
            signal in text
            for signal in ("FECHA", "CONCEPTO", "INGRESOS", "GASTOS", "SALDO CONTABLE")
        ):
            confidence += Decimal("0.40")
            evidence.append("MOVEMENT_HEADER_MATCH")

        if re.search(r"\bEMPEZASTE\s+[A-Z]+\s+CON\b", text):
            confidence += Decimal("0.25")
            evidence.append("OPENING_ROW_MATCH")

        if re.search(r"\bDEL\s+\d{1,2}(?:\s+DE\s+[A-Z]+)?\s+AL\s+\d{1,2}\s+DE\s+[A-Z]+", text):
            confidence += Decimal("0.10")
            evidence.append("STATEMENT_PERIOD_MATCH")

        if re.search(r"\b\d{3}-\d{10}\b", text):
            confidence += Decimal("0.15")
            evidence.append("INTERBANK_ACCOUNT_FORMAT_MATCH")

        return Detection(
            extractor_id=self.extractor_id,
            extractor_version=self.version,
            confidence=min(confidence, Decimal("1")),
            evidence_codes=tuple(evidence),
        )

    def accepts(self, probe: DocumentProbe) -> bool:
        return self.detect(probe).confidence >= self.minimum_confidence
