Set-StrictMode -Version Latest

function Assert-AiEditorFinalEdgeRelease($ReleaseSource, $ArtifactValidation) {
	if ([string]$ReleaseSource.productTarget -cne 'edge') {
		throw "Final Edge-only release requires release.json productTarget=edge; found $($ReleaseSource.productTarget)."
	}

	if ([string]$ArtifactValidation.target -cne 'edge') {
		throw "Final Edge-only release requires an Edge product artifact; found $($ArtifactValidation.target)."
	}

	$manifest = $ArtifactValidation.manifest
	if (
		$manifest.schemaVersion -ne 2 -or
		[string]$manifest.target -cne 'edge' -or
		[string]$manifest.entryPoint -cne 'src/launcher.js'
	) {
		throw 'Final Edge-only release requires a schema 2 Edge manifest with entryPoint=src/launcher.js.'
	}

	$edgeTarget = $ReleaseSource.targets.edge
	if (
		[string]$edgeTarget.entryPoint -cne 'src/launcher.js' -or
		[bool]$edgeTarget.npmWorkspaces
	) {
		throw 'Final Edge-only release source has an invalid Edge entry point or workspace policy.'
	}

	foreach ($relativePath in @($manifest.files.PSObject.Properties.Name)) {
		Assert-AiEditorEdgeReleasePath $relativePath
	}
}

function Assert-AiEditorEdgeReleasePath([string]$RelativePath) {
	$normalized = $RelativePath.Replace('\', '/').ToLowerInvariant()
	if ($normalized -match '\.(db|sqlite|sqlite3)($|[.-])') {
		throw "Final Edge-only release contains a database resource: $RelativePath"
	}
	if (
		$normalized.StartsWith('gateway/') -or
		$normalized.StartsWith('src/admin/') -or
		$normalized.StartsWith('src/admin_modules/') -or
		$normalized.StartsWith('src/routes/') -or
		$normalized -in @(
			'src/admin.html',
			'src/admin.js',
			'src/admin_app.js',
			'src/admin_html_head.txt',
			'src/admin_ui_behaviors.cjs',
			'src/chatgpt-accounts.js',
			'src/credential-store.js',
			'src/migrations.js',
			'src/server.js'
		)
	) {
		throw "Final Edge-only release contains a forbidden Gateway, admin, Provider, or credential resource: $RelativePath"
	}
}
