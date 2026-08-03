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
      years: (d) => `${d.original.year}`,
      sub:   (d) => d.original.artist,
      art:   (p) => p.original.artwork || p.remake.artwork,
    },
    remake: {
      theme: 'modern',
      caption: '리메이크 REMAKE',
      years: (d) => `${d.remake.year}`,
      sub:   (d) => d.remake.artist,
      art:   (p) => p.remake.artwork || p.original.artwork,
    },
  };
  let eraFilter = 'remake';

  /* ---------- Home: 추천 셔틀 목록 ---------- */
  function renderPairCards(container, defs, { removable = false } = {}) {
    const era = ERA[eraFilter];
    container.innerHTML = '';
    defs.forEach((def) => {
      const card = document.createElement('article');
      card.className = 'pair-card';
      card.innerHTML = `
        <div class="pair-art skeleton" data-art="${def.id}">
          <span class="pair-years mono">${era.years(def)}</span>
        </div>
        <div class="pair-meta">
          <p class="pair-title">${def.title}</p>
          <p class="pair-sub">${era.sub(def)}</p>
        </div>
        ${removable ? `<button class="pair-remove" aria-label="삭제">${iconSvg('x', 14)}</button>` : ''}
      `;
      card.addEventListener('click', (e) => {
        if (e.target.closest('.pair-remove')) {
          removeFromLibrary(def.id);
          return;
        }
        openPair(def);
      });
      container.appendChild(card);

      // 아트워크 lazy 매칭
      resolvePair(def).then((pair) => {
        const art = era.art(pair);
        const el = container.querySelector(`[data-art="${def.id}"]`);
        if (el && art) {
          el.classList.remove('skeleton');
          el.style.backgroundImage = `url('${art}')`;
        }
      }).catch(() => {});
    });
  }

  renderPairCards($('#pair-list'), DITTO_PAIRS);

  // 히어로 카드 아트워크
  resolvePair(DITTO_PAIRS[0]).then((p) => {
    const art = p.remake.artwork || p.original.artwork;
    if (art) $('#hero-art').style.backgroundImage = `url('${art}')`;
  }).catch(() => {});
  $('#hero-play').addEventListener('click', () => openPair(DITTO_PAIRS[0]));

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
    renderPairCards($('#pair-list'), DITTO_PAIRS);
    if (activeScreen === 'library') renderLibrary();
  }

  $('#view-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.vt-btn');
    if (!btn || btn.dataset.era === eraFilter) return;
    applyEra(btn.dataset.era);
  });

  /* ---------- Discovery: 랜덤 셔틀 발견 ----------
     홈에서는 무작위 한 쌍을 열고, 플레이어에서는 다음 랜덤으로 점프한다.
     지금 듣고 있는 곡은 후보에서 빼서 같은 곡이 다시 나오지 않게 한다. */
  const RECENT_MAX = 3;              // 최근 이만큼은 다시 뽑지 않는다
  const recentDiscoveries = [];

  function discoverRandom(btn) {
    const fresh = DITTO_PAIRS.filter(
      (p, i) => i !== currentPairIndex && !recentDiscoveries.includes(p.id)
    );
    // 후보가 마르면 최근 기록을 비우고 현재 곡만 제외
    const pool = fresh.length ? fresh : DITTO_PAIRS.filter((_, i) => i !== currentPairIndex);
    if (!pool.length) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];

    recentDiscoveries.push(pick.id);
    if (recentDiscoveries.length > RECENT_MAX) recentDiscoveries.shift();

    btn.classList.remove('rolling');
    void btn.offsetWidth;            // 연타해도 애니메이션이 다시 재생되도록 리플로우
    btn.classList.add('rolling');

    toast(`랜덤 타임슬립 · 〈${pick.title}〉 ${pick.original.year} ⇄ ${pick.remake.year}`);
    openPair(pick);
  }
  $$('[data-discover]').forEach((btn) =>
    btn.addEventListener('click', () => discoverRandom(btn))
  );

  /* ---------- 레이아웃 토글 (그리드 ⇄ 리스트) ---------- */
  let isGridLayout = true;
  function applyLayout() {
    const list = $('#pair-list');
    list.classList.toggle('grid', isGridLayout);
    list.classList.toggle('list', !isGridLayout);
    // 아이콘은 "현재 상태"를 보여준다
    $('#btn-layout').innerHTML = iconSvg(isGridLayout ? 'layout-grid' : 'layout-list', 16);
  }
  $('#btn-layout').addEventListener('click', () => {
    isGridLayout = !isGridLayout;
    applyLayout();
  });
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
    box.classList.remove('grid');
    box.classList.add('list');
    renderPairCards(box, defs, { removable: true });
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
