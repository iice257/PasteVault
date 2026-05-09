$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$required = @(
  "index.html",
  "src/main.jsx",
  "src/App.jsx",
  "src/pages/LandingPage.jsx",
  "src/pages/ClipboardPage.jsx",
  "src/features/clipboard/clipboard-store.js",
  "src/styles.css",
  "src/components/ui/button.jsx",
  "src/components/ui/dropdown-menu.jsx",
  "src/components/ui/card.jsx",
  "src/components/ui/dialog.jsx",
  "src/components/ui/sheet.jsx",
  "src/components/ui/tabs.jsx",
  "manifest.webmanifest"
)

foreach ($file in $required) {
  $path = Join-Path $root $file
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Missing $file"
  }
}

$html = Get-Content -Raw -LiteralPath (Join-Path $root "index.html")
$app = @(
  Get-Content -Raw -LiteralPath (Join-Path $root "src/App.jsx")
  Get-Content -Raw -LiteralPath (Join-Path $root "src/pages/LandingPage.jsx")
  Get-Content -Raw -LiteralPath (Join-Path $root "src/pages/ClipboardPage.jsx")
  Get-Content -Raw -LiteralPath (Join-Path $root "src/features/clipboard/clipboard-store.js")
) -join "`n"
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
  "Password optional",
  "Clipboard ID",
  "Selected clip",
  "Copy link",
  "Password cannot be recovered"
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
  "landing-background.svg",
  ".toast"
) | ForEach-Object {
  if ($css -notmatch [regex]::Escape($_)) {
    throw "CSS missing $_"
  }
}

@(
  "react",
  "lucide-react",
  "@heroui/react",
  "motion",
  "@radix-ui/react-dropdown-menu",
  "vite"
) | ForEach-Object {
  if ($package -notmatch [regex]::Escape($_)) {
    throw "package.json missing $_"
  }
}

$api = Get-Content -Raw -LiteralPath (Join-Path $root "api/clip/[id].js")
@(
  "UPSTASH_REDIS_REST_URL",
  "KV_REST_API_URL",
  "Too many requests",
  "encryptedPayload"
) | ForEach-Object {
  if ($api -notmatch [regex]::Escape($_)) {
    throw "API missing $_"
  }
}

if ($html -match "\{\{[A-Z_]+\}\}" -or $app -match "\{\{[A-Z_]+\}\}" -or $css -match "\{\{[A-Z_]+\}\}") {
  throw "App contains unresolved placeholders"
}

Write-Host "Smoke checks passed."
