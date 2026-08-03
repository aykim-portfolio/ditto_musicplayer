"""ditto 디자인 시스템 프리뷰 빌더.

css/style.css 를 그대로 읽어 각 프리뷰 HTML 에 인라인한다.
CSS 를 손으로 옮겨 적지 않으므로 앱과 프리뷰가 어긋날 수 없다.
색상 토큰과 그레인 값도 CSS 에서 파싱해서 라벨로 쓴다.

    python tools/build_design_system.py [출력경로]

기본 출력은 tools/_build/ (gitignore 대상). 결과물은 claude.ai/design 의
디자인 시스템 프로젝트로 업로드해서 카드 갤러리로 본다.

프리뷰는 RETRO / MODERN 두 테마를 좌우로 나란히 렌더한다.
테마 변수가 [data-theme="…"] 속성 선택자로 정의되어 있어, html 이 아닌
div 에 붙여도 그대로 상속된다는 점을 이용한다.
"""
import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)                                  # ditto/
OUT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(HERE, "_build")

CSS = io.open(os.path.join(SRC, "css", "style.css"), encoding="utf-8").read()
ICONS = json.loads(io.open(os.path.join(HERE, "icons.json"), encoding="utf-8").read())


def ico(name, size=20, stroke=2):
    """Lucide 아이콘을 지정 크기의 svg 로 감싼다."""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" '
        f'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="{stroke}" '
        f'stroke-linecap="round" stroke-linejoin="round" class="lucide">{ICONS[name]}</svg>'
    )


def theme_block(theme):
    return re.search(r'\[data-theme="%s"\]\s*\{(.*?)\}' % theme, CSS, re.S).group(1)


def tokens(theme):
    """테마 블록에서 --color-* 토큰을 선언 순서대로 파싱."""
    found = re.findall(r"(--color-[\w-]+)\s*:\s*([^;]+);", theme_block(theme))
    return [(k, v.strip()) for k, v in found]


def grain(theme):
    return re.search(r"--grain-opacity\s*:\s*([^;]+);", theme_block(theme)).group(1).strip()


ROOT_BLOCK = re.search(r":root\s*\{(.*?)\}", CSS, re.S).group(1)
SHARED = [(k, v.strip())
          for k, v in re.findall(r"(--color-[\w-]+)\s*:\s*([^;]+);", ROOT_BLOCK)]

PREVIEW_CSS = """
/* --- 프리뷰 전용: 앱의 전역 레이아웃 규칙을 무력화 --- */
html, body { height: auto; min-height: 0; display: block; background: transparent; }
.ds-wrap { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 18px;
           font-family: var(--font-sans); align-items: start; }
@media (max-width: 760px) { .ds-wrap { grid-template-columns: 1fr; } }
.ds-pane { border-radius: 14px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,.14); }
.ds-head { font-family: "Space Mono", monospace; font-size: 10px; font-weight: 700;
           letter-spacing: .16em; padding: 9px 13px; color: #fff;
           background: var(--color-nav-bg); }
.ds-body { padding: 18px 16px 22px; background: var(--color-bg-primary);
           display: flex; flex-direction: column; gap: 15px; }
.ds-note { font-family: "Space Mono", monospace; font-size: 9px; letter-spacing: .12em;
           text-transform: uppercase; opacity: .5; color: var(--color-text-primary); }
.ds-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.ds-sw { display: flex; flex-direction: column; gap: 5px; }
.ds-chip { width: 100%; height: 42px; border-radius: 7px; border: 1px solid rgba(0,0,0,.14); }
.ds-swatches { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.ds-name { font-family: "Space Mono", monospace; font-size: 9px; letter-spacing: .04em;
           color: var(--color-text-primary); opacity: .85; word-break: break-all; }
.ds-hex { font-family: "Space Mono", monospace; font-size: 9px;
          color: var(--color-text-primary); opacity: .45; }
.ds-art { background-image: linear-gradient(135deg, #F5793A, #8a3d1c); }
.ds-stack { display: flex; flex-direction: column; gap: 9px; }
/* absolute 로 띄우는 오버레이(모달/글리치)를 담을 상대 컨테이너 */
.ds-overlay-box { position: relative; height: 330px; border-radius: 10px;
                  overflow: hidden; background: var(--color-bg-deep); }
.ds-grain-label { padding: 10px 12px; font-size: 9px; letter-spacing: .12em;
                  color: var(--color-text-primary); opacity: .55; }
"""


