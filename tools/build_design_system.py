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

# ---------------------------------------------------------------- 앱 화면
# index.html 에서 화면 마크업을 그대로 추출하고, JS 가 런타임에 채우는 부분
# (목록·곡 정보·아이콘)만 샘플로 메운다. 마크업을 손으로 쓰지 않으므로
# index.html 을 고치면 화면 프리뷰도 따라간다.

INDEX = io.open(os.path.join(SRC, "index.html"), encoding="utf-8").read()

HEADER_HTML = re.search(r'<header class="header">.*?</header>', INDEX, re.S).group(0)
NAV_HTML = re.search(r'<nav class="bottom-nav">.*?</nav>', INDEX, re.S).group(0)
FAB_HTML = re.search(r'<button id="fab".*?</button>', INDEX, re.S).group(0)


def mount_icons(html):
    """<span data-icon="…"></span> 를 정적 SVG 로 채운다 (프리뷰에는 JS 가 없다)."""
    def rep(m):
        pre, name, post = m.group(1), m.group(2), m.group(3)
        size = re.search(r'data-icon-size="(\d+)"', pre + post)
        return f'<span{pre}data-icon="{name}"{post}>{ico(name, int(size.group(1)) if size else 20)}</span>'
    return re.sub(r'<span([^>]*?)data-icon="([\w-]+)"([^>]*?)></span>', rep, html)


def pair_card(title, sub, years, removable=False):
    rm = f'<button class="pair-remove">{ico("x", 14)}</button>' if removable else ""
    return (f'<article class="pair-card">'
            f'<div class="pair-art ds-art"><span class="pair-years mono">{years}</span></div>'
            f'<div class="pair-meta"><p class="pair-title">{title}</p>'
            f'<p class="pair-sub">{sub}</p></div>{rm}</article>')


def result_row(title, sub, year):
    return (f'<div class="result-row"><div class="result-art ds-art"></div>'
            f'<div class="result-meta"><div class="result-title">{title}</div>'
            f'<div class="result-sub">{sub}</div></div>'
            f'<span class="result-year">{year}</span></div>')


HOME_CARDS = "".join(pair_card(t, s, y) for t, s, y in [
    ("너에게", "성시경", "2013"), ("소녀", "오혁", "2015"),
    ("청춘", "김필", "2015"), ("걱정말아요 그대", "이적", "2015"),
    ("너의 의미", "아이유", "2014"), ("나의 옛날이야기", "아이유", "2014"),
])
LIB_CARDS = "".join(pair_card(t, s, y, removable=True) for t, s, y in [
    ("너에게", "서태지와 아이들 → 성시경", "1993 ⇄ 2013"),
    ("너의 의미", "산울림 → 아이유", "1984 ⇄ 2014"),
])
SEARCH_ROWS = "".join(result_row(t, s, y) for t, s, y in [
    ("너에게", "성시경 · 응답하라 1994 OST", "2013"),
    ("너에게", "서태지와 아이들", "1993"),
    ("소녀", "오혁 · 응답하라 1988 OST", "2015"),
])

# JS 가 채우는 자리를 샘플로 치환 (좌: index.html 원문, 우: 프리뷰용)
FILL = [
    ('<section id="pair-list" class="pair-list grid"></section>',
     f'<section class="pair-list grid">{HOME_CARDS}</section>'),
    ('<section id="library-list" class="pair-list list"></section>',
     f'<section class="pair-list list">{LIB_CARDS}</section>'),
    ('<section id="search-results" class="search-results"></section>',
     f'<section class="search-results">{SEARCH_ROWS}</section>'),
    ('<button id="btn-layout" class="layout-btn" aria-label="레이아웃 전환"></button>',
     f'<button class="layout-btn">{ico("layout-grid", 16)}</button>'),
    ('<div class="hero-art" id="hero-art"></div>',
     '<div class="hero-art ds-art"></div>'),
    ('<div class="album-art" id="album-art">', '<div class="album-art ds-art">'),
    ('<section class="album-card" id="album-card">',
     '<section class="album-card playing">'),
    ('<h2 class="song-title" id="song-title">—</h2>',
     '<h2 class="song-title">성시경 〈너에게〉</h2>'),
    ('<p class="song-subtitle" id="song-subtitle">—</p>',
     '<p class="song-subtitle">응답하라 1994 OST Part 2</p>'),
    ('<span class="time mono" id="time-cur">0:00</span>',
     '<span class="time mono">0:12</span>'),
    ('<span class="time mono" id="time-dur">0:00</span>',
     '<span class="time mono">0:29</span>'),
    ('value="0" step="0.1" />', 'value="42" step="0.1" style="--pct:42%" />'),
    ('<span class="year-value mono" id="year-original">19—</span>',
     '<span class="year-value mono">1993</span>'),
    ('<span class="year-value mono" id="year-remake">20—</span>',
     '<span class="year-value mono">2013</span>'),
]


