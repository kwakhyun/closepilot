param([string]$PackagePath = '../fixtures/closed-package.json')
$ErrorActionPreference = 'Stop'
$verifierRoot = Join-Path $PSScriptRoot '../verifier'
$savedJavaHome = $env:JAVA_HOME
$savedBuildDir = $env:CLOSEPILOT_VERIFIER_BUILD_DIR
try {
    if (-not $env:JAVA_HOME) {
        $portableRoot = Join-Path $PSScriptRoot '../.tools/jdk21'
        if (Test-Path -LiteralPath $portableRoot) {
            $portableJdk = Get-ChildItem -LiteralPath $portableRoot -Directory | Select-Object -First 1
            if ($portableJdk) { $env:JAVA_HOME = $portableJdk.FullName }
        }
    }
    if (-not $env:JAVA_HOME) { throw 'Install JDK 21 and set JAVA_HOME before running the verifier.' }
    if ((Resolve-Path -LiteralPath $verifierRoot).Path -match '[^\x00-\x7F]') {
        $env:CLOSEPILOT_VERIFIER_BUILD_DIR = Join-Path $env:TEMP ('closepilot-verifier-' + [guid]::NewGuid().ToString('N'))
        Write-Output 'Using an isolated temporary build directory for Windows path compatibility.'
    }
    Push-Location -LiteralPath $verifierRoot
    try {
        & ./gradlew.bat test run "--args=$PackagePath" --console=plain
        if ($LASTEXITCODE -ne 0) { throw 'Kotlin verification failed.' }
    } finally { Pop-Location }
} finally {
    $env:JAVA_HOME = $savedJavaHome
    $env:CLOSEPILOT_VERIFIER_BUILD_DIR = $savedBuildDir
}
