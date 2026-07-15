[CmdletBinding()]
param(
	[string]$ProductRoot,
	[string]$UserSetupPath,
	[string]$SystemSetupPath,
	[string]$ReportPath,
	[string]$ConfiguredProxyBaseUrl = 'http://127.0.0.1:47892',
	[switch]$SkipCleanStart,
	[switch]$RunResponseTests,
	[string]$SubscriptionModel,
	[string]$NonSubscriptionModel,
	[int]$ResponseTimeoutSec = 300,
	[switch]$KeepCleanStartArtifacts
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-FullPath([string]$Path, [string]$BasePath) {
	if ([System.IO.Path]::IsPathRooted($Path)) {
		return [System.IO.Path]::GetFullPath($Path)
	}
	return [System.IO.Path]::GetFullPath((Join-Path $BasePath $Path))
}

function Assert-File([string]$Path, [string]$Description) {
	if (!(Test-Path -LiteralPath $Path -PathType Leaf)) {
		throw "$Description was not found: $Path"
	}
}

function Assert-Directory([string]$Path, [string]$Description) {
	if (!(Test-Path -LiteralPath $Path -PathType Container)) {
		throw "$Description was not found: $Path"
	}
}

function Read-JsonFile([string]$Path) {
	Assert-File $Path 'JSON file'
	try {
		return Get-Content -Raw -LiteralPath $Path -Encoding UTF8 | ConvertFrom-Json
	} catch {
		throw "Unable to parse JSON file ${Path}: $($_.Exception.Message)"
	}
}

function Get-Sha256([string]$Path) {
	return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-Base64Sha256([string]$Path) {
	$stream = [System.IO.File]::OpenRead($Path)
	$sha = $null
	try {
		$sha = [System.Security.Cryptography.SHA256]::Create()
		return [Convert]::ToBase64String($sha.ComputeHash($stream)).TrimEnd('=')
	} finally {
		if ($sha) {
			$sha.Dispose()
		}
		$stream.Dispose()
	}
}

function Get-FileRecord([string]$Name, [string]$Path) {
	Assert-File $Path $Name
	$item = Get-Item -LiteralPath $Path
	return [ordered]@{
		name = $Name
		path = $item.FullName
		bytes = $item.Length
		sha256 = Get-Sha256 $item.FullName
	}
}

function Assert-LoopbackUrl([string]$Url, [string]$Description) {
	try {
		$uri = [Uri]$Url
	} catch {
		throw "$Description is not a valid URL: $Url"
	}
	if ($uri.Scheme -ne 'http' -or $uri.Host -notin @('127.0.0.1', 'localhost', '[::1]', '::1')) {
		throw "$Description must use a loopback HTTP address: $Url"
	}
	return $uri.GetLeftPart([System.UriPartial]::Authority).TrimEnd('/')
}

function Convert-Headers($Headers) {
	$result = [ordered]@{}
	if ($Headers) {
		foreach ($key in $Headers.Keys) {
			$result[[string]$key] = [string]$Headers[$key]
		}
	}
	return $result
}

function Invoke-Http(
	[string]$Url,
	[string]$Method = 'GET',
	[string]$Body,
	[int]$TimeoutSec = 30
) {
	$request = [System.Net.HttpWebRequest]::Create($Url)
	$request.Method = $Method
	$request.Timeout = $TimeoutSec * 1000
	$request.ReadWriteTimeout = $TimeoutSec * 1000
	$request.KeepAlive = $false
	if ($PSBoundParameters.ContainsKey('Body')) {
		$bytes = [System.Text.Encoding]::UTF8.GetBytes($Body)
		$request.ContentType = 'application/json; charset=utf-8'
		$request.ContentLength = $bytes.Length
		$requestStream = $request.GetRequestStream()
		try {
			$requestStream.Write($bytes, 0, $bytes.Length)
		} finally {
			$requestStream.Dispose()
		}
	}

	$response = $null
	try {
		$response = [System.Net.HttpWebResponse]$request.GetResponse()
	} catch [System.Net.WebException] {
		if (!$_.Exception.Response) {
			throw
		}
		$response = [System.Net.HttpWebResponse]$_.Exception.Response
	}

	try {
		$buffer = New-Object System.IO.MemoryStream
		$stream = $response.GetResponseStream()
		if ($stream) {
			try {
				$stream.CopyTo($buffer)
			} finally {
				$stream.Dispose()
			}
		}

		$charset = 'utf-8'
		if ($response.CharacterSet) {
			$charset = $response.CharacterSet.Trim('"')
		}
		try {
			$encoding = [System.Text.Encoding]::GetEncoding($charset)
		} catch {
			$encoding = [System.Text.Encoding]::UTF8
		}
		$content = $encoding.GetString($buffer.ToArray())
		$buffer.Dispose()

		return [ordered]@{
			statusCode = [int]$response.StatusCode
			content = $content
			contentType = [string]$response.ContentType
			headers = Convert-Headers $response.Headers
		}
	} finally {
		if ($response) {
			$response.Dispose()
		}
	}
}

function Set-ProcessEnvironment([hashtable]$OriginalValues, [string]$Name, [string]$Value) {
	if (!$OriginalValues.ContainsKey($Name)) {
		$OriginalValues[$Name] = [System.Environment]::GetEnvironmentVariable($Name, 'Process')
	}
	[System.Environment]::SetEnvironmentVariable($Name, $Value, 'Process')
}

function Restore-ProcessEnvironment([hashtable]$OriginalValues) {
	foreach ($entry in $OriginalValues.GetEnumerator()) {
		[System.Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
	}
}

function Convert-HttpJson($Response, [string]$Description) {
	try {
		return $Response.content | ConvertFrom-Json
	} catch {
		throw "$Description returned invalid JSON (HTTP $($Response.statusCode))."
	}
}

function Assert-HttpSuccess($Response, [string]$Description) {
	if ($Response.statusCode -lt 200 -or $Response.statusCode -ge 300) {
		$detail = $Response.content
		if ($detail.Length -gt 500) {
			$detail = $detail.Substring(0, 500)
		}
		throw "$Description returned HTTP $($Response.statusCode): $detail"
	}
}

function Get-FreeTcpPort {
	$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
	$listener.Start()
	try {
		return [int]$listener.LocalEndpoint.Port
	} finally {
		$listener.Stop()
	}
}

function Get-ListenerProcessId([int]$Port) {
	$connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
		Select-Object -First 1
	if ($connection) {
		return [int]$connection.OwningProcess
	}
	return $null
}

function Remove-DirectoryWithRetry([string]$Path, [string]$AllowedParent) {
	$resolvedParent = [System.IO.Path]::GetFullPath($AllowedParent).TrimEnd('\') + '\'
	$resolvedPath = [System.IO.Path]::GetFullPath($Path)
	if (!$resolvedPath.StartsWith($resolvedParent, [System.StringComparison]::OrdinalIgnoreCase)) {
		throw "Refusing to clean an unsafe verification path: $resolvedPath"
	}

	for ($attempt = 1; $attempt -le 20; $attempt++) {
		if (!(Test-Path -LiteralPath $resolvedPath)) {
			return
		}
		try {
			Remove-Item -LiteralPath $resolvedPath -Recurse -Force -ErrorAction Stop
			return
		} catch {
			if ($attempt -eq 20) {
				throw
			}
			Start-Sleep -Milliseconds 500
		}
	}
}

function Get-ResponseOutputText($ResponseJson) {
	if ($ResponseJson.PSObject.Properties.Name -contains 'output_text' -and $ResponseJson.output_text) {
		return [string]$ResponseJson.output_text
	}

	$segments = @()
	foreach ($item in @($ResponseJson.output)) {
		foreach ($content in @($item.content)) {
			if ($content.PSObject.Properties.Name -contains 'text' -and $content.text) {
				$segments += [string]$content.text
			}
		}
	}
	return ($segments -join "`n").Trim()
}

function Invoke-ResponseAcceptance(
	[string]$BaseUrl,
	[string]$Model,
	[string]$Owner,
	[int]$TimeoutSec
) {
	$payload = [ordered]@{
		model = $Model
		instructions = 'Reply with exactly OK.'
		input = @(
			[ordered]@{
				role = 'user'
				content = @(
					[ordered]@{
						type = 'input_text'
						text = 'Reply only with OK.'
					}
				)
			}
		)
		stream = $true
		store = $false
	}

	$started = Get-Date
	$response = Invoke-Http -Url "$BaseUrl/v1/responses" -Method POST `
		-Body ($payload | ConvertTo-Json -Depth 12 -Compress) -TimeoutSec $TimeoutSec
	Assert-HttpSuccess $response "Responses API model $Model"
	$responseId = $null
	$outputText = ''
	if (
		$response.contentType -match 'text/event-stream' -or
		$response.content -match '(?m)^(event|data):'
	) {
		$completed = $false
		$deltas = @()
		foreach ($line in ($response.content -split "`n")) {
			$line = $line.TrimEnd("`r")
			if (!$line.StartsWith('data:')) {
				continue
			}
			$data = $line.Substring(5).Trim()
			if (!$data -or $data -eq '[DONE]') {
				continue
			}
			try {
				$event = $data | ConvertFrom-Json
			} catch {
				throw "Responses API model $Model returned invalid SSE JSON."
			}
			if ($event.PSObject.Properties.Name -contains 'type') {
				if ($event.type -in @('error', 'response.failed', 'response.incomplete')) {
					throw "Responses API model $Model returned SSE event $($event.type)."
				}
				if ($event.type -eq 'response.output_text.delta' -and $event.PSObject.Properties.Name -contains 'delta') {
					$deltas += [string]$event.delta
				}
				if ($event.type -eq 'response.completed') {
					$completed = $true
					if ($event.PSObject.Properties.Name -contains 'response' -and $event.response) {
						if ($event.response.PSObject.Properties.Name -contains 'id') {
							$responseId = [string]$event.response.id
						}
						if ($deltas.Count -eq 0) {
							$outputText = Get-ResponseOutputText $event.response
						}
					}
				}
			}
		}
		if (!$completed) {
			throw "Responses API model $Model ended without response.completed."
		}
		if ($deltas.Count -gt 0) {
			$outputText = ($deltas -join '')
		}
	} else {
		$json = Convert-HttpJson $response "Responses API model $Model"
		if ($json.PSObject.Properties.Name -contains 'error' -and $json.error) {
			throw "Responses API model $Model returned an error object."
		}
		$responseId = if ($json.PSObject.Properties.Name -contains 'id') { [string]$json.id } else { $null }
		$outputText = Get-ResponseOutputText $json
	}

	$preview = $outputText
	if ($preview.Length -gt 120) {
		$preview = $preview.Substring(0, 120)
	}

	return [ordered]@{
		model = $Model
		owner = $Owner
		statusCode = $response.statusCode
		durationMs = [int]((Get-Date) - $started).TotalMilliseconds
		responseId = $responseId
		outputPreview = $preview
		providerHeader = $response.headers['x-codex-proxy-provider']
		modelHeader = $response.headers['x-codex-proxy-model']
	}
}

function Test-ProductChecksums([string]$ProductAppRoot, $ProductJson) {
	$checks = @()
	foreach ($property in $ProductJson.checksums.PSObject.Properties) {
		$filePath = Join-Path (Join-Path $ProductAppRoot 'out') ($property.Name.Replace('/', '\'))
		Assert-File $filePath "Product checksum file $($property.Name)"
		$actual = Get-Base64Sha256 $filePath
		$match = $actual -ceq [string]$property.Value
		$checks += [ordered]@{
			path = $property.Name
			expected = [string]$property.Value
			actual = $actual
			match = $match
		}
		if (!$match) {
			throw "Product checksum mismatch: $($property.Name)"
		}
	}
	if ($checks.Count -eq 0) {
		throw 'Product checksum list is empty.'
	}
	return $checks
}

function Test-ProxyArtifact([string]$ProxyRoot) {
	$manifestPath = Join-Path $ProxyRoot 'release-manifest.json'
	$manifest = Read-JsonFile $manifestPath
	if (
		$manifest.schemaVersion -ne 1 -or
		$manifest.name -ne 'codex_proxy' -or
		$manifest.platform -ne 'win32-x64' -or
		$manifest.entryPoint -ne 'src/server.js'
	) {
		throw "Invalid bundled Proxy release manifest: $manifestPath"
	}

	$required = @('LICENSE', 'ThirdPartyNotices.txt', 'package-lock.json', 'package.json', 'src/server.js')
	foreach ($relativePath in $required) {
		if ($manifest.files.PSObject.Properties.Name -notcontains $relativePath) {
			throw "Bundled Proxy manifest is missing required file: $relativePath"
		}
	}

	$expectedFiles = @($manifest.files.PSObject.Properties.Name | Sort-Object)
	$actualFiles = @(
		Get-ChildItem -LiteralPath $ProxyRoot -Recurse -File -Force |
			Where-Object { $_.FullName -ne $manifestPath } |
			ForEach-Object {
				$_.FullName.Substring($ProxyRoot.Length).TrimStart('\').Replace('\', '/')
			} |
			Sort-Object
	)
	$difference = @(Compare-Object -ReferenceObject $expectedFiles -DifferenceObject $actualFiles)
	if ($difference.Count -gt 0) {
		throw 'Bundled Proxy file set does not match release-manifest.json.'
	}

	foreach ($property in $manifest.files.PSObject.Properties) {
		$filePath = Join-Path $ProxyRoot ($property.Name.Replace('/', '\'))
		if ((Get-Sha256 $filePath) -cne ([string]$property.Value).ToLowerInvariant()) {
			throw "Bundled Proxy checksum mismatch: $($property.Name)"
		}
	}

	$proxyPackage = Read-JsonFile (Join-Path $ProxyRoot 'package.json')
	if ($proxyPackage.name -ne 'codex-proxy' -or $proxyPackage.version -ne $manifest.version) {
		throw 'Bundled Proxy package metadata does not match release-manifest.json.'
	}

	return [ordered]@{
		manifest = $manifest
		payloadFileCount = $expectedFiles.Count
	}
}

function Test-ConfiguredProxy([string]$BaseUrl, [switch]$TestResponses, [string]$RequestedSubscriptionModel, [string]$RequestedNonSubscriptionModel, [int]$TimeoutSec) {
	$liveResponse = Invoke-Http "$BaseUrl/live"
	Assert-HttpSuccess $liveResponse 'Configured Proxy /live'
	$live = Convert-HttpJson $liveResponse 'Configured Proxy /live'
	if ($live.status -ne 'ok') {
		throw 'Configured Proxy /live did not report status=ok.'
	}

	$readyResponse = Invoke-Http "$BaseUrl/ready"
	Assert-HttpSuccess $readyResponse 'Configured Proxy /ready'
	$ready = Convert-HttpJson $readyResponse 'Configured Proxy /ready'
	if ($ready.status -ne 'ok') {
		throw 'Configured Proxy /ready did not report status=ok.'
	}

	$modelsResponse = Invoke-Http "$BaseUrl/v1/models"
	Assert-HttpSuccess $modelsResponse 'Configured Proxy /v1/models'
	$models = Convert-HttpJson $modelsResponse 'Configured Proxy /v1/models'
	$catalog = @($models.data)
	if ($catalog.Count -eq 0) {
		throw 'Configured Proxy model catalog is empty.'
	}

	$adminResponse = Invoke-Http "$BaseUrl/admin"
	Assert-HttpSuccess $adminResponse 'Configured Proxy /admin'
	if ($adminResponse.contentType -notmatch 'text/html' -or $adminResponse.content -notmatch '<title>') {
		throw 'Configured Proxy /admin did not return an HTML management page.'
	}

	$owners = @(
		$catalog |
			Group-Object owned_by |
			Sort-Object Name |
			ForEach-Object { [ordered]@{ owner = $_.Name; count = $_.Count } }
	)
	$responseTests = @()
	if ($TestResponses) {
		$subscription = if ($RequestedSubscriptionModel) {
			$catalog | Where-Object { $_.id -eq $RequestedSubscriptionModel } | Select-Object -First 1
		} else {
			$catalog | Where-Object { $_.owned_by -eq 'chatgpt-sub' } | Select-Object -First 1
		}
		if (!$subscription -or $subscription.owned_by -ne 'chatgpt-sub') {
			throw 'A ChatGPT Subscription model was not found for the Responses API acceptance test.'
		}

		$nonSubscription = if ($RequestedNonSubscriptionModel) {
			$catalog | Where-Object { $_.id -eq $RequestedNonSubscriptionModel } | Select-Object -First 1
		} else {
			$catalog |
				Where-Object { $_.owned_by -ne 'chatgpt-sub' } |
				Sort-Object @{ Expression = {
					switch ($_.owned_by) {
						'deepseek' { 0 }
						'openai-api' { 1 }
						'relay' { 2 }
						default { 3 }
					}
				} } |
				Select-Object -First 1
		}
		if (!$nonSubscription -or $nonSubscription.owned_by -eq 'chatgpt-sub') {
			throw 'A non-subscription model was not found for the Responses API acceptance test.'
		}

		$responseTests += Invoke-ResponseAcceptance $BaseUrl $subscription.id $subscription.owned_by $TimeoutSec
		$responseTests += Invoke-ResponseAcceptance $BaseUrl $nonSubscription.id $nonSubscription.owned_by $TimeoutSec
	}

	return [ordered]@{
		baseUrl = $BaseUrl
		live = $live
		ready = $ready
		modelCount = $catalog.Count
		owners = $owners
		admin = [ordered]@{
			statusCode = $adminResponse.statusCode
			contentType = $adminResponse.contentType
			title = [regex]::Match($adminResponse.content, '<title>(.*?)</title>', 'IgnoreCase').Groups[1].Value
		}
		responseTests = $responseTests
	}
}

function Test-CleanProductStart(
	[string]$ProductExe,
	[string]$BundledProxyEntryPoint,
	[string]$VerificationRoot,
	[switch]$KeepArtifacts
) {
	$cleanRoot = Join-Path $VerificationRoot ('clean-start-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
	$userData = Join-Path $cleanRoot 'user-data'
	$extensions = Join-Path $cleanRoot 'extensions'
	$sharedData = Join-Path $cleanRoot 'shared-data'
	$proxyData = Join-Path $cleanRoot 'proxy-data'
	$stdout = Join-Path $cleanRoot 'code.stdout.log'
	$stderr = Join-Path $cleanRoot 'code.stderr.log'
	foreach ($directory in @($userData, $extensions, $sharedData, $proxyData)) {
		New-Item -ItemType Directory -Path $directory -Force | Out-Null
	}
	$initialProxyDataEntries = @(Get-ChildItem -LiteralPath $proxyData -Force).Count
	if ($initialProxyDataEntries -ne 0) {
		throw 'Clean-start Proxy data directory was not empty.'
	}

	$proxyPort = Get-FreeTcpPort
	do {
		$cdpPort = Get-FreeTcpPort
	} while ($cdpPort -eq $proxyPort)
	$baseUrl = "http://127.0.0.1:$proxyPort"

	$userSettingsDir = Join-Path $userData 'User'
	New-Item -ItemType Directory -Path $userSettingsDir -Force | Out-Null
	$settings = [ordered]@{
		'aiEditor.proxy.baseUrl' = $baseUrl
		'aiEditor.proxy.autoStart' = $true
		'workbench.startupEditor' = 'none'
	}
	[System.IO.File]::WriteAllText(
		(Join-Path $userSettingsDir 'settings.json'),
		($settings | ConvertTo-Json -Depth 5),
		(New-Object System.Text.UTF8Encoding($false))
	)

	$originalEnvironment = @{}
	$launcher = $null
	$proxyProcessId = $null
	$codeProcesses = @()
	try {
		Set-ProcessEnvironment $originalEnvironment 'VSCODE_AI_EDITOR_PROXY_DATA_DIR' $proxyData
		Set-ProcessEnvironment $originalEnvironment 'CODEX_HOME' (Join-Path $cleanRoot 'codex-home')
		foreach ($name in @(
			'DEEPSEEK_API_KEY',
			'OPENAI_API_KEY',
			'OPENAI_ORG_ID',
			'OPENAI_PROJECT_ID',
			'OPENAI_BASE_URL',
			'CODEX_RELAYS',
			'CODEX_OPENAI_API_BASE_URL',
			'CODEX_OPENAI_API_RESPONSES_URL',
			'CODEX_OPENAI_API_CHAT_COMPLETIONS_URL',
			'CODEX_OPENAI_API_UPSTREAM',
			'CODEX_CHATGPT_RESPONSES_URL'
		)) {
			Set-ProcessEnvironment $originalEnvironment $name $null
		}
		$arguments = @(
			'--user-data-dir', $userData,
			'--extensions-dir', $extensions,
			'--shared-data-dir', $sharedData,
			"--remote-debugging-port=$cdpPort",
			'--disable-workspace-trust'
		)
		$launcher = Start-Process -FilePath $ProductExe -ArgumentList $arguments -WindowStyle Hidden `
			-RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru

		$liveResponse = $null
		$cdpTargets = $null
		for ($attempt = 0; $attempt -lt 180; $attempt++) {
			Start-Sleep -Milliseconds 500
			try {
				$liveResponse = Invoke-Http "$baseUrl/live" -TimeoutSec 1
			} catch {
				$liveResponse = $null
			}
			try {
				$cdpTargets = Invoke-RestMethod -Uri "http://127.0.0.1:$cdpPort/json/list" -TimeoutSec 1
			} catch {
				$cdpTargets = $null
			}
			if ($liveResponse -and $liveResponse.statusCode -eq 200 -and @($cdpTargets).Count -gt 0) {
				break
			}
			if ($launcher.HasExited) {
				break
			}
		}

		if (!$liveResponse -or $liveResponse.statusCode -ne 200) {
			throw "Bundled Proxy did not become live on $baseUrl."
		}
		if (@($cdpTargets).Count -eq 0) {
			throw "Clean Windows product did not expose a Workbench target on CDP port $cdpPort."
		}

		$proxyProcessId = Get-ListenerProcessId $proxyPort
		if (!$proxyProcessId) {
			throw "Unable to identify the bundled Proxy listening on port $proxyPort."
		}
		$proxyProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $proxyProcessId"
		if (!$proxyProcess -or $proxyProcess.CommandLine -notlike "*$BundledProxyEntryPoint*") {
			throw 'Clean-start listener was not launched from the bundled Proxy entry point.'
		}

		$readyResponse = Invoke-Http "$baseUrl/ready"
		if ($readyResponse.statusCode -ne 503) {
			throw "Clean bundled Proxy /ready must report unconfigured HTTP 503, found $($readyResponse.statusCode)."
		}
		$ready = Convert-HttpJson $readyResponse 'Clean bundled Proxy /ready'
		if ($ready.status -ne 'unavailable') {
			throw "Clean bundled Proxy /ready must report status=unavailable, found $($ready.status)."
		}

		$modelsResponse = Invoke-Http "$baseUrl/v1/models"
		Assert-HttpSuccess $modelsResponse 'Clean bundled Proxy /v1/models'
		$models = Convert-HttpJson $modelsResponse 'Clean bundled Proxy /v1/models'
		if (@($models.data).Count -ne 0) {
			throw 'Clean bundled Proxy unexpectedly inherited a configured model catalog.'
		}

		$adminResponse = Invoke-Http "$baseUrl/admin"
		Assert-HttpSuccess $adminResponse 'Clean bundled Proxy /admin'
		if ($adminResponse.contentType -notmatch 'text/html') {
			throw 'Clean bundled Proxy /admin did not return HTML.'
		}

		$codeProcesses = @(
			Get-CimInstance Win32_Process |
				Where-Object {
					$_.Name -like 'Code*' -and
					$_.CommandLine -like "*$userData*"
				}
		)
		foreach ($process in $codeProcesses) {
			Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
		}
		if ($launcher -and !$launcher.HasExited) {
			Stop-Process -Id $launcher.Id -Force -ErrorAction SilentlyContinue
		}
		Start-Sleep -Seconds 2

		$afterExitLive = Invoke-Http "$baseUrl/live" -TimeoutSec 3
		Assert-HttpSuccess $afterExitLive 'Bundled Proxy after Code exit'
		$afterExitProcessId = Get-ListenerProcessId $proxyPort
		if ($afterExitProcessId -ne $proxyProcessId) {
			throw 'Bundled Proxy process changed or exited when Code closed.'
		}

		return [ordered]@{
			baseUrl = $baseUrl
			proxyProcessId = $proxyProcessId
			proxyEntryPoint = $BundledProxyEntryPoint
			initialProxyDataEntries = $initialProxyDataEntries
			cdpTargetCount = @($cdpTargets).Count
			readyStatusCode = $readyResponse.statusCode
			readyStatus = $ready.status
			modelCount = @($models.data).Count
			adminStatusCode = $adminResponse.statusCode
			proxySurvivedCodeExit = $true
			artifactDirectory = if ($KeepArtifacts) { $cleanRoot } else { $null }
		}
	} finally {
		Restore-ProcessEnvironment $originalEnvironment

		$remainingCode = @(
			Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
				Where-Object { $_.Name -like 'Code*' -and $_.CommandLine -like "*$userData*" }
		)
		foreach ($process in $remainingCode) {
			Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
		}

		if ($proxyProcessId) {
			$currentListener = Get-ListenerProcessId $proxyPort
			if ($currentListener -eq $proxyProcessId -and $proxyPort -ne 47892) {
				$testProxy = Get-CimInstance Win32_Process -Filter "ProcessId = $proxyProcessId" -ErrorAction SilentlyContinue
				if ($testProxy -and $testProxy.CommandLine -like "*$BundledProxyEntryPoint*") {
					Stop-Process -Id $proxyProcessId -Force -ErrorAction SilentlyContinue
				}
			}
		}

		if (!$KeepArtifacts -and (Test-Path -LiteralPath $cleanRoot)) {
			Remove-DirectoryWithRetry $cleanRoot $VerificationRoot
		}
	}
}

function Write-MarkdownReport([string]$Path, $Report) {
	$lines = @(
		'# AI Editor Windows Release Acceptance',
		'',
		"- Generated: $($Report.generatedAt)",
		"- Result: **$($Report.result)**",
		"- Product: $($Report.versions.code.name) $($Report.versions.code.version)",
		"- Product commit: ``$($Report.versions.code.commit)``",
		"- Proxy: $($Report.versions.proxy.version) @ ``$($Report.versions.proxy.commit)``",
		"- Codex: $($Report.versions.codex.version)",
		'',
		'## Artifacts',
		'',
		'| Artifact | Bytes | SHA-256 |',
		'| --- | ---: | --- |'
	)
	foreach ($artifact in $Report.artifacts) {
		$lines += "| $($artifact.name) | $($artifact.bytes) | ``$($artifact.sha256)`` |"
	}
	$lines += @(
		'',
		'## Product integrity',
		'',
		"- Product checksums: $($Report.productIntegrity.matchedChecksums)/$($Report.productIntegrity.totalChecksums)",
		"- Bundled Proxy payload files: $($Report.productIntegrity.proxyPayloadFileCount)",
		"- Required resources: $($Report.resources.Count)",
		'',
		'## Configured Proxy',
		'',
		"- Base URL: $($Report.configuredProxy.baseUrl)",
		"- Models: $($Report.configuredProxy.modelCount)",
		"- Admin: HTTP $($Report.configuredProxy.admin.statusCode) - $($Report.configuredProxy.admin.title)",
		"- Response tests: $($Report.configuredProxy.responseTests.Count)",
		'',
		'## Clean first start',
		''
	)
	if ($Report.cleanStart) {
		$lines += @(
			"- Base URL: $($Report.cleanStart.baseUrl)",
			"- Initial Proxy data entries: $($Report.cleanStart.initialProxyDataEntries)",
			"- Workbench CDP targets: $($Report.cleanStart.cdpTargetCount)",
			"- `/ready`: HTTP $($Report.cleanStart.readyStatusCode) - $($Report.cleanStart.readyStatus)",
			"- `/v1/models`: $($Report.cleanStart.modelCount) models",
			"- Proxy survived Code exit: $($Report.cleanStart.proxySurvivedCodeExit)"
		)
	} else {
		$lines += '- Skipped'
	}

	[System.IO.File]::WriteAllText(
		$Path,
		(($lines -join "`n") + "`n"),
		(New-Object System.Text.UTF8Encoding($false))
	)
}

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$repositoryParent = Split-Path $repoRoot -Parent
if (!$ProductRoot) {
	$ProductRoot = Join-Path $repositoryParent 'VSCode-win32-x64'
}
if (!$UserSetupPath) {
	$UserSetupPath = Join-Path $repoRoot '.build\win32-x64\user-setup\VSCodeSetup.exe'
}
if (!$SystemSetupPath) {
	$SystemSetupPath = Join-Path $repoRoot '.build\win32-x64\system-setup\VSCodeSetup.exe'
}
if (!$ReportPath) {
	$ReportPath = Join-Path $repoRoot '.build\ai-editor-release\windows-x64-release-report.json'
}

$ProductRoot = Get-FullPath $ProductRoot $repoRoot
$UserSetupPath = Get-FullPath $UserSetupPath $repoRoot
$SystemSetupPath = Get-FullPath $SystemSetupPath $repoRoot
$ReportPath = Get-FullPath $ReportPath $repoRoot
$reportDirectory = Split-Path $ReportPath -Parent
New-Item -ItemType Directory -Path $reportDirectory -Force | Out-Null

Assert-Directory $ProductRoot 'Windows product root'
Assert-File $UserSetupPath 'Windows user installer'
Assert-File $SystemSetupPath 'Windows system installer'
$configuredBaseUrl = Assert-LoopbackUrl $ConfiguredProxyBaseUrl 'Configured Proxy URL'

$productExe = Join-Path $ProductRoot 'Code - OSS.exe'
$appRoot = Join-Path $ProductRoot 'resources\app'
$productJsonPath = Join-Path $appRoot 'product.json'
$packageJsonPath = Join-Path $appRoot 'package.json'
$proxyRoot = Join-Path $appRoot 'ai-editor-proxy'
$proxyEntryPoint = Join-Path $proxyRoot 'src\server.js'

$requiredResourcePaths = [ordered]@{
	'Code executable' = $productExe
	'Product license' = Join-Path $appRoot 'LICENSE.txt'
	'Product third-party notices' = Join-Path $appRoot 'ThirdPartyNotices.txt'
	'Codex Agent Host' = Join-Path $appRoot 'out\vs\platform\agentHost\node\agentHostMain.js'
	'Codex JavaScript launcher' = Join-Path $appRoot 'node_modules\@openai\codex\bin\codex.js'
	'Codex Windows x64 runtime' = Join-Path $appRoot 'node_modules\@openai\codex-win32-x64\vendor\x86_64-pc-windows-msvc\bin\codex.exe'
	'Simplified Chinese language pack' = Join-Path $appRoot 'extensions\vscode-language-pack-zh-hans\package.json'
	'Bundled Proxy entry point' = $proxyEntryPoint
	'Bundled Proxy license' = Join-Path $proxyRoot 'LICENSE'
	'Bundled Proxy third-party notices' = Join-Path $proxyRoot 'ThirdPartyNotices.txt'
	'Bundled Proxy release manifest' = Join-Path $proxyRoot 'release-manifest.json'
}
$resources = @()
foreach ($entry in $requiredResourcePaths.GetEnumerator()) {
	$resources += Get-FileRecord $entry.Key $entry.Value
}

$productJson = Read-JsonFile $productJsonPath
$packageJson = Read-JsonFile $packageJsonPath
if ($productJson.aiEditorProxyBundled -ne $true) {
	throw 'Product does not require the bundled AI Editor Proxy.'
}
$productChecksums = @(Test-ProductChecksums $appRoot $productJson)
$proxyValidation = Test-ProxyArtifact $proxyRoot
$proxyManifest = $proxyValidation.manifest

$productNotices = Get-Content -Raw -LiteralPath (Join-Path $appRoot 'ThirdPartyNotices.txt') -Encoding UTF8
if ($productNotices -notmatch '(?im)^codex\s*$' -or $productNotices -notmatch 'github\.com/openai/codex') {
	throw 'Product ThirdPartyNotices.txt does not contain the Codex notice.'
}
$proxyNotices = Get-Content -Raw -LiteralPath (Join-Path $proxyRoot 'ThirdPartyNotices.txt') -Encoding UTF8
if ($proxyNotices -notmatch '(?im)^undici 8\.7\.0\s*$' -or $proxyNotices -notmatch 'Matteo Collina and Undici contributors') {
	throw 'Bundled Proxy ThirdPartyNotices.txt does not contain the undici notice.'
}

$codexPackage = Read-JsonFile (Join-Path $appRoot 'node_modules\@openai\codex\package.json')
$codexNativePackage = Read-JsonFile (Join-Path $appRoot 'node_modules\@openai\codex-win32-x64\package.json')
$languagePack = Read-JsonFile (Join-Path $appRoot 'extensions\vscode-language-pack-zh-hans\package.json')

$configuredProxy = Test-ConfiguredProxy `
	-BaseUrl $configuredBaseUrl `
	-TestResponses:$RunResponseTests `
	-RequestedSubscriptionModel $SubscriptionModel `
	-RequestedNonSubscriptionModel $NonSubscriptionModel `
	-TimeoutSec $ResponseTimeoutSec
$cleanStart = $null
if (!$SkipCleanStart) {
	$cleanStart = Test-CleanProductStart `
		-ProductExe $productExe `
		-BundledProxyEntryPoint $proxyEntryPoint `
		-VerificationRoot $reportDirectory `
		-KeepArtifacts:$KeepCleanStartArtifacts
}

$artifacts = @(
	Get-FileRecord 'Code - OSS.exe' $productExe
	Get-FileRecord 'Windows user installer' $UserSetupPath
	Get-FileRecord 'Windows system installer' $SystemSetupPath
)
$report = [ordered]@{
	schemaVersion = 1
	generatedAt = (Get-Date).ToUniversalTime().ToString('o')
	result = 'PASS'
	platform = 'win32-x64'
	versions = [ordered]@{
		code = [ordered]@{
			name = $productJson.nameLong
			version = $packageJson.version
			commit = $productJson.commit
			date = $productJson.date
		}
		proxy = [ordered]@{
			name = $proxyManifest.name
			version = $proxyManifest.version
			commit = $proxyManifest.commit
			builtAt = $proxyManifest.builtAt
		}
		codex = [ordered]@{
			version = $codexPackage.version
			nativeVersion = $codexNativePackage.version
		}
		languagePack = [ordered]@{
			id = "$($languagePack.publisher).$($languagePack.name)"
			version = $languagePack.version
		}
	}
	artifacts = $artifacts
	resources = $resources
	productIntegrity = [ordered]@{
		totalChecksums = $productChecksums.Count
		matchedChecksums = @($productChecksums | Where-Object { $_.match }).Count
		checksums = $productChecksums
		proxyPayloadFileCount = $proxyValidation.payloadFileCount
		productNoticesContainCodex = $true
		proxyNoticesContainUndici = $true
	}
	configuredProxy = $configuredProxy
	cleanStart = $cleanStart
}

[System.IO.File]::WriteAllText(
	$ReportPath,
	(($report | ConvertTo-Json -Depth 30) + "`n"),
	(New-Object System.Text.UTF8Encoding($false))
)
$markdownPath = [System.IO.Path]::ChangeExtension($ReportPath, '.md')
Write-MarkdownReport $markdownPath $report

[ordered]@{
	result = $report.result
	report = $ReportPath
	markdown = $markdownPath
	productChecksums = "$($report.productIntegrity.matchedChecksums)/$($report.productIntegrity.totalChecksums)"
	proxyPayloadFiles = $report.productIntegrity.proxyPayloadFileCount
	configuredModels = $report.configuredProxy.modelCount
	responseTests = $report.configuredProxy.responseTests.Count
	cleanStart = [bool]$report.cleanStart
	sharedProxyLive = (Convert-HttpJson (Invoke-Http "$configuredBaseUrl/live") 'Configured Proxy final /live').status
} | ConvertTo-Json -Depth 8