def screen(name, *, nav=None, extra=""):
    """index.html 의 한 화면을 폰 프레임 마크업으로 만든다."""
    html = re.search(r'<main id="screen-%s".*?</main>' % name, INDEX, re.S).group(0)
    html = html.replace('class="screen hidden"', 'class="screen"')
    for a, b in FILL:
        html = html.replace(a, b)

    header = HEADER_HTML
    if name == "player":                       # 플레이어에서는 뒤로가기가 보인다
        header = header.replace('class="icon-btn hidden"', 'class="icon-btn"')
        extra += FAB_HTML.replace('class="fab hidden"', 'class="fab"')

    navhtml = NAV_HTML
    if nav:                                    # 활성 탭 이동
        navhtml = navhtml.replace('class="nav-btn active"', 'class="nav-btn"')
        navhtml = navhtml.replace(f'class="nav-btn" data-screen="{nav}"',
                                  f'class="nav-btn active" data-screen="{nav}"')
    return mount_icons(header + html + extra + navhtml)


SCREENS = [
    ("home", "홈", "히어로 · 시대 필터 · 셔틀 목록", None),
    ("player", "플레이어", "앨범 아트 · 타임 셔틀 · 컨트롤", None),
    ("search", "검색", "iTunes 검색 · 결과 목록", "search"),
    ("library", "라이브러리", "저장한 셔틀 쌍", "library"),
]

SCREEN_CSS = """
.ds-screens { display: flex; gap: 22px; padding: 20px; justify-content: center;
              flex-wrap: wrap; align-items: flex-start; }
.ds-frame { display: flex; flex-direction: column; gap: 8px; }
.ds-frame-label { font-family: "Space Mono", monospace; font-size: 10px; font-weight: 700;
                  letter-spacing: .14em; text-align: center; color: #7a7a7a; }
.ds-frame .phone { max-height: none; border-radius: 16px; }
"""


def screen_page(name, label, subtitle, nav):
    body = screen(name, nav=nav)
    frames = "".join(f"""
  <div class="ds-frame">
    <div class="ds-frame-label">{t.upper()} · {ko}</div>
    <div class="phone" data-theme="{t}">{body}</div>
  </div>""" for t, ko in (("retro", "원곡"), ("modern", "리메이크")))
    return f"""<!-- @dsCard group="Screens" name="{label}" subtitle="{subtitle}" -->
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ditto · {label}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
{CSS}
{PREVIEW_CSS}
{SCREEN_CSS}
</style>
</head>
<body><div class="ds-screens">{frames}</div></body>
</html>
"""


# ---------------------------------------------------------------- 플레이그라운드
# 토큰 블록을 맨 위에 딱 한 번만 두고 그 아래 전체 컴포넌트를 붙인 단일 파일.
# 디자인 우선 실험용 — 토큰 한 줄만 고치면 페이지 전체가 즉시 바뀐다.

# 토큰이 정의된 최상위 블록 3개. 뒤쪽의 [data-theme="…"] .foo 같은
# 하위 선택자는 `\s*\{` 로 바로 이어지지 않으므로 매칭되지 않는다.
TOKEN_PATTERNS = [
    r":root\s*\{[^}]*\}",
    r'\[data-theme="modern"\]\s*\{[^}]*\}',
    r'\[data-theme="retro"\]\s*\{[^}]*\}',
]

EDIT_BEGIN = "/* ===== DITTO TOKENS : BEGIN ===== */"
EDIT_END = "/* ===== DITTO TOKENS : END ===== */"


def split_tokens():
    """style.css 를 (토큰 블록, 나머지) 로 가른다."""
    blocks, rest = [], CSS
    for pat in TOKEN_PATTERNS:
        m = re.search(pat, rest)
        blocks.append(m.group(0))
        rest = rest[:m.start()] + rest[m.end():]
    return "\n\n".join(blocks), rest


SECTIONS = [
    ("타이포그래피", TYPE),
    ("버튼", BUTTONS),
    ("카드", CARDS),
    ("앨범 아트 · 카세트", ALBUM),
    ("슬라이더", SLIDERS),
    ("내비게이션", NAV),
    ("검색", SEARCH),
    ("뱃지 · 피드백", BADGES),
    ("로딩 · 글리치", FEEDBACK),
    ("모달", MODAL),
    ("표면 · 그레인", TEXTURE),
]


