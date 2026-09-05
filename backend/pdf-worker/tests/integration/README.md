# Pruebas de integración

Aquí viven las pruebas de adaptadores (`pdfplumber`, y en el futuro XLSX, FastAPI, Celery y almacenamiento). El caso BCP genera su PDF ficticio en un directorio aislado y comprueba lectura, reconciliación, saneamiento y limpieza. Ninguna prueba depende de servicios externos compartidos ni de documentos bancarios reales.