def page(group, body, name=None, subtitle=None):
    head = f'<!-- @dsCard group="{group}"'
    if name:
        head += f' name="{name}"'
    if subtitle:
        head += f' subtitle="{subtitle}"'
    head += " -->"
    return f"""{head}
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ditto · {name or group}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
{CSS}
{PREVIEW_CSS}
</style>
</head>
<body>
<div class="ds-wrap">
  <div class="ds-pane" data-theme="retro">
    <div class="ds-head">RETRO · 원곡</div>
    <div class="ds-body">{body}</div>
  </div>
  <div class="ds-pane" data-theme="modern">
    <div class="ds-head">MODERN · 리메이크</div>
    <div class="ds-body">{body}</div>
  </div>
</div>
</body>
</html>
"""


def swatches(theme):
    cells = "".join(
        f'<div class="ds-sw"><div class="ds-chip" style="background:{v}"></div>'
        f'<div class="ds-name">{k}</div><div class="ds-hex">{v}</div></div>'
        for k, v in tokens(theme) + SHARED
    )
    return f'<div class="ds-swatches">{cells}</div>'


# ---------------------------------------------------------------- 컴포넌트 마크업

BUTTONS = f"""
<div class="ds-note">재생 컨트롤</div>
<div class="controls" style="justify-content:flex-start;gap:18px">
  <button class="ctrl-btn small">{ico('skip-back',16)}</button>
  <button class="ctrl-btn play">{ico('play',22)}</button>
  <button class="ctrl-btn small">{ico('skip-forward',16)}</button>
</div>
<div class="ds-note">액션</div>
<div class="ds-row">
  <button class="hero-play">{ico('play',13)} 추천 셔틀 재생</button>
  <button class="fab" style="position:static">{ico('plus',22)}</button>
</div>
<div class="ds-note">아이콘 버튼</div>
<div class="ds-row">
  <button class="icon-btn">{ico('arrow-left',19)}</button>
  <button class="icon-btn">{ico('settings',19)}</button>
  <button class="layout-btn">{ico('layout-grid',16)}</button>
  <button class="layout-btn">{ico('layout-list',16)}</button>
</div>
"""

CARDS = f"""
<div class="ds-note">히어로 카드</div>
<section class="hero-card">
  <div class="hero-art ds-art"></div>
  <div class="hero-meta">
    <p class="hero-title">응답하라, 그 시절 명곡</p>
    <p class="hero-sub">원곡 ↔ 리메이크를 한 번에.</p>
    <button class="hero-play">{ico('play',13)} 추천 셔틀 재생</button>
  </div>
</section>
<div class="ds-note">페어 카드 · 그리드</div>
<section class="pair-list grid">
  <article class="pair-card">
    <div class="pair-art ds-art"><span class="pair-years mono">1993</span></div>
    <div class="pair-meta">
      <p class="pair-title">너에게</p>
      <p class="pair-sub">서태지와 아이들</p>
    </div>
  </article>
  <article class="pair-card">
    <div class="pair-art ds-art"><span class="pair-years mono">1984</span></div>
    <div class="pair-meta">
      <p class="pair-title">너의 의미</p>
      <p class="pair-sub">산울림</p>
    </div>
  </article>
</section>
<div class="ds-note">페어 카드 · 리스트</div>
<section class="pair-list list">
  <article class="pair-card">
    <div class="pair-art ds-art"></div>
    <div class="pair-meta">
      <p class="pair-title">소녀</p>
      <p class="pair-sub">이문세 → 오혁</p>
    </div>
    <button class="pair-remove">{ico('x',14)}</button>
  </article>
</section>
"""

SLIDERS = """
<div class="ds-note">진행 바</div>
<section class="progress-area">
  <input type="range" class="progress" min="0" max="100" value="42" style="--pct:42%">
  <div class="time-row">
    <span class="time mono">0:12</span><span class="time mono">0:29</span>
  </div>
</section>
<div class="ds-note">타임 셔틀</div>
<section class="year-selector">
  <div class="year-side original">
    <span class="year-label">ORIGINAL</span>
    <span class="year-value mono">1993</span>
  </div>
  <input type="range" class="shuttle" min="0" max="100" value="100">
  <div class="year-side selected">
    <span class="year-label">SELECTED</span>
    <span class="year-value mono">2013</span>
  </div>
</section>
<p class="shuttle-caption mono">⟵ TIME SHUTTLE ⟶</p>
"""

