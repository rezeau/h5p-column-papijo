[CmdletBinding()]
param(
  [string]$AdvancedTextPath = 'C:\my_first_h5p_environment\libraries\H5P.AdvancedText-1.1',
  [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
  $OutputDirectory = $root
}
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

$library = Get-Content -Raw -LiteralPath (Join-Path $root 'library.json') | ConvertFrom-Json
$version = "$($library.majorVersion).$($library.minorVersion).$($library.patchVersion)"
$libraryFolderName = "$($library.machineName)-$($library.majorVersion).$($library.minorVersion)"
$outputPath = Join-Path $OutputDirectory "$($library.machineName)-$version.h5p"
$stage = Join-Path ([System.IO.Path]::GetTempPath()) "column-papijo-release-$([guid]::NewGuid().ToString('N'))"
$zipPath = [System.IO.Path]::ChangeExtension($outputPath, '.zip')

$forbiddenPatterns = @(
  '(^|/)\.[^/]+',
  '(^|/)(crowdin\.yml|package\.json|package-lock\.json|\.gitignore|\.eslintrc(?:\.json)?|\.h5pignore)$',
  '(^|/)(\.github|\.git|node_modules|tests|tools|src|source)(/|$)',
  '\.(?:map|ts|tsx|scss|sass)$'
)

function Copy-AllowlistedFile {
  param(
    [Parameter(Mandatory)] [string]$SourceRoot,
    [Parameter(Mandatory)] [string]$RelativePath,
    [Parameter(Mandatory)] [string]$DestinationRoot
  )

  $source = Join-Path $SourceRoot ($RelativePath -replace '/', [System.IO.Path]::DirectorySeparatorChar)
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    throw "Required runtime file is missing: $source"
  }
  $destination = Join-Path $DestinationRoot ($RelativePath -replace '/', [System.IO.Path]::DirectorySeparatorChar)
  New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
  Copy-Item -LiteralPath $source -Destination $destination
}

function Get-LanguageFiles {
  param([Parameter(Mandatory)] [string]$LibraryRoot)

  $languageRoot = Join-Path $LibraryRoot 'language'
  if (-not (Test-Path -LiteralPath $languageRoot -PathType Container)) {
    return @()
  }
  return @(Get-ChildItem -LiteralPath $languageRoot -File -Filter '*.json' |
    Where-Object { $_.Name -notmatch '^\.' } |
    Sort-Object Name |
    ForEach-Object { "language/$($_.Name)" })
}

function Test-StagedLibrary {
  param([Parameter(Mandatory)] [string]$LibraryDirectory)

  $metadataPath = Join-Path $LibraryDirectory 'library.json'
  $metadata = Get-Content -Raw -LiteralPath $metadataPath | ConvertFrom-Json
  $expectedFolderName = "$($metadata.machineName)-$($metadata.majorVersion).$($metadata.minorVersion)"
  if ((Split-Path -Leaf $LibraryDirectory) -ne $expectedFolderName) {
    throw "Library directory does not match its manifest: $LibraryDirectory"
  }
  foreach ($asset in @($metadata.preloadedJs) + @($metadata.preloadedCss)) {
    if ($null -ne $asset -and -not (Test-Path -LiteralPath (Join-Path $LibraryDirectory $asset.path) -PathType Leaf)) {
      throw "Preloaded runtime asset is missing from $expectedFolderName`: $($asset.path)"
    }
  }
  return $metadata
}

