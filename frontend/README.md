# Frontend

Aplicación React que consume la API pública. No conoce PDFs, bancos ni reglas de extracción: envía el documento, muestra el resultado validado y hace visible cuándo un resultado necesita revisión.

## Estado

| Componente | Estado |
| --- | --- |
| Vite + React + TypeScript estricto | Implementado |
| Tailwind CSS con tokens del sistema de diseño | Implementado |
| Cliente HTTP con validación Zod en el borde | Implementado |
| Carga del documento con validación previa | Implementada |
| Revisión de advertencias e invariantes | Implementada |
| Consulta de un trabajo con polling y backoff | Implementada |
| Formularios con React Hook Form + Zod | Implementados |
| Componentes shadcn/ui con tokens propios | Implementados |
| Descarga de resultados | Implementada; autorizada con la credencial |
| Prueba de extremo a extremo con navegador | Implementada con Playwright |
| Autenticación de usuarios | Pendiente; hoy se usa una credencial de servicio |
| Historial de documentos | Implementado |

## Stack

React + Vite + TypeScript estricto, Tailwind CSS, shadcn/ui sobre primitivas Radix (los componentes viven en `src/components/ui` y se configuran en `components.json`), Lucide, React Router, TanStack Query y React Hook Form + Zod. Zod valida además toda respuesta del servidor antes de usarla.

## Estructura

```text
src/
├── app/             # Router, providers, contexto de configuración
├── components/
│   ├── ui/          # Componentes shadcn/ui (botón, tarjeta, alerta, campo…)
│   └── shared/      # Piezas del producto (estado, advertencias, artefactos)
├── features/
│   ├── auth/        # Credencial de servicio y su esquema
│   └── statements/  # Formulario, resumen del trabajo y hooks de datos
├── lib/             # Cliente HTTP, errores, formato y entorno
├── pages/           # Pantallas enrutadas
├── types/           # Contrato del API validado con Zod
└── test/            # Configuración de pruebas
```

## Preparar y ejecutar

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

La API debe estar levantada en `VITE_API_BASE_URL` y autorizar el origen del navegador con `CORS_ORIGINS`.

## Verificar

```powershell
npm run check
```

Ejecuta comprobación de tipos, ESLint sin advertencias, Prettier y las pruebas con cobertura mínima.

Para la prueba de extremo a extremo con navegador real, con la pila levantada:

```powershell
$env:E2E_API_KEY="<credencial del seed>"
$env:E2E_PDF="ruta\a\un\pdf\sintetico.pdf"
npm run test:e2e
```

Sin esas variables la suite se salta. Levanta su propio servidor de desarrollo en el puerto 5199 y no reutiliza uno ajeno; ese origen debe estar en `CORS_ORIGINS` de la API.

## Decisiones propias

- **La credencial vive solo en memoria.** No se guarda en `localStorage`, `sessionStorage` ni cookies. Al recargar hay que escribirla de nuevo. Es deliberado mientras no exista autenticación de usuarios con su propia decisión de seguridad.
- **`NEEDS_REVIEW` no se presenta como éxito.** Tiene su propia insignia, su aviso y la lista de invariantes que no cuadraron.
- **Los códigos de advertencia se muestran junto a su explicación.** El operador necesita saber qué invariante falló, no un mensaje genérico.
- **Toda respuesta se valida con Zod.** Una respuesta que no cumple el contrato produce un error explícito en lugar de pintar datos incompletos.
- **Los errores de red no se propagan crudos.** Se traducen a códigos propios para no exponer la URL interna del API.
- **El polling se detiene en estados terminales** y aplica backoff exponencial acotado ante fallos.
- **La descarga la autoriza el servidor.** El nombre del archivo lo decide la API a partir del trabajo y el tipo, nunca el documento original.
- **Los esquemas de formulario viven en su propio módulo** (`*-schema.ts`) para probarlos sin montar la interfaz.
