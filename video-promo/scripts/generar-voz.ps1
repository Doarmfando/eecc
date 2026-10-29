# Genera una voz en off PROVISIONAL con el sintetizador de Windows, sin conexion
# ni servicios externos: un WAV por linea de src\guion.json en public\voz\.
#
#   .\scripts\generar-voz.ps1                 # elige la primera voz en espanol
#   .\scripts\generar-voz.ps1 -Voz "Microsoft Sabina Desktop" -Velocidad 1
#
# Sirve para cuadrar tiempos. Para la version final graba tu voz o usa un TTS
# profesional y guarda los archivos con los mismos nombres (gancho.wav, paso1.wav...).

[CmdletBinding()]
param(
    [string]$Voz = '',
    [ValidateRange(-10, 10)]
    [int]$Velocidad = 1
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech

$raiz = Split-Path -Parent $PSScriptRoot
$guion = Get-Content -Raw -Encoding UTF8 (Join-Path $raiz 'src\guion.json') | ConvertFrom-Json
$destino = Join-Path $raiz 'public\voz'
New-Item -ItemType Directory -Force -Path $destino | Out-Null

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$instaladas = $synth.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo }

if ($Voz) {
    $synth.SelectVoice($Voz)
} else {
    $es = $instaladas | Where-Object { $_.Culture.Name -like 'es-*' } | Select-Object -First 1
    if ($es) {
        $synth.SelectVoice($es.Name)
    } else {
        Write-Warning 'No hay voces en espanol instaladas (Configuracion > Hora e idioma > Voz). Se usa la voz por defecto.'
    }
}
$synth.Rate = $Velocidad
Write-Host "Voz: $($synth.Voice.Name)"

# 44,1 kHz, 16 bits, mono: 88 200 bytes por segundo.
$formato = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(44100, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)

foreach ($linea in $guion.lineas) {
    $archivo = Join-Path $destino "$($linea.escena).wav"
    $synth.SetOutputToWaveFile($archivo, $formato)
    $synth.Speak($linea.texto)
    $synth.SetOutputToNull()

    $duracion = ((Get-Item $archivo).Length - 44) / 88200
    $hueco = $linea.hasta - $linea.desde
    $estado = if ($duracion -le $hueco) { 'OK' } else { 'LARGA: sube -Velocidad o acorta el texto' }
    Write-Host ("{0,-8} {1,5:N1} s de {2,4:N1} s  {3}" -f $linea.escena, $duracion, $hueco, $estado)
}

$synth.Dispose()
Write-Host "WAV en $destino. Renderiza con: .\render.ps1 -Voz -Subtitulos"
