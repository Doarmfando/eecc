"""La misma limpieza que `source-file-name.ts` en la API."""

from unittest import TestCase

from statement_worker.services.source_file_name import normalize_source_file_name


class SourceFileNameTests(TestCase):
    def test_keeps_spaces_accents_and_the_extension(self) -> None:
        self.assertEqual(
            normalize_source_file_name("Estado sintético agosto.pdf"), "Estado sintético agosto.pdf"
        )

    def test_drops_the_path(self) -> None:
        for name in ("C:\\fakepath\\Estado.pdf", "/tmp/Estado.pdf"):
            with self.subTest(name=name):
                self.assertEqual(normalize_source_file_name(name), "Estado.pdf")

    def test_removes_controls_and_marks_that_can_reverse_the_text(self) -> None:
        self.assertEqual(normalize_source_file_name("  Estado\r\n\u202e.pdf\x00  "), "Estado.pdf")

    def test_normalizes_unicode_and_limits_code_points(self) -> None:
        self.assertEqual(normalize_source_file_name("sinte\u0301tico.pdf"), "sintético.pdf")
        self.assertEqual(len(normalize_source_file_name("😀" * 300) or ""), 255)

    def test_does_not_invent_names_for_empty_labels(self) -> None:
        for name in ("", "   ", "..", "/"):
            with self.subTest(name=name):
                self.assertIsNone(normalize_source_file_name(name))
