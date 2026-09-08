#Requires -Version 5.1
<#
.SYNOPSIS
    Deja el proyecto listo para ejecutarse: dependencias y archivos `.env`.

.DESCRIPTION
    Instala las tres partes (worker Python, API NestJS y frontend), levanta
    PostgreSQL, aplica las migraciones y crea la primera cuenta de acceso.

    Es idempotente: volver a ejecutarlo no reinstala lo que ya está, no pisa un
    `.env` existente y no cambia la contraseña de quien ya entra.

.PARAMETER Rehacer
    Borra y recrea el entorno virtual de Python. Úsalo si quedó a medias.

.EXAMPLE
    .\instalar.ps1
    Instala todo y deja la aplicación lista para entrar.
#>
[CmdletBinding()]
param(
    [switch]$Rehacer
)

$ErrorActionPreference = 'Stop'
$raiz = $PSScriptRoot

# --- Salida legible ---------------------------------------------------------

$script:Pasos = @()
$script:AccesoSembrado = $null

function Write-Titulo($texto) {
    Write-Host ''
    Write-Host "== $texto" -ForegroundColor Cyan
}

function Write-Ok($texto) {
    Write-Host "   [ok] $texto" -ForegroundColor Green
    $script:Pasos += "ok    $texto"
}

function Write-Salto($texto) {
    Write-Host "   [--] $texto" -ForegroundColor DarkGray
    $script:Pasos += "salto $texto"
}

function Write-Aviso($texto) {
    Write-Host "   [!!] $texto" -ForegroundColor Yellow
    $script:Pasos += "aviso $texto"
}

# --- Utilidades -------------------------------------------------------------

function Test-Comando($nombre) {
    $null -ne (Get-Command $nombre -ErrorAction SilentlyContinue)
}

<#
    Escribe una clave en un `.env` sin tocar el resto del archivo.
    Si la clave ya existe con un valor no vacío, la respeta: la configuración que
    escribió una persona pesa más que el valor por defecto de este script.
#>
function Set-ValorEnv {
    param(
        [Parameter(Mandatory)][string]$Archivo,
        [Parameter(Mandatory)][string]$Clave,
        [Parameter(Mandatory)][string]$Valor,
        [switch]$Sobrescribir
    )

    if (-not (Test-Path $Archivo)) {
        Set-Content -Path $Archivo -Value "$Clave=$Valor" -Encoding utf8
        return $true
    }

    $lineas = @(Get-Content -Path $Archivo -Encoding utf8)
    $indice = -1
    for ($i = 0; $i -lt $lineas.Count; $i++) {
        if ($lineas[$i] -match "^\s*$([regex]::Escape($Clave))\s*=") {
            $indice = $i
            break
        }
    }

    if ($indice -ge 0) {
        $actual = ($lineas[$indice] -replace "^\s*$([regex]::Escape($Clave))\s*=", '').Trim()
        if ($actual -and -not $Sobrescribir) {
            return $false
        }
        $lineas[$indice] = "$Clave=$Valor"
        Set-Content -Path $Archivo -Value $lineas -Encoding utf8
        return $true
    }

    Add-Content -Path $Archivo -Value "$Clave=$Valor" -Encoding utf8
    return $true
}

function Get-ValorEnv {
    param([string]$Archivo, [string]$Clave)

    if (-not (Test-Path $Archivo)) { return $null }
    foreach ($linea in Get-Content -Path $Archivo -Encoding utf8) {
        if ($linea -match "^\s*$([regex]::Escape($Clave))\s*=\s*(.*)$") {
            return $Matches[1].Trim()
        }
    }
    return $null
}

# Secreto local aleatorio, sin caracteres que se confundan al dictarlo.
function New-Credencial {
    $alfabeto = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    $bytes = New-Object 'byte[]' 48
    $generador = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generador.GetBytes($bytes) } finally { $generador.Dispose() }

    return -join ($bytes | ForEach-Object { $alfabeto[$_ % $alfabeto.Length] })
}