NAV = f"""
<div class="ds-note">시대 필터 · 세그먼트</div>
<div class="view-toggle">
  <button class="vt-btn">원곡</button>
  <button class="vt-btn active">리메이크</button>
</div>
<div class="ds-note">목록 헤더</div>
<div class="list-header">
  <span class="list-caption mono">리메이크 REMAKE</span>
  <button class="layout-btn">{ico('layout-grid',16)}</button>
</div>
<div class="ds-note">하단 탭바</div>
<nav class="bottom-nav" style="position:static;border-radius:10px">
  <button class="nav-btn active"><span class="nav-ico">{ico('home',18)}</span><span>Home</span></button>
  <button class="nav-btn"><span class="nav-ico">{ico('search',18)}</span><span>Search</span></button>
  <button class="nav-btn"><span class="nav-ico">{ico('heart',18)}</span><span>Library</span></button>
</nav>
"""

BADGES = f"""
<div class="ds-note">모드 칩 · 디스커버리</div>
<div class="badge-row">
  <span class="mode-chip">REMAKE</span>
  <button class="badge-discovery">{ico('shuffle',11)}DISCOVERY</button>
</div>
<div class="ds-note">소스 태그</div>
<div class="ds-row"><span class="source-tag">iTunes 30초 미리듣기</span></div>
<div class="ds-note">연도 뱃지</div>
<div class="ds-row">
  <span class="pair-years mono" style="position:static">1993 ⇄ 2013</span>
  <span class="pair-years mono" style="position:static">2013</span>
</div>
<div class="ds-note">토스트</div>
<div class="toast" style="position:static;transform:none;display:inline-block">
  랜덤 타임슬립 · 〈너에게〉
</div>
"""

TYPE = """
<div class="ds-note">로고 / 제목</div>
<div class="ds-stack">
  <h1 class="logo">ditto<span class="logo-dot">.</span></h1>
  <h2 class="song-title">성시경 〈너에게〉</h2>
  <p class="song-subtitle">응답하라 1994 OST Part 2</p>
</div>
<div class="ds-note">본문 / 목록</div>
<div class="ds-stack">
  <p class="hero-title">응답하라, 그 시절 명곡</p>
  <p class="pair-title">너의 의미</p>
  <p class="pair-sub">산울림 → 아이유</p>
</div>
<div class="ds-note">모노스페이스 · Space Mono</div>
<div class="ds-stack">
  <span class="year-value mono">1993</span>
  <span class="list-caption mono">리메이크 REMAKE</span>
  <span class="time mono">0:29</span>
</div>
"""

ALBUM = """
<div class="ds-note">앨범 카드 · 재생 중</div>
<section class="album-card playing">
  <div class="album-art ds-art">
    <div class="cassette-overlay">
      <div class="cassette-window">
        <span class="reel"></span>
        <span class="tape-line"></span>
        <span class="reel"></span>
      </div>
      <span class="cassette-label">SIDE A · ANALOG</span>
    </div>
  </div>
</section>
<div class="ds-note">카세트 오버레이는 RETRO 에서만 나타나며 재생 중 릴이 회전한다</div>
"""

SEARCH = """
<div class="ds-note">검색 입력</div>
<div class="search-box">
  <input type="search" placeholder="곡명, 아티스트 검색 (iTunes)">
  <button>검색</button>
</div>
<p class="search-hint">30초 미리듣기는 iTunes에서, 전체 곡은 설정에서
YouTube API 키 등록 후 이용할 수 있어요.</p>
<div class="ds-note">검색 결과 행</div>
<div class="search-results">
  <div class="result-row">
    <div class="result-art ds-art"></div>
    <div class="result-meta">
      <div class="result-title">너에게</div>
      <div class="result-sub">성시경 · 응답하라 1994 OST</div>
    </div>
    <span class="result-year">2013</span>
  </div>
  <div class="result-row">
    <div class="result-art ds-art"></div>
    <div class="result-meta">
      <div class="result-title">너에게</div>
      <div class="result-sub">서태지와 아이들</div>
    </div>
    <span class="result-year">1993</span>
  </div>
</div>
"""

MODAL = """
<div class="ds-note">설정 모달 · 두 테마 공통</div>
<div class="ds-overlay-box">
  <div class="modal">
    <div class="modal-card">
      <h3>설정</h3>
      <label class="field-label">YouTube Data API v3 키</label>
      <input type="password" placeholder="AIza… (브라우저에만 저장됩니다)">
      <p class="field-help">키는 서버로 전송되지 않고 이 브라우저(localStorage)에만
      저장됩니다.</p>
      <label class="field-label">재생 소스</label>
      <select><option>iTunes 30초 미리듣기 (키 불필요)</option></select>
      <div class="modal-actions">
        <button class="btn ghost">닫기</button>
        <button class="btn primary">저장</button>
      </div>
    </div>
  </div>
</div>
"""

