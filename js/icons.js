/* ============================================================
   ditto — 아이콘 (lucide 부분집합)

   원래는 unpkg 에서 `lucide@latest` 를 통째로 받았다. 실측 405.6KB · 아이콘 2,007개.
   이 앱이 쓰는 건 22개다. 999개를 받아 15개를 쓰는 셈이었고,
   게다가 모바일 첫 방문에서 그 무게를 매번 치렀다.

   문제가 셋이었다:
     1. 405KB — 폰트 다음으로 무거운 자산이었다.
     2. `@latest` — 버전이 안 박혀 있어 리다이렉트가 한 번 더 붙고 장기 캐시가 안 된다.
        어느 날 갑자기 다른 버전이 와도 알 수 없다.
     3. 단일 장애점 — unpkg 가 느리거나 막히면 앱의 모든 아이콘이 사라진다.

   그래서 쓰는 아이콘만 뽑아 여기 두고 자체 호스팅한다. 3.1KB.
   데이터와 SVG 속성은 lucide@1.29.0 에서 그대로 가져왔으므로 렌더 결과는 동일하다.
   (lucide: ISC License)

   ── 아이콘을 새로 쓰려면
   app.js 에서 iconSvg('new-name') 을 부르기 전에 아래 ICONS 에 항목을 추가한다.
   이름은 케밥케이스를 파스칼케이스로 바꾼 형태다 (chevron-up → ChevronUp).
   원본 경로 데이터는 lucide.dev 에서 찾을 수 있다.
   ============================================================ */

(() => {
  const NS = 'http://www.w3.org/2000/svg';

  /* lucide 가 svg 루트에 붙이던 속성 그대로. 이게 달라지면 선 굵기·끝모양이 바뀐다. */
  const BASE = {
    xmlns: NS,
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  };

  const ICONS = {"ArrowLeft":[["path",{"d":"m12 19-7-7 7-7"}],["path",{"d":"M19 12H5"}]],"Heart":[["path",{"d":"M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"}]],"Home":[["path",{"d":"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"}],["path",{"d":"M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"}]],"Play":[["path",{"d":"M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"}]],"Pause":[["rect",{"x":"14","y":"3","width":"5","height":"18","rx":"1"}],["rect",{"x":"5","y":"3","width":"5","height":"18","rx":"1"}]],"Plus":[["path",{"d":"M5 12h14"}],["path",{"d":"M12 5v14"}]],"Check":[["path",{"d":"M20 6 9 17l-5-5"}]],"X":[["path",{"d":"M18 6 6 18"}],["path",{"d":"m6 6 12 12"}]],"Search":[["path",{"d":"m21 21-4.34-4.34"}],["circle",{"cx":"11","cy":"11","r":"8"}]],"Settings":[["path",{"d":"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"}],["circle",{"cx":"12","cy":"12","r":"3"}]],"SkipBack":[["path",{"d":"M17.971 4.285A2 2 0 0 1 21 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432z"}],["path",{"d":"M3 20V4"}]],"SkipForward":[["path",{"d":"M21 4v16"}],["path",{"d":"M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z"}]],"ChevronUp":[["path",{"d":"m18 15-6-6-6 6"}]],"ChevronDown":[["path",{"d":"m6 9 6 6 6-6"}]],"GalleryHorizontalEnd":[["path",{"d":"M2 7v10"}],["path",{"d":"M6 5v14"}],["rect",{"width":"12","height":"18","x":"10","y":"3","rx":"2"}]],"LayoutGrid":[["rect",{"width":"7","height":"7","x":"3","y":"3","rx":"1"}],["rect",{"width":"7","height":"7","x":"14","y":"3","rx":"1"}],["rect",{"width":"7","height":"7","x":"14","y":"14","rx":"1"}],["rect",{"width":"7","height":"7","x":"3","y":"14","rx":"1"}]],"LayoutList":[["rect",{"width":"7","height":"7","x":"3","y":"3","rx":"1"}],["rect",{"width":"7","height":"7","x":"3","y":"14","rx":"1"}],["path",{"d":"M14 4h7"}],["path",{"d":"M14 9h7"}],["path",{"d":"M14 15h7"}],["path",{"d":"M14 20h7"}]],"Grid3x3":[["rect",{"width":"18","height":"18","x":"3","y":"3","rx":"2"}],["path",{"d":"M3 9h18"}],["path",{"d":"M3 15h18"}],["path",{"d":"M9 3v18"}],["path",{"d":"M15 3v18"}]],"ListMusic":[["path",{"d":"M16 5H3"}],["path",{"d":"M11 12H3"}],["path",{"d":"M11 19H3"}],["path",{"d":"M21 16V5"}],["circle",{"cx":"18","cy":"16","r":"3"}]],"Radio":[["path",{"d":"M16.247 7.761a6 6 0 0 1 0 8.478"}],["path",{"d":"M19.075 4.933a10 10 0 0 1 0 14.134"}],["path",{"d":"M4.925 19.067a10 10 0 0 1 0-14.134"}],["path",{"d":"M7.753 16.239a6 6 0 0 1 0-8.478"}],["circle",{"cx":"12","cy":"12","r":"2"}]],"Disc3":[["circle",{"cx":"12","cy":"12","r":"10"}],["path",{"d":"M6 12c0-1.7.7-3.2 1.8-4.2"}],["circle",{"cx":"12","cy":"12","r":"2"}],["path",{"d":"M18 12c0 1.7-.7 3.2-1.8 4.2"}]],"Rows2":[["rect",{"width":"18","height":"18","x":"3","y":"3","rx":"2"}],["path",{"d":"M3 12h18"}]]};

  function createElement(node, attrs = {}) {
    const svg = document.createElementNS(NS, 'svg');
    Object.entries({ ...BASE, ...attrs }).forEach(([k, v]) => svg.setAttribute(k, v));
    node.forEach(([tag, a]) => {
      const child = document.createElementNS(NS, tag);
      Object.entries(a).forEach(([k, v]) => child.setAttribute(k, v));
      svg.appendChild(child);
    });
    return svg;
  }

  /* app.js 의 iconSvg() 가 window.lucide.icons / createElement 를 그대로 쓰므로
     같은 모양으로 노출한다 — 호출부는 한 줄도 안 바뀐다. */
  window.lucide = { icons: ICONS, createElement };
})();