function Invoke-Externo {
    param(
        [Parameter(Mandatory)][string]$Archivo,
        [Parameter(Mandatory)][string[]]$Argumentos,
        [Parameter(Mandatory)][string]$Directorio,
        [Parameter(Mandatory)][string]$Descripcion
    )

    Write-Host "   ... $Descripcion" -ForegroundColor DarkGray

    # `Start-Process` y no `& comando 2>&1`: en Windows PowerShell 5.1 redirigir el
    # stderr de un ejecutable nativo envuelve cada línea en un ErrorRecord, y con
    # `$ErrorActionPreference = 'Stop'` un simple `npm warn` aborta la instalación.
    $salida = Join-Path $env:TEMP "eecc-instalar-$([guid]::NewGuid().ToString('N')).log"
    $errores = "$salida.err"

    try {
        $proceso = Start-Process -FilePath $Archivo -ArgumentList $Argumentos `
            -WorkingDirectory $Directorio -NoNewWindow -Wait -PassThru `
            -RedirectStandardOutput $salida -RedirectStandardError $errores

        if ($proceso.ExitCode -ne 0) {
            $detalle = ''
            foreach ($archivo in @($errores, $salida)) {
                if (Test-Path $archivo) {
                    $ultimas = (Get-Content -Path $archivo -Tail 15 -ErrorAction SilentlyContinue) -join [Environment]::NewLine
                    if ($ultimas -and $ultimas.Trim()) { $detalle = $ultimas; break }
                }
            }
            throw "$Descripcion falló (código $($proceso.ExitCode)).$([Environment]::NewLine)$detalle"
        }
    } finally {
        Remove-Item -Path $salida, $errores -Force -ErrorAction SilentlyContinue
    }
}

# --- 1. Requisitos previos --------------------------------------------------

Write-Titulo 'Requisitos previos'

$faltan = @()
if (-not (Test-Comando 'node')) { $faltan += 'Node.js 20 o superior (https://nodejs.org)' }
if (-not (Test-Comando 'npm')) { $faltan += 'npm (viene con Node.js)' }

$python = $null
foreach ($candidato in @('py', 'python')) {
    if (Test-Comando $candidato) { $python = $candidato; break }
}
if (-not $python) { $faltan += 'Python 3.11 o superior (https://python.org)' }

if ($faltan.Count -gt 0) {
    Write-Host ''
    Write-Host 'Falta instalar:' -ForegroundColor Red
    $faltan | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    exit 1
}

Write-Ok "Node $(node --version)"
Write-Ok "Python $(& $python --version 2>&1)"

# Con la API en marcha, Windows mantiene bloqueado el motor de Prisma y regenerarlo
# falla con un EPERM que no explica nada. Mejor detenerse aquí y decir por qué.
$enMarcha = @()
foreach ($servicio in @(
    @{ Nombre = 'api'; Puerto = 3000 }
    @{ Nombre = 'worker'; Puerto = 8010 }
    @{ Nombre = 'worker'; Puerto = 8000 }
    @{ Nombre = 'frontend'; Puerto = 5173 }
)) {
    if (Get-NetTCPConnection -LocalPort $servicio.Puerto -State Listen -ErrorAction SilentlyContinue) {
        $enMarcha += "$($servicio.Nombre) (puerto $($servicio.Puerto))"
    }
}
if ($enMarcha.Count -gt 0) {
    Write-Host ''
    Write-Host 'Hay servicios del proyecto en marcha:' -ForegroundColor Red
    $enMarcha | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Write-Host ''
    Write-Host 'Deténlos antes de instalar: con ellos abiertos, Windows no deja' -ForegroundColor Red
    Write-Host 'reemplazar los archivos en uso.' -ForegroundColor Red
    Write-Host '  .\ejecutar.ps1 -Detener' -ForegroundColor Red
    Write-Host ''
    exit 1
}
Write-Ok 'Ningún servicio del proyecto ocupa sus puertos'

# --- 2. Worker Python -------------------------------------------------------

Write-Titulo 'Worker de extracción (Python)'

$dirWorker = Join-Path $raiz 'backend\pdf-worker'
$venv = Join-Path $dirWorker '.venv'
$pythonVenv = Join-Path $venv 'Scripts\python.exe'

if ($Rehacer -and (Test-Path $venv)) {
    Remove-Item -Path $venv -Recurse -Force
    Write-Ok 'Entorno virtual anterior eliminado'
}

