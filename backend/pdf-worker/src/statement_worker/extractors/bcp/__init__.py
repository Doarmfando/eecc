"""Soporte para plantillas del Banco de Crédito del Perú."""

from .continuations import merge_bcp_continuations
from .detector import BcpTemplateDetector
from .layout import (
    classify_bcp_column,
    detect_bcp_table_bounds,
    group_words_by_row,
    words_inside_bounds,
)
from .models import (
    BcpColumn,
    BcpContinuationMergeResult,
    BcpPageReadMetrics,
    BcpParsedRow,
    BcpPdfReadResult,
    BcpRowParseResult,
    BcpRowType,
    BcpTableBounds,
    BcpVisualRow,
    BcpWarningCode,
    PdfWord,
)
from .pipeline import BcpCoreResult, process_bcp_visual_rows
from .row_parser import is_bcp_noise, parse_bcp_visual_row
from .validation import (
    BcpCheckStatus,
    BcpInvariantCode,
    BcpInvariantResult,
    BcpValidationReport,
    validate_bcp_rows,
)

__all__ = [
    "BcpCheckStatus",
    "BcpColumn",
    "BcpContinuationMergeResult",
    "BcpCoreResult",
    "BcpInvariantCode",
    "BcpInvariantResult",
    "BcpPageReadMetrics",
    "BcpParsedRow",
    "BcpPdfReadResult",
    "BcpRowParseResult",
    "BcpRowType",
    "BcpTableBounds",
    "BcpTemplateDetector",
    "BcpValidationReport",
    "BcpVisualRow",
    "BcpWarningCode",
    "PdfWord",
    "classify_bcp_column",
    "detect_bcp_table_bounds",
    "group_words_by_row",
    "is_bcp_noise",
    "merge_bcp_continuations",
    "parse_bcp_visual_row",
    "process_bcp_visual_rows",
    "validate_bcp_rows",
    "words_inside_bounds",
]
