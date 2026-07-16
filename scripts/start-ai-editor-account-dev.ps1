[CmdletBinding()]
param(
	[ValidateSet('ready', 'login_required', 'account_unavailable', 'service_unavailable', 'password_change_required')]
	[string]$State = 'login_required',
	[string]$DataRoot,
	[switch]$Stop
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$allowedDataRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot '.build\ai-editor-account-dev'))
$resolvedDataRoot = if ([string]::IsNullOrWhiteSpace($DataRoot)) {
	$allowedDataRoot
} else {
	[System.IO.Path]::GetFullPath($DataRoot)
}
$allowedPrefix = $allowedDataRoot.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
if ($resolvedDataRoot -ne $allowedDataRoot -and -not $resolvedDataRoot.StartsWith($allowedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
	throw "The account development data directory must stay within $allowedDataRoot"
}

$edgePort = 47921
$gatewayPort = 47920
$sharedPort = 47892
$mockScript = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'mock-ai-editor-edge.ts'))
$metadataPath = Join-Path $resolvedDataRoot 'mock-edge-process.json'
$stdoutPath = Join-Path $resolvedDataRoot 'mock-edge.stdout.log'
$stderrPath = Join-Path $resolvedDataRoot 'mock-edge.stderr.log'
$edgeLiveUrl = "http://127.0.0.1:$edgePort/live"

function Get-ListenerProcessId {
	param([int]$Port)

	$listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
		Select-Object -First 1
	if ($listener) {
		return [int]$listener.OwningProcess
	}
	return $null
}

function Test-HttpLive {
	param([string]$Url)

	try {
		$response = Invoke-RestMethod -Uri $Url -TimeoutSec 2
		return $response.status -eq 'ok'
	} catch {
		return $false
	}
}

function Test-IsMockProcess {
	param([int]$ProcessId)

	$process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
	return $process -and $process.CommandLine -and
		$process.CommandLine.IndexOf($mockScript, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
}

function Set-MockState {
	param([string]$AccountState)

	$body = @{ state = $AccountState } | ConvertTo-Json -Compress
	Invoke-RestMethod `
		-Uri "http://127.0.0.1:$edgePort/__mock/state" `
		-Method Post `
		-ContentType 'application/json' `
		-Body $body `
		-TimeoutSec 3 | Out-Null
}

if ($Stop) {
	if (-not (Test-Path -LiteralPath $metadataPath)) {
		Write-Host '[ai-editor-account-dev] No managed mock Edge process is recorded.'
		exit 0
	}

	$metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
	$processId = [int]$metadata.pid
	$listenerProcessId = Get-ListenerProcessId -Port $edgePort
	if ($listenerProcessId -ne $processId -or -not (Test-IsMockProcess -ProcessId $processId)) {
		throw "Refusing to stop PID $processId because it is not the managed mock Edge listener on port $edgePort."
	}

	Stop-Process -Id $processId
	Remove-Item -LiteralPath $metadataPath -Force
	Write-Host "[ai-editor-account-dev] Stopped mock Edge PID $processId. Shared Proxy $sharedPort was not touched."
	exit 0
}

New-Item -ItemType Directory -Path $resolvedDataRoot -Force | Out-Null

$sharedLive = Test-HttpLive -Url "http://127.0.0.1:$sharedPort/live"
$sharedProcessId = Get-ListenerProcessId -Port $sharedPort
Write-Host "[ai-editor-account-dev] Shared Proxy: live=$sharedLive pid=$sharedProcessId (read-only check)."

$gatewayProcessId = Get-ListenerProcessId -Port $gatewayPort
if ($gatewayProcessId) {
	Write-Host "[ai-editor-account-dev] Gateway port $gatewayPort is already in use by PID $gatewayProcessId; it will not be modified."
}

$edgeProcessId = Get-ListenerProcessId -Port $edgePort
if ($edgeProcessId) {
	if (-not (Test-IsMockProcess -ProcessId $edgeProcessId)) {
		throw "Port $edgePort is already used by non-mock PID $edgeProcessId."
	}
	Set-MockState -AccountState $State
	Write-Host "[ai-editor-account-dev] Reused mock Edge PID $edgeProcessId and changed state to $State."
	exit 0
}

$node = Get-Command node -ErrorAction Stop
$arguments = @(
	"`"$mockScript`"",
	'--host', '127.0.0.1',
	'--port', $edgePort,
	'--state', $State
)
$process = Start-Process `
	-FilePath $node.Source `
	-ArgumentList $arguments `
	-WorkingDirectory $repoRoot `
	-RedirectStandardOutput $stdoutPath `
	-RedirectStandardError $stderrPath `
	-WindowStyle Hidden `
	-PassThru

@{
	pid = $process.Id
	port = $edgePort
	script = $mockScript
	startedAt = (Get-Date).ToUniversalTime().ToString('o')
} | ConvertTo-Json | Set-Content -LiteralPath $metadataPath -Encoding utf8

$deadline = (Get-Date).AddSeconds(15)
do {
	if (Test-HttpLive -Url $edgeLiveUrl) {
		Write-Host "[ai-editor-account-dev] Mock Edge ready at http://127.0.0.1:$edgePort with state=$State (PID $($process.Id))."
		Write-Host "[ai-editor-account-dev] Management mock: http://127.0.0.1:$edgePort/management"
		Write-Host "[ai-editor-account-dev] Stop with: powershell -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Stop"
		exit 0
	}
	if ($process.HasExited) {
		$errorTail = if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath -Tail 20 } else { @() }
		throw "Mock Edge exited with code $($process.ExitCode). $($errorTail -join ' ')"
	}
	Start-Sleep -Milliseconds 250
	$process.Refresh()
} while ((Get-Date) -lt $deadline)

throw "Timed out waiting for mock Edge. Check $stderrPath"
