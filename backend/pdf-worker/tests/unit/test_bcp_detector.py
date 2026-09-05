from decimal import Decimal
from unittest import TestCase

from statement_worker.domain.models import DocumentProbe
from statement_worker.extractors.bcp import BcpTemplateDetector


class BcpTemplateDetectorTests(TestCase):
    def setUp(self) -> None:
        self.detector = BcpTemplateDetector()

    def test_accepts_complete_synthetic_bcp_signals(self) -> None:
        probe = DocumentProbe(
            first_page_text=(
                "BCP ESTADO DE CUENTA DEL 01/04/26 AL 30/04/26 "
                "FECHA PROC FECHA VALOR DESCRIPCIÓN CARGOS ABONOS "
                "000-00000000-0-00"
            )
        )

        detection = self.detector.detect(probe)

        self.assertTrue(self.detector.accepts(probe))
        self.assertEqual(detection.confidence, Decimal("1.00"))
        self.assertNotIn(probe.first_page_text, detection.evidence_codes)

    def test_rejects_generic_or_partial_signals(self) -> None:
        probe = DocumentProbe(first_page_text="ESTADO DE CUENTA FECHA DESCRIPCIÓN SALDO")

        detection = self.detector.detect(probe)

        self.assertFalse(self.detector.accepts(probe))
        self.assertLess(detection.confidence, self.detector.minimum_confidence)

    def test_scores_partial_bcp_header_without_accepting_it(self) -> None:
        probe = DocumentProbe(first_page_text="BCP FECHA PROC FECHA VALOR")

        detection = self.detector.detect(probe)

        # Marca del banco (0.30) más cabecera parcial (0.15).
        self.assertEqual(detection.confidence, Decimal("0.45"))
        self.assertIn("MOVEMENT_HEADER_PARTIAL", detection.evidence_codes)
        self.assertFalse(self.detector.accepts(probe))


class BcpDetectorRealShapeTests(TestCase):
    """El banco suele venir en el logo, no como texto extraíble."""

    def _probe(self, text: str) -> DocumentProbe:
        return DocumentProbe(first_page_text=text, page_count=425)

    def test_accepts_a_statement_whose_bank_name_is_only_a_logo(self) -> None:
        detector = BcpTemplateDetector()
        text = (
            "ESTADO DE CUENTA\n"
            "DEL 01/06/26 AL 30/06/26\n"
            "CUENTA 191-12345678-0-11\n"
            "FECHA PROC. FECHA VALOR DESCRIPCION CARGOS ABONOS SALDO\n"
        )

        detection = detector.detect(self._probe(text))

        self.assertGreaterEqual(detection.confidence, detector.minimum_confidence)
        self.assertNotIn("BANK_MARKER_BCP", detection.evidence_codes)
        self.assertIn("MOVEMENT_HEADER_MATCH", detection.evidence_codes)
        self.assertIn("BCP_ACCOUNT_FORMAT_MATCH", detection.evidence_codes)

    def test_rejects_another_bank_with_similar_column_titles(self) -> None:
        detector = BcpTemplateDetector()
        text = (
            "ESTADO DE CUENTA\n"
            "DEL 01/06/26 AL 30/06/26\n"
            "CUENTA 0011-0345-0200123456\n"
            "FECHA PROC. FECHA VALOR DESCRIPCION CARGOS ABONOS\n"
        )

        detection = detector.detect(self._probe(text))

        self.assertLess(detection.confidence, detector.minimum_confidence)

    def test_rejects_a_document_that_only_menciona_el_banco(self) -> None:
        detector = BcpTemplateDetector()

        detection = detector.detect(self._probe("CARTA DIRIGIDA AL BCP SOBRE UN RECLAMO"))

        self.assertLess(detection.confidence, detector.minimum_confidence)
        self.assertEqual(detection.evidence_codes, ("BANK_MARKER_BCP",))
