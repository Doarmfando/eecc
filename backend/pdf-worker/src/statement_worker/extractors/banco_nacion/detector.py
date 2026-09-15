"""Detección de un estado de cuenta del Banco de la Nación por su primera página."""

from __future__ import annotations

import re
from decimal import Decimal

from statement_worker.domain.models import Detection, DocumentProbe
from statement_worker.parsing.text import normalized_upper

BANCO_NACION_EXTRACTOR_ID = "banco-nacion-v1"

_DESCRIPTION_LABELS = ("DESCRIPCION", "CONCEPTO", "DETALLE", "GLOSA")
_MONEY_LABELS = ("CARGO", "DEBITO", "RETIRO", "ABONO", "CREDITO", "DEPOSITO", "IMPORTE", "MONTO")


class BancoNacionTemplateDetector:
    extractor_id = BANCO_NACION_EXTRACTOR_ID
    version = "0.1.0"
    minimum_confidence = Decimal("0.75")

    def detect(self, probe: DocumentProbe) -> Detection:
        """Exige la marca del banco y una tabla de movimientos con nombre.

        A diferencia de BCP e Interbank, la plantilla no se ha visto en un documento
        real, así que no hay una firma estructural propia en la que confiar: `SALDO
        ANTERIOR` o `CARGOS | ABONOS | SALDO` los usan varios bancos. Sin el nombre
        del banco la confianza no llega al mínimo por mucho que coincida el resto, y
        el documento sigue al respaldo genérico en lugar de leerse con reglas ajenas.
        """

        text = normalized_upper(probe.first_page_text)
        confidence = Decimal("0")
        evidence: list[str] = []

        if re.search(r"\bBANCO\s+DE\s+LA\s+NACION\b", text):
            confidence += Decimal("0.45")
            evidence.append("BANK_MARKER_BANCO_NACION")

        if (
            "FECHA" in text
            and "SALDO" in text
            and any(label in text for label in _DESCRIPTION_LABELS)
            and any(label in text for label in _MONEY_LABELS)
        ):
            confidence += Decimal("0.30")
            evidence.append("MOVEMENT_HEADER_MATCH")

        if re.search(r"\bSALDO\s+(?:ANTERIOR|INICIAL)\b", text):
            confidence += Decimal("0.10")
            evidence.append("OPENING_ROW_MATCH")

        # Cuenta `00-000-000000`, o CCI con el código 018 que identifica al banco.
        if re.search(r"\b\d{2}-\d{3}-\d{6}\b", text) or re.search(
            r"\b018-?\d{3}-?\d{12}-?\d{2}\b", text
        ):
            confidence += Decimal("0.15")
            evidence.append("BANCO_NACION_ACCOUNT_FORMAT_MATCH")

        if re.search(r"\d{1,2}/\d{1,2}/\d{4}\s*(?:AL|A|-|HASTA)\s*\d{1,2}/\d{1,2}/\d{4}", text):
            confidence += Decimal("0.05")
            evidence.append("STATEMENT_PERIOD_MATCH")

        return Detection(
            extractor_id=self.extractor_id,
            extractor_version=self.version,
            confidence=min(confidence, Decimal("1")),
            evidence_codes=tuple(evidence),
        )

    def accepts(self, probe: DocumentProbe) -> bool:
        return self.detect(probe).confidence >= self.minimum_confidence
