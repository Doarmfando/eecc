#Requires -Version 5.1
<#
.SYNOPSIS
    Deja el proyecto listo para ejecutarse: dependencias y archivos `.env`.

.DESCRIPTION
    Instala las tres partes (worker Python, API NestJS y frontend) y prepara la
    configuración local. Es idempotente: volver a ejecutarlo no reinstala lo que ya
    está ni pisa un `.env` existente, solo completa lo que falte.

    Nunca sobrescribe un valor que ya escribiste. Si tu `.env` tiene un puerto o una
    credencial propios, se conservan.

.PARAMETER Modo
    'memoria' (por defecto) configura la API para no guardar nada: sin PostgreSQL y
    sin escribir en disco. 'base-de-datos' deja la configuración del producto, que
    necesita PostgreSQL levantado y migraciones aplicadas.

.PARAMETER Rehacer
    Borra y recrea el entorno virtual de Python. Úsalo si quedó a medias.

.EXAMPLE
    .\instalar.ps1
    Instala todo y configura el modo sin persistencia.

.EXAMPLE
    .\instalar.ps1 -Modo base-de-datos
    Instala todo dejando la configuración con PostgreSQL.
#>
[CmdletBinding()]
param(
    [ValidateSet('memoria', 'base-de-datos')]
    [string]$Modo = 'memoria',

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

# Credencial con el formato que exige la API: 32-128 caracteres de [A-Za-z0-9._-].
function New-Credencial {
    $alfabeto = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    $bytes = New-Object 'byte[]' 48
    $generador = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generador.GetBytes($bytes) } finally { $generador.Dispose() }

    $texto = -join ($bytes | ForEach-Object { $alfabeto[$_ % $alfabeto.Length] })
    return "eecc-$texto"
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

# `PrismaClient` se importa aunque la persistencia esté apagada, así que el cliente
# tiene que estar generado incluso en modo memoria.
Invoke-Externo -Archivo 'npm.cmd' -Argumentos @('run', 'prisma:generate') `
    -Directorio $dirApi -Descripcion 'Generando el cliente Prisma'
Write-Ok 'Cliente Prisma generado'

if (Test-Path $envApi) {
    Write-Salto '.env de la API ya existe (se completará lo que falte)'
} else {
    Copy-Item (Join-Path $dirApi '.env.example') $envApi
    Write-Ok '.env de la API creado desde el ejemplo'
}

$credencial = Get-ValorEnv -Archivo $envApi -Clave 'EPHEMERAL_API_KEY'
$plantilla = 'genera-una-credencial-local-de-al-menos-32-caracteres'
if (-not $credencial -or $credencial -eq $plantilla) {
    $credencial = New-Credencial
    Set-ValorEnv -Archivo $envApi -Clave 'EPHEMERAL_API_KEY' -Valor $credencial -Sobrescribir | Out-Null
    Write-Ok 'Credencial de servicio generada'
} else {
    Write-Salto 'Ya tenías una credencial configurada, se conserva'
}

if ($Modo -eq 'memoria') {
    Set-ValorEnv -Archivo $envApi -Clave 'PERSISTENCE_MODE' -Valor 'memory' -Sobrescribir | Out-Null
    Write-Ok 'Modo sin persistencia activado (PERSISTENCE_MODE=memory)'
} else {
    Set-ValorEnv -Archivo $envApi -Clave 'PERSISTENCE_MODE' -Valor 'database' -Sobrescribir | Out-Null
    Write-Ok 'Modo con base de datos activado (PERSISTENCE_MODE=database)'

    # Con base de datos hacen falta las tablas y una primera persona: sin eso no hay
    # forma de entrar, porque este producto no tiene registro abierto.
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

    if ($postgresVivo) {
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
            $script:AccesoSembrado = Get-Content -Path $salidaSemilla -Raw -Encoding utf8 -ErrorAction SilentlyContinue
            Write-Ok 'Cuenta de acceso lista'
        } else {
            Write-Aviso 'La semilla falló. Ejecuta a mano: cd backend\api-backend; npm run prisma:seed'
        }
        Remove-Item -Path $salidaSemilla, "$salidaSemilla.err" -Force -ErrorAction SilentlyContinue
    } else {
        Write-Aviso 'No se pudo levantar PostgreSQL. Arráncalo y ejecuta: cd backend\api-backend; npm run prisma:deploy; npm run prisma:seed'
    }
}

# El puerto del worker lo manda la API: si no coinciden, la subida falla con
# WORKER_UNAVAILABLE y cuesta diagnosticar. `ejecutar.ps1` lee este mismo valor.
$urlWorker = Get-ValorEnv -Archivo $envApi -Clave 'WORKER_BASE_URL'
if (-not $urlWorker) {
    $urlWorker = 'http://127.0.0.1:8000'
    Set-ValorEnv -Archivo $envApi -Clave 'WORKER_BASE_URL' -Valor $urlWorker | Out-Null
}
Write-Ok "El worker debe escuchar en $urlWorker"

# --- 4. Frontend ------------------------------------------------------------

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
Write-Host " Modo configurado : $Modo"
Write-Host ''

if ($Modo -eq 'base-de-datos') {
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
        Write-Host ' Cada persona entra con su usuario y contraseña.'
        Write-Host ' Crea la primera con: cd backend\api-backend; npm run prisma:seed'
    }
} else {
    Write-Host " Credencial       : $credencial" -ForegroundColor Yellow
    Write-Host ''
    Write-Host ' En modo memoria no hay usuarios: se entra con esa credencial, guardada'
    Write-Host ' en backend\api-backend\.env por si la pierdes.'
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