if (Test-Path $pythonVenv) {
    Write-Salto 'El entorno virtual ya existe'
} else {
    if ($python -eq 'py') {
        Invoke-Externo -Archivo 'py' -Argumentos @('-3', '-m', 'venv', '.venv') -Directorio $dirWorker -Descripcion 'Creando entorno virtual'
    } else {
        Invoke-Externo -Archivo 'python' -Argumentos @('-m', 'venv', '.venv') -Directorio $dirWorker -Descripcion 'Creando entorno virtual'
    }
    Write-Ok 'Entorno virtual creado'
}

Invoke-Externo -Archivo $pythonVenv -Argumentos @('-m', 'pip', 'install', '--quiet', '--upgrade', 'pip') `
    -Directorio $dirWorker -Descripcion 'Actualizando pip'

# Los extras cubren lectura de PDF, escritura de XLSX, la API, la cola y las
# herramientas de prueba. `dev` incluye pandas y tqdm, que necesita la comparación
# contra el script legacy de `referencias/`.
Invoke-Externo -Archivo $pythonVenv -Argumentos @('-m', 'pip', 'install', '--quiet', '-e', '.[pdf,excel,api,queue,dev]') `
    -Directorio $dirWorker -Descripcion 'Instalando dependencias del worker (tarda un poco)'
Write-Ok 'Dependencias del worker instaladas'

$envWorker = Join-Path $dirWorker '.env'
if (Test-Path $envWorker) {
    Write-Salto '.env del worker ya existe'
} else {
    Copy-Item (Join-Path $dirWorker '.env.example') $envWorker
    Write-Ok '.env del worker creado desde el ejemplo'
}

# --- 3. API NestJS ----------------------------------------------------------

Write-Titulo 'API pública (NestJS)'

$dirApi = Join-Path $raiz 'backend\api-backend'
$envApi = Join-Path $dirApi '.env'

Invoke-Externo -Archivo 'npm.cmd' -Argumentos @('install', '--no-fund', '--no-audit') `
    -Directorio $dirApi -Descripcion 'Instalando dependencias de la API (tarda un poco)'
Write-Ok 'Dependencias de la API instaladas'

Invoke-Externo -Archivo 'npm.cmd' -Argumentos @('run', 'prisma:generate') `
    -Directorio $dirApi -Descripcion 'Generando el cliente Prisma'
Write-Ok 'Cliente Prisma generado'

if (Test-Path $envApi) {
    Write-Salto '.env de la API ya existe (se completará lo que falte)'
} else {
    Copy-Item (Join-Path $dirApi '.env.example') $envApi
    Write-Ok '.env de la API creado desde el ejemplo'
}

# El secreto del fingerprint forma parte de la clave de idempotencia: no puede
# quedarse en el valor de ejemplo, tiene que ser propio de cada instalación.
$secreto = Get-ValorEnv -Archivo $envApi -Clave 'FINGERPRINT_SECRET'
if (-not $secreto -or $secreto -eq 'genera-una-clave-local-de-al-menos-32-caracteres') {
    Set-ValorEnv -Archivo $envApi -Clave 'FINGERPRINT_SECRET' -Valor (New-Credencial) -Sobrescribir | Out-Null
    Write-Ok 'Secreto de fingerprint generado'
} else {
    Write-Salto 'Ya tenías un secreto de fingerprint, se conserva'
}

Write-Titulo 'Base de datos (PostgreSQL)'

$postgresVivo = $null -ne (Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue)
if (-not $postgresVivo) {
    Write-Host '   ... PostgreSQL no responde; intentando levantarlo' -ForegroundColor DarkGray
    try {
        & (Join-Path $dirApi 'scripts\local-postgres.ps1') -Action start | Out-Null
        $postgresVivo = $null -ne (Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue)
    } catch {
        $postgresVivo = $false
    }
}

if (-not $postgresVivo) {
    Write-Host ''
    Write-Host 'No se pudo levantar PostgreSQL, y la aplicación no funciona sin él.' -ForegroundColor Red
    Write-Host 'Arráncalo y vuelve a ejecutar este script:' -ForegroundColor Red
    Write-Host '  docker compose up -d postgres' -ForegroundColor Red
    Write-Host '  backend\api-backend\scripts\local-postgres.ps1 -Action start   (sin Docker)' -ForegroundColor Red
    Write-Host ''
    exit 1
}
Write-Ok 'PostgreSQL responde en 127.0.0.1:5432'

