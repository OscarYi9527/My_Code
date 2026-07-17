[CmdletBinding()]
param(
	[string]$BlackRepository,
	[string]$DataRoot,
	[string]$ReportDirectory,
	[switch]$InjectFailureAfterStart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$connectorPath = Join-Path $PSScriptRoot 'connect-ai-editor-black-dev.ps1'
$fixturePath = Join-Path $repositoryRoot 'specs\002-ai-editor-account-gateway\contracts\fixtures\edge-code-contract.json'
$allowedReportRoot = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot '.build\ai-editor-account-gateway'))
if ([string]::IsNullOrWhiteSpace($ReportDirectory)) {
	$ReportDirectory = $allowedReportRoot
}
$resolvedReportDirectory = [System.IO.Path]::GetFullPath($ReportDirectory).TrimEnd('\', '/')
$allowedReportPrefix = $allowedReportRoot.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
if (
	-not $resolvedReportDirectory.Equals($allowedReportRoot, [System.StringComparison]::OrdinalIgnoreCase) -and
	-not $resolvedReportDirectory.StartsWith($allowedReportPrefix, [System.StringComparison]::OrdinalIgnoreCase)
) {
	throw "The acceptance report directory must stay under $allowedReportRoot"
}

function Assert-File([string]$Path, [string]$Description) {
	if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
		throw "$Description is missing: $Path"
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

function Get-Sha256([string]$Path) {
	return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-SharedProxySnapshot {
	$processId = Get-ListenerProcessId 47892
	if (-not $processId) {
		throw 'Shared Proxy 47892 is not listening.'
	}
	$live = Invoke-RestMethod -Uri 'http://127.0.0.1:47892/live' -TimeoutSec 5
	if ($live.status -ne 'ok') {
		throw 'Shared Proxy /live is not healthy.'
	}
	$process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction Stop
	$serverPath = $null
	if ($process.CommandLine -match '"([^"]+[\\/]src[\\/]server\.js)"') {
		$serverPath = $Matches[1]
	} elseif ($process.CommandLine -match '([A-Za-z]:\\[^"]+[\\/]src[\\/]server\.js)') {
		$serverPath = $Matches[1].Trim()
	}
	$programHashes = [ordered]@{}
	$selectedDataHashes = [ordered]@{}
	if ($serverPath -and (Test-Path -LiteralPath $serverPath -PathType Leaf)) {
		$programRoot = Split-Path (Split-Path $serverPath -Parent) -Parent
		foreach ($relativePath in @('package.json', 'src/server.js')) {
			$filePath = Join-Path $programRoot $relativePath
			if (Test-Path -LiteralPath $filePath -PathType Leaf) {
				$programHashes[$relativePath] = Get-Sha256 $filePath
			}
		}
		# Runtime provider health and cooldowns can legitimately rewrite
		# codex-proxy-config.json while another client is using the shared
		# Proxy. Hash only selected catalog/policy data that this isolated
		# acceptance must never touch.
		foreach ($relativePath in @('codex-models.json', 'auto-model.json')) {
			$filePath = Join-Path $programRoot $relativePath
			if (Test-Path -LiteralPath $filePath -PathType Leaf) {
				$selectedDataHashes[$relativePath] = Get-Sha256 $filePath
			}
		}
	}
	return [ordered]@{
		processId = $processId
		liveStatus = [string]$live.status
		programHashes = $programHashes
		selectedDataHashes = $selectedDataHashes
	}
}

function Invoke-Http(
	[string]$Url,
	[string]$Method = 'GET',
	[hashtable]$Headers,
	[object]$Body
) {
	$request = [System.Net.HttpWebRequest]::Create($Url)
	$request.Method = $Method
	$request.Timeout = 5000
	$request.ReadWriteTimeout = 5000
	$request.KeepAlive = $false
	if ($Headers) {
		foreach ($entry in $Headers.GetEnumerator()) {
			$request.Headers[[string]$entry.Key] = [string]$entry.Value
		}
	}
	if ($PSBoundParameters.ContainsKey('Body')) {
		$json = $Body | ConvertTo-Json -Depth 20 -Compress
		$bytes = [Text.Encoding]::UTF8.GetBytes($json)
		$request.ContentType = 'application/json; charset=utf-8'
		$request.ContentLength = $bytes.Length
		$stream = $request.GetRequestStream()
		try {
			$stream.Write($bytes, 0, $bytes.Length)
		} finally {
			$stream.Dispose()
			[Array]::Clear($bytes, 0, $bytes.Length)
		}
	}

	$response = $null
	try {
		$response = [System.Net.HttpWebResponse]$request.GetResponse()
	} catch [System.Net.WebException] {
		if (-not $_.Exception.Response) {
			throw
		}
		$response = [System.Net.HttpWebResponse]$_.Exception.Response
	}

	try {
		$responseBody = ''
		$responseStream = $response.GetResponseStream()
		if ($responseStream) {
			$reader = New-Object System.IO.StreamReader($responseStream, [Text.Encoding]::UTF8)
			try {
				$responseBody = $reader.ReadToEnd()
			} finally {
				$reader.Dispose()
			}
		}
		$jsonBody = $null
		if (-not [string]::IsNullOrWhiteSpace($responseBody)) {
			try {
				$jsonBody = $responseBody | ConvertFrom-Json
			} catch {
				throw "Endpoint returned invalid JSON with HTTP $([int]$response.StatusCode)."
			}
		}
		return [ordered]@{
			statusCode = [int]$response.StatusCode
			body = $jsonBody
		}
	} finally {
		$response.Dispose()
	}
}

function Assert-Status($Response, [object[]]$Allowed, [string]$Description) {
	if ([int]$Response.statusCode -notin @($Allowed | ForEach-Object { [int]$_ })) {
		throw "$Description returned unexpected HTTP status $($Response.statusCode)."
	}
}

function Assert-Fields($Body, [object[]]$Required, [object[]]$Forbidden, [string]$Description) {
	$names = @($Body.PSObject.Properties.Name)
	foreach ($field in @($Required)) {
		if ($names -notcontains [string]$field) {
			throw "$Description is missing required field $field."
		}
	}
	foreach ($field in @($Forbidden)) {
		if ($names -contains [string]$field) {
			throw "$Description contains forbidden field $field."
		}
	}
}

function Protect-Text([string]$Text, [string[]]$Secrets) {
	$result = $Text
	foreach ($secret in @($Secrets)) {
		if (-not [string]::IsNullOrEmpty($secret)) {
			$result = $result.Replace($secret, '[REDACTED]')
		}
	}
	return $result
}

function Write-MarkdownReport([string]$Path, $Report) {
	$lines = @(
		'# AI Editor account/Gateway isolated acceptance',
		'',
		"- Generated: $($Report.generatedAt)",
		"- Result: **$($Report.result)**",
		"- Black commit: ``$($Report.blackCommit)``",
		"- Shared Proxy PID unchanged: $($Report.sharedProxy.unchanged)",
		"- Shared Proxy `/live`: $($Report.sharedProxy.after.liveStatus)",
		"- Isolated ports released: $($Report.cleanup.isolatedPortsReleased)",
		'',
		'## Checks',
		'',
		'| Check | Result | Detail |',
		'| --- | --- | --- |'
	)
	foreach ($check in $Report.checks) {
		$detail = ([string]$check.detail).Replace('|', '\|').Replace("`r", ' ').Replace("`n", ' ')
		$lines += "| $($check.name) | $($check.result) | $detail |"
	}
	[System.IO.File]::WriteAllText(
		$Path,
		(($lines -join "`n") + "`n"),
		(New-Object System.Text.UTF8Encoding($false))
	)
}

Assert-File $connectorPath 'Black integration connector'
Assert-File $fixturePath 'Machine-readable Edge/Code contract fixture'
$fixtures = Get-Content -Raw -LiteralPath $fixturePath -Encoding UTF8 | ConvertFrom-Json
if ($fixtures.schemaVersion -ne 1) {
	throw 'Unsupported Edge/Code fixture schema.'
}

$connectorArguments = @{}
if (-not [string]::IsNullOrWhiteSpace($BlackRepository)) {
	$connectorArguments.BlackRepository = $BlackRepository
}
if (-not [string]::IsNullOrWhiteSpace($DataRoot)) {
	$connectorArguments.DataRoot = $DataRoot
}
$validated = & $connectorPath @connectorArguments -ValidateOnly
$resolvedBlackRepository = [string]$validated.blackRepository
$resolvedDataRoot = [string]$validated.dataRoot
$nonceFile = [string]$validated.nonceFile
$edgeOrigin = [string]$validated.edgeOrigin
$blackCommit = (& git -C $resolvedBlackRepository rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) {
	throw 'Unable to read the Black integration commit.'
}

$checks = New-Object 'System.Collections.Generic.List[object]'
function Add-Pass([string]$Name, [string]$Detail) {
	$checks.Add([ordered]@{ name = $Name; result = 'PASS'; detail = $Detail })
}

New-Item -ItemType Directory -Path $resolvedReportDirectory -Force | Out-Null
$jsonReportPath = Join-Path $resolvedReportDirectory 'account-gateway-acceptance.json'
$markdownReportPath = Join-Path $resolvedReportDirectory 'account-gateway-acceptance.md'
$sharedBefore = Get-SharedProxySnapshot
$sharedAfter = $null
$failure = $null
$isolatedPortsReleased = $false
$secrets = New-Object 'System.Collections.Generic.List[string]'
foreach ($secret in @($fixtures.reportSecretValues)) {
	$secrets.Add([string]$secret)
}

try {
	& $connectorPath @connectorArguments -State login_required
	Assert-File $nonceFile 'Black Edge nonce file'
	$localNonce = [System.IO.File]::ReadAllText($nonceFile).Trim()
	if ([Text.Encoding]::UTF8.GetByteCount($localNonce) -lt 32) {
		throw 'Black Edge nonce is malformed.'
	}
	$secrets.Add($localNonce)
	$headers = @{ ([string]$fixtures.localAuthorization.headerName) = $localNonce }

	$gatewayLive = Invoke-Http 'http://127.0.0.1:47920/live'
	$edgeLive = Invoke-Http "$edgeOrigin/live"
	Assert-Status $gatewayLive @(200) 'Gateway /live'
	Assert-Status $edgeLive @(200) 'Edge /live'
	if ($gatewayLive.body.mode -ne 'gateway' -or $edgeLive.body.mode -ne 'edge') {
		throw 'Gateway or Edge liveness mode is invalid.'
	}
	Add-Pass 'isolated-liveness' 'Gateway 47920 and Edge 47921 reported the expected modes.'
	if ($InjectFailureAfterStart) {
		throw 'Injected acceptance failure after isolated startup.'
	}

	$unauthorized = Invoke-Http "$edgeOrigin/ai-editor/status"
	Assert-Status $unauthorized @($fixtures.localAuthorization.missingStatus) 'Status without local nonce'
	if ($unauthorized.body.error.code -ne $fixtures.localAuthorization.missingErrorCode) {
		throw 'Status without local nonce returned the wrong safe error code.'
	}
	Assert-Fields $unauthorized.body.error @($fixtures.safeError.requiredFields) @($fixtures.safeError.forbiddenFields) 'Safe local authorization error'
	Add-Pass 'local-authorization' 'Missing local nonce was rejected with the contracted safe error.'

	foreach ($statusFixture in @($fixtures.statuses)) {
		$state = [string]$statusFixture.state
		$changed = Invoke-Http "$edgeOrigin/ai-editor/mock/state" 'POST' $headers @{ state = $state }
		Assert-Status $changed @(200) "Mock state $state"
		$status = Invoke-Http "$edgeOrigin/ai-editor/status" 'GET' $headers
		Assert-Status $status @(200) "Safe status $state"
		if ($status.body.state -ne $state) {
			throw "Safe status mismatch for $state."
		}
		$actualActions = @($status.body.actions)
		$expectedActions = @($statusFixture.actions)
		if (
			(ConvertTo-Json -InputObject $actualActions -Compress) -cne
			(ConvertTo-Json -InputObject $expectedActions -Compress)
		) {
			throw "Safe actions mismatch for $state."
		}
		Assert-Fields $status.body @($statusFixture.requiredFields) @($statusFixture.forbiddenFields) "Safe status $state"
		Assert-Fields $status.body @() @($fixtures.safeStatusForbiddenFields) "Safe status $state"
		$parsedCheckedAt = [DateTimeOffset]::MinValue
		if (-not [DateTimeOffset]::TryParse([string]$status.body.checkedAt, [ref]$parsedCheckedAt)) {
			throw "Safe status $state has an invalid checkedAt value."
		}
		Add-Pass "status-$state" "State and safe actions matched the shared fixture."
	}

	Invoke-Http "$edgeOrigin/ai-editor/mock/state" 'POST' $headers @{ state = 'service_unavailable' } | Out-Null
	$retry = Invoke-Http `
		"$edgeOrigin$($fixtures.statusRetry.path)" `
		([string]$fixtures.statusRetry.method) `
		$headers `
		@{}
	Assert-Status $retry @($fixtures.statusRetry.successStatuses) 'Status retry'
	if ($retry.body.state -ne 'service_unavailable') {
		throw 'Status retry did not preserve the current safe account state.'
	}
	Add-Pass 'status-retry' 'Manual status retry returned the current safe account state.'

	Invoke-Http "$edgeOrigin/ai-editor/mock/state" 'POST' $headers @{ state = 'login_required' } | Out-Null
	$handoffStart = Invoke-Http `
		"$edgeOrigin$($fixtures.handoff.start.path)" `
		([string]$fixtures.handoff.start.method) `
		$headers `
		@{ state = [string]$fixtures.handoff.start.request.state }
	Assert-Status $handoffStart @($fixtures.handoff.start.successStatuses) 'Handoff start'
	Assert-Fields $handoffStart.body @($fixtures.handoff.start.responseRequiredFields) @() 'Handoff start'
	$handoffNonce = [string]$handoffStart.body.nonce
	$secrets.Add($handoffNonce)
	$completeBody = @{
		handoffId = [string]$handoffStart.body.handoffId
		nonce = $handoffNonce
		state = [string]$fixtures.handoff.start.request.state
		deviceSessionId = [string]$fixtures.handoff.complete.request.deviceSessionId
		refreshToken = [string]$fixtures.handoff.complete.request.refreshToken
		accessToken = [string]$fixtures.handoff.complete.request.accessToken
		accessTokenExpiresIn = [int]$fixtures.handoff.complete.request.accessTokenExpiresIn
	}
	$handoffComplete = Invoke-Http `
		"$edgeOrigin$($fixtures.handoff.complete.path)" `
		([string]$fixtures.handoff.complete.method) `
		$headers `
		$completeBody
	Assert-Status $handoffComplete @($fixtures.handoff.complete.successStatuses) 'Handoff complete'
	if (
		$handoffComplete.body.status -ne $fixtures.handoff.complete.response.status -or
		[int]$handoffComplete.body.bindingVersion -lt [int]$fixtures.handoff.complete.response.minimumBindingVersion
	) {
		throw 'Handoff completion acknowledgement is invalid.'
	}
	$handoffReplay = Invoke-Http `
		"$edgeOrigin$($fixtures.handoff.complete.path)" `
		([string]$fixtures.handoff.complete.method) `
		$headers `
		$completeBody
	Assert-Status $handoffReplay @($fixtures.handoff.complete.replayStatuses) 'Handoff replay'
	if ($handoffReplay.body.error.code -ne $fixtures.handoff.complete.replayErrorCode) {
		throw 'Handoff replay returned the wrong safe error code.'
	}
	Add-Pass 'one-time-handoff' 'Handoff completed once and replay was rejected.'

	$ticket = Invoke-Http `
		"$edgeOrigin$($fixtures.webviewTicket.path)" `
		([string]$fixtures.webviewTicket.method) `
		$headers `
		@{}
	Assert-Status $ticket @($fixtures.webviewTicket.successStatuses) 'Webview ticket'
	Assert-Fields $ticket.body @($fixtures.webviewTicket.responseRequiredFields) @() 'Webview ticket'
	$secrets.Add([string]$ticket.body.ticket)
	Add-Pass 'webview-ticket' 'A one-time ticket envelope was returned without entering the report.'

	$models = Invoke-Http "$edgeOrigin$($fixtures.models.path)" ([string]$fixtures.models.method)
	Assert-Status $models @($fixtures.models.successStatuses) 'Ready model catalog'
	if (-not $models.body.data -or @($models.body.data).Count -eq 0) {
		throw 'Ready model catalog is empty.'
	}
	foreach ($model in @($models.body.data)) {
		if ([string]::IsNullOrWhiteSpace([string]$model.id)) {
			throw 'Ready model catalog contains an invalid model id.'
		}
	}
	Add-Pass 'model-catalog' "Ready Edge returned $(@($models.body.data).Count) model(s)."

	$logout = Invoke-Http `
		"$edgeOrigin$($fixtures.logout.path)" `
		([string]$fixtures.logout.method) `
		$headers `
		@{}
	Assert-Status $logout @($fixtures.logout.successStatuses) 'Logout'
	$statusAfterLogout = Invoke-Http "$edgeOrigin/ai-editor/status" 'GET' $headers
	if ($statusAfterLogout.body.state -ne $fixtures.logout.resultingState) {
		throw 'Logout did not produce the contracted account state.'
	}
	$modelsAfterLogout = Invoke-Http "$edgeOrigin$($fixtures.models.path)" ([string]$fixtures.models.method)
	Assert-Status $modelsAfterLogout @($fixtures.models.loggedOutStatuses) 'Logged-out model catalog'
	if ($modelsAfterLogout.body.error.code -ne $fixtures.models.loggedOutErrorCode) {
		throw 'Logged-out model catalog returned the wrong safe error code.'
	}
	Add-Pass 'logout' 'Logout returned 204, changed account state, and blocked model access.'

	$logFiles = @(
		Get-ChildItem -LiteralPath $resolvedDataRoot -Recurse -File -ErrorAction SilentlyContinue |
			Where-Object { $_.Extension -in @('.log', '.txt') }
	)
	foreach ($logFile in $logFiles) {
		$content = Get-Content -Raw -LiteralPath $logFile.FullName -ErrorAction SilentlyContinue
		foreach ($secret in $secrets) {
			if ($content -and $content.Contains($secret)) {
				throw "A test secret was found in an isolated service log: $($logFile.Name)"
			}
		}
	}
	Add-Pass 'secret-log-scan' "Scanned $($logFiles.Count) isolated log file(s); no transient secret was found."
} catch {
	$failure = $_
} finally {
	try {
		& $connectorPath @connectorArguments -Stop
	} catch {
		if (-not $failure) {
			$failure = $_
		}
	}
	$isolatedPortsReleased = -not (Get-ListenerProcessId 47920) -and -not (Get-ListenerProcessId 47921)
	if ($isolatedPortsReleased) {
		Add-Pass 'isolated-cleanup' 'Gateway 47920 and Edge 47921 were released.'
	} elseif (-not $failure) {
		$failure = [System.Management.Automation.ErrorRecord]::new(
			[InvalidOperationException]::new('Isolated Gateway or Edge port remained in use after cleanup.'),
			'isolated_cleanup_failed',
			[System.Management.Automation.ErrorCategory]::ResourceBusy,
			$null
		)
	}
	try {
		$sharedAfter = Get-SharedProxySnapshot
		if (
			$sharedBefore.processId -ne $sharedAfter.processId -or
			($sharedBefore.programHashes | ConvertTo-Json -Compress) -cne
				($sharedAfter.programHashes | ConvertTo-Json -Compress) -or
			($sharedBefore.selectedDataHashes | ConvertTo-Json -Compress) -cne
				($sharedAfter.selectedDataHashes | ConvertTo-Json -Compress)
		) {
			throw 'Shared Proxy PID, selected program hashes, or selected data hashes changed.'
		}
		Add-Pass 'shared-proxy-invariant' 'Shared Proxy PID, /live, selected program hashes, and selected data hashes were unchanged.'
	} catch {
		if (-not $failure) {
			$failure = $_
		}
	}
}

$safeFailure = if ($failure) {
	Protect-Text ([string]$failure.Exception.Message) $secrets.ToArray()
} else {
	$null
}
$report = [ordered]@{
	schemaVersion = 1
	generatedAt = (Get-Date).ToUniversalTime().ToString('o')
	result = if ($failure) { 'FAIL' } else { 'PASS' }
	blackCommit = $blackCommit
	fixtureSchemaVersion = [int]$fixtures.schemaVersion
	checks = $checks.ToArray()
	sharedProxy = [ordered]@{
		before = $sharedBefore
		after = $sharedAfter
		unchanged = -not $failure -or @($checks | Where-Object { $_.name -eq 'shared-proxy-invariant' }).Count -eq 1
	}
	cleanup = [ordered]@{
		isolatedPortsReleased = $isolatedPortsReleased
	}
	error = $safeFailure
}

$reportJson = $report | ConvertTo-Json -Depth 30
foreach ($secret in $secrets) {
	if (-not [string]::IsNullOrEmpty($secret) -and $reportJson.Contains($secret)) {
		throw 'Refusing to write an acceptance report containing a transient secret.'
	}
}
[System.IO.File]::WriteAllText(
	$jsonReportPath,
	($reportJson + "`n"),
	(New-Object System.Text.UTF8Encoding($false))
)
Write-MarkdownReport $markdownReportPath $report

[ordered]@{
	result = $report.result
	report = $jsonReportPath
	markdown = $markdownReportPath
	checks = $checks.Count
	blackCommit = $blackCommit
	sharedProxyPid = if ($sharedAfter) { $sharedAfter.processId } else { $null }
	sharedProxyLive = if ($sharedAfter) { $sharedAfter.liveStatus } else { $null }
	isolatedPortsReleased = $isolatedPortsReleased
} | ConvertTo-Json -Depth 8

if ($failure) {
	throw "AI Editor account/Gateway acceptance failed. See $jsonReportPath"
}
