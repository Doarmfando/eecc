$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonExecutable = Join-Path $projectRoot ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $pythonExecutable -PathType Leaf)) {
    throw "No existe .venv. Ejecuta primero: py -3 -m venv .venv"
}

Push-Location $projectRoot
try {
    & $pythonExecutable -m pytest --cov=statement_worker --cov-report=term-missing
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    & $pythonExecutable -m ruff check src tests
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    & $pythonExecutable -m ruff format --check src tests
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    & $pythonExecutable -m mypy src
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
    Pop-Location
}
