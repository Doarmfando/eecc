"""Familia de la cuenta a partir del nombre del producto que imprime el banco."""

from __future__ import annotations

import re
from collections.abc import Mapping

from statement_worker.domain.models import AccountType

from .text import normalized_upper

# Productos cuyo nombre no dice su familia, por banco. Cada banco nombra los suyos
# a su manera (`CUENTA SIMPLE` es ahorro en Interbank), así que la tabla crece con
# cada producto que se contrasta con un documento real; las reglas generales de
# abajo cubren los nombres que sí dicen `AHORRO` o `CORRIENTE`.
BANK_PRODUCTS: Mapping[str, tuple[tuple[str, AccountType], ...]] = {
    "interbank": (("CUENTA SIMPLE", AccountType.SAVINGS),),
}


def classify_account_type(product: str, *, bank: str | None = None) -> AccountType | None:
    """`AHORRO` o `CORRIENTE` según el producto; `None` si no se reconoce.

    `CONTIAHORRO` (BBVA), `Cuenta de Ahorros CLASICA` (BCP) y `CTA CTE` (Banco de
    la Nación) se reconocen por su nombre; los de `BANK_PRODUCTS`, por banco.
    """

    text = normalized_upper(product)
    for name, account_type in BANK_PRODUCTS.get(bank or "", ()):
        if name in text:
            return account_type
    if "AHORRO" in text:
        return AccountType.SAVINGS
    if "CORRIENTE" in text or re.search(r"\bCTA\.?\s*CTE\b", text):
        return AccountType.CHECKING
    return None
