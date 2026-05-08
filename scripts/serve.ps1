param(
  [int]$Port = 4173
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$server = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$server.Start()

Write-Host "PasteVault running at http://localhost:$Port/"
Write-Host "Press Ctrl+C to stop."

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".css" = "text/css; charset=utf-8"
  ".js" = "text/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".webmanifest" = "application/manifest+json; charset=utf-8"
}

function Send-Response {
  param(
    [System.Net.Sockets.NetworkStream]$Stream,
    [int]$Status,
    [string]$ContentType,
    [byte[]]$Body
  )

  $reason = if ($Status -eq 200) { "OK" } else { "Not Found" }
  $header = "HTTP/1.1 $Status $reason`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nConnection: close`r`n`r`n"
  $headerBytes = [Text.Encoding]::ASCII.GetBytes($header)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  $Stream.Write($Body, 0, $Body.Length)
}

try {
  while ($true) {
    $client = $server.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = [System.IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 1024, $true)
      $requestLine = $reader.ReadLine()
      if (-not $requestLine) {
        continue
      }

      while ($reader.Peek() -ge 0) {
        $line = $reader.ReadLine()
        if ([string]::IsNullOrEmpty($line)) {
          break
        }
      }

      $parts = $requestLine.Split(" ")
      $rawPath = if ($parts.Length -ge 2) { $parts[1].Split("?")[0].TrimStart("/") } else { "" }
      $path = [Uri]::UnescapeDataString($rawPath)
      if ([string]::IsNullOrWhiteSpace($path)) {
        $path = "index.html"
      }

      $combined = Join-Path $root $path
      $resolved = [System.IO.Path]::GetFullPath($combined)
      $rootResolved = [System.IO.Path]::GetFullPath($root)

      if (-not $resolved.StartsWith($rootResolved, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
        Send-Response -Stream $stream -Status 404 -ContentType "text/plain; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes("Not found"))
      } else {
        $extension = [System.IO.Path]::GetExtension($resolved)
        $contentType = $mime[$extension]
        if (-not $contentType) {
          $contentType = "application/octet-stream"
        }
        Send-Response -Stream $stream -Status 200 -ContentType $contentType -Body ([System.IO.File]::ReadAllBytes($resolved))
      }
    } finally {
      $client.Close()
    }
  }
} finally {
  $server.Stop()
}
