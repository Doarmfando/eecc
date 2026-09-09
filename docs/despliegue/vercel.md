# Desplegar el frontend en Vercel

La API y la base de datos viven en Railway ([`railway.md`](railway.md)); aquí va solo la página.

## El problema que hay que resolver primero

La sesión viaja en una cookie `SameSite=Lax`, que el navegador **solo envía si la página y la API comparten origen**. Con la página en `*.vercel.app` y la API en `*.up.railway.app` son sitios distintos: el login respondería `200` y la sesión no persistiría. Es el fallo más desconcertante posible, porque nada parece roto.

La solución es que Vercel **reenvíe** las rutas de la API en lugar de que el navegador las llame directamente. Así el navegador ve un único origen —el de Vercel— y la cookie funciona sin tocar el modelo de seguridad. De paso desaparece CORS.

Eso es lo que hace [`frontend/vercel.json`](../../frontend/vercel.json):

```
/v1/*    →  https://<tu-api>.up.railway.app/v1/*
/health  →  https://<tu-api>.up.railway.app/health
/*       →  /index.html          (las rutas del frontend viven en el navegador)
```

## Pasos

1. En Vercel: **Add New → Project**, importa este repositorio.
2. **Root Directory**: `frontend`. Es lo único que hay que ajustar; el resto lo lee de `vercel.json`.
3. Variables de entorno: **ninguna**. `VITE_API_BASE_URL` se deja sin definir, que significa «el mismo origen que la página», que es justo lo que hace el reenvío.
4. Despliega.

Si cambias el dominio de la API en Railway, actualiza las dos primeras reglas de `vercel.json`.

## Comprobar que quedó bien

1. Abre el dominio de Vercel: debe cargar la página de inicio de sesión.
2. Entra con tu cuenta.
3. **Recarga con F5 estando dentro.** Si sigues dentro, la cookie viaja correctamente. Si te devuelve al login, el reenvío no está funcionando y el navegador está llamando a Railway directamente.
4. Escribe una ruta a mano, por ejemplo `/personas`, y recarga: debe cargar la aplicación y no un 404 de Vercel.

## Límite que conviene tener presente

Las subidas pasan por el reenvío de Vercel, así que quedan sujetas a su límite de tamaño de petición. Los estados de cuenta habituales rondan el megabyte y entran de sobra, pero un documento muy grande podría ser rechazado por Vercel antes de llegar a la API. Si eso ocurre, el síntoma es un error de red o un `413` en la subida mientras el resto de la aplicación funciona.

La salida en ese caso es que el navegador llame a la API directamente, lo que exige:

- poner `VITE_API_BASE_URL` con el dominio de Railway;
- añadir ese dominio de Vercel a `CORS_ORIGINS` en la API;
- y **cambiar la cookie a `SameSite=None`**, que hoy no es configurable y reabriría la puerta al CSRF. No está implementado a propósito: no conviene hacerlo sin necesidad real.

La alternativa limpia, si tienes dominio propio, es servir la página en `app.tudominio.com` y la API en `api.tudominio.com`. Al compartir dominio padre son el mismo sitio, la cookie `SameSite=Lax` viaja, y las subidas van directas sin intermediario.