def playground():
    token_css, rest_css = split_tokens()
    body_for = lambda theme: (
        '<div class="ds-sec">색상 토큰</div>' + swatches(theme)
        + "".join(f'<div class="ds-sec">{t}</div>{m}' for t, m in SECTIONS)
    )
    return f"""<!-- @dsCard group="Playground" name="토큰 플레이그라운드" subtitle="상단 토큰만 고치면 전체가 바뀝니다" -->
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ditto · 토큰 플레이그라운드</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
{EDIT_BEGIN}
/*
  ┌──────────────────────────────────────────────────────────┐
  │  여기만 고치면 아래 모든 컴포넌트가 한 번에 바뀝니다.       │
  │  두 테마를 좌우로 비교하면서 값을 조정해 보세요.            │
  │                                                          │
  │  확정되면 이 BEGIN~END 블록을 그대로 코드에 반영합니다.     │
  │  (ditto/css/style.css 최상단의 같은 블록과 1:1 대응)       │
  └──────────────────────────────────────────────────────────┘
*/
{token_css}
{EDIT_END}

/* ↓↓↓ 아래는 컴포넌트 정의입니다. 세부 조정이 필요할 때만 건드리세요. ↓↓↓ */
{rest_css}
{PREVIEW_CSS}
.ds-sec {{ font-family: "Space Mono", monospace; font-size: 11px; font-weight: 700;
           letter-spacing: .14em; text-transform: uppercase;
           color: var(--color-text-primary); opacity: .8;
           border-bottom: 1px solid currentColor; padding-bottom: 6px; margin-top: 8px; }}
.ds-body {{ gap: 13px; }}
</style>
</head>
<body>
<div class="ds-wrap">
  <div class="ds-pane" data-theme="retro">
    <div class="ds-head">RETRO · 원곡</div>
    <div class="ds-body">{body_for('retro')}</div>
  </div>
  <div class="ds-pane" data-theme="modern">
    <div class="ds-head">MODERN · 리메이크</div>
    <div class="ds-body">{body_for('modern')}</div>
  </div>
</div>
</body>
</html>
"""


def playground_screens():
    """토큰 블록 + 실제 앱 화면 4종 × 두 테마. 축소해서 한눈에 비교한다."""
    token_css, rest_css = split_tokens()
    rows = ""
    for theme, ko in (("retro", "원곡"), ("modern", "리메이크")):
        frames = "".join(f"""
    <div class="ds-frame">
      <div class="ds-frame-label">{label}</div>
      <div class="ds-mini"><div class="phone" data-theme="{theme}">{screen(nm, nav=nav)}</div></div>
    </div>""" for nm, label, _sub, nav in SCREENS)
        rows += f'<div class="ds-rowhead">{theme.upper()} · {ko}</div><div class="ds-screens">{frames}</div>'

    return f"""<!-- @dsCard group="Playground" name="토큰 플레이그라운드 · 앱 화면" subtitle="실제 4개 화면이 토큰 변경에 어떻게 반응하는지" -->
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ditto · 앱 화면 플레이그라운드</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
{EDIT_BEGIN}
/*
  ┌──────────────────────────────────────────────────────────┐
  │  여기만 고치면 아래 8개 화면이 한 번에 바뀝니다.            │
  │  실제 ditto 앱 화면이라, 토큰 변경이 제품에서 어떻게        │
  │  보이는지 그대로 확인할 수 있습니다.                       │
  │                                                          │
  │  확정되면 이 BEGIN~END 블록을 그대로 코드에 반영합니다.     │
  │  (ditto/css/style.css 최상단의 같은 블록과 1:1 대응)       │
  └──────────────────────────────────────────────────────────┘
*/
{token_css}
{EDIT_END}

/* ↓↓↓ 아래는 컴포넌트 정의입니다. 세부 조정이 필요할 때만 건드리세요. ↓↓↓ */
{rest_css}
{PREVIEW_CSS}
{SCREEN_CSS}
.ds-rowhead {{ font-family: "Space Mono", monospace; font-size: 11px; font-weight: 700;
               letter-spacing: .16em; color: #7a7a7a; padding: 16px 20px 0; }}
/* 8개 화면을 한눈에 담기 위해 축소 (390×985 → 62%) */
.ds-mini {{ width: 242px; height: 611px; overflow: hidden; }}
.ds-mini .phone {{ transform: scale(.62); transform-origin: top left; flex: 0 0 auto; }}
.ds-screens {{ gap: 16px; padding: 12px 20px 20px; justify-content: flex-start; }}
</style>
</head>
<body>{rows}</body>
</html>
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

    # 앱 화면 4종
    for nm, label, subtitle, nav in SCREENS:
        p = os.path.join(OUT, "screens", f"{nm}.html")
        os.makedirs(os.path.dirname(p), exist_ok=True)
        io.open(p, "w", encoding="utf-8", newline="\n").write(
            screen_page(nm, label, subtitle, nav))
        manifest.append({"path": f"screens/{nm}.html", "group": "Screens",
                         "name": label, "subtitle": subtitle})

    # 실험용 단일 페이지 2종 (컴포넌트 / 앱 화면)
    for path, fn, name, subtitle in (
        ("playground.html", playground, "토큰 플레이그라운드 · 컴포넌트",
         "상단 토큰만 고치면 전체가 바뀝니다"),
        ("playground-screens.html", playground_screens, "토큰 플레이그라운드 · 앱 화면",
         "실제 4개 화면이 토큰 변경에 어떻게 반응하는지"),
    ):
        io.open(os.path.join(OUT, path), "w", encoding="utf-8", newline="\n").write(fn())
        manifest.insert(0, {"path": path, "group": "Playground",
                            "name": name, "subtitle": subtitle})

    io.open(os.path.join(OUT, "cards.json"), "w", encoding="utf-8").write(
        json.dumps(manifest, ensure_ascii=False, indent=1))

    # 로컬에서 전체를 훑어보기 위한 목차
    groups = {}
    for m in manifest:
        groups.setdefault(m["group"], []).append(m)
    order = ["Playground", "Screens", "Foundations", "Components"]
    secs = ""
    for g in order + [k for k in groups if k not in order]:
        if g not in groups:
            continue
        items = "".join(
            f'<li><a href="{m["path"]}">{m["name"]}</a>'
            f'<span>{m["subtitle"] or ""}</span></li>' for m in groups[g])
        secs += f"<h2>{g}</h2><ul>{items}</ul>"
    io.open(os.path.join(OUT, "index.html"), "w", encoding="utf-8", newline="\n").write(f"""<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ditto 디자인 시스템 — 프리뷰 목차</title>
