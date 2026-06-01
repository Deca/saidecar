$projectRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
Set-Location -LiteralPath $projectRoot

if ($env:ZELLIJ) {
    npm run zellij:pane
    exit $LASTEXITCODE
}

npm run zellij:session
