# Stub deliberadamente vacío.
#
# `numpy` entra al entorno solo como dependencia transitiva de `pandas`, que a su vez
# existe únicamente para ejecutar el exportador legacy en las pruebas de caracterización.
# Los stubs reales de `numpy` usan sintaxis de Python 3.12 y este proyecto se verifica
# contra 3.11, lo que abortaba mypy al seguir la cadena `pdfplumber` -> `PIL` -> `numpy`.
#
# El núcleo no importa `numpy` en ninguna capa; tratarlo como opaco no pierde cobertura.
from typing import Any

def __getattr__(name: str) -> Any: ...
