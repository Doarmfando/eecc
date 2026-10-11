# Monedas admitidas y su formato

Referencia rápida de las monedas que el sistema reconoce de punta a punta y de cómo se muestran. Estado: **existente** (octubre de 2026).

## Monedas admitidas

| Código | Moneda          | Símbolo | Ejemplo en pantalla | Selector      |
| ------ | --------------- | ------- | ------------------- | ------------- |
| `PEN`  | Sol peruano     | `S/`    | `S/ 1,304.21`       | `S/ Soles`    |
| `USD`  | Dólar americano | `US$`   | `US$ 2,300.00`      | `US$ Dólares` |

No hay otras. Un `Resumen` con cualquier otro código (`EUR`, `MXN`…) se lee como «sin moneda» y se trata como soles.

## Reglas de formato

- **Símbolo, espacio, número**: `S/ 1,304.21`, `US$ 66,387.45`. El símbolo se escribe a mano (`frontend/src/lib/format.ts`), no con `Intl`, porque cada navegador escribe el dólar distinto (`USD`, `US$`, `$`).
- **Dos decimales siempre**, coma para miles y punto para decimales (`es-PE`).
- **El signo va delante del símbolo**: `+S/ 18.09`, `−US$ 300.00`.
- **Soles y dólares nunca se suman.** El Calendario y el Centro Financiero muestran una moneda a la vez; con las dos aparece el selector y se empieza por soles.
- **Los importes son enteros en céntimos** (unidades × 100) en el frontend y `Decimal` en el worker; nunca coma flotante.

### Celdas del Calendario

- Si cabe: el importe completo con símbolo, `+S/ 18.09` o `−US$ 1,058,575.42`.
- En celdas estrechas (móvil, o con el menú lateral abierto): sin símbolo, `+18.09`, y desde mil redondeado, `+66.4K` o `+1.06M`. El selector de moneda dice de qué moneda es.
- Desde mil millones solo se muestra el redondeado.

## Cómo detecta cada banco la moneda

| Banco              | Dónde la lee                                                   | Si no la encuentra |
| ------------------ | -------------------------------------------------------------- | ------------------ |
| BCP                | Código de cuenta de la cabecera (`191-…-11 SOLES`) o `MONEDA:` | Sin moneda → soles |
| BBVA               | `MONEDA: SOLES` / `NUEVOS SOLES`, o `MONEDA: DOLARES` / `US$`  | Sin moneda → soles |
| Interbank          | Título de la cuenta: `CUENTA … SOLES` o `CUENTA … DOLARES`     | Sin moneda → soles |
| Banco de la Nación | `SOLES` / `MONEDA: S/`, o `DOLARES` / `US$`                    | Sin moneda → soles |
| Genérico           | No la lee                                                      | Soles              |

Si un documento dice las dos monedas, se considera que no declara ninguna.

> El Banco de la Nación no imprime la moneda en la primera página de la muestra disponible: una cuenta suya en dólares se vería en soles. Ver la bitácora del 2026-10-06.

## Añadir una moneda

1. El extractor del banco debe devolver el código nuevo en `detect_currency`.
2. Añadirlo a `Currency`, `CURRENCY_SYMBOLS` y `CURRENCY_NAMES` en `frontend/src/lib/format.ts`.
3. Añadirlo a `CURRENCIES` en `frontend/src/features/financial-center/statement-from-csv.ts` y a `CURRENCY_ORDER` en `currency-filter.ts`.
4. Actualizar esta tabla.

Los símbolos que reconoce `parsing/amounts.py` del worker (`€`, `R$`, `MXN`…) solo sirven para quitarlos del importe al leerlo: no hacen que la moneda esté admitida.
