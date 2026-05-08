$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$required = @(
  "index.html",
  "styles.css",
  "app.js",
  "manifest.webmanifest",
  "sw.js"
)

foreach ($file in $required) {
  $path = Join-Path $root $file
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Missing $file"
  }
}

$html = Get-Content -Raw -LiteralPath (Join-Path $root "index.html")
$js = Get-Content -Raw -LiteralPath (Join-Path $root "app.js")
$css = Get-Content -Raw -LiteralPath (Join-Path $root "styles.css")

@(
  "clipText",
  "saveButton",
  "pasteButton",
  "copyLatestButton",
  "shareDraftButton",
  "clipList",
  "detailCard"
) | ForEach-Object {
  if ($html -notmatch $_) {
    throw "HTML missing $_"
  }
}

@(
  "indexedDB.open",
  "navigator.clipboard.readText",
  "navigator.clipboard.writeText",
  "encodePayload",
  "decodePayload",
  "exportHistory",
  "importHistory",
  "serviceWorker"
) | ForEach-Object {
  if ($js -notmatch [regex]::Escape($_)) {
    throw "JavaScript missing $_"
  }
}

if ($css -match "\{\{|\}\}") {
  throw "CSS contains unresolved placeholders"
}

if ($html -match "\{\{|\}\}" -or $js -match "\{\{|\}\}") {
  throw "App contains unresolved placeholders"
}

Write-Host "Smoke checks passed."
