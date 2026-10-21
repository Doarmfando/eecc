"""Errores tipados que pueden sanitizarse en los adaptadores externos."""


class DomainError(Exception):
    """Error esperado del dominio del procesamiento."""

    code = "DOMAIN_ERROR"

    def public_details(self) -> dict[str, int]:
        """Números que explican el rechazo sin revelar el documento. Por defecto, ninguno."""

        return {}


class InvalidPdfError(DomainError):
    """El contenido no cumple las condiciones mínimas de un PDF."""

    code = "INVALID_PDF"


class PdfPasswordRequiredError(DomainError):
    """El PDF pide contraseña de apertura y no se envió ninguna."""

    code = "PDF_PASSWORD_REQUIRED"


class PdfPasswordIncorrectError(DomainError):
    """La contraseña enviada no abre el PDF."""

    code = "PDF_PASSWORD_INCORRECT"


class PdfSizeLimitError(DomainError):
    """El documento supera el límite configurado."""

    code = "PDF_SIZE_LIMIT_EXCEEDED"


class PdfPageLimitError(DomainError):
    """El documento tiene más páginas de las que admite la membresía de quien sube."""

    code = "PDF_PAGE_LIMIT_EXCEEDED"

    def __init__(self, *, page_count: int, max_pages: int) -> None:
        super().__init__("The document exceeds the page limit of the request")
        self.page_count = page_count
        self.max_pages = max_pages

    def public_details(self) -> dict[str, int]:
        # Cuántas páginas y cuántas se admiten: no dicen nada del contenido y son
        # justo lo que la persona necesita para saber qué hacer.
        return {"page_count": self.page_count, "max_pages": self.max_pages}


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
