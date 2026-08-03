# 디자인 시스템 프리뷰 빌더

`css/style.css` 에서 컴포넌트 프리뷰 12개를 뽑아 [claude.ai/design](https://claude.ai/design)
디자인 시스템 프로젝트에 올리기 위한 도구.

## 실행

```bash
python tools/build_design_system.py
```

`tools/_build/` 에 프리뷰 HTML 12개와 카드 메타데이터(`cards.json`)가 생성된다.
출력 경로를 바꾸려면 인자로 넘긴다: `python tools/build_design_system.py ../out`

빌드 산출물은 `.gitignore` 대상이다 — 언제든 재생성되므로 커밋하지 않는다.

## 원본은 항상 style.css

빌더는 `css/style.css` 전문을 각 프리뷰에 **인라인**한다. CSS 를 손으로 옮겨 적지
않으므로 앱과 프리뷰가 어긋날 수 없다. 색상 토큰의 hex 값과 `--grain-opacity` 도
CSS 에서 파싱해 라벨로 쓴다.

따라서 **프리뷰를 직접 고치지 말 것.** 다음 빌드에서 덮어쓰인다.
디자인을 바꾸려면 `css/style.css` 를 고치고 다시 빌드한다.

ditto 는 토큰 주도 설계라 `--color-accent` 같은 토큰 하나만 바꿔도 재생 버튼 ·
FAB · 진행 바 · 칩이 한꺼번에 바뀌고 12개 카드 전부에 반영된다. 시안 탐색은
토큰 레벨에서 하는 편이 레버리지가 크다.

## 구조

각 프리뷰는 RETRO / MODERN 두 테마를 좌우로 나란히 렌더한다.
테마 변수가 `[data-theme="…"]` 속성 선택자로 정의되어 있어 `html` 이 아닌 `div` 에
붙여도 그대로 상속된다는 점을 이용한다.

| 파일 | 그룹 | 내용 |
|---|---|---|
| `foundations/colors.html` | Foundations | 듀얼 테마 팔레트 12종 |
| `foundations/typography.html` | Foundations | IBM Plex Sans KR + Space Mono |
| `foundations/texture.html` | Foundations | 종이 질감 · 배경 그라데이션 |
| `components/buttons.html` | Components | 재생 컨트롤 · 액션 · 아이콘 |
| `components/cards.html` | Components | 히어로 · 페어(그리드/리스트) |
| `components/album.html` | Components | 카세트 오버레이 · 릴 회전 |
| `components/sliders.html` | Components | 진행 바 · 타임 셔틀 |
| `components/navigation.html` | Components | 세그먼트 · 목록 헤더 · 탭바 |
| `components/search.html` | Components | 입력 · 결과 행 · 힌트 |
| `components/badges.html` | Components | 칩 · 태그 · 토스트 |
| `components/modal.html` | Components | 설정 다이얼로그 · 폼 |
| `components/feedback.html` | Components | 스켈레톤 · 글리치 오버레이 |

## icons.json

앱이 CDN 에서 불러오는 Lucide 아이콘 14종의 path 데이터. 프리뷰에는 JS 가 없어
아이콘을 런타임에 마운트할 수 없으므로 SVG 를 정적으로 심는다.

앱에 새 아이콘을 쓰기 시작했다면 브라우저 콘솔에서 다음을 실행해 갱신한다:

```js
(() => {
  const want = ['play','pause','skip-back','skip-forward','plus','settings',
                'arrow-left','home','search','heart','shuffle',
                'layout-grid','layout-list','x'];   // ← 추가할 이름을 여기에
  const toPascal = (n) => n.replace(/(^\w|-\w)/g, (m) => m.replace('-','').toUpperCase());
  const out = {};
  want.forEach(n => {
    out[n] = window.lucide.icons[toPascal(n)]
      .map(([tag, a]) => `<${tag} ${Object.entries(a).map(([k,v]) => `${k}="${v}"`).join(' ')}/>`)
      .join('');
  });
  return JSON.stringify(out);
})();
```

## 업로드

생성된 파일은 Claude Code 의 `DesignSync` 도구로 올린다. 각 HTML 첫 줄의
`<!-- @dsCard group="…" name="…" subtitle="…" -->` 주석이 카드 메타데이터다.
