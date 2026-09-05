"""Errores tipados que pueden sanitizarse en los adaptadores externos."""


class DomainError(Exception):
    """Error esperado del dominio del procesamiento."""

    code = "DOMAIN_ERROR"


class InvalidPdfError(DomainError):
    """El contenido no cumple las condiciones mínimas de un PDF."""

    code = "INVALID_PDF"


class PdfSizeLimitError(DomainError):
    """El documento supera el límite configurado."""

    code = "PDF_SIZE_LIMIT_EXCEEDED"


class UnsupportedDocumentError(DomainError):
    """Ninguna estrategia puede procesar el documento con confianza suficiente."""

    code = "UNSUPPORTED_DOCUMENT"


class InvalidWorkbookDataError(DomainError):
    """El plan de salida no cumple el contrato XLSX seguro."""

    code = "INVALID_WORKBOOK_DATA"


class UnexportableStatementError(DomainError):
    """La extracción del estado de cuenta no es publicable."""

    code = "STATEMENT_NOT_EXPORTABLE"


class ArtifactNotFoundError(DomainError):
    """El artefacto pedido no pertenece a un trabajo publicado."""

    code = "ARTIFACT_NOT_FOUND"


class ArtifactPublicationError(DomainError):
    """El artefacto no pudo escribirse o verificarse de forma segura."""

    code = "ARTIFACT_PUBLICATION_FAILED"


class ArtifactAlreadyExistsError(ArtifactPublicationError):
    """La publicación intentaría sobrescribir un artefacto existente."""

    code = "ARTIFACT_ALREADY_EXISTS"
