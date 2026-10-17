"""La detección y la identidad del trabajo deben declarar la misma versión."""

from unittest import TestCase

from statement_worker.extractors.banco_nacion.detector import BancoNacionTemplateDetector
from statement_worker.extractors.bbva.detector import BbvaTemplateDetector
from statement_worker.extractors.bcp.detector import BcpTemplateDetector
from statement_worker.extractors.generic.detector import GenericStatementDetector
from statement_worker.extractors.interbank.detector import InterbankTemplateDetector
from statement_worker.extractors.registry import resolve_strategy


class StrategyVersionTests(TestCase):
    def test_published_detection_uses_the_version_that_invalidates_the_cache(self) -> None:
        for detector in (
            BcpTemplateDetector(),
            BbvaTemplateDetector(),
            BancoNacionTemplateDetector(),
            InterbankTemplateDetector(),
            GenericStatementDetector(),
        ):
            with self.subTest(extractor=detector.extractor_id):
                strategy = resolve_strategy(detector.extractor_id)
                self.assertEqual(strategy.extractor_version, detector.version)
