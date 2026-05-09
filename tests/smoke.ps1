$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$required = @(
  "index.html",
  "src/main.jsx",
  "src/App.jsx",
  "src/styles.css",
  "src/components/ui/button.jsx",
  "src/components/ui/dropdown-menu.jsx",
  "manifest.webmanifest"
)

foreach ($file in $required) {
  $path = Join-Path $root $file
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Missing $file"
  }
}

$html = Get-Content -Raw -LiteralPath (Join-Path $root "index.html")
$app = Get-Content -Raw -LiteralPath (Join-Path $root "src/App.jsx")
$css = Get-Content -Raw -LiteralPath (Join-Path $root "src/styles.css")
$package = Get-Content -Raw -LiteralPath (Join-Path $root "package.json")

@(
  "/src/main.jsx",
  "id=`"root`""
) | ForEach-Object {
  if ($html -notmatch [regex]::Escape($_)) {
    throw "HTML missing $_"
  }
}

@(
  "DropdownMenu",
  "ClipboardCopy",
  "theme-dark",
  "theme-light",
  "ReactBitsBackdrop",
  "Password optional",
  "Clipboard ID",
  "Selected clip",
  "Copy link",
  "Clip saved successfully"
) | ForEach-Object {
  if ($app -notmatch [regex]::Escape($_)) {
    throw "App missing $_"
  }
}

@(
  ".theme-light",
  ".theme-dark",
  ".sidebar",
  ".editor-card",
  ".history-panel",
  ".details-panel",
  ".toast"
) | ForEach-Object {
  if ($css -notmatch [regex]::Escape($_)) {
    throw "CSS missing $_"
  }
}

@(
  "react",
  "lucide-react",
  "@radix-ui/react-dropdown-menu",
  "vite"
) | ForEach-Object {
  if ($package -notmatch [regex]::Escape($_)) {
    throw "package.json missing $_"
  }
}

if ($html -match "\{\{|\}\}" -or $app -match "\{\{|\}\}" -or $css -match "\{\{|\}\}") {
  throw "App contains unresolved placeholders"
}

Write-Host "Smoke checks passed."