<style>
 body {{ font-family: "IBM Plex Sans KR", -apple-system, sans-serif; max-width: 760px;
        margin: 0 auto; padding: 40px 24px 80px; color: #23201a; background: #faf7f0; }}
 h1 {{ font-size: 24px; margin-bottom: 6px; }}
 h1 span {{ color: #F5793A; }}
 .sub {{ color: #8a8068; font-size: 13px; margin-bottom: 32px; line-height: 1.6; }}
 h2 {{ font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: #8a8068;
       border-bottom: 1px solid #e2dbcb; padding-bottom: 7px; margin: 30px 0 4px; }}
 ul {{ list-style: none; padding: 0; }}
 li {{ display: flex; align-items: baseline; gap: 12px; padding: 9px 0;
       border-bottom: 1px solid #efe9dc; }}
 li a {{ font-weight: 600; color: #23201a; text-decoration: none; flex: 0 0 auto; }}
 li a:hover {{ color: #F5793A; }}
 li span {{ font-size: 12px; color: #9a9078; }}
 .tip {{ margin-top: 34px; padding: 15px 17px; background: #fff; border-radius: 10px;
         border: 1px solid #e8e0cf; font-size: 13px; line-height: 1.7; }}
 code {{ background: #f2ece0; padding: 1px 5px; border-radius: 4px; font-size: 12px; }}
</style></head>
<body>
<h1>ditto 디자인 시스템<span>.</span></h1>
<p class="sub">css/style.css 에서 생성된 프리뷰 {len(manifest)}개. 각 화면은 RETRO / MODERN 두 테마를 나란히 보여줍니다.</p>
{secs}
<div class="tip">
<b>디자인을 바꿔보려면</b><br>
<code>tools/_build/playground-screens.html</code> 을 편집기로 열고 맨 위
<code>DITTO TOKENS : BEGIN ~ END</code> 블록의 값을 고친 뒤 브라우저를 새로고침하세요.
8개 화면이 한꺼번에 바뀝니다.<br><br>
확정되면 그 블록을 <code>css/style.css</code> 최상단의 같은 블록에 옮기고
<code>python tools/build_design_system.py</code> 로 전체를 재생성합니다.
</div>
</body></html>
""")

    print(f"{len(manifest)}개 프리뷰 생성 → {OUT}")
    for m in manifest:
        print(f"  {m['path']}")


if __name__ == "__main__":
    main()
