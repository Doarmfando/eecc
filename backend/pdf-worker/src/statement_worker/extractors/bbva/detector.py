"""Detección de un estado de cuenta del BBVA por su primera página."""

from __future__ import annotations

import re
from decimal import Decimal

from statement_worker.domain.models import Detection, DocumentProbe
from statement_worker.parsing.text import normalized_upper

BBVA_EXTRACTOR_ID = "bbva-account-v1"


class BbvaTemplateDetector:
    extractor_id = BBVA_EXTRACTOR_ID
    version = "0.1.0"
    minimum_confidence = Decimal("0.75")

    def detect(self, probe: DocumentProbe) -> Detection:
        """Reconoce la plantilla por su cabecera, y la marca refuerza.

        `CARGO/ABONO` en una sola columna con signo, junto a una columna `ITF`
        propia y un saldo `CONTABLE`, es una combinación que ningún otro banco de
        los que se han visto imprime. La marca suma pero no es imprescindible: un
        documento reimpreso puede perder el logotipo y conservar la tabla.

        Los rótulos se buscan sueltos y no como frases: la cabecera va repartida
        en tres líneas (`FECHA | FECHA | SALDO`, luego `DESCRIPCION ... CARGO/ABONO
        ITF`, luego `OPER. | VALOR | CONTABLE`), así que en el texto plano `SALDO
        CONTABLE` y `FECHA VALOR` nunca aparecen juntos.
        """

        text = normalized_upper(probe.first_page_text)
        confidence = Decimal("0")
        evidence: list[str] = []

        # Sin `\b` de cierre: en el documento real la marca solo sobrevive dentro
        # del dominio del pie, `WWW.BBVABANCOCONTINENTAL.COM`.
        if re.search(r"\bBBVA|\bBANCO\s+CONTINENTAL\b", text):
            confidence += Decimal("0.35")
            evidence.append("BANK_MARKER_BBVA")

        # Una única columna con signo para las dos direcciones del movimiento.
        if re.search(r"\bCARGO\s*/\s*ABONO\b", text):
            confidence += Decimal("0.35")
            evidence.append("SIGNED_AMOUNT_COLUMN_MATCH")

        # `CONTABLE` va en la tercera línea de la cabecera, bajo `SALDO`.
        if re.search(r"\bCONTABLE\b", text):
            confidence += Decimal("0.15")
            evidence.append("BOOK_BALANCE_COLUMN_MATCH")

        # El impuesto a las transacciones financieras, en columna propia.
        if re.search(r"\bITF\b", text):
            confidence += Decimal("0.10")
            evidence.append("ITF_COLUMN_MATCH")

        # `OPER.` y `VALOR`, juntos, son la tercera línea: las dos columnas de fecha.
        if re.search(r"\bOPER\.?\s+VALOR\b", text):
            confidence += Decimal("0.10")
            evidence.append("DOUBLE_DATE_COLUMN_MATCH")

        if re.search(r"\bSALDO\s+ANTERIOR\b", text):
            confidence += Decimal("0.10")
            evidence.append("OPENING_ROW_MATCH")

        return Detection(
            extractor_id=self.extractor_id,
            extractor_version=self.version,
            confidence=min(confidence, Decimal("1")),
            evidence_codes=tuple(evidence),
        )

    def accepts(self, probe: DocumentProbe) -> bool:
        return self.detect(probe).confidence >= self.minimum_confidence
