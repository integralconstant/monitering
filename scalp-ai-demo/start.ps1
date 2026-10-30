param([int]$Port = 8000)
$ErrorActionPreference = 'Stop'
Push-Location -LiteralPath $PSScriptRoot
try {
    if (-not (Test-Path -LiteralPath '.venv\Scripts\python.exe')) {
        throw '먼저 powershell -ExecutionPolicy Bypass -File .\setup.ps1 을 실행하세요.'
    }
    & '.\.venv\Scripts\python.exe' server.py --port $Port
    if ($LASTEXITCODE -ne 0) { throw '서버 실행에 실패했습니다. 위 오류를 확인하세요.' }
} finally { Pop-Location }