try {
  New-Item -ItemType Directory -Path $stage -Force | Out-Null

  $columnDestination = Join-Path $stage $libraryFolderName
  $columnFiles = @(
    'library.json',
    'semantics.json',
    'icon.svg',
    'presave.js',
    'scripts/h5p-column.js',
    'styles/h5p-column.css'
  ) + (Get-LanguageFiles -LibraryRoot $root)

  foreach ($relativePath in $columnFiles) {
    if ($relativePath -ne 'library.json') {
      if ($relativePath -eq 'semantics.json') {
        $baselineText = (& git -C $root show "v1.17.6:$relativePath") -join "`n"
        $expectedText = $baselineText.Replace(
          'H5P.DragTextPapiJo 1.2',
          'H5P.DragTextPapiJo 1.3'
        )
        $expectedJson = $expectedText | ConvertFrom-Json
        $workingJson = Get-Content -Raw -LiteralPath (Join-Path $root $relativePath) | ConvertFrom-Json
        $expectedCanonical = $expectedJson | ConvertTo-Json -Compress -Depth 100
        $workingCanonical = $workingJson | ConvertTo-Json -Compress -Depth 100
        if ($workingCanonical -cne $expectedCanonical) {
          throw 'semantics.json differs from H5P.ColumnPapiJo 1.17.6 beyond the DragTextPapiJo 1.3 update.'
        }
      }
      else {
        $workingPath = Join-Path $root ($relativePath -replace '/', [System.IO.Path]::DirectorySeparatorChar)
        $headHash = (& git -C $root rev-parse "HEAD:$relativePath").Trim()
        $workingHash = (& git -C $root hash-object --no-filters $workingPath).Trim()
        if ($LASTEXITCODE -ne 0 -or $workingHash -ne $headHash) {
          throw "Production runtime file differs from HEAD: $relativePath"
        }
      }
    }
    Copy-AllowlistedFile -SourceRoot $root -RelativePath $relativePath -DestinationRoot $columnDestination
  }

  $advancedTextLibrary = Get-Content -Raw -LiteralPath (Join-Path $AdvancedTextPath 'library.json') | ConvertFrom-Json
  if ($advancedTextLibrary.machineName -ne 'H5P.AdvancedText' -or
      $advancedTextLibrary.majorVersion -ne 1 -or
      $advancedTextLibrary.minorVersion -ne 1) {
    throw 'The configured AdvancedText dependency is not H5P.AdvancedText 1.1.'
  }
  $advancedTextFolderName = "$($advancedTextLibrary.machineName)-$($advancedTextLibrary.majorVersion).$($advancedTextLibrary.minorVersion)"
  $advancedTextDestination = Join-Path $stage $advancedTextFolderName
  $advancedTextFiles = @(
    'library.json',
    'semantics.json',
    'icon.svg',
    'text.js',
    'text.css'
  ) + (Get-LanguageFiles -LibraryRoot $AdvancedTextPath)
  foreach ($relativePath in $advancedTextFiles) {
    Copy-AllowlistedFile -SourceRoot $AdvancedTextPath -RelativePath $relativePath -DestinationRoot $advancedTextDestination
  }

  $h5pMetadata = [ordered]@{
    title = "ColumnPapiJo $version"
    language = 'en'
    mainLibrary = $library.machineName
    embedTypes = @('iframe')
    license = 'U'
    defaultLanguage = 'en'
    preloadedDependencies = @(
      [ordered]@{
        machineName = $advancedTextLibrary.machineName
        majorVersion = $advancedTextLibrary.majorVersion
        minorVersion = $advancedTextLibrary.minorVersion
      },
      [ordered]@{
        machineName = $library.machineName
        majorVersion = $library.majorVersion
        minorVersion = $library.minorVersion
      }
    )
  }
  $content = [ordered]@{
    content = @(
      [ordered]@{
        content = [ordered]@{
          library = 'H5P.AdvancedText 1.1'
          params = [ordered]@{
            text = "<p>H5P.ColumnPapiJo $version release smoke test.</p>"
          }
          subContentId = '9bcdd494-7b80-4fb9-9e91-211cd1f17a04'
          metadata = [ordered]@{
            contentType = 'Text'
            license = 'U'
            title = 'ColumnPapiJo release smoke-test text'
          }
        }
        useSeparator = 'auto'
      }
    )
  }

  $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText(
    (Join-Path $stage 'h5p.json'),
    ($h5pMetadata | ConvertTo-Json -Depth 10),
    $utf8NoBom
  )
  $contentDirectory = Join-Path $stage 'content'
  New-Item -ItemType Directory -Path $contentDirectory -Force | Out-Null
  [System.IO.File]::WriteAllText(
    (Join-Path $contentDirectory 'content.json'),
    ($content | ConvertTo-Json -Depth 10),
    $utf8NoBom
  )

  $stagedFiles = @(Get-ChildItem -Recurse -File -LiteralPath $stage)
  foreach ($file in $stagedFiles) {
    $relativePath = $file.FullName.Substring($stage.Length + 1).Replace('\', '/')
    foreach ($pattern in $forbiddenPatterns) {
      if ($relativePath -match $pattern) {
        throw "Forbidden development file selected for packaging: $relativePath"
      }
    }
    if ($file.Extension -eq '.json') {
      Get-Content -Raw -LiteralPath $file.FullName | ConvertFrom-Json | Out-Null
    }
  }

  foreach ($dependency in $h5pMetadata.preloadedDependencies) {
    $dependencyFolder = Join-Path $stage "$($dependency.machineName)-$($dependency.majorVersion).$($dependency.minorVersion)"
    if (-not (Test-Path -LiteralPath (Join-Path $dependencyFolder 'library.json') -PathType Leaf)) {
      throw "Dependency closure is incomplete: $($dependency.machineName) $($dependency.majorVersion).$($dependency.minorVersion)"
    }
  }

  $expectedTopDirectories = @('content', $libraryFolderName, $advancedTextFolderName)
  $unexpectedTopDirectories = @(Get-ChildItem -LiteralPath $stage -Directory |
    Where-Object { $_.Name -notin $expectedTopDirectories })
  if ($unexpectedTopDirectories.Count -gt 0) {
    throw "Unexpected package directories: $($unexpectedTopDirectories.Name -join ', ')"
  }
  Test-StagedLibrary -LibraryDirectory $columnDestination | Out-Null
  Test-StagedLibrary -LibraryDirectory $advancedTextDestination | Out-Null

  if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
  }
  if (Test-Path -LiteralPath $outputPath) {
    Remove-Item -LiteralPath $outputPath -Force
  }
  Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zipPath -CompressionLevel Optimal
  Move-Item -LiteralPath $zipPath -Destination $outputPath

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($outputPath)
  try {
    $entryNames = @($archive.Entries | ForEach-Object { $_.FullName })
    $duplicates = @($entryNames | Group-Object | Where-Object Count -gt 1)
    if ($duplicates.Count -gt 0) {
      throw "Duplicate archive entries: $($duplicates.Name -join ', ')"
    }
    foreach ($entry in $archive.Entries) {
      $normalized = $entry.FullName.Replace('\', '/')
      if ($normalized -match '(^/)|(^[A-Za-z]:)|(^|/)\.\.(/|$)') {
        throw "Unsafe archive entry: $normalized"
      }
      foreach ($pattern in $forbiddenPatterns) {
        if ($normalized -match $pattern) {
          throw "Forbidden development file in archive: $normalized"
        }
      }
      if (-not $normalized.EndsWith('/')) {
        $stream = $entry.Open()
        try {
          $buffer = New-Object byte[] 8192
          while ($stream.Read($buffer, 0, $buffer.Length) -gt 0) {}
        }
        finally {
          $stream.Dispose()
        }
      }
    }
  }
  finally {
    $archive.Dispose()
  }

  $package = Get-Item -LiteralPath $outputPath
  $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $outputPath
  Write-Output "Built $($package.FullName)"
  Write-Output "Version: $version"
  Write-Output "Size: $($package.Length) bytes"
  Write-Output "SHA-256: $($hash.Hash)"
  Write-Output "Archive entries: $($entryNames.Count)"
  Write-Output "Bundled libraries: $libraryFolderName, $advancedTextFolderName"
  Write-Output 'Forbidden development files: none'
}
finally {
  if (Test-Path -LiteralPath $stage) {
    $resolvedStage = [System.IO.Path]::GetFullPath($stage)
    $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    if (-not $resolvedStage.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to clean unsafe staging path: $resolvedStage"
    }
    Remove-Item -LiteralPath $resolvedStage -Recurse -Force
  }
}
