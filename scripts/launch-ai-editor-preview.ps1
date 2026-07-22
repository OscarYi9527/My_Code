[CmdletBinding()]
param(
	[Parameter(Mandatory = $false)]
	[string]$GatewayOrigin = $env:AI_EDITOR_VERIFY_GATEWAY_ORIGIN,
	[string]$EdgeOutboundProxy = $env:AI_EDITOR_VERIFY_EDGE_OUTBOUND_PROXY,
	[string]$ProxyRepository,
	[string]$EdgeDataRoot,
	[string]$UserDataDir,
	[string]$ExtensionsDir,
	[string]$SharedDataDir,
	[string]$Workspace,
	[switch]$RestartEdge
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$repositoryParent = Split-Path -Parent $repositoryRoot
if ([string]::IsNullOrWhiteSpace($ProxyRepository)) {
	$ProxyRepository = Join-Path $repositoryParent 'codex_proxy-provider-worker'
}
if ([string]::IsNullOrWhiteSpace($EdgeDataRoot)) {
	$EdgeDataRoot = Join-Path $ProxyRepository '.ai-editor-dev\public-preview-client'
}
if ([string]::IsNullOrWhiteSpace($UserDataDir)) {
	$UserDataDir = Join-Path $repositoryRoot '.manual-preview-user-data'
}
if ([string]::IsNullOrWhiteSpace($ExtensionsDir)) {
	$ExtensionsDir = Join-Path $repositoryRoot '.manual-preview-extensions'
}
if ([string]::IsNullOrWhiteSpace($SharedDataDir)) {
	$SharedDataDir = Join-Path $repositoryRoot '.manual-preview-shared'
}
if ([string]::IsNullOrWhiteSpace($Workspace)) {
	$Workspace = $repositoryRoot
}

foreach ($name in @('ProxyRepository', 'EdgeDataRoot', 'UserDataDir', 'ExtensionsDir', 'SharedDataDir', 'Workspace')) {
	Set-Variable -Name $name -Value ([IO.Path]::GetFullPath((Get-Variable -Name $name -ValueOnly)))
}
if ([string]::IsNullOrWhiteSpace($GatewayOrigin)) {
	throw 'GatewayOrigin is required. Set AI_EDITOR_VERIFY_GATEWAY_ORIGIN or pass -GatewayOrigin.'
}
try {
	$gatewayUri = [Uri]::new($GatewayOrigin, [UriKind]::Absolute)
} catch {
	throw 'GatewayOrigin must be an absolute HTTPS origin.'
}
if (
	$gatewayUri.Scheme -ne 'https' -or
	[string]::IsNullOrWhiteSpace($gatewayUri.Host) -or
	-not [string]::IsNullOrEmpty($gatewayUri.UserInfo) -or
	-not [string]::IsNullOrEmpty($gatewayUri.Query) -or
	-not [string]::IsNullOrEmpty($gatewayUri.Fragment) -or
	$gatewayUri.AbsolutePath -ne '/'
) {
	throw 'GatewayOrigin must be an HTTPS origin without credentials, path, query, or fragment.'
}
$GatewayOrigin = $gatewayUri.GetLeftPart([UriPartial]::Authority)

$startScript = Join-Path $ProxyRepository 'tools\start-ai-editor-dev.ps1'
$stopScript = Join-Path $ProxyRepository 'tools\stop-ai-editor-dev.ps1'
$codeLauncher = Join-Path $repositoryRoot 'scripts\code.bat'
foreach ($path in @($startScript, $stopScript, $codeLauncher)) {
	if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
		throw "Required file is missing: $path"
	}
}

function Get-ListenerProcessId([int]$Port) {
	$listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
		Select-Object -First 1
	if ($listener) {
		return [int]$listener.OwningProcess
	}
	return $null
}

function Assert-ExistingEdgeBelongsToRepository([int]$ProcessId) {
	$process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
	if (
		-not $process -or
		-not $process.CommandLine -or
		$process.CommandLine.IndexOf($ProxyRepository, [StringComparison]::OrdinalIgnoreCase) -lt 0
	) {
		throw "Port 47921 is occupied by an unrelated process (PID $ProcessId); refusing to stop or reuse it."
	}
}

function Test-PublicGateway {
	$parameters = @{
		UseBasicParsing = $true
		Uri = "$GatewayOrigin/live"
		TimeoutSec = 15
	}
	if (-not [string]::IsNullOrWhiteSpace($EdgeOutboundProxy)) {
		$parameters.Proxy = $EdgeOutboundProxy
		$parameters.ProxyUseDefaultCredentials = $false
	}
	try {
		$response = Invoke-WebRequest @parameters
		if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
			throw "HTTP $($response.StatusCode)"
		}
		$body = $response.Content | ConvertFrom-Json
		if ($body.status -ne 'ok' -or $body.mode -ne 'gateway') {
			throw 'The endpoint did not identify itself as a healthy Gateway.'
		}
	} catch {
		$statusCode = $null
		if ($_.Exception.Response) {
			$statusCode = $_.Exception.Response.StatusCode.value__
		}
		if ($statusCode -eq 530) {
			throw "GatewayOrigin returned Cloudflare HTTP 530 (Error 1016). The Quick Tunnel has expired or cloudflared is offline; start a new tunnel and rerun this script with its new HTTPS origin."
		}
		if ($statusCode) {
			throw "GatewayOrigin is unavailable (HTTP $statusCode). Start or repair the Gateway and rerun this script."
		}
		throw "GatewayOrigin is unreachable: $($_.Exception.Message)"
	}
}