FEEDBACK = """
<div class="ds-note">스켈레톤 로딩</div>
<section class="pair-list grid">
  <article class="pair-card">
    <div class="pair-art skeleton"></div>
    <div class="pair-meta"><p class="pair-title">불러오는 중…</p></div>
  </article>
  <article class="pair-card">
    <div class="pair-art skeleton"></div>
    <div class="pair-meta"><p class="pair-title">불러오는 중…</p></div>
  </article>
</section>
<div class="ds-note">글리치 오버레이 · 타임슬립 전환 연출</div>
<div class="ds-overlay-box" style="height:160px">
  <div class="glitch-overlay">
    <div class="glitch-scanlines"></div>
    <div class="glitch-text mono">◀◀ REWINDING… 1993</div>
  </div>
</div>
"""

# .phone 클래스를 그대로 써서 실제 배경 그라데이션과 ::after 그레인을 재현한다
TEXTURE = f"""
<div class="ds-note">표면 · 그레인 (RETRO {grain('retro')} / MODERN {grain('modern')})</div>
<div class="phone" style="height:170px;max-height:170px;width:100%;
     box-shadow:none;border-radius:10px">
  <span class="ds-grain-label mono">.phone 표면 + ::after 그레인</span>
</div>
<div class="ds-note">카드 위에 얹었을 때</div>
<div class="phone" style="height:150px;max-height:150px;width:100%;
     box-shadow:none;border-radius:10px;padding:14px">
  <span class="mode-chip" style="align-self:flex-start">ORIGINAL</span>
</div>
"""

# ---------------------------------------------------------------- 출력
# (경로, 그룹, 이름, 부제, 본문) — 본문이 None 이면 테마별로 다른 내용(색상 스와치)

PAGES = [
    ("foundations/colors.html", "Foundations", "색상 토큰", "듀얼 테마 팔레트 · RETRO / MODERN", None),
    ("foundations/typography.html", "Foundations", "타이포그래피", "IBM Plex Sans KR + Space Mono", TYPE),
    ("foundations/texture.html", "Foundations", "표면 · 그레인", "종이 질감 · 배경 그라데이션", TEXTURE),
    ("components/buttons.html", "Components", "버튼", "재생 컨트롤 · 액션 · 아이콘", BUTTONS),
    ("components/cards.html", "Components", "카드", "히어로 · 페어(그리드/리스트)", CARDS),
    ("components/album.html", "Components", "앨범 아트 · 카세트", "카세트 오버레이 · 릴 회전", ALBUM),
    ("components/sliders.html", "Components", "슬라이더", "진행 바 · 타임 셔틀", SLIDERS),
    ("components/navigation.html", "Components", "내비게이션", "세그먼트 · 목록 헤더 · 탭바", NAV),
    ("components/search.html", "Components", "검색", "입력 · 결과 행 · 힌트", SEARCH),
    ("components/badges.html", "Components", "뱃지 · 피드백", "칩 · 태그 · 토스트", BADGES),
    ("components/modal.html", "Components", "모달", "설정 다이얼로그 · 폼 · 액션", MODAL),
    ("components/feedback.html", "Components", "로딩 · 글리치", "스켈레톤 · 타임슬립 오버레이", FEEDBACK),
]


def main():
    manifest = []
    for path, group, name, subtitle, body in PAGES:
        if body is None:
            # 색상 스와치는 테마마다 값이 달라 패널별로 따로 채운다
            html = page(group, "__SW__", name, subtitle)
            for theme in ("retro", "modern"):
                html = html.replace('<div class="ds-body">__SW__</div>',
                                    '<div class="ds-body">' + swatches(theme) + "</div>", 1)
        else:
            html = page(group, body, name, subtitle)

        full = os.path.join(OUT, path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        io.open(full, "w", encoding="utf-8", newline="\n").write(html)
        manifest.append({"path": path, "group": group, "name": name, "subtitle": subtitle})

    io.open(os.path.join(OUT, "cards.json"), "w", encoding="utf-8").write(
        json.dumps(manifest, ensure_ascii=False, indent=1))

    print(f"{len(manifest)}개 프리뷰 생성 → {OUT}")
    for m in manifest:
        print(f"  {m['path']}")


if __name__ == "__main__":
    main()
