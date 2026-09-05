<#
.SYNOPSIS
    Levanta un PostgreSQL local sin Docker ni permisos de administrador.

.DESCRIPTION
    La infraestructura oficial del proyecto es Docker Compose (ver `docker-compose.yml`
    en la raíz). Este script es la alternativa para equipos donde Docker no puede
    arrancar, por ejemplo sin virtualización habilitada en la BIOS o sin WSL.

    Descarga los binarios oficiales de PostgreSQL, crea un cluster en `.local/postgres`
    (ignorado por Git) y lo arranca escuchando solo en 127.0.0.1.

    No sustituye a Docker en despliegue: sirve únicamente para desarrollo y pruebas.

.EXAMPLE
    .\scripts\local-postgres.ps1 -Action start
    .\scripts\local-postgres.ps1 -Action status
    .\scripts\local-postgres.ps1 -Action stop
#>
[CmdletBinding()]
param(
    [ValidateSet('start', 'stop', 'status', 'destroy')]
    [string]$Action = 'start',

    [string]$InstallRoot = (Join-Path (Split-Path -Parent $PSScriptRoot) '.local/postgres'),
    [string]$Version = '17.6-1',
    [int]$Port = 5432,
    [string]$User = 'eecc',
    [string]$Database = 'eecc',
    [string]$Password = 'eecc-local-dev'
)

$ErrorActionPreference = 'Stop'

$binaries = Join-Path $InstallRoot 'pgsql/bin'
$dataDir = Join-Path $InstallRoot 'data'
$logFile = Join-Path $InstallRoot 'server.log'

function Invoke-Pg {
    param([string]$Executable, [string[]]$Arguments)
    $path = Join-Path $binaries $Executable
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Falta $Executable. Ejecuta primero: .\scripts\local-postgres.ps1 -Action start"
    }
    & $path @Arguments
}

function Install-Binaries {
    if (Test-Path -LiteralPath $binaries) {
        return
    }
    $url = "https://get.enterprisedb.com/postgresql/postgresql-$Version-windows-x64-binaries.zip"
    $zip = Join-Path $InstallRoot 'postgresql.zip'

    New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
    Write-Host "Descargando PostgreSQL $Version (una sola vez)..."
    Invoke-WebRequest -Uri $url -OutFile $zip
    Expand-Archive -Path $zip -DestinationPath $InstallRoot -Force
    Remove-Item -LiteralPath $zip -Force
}

function Initialize-Cluster {
    if (Test-Path -LiteralPath $dataDir) {
        return
    }
    $passwordFile = Join-Path $InstallRoot 'password.txt'
    Set-Content -LiteralPath $passwordFile -Value $Password -Encoding ascii -NoNewline
    try {
        Write-Host 'Creando el cluster local...'
        Invoke-Pg 'initdb.exe' @(
            '-D', $dataDir,
            '-U', $User,
            "--pwfile=$passwordFile",
            '--auth-host=scram-sha-256',
            '--auth-local=trust',
            '-E', 'UTF8',
            '--locale=C'
        ) | Out-Null
    }
    finally {
        Remove-Item -LiteralPath $passwordFile -Force -ErrorAction SilentlyContinue
    }
}

function Test-Running {
    try {
        Invoke-Pg 'pg_isready.exe' @('-h', '127.0.0.1', '-p', "$Port") | Out-Null
        return $LASTEXITCODE -eq 0
    }
    catch {
        return $false
    }
}

switch ($Action) {
    'start' {
        Install-Binaries
        Initialize-Cluster

        if (Test-Running) {
            Write-Host "Ya hay un servidor escuchando en 127.0.0.1:$Port"
        }
        else {
            Invoke-Pg 'pg_ctl.exe' @('-D', $dataDir, '-l', $logFile, '-o', "-p $Port -h 127.0.0.1", '-w', 'start')
        }

        # `-w` evita que psql/createdb abran un prompt de contraseña y cuelguen el script.
        $env:PGPASSWORD = $Password
        try {
            $exists = Invoke-Pg 'psql.exe' @(
                '-w', '-h', '127.0.0.1', '-p', "$Port", '-U', $User, '-d', 'postgres', '-tAc',
                "select 1 from pg_database where datname = '$Database'"
            )
            if (-not $exists) {
                Invoke-Pg 'createdb.exe' @('-w', '-h', '127.0.0.1', '-p', "$Port", '-U', $User, $Database)
                Write-Host "Base '$Database' creada."
            }
        }
        finally {
            $env:PGPASSWORD = $null
        }

        Write-Host ''
        Write-Host 'Listo. Usa esta cadena en tu .env:'
        Write-Host "DATABASE_URL=postgresql://${User}:${Password}@127.0.0.1:${Port}/${Database}"
        Write-Host ''
        Write-Host 'Después: npm run prisma:migrate && npm run prisma:seed'
    }
    'stop' {
        if (Test-Path -LiteralPath $dataDir) {
            Invoke-Pg 'pg_ctl.exe' @('-D', $dataDir, '-m', 'fast', '-w', 'stop')
        }
        else {
            Write-Host 'No hay cluster local que detener.'
        }
    }
    'status' {
        if (Test-Running) {
            Write-Host "PostgreSQL responde en 127.0.0.1:$Port"
        }
        else {
            Write-Host "Sin respuesta en 127.0.0.1:$Port"
        }
    }
    'destroy' {
        if (Test-Running) {
            Invoke-Pg 'pg_ctl.exe' @('-D', $dataDir, '-m', 'fast', '-w', 'stop')
        }
        Remove-Item -LiteralPath $InstallRoot -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host 'Cluster local eliminado.'
    }
}
