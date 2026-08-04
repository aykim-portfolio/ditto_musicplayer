/* ============================================================
   ditto — 앱 UI / 화면 전환 / 인터랙션
   화면: Home / Search / Library / Player
   테마: 원곡 모드 → retro, 리메이크 모드 → modern (실시간 스위칭)
   ============================================================ */

(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  /* ---------- 상태 ---------- */
  const resolvedPairs = new Map(); // pairId -> 런타임 pair (iTunes 메타 병합)
  let currentPairIndex = -1;       // DITTO_PAIRS 내 위치 (-1: 검색 단일곡)
  let activeScreen = 'home';
  let seeking = false;

  /* ---------- 아이콘 (Lucide) ---------- */
  function toPascalCase(name) {
    return name.replace(/(^\w|-\w)/g, (m) => m.replace('-', '').toUpperCase());
  }
  function iconSvg(name, size = 20) {
    const node = window.lucide && window.lucide.icons[toPascalCase(name)];
    if (!node) return '';
    return window.lucide.createElement(node, { width: size, height: size }).outerHTML;
  }
  function mountIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach((el) => {
      el.innerHTML = iconSvg(el.dataset.icon, Number(el.dataset.iconSize) || 20);
    });
  }
  mountIcons();

  /* ---------- 공용 헬퍼 ---------- */
  function toast(msg, ms = 2600) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add('hidden'), ms);
  }

  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
  }

  /* ---------- 화면 전환 ---------- */
  function showScreen(name) {
    activeScreen = name;
    ['home', 'search', 'library', 'player'].forEach((s) => {
      $(`#screen-${s}`).classList.toggle('hidden', s !== name);
    });
    $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.screen === name));
    $('#btn-back').classList.toggle('hidden', name !== 'player');
    $('#fab').classList.toggle('hidden', !(name === 'player' && currentPairIndex >= 0));
    if (name === 'library') renderLibrary();
    // 플레이어가 셔틀에 맞춰 바꾼 테마를 홈으로 돌아오면 시대 필터 기준으로 되돌린다
    if (name === 'home') setTheme(ERA[eraFilter].theme);
  }

  $$('.nav-btn').forEach((b) =>
    b.addEventListener('click', () => showScreen(b.dataset.screen))
  );
  $('#btn-back').addEventListener('click', () => showScreen('home'));

  /* ---------- iTunes 메타 매칭 (PoC 쌍 → 런타임 트랙) ---------- */
  async function resolvePair(pairDef) {
    if (resolvedPairs.has(pairDef.id)) return resolvedPairs.get(pairDef.id);

    const [o, r] = await Promise.all([
      DittoItunes.matchOne(pairDef.original.query).catch(() => null),
      DittoItunes.matchOne(pairDef.remake.query).catch(() => null),
    ]);

    const pair = {
      id: pairDef.id,
      title: pairDef.title,
      original: {
        artist: pairDef.original.artist,
        year: pairDef.original.year,
        album: o?.album || pairDef.original.album || '',
        artwork: o?.artwork || '',
        previewUrl: o?.previewUrl || null,
        ytQuery: pairDef.original.ytQuery,
      },
      remake: {
        artist: pairDef.remake.artist,
        year: pairDef.remake.year,
        album: r?.album || pairDef.remake.album || '',
        artwork: r?.artwork || '',
        previewUrl: r?.previewUrl || null,
        ytQuery: pairDef.remake.ytQuery,
      },
    };
    resolvedPairs.set(pairDef.id, pair);
    return pair;
  }

  /* ---------- 시대 필터 (원곡 | 리메이크) ----------
     카드가 어느 시대의 얼굴(연도/아티스트/아트워크)을 보여줄지 결정한다. */
  const ERA = {
    original: {
      theme: 'retro',
      caption: '원곡 ORIGINAL',
      badge: 'ORIGINAL',
      // 하드웨어 레퍼런스 4종 — tweak 버튼으로 돌려본다
      layouts: ['rack', 'winamp', 'tuner', 'dial'],
      years: (d) => `${d.original.year}`,
      sub:   (d) => d.original.artist,
      art:   (p) => p.original.artwork || p.remake.artwork,
    },
    both: {
      theme: 'retro',
      caption: '양쪽 BOTH',
      badge: 'BOTH',
      layouts: ['twin'],     // 원곡·리메이크 두 줄이 맞물려 움직인다
      years: (d) => `${d.original.year} ⇄ ${d.remake.year}`,
      sub:   (d) => `${d.original.artist} ⇄ ${d.remake.artist}`,
      art:   (p) => p.remake.artwork || p.original.artwork,
    },
    remake: {
      theme: 'modern',
      caption: '리메이크 REMAKE',
      badge: 'REMAKE',
      layouts: ['carousel', 'grid', 'list'],
      years: (d) => `${d.remake.year}`,
      sub:   (d) => d.remake.artist,
      art:   (p) => p.remake.artwork || p.original.artwork,
    },
  };
  let eraFilter = 'remake';

  /* ---------- Home: 추천 셔틀 목록 ----------
     레이아웃마다 마크업이 달라서 렌더러를 나눠 둔다.
     grid/list/carousel 은 공용 카드, 나머지는 전용 렌더러. */

  /** 아트워크는 iTunes 매칭이 끝나는 대로 끼워 넣는다 */
  function lazyArt(container, def, pick, key) {
    resolvePair(def).then((pair) => {
      const art = pick(pair);
      const el = container.querySelector(`[data-art="${key || def.id}"]`);
      if (el && art) {
        el.classList.remove('skeleton');
        el.style.backgroundImage = `url('${art}')`;
      }
    }).catch(() => {});
  }

  const pad2 = (n) => String(n).padStart(2, '0');

  function cardMarkup(def, era, layout, removable) {
    if (layout === 'carousel') {
      return `
        <div class="cc-art skeleton" data-art="${def.id}">
          <span class="cc-badge">${era.badge}</span>
          <span class="cc-year mono">${era.years(def)}</span>
        </div>
        <div class="cc-meta">
          <div class="cc-text">
            <p class="cc-title">${def.title}</p>
            <p class="cc-sub">${era.sub(def)}</p>
          </div>
          <button class="cc-play" aria-label="〈${def.title}〉 재생">${iconSvg('play', 16)}</button>
        </div>
      `;
    }
    return `
      <div class="pair-art skeleton" data-art="${def.id}">
        <span class="pair-years mono">${era.years(def)}</span>
      </div>
      <div class="pair-meta">
        <p class="pair-title">${def.title}</p>
        <p class="pair-sub">${era.sub(def)}</p>
      </div>
      ${removable ? `<button class="pair-remove" aria-label="삭제">${iconSvg('x', 14)}</button>` : ''}
    `;
  }

  /* ----- 공용: 격자 / 리스트 / 캐러셀 ----- */
  function renderCards(container, defs, era, layout, removable) {
    const isCarousel = layout === 'carousel';
    defs.forEach((def, idx) => {
      const card = document.createElement('article');
      card.className = isCarousel ? 'carousel-card' : 'pair-card';
      card.innerHTML = cardMarkup(def, era, layout, removable);
      card.addEventListener('click', (e) => {
        if (e.target.closest('.pair-remove')) { removeFromLibrary(def.id); return; }
        // 캐러셀에서 옆 카드를 누르면 먼저 가운데로 데려온다 — 오탭으로 엉뚱한 곡이 열리지 않게
        if (isCarousel && !card.classList.contains('is-active') && !e.target.closest('.cc-play')) {
          scrollToCard(idx);
          return;
        }
        openPair(def);
      });
      container.appendChild(card);
      lazyArt(container, def, era.art);
    });
    if (isCarousel) {
      buildDots(defs);
      syncCarousel();
      requestAnimationFrame(syncCarousel);
    }
  }

  /* ----- RACK: EP-133 풍 패드 그리드 ----- */
  function renderRack(container, defs, era) {
    defs.forEach((def, i) => {
      const pad = document.createElement('article');
      pad.className = 'rack-pad';
      pad.innerHTML = `
        <div class="rp-art skeleton" data-art="${def.id}"></div>
        <span class="rp-led"></span>
        <span class="rp-idx mono">${pad2(i + 1)}</span>
        <div class="rp-meta">
          <p class="rp-title">${def.title}</p>
          <p class="rp-year mono">${era.years(def)}</p>
        </div>
      `;
      pad.addEventListener('click', () => openPair(def));
      container.appendChild(pad);
      lazyArt(container, def, era.art);
    });
  }

  /* ----- WINAMP: 스킨 전체 재현 (메인 플레이어 + 이퀄라이저 + 플레이리스트) -----
     세 창 모두 90년대 스킨 그대로 그리되, 살아 있는 부분은 두 곳이다.
     ① 플레이리스트 행 선택 → ② 메인 창 마퀴 제목·정보가 따라 바뀐다.
     EQ 슬라이더와 스펙트럼은 장식. */
  const EQ_BANDS = ['70', '180', '320', '600', '1K', '3K', '6K', '12K', '14K', '16K'];
  const EQ_PRESET = [62, 48, 40, 46, 55, 58, 44, 34, 30, 36];  // 슬라이더 손잡이 위치(%)

  function renderWinamp(container, defs, era) {
    const win = (cls, title, inner, btns = '─ □ ✕') => `
      <section class="wa-win ${cls}">
        <div class="wa-title">
          <span class="wa-title-line"></span>
          <span class="wa-title-text">${title}</span>
          <span class="wa-title-line"></span>
          <span class="wa-title-btns">${btns}</span>
        </div>
        ${inner}
      </section>`;

    const viz = Array.from({ length: 19 }, (_, i) =>
      `<i style="--h:${18 + ((i * 37) % 70)}%;--d:${(i % 7) * 90}ms"></i>`).join('');

    const eq = EQ_BANDS.map((b, i) =>
      `<div class="wa-eq-band"><span class="wa-eq-slider"><i style="bottom:${EQ_PRESET[i]}%"></i></span>
       <span class="wa-eq-hz">${b}</span></div>`).join('');

    const rows = defs.map((def, i) => `
      <div class="wa-row" data-i="${i}">
        <span class="wa-idx">${i + 1}.</span>
        <span class="wa-name">${era.sub(def)} - ${def.title}</span>
        <span class="wa-dur">'${String(def.original.year).slice(2)}</span>
      </div>`).join('');

    container.innerHTML =
      /* ① 메인 플레이어 */
      win('wa-main', 'WINAMP', `
        <div class="wa-main-body">
          <div class="wa-lcd">
            <div class="wa-lcd-left">
              <span class="wa-om">O</span><span class="wa-om">A</span><span class="wa-om">I</span>
              <span class="wa-kbps">5<br>0<br>2<br>0<br>0</span>
            </div>
            <div class="wa-clock">
              <span class="wa-play-ico">▶</span>
              <span class="wa-time-big" id="wa-time">00:00</span>
            </div>
            <div class="wa-lcd-right">
              <div class="wa-marquee"><span id="wa-track">트랙을 선택하세요</span></div>
              <div class="wa-rates">
                <span class="wa-num" id="wa-kbps">256</span> kbps
                <span class="wa-num" id="wa-khz">44</span> kHz
                <span class="wa-chan">mono <em>stereo</em></span>
              </div>
              <div class="wa-viz">${viz}</div>
            </div>
          </div>
          <div class="wa-knobs">
            <span class="wa-slider wa-vol"><i></i></span>
            <span class="wa-slider wa-bal"><i></i></span>
            <span class="wa-tog on">EQ</span><span class="wa-tog on">PL</span>
          </div>
          <div class="wa-seek"><i></i></div>
          <div class="wa-transport">
            <button class="wa-tb" aria-label="이전">⏮</button>
            <button class="wa-tb" aria-label="재생">▶</button>
            <button class="wa-tb" aria-label="일시정지">❚❚</button>
            <button class="wa-tb" aria-label="정지">■</button>
            <button class="wa-tb" aria-label="다음">⏭</button>
            <button class="wa-tb wa-eject" aria-label="꺼내기">⏏</button>
            <span class="wa-tog">SHUFFLE</span><span class="wa-tog">REP</span>
          </div>
        </div>`) +

      /* ② 이퀄라이저 */
      win('wa-eqwin', 'WINAMP EQUALIZER', `
        <div class="wa-eq-body">
          <div class="wa-eq-head">
            <span class="wa-tog on">ON</span><span class="wa-tog">AUTO</span>
            <span class="wa-eq-curve"></span>
            <span class="wa-tog wa-presets">PRESETS</span>
          </div>
          <div class="wa-eq-graph">
            <div class="wa-eq-scale"><span>+12db</span><span>+0db</span><span>−12db</span></div>
            <div class="wa-eq-band wa-preamp"><span class="wa-eq-slider"><i style="bottom:50%"></i></span>
              <span class="wa-eq-hz">PREAMP</span></div>
            <span class="wa-eq-div"></span>
            ${eq}
          </div>
        </div>`) +

      /* ③ 플레이리스트 */
      win('wa-plwin', 'WINAMP PLAYLIST', `
        <div class="wa-pl-body">${rows}</div>
        <div class="wa-pl-foot">
          <span class="wa-pf">ADD</span><span class="wa-pf">REM</span>
          <span class="wa-pf">SEL</span><span class="wa-pf">MISC</span>
          <span class="wa-pl-total" id="wa-total">${Math.min(...defs.map((d) => d.original.year))}-${Math.max(...defs.map((d) => d.original.year))}</span>
          <span class="wa-pl-mini">◀◀ ▶ ❚❚ ■ ▶▶</span>
          <span class="wa-pf wa-listopts">LIST<br>OPTS</span>
        </div>`);

    // 선택 → 메인 창 표시 갱신 → 재생
    const body = container.querySelector('.wa-pl-body');
    const marquee = container.querySelector('#wa-track');

    body.querySelectorAll('.wa-row').forEach((row) => {
      row.addEventListener('click', () => {
        const def = defs[Number(row.dataset.i)];
        body.querySelectorAll('.wa-row').forEach((r) => r.classList.remove('on'));
        row.classList.add('on');
        // 실제 정보는 마퀴가 전한다. kbps/kHz 는 스킨 장식이라 건드리지 않는다.
        marquee.textContent = `${era.sub(def)} - ${def.title} (${era.years(def)})`;
        openPair(def);
      });
    });
  }

  /* ----- TUNER: 하이파이 주파수 다이얼 ----- */
  function renderTuner(container, defs, era) {
    defs.forEach((def, idx) => {
      const st = document.createElement('article');
      st.className = 'tn-station';
      st.innerHTML = `
        <span class="tn-freq mono">${era.years(def)}</span>
        <span class="tn-scale"></span>
        <div class="tn-art skeleton" data-art="${def.id}"></div>
        <p class="tn-title">${def.title}</p>
        <p class="tn-artist">${era.sub(def)}</p>
      `;
      st.addEventListener('click', () => {
        if (!st.classList.contains('is-active')) { scrollToCard(idx); return; }
        openPair(def);
      });
      container.appendChild(st);
      lazyArt(container, def, era.art);
    });
    buildDots(defs);
    syncCarousel();
    requestAnimationFrame(syncCarousel);
  }

  /* ----- DIAL: 부채꼴 회전 휠 -----
     세로 스크롤 위치에서 중심 인덱스를 구해, 항목마다 각도를 줘 다이얼처럼 편다. */
  function renderDial(container, defs, era) {
    defs.forEach((def) => {
      const item = document.createElement('article');
      item.className = 'dl-item';
      item.innerHTML = `
        <span class="dl-tick"></span>
        <div class="dl-art skeleton" data-art="${def.id}"></div>
        <div class="dl-text">
          <p class="dl-title">${def.title}</p>
          <p class="dl-sub">${era.sub(def)}</p>
        </div>
        <span class="dl-year mono">${era.years(def)}</span>
      `;
      item.addEventListener('click', () => {
        if (!item.classList.contains('is-active')) {
          item.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'center' });
          return;
        }
        openPair(def);
      });
      container.appendChild(item);
      lazyArt(container, def, era.art);
    });

    const spin = () => {
      const items = [...container.children];
      if (!items.length) return;
      const box = container.getBoundingClientRect();
      const mid = box.top + box.height / 2;
      let active = 0;
      let nearest = Infinity;
      items.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        const d = (r.top + r.height / 2 - mid) / (r.height || 1);
        if (Math.abs(d) < nearest) { nearest = Math.abs(d); active = i; }
        // 중심에서 멀수록 크게 돌리고 안쪽으로 당긴다
        el.style.transform = `rotate(${d * 7}deg)`;
        el.style.opacity = String(Math.max(0.25, 1 - Math.abs(d) * 0.42));
      });
      items.forEach((el, i) => el.classList.toggle('is-active', i === active));
    };
    let pending = 0;
    container.addEventListener('scroll', () => {
      if (pending) return;
      pending = requestAnimationFrame(() => { pending = 0; spin(); });
    }, { passive: true });
    spin();
    requestAnimationFrame(spin);
  }

  /* ----- TWIN: 원곡·리메이크 두 줄이 맞물려 도는 모드 -----
     한 줄을 튕기면 그 줄이 관성으로 안착하고, 멈춘 순간 반대편 줄이 같은 곡으로 따라온다.
     끄는 동안에도 반대편이 실시간으로 따라붙되, 되돌아오는 반향을 막기 위해
     "지금 사용자가 잡고 있는 줄"만 상대를 민다. */
  function renderTwin(container, defs) {
    const rails = {};
    ['original', 'remake'].forEach((side) => {
      const wrap = document.createElement('div');
      wrap.className = `twin-side ${side}`;
      wrap.innerHTML = `<span class="tw-label mono">${side === 'original' ? 'ORIGINAL' : 'REMAKE'}</span>`;

      const rail = document.createElement('div');
      rail.className = 'twin-rail rail';
      wrap.appendChild(rail);
      container.appendChild(wrap);
      rails[side] = rail;

      defs.forEach((def, idx) => {
        const meta = def[side];
        const card = document.createElement('article');
        card.className = 'tw-card';
        card.innerHTML = `
          <div class="tw-art skeleton" data-art="${side}-${def.id}"></div>
          <p class="tw-title">${def.title}</p>
          <p class="tw-sub">${meta.artist}</p>
          <span class="tw-year mono">${meta.year}</span>
        `;
        card.addEventListener('click', () => {
          if (!card.classList.contains('is-active')) { railScrollTo(rail, idx); return; }
          openPair(def);
        });
        rail.appendChild(card);
        lazyArt(container, def, (p) => p[side].artwork || p[side === 'original' ? 'remake' : 'original'].artwork,
          `${side}-${def.id}`);
      });
    });

    // 두 줄을 서로에게 묶는다
    attachRail(rails.original, {
      twin: () => rails.remake,
      onSettle: (i) => railScrollTo(rails.remake, i, { silent: true }),
    });
    attachRail(rails.remake, {
      twin: () => rails.original,
      onSettle: (i) => railScrollTo(rails.original, i, { silent: true }),
    });
    railSync(rails.original);
    railSync(rails.remake);
    requestAnimationFrame(() => { railSync(rails.original); railSync(rails.remake); });
  }

  /* ----- 디스패처 ----- */
  function renderPairCards(container, defs, { removable = false, layout = 'grid' } = {}) {
    const era = ERA[eraFilter];
    container.innerHTML = '';
    if (layout === 'rack') return renderRack(container, defs, era);
    if (layout === 'winamp') return renderWinamp(container, defs, era);
    if (layout === 'tuner') return renderTuner(container, defs, era);
    if (layout === 'dial') return renderDial(container, defs, era);
    if (layout === 'twin') return renderTwin(container, defs);
    return renderCards(container, defs, era, layout, removable);
  }

  /* ---------- 시대 필터 토글 (원곡 | 양쪽 | 리메이크) ---------- */
  function applyEra(next) {
    eraFilter = next;
    const era = ERA[next];
    setTheme(era.theme);
    $('#list-caption').textContent = era.caption;
    $$('#view-toggle .vt-btn').forEach((b) => {
      const on = b.dataset.era === next;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    // 시대마다 마지막에 골라둔 레이아웃으로 돌아간다
    layoutMode = layoutByEra[next];
    applyLayout();
    if (activeScreen === 'library') renderLibrary();
  }

  $('#view-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.vt-btn');
    if (!btn || btn.dataset.era === eraFilter) return;
    applyEra(btn.dataset.era);
  });

  /* ---------- 레이아웃 ----------
     시대마다 고를 수 있는 레이아웃 묶음이 다르다. #btn-layout(tweak)은 현재 시대의
     묶음 안에서만 순환하고, 고른 값은 시대별로 따로 기억한다. */
  const LAYOUT_LABEL = {
    carousel: 'CAROUSEL', grid: 'GRID', list: 'LIST',
    rack: 'RACK', winamp: 'WINAMP', tuner: 'TUNER', dial: 'DIAL',
    twin: 'TWIN',
  };
  const LAYOUT_ICON = {
    carousel: 'gallery-horizontal-end', grid: 'layout-grid', list: 'layout-list',
    rack: 'grid-3x3', winamp: 'list-music', tuner: 'radio', dial: 'disc-3',
    twin: 'rows-2',
  };
  const ALL_LAYOUTS = Object.keys(LAYOUT_LABEL);
  // 시대별로 마지막에 고른 레이아웃을 기억한다
  const layoutByEra = { original: 'rack', both: 'twin', remake: 'carousel' };
  let layoutMode = layoutByEra[eraFilter];

  const listEl = $('#pair-list');
  const dotsEl = $('#carousel-dots');

  /** 가운데 정렬 가로 스크롤을 쓰는 레이아웃 (관성·스냅·인디케이터 대상) */
  const RAIL_LAYOUTS = ['carousel', 'tuner', 'twin'];
  const DOT_LAYOUTS = ['carousel', 'tuner'];

  function applyLayout() {
    // WINAMP 은 목록 하나가 아니라 화면 전체를 덮는 스킨이다 (헤더·여백·하단바까지)
    if (layoutMode === 'winamp') document.documentElement.dataset.skin = 'winamp';
    else delete document.documentElement.dataset.skin;

    ALL_LAYOUTS.forEach((l) => listEl.classList.toggle(l, l === layoutMode));
    listEl.classList.toggle('rail', RAIL_LAYOUTS.includes(layoutMode) && layoutMode !== 'twin');
    dotsEl.classList.toggle('hidden', !DOT_LAYOUTS.includes(layoutMode));
    $('#btn-layout').innerHTML = iconSvg(LAYOUT_ICON[layoutMode], 16);
    $('#btn-layout').setAttribute('aria-label', `레이아웃 전환 (현재 ${LAYOUT_LABEL[layoutMode]})`);
    $('#list-caption').textContent = `${ERA[eraFilter].caption} · ${LAYOUT_LABEL[layoutMode]}`;
    renderPairCards(listEl, DITTO_PAIRS, { layout: layoutMode });
  }

  // tweak 버튼 — 현재 시대가 가진 레이아웃들만 돌린다
  $('#btn-layout').addEventListener('click', () => {
    const set = ERA[eraFilter].layouts;
    layoutMode = set[(set.indexOf(layoutMode) + 1) % set.length];
    layoutByEra[eraFilter] = layoutMode;
    applyLayout();
    toast(`레이아웃 · ${LAYOUT_LABEL[layoutMode]}`, 1200);
  });

  /* ---------- 레일 엔진 ----------
     가운데에 가장 가까운 카드를 활성으로 보고, 관성 글라이드로 그 카드에 안착시킨다.
     캐러셀·튜너·양쪽(TWIN)의 두 줄이 모두 이 엔진을 공유한다. */
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const DRAG_SLOP = 6;        // 이 정도 움직임까지는 클릭으로 본다 (px)
  const WHEEL_STEP = 30;      // 한 칸 넘기기까지 필요한 휠 누적량
  const WHEEL_LOCK_MS = 260;  // 트랙패드 한 제스처가 여러 칸 날아가지 않게
  const FLICK_MIN_V = 0.22;   // px/ms — 이 미만은 튕긴 게 아니라 그냥 놓은 것으로 본다
  const FLICK_DECEL = 0.0024; // px/ms² — 관성 감속도. 키우면 덜 미끄러진다
  const FLICK_MAX_CARDS = 4;  // 한 번에 날아갈 수 있는 최대 칸수
  const SAMPLE_MS = 100;      // 속도를 재는 최근 구간

  /* 지금 사용자가 직접 조작 중인 레일. TWIN 에서 반대편이 되받아치는 반향을 막는다 —
     미는 쪽은 언제나 이 레일 하나뿐이다. */
  let drivingRail = null;

  /** el 을 관성 스크롤 레일로 만든다.
     onSettle(idx): 안착 시 1회 / twin(): 짝이 되는 반대편 레일 */
  function attachRail(el, { onSettle = null, twin = null } = {}) {
    const st = {
      glideRaf: 0, dragging: false, dragStartX: 0, dragStartScroll: 0,
      dragMoved: 0, samples: [], wheelAcc: 0, wheelUntil: 0, syncPending: 0,
      onSettle, twin,
    };
    el._rail = st;

    el.addEventListener('scroll', () => {
      if (st.syncPending) return;
      st.syncPending = requestAnimationFrame(() => { st.syncPending = 0; railSync(el); });
    }, { passive: true });

    el.addEventListener('wheel', (e) => {
      if (!isRail(el)) return;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!delta) return;
      // 양 끝에 닿으면 페이지 세로 스크롤에 양보한다
      const atStart = el.scrollLeft <= 1;
      const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 1;
      if ((delta < 0 && atStart) || (delta > 0 && atEnd)) return;
      e.preventDefault();
      drivingRail = el;
      if (Date.now() < st.wheelUntil) return;
      st.wheelAcc += delta;
      if (Math.abs(st.wheelAcc) < WHEEL_STEP) return;
      const dir = st.wheelAcc > 0 ? 1 : -1;
      st.wheelAcc = 0;
      st.wheelUntil = Date.now() + WHEEL_LOCK_MS;
      const last = el.children.length - 1;
      railScrollTo(el, Math.max(0, Math.min(last, railNearest(el) + dir)));
    }, { passive: false });

    el.addEventListener('pointerdown', (e) => {
      if (!isRail(el) || e.pointerType === 'touch' || e.button !== 0) return;
      railStopGlide(el);              // 굴러가는 중에 붙잡으면 그 자리에서 멈춘다
      drivingRail = el;
      st.dragging = true;
      st.dragMoved = 0;
      st.dragStartX = e.clientX;
      st.dragStartScroll = el.scrollLeft;
      st.samples = [{ t: e.timeStamp, x: e.clientX }];
      el.style.scrollSnapType = 'none';
      el.style.scrollBehavior = 'auto';
    });

    el.addEventListener('pointermove', (e) => {
      if (!st.dragging) return;
      const dx = e.clientX - st.dragStartX;
      st.dragMoved = Math.max(st.dragMoved, Math.abs(dx));
      if (st.dragMoved > DRAG_SLOP && !el.hasPointerCapture(e.pointerId)) {
        try { el.setPointerCapture(e.pointerId); } catch {}
        el.classList.add('dragging');
      }
      el.scrollLeft = st.dragStartScroll - dx;
      st.samples.push({ t: e.timeStamp, x: e.clientX });
      if (st.samples.length > 12) st.samples.shift();
    });

    const endDrag = (e) => {
      if (!st.dragging) return;
      st.dragging = false;
      el.classList.remove('dragging');
      el.style.scrollSnapType = '';
      el.style.scrollBehavior = '';
      if (st.dragMoved <= DRAG_SLOP) return;      // 클릭이었다
      const now = e ? e.timeStamp : performance.now();
      const recent = st.samples.filter((s) => now - s.t <= SAMPLE_MS);
      let v = 0;
      if (recent.length >= 2) {
        const a = recent[0];
        const b = recent[recent.length - 1];
        if (b.t > a.t) v = (b.x - a.x) / (b.t - a.t);
      }
      st.samples = [];
      const scrollV = -v;                          // 스크롤은 포인터와 반대로 움직인다
      if (Math.abs(scrollV) < FLICK_MIN_V) { railScrollTo(el, railNearest(el)); return; }
      // 등감속 이동거리 = v²/2a → 멈출 지점에 가장 가까운 카드
      const glide = Math.sign(scrollV) * (scrollV * scrollV) / (2 * FLICK_DECEL);
      const landing = el.scrollLeft + glide;
      const here = railNearest(el);
      let best = 0;
      let nearest = Infinity;
      for (let i = 0; i < el.children.length; i++) {
        const d = Math.abs(railSnapPos(el, i) - landing);
        if (d < nearest) { nearest = d; best = i; }
      }
      railScrollTo(el, Math.max(here - FLICK_MAX_CARDS, Math.min(here + FLICK_MAX_CARDS, best)));
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);

    // 끌고 나서 손을 뗀 클릭이 카드를 열지 않도록 캡처 단계에서 삼킨다
    el.addEventListener('click', (e) => {
      if (st.dragMoved > DRAG_SLOP) {
        e.stopPropagation();
        e.preventDefault();
        st.dragMoved = 0;
      }
    }, true);
  }

  function isRail(el) { return el.classList.contains('rail'); }

  /** idx번 카드가 중앙에 놓이는 scrollLeft 값 */
  function railSnapPos(el, idx) {
    const card = el.children[idx];
    if (!card) return 0;
    const raw = card.offsetLeft - el.offsetLeft + card.offsetWidth / 2 - el.clientWidth / 2;
    return Math.max(0, Math.min(raw, el.scrollWidth - el.clientWidth));
  }

  /** 컨테이너 중앙에 가장 가까운 카드의 인덱스 */
  function railNearest(el) {
    const cards = [...el.children];
    if (!cards.length) return 0;
    const box = el.getBoundingClientRect();
    const mid = box.left + box.width / 2;
    let active = 0;
    let nearest = Infinity;
    cards.forEach((card, i) => {
      const r = card.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - mid);
      if (d < nearest) { nearest = d; active = i; }
    });
    return active;
  }

  function railStopGlide(el) {
    const st = el._rail;
    if (!st || !st.glideRaf) return;
    cancelAnimationFrame(st.glideRaf);
    st.glideRaf = 0;
    el.style.scrollSnapType = '';
    el.style.scrollBehavior = '';
  }

  /* 관성 글라이드: 브라우저 기본 smooth 스크롤은 곡선·시간을 고를 수 없어서 직접 굴린다.
     ease-out cubic 으로 감속시켜야 "던져놓으면 미끄러지다 잦아드는" 감각이 난다. */
  function railScrollTo(el, idx, { silent = false } = {}) {
    const st = el._rail;
    railStopGlide(el);
    const to = railSnapPos(el, idx);
    const from = el.scrollLeft;
    const dist = to - from;
    const done = () => {
      railSync(el);
      if (!silent && st && st.onSettle) st.onSettle(idx);
    };
    if (Math.abs(dist) < 1 || reduceMotion.matches) {
      el.style.scrollBehavior = 'auto';
      el.scrollLeft = to;
      el.style.scrollBehavior = '';
      done();
      return;
    }
    const dur = Math.min(720, Math.max(240, Math.abs(dist) * 0.85));
    const t0 = performance.now();
    el.style.scrollSnapType = 'none';   // 굴리는 동안 스냅이 끼어들면 중간에 튄다
    el.style.scrollBehavior = 'auto';
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      el.scrollLeft = from + dist * (1 - Math.pow(1 - p, 3));
      if (p < 1) {
        st.glideRaf = requestAnimationFrame(tick);
      } else {
        st.glideRaf = 0;
        el.style.scrollSnapType = '';
        el.style.scrollBehavior = '';
        done();
      }
    };
    st.glideRaf = requestAnimationFrame(tick);
  }

  /** 활성 카드 표시 + 인디케이터 갱신 */
  function railSync(el) {
    if (!el.children.length) return;
    const active = railNearest(el);
    [...el.children].forEach((card, i) => card.classList.toggle('is-active', i === active));
    if (el === listEl && DOT_LAYOUTS.includes(layoutMode)) {
      [...dotsEl.children].forEach((dot, i) => {
        dot.classList.toggle('on', i === active);
        dot.setAttribute('aria-selected', String(i === active));
      });
    }
    // TWIN: 내가 조작 중인 줄이면 반대편을 실시간으로 끌고 간다 (애니메이션 없이 즉시)
    const st = el._rail;
    if (st && st.twin && drivingRail === el) {
      const other = st.twin();
      if (other && other.children.length) {
        railStopGlide(other);
        const to = railSnapPos(other, active);
        if (Math.abs(other.scrollLeft - to) > 0.5) {
          other.style.scrollBehavior = 'auto';
          other.scrollLeft = to;
          other.style.scrollBehavior = '';
        }
      }
    }
  }

  // 메인 목록은 한 번만 붙여두고, 레이아웃이 rail 인지에 따라 스스로 켜고 꺼진다
  attachRail(listEl);

  function scrollToCard(idx) { railScrollTo(listEl, idx); }
  function syncCarousel() { if (isRail(listEl)) railSync(listEl); }

  function buildDots(defs) {
    dotsEl.innerHTML = '';
    defs.forEach((def, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', `${i + 1}번째 · ${def.title}`);
      dot.addEventListener('click', () => scrollToCard(i));
      dotsEl.appendChild(dot);
    });
  }

  applyLayout();

  /* ---------- Player 열기 ---------- */
  async function openPair(def, { show = true } = {}) {
    if (show) showScreen('player');
    currentPairIndex = DITTO_PAIRS.findIndex((p) => p.id === def.id);
    if (activeScreen === 'player') $('#fab').classList.toggle('hidden', currentPairIndex < 0);
    $('#song-title').textContent = `${def.title}`;
    $('#song-subtitle').textContent = '매칭 중…';
    try {
      const pair = await resolvePair(def);
      // 보고 있던 시대(원곡/리메이크)로 재생을 시작한다
      await DittoPlayer.loadPair(pair, { startMode: eraFilter });
    } catch {
      toast('트랙 매칭에 실패했어요. 네트워크를 확인해주세요.');
    }
  }

  /** 검색 결과 단일 곡 재생 (셔틀 비활성) */
  function openSingle(track) {
    showScreen('player');
    currentPairIndex = -1;
    $('#fab').classList.add('hidden');
    const pair = {
      id: `single-${track.trackId}`,
      title: track.title,
      original: null,
      remake: {
        artist: track.artist,
        year: track.year,
        album: track.album,
        artwork: track.artwork,
        previewUrl: track.previewUrl,
        ytQuery: `${track.title} ${track.artist} Official Audio`,
      },
    };
    DittoPlayer.loadPair(pair).catch(() => toast('재생에 실패했어요.'));
  }

  /* ---------- Player UI 갱신 ---------- */
  function updatePlayerUI(pair, mode) {
    const meta = pair[mode];
    const isOriginal = mode === 'original';

    $('#mode-chip').textContent = isOriginal ? 'ORIGINAL' : 'REMAKE';
    $('#song-title').textContent = `${meta.artist} 〈${pair.title}〉`;
    $('#song-subtitle').textContent = meta.album || `${meta.year}`;
    $('#album-art').style.backgroundImage = meta.artwork ? `url('${meta.artwork}')` : 'none';

    $('#year-original').textContent = pair.original?.year ?? '—';
    $('#year-remake').textContent = pair.remake?.year ?? '—';

    const shuttle = $('#shuttle');
    shuttle.value = isOriginal ? 0 : 100;
    shuttle.disabled = !(pair.original && pair.remake);
    $('#shuttle-caption').innerHTML = shuttle.disabled
      ? '단일 트랙 — 셔틀 불가'
      : `${iconSvg('arrow-left', 12)} TIME SHUTTLE ${iconSvg('arrow-right', 12)}`;

    $('#source-tag').textContent =
      DittoPlayer.state.source === 'youtube' ? 'YouTube 전체 곡' : 'iTunes 30초 미리듣기';

    setTheme(isOriginal ? 'retro' : 'modern');
  }

  /* ---------- 글리치 타임슬립 연출 (PRD 5-1) ---------- */
  function glitch(show, toMode, pair) {
    const overlay = $('#glitch');
    if (show) {
      const year = pair?.[toMode]?.year ?? '';
      $('#glitch-text').textContent =
        toMode === 'original' ? `◀◀ REWINDING… ${year}` : `▶▶ FAST-FORWARD… ${year}`;
      overlay.classList.remove('hidden');
      if (navigator.vibrate) navigator.vibrate(30); // Haptic 피드백
    } else {
      overlay.classList.add('hidden');
    }
  }

  /* ---------- 타임 셔틀 슬라이더 ---------- */
  const shuttleEl = $('#shuttle');
  shuttleEl.addEventListener('change', async () => {
    const toMode = Number(shuttleEl.value) < 50 ? 'original' : 'remake';
    shuttleEl.value = toMode === 'original' ? 0 : 100;
    const { pair, mode } = DittoPlayer.state;
    if (!pair || toMode === mode) return;

    glitch(true, toMode, pair);
    const ok = await DittoPlayer.shuttle(toMode);
    glitch(false);
    if (!ok) shuttleEl.value = mode === 'original' ? 0 : 100; // 실패 시 원위치
  });

  /* ---------- 재생 컨트롤 ---------- */
  $('#btn-play').addEventListener('click', () => DittoPlayer.toggle());

  function step(delta) {
    if (currentPairIndex < 0) return toast('추천 목록에서만 이동할 수 있어요.');
    const next = (currentPairIndex + delta + DITTO_PAIRS.length) % DITTO_PAIRS.length;
    // 자동/수동 곡 이동 시 사용자가 보던 화면을 빼앗지 않음
    openPair(DITTO_PAIRS[next], { show: activeScreen === 'player' });
  }
  $('#btn-prev').addEventListener('click', () => step(-1));
  $('#btn-next').addEventListener('click', () => step(1));

  /* ---------- 진행 바 ---------- */
  const progressEl = $('#progress');
  progressEl.addEventListener('input', () => { seeking = true; });
  progressEl.addEventListener('change', () => {
    DittoPlayer.seekRatio(Number(progressEl.value) / 100);
    seeking = false;
  });

  /* ---------- 플레이어 이벤트 바인딩 ---------- */
  DittoPlayer.on({
    onTrackLoaded: (pair, mode) => updatePlayerUI(pair, mode),
    onModeChange: (mode) => setTheme(mode === 'original' ? 'retro' : 'modern'),
    onTick: (cur, dur) => {
      if (seeking) return;
      const pct = dur ? (cur / dur) * 100 : 0;
      progressEl.value = pct;
      progressEl.style.setProperty('--pct', `${pct}%`);
      $('#time-cur').textContent = fmtTime(cur);
      $('#time-dur').textContent = fmtTime(dur);
    },
    onStateChange: (playing) => {
      $('#btn-play').innerHTML = iconSvg(playing ? 'pause' : 'play', 22);
      $('#album-card').classList.toggle('playing', playing);
      $('#signal-bars').textContent = playing ? '▂▅▇▅' : '▁▁▁▁';
    },
    onError: (msg) => toast(msg, 3500),
    onEnded: () => {
      // 30초 미리듣기 종료 시 자동 다음 곡 (추천 목록 재생 중일 때)
      if (currentPairIndex >= 0) step(1);
    },
  });

  /* ---------- Search ---------- */
  async function doSearch() {
    const term = $('#search-input').value.trim();
    if (!term) return;
    const box = $('#search-results');
    box.innerHTML = '<p class="search-hint">검색 중…</p>';
    try {
      const results = await DittoItunes.search(term, 15);
      box.innerHTML = '';
      if (!results.length) {
        box.innerHTML = '<p class="search-hint">결과가 없어요.</p>';
        return;
      }
      results.forEach((t) => {
        const row = document.createElement('div');
        row.className = 'result-row';
        row.innerHTML = `
          <div class="result-art" style="background-image:url('${t.artwork}')"></div>
          <div class="result-meta">
            <p class="result-title">${t.title}</p>
            <p class="result-sub">${t.artist} · ${t.album}</p>
          </div>
          <span class="result-year">${t.year ?? ''}</span>
        `;
        row.addEventListener('click', () => openSingle(t));
        box.appendChild(row);
      });
    } catch {
      box.innerHTML = '<p class="search-hint">검색에 실패했어요. 네트워크를 확인해주세요.</p>';
    }
  }
  $('#search-btn').addEventListener('click', doSearch);
  $('#search-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

  /* ---------- Library (localStorage) ---------- */
  function getLibrary() {
    try { return JSON.parse(localStorage.getItem(DITTO_CONFIG.STORAGE_KEYS.LIBRARY)) || []; }
    catch { return []; }
  }
  function setLibrary(ids) {
    localStorage.setItem(DITTO_CONFIG.STORAGE_KEYS.LIBRARY, JSON.stringify(ids));
  }
  function renderLibrary() {
    const ids = getLibrary();
    const defs = DITTO_PAIRS.filter((p) => ids.includes(p.id));
    const box = $('#library-list');
    if (!defs.length) {
      box.innerHTML = '<p class="search-hint">저장된 셔틀이 없어요.</p>';
      return;
    }
    box.classList.remove('grid', 'carousel');
    box.classList.add('list');
    renderPairCards(box, defs, { removable: true, layout: 'list' });
  }
  function removeFromLibrary(id) {
    setLibrary(getLibrary().filter((x) => x !== id));
    renderLibrary();
    toast('라이브러리에서 삭제했어요.');
  }
  $('#fab').addEventListener('click', () => {
    const pair = DittoPlayer.state.pair;
    if (!pair || currentPairIndex < 0) return;
    const ids = getLibrary();
    if (ids.includes(pair.id)) return toast('이미 라이브러리에 있어요.');
    ids.push(pair.id);
    setLibrary(ids);
    toast('라이브러리에 저장했어요 ♡');
  });

  /* ---------- Settings ---------- */
  const modal = $('#settings-modal');
  $('#btn-settings').addEventListener('click', () => {
    $('#yt-key').value = DittoConfig.getYtKey();
    $('#source-select').value = DittoConfig.getSource();
    modal.classList.remove('hidden');
  });
  $('#settings-cancel').addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
  $('#settings-save').addEventListener('click', async () => {
    const key = $('#yt-key').value.trim();
    const source = $('#source-select').value;
    if (source === 'youtube' && !key) {
      toast('YouTube 전체 곡 재생에는 API 키가 필요해요.');
      return;
    }
    DittoConfig.setYtKey(key);
    DittoConfig.setSource(source);
    modal.classList.add('hidden');
    toast('설정을 저장했어요.');
    $('#source-tag').textContent = source === 'youtube' ? 'YouTube 전체 곡' : 'iTunes 30초 미리듣기';
    await DittoPlayer.setSource(source);
  });

  /* ---------- 초기 화면 ---------- */
  showScreen('home');
})();
