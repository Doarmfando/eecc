"""Detección basada en señales, separada del parser por coordenadas."""

from __future__ import annotations

import re
from decimal import Decimal

from statement_worker.domain.models import Detection, DocumentProbe
from statement_worker.parsing.text import normalized_upper


class BcpTemplateDetector:
    extractor_id = "bcp-coordinate-v1"
    version = "0.1.0"
    minimum_confidence = Decimal("0.75")

    def detect(self, probe: DocumentProbe) -> Detection:
        """Pesa la firma estructural por encima del nombre del banco.

        En los estados de cuenta reales el banco aparece en el logo, que es imagen y
        no deja texto extraíble. Exigir esa palabra rechazaba documentos legítimos.
        La combinación de las cinco cabeceras de columna con el formato de cuenta
        BCP es más específica de esta plantilla que la marca del banco.
        """

        text = normalized_upper(probe.first_page_text)
        confidence = Decimal("0")
        evidence: list[str] = []

        if "BANCO DE CREDITO" in text or re.search(r"\bBCP\b", text):
            confidence += Decimal("0.30")
            evidence.append("BANK_MARKER_BCP")

        header_signals = (
            "FECHA PROC",
            "FECHA VALOR",
            "DESCRIPCION",
            "CARGOS",
            "ABONOS",
        )
        header_matches = sum(signal in text for signal in header_signals)
        if header_matches >= 4:
            confidence += Decimal("0.45")
            evidence.append("MOVEMENT_HEADER_MATCH")
        elif header_matches >= 2:
            confidence += Decimal("0.15")
            evidence.append("MOVEMENT_HEADER_PARTIAL")

        if re.search(
            r"DEL\s+\d{1,2}/\d{1,2}/\d{2,4}\s+AL\s+\d{1,2}/\d{1,2}/\d{2,4}",
            text,
        ):
            confidence += Decimal("0.10")
            evidence.append("STATEMENT_PERIOD_MATCH")

        if re.search(r"\b\d{3}-\d{8}-\d-\d{2}\b", text):
            confidence += Decimal("0.30")
            evidence.append("BCP_ACCOUNT_FORMAT_MATCH")

        return Detection(
            extractor_id=self.extractor_id,
            extractor_version=self.version,
            confidence=min(confidence, Decimal("1")),
            evidence_codes=tuple(evidence),
        )

    def accepts(self, probe: DocumentProbe) -> bool:
        return self.detect(probe).confidence >= self.minimum_confidence
