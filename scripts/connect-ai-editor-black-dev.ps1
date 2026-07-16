[CmdletBinding()]
param(
	[ValidateSet('ready', 'login_required', 'account_unavailable', 'service_unavailable', 'password_change_required')]
	[string]$State = 'login_required',
	[string]$BlackRepository,
	[string]$DataRoot,
	[switch]$Stop,
	[switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'

$codeRepository = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$projectsRoot = Split-Path -Parent $codeRepository
$defaultGatewayCheckout = Join-Path $projectsRoot 'codex_proxy-gateway-dev'
$fallbackGatewayCheckout = Join-Path $projectsRoot 'codex_proxy-dev'
$requiredBlackCommit = '84ab6445bb4b557dc379815776bcd784f34676c1'

if ([string]::IsNullOrWhiteSpace($BlackRepository)) {
	$BlackRepository = if (Test-Path -LiteralPath $defaultGatewayCheckout) {
		$defaultGatewayCheckout
	} else {
		$fallbackGatewayCheckout
	}
}
$blackRepositoryPath = [System.IO.Path]::GetFullPath($BlackRepository).TrimEnd('\', '/')

function Assert-File {
	param([string]$Path, [string]$Name)

	if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
		throw "$Name is missing: $Path"
	}
}

function Get-ListenerProcessId {
	param([int]$Port)

	$listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
		Select-Object -First 1
	if ($listener) {
		return [int]$listener.OwningProcess
	}
	return $null
}

function Test-SharedProxy {
	try {
		$live = Invoke-RestMethod -Uri 'http://127.0.0.1:47892/live' -TimeoutSec 3
		$listenerProcessId = Get-ListenerProcessId -Port 47892
		return [pscustomobject]@{
			live = $live.status -eq 'ok'
			processId = $listenerProcessId
		}
	} catch {
		return [pscustomobject]@{
			live = $false
			processId = Get-ListenerProcessId -Port 47892
		}
	}
}

function Assert-BlackCheckout {
	if (-not (Test-Path -LiteralPath $blackRepositoryPath -PathType Container)) {
		throw "Black Gateway checkout is missing: $blackRepositoryPath"
	}

	$repositoryRoot = (& git -C $blackRepositoryPath rev-parse --show-toplevel 2>$null)
	if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($repositoryRoot)) {
		throw "Black Gateway path is not a Git checkout: $blackRepositoryPath"
	}
	$resolvedRepositoryRoot = [System.IO.Path]::GetFullPath($repositoryRoot).TrimEnd('\', '/')
	if (-not $resolvedRepositoryRoot.Equals($blackRepositoryPath, [System.StringComparison]::OrdinalIgnoreCase)) {
		throw "Black Gateway path must be the checkout root: $blackRepositoryPath"
	}

	& git -C $blackRepositoryPath merge-base --is-ancestor $requiredBlackCommit HEAD
	if ($LASTEXITCODE -ne 0) {
		throw "Black Gateway checkout must contain $requiredBlackCommit from feature/ai-editor-account-gateway."
	}

	$trackedChanges = @(& git -C $blackRepositoryPath status --porcelain --untracked-files=no)
	if ($LASTEXITCODE -ne 0 -or $trackedChanges.Count -gt 0) {
		throw 'Black Gateway checkout has tracked local changes; refusing to run integration services.'
	}
}

Assert-BlackCheckout

$startScript = Join-Path $blackRepositoryPath 'tools\start-ai-editor-dev.ps1'
$stopScript = Join-Path $blackRepositoryPath 'tools\stop-ai-editor-dev.ps1'
Assert-File -Path $startScript -Name 'Black isolated start script'
Assert-File -Path $stopScript -Name 'Black isolated stop script'

$allowedDataParent = [System.IO.Path]::GetFullPath((Join-Path $blackRepositoryPath '.ai-editor-dev')).TrimEnd('\', '/')
if ([string]::IsNullOrWhiteSpace($DataRoot)) {
	$DataRoot = Join-Path $allowedDataParent 'oscar-code'
}
$resolvedDataRoot = [System.IO.Path]::GetFullPath($DataRoot).TrimEnd('\', '/')
$allowedPrefix = $allowedDataParent + [System.IO.Path]::DirectorySeparatorChar
if (-not $resolvedDataRoot.StartsWith($allowedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
	throw "Black integration data root must stay under $allowedDataParent"
}

$nonceFile = Join-Path $resolvedDataRoot 'edge-local-nonce.secret'

if ($ValidateOnly) {
	[pscustomobject]@{
		valid = $true
		blackRepository = $blackRepositoryPath
		requiredCommit = $requiredBlackCommit
		dataRoot = $resolvedDataRoot
		gatewayOrigin = 'http://127.0.0.1:47920'
		edgeOrigin = 'http://127.0.0.1:47921'
		nonceFile = $nonceFile
	}
	exit 0
}

if ($Stop) {
	& powershell -NoProfile -ExecutionPolicy Bypass -File $stopScript -Mode all -DataRoot $resolvedDataRoot
	if ($LASTEXITCODE -ne 0) {
		throw "Black isolated stop script failed with exit code $LASTEXITCODE."
	}
	$shared = Test-SharedProxy
	Write-Host "[ai-editor-black-dev] Stopped only Black 47920/47921 services. Shared Proxy: live=$($shared.live) pid=$($shared.processId)."
	exit 0
}

$sharedBefore = Test-SharedProxy
Write-Host "[ai-editor-black-dev] Shared Proxy: live=$($sharedBefore.live) pid=$($sharedBefore.processId) (read-only check)."

$existingBlackPorts = New-Object 'System.Collections.Generic.List[int]'
foreach ($port in @(47920, 47921)) {
	$processId = Get-ListenerProcessId -Port $port
	if (-not $processId) {
		continue
	}
	$process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
	if (
		-not $process -or
		-not $process.CommandLine -or
		$process.CommandLine.IndexOf($blackRepositoryPath, [System.StringComparison]::OrdinalIgnoreCase) -lt 0
	) {
		throw "Port $port is occupied by non-Black PID $processId. Stop the Oscar Mock with start-ai-editor-account-dev.ps1 -Stop before continuing."
	}
	$existingBlackPorts.Add($port)
}

if ($existingBlackPorts.Count -eq 1) {
	throw 'Only one Black development service is running; stop the isolated stack before retrying.'
}
if ($existingBlackPorts.Count -eq 0) {
	& powershell -NoProfile -ExecutionPolicy Bypass -File $startScript -Mode all -DataRoot $resolvedDataRoot -MockState $State
	if ($LASTEXITCODE -ne 0) {
		throw "Black isolated start script failed with exit code $LASTEXITCODE."
	}
} else {
	Write-Host '[ai-editor-black-dev] Reusing the existing Black Gateway and Edge listeners.'
}

$gatewayLive = Invoke-RestMethod -Uri 'http://127.0.0.1:47920/live' -TimeoutSec 5
$edgeLive = Invoke-RestMethod -Uri 'http://127.0.0.1:47921/live' -TimeoutSec 5
if (
	$gatewayLive.status -ne 'ok' -or
	$gatewayLive.mode -ne 'gateway' -or
	$edgeLive.status -ne 'ok' -or
	$edgeLive.mode -ne 'edge'
) {
	throw 'Black isolated Gateway/Edge liveness response is invalid.'
}

Assert-File -Path $nonceFile -Name 'Black Edge local nonce file'
$nonce = [System.IO.File]::ReadAllText($nonceFile).Trim()
if (
	[Text.Encoding]::UTF8.GetByteCount($nonce) -lt 32 -or
	[Text.Encoding]::UTF8.GetByteCount($nonce) -gt 4096 -or
	$nonce.Contains("`r") -or
	$nonce.Contains("`n")
) {
	throw 'Black Edge local nonce file is malformed.'
}

$headers = @{ 'X-AI-Editor-Local-Nonce' = $nonce }
$stateBody = @{ state = $State } | ConvertTo-Json -Compress
Invoke-RestMethod `
	-Uri 'http://127.0.0.1:47921/ai-editor/mock/state' `
	-Method Post `
	-Headers $headers `
	-ContentType 'application/json' `
	-Body $stateBody `
	-TimeoutSec 5 | Out-Null
$status = Invoke-RestMethod `
	-Uri 'http://127.0.0.1:47921/ai-editor/status' `
	-Headers $headers `
	-TimeoutSec 5
$nonce = $null
$headers = $null

if ($status.state -ne $State) {
	throw "Black Edge state mismatch: expected $State, got $($status.state)."
}

$sharedAfter = Test-SharedProxy
if ($sharedBefore.processId -ne $sharedAfter.processId -or -not $sharedAfter.live) {
	throw 'Shared Proxy changed while starting the isolated Black stack.'
}

Write-Host "[ai-editor-black-dev] Gateway ready: http://127.0.0.1:47920"
Write-Host "[ai-editor-black-dev] Edge ready: http://127.0.0.1:47921 state=$State"
Write-Host "[ai-editor-black-dev] Code main-process nonce file: $nonceFile"
Write-Host '[ai-editor-black-dev] Before launching scripts\code.bat in this PowerShell, set:'
Write-Host "`$env:VSCODE_AI_EDITOR_ACCOUNT_EDGE_ORIGIN = 'http://127.0.0.1:47921'"
Write-Host "`$env:VSCODE_AI_EDITOR_ACCOUNT_GATEWAY_ORIGIN = 'http://127.0.0.1:47920'"
$escapedNonceFile = $nonceFile.Replace("'", "''")
Write-Host "`$env:VSCODE_AI_EDITOR_ACCOUNT_EDGE_NONCE_FILE = '$escapedNonceFile'"
