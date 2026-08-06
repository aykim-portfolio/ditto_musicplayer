<#
    ditto — 카탈로그 생성기

    js/data.js 의 검색어로 iTunes Search API 를 한 번 훑어 앨범아트·미리듣기 URL 을
    js/catalog.js 에 박아둔다. 앱은 이 파일을 먼저 읽고, 없는 쌍만 런타임에 조회한다.

    왜 필요한가:
      앱이 홈 화면 한 번 그리는 데 iTunes 를 20번 넘게 호출하고 있었다(10쌍 × 원곡+리메이크).
      Apple 의 한도는 IP 당 분당 20회 수준인데 그 할당량을 46ms 에 다 썼다.
      데스크톱은 IP 를 혼자 쓰니 통과하지만, 이동통신망은 CGNAT 이라 수많은 가입자가
      공인 IP 하나를 공유해서 이미 소진된 상태로 막힌다.
      실패하면 artwork='' / previewUrl=null 이 되어 아트워크는 자리만 남고
      재생은 "미리듣기를 제공하지 않는 곡" 이라는 엉뚱한 메시지가 뜬다.

    언제 다시 돌리나:
      Apple 이 미리듣기 URL 을 주기적으로 교체한다. 재생이 안 되기 시작하면 이 스크립트를
      다시 돌려 js/catalog.js 를 갱신하고 커밋한다. 아트워크 URL 은 비교적 오래 간다.

    사용법:
      powershell -ExecutionPolicy Bypass -File tools/fetch_catalog.ps1
#>

[CmdletBinding()]
param(
    [string] $DataFile,
    [string] $OutFile,
    [string] $Country     = 'KR',
    # 한도(IP 당 분당 20회 수준)에 걸리지 않도록 호출 사이를 띄운다.
    # 20회 × 1.5초 ≈ 30초. 앱이 46ms 에 몰아치던 것과 정반대로 간다.
    [int]    $DelayMs     = 1500
)

$ErrorActionPreference = 'Stop'
$endpoint = 'https://itunes.apple.com/search'

# $PSScriptRoot 는 param 기본값 자리에서 늘 채워지지는 않는다. 본문에서 잡는다.
$root = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { (Get-Location).Path }
if (-not $DataFile) { $DataFile = Join-Path $root 'js\data.js' }
if (-not $OutFile)  { $OutFile  = Join-Path $root 'js\catalog.js' }

if (-not (Test-Path $DataFile)) { throw "데이터 파일을 찾을 수 없습니다: $DataFile" }

# data.js 는 JS 라 그대로 파싱할 수 없다. 형식이 규칙적이라 쌍 단위로 잘라 쓴다.
# id → original.query → remake.query 순서가 파일 전체에서 지켜진다.
$src = Get-Content -LiteralPath $DataFile -Raw -Encoding UTF8

$pairBlocks = [regex]::Matches(
    $src,
    "id:\s*'(?<id>[^']+)'(?<body>.*?)(?=\r?\n\s*\},)",
    [System.Text.RegularExpressions.RegexOptions]::Singleline
)
if ($pairBlocks.Count -eq 0) { throw 'data.js 에서 쌍을 하나도 찾지 못했습니다. 형식이 바뀌었는지 확인하세요.' }

function Get-ItunesTrack {
    param([string] $Term)

    $url = "$endpoint`?term=$([uri]::EscapeDataString($Term))&media=music&entity=song&country=$Country&limit=5"
    try {
        $res = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 20
    } catch {
        Write-Warning "  요청 실패: $Term — $($_.Exception.Message)"
        return $null
    }
    # 앱과 같은 규칙: 미리듣기가 있는 첫 결과를 쓴다.
    $hit = $res.results | Where-Object { $_.previewUrl } | Select-Object -First 1
    if (-not $hit) { Write-Warning "  결과 없음: $Term"; return $null }

    [pscustomobject]@{
        album      = if ($hit.collectionName) { $hit.collectionName } else { '' }
        artwork    = ($hit.artworkUrl100 -replace '100x100', '600x600')
        previewUrl = $hit.previewUrl
    }
}

$entries = New-Object System.Collections.Generic.List[string]
$okCount = 0
$missCount = 0

foreach ($block in $pairBlocks) {
    $id = $block.Groups['id'].Value
    $body = $block.Groups['body'].Value

    $queries = [regex]::Matches($body, "query:\s*'(?<q>[^']+)'")
    # ytQuery 도 'query:' 로 끝나 같이 걸린다 — iTunes 검색어만 골라낸다.
    $itunesQueries = @($queries | Where-Object { $_.Value -notmatch 'ytQuery' } | ForEach-Object { $_.Groups['q'].Value })
    if ($itunesQueries.Count -lt 2) {
        Write-Warning "$id : 검색어를 2개 찾지 못했습니다 (찾은 수: $($itunesQueries.Count)). 건너뜁니다."
        continue
    }

    Write-Host "$id"
    $sides = @{}
    foreach ($side in @(@{ name = 'original'; q = $itunesQueries[0] }, @{ name = 'remake'; q = $itunesQueries[1] })) {
        Write-Host "  $($side.name): $($side.q)"
        $track = Get-ItunesTrack -Term $side.q
        if ($track) { $sides[$side.name] = $track; $okCount++ } else { $missCount++ }
        Start-Sleep -Milliseconds $DelayMs
    }

    if ($sides.Count -eq 0) { continue }

    $sideJson = foreach ($name in @('original', 'remake')) {
        if (-not $sides.ContainsKey($name)) { continue }
        $t = $sides[$name]
        $album   = $t.album      -replace '\\', '\\\\' -replace "'", "\'"
        $artwork = $t.artwork
        $preview = $t.previewUrl
        "    $name`: { album: '$album', artwork: '$artwork', previewUrl: '$preview' },"
    }

    $entries.Add("  '$id': {`n$($sideJson -join "`n")`n  },")
}

$header = @"
/* ============================================================
   ditto — iTunes 메타 스냅샷 (자동 생성물, 직접 고치지 마세요)

   tools/fetch_catalog.ps1 로 다시 만듭니다.
   앱은 이 표를 먼저 보고, 여기 없는 쌍만 런타임에 iTunes 로 조회합니다.
   그래서 홈 화면을 그리는 데 드는 네트워크 요청이 0 이 됩니다.

   Apple 이 미리듣기 URL 을 주기적으로 교체하므로, 재생이 안 되기 시작하면
   스크립트를 다시 돌려 이 파일을 갱신하고 커밋하세요.

   생성 시각: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
   ============================================================ */

window.DITTO_CATALOG = {
"@

$body = ($entries -join "`n")
$out = "$header`n$body`n};`n"

# BOM 없는 UTF-8 로 쓴다 — 브라우저가 읽을 파일이고, BOM 이 붙으면 앞에 잡음이 낀다.
$outDir = Split-Path -Parent $OutFile
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force $outDir | Out-Null }
$outPath = Join-Path (Resolve-Path -LiteralPath $outDir).Path (Split-Path -Leaf $OutFile)
[System.IO.File]::WriteAllText($outPath, $out, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ''
Write-Host "완료: $OutFile"
Write-Host "  담긴 항목 $okCount 개 / 실패·누락 $missCount 개"
if ($missCount -gt 0) {
    Write-Host '  누락된 쪽은 앱이 런타임에 조회합니다. 한도에 걸린 것 같으면 잠시 뒤 다시 돌리세요.'
}