Test-PublicGateway

$edgeProcessId = Get-ListenerProcessId 47921
if ($edgeProcessId) {
	Assert-ExistingEdgeBelongsToRepository $edgeProcessId
	$runtimeConfigPath = Join-Path $EdgeDataRoot 'edge-runtime-config.json'
	$needsRestart = $RestartEdge
	if (-not $needsRestart -and (Test-Path -LiteralPath $runtimeConfigPath -PathType Leaf)) {
		try {
			$runtimeConfig = Get-Content -LiteralPath $runtimeConfigPath -Raw -Encoding utf8 | ConvertFrom-Json
			$needsRestart =
				$runtimeConfig.gatewayOrigin -ne $GatewayOrigin -or
				$runtimeConfig.edgeOutboundProxy -ne $EdgeOutboundProxy
		} catch {
			$needsRestart = $true
		}
	} elseif (-not $needsRestart) {
		$needsRestart = $true
	}
	if ($needsRestart) {
		Write-Host "[ai-editor-preview] Restarting repository-owned Edge PID $edgeProcessId to apply the current Gateway/proxy configuration."
		& powershell -NoProfile -ExecutionPolicy Bypass -File $stopScript -Mode edge -DataRoot $EdgeDataRoot
		if ($LASTEXITCODE -ne 0) {
			throw "Preview Edge stop failed with exit code $LASTEXITCODE."
		}
		$edgeProcessId = $null
	} else {
		Write-Host "[ai-editor-preview] Reusing repository-owned Edge PID $edgeProcessId."
	}
}
if (-not $edgeProcessId) {
	$startArguments = @(
		'-Mode', 'edge',
		'-AuthenticationMode', 'real',
		'-GatewayOrigin', $GatewayOrigin,
		'-EdgeOutboundProxy', $EdgeOutboundProxy,
		'-DataRoot', $EdgeDataRoot
	)
	& powershell -NoProfile -ExecutionPolicy Bypass -File $startScript @startArguments
	if ($LASTEXITCODE -ne 0) {
		throw "Preview Edge start failed with exit code $LASTEXITCODE."
	}
}

$nonceFile = Join-Path $EdgeDataRoot 'edge-local-nonce.secret'
if (-not (Test-Path -LiteralPath $nonceFile -PathType Leaf)) {
	throw "Preview Edge nonce file is missing: $nonceFile"
}
$nonce = [IO.File]::ReadAllText($nonceFile).Trim()
try {
	$status = Invoke-RestMethod `
		-Uri 'http://127.0.0.1:47921/ai-editor/status' `
		-Headers @{ 'X-AI-Editor-Local-Nonce' = $nonce } `
		-TimeoutSec 10
} catch {
	$statusCode = $null
	if ($_.Exception.Response) {
		$statusCode = $_.Exception.Response.StatusCode.value__
	}
	if ($statusCode -eq 530) {
		throw "Edge cannot reach GatewayOrigin (Cloudflare HTTP 530 / Error 1016). Start a new Quick Tunnel and rerun this script."
	}
	$statusSuffix = if ($statusCode) { " with HTTP $statusCode" } else { '' }
	throw "Edge account status check failed$statusSuffix`: $($_.Exception.Message)"
} finally {
	$nonce = $null
}
if ($status.state -notin @('ready', 'login_required', 'account_unavailable', 'service_unavailable', 'password_change_required')) {
	throw "Preview Edge returned an unsupported account state: $($status.state)"
}

$environmentNames = @(
	'VSCODE_AI_EDITOR_ACCOUNT_EDGE_ORIGIN',
	'VSCODE_AI_EDITOR_ACCOUNT_GATEWAY_ORIGIN',
	'VSCODE_AI_EDITOR_ACCOUNT_EDGE_NONCE_FILE',
	'VSCODE_AGENT_HOST_CODEX_PROXY_MODE',
	'VSCODE_AGENT_HOST_CODEX_PROXY_BASE_URL'
)
$environmentValues = @{
	VSCODE_AI_EDITOR_ACCOUNT_EDGE_ORIGIN = 'http://127.0.0.1:47921'
	VSCODE_AI_EDITOR_ACCOUNT_GATEWAY_ORIGIN = $GatewayOrigin
	VSCODE_AI_EDITOR_ACCOUNT_EDGE_NONCE_FILE = $nonceFile
	VSCODE_AGENT_HOST_CODEX_PROXY_MODE = 'external-local-proxy'
	VSCODE_AGENT_HOST_CODEX_PROXY_BASE_URL = 'http://127.0.0.1:47921'
}
$previousEnvironment = @{}
try {
	foreach ($name in $environmentNames) {
		$previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
		[Environment]::SetEnvironmentVariable($name, $environmentValues[$name], 'Process')
	}
	Write-Host "[ai-editor-preview] Edge: http://127.0.0.1:47921 -> $GatewayOrigin"
	Write-Host "[ai-editor-preview] Account state: $($status.state)"
	Write-Host '[ai-editor-preview] Launching the development Code build. The isolated Edge stays running after Code exits.'
	& $codeLauncher `
		--user-data-dir $UserDataDir `
		--extensions-dir $ExtensionsDir `
		--shared-data-dir $SharedDataDir `
		$Workspace
} finally {
	foreach ($name in $environmentNames) {
		[Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process')
	}
}
