$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$bin = 'C:\Users\dhruvmishra\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.1-full_build\bin'
$ffmpeg = Join-Path $bin 'ffmpeg.exe'
$ffprobe = Join-Path $bin 'ffprobe.exe'
$srcDir = Join-Path $root 'UpdateVideos'
$outDir = Join-Path $root 'portfolio\public\resources'
$tmpDir = Join-Path $root 'portfolio\tmp\video-encode'

if (-not (Test-Path $ffmpeg)) { throw "ffmpeg not found: $ffmpeg" }
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

function Get-DurationSeconds([string]$path) {
  [double](& $ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 $path)
}

$map = @(
  @{ Pattern = 'Voice_agent*'; Dest = 'audioAgent' },
  @{ Pattern = 'AI_transforms_raw_portraits*'; Dest = 'Cropio' },
  @{ Pattern = 'Fluent_UI_Android_animation_loop*'; Dest = 'FluentUI' },
  @{ Pattern = 'Family_preference_cards_forming*'; Dest = 'HybridRecommender' },
  @{ Pattern = 'Create_sketchbook_looping_projec*'; Dest = 'PersonalPorfolio' },
  @{ Pattern = 'Bloom_filter_research_throughput*'; Dest = 'BloomFilter' },
  @{ Pattern = 'Person_using_health_kiosk*'; Dest = 'InstantVitalCheckup' },
  @{ Pattern = 'Course_Evaluator_compares_univer*'; Dest = 'CourseEvaluator' },
  @{ Pattern = 'Vault_door_opens_to_ledger*'; Dest = 'AtomVault' }
)

$vf = 'scale=960:540:force_original_aspect_ratio=increase,crop=960:540,fps=24'

foreach ($entry in $map) {
  $src = Get-ChildItem -Path $srcDir -Filter $entry.Pattern | Select-Object -First 1
  if (-not $src) { throw "Missing source for $($entry.Dest) ($($entry.Pattern))" }

  $destMp4 = Join-Path $outDir "$($entry.Dest).mp4"
  $destWebp = Join-Path $outDir "$($entry.Dest).webp"
  $tmpMp4 = Join-Path $tmpDir "$($entry.Dest).mp4"
  $tmpWebp = Join-Path $tmpDir "$($entry.Dest).webp"

  Write-Host "=== $($entry.Dest) from $($src.Name) ==="

  $hasAudio = (& $ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 $src.FullName)
  $audioArgs = @('-an')
  if ($hasAudio) {
    $audioArgs = @('-c:a', 'aac', '-ac', '1', '-ar', '44100', '-b:a', '48k')
  }

  $ok = $false
  $tries = @(
    @{ Crf = 32; Max = '220k'; Buf = '440k'; Audio = '32k' },
    @{ Crf = 33; Max = '180k'; Buf = '360k'; Audio = '32k' },
    @{ Crf = 34; Max = '150k'; Buf = '300k'; Audio = '24k' },
    @{ Crf = 31; Max = '250k'; Buf = '500k'; Audio = '32k' }
  )
  foreach ($try in $tries) {
    $audioPass = @('-an')
    if ($hasAudio) {
      $audioPass = @('-c:a', 'aac', '-ac', '1', '-ar', '32000', '-b:a', $try.Audio)
    }
    if (Test-Path $tmpMp4) { Remove-Item $tmpMp4 -Force }
    & $ffmpeg -y -i $src.FullName -vf $vf -c:v libx264 -preset slow -crf $try.Crf -maxrate $try.Max -bufsize $try.Buf -profile:v high -level 3.1 -pix_fmt yuv420p -tag:v avc1 -movflags +faststart @audioPass $tmpMp4
    if ($LASTEXITCODE -ne 0) { throw "ffmpeg encode failed for $($entry.Dest) crf=$($try.Crf)" }
    $kb = [math]::Round((Get-Item $tmpMp4).Length / 1KB)
    Write-Host "  crf=$($try.Crf) max=$($try.Max) size=${kb}KB"
    if ($kb -ge 180 -and $kb -le 300) { $ok = $true; break }
    if ($kb -le 320) { $ok = $true; break }
  }
  if (-not $ok) {
    Write-Host "  keeping last encode ($([math]::Round((Get-Item $tmpMp4).Length / 1KB))KB)"
  }

  $duration = Get-DurationSeconds $tmpMp4
  $thumbAt = [math]::Max(0.4, [math]::Min($duration * 0.18, [math]::Max(0, $duration - 0.25)))
  if (Test-Path $tmpWebp) { Remove-Item $tmpWebp -Force }
  & $ffmpeg -y -ss $thumbAt -i $tmpMp4 -frames:v 1 -vf 'scale=960:540' -c:v libwebp -quality 78 -compression_level 6 -map_metadata -1 $tmpWebp
  if ($LASTEXITCODE -ne 0) { throw "thumbnail failed for $($entry.Dest)" }
  Write-Host "  thumb $([math]::Round((Get-Item $tmpWebp).Length / 1KB))KB @ ${thumbAt}s"

  Copy-Item $tmpMp4 $destMp4 -Force
  Copy-Item $tmpWebp $destWebp -Force
}

Write-Host "==== FINAL ===="
Get-ChildItem (Join-Path $outDir '*.mp4'), (Join-Path $outDir '*.webp') | ForEach-Object {
  '{0,-28} {1,8:N0} KB' -f $_.Name, ($_.Length / 1KB)
}
