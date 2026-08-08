# 디토 (ditto) — 시간 여행 오디오 플레이어

원곡 ↔ 리메이크를 **재생 위치를 유지한 채** 크로스페이드로 오가는 '타임 셔틀' 뮤직 플레이어 PoC.

## 실행 방법

YouTube IFrame 플레이어는 `file://` 환경에서 제약이 있으므로 로컬 서버 실행을 권장합니다.

```powershell
# 방법 1 — run.bat 더블클릭 (Python 필요)
# 방법 2 — 직접 실행
cd ditto
python -m http.server 5173
# 브라우저에서 http://localhost:5173 접속
```

iTunes 30초 미리듣기만 쓸 경우 `index.html` 더블클릭으로도 동작합니다.

## API 키 설정 (보안)

- **iTunes Search API**: 키 불필요. 기본 재생 소스(30초 미리듣기)로 바로 동작.
- **YouTube Data API v3**: 앱 우상단 **⚙️ 설정**에서 키 입력 → 브라우저 `localStorage`에만 저장됩니다.
  - 코드/저장소에 키를 커밋하지 마세요 ([js/config.js](js/config.js)의 `YOUTUBE_API_KEY`는 비워둔 상태 유지).
  - GCP 콘솔 → 사용자 인증 정보 → 키 제한: **HTTP 리퍼러** + **YouTube Data API v3만 허용** 권장.
  - 설정에서 재생 소스를 "YouTube 전체 곡"으로 바꾸면 `곡명+가수명+Official Audio` 규칙으로 영상을 매칭해 전체 곡을 재생합니다.

## 핵심 기능 (PRD 매핑)

| PRD | 구현 |
|---|---|
| 타임 셔틀 토글 (P0) | 플레이어의 셔틀 콘솔 — 두 정거장(연도·가수)과 그 사이 연차. 슬라이더를 끌거나 정거장을 눌러 이동. 현재 시간 저장 → 새 음원 seekTo → 크로스페이드 |
| 크로스페이드 | 1,200ms 등가전력(cos/sin) 볼륨 램프 ([js/player.js](js/player.js)) |
| 버퍼링 안전 락 (PRD 5-2) | 새 음원 `canplay`/`PLAYING` 확인 후에만 기존 음원 페이드아웃 |
| 듀얼 테마 스킨 (P0) | 한 팔레트의 양 끝을 쓴다 — 원곡 모드 = RETRO(짙은 초록·픽셀 서체·각진 모서리), 리메이크 모드 = MODERN(민트·둥근 모서리) 실시간 전환 |
| 글자 크기 척도 | 짝수만 쓴다 — `6 · 8 · 10 · 12 · 14 · 16 · 18 · 20 · 22 · 24 · 26 · 52px` (MAKING-OF 30번) |
| 서체 | RETRO 디스플레이 = 둥근모꼴+ Fixedsys (폴백 Galmuri11), RETRO 포인트 = 가나초콜릿체, MODERN = Paperlogy + Open Sans. 전부 CDN (MAKING-OF 32번) |
| 글리치 타임슬립 연출 (PRD 5-1) | 방향이 있는 전환 — 과거로는 차갑게 줄무늬가 오른쪽으로, 현재로는 따뜻하게 왼쪽으로. 가운데 연도가 출발→도착으로 굴러간다. + 햅틱(지원 기기) |
| 연대순 정렬 | 홈 목록은 보고 있는 시대의 연도 오름차순. TUNER 다이얼·DIAL 휠이 연표로 읽힌다 |
| PoC 추천 트랙 10쌍 (P0) | [js/data.js](js/data.js) 수동 데이터셋 (응답하라 시리즈 OST, 꽃갈피 등) |
| iTunes 메타데이터 연동 | 곡명/아티스트/연도/앨범아트/30초 미리듣기 (JSONP) |
| YouTube 소스 검색 (P1) | Data API v3 + IFrame Player API 듀얼 플레이어 |

## 구조

```
ditto/
├── index.html        # 430×932 모바일 캔버스(iPhone 14 Pro Max), Home/Search/Library/Player
├── css/style.css     # MODERN·RETRO 듀얼 테마, 글리치 애니메이션
├── js/
│   ├── config.js     # 설정·키 관리 (키는 localStorage)
│   ├── data.js       # PoC 트랙 10쌍
│   ├── catalog.js    # iTunes 메타 스냅샷 (tools/fetch_catalog.ps1 로 생성)
│   ├── align.js      # 시대 간 위치 대응표 (tools/manual_align.html 로 측정)
│   ├── itunes.js     # iTunes Search API (JSONP)
│   ├── youtube.js    # YT Data API 검색 + IFrame 엔진
│   ├── player.js     # 타임 셔틀 / 크로스페이드 엔진
│   └── app.js        # UI·화면 전환·인터랙션
└── tools/
    ├── manual_align.html    # 수동 오프셋 정렬 도구
    ├── estimate_offsets.py  # onset 기반 자동 추정 (실패로 판명 — 기록용)
    └── fetch_catalog.ps1    # iTunes 메타 스냅샷 생성
```

## 알려진 제약 (PRD 4-3)

- **셔틀 전환 시 가사 어긋남:** iTunes 미리듣기는 원곡과 리메이크에서 다른 지점을 발췌하므로, `align.js` 에 오프셋을 채우기 전까지 같은 시간으로 넘어간다 (가사가 되돌아가거나 튀는 증상). 자동 정렬은 크로마·온셋 두 방식 모두 실패했다 (10쌍 실측 `r` = 0.08~0.47, 임계값 0.45 통과 1쌍 — MAKING-OF 26·29번). `tools/manual_align.html` 로 귀로 측정하는 것이 유일한 경로.
- 미리듣기 소스는 30초 클립 기준으로 싱크됩니다.
- 모바일 브라우저 정책상 백그라운드 재생은 지원하지 않습니다 (포그라운드 인앱 재생).