Invoke-Externo -Archivo 'npm.cmd' -Argumentos @('run', 'prisma:deploy') `
    -Directorio $dirApi -Descripcion 'Aplicando migraciones'
Write-Ok 'Migraciones aplicadas'

# La semilla respeta a una persona que ya exista, así que reinstalar es seguro.
Write-Host '   ... Preparando la primera cuenta de acceso' -ForegroundColor DarkGray
$salidaSemilla = Join-Path $env:TEMP "eecc-semilla-$([guid]::NewGuid().ToString('N')).log"
$semilla = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'prisma:seed') `
    -WorkingDirectory $dirApi -NoNewWindow -Wait -PassThru `
    -RedirectStandardOutput $salidaSemilla -RedirectStandardError "$salidaSemilla.err"
if ($semilla.ExitCode -eq 0) {
    # UTF-8 explícito: sin decirlo, PowerShell 5.1 lo lee como ANSI y rompe los
    # acentos justo en el dato que hay que copiar.
    $script:AccesoSembrado = Get-Content -Path $salidaSemilla -Raw -Encoding utf8 -ErrorAction SilentlyContinue
    Write-Ok 'Cuenta de acceso lista'
} else {
    Write-Aviso 'La semilla falló. Ejecuta a mano: cd backend\api-backend; npm run prisma:seed'
}
Remove-Item -Path $salidaSemilla, "$salidaSemilla.err" -Force -ErrorAction SilentlyContinue

# El puerto del worker lo manda la API: si no coinciden, la subida falla con
# WORKER_UNAVAILABLE y cuesta diagnosticar. `ejecutar.ps1` lee este mismo valor.
$urlWorker = Get-ValorEnv -Archivo $envApi -Clave 'WORKER_BASE_URL'
if (-not $urlWorker) {
    $urlWorker = 'http://127.0.0.1:8000'
    Set-ValorEnv -Archivo $envApi -Clave 'WORKER_BASE_URL' -Valor $urlWorker | Out-Null
}
Write-Ok "El worker debe escuchar en $urlWorker"

# --- 5. Frontend ------------------------------------------------------------

Write-Titulo 'Frontend (React + Vite)'

$dirFront = Join-Path $raiz 'frontend'
$envFront = Join-Path $dirFront '.env.local'

Invoke-Externo -Archivo 'npm.cmd' -Argumentos @('install', '--no-fund', '--no-audit') `
    -Directorio $dirFront -Descripcion 'Instalando dependencias del frontend (tarda un poco)'
Write-Ok 'Dependencias del frontend instaladas'

if (Test-Path $envFront) {
    Write-Salto '.env.local del frontend ya existe'
} else {
    Copy-Item (Join-Path $dirFront '.env.example') $envFront
    Write-Ok '.env.local del frontend creado desde el ejemplo'
}

# --- Resumen ----------------------------------------------------------------

Write-Host ''
Write-Host '========================================================' -ForegroundColor Cyan
Write-Host ' Instalación terminada' -ForegroundColor Cyan
Write-Host '========================================================' -ForegroundColor Cyan
Write-Host ''
if ($script:AccesoSembrado) {
    Write-Host ' Entra en la aplicación con estos datos:' -ForegroundColor Yellow
    Write-Host ''
    foreach ($linea in ($script:AccesoSembrado -split "`n")) {
        if ($linea -match '^(organizaci|correo|contrase|La persona)') {
            Write-Host "   $($linea.Trim())" -ForegroundColor Yellow
        }
    }
    Write-Host ''
    Write-Host ' Guárdalos: la contraseña no vuelve a mostrarse.'
    Write-Host ' Las demás cuentas se crean desde la propia aplicación, en Personas.'
} else {
    Write-Host ' Crea la primera cuenta con:'
    Write-Host '   cd backend\api-backend; npm run prisma:seed'
}

Write-Host ''
Write-Host ' Siguiente paso:' -ForegroundColor Green
Write-Host '   .\ejecutar.ps1' -ForegroundColor Green
Write-Host ''

if ($script:Pasos -match '^aviso') {
    Write-Host ' Avisos:' -ForegroundColor Yellow
    $script:Pasos | Where-Object { $_ -match '^aviso' } | ForEach-Object {
        Write-Host "   - $($_ -replace '^aviso\s+', '')" -ForegroundColor Yellow
    }
    Write-Host ''
}
