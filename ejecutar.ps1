#Requires -Version 5.1
<#
.SYNOPSIS
    Levanta el proyecto completo: worker, API y frontend.

.DESCRIPTION
    Arranca los tres servicios en segundo plano, espera a que respondan y muestra
    la URL y la credencial para entrar. Los registros van a `.local\logs\`.

    El puerto del worker NO se elige aquí: se deriva de `WORKER_BASE_URL` del
    `.env` de la API. Si ambos no coinciden, subir un documento falla con
    `WORKER_UNAVAILABLE` sin decir por qué, así que hay una sola fuente de verdad.

.PARAMETER Modo
    Fuerza el modo de persistencia solo para esta ejecución, sin tocar el `.env`.
    Sin este parámetro se usa lo que diga `PERSISTENCE_MODE` en el `.env`.

.PARAMETER SinFrontend
    Levanta solo worker y API. Útil para consumir la API desde otra herramienta.

.PARAMETER Detener
    Detiene los servicios que estén escuchando en los puertos del proyecto.

.PARAMETER Estado
    Solo informa qué está levantado y qué no.

.EXAMPLE
    .\ejecutar.ps1
    Levanta todo y muestra la URL y la credencial.

.EXAMPLE
    .\ejecutar.ps1 -Detener
    Apaga los tres servicios.
#>
[CmdletBinding()]
param(
    [ValidateSet('memoria', 'base-de-datos')]
    [string]$Modo,

    [switch]$SinFrontend,
    [switch]$Detener,
    [switch]$Estado
)

$ErrorActionPreference = 'Stop'
$raiz = $PSScriptRoot

$dirWorker = Join-Path $raiz 'backend\pdf-worker'
$dirApi = Join-Path $raiz 'backend\api-backend'
$dirFront = Join-Path $raiz 'frontend'
$envApi = Join-Path $dirApi '.env'
$dirLogs = Join-Path $raiz '.local\logs'

# --- Utilidades -------------------------------------------------------------

function Get-ValorEnv {
    param([string]$Archivo, [string]$Clave, [string]$PorDefecto)

    if (Test-Path $Archivo) {
        foreach ($linea in Get-Content -Path $Archivo -Encoding utf8) {
            if ($linea -match "^\s*$([regex]::Escape($Clave))\s*=\s*(.*)$") {
                $valor = $Matches[1].Trim()
                if ($valor) { return $valor }
            }
        }
    }
    return $PorDefecto
}

function Get-PidEnPuerto([int]$puerto) {
    $conexiones = Get-NetTCPConnection -LocalPort $puerto -State Listen -ErrorAction SilentlyContinue
    if ($conexiones) { return @($conexiones)[0].OwningProcess }
    return $null
}

function Test-Responde([string]$url) {
    try {
        $respuesta = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        return $respuesta.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Wait-Servicio {
    param([string]$Nombre, [string]$Url, [int]$Segundos = 90)

    $limite = (Get-Date).AddSeconds($Segundos)
    while ((Get-Date) -lt $limite) {
        if (Test-Responde $Url) { return $true }
        Start-Sleep -Milliseconds 700
    }
    return $false
}

# --- Configuración leída del entorno ---------------------------------------

if (-not (Test-Path $envApi)) {
    Write-Host ''
    Write-Host 'No existe backend\api-backend\.env. Ejecuta primero:' -ForegroundColor Red
    Write-Host '  .\instalar.ps1' -ForegroundColor Red
    Write-Host ''
    exit 1
}

$urlWorker = Get-ValorEnv -Archivo $envApi -Clave 'WORKER_BASE_URL' -PorDefecto 'http://127.0.0.1:8000'
try {
    $puertoWorker = ([uri]$urlWorker).Port
} catch {
    Write-Host "WORKER_BASE_URL no es una URL válida: $urlWorker" -ForegroundColor Red
    exit 1
}

$puertoApi = [int](Get-ValorEnv -Archivo $envApi -Clave 'PORT' -PorDefecto '3000')
$puertoFront = 5173
$credencial = Get-ValorEnv -Archivo $envApi -Clave 'EPHEMERAL_API_KEY' -PorDefecto '(sin configurar)'
$persistencia = Get-ValorEnv -Archivo $envApi -Clave 'PERSISTENCE_MODE' -PorDefecto 'database'

if ($Modo) {
    if ($Modo -eq 'memoria') { $persistencia = 'memory' } else { $persistencia = 'database' }
    $env:PERSISTENCE_MODE = $persistencia
}

$servicios = @(
    [pscustomobject]@{ Nombre = 'worker';   Puerto = $puertoWorker; Salud = "http://127.0.0.1:$puertoWorker/health" }
    [pscustomobject]@{ Nombre = 'api';      Puerto = $puertoApi;    Salud = "http://127.0.0.1:$puertoApi/health" }
    [pscustomobject]@{ Nombre = 'frontend'; Puerto = $puertoFront;  Salud = "http://localhost:$puertoFront/" }
)
if ($SinFrontend) {
    $servicios = $servicios | Where-Object { $_.Nombre -ne 'frontend' }
}

# --- Detener ----------------------------------------------------------------

if ($Detener) {
    Write-Host ''
    Write-Host '== Deteniendo servicios' -ForegroundColor Cyan
    $detenidos = 0
    # Se detiene por puerto y no por identificador guardado: `npm` y `cmd` lanzan
    # procesos hijo, y matar al padre puede dejar al hijo escuchando.
    foreach ($servicio in @(
        [pscustomobject]@{ Nombre = 'worker'; Puerto = $puertoWorker }
        [pscustomobject]@{ Nombre = 'api'; Puerto = $puertoApi }
        [pscustomobject]@{ Nombre = 'frontend'; Puerto = $puertoFront }
    )) {
        $procId = Get-PidEnPuerto $servicio.Puerto
        if ($procId) {
            try {
                Stop-Process -Id $procId -Force -ErrorAction Stop
                Write-Host "   [ok] $($servicio.Nombre) detenido (puerto $($servicio.Puerto))" -ForegroundColor Green
                $detenidos++
            } catch {
                Write-Host "   [!!] No se pudo detener $($servicio.Nombre): $_" -ForegroundColor Yellow
            }
        } else {
            Write-Host "   [--] $($servicio.Nombre) no estaba levantado" -ForegroundColor DarkGray
        }
    }
    Write-Host ''
    Write-Host " Servicios detenidos: $detenidos"
    Write-Host ''
    exit 0
}

# --- Estado -----------------------------------------------------------------

if ($Estado) {
    Write-Host ''
    Write-Host '== Estado' -ForegroundColor Cyan
    foreach ($servicio in $servicios) {
        if (Test-Responde $servicio.Salud) {
            Write-Host ("   [ok] {0,-9} responde en el puerto {1}" -f $servicio.Nombre, $servicio.Puerto) -ForegroundColor Green
        } else {
            Write-Host ("   [--] {0,-9} no responde en el puerto {1}" -f $servicio.Nombre, $servicio.Puerto) -ForegroundColor DarkGray
        }
    }
    Write-Host ''
    exit 0
}

# --- Comprobaciones previas -------------------------------------------------

if (-not (Test-Path (Join-Path $dirWorker '.venv\Scripts\python.exe'))) {
    Write-Host ''
    Write-Host 'Falta el entorno de Python. Ejecuta primero:' -ForegroundColor Red
    Write-Host '  .\instalar.ps1' -ForegroundColor Red
    Write-Host ''
    exit 1
}
if (-not (Test-Path (Join-Path $dirApi 'node_modules'))) {
    Write-Host ''
    Write-Host 'Faltan las dependencias de la API. Ejecuta primero:' -ForegroundColor Red
    Write-Host '  .\instalar.ps1' -ForegroundColor Red
    Write-Host ''
    exit 1
}

$ocupados = @()
foreach ($servicio in $servicios) {
    if (Get-PidEnPuerto $servicio.Puerto) { $ocupados += $servicio }
}
if ($ocupados.Count -gt 0) {
    Write-Host ''
    Write-Host 'Estos puertos ya están ocupados:' -ForegroundColor Yellow
    $ocupados | ForEach-Object { Write-Host "  - $($_.Nombre): $($_.Puerto)" -ForegroundColor Yellow }
    Write-Host ''
    Write-Host 'Si son de una ejecución anterior, apágala con:' -ForegroundColor Yellow
    Write-Host '  .\ejecutar.ps1 -Detener' -ForegroundColor Yellow
    Write-Host ''
    exit 1
}

if ($persistencia -eq 'database') {
    Write-Host ''
    Write-Host 'Aviso: PERSISTENCE_MODE=database. La API guardará los documentos y' -ForegroundColor Yellow
    Write-Host 'necesita PostgreSQL levantado (docker compose up -d postgres).' -ForegroundColor Yellow
    Write-Host 'Para no guardar nada:  .\ejecutar.ps1 -Modo memoria' -ForegroundColor Yellow
}

# --- Arranque ---------------------------------------------------------------

if (-not (Test-Path $dirLogs)) { New-Item -ItemType Directory -Path $dirLogs -Force | Out-Null }

function Start-Servicio {
    param(
        [string]$Nombre,
        [string]$Archivo,
        [string[]]$Argumentos,
        [string]$Directorio
    )

    $salida = Join-Path $dirLogs "$Nombre.log"
    $errores = Join-Path $dirLogs "$Nombre.error.log"
    Start-Process -FilePath $Archivo -ArgumentList $Argumentos -WorkingDirectory $Directorio `
        -RedirectStandardOutput $salida -RedirectStandardError $errores `
        -WindowStyle Hidden -PassThru | Out-Null
}

Write-Host ''
Write-Host '== Levantando servicios' -ForegroundColor Cyan

Start-Servicio -Nombre 'worker' -Archivo (Join-Path $dirWorker '.venv\Scripts\python.exe') `
    -Argumentos @('-m', 'uvicorn', 'statement_worker.api.main:app', '--port', "$puertoWorker") `
    -Directorio $dirWorker
Write-Host "   ... worker en el puerto $puertoWorker" -ForegroundColor DarkGray

Start-Servicio -Nombre 'api' -Archivo 'npm.cmd' -Argumentos @('run', 'start') -Directorio $dirApi
Write-Host "   ... api en el puerto $puertoApi" -ForegroundColor DarkGray

if (-not $SinFrontend) {
    Start-Servicio -Nombre 'frontend' -Archivo 'npm.cmd' -Argumentos @('run', 'dev') -Directorio $dirFront
    Write-Host "   ... frontend en el puerto $puertoFront" -ForegroundColor DarkGray
}

Write-Host ''
Write-Host '   Esperando a que respondan...' -ForegroundColor DarkGray

$fallaron = @()
foreach ($servicio in $servicios) {
    if (Wait-Servicio -Nombre $servicio.Nombre -Url $servicio.Salud) {
        Write-Host ("   [ok] {0,-9} listo" -f $servicio.Nombre) -ForegroundColor Green
    } else {
        Write-Host ("   [!!] {0,-9} no respondió" -f $servicio.Nombre) -ForegroundColor Red
        $fallaron += $servicio.Nombre
    }
}

if ($fallaron.Count -gt 0) {
    Write-Host ''
    Write-Host 'Algún servicio no arrancó. Mira su registro:' -ForegroundColor Red
    $fallaron | ForEach-Object {
        Write-Host "  Get-Content -Tail 40 .local\logs\$_.log" -ForegroundColor Red
        Write-Host "  Get-Content -Tail 40 .local\logs\$_.error.log" -ForegroundColor Red
    }
    Write-Host ''
    exit 1
}

# --- Resumen ----------------------------------------------------------------

if ($persistencia -eq 'memory') {
    $descripcion = 'sin persistencia: no se guarda nada y todo se pierde al reiniciar'
} else {
    $descripcion = 'con base de datos: los documentos y su estado se guardan'
}

Write-Host ''
Write-Host '========================================================' -ForegroundColor Cyan
Write-Host ' Proyecto levantado' -ForegroundColor Cyan
Write-Host '========================================================' -ForegroundColor Cyan
Write-Host ''
if (-not $SinFrontend) {
    Write-Host "  Abre:       http://localhost:$puertoFront" -ForegroundColor Green
    Write-Host '              (usa localhost, no 127.0.0.1)' -ForegroundColor DarkGray
}
Write-Host "  API:        http://127.0.0.1:$puertoApi   (OpenAPI en /docs)"
Write-Host "  Worker:     http://127.0.0.1:$puertoWorker"
Write-Host ''
Write-Host '  Credencial: ' -NoNewline
Write-Host $credencial -ForegroundColor Yellow
Write-Host ''
Write-Host "  Modo:       $persistencia ($descripcion)"
Write-Host ''
Write-Host '  Registros:  .local\logs\'
Write-Host '  Detener:    .\ejecutar.ps1 -Detener'
Write-Host ''
