# Video promocional (Remotion)

Video vertical de 50 s para Reels y TikTok (1080×1920, 30 fps, H.264 + AAC) hecho con [Remotion](https://www.remotion.dev/). Se renderiza **en local** a `out/video-promo/`; nada se sube a ninguna red.

Es una pieza aparte: no comparte dependencias con `frontend/` ni con los backends y no toca datos reales. Todas las cifras que aparecen son sintéticas.

## Uso

```powershell
cd video-promo
npm install                       # la primera vez
npm run studio                    # vista previa interactiva en el navegador
.\render.ps1                      # → ..\out\video-promo\atlas-promo-9x16.mp4
.\render.ps1 -Voz -Subtitulos -Portada
.\render.ps1 -Voz -Musica -Contacto "wa.me/51XXXXXXXXX"
```

| Opción | Qué hace |
| --- | --- |
| `-Voz` | Monta `public/voz/<escena>.wav` en el segundo que marca `src/guion.json` |
| `-VozFormato mp3` | Igual, con `.mp3` |
| `-Subtitulos` | Quema el texto del guion abajo, dentro de la zona segura |
| `-Musica` | Añade `public/musica.mp3`, bajada a 12 % si hay voz y con fundido final |
| `-Contacto` | Línea bajo «Pide tu acceso» (por defecto «Escríbenos por DM») |
| `-Portada` | Exporta además `portada.png` (fotograma del cierre) |

La primera ejecución descarga Anton y Poppins de Google Fonts y un Chrome headless que Remotion usa para renderizar; después funciona sin conexión.

## Estructura

```text
src/
├── index.ts           # registerRoot
├── Root.tsx           # <Composition id="PromoVertical" …>
├── PromoVideo.tsx     # TransitionSeries de las 6 escenas + barra de pasos, subtítulos y audio
├── theme.ts           # colores, fuentes, duraciones y zona segura
├── guion.json         # voz en off: texto y segundo de entrada/salida (fuente única)
├── components/        # fondos, texto cinético, cabecera de paso, iconos, overlays
└── scenes/            # Hook, StepBank, StepUpload, StepValidate, StepDownload, Closing
scripts/generar-voz.ps1  # voz provisional con el sintetizador de Windows
render.ps1               # render local
```

## Guion y por qué dice lo que dice

| Tiempo | Escena | En pantalla | Base en el código |
| --- | --- | --- | --- |
| 0–5 s | Gancho | «¿Cansado de pasar a mano tus estados de cuenta a Excel?» + BCP, BBVA, Interbank, Banco de la Nación | Bancos con extractor validado en `README.md` |
| 5–14 s | Paso 1 | «Elige tu banco»; Scotiabank «Próximamente»; «¿Marcaste otro? Igual detecta el formato» | `bank-selector.tsx`; el worker detecta la plantilla solo |
| 14–22 s | Paso 2 | «Sube tu PDF»; usuario propio, PDF con contraseña, borrar historial | ADR-0005, `upload-form.tsx`, ADR-0017 |
| 22–31 s | Paso 3 | «Todo cuadra»: saldo inicial + abonos − cargos = saldo final; sello «Reconciliado»; «¿No cuadra? Requiere revisión» | Invariantes del worker; estados `SUCCEEDED`/`NEEDS_REVIEW` de `status-labels.ts` |
| 31–40 s | Paso 4 | Hoja con pestañas «Resumen» y «Movimientos»; «Descargar Excel (.xlsx)» y CSV | `exporters/*_workbook.py`, `artifact-list.tsx` |
| 40–50 s | Cierre | ATLAS · «Automatiza tu contabilidad en segundos» · «Pide tu acceso» | No hay registro abierto: las cuentas las crea un administrador |

Cosas que el video **no** promete, a propósito: que Scotiabank esté soportado, que cualquier PDF sirva, ni un registro gratuito.

## Voz en off

`src/guion.json` es la única fuente del texto: lo usan los subtítulos, el montaje del audio y el generador de voz. Si cambias una línea, respeta su hueco (`hasta − desde`); a ~2,5 palabras por segundo caben unas 18 palabras en 7,5 s.

1. **Borrador sin conexión:** `.\scripts\generar-voz.ps1` crea un WAV por línea con la voz en español de Windows y avisa si alguna no cabe. Sirve para cuadrar tiempos, no para publicar.
2. **Versión final:** graba tu voz o usa un TTS profesional; exporta un archivo por línea (`gancho`, `paso1` … `cierre`) en `public/voz/` y renderiza con `-Voz` (o `-Voz -VozFormato mp3`).

Pautas de locución: tono cercano y seguro, ritmo rápido en el gancho, pausa breve tras «Paso uno/dos/tres/cuatro», y el cierre más lento y enfático en «en segundos».

## Ajustes rápidos

- Duraciones: `SCENES` en `theme.ts` (la suma menos los solapes debe dar 1500).
- Colores y fuentes: `COLORS`, `ANTON`, `POPPINS` en `theme.ts`.
- Textos de cada escena: en su archivo de `scenes/`.
- Música: solo con licencia para uso comercial en redes.
