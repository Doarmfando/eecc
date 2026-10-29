# Renderiza el video promocional en local, sin subir nada a ningun sitio.
#
#   .\render.ps1                         # video base (texto animado, sin audio)
#   .\render.ps1 -Subtitulos -Voz        # con la voz de public\voz y subtitulos
#   .\render.ps1 -Voz -Musica -Contacto "wa.me/51900000000"
#   .\render.ps1 -Portada                # ademas, portada PNG para TikTok/Reels
#
# Salida: ..\out\video-promo\atlas-promo-9x16.mp4 (1080x1920, 30 fps, 50 s, H.264)

[CmdletBinding()]
param(
    [switch]$Subtitulos,
    [switch]$Voz,
    [ValidateSet('wav', 'mp3')]
    [string]$VozFormato = 'wav',
    [switch]$Musica,
    [string]$Contacto = '',
    [switch]$Portada
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$salida = Join-Path $PSScriptRoot '..\out\video-promo'
New-Item -ItemType Directory -Force -Path $salida | Out-Null
$salida = (Resolve-Path $salida).Path

if (-not (Test-Path 'node_modules')) {
    Write-Host 'Instalando dependencias de Remotion...'
    npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'npm install fallo' }
}

if ($Voz) {
    $guion = Get-Content -Raw -Encoding UTF8 'src\guion.json' | ConvertFrom-Json
    $faltan = @($guion.lineas | Where-Object { -not (Test-Path "public\voz\$($_.escena).$VozFormato") })
    if ($faltan.Count -gt 0) {
        $nombres = ($faltan | ForEach-Object { "$($_.escena).$VozFormato" }) -join ', '
        throw "Faltan audios en public\voz: $nombres. Generalos con .\scripts\generar-voz.ps1 o copia los tuyos."
    }
}
if ($Musica -and -not (Test-Path 'public\musica.mp3')) {
    throw 'Falta public\musica.mp3 (usa musica con licencia para uso comercial).'
}

$props = [ordered]@{
    subtitulos = [bool]$Subtitulos
    voz        = [bool]$Voz
    vozFormato = $VozFormato
    musica     = [bool]$Musica
}
# Sin -Contacto se queda el texto por defecto de PromoVideo.tsx.
if ($Contacto) { $props.contacto = $Contacto }
$propsFile = Join-Path $env:TEMP 'atlas-promo-props.json'
# Sin BOM: Remotion lee el JSON con Node.
[System.IO.File]::WriteAllText($propsFile, ($props | ConvertTo-Json), (New-Object System.Text.UTF8Encoding $false))

$video = Join-Path $salida 'atlas-promo-9x16.mp4'
npx remotion render src/index.ts PromoVertical "$video" "--props=$propsFile"
if ($LASTEXITCODE -ne 0) { throw 'El render fallo' }

if ($Portada) {
    $png = Join-Path $salida 'portada.png'
    npx remotion still src/index.ts PromoVertical "$png" --frame=1440 "--props=$propsFile"
    if ($LASTEXITCODE -ne 0) { throw 'La portada fallo' }
}

Write-Host ''
Write-Host "Listo: $video"
