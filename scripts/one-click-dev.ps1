param(
    [string]$BackendHost = "127.0.0.1",
    [int]$BackendPort = 8000,
    [string]$FrontendHost = "0.0.0.0",
    [int]$FrontendPort = 5173
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = (Resolve-Path (Join-Path $ScriptDir "..")).Path
$FrontendDir = Join-Path $RootDir "frontend"

function Import-DotEnv {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        return
    }

    foreach ($RawLine in Get-Content $Path) {
        $Line = $RawLine.Trim()
        if (-not $Line -or $Line.StartsWith("#")) {
            continue
        }

        if ($Line.StartsWith("export ")) {
            $Line = $Line.Substring(7).Trim()
        }

        $SeparatorIndex = $Line.IndexOf("=")
        if ($SeparatorIndex -lt 1) {
            continue
        }

        $Name = $Line.Substring(0, $SeparatorIndex).Trim()
        $Value = $Line.Substring($SeparatorIndex + 1).Trim()

        if (
            ($Value.StartsWith('"') -and $Value.EndsWith('"')) -or
            ($Value.StartsWith("'") -and $Value.EndsWith("'"))
        ) {
            $Value = $Value.Substring(1, $Value.Length - 2)
        }

        [Environment]::SetEnvironmentVariable($Name, $Value, "Process")
    }
}

function Resolve-RequiredCommand {
    param([string]$Name)

    $Command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $Command) {
        throw "$Name is required and was not found on PATH."
    }
    return $Command.Source
}

Set-Location $RootDir
Import-DotEnv (Join-Path $RootDir ".env")

$Uv = Resolve-RequiredCommand "uv"
$Npm = Resolve-RequiredCommand "npm"

Write-Host "Syncing backend dependencies with uv..."
& $Uv sync

Write-Host "Installing frontend dependencies with npm..."
Push-Location $FrontendDir
try {
    & $Npm install
}
finally {
    Pop-Location
}

$BackendArgs = @(
    "run",
    "uvicorn",
    "whisperx_ui_backend.app:app",
    "--app-dir",
    "backend",
    "--reload",
    "--reload-dir",
    "backend",
    "--reload-dir",
    "tests",
    "--host",
    $BackendHost,
    "--port",
    "$BackendPort"
)

$FrontendArgs = @(
    "run",
    "dev",
    "--",
    "--host",
    $FrontendHost,
    "--port",
    "$FrontendPort"
)

Write-Host "Starting backend on http://$BackendHost`:$BackendPort"
$BackendProcess = Start-Process -FilePath $Uv -ArgumentList $BackendArgs -WorkingDirectory $RootDir -NoNewWindow -PassThru

Write-Host "Starting frontend on http://127.0.0.1`:$FrontendPort"
$FrontendProcess = Start-Process -FilePath $Npm -ArgumentList $FrontendArgs -WorkingDirectory $FrontendDir -NoNewWindow -PassThru

Write-Host "Press Ctrl+C to stop both dev servers."

try {
    while (-not $BackendProcess.HasExited -and -not $FrontendProcess.HasExited) {
        Start-Sleep -Seconds 1
        $BackendProcess.Refresh()
        $FrontendProcess.Refresh()
    }
}
finally {
    foreach ($Process in @($BackendProcess, $FrontendProcess)) {
        if ($Process -and -not $Process.HasExited) {
            Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
        }
    }
}
