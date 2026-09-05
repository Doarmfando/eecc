# Estrategia de pruebas

## Unitarias

Sin disco salvo pruebas explícitas de temporales, sin red, sin servicios y sin documentos reales. Cubren parsing, modelos, detectores, filas e invariantes.

## Integración

Cubren o cubrirán adaptadores reales con archivos sintéticos mínimos:

- hecho: lectura `pdfplumber`, saneamiento y pipeline BCP reconciliado mediante un PDF generado durante la prueba;
- hecho: contrato puro del workbook, tipos, límites y protección contra fórmulas;
- hecho: publicación atómica, conservación del destino y limpieza del temporal ante fallos;
- hecho: escritor físico `openpyxl`, reapertura semántica, detección de manipulación y renderizado visual de las hojas;
- hecho: paquete CSV, codificación, entrecomillado, nombres seguros, verificación por campo y publicación todo-o-nada;
- hecho: servicio de trabajo, idempotencia, directorio incompleto, resultado fallido y manifiesto corrupto;
- hecho: endpoints FastAPI, límites de tamaño, códigos de error, limpieza de temporales y ausencia de datos financieros en la respuesta;
- hecho: tarea Celery en modo `eager`, configuración de la cola y tipos serializables;
- hecho: paridad entre la lectura secuencial y la repartida entre procesos, en el extractor BCP y en el respaldo genérico, más la cobertura de tramos sin huecos ni repeticiones;
- hecho: el servicio responde mientras procesa un documento, y el tope de documentos simultáneos se respeta;
- pendiente: almacenamiento S3-compatible local.

## Caracterización

`tests/characterization/` ejecuta el exportador BCP legacy real sobre el mismo PDF sintético y compara su XLSX con el nuevo: conteo de filas, equivalencia de tipos de fila renombrados, página, descripción, fechas, cargo, abono, saldo, totales del resumen y control por página. Nunca se comparan archivos byte a byte.

El arnés carga el script legacy por ruta relativa a la raíz del repositorio y no lo modifica. Si falta el script o alguna de sus dependencias (`pandas`, `tqdm`, `pdfplumber`), la clase se salta con el motivo explícito en lugar de fallar.

El mismo módulo verifica las mejoras documentadas: el legacy publica `Encabezado` con titular, dirección y código de cuenta, escribe importes como números de Python y no reporta invariantes; el nuevo sustituye esa hoja por `Validaciones`, conserva `Decimal` y publica su reconciliación.

Además, `tests/unit/test_export_contract.py` congela el contrato de salida sin ejecutar el legacy: identidad del esquema, hojas, columnas conservadas, columnas retiradas a propósito, formatos declarados y ausencia de columnas identificatorias o del entorno.

El pipeline BCP puro debe probar al menos tres resultados: documento reconciliado (`SUCCEEDED`), salida utilizable con discrepancias (`NEEDS_REVIEW`) y ausencia total de filas (`FAILED`).

## Convenciones

- Un bug nuevo comienza con una prueba que falla.
- Una prueba que fija una corrección debe comprobarse **contra el código anterior**: si también pasa con el fallo presente, no protege nada. Las dos guardas de disponibilidad se verificaron así, y fallan con los mensajes esperados.
- Casos válidos, inválidos y ambiguos deben estar separados.
- Los datos sintéticos usan nombres y cuentas obviamente ficticios.
- Los mensajes de fallo no imprimen el contenido completo del documento.
- Los PDF sintéticos se validan semánticamente y también se renderizan para comprobar que su layout visual sigue siendo legible.

## Comando único

Después de crear `.venv` e instalar `.[pdf,excel,dev]`, ejecutar `scripts/check.ps1`. El control exige pruebas exitosas, cobertura de ramas mínima de 90%, Ruff lint/formato y mypy estricto.
