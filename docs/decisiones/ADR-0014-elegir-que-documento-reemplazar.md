# ADR-0014: Elegir qué documento se reemplaza al llegar al cupo

- Estado: Aceptada
- Fecha: 2026-10-17
- Amplía: [ADR-0007](ADR-0007-cupo-de-documentos-por-persona.md)

## Contexto

ADR-0007 borra el documento más antiguo al superar el cupo y reconoce como su
consecuencia más incómoda que se pierden documentos sin avisar. El aviso junto
al formulario no basta: la persona puede querer conservar el más antiguo y
reemplazar otro.

## Decisión

Al enviar un PDF con el cupo lleno, la interfaz abre un diálogo con los
documentos propios, el más antiguo ya elegido y el botón principal con el foco:
un Enter confirma lo de siempre. Cancelar no sube nada.

La carga acepta `replaceStatementId`. La retención borra ese documento en lugar
del más antiguo solo si aparece entre los de quien sube, en su organización; la
consulta ya filtra por ambos, así que un identificador ajeno no coincide y se
vuelve al más antiguo. El documento recién subido nunca se borra. Sin elección,
el comportamiento es el de ADR-0007.

## Consecuencias

- La elección viaja en la misma petición de subida: no hay un borrado previo que
  pueda dejar a la persona con un documento menos si la subida falla.
- Si el PDF ya estaba procesado, se reutiliza y no se borra nada, aunque el
  diálogo haya preguntado; el diálogo lo advierte.
- Las credenciales de servicio no ven el diálogo y conservan el criterio del más
  antiguo.
