# ADR-0011: Conservar el nombre del PDF como etiqueta privada

- Estado: Aceptada
- Fecha: 2026-10-17
- Ampliada por: [ADR-0012](ADR-0012-excel-bbva-con-encabezado-y-nombre-del-archivo.md),
  que escribe el nombre en el `Resumen` del Excel BBVA y en las descargas.

## Contexto

El formulario mostraba `File.name`, pero la API lo descartaba. Al abrir el
resultado o volver al historial, la persona perdía la referencia al archivo que
había subido. Un nombre inventado o el banco por sí solo no distingue varios
estados de cuenta del mismo banco.

## Decisión

Guardar `statements.source_file_name`, opcional y limitado a 255 caracteres
Unicode, como etiqueta de presentación. El frontend envía `sourceFileName` como
campo de texto multipart para conservar UTF-8; clientes anteriores siguen usando
el nombre del archivo multipart. La API elimina rutas, controles y marcas de
dirección del texto y normaliza Unicode antes de persistir.

El nombre se devuelve únicamente en las respuestas autorizadas de carga, detalle
e historial, con el mismo aislamiento por organización y dueño de ADR-0009.
Historial y detalle usan `Cache-Control: private, no-store`. React lo presenta
como texto, nunca como HTML. No se guarda en almacenamiento del navegador.

La etiqueta no se usa como clave de objeto, ruta, identificador, cabecera de
descarga, parte de la huella ni nombre de artefacto. No entra en logs, auditoría,
outbox ni manifiestos del worker. Los nombres pueden contener datos personales:
su único propósito es que su dueño reconozca el documento.

Repetir el mismo PDF con otro nombre actualiza la etiqueta del mismo documento,
con filtro por organización y dueño, sin volver a extraerlo ni consumir otro
cupo. La etiqueta se elimina junto al documento bajo la retención existente.

## Alternativas consideradas

- Recordarlo solo en la navegación o en memoria: se pierde al recargar.
- Usar `localStorage`: queda en un navegador compartido y no acompaña a la cuenta.
- Usar el nombre como ruta o clave: mezcla presentación con almacenamiento y
  puede revelar información o permitir rutas no deseadas.
- Inventar números: no permite reconocer el archivo de origen.

## Consecuencias

Se añade una columna nullable mediante migración aditiva. Los documentos antiguos
no recuperan un nombre que nunca se guardó; la interfaz conserva banco y fecha
como referencia. Volver a subir el mismo PDF completa o actualiza su nombre.
La minimización financiera de ADR-0002 sigue aplicándose al contenido extraído:
no se persisten movimientos, importes ni descripciones bancarias en PostgreSQL.

## Criterio de revisión

Revisar antes de compartir documentos entre personas, introducir búsqueda pública
o exportar etiquetas a terceros. Cualquier cambio debe mantener la separación
entre presentación, almacenamiento y diagnósticos.
