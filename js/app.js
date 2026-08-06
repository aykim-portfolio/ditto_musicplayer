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
      // 카드에 붙는 뱃지는 시대 이름이 아니라 '여기서 어디로 갈 수 있는지'다.
      // 홈에서부터 이 앱이 두 시대를 잇는 물건이라는 게 읽혀야 한다.
      badge: (d) => `▶▶ ${d.remake.year}`,
      // 같은 기기의 화면 두 장 — tweak 버튼으로 돌려본다.
      // RACK(EP-133 패드)·DIAL(부채꼴 휠)·WINAMP(전면 스킨)은 노출에서 뺐다.
      // 렌더러와 CSS 는 남아 있으니 여기 배열에 이름만 되돌리면 다시 살아난다.
      // 맨 앞이 기본값이다 (applyEra 가 layouts[0] 로 연다)
      layouts: ['mp3amp', 'tuner'],
      years: (d) => `${d.original.year}`,
      sub:   (d) => d.original.artist,
      art:   (p) => p.original.artwork || p.remake.artwork,
    },
    both: {
      // 양쪽 보기는 어느 한 시대를 고르지 않는다 — 앱의 기본 판(모던) 위에서
      // 두 줄이 각자의 시대 형태(.era-past / .era-present)를 입는다.
      theme: 'modern',
      caption: '양쪽 BOTH',
      badge: (d) => `${yearGap(d)}년`,
      layouts: ['twin'],     // 원곡·리메이크 두 줄이 맞물려 움직인다
      years: (d) => `${d.original.year} ⇄ ${d.remake.year}`,
      sub:   (d) => `${d.original.artist} ⇄ ${d.remake.artist}`,
      art:   (p) => p.remake.artwork || p.original.artwork,
    },
    remake: {
      theme: 'modern',
      caption: '리메이크 REMAKE',
      badge: (d) => `◀◀ ${d.original.year}`,
      layouts: ['carousel', 'grid', 'list'],
      years: (d) => `${d.remake.year}`,
      sub:   (d) => d.remake.artist,
      art:   (p) => p.remake.artwork || p.original.artwork,
    },
  };
  let eraFilter = 'remake';

  /** 두 곡 사이의 연차. 셔틀이 건너뛰는 거리 = 이 앱이 파는 값. */
  function yearGap(def) {
    const a = Number(def?.original?.year);
    const b = Number(def?.remake?.year);
    if (!a || !b) return 0;
    return Math.abs(b - a);
  }

  /* 홈 목록은 연대순으로 세운다. 지금 보고 있는 시대의 연도가 기준.
     TUNER 다이얼과 DIAL 휠이 '연표'로 읽히려면 순서 자체가 시간이어야 한다 —
     예전엔 데이터 파일에 적힌 순서였다. */
  function orderedPairs() {
    const side = eraFilter === 'remake' ? 'remake' : 'original';
    return [...DITTO_PAIRS].sort((a, b) => a[side].year - b[side].year);
  }

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
          <span class="cc-badge">${era.badge(def)}</span>
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

  /* ----- TUNER: 휴대용 MP3 플레이어 -----
     2000년대 중반 보급형 MP3(아이팟 나노를 따라 만든 그 물건)의 구조를 그대로 쓴다.
     바디 안에 LCD 가 파묻혀 있고, 그 아래 클릭휠이 붙는다.
     주파수 다이얼과 궁합이 좋다 — 연도가 곧 주파수고, 휠이 곧 튜닝 노브다.

     레일은 #pair-list 자체가 아니라 LCD 안에 중첩된다. TWIN 과 같은 방식으로
     attachRail() 을 중첩 레일에 직접 건다. */
  /* ----- 클릭휠 힌트 -----
     널링(요철)은 CSS 가 항상 그린다. 여기서 맡는 건 '한 번 도는 것' 뿐이다.

     회전은 보이지 않는 제스처라, 실물 아이팟을 안 써본 사람에게 이 링은 그냥
     장식용 원반이다. 그렇다고 볼 때마다 띄우면 기기가 사용자를 못 믿는 것처럼
     보인다 — 딱 한 번 보여주고 끝낸다. localStorage 가 막힌 환경에서는
     '이미 봤다'로 친다. 힌트를 못 띄우는 것보다 매번 띄우는 쪽이 더 나쁘다. */
  const WHEEL_HINT_KEY = DITTO_CONFIG.STORAGE_KEYS.WHEEL_HINT;
  const wheelHintSeen = () => {
    try { return localStorage.getItem(WHEEL_HINT_KEY) === '1'; } catch { return true; }
  };
  const markWheelHintSeen = () => {
    try { localStorage.setItem(WHEEL_HINT_KEY, '1'); } catch {}
  };
  function primeWheelHint(wheel) {
    // 움직임을 줄이라고 한 사람에게는 아예 걸지 않는다. '봤다'로 치지도 않아서
    // 나중에 설정을 바꾸면 그때 한 번 보여준다.
    if (reduceMotion.matches || wheelHintSeen()) return;

    // 렌더 직후 바로 돌면 화면이 자리잡는 중이라 눈에 안 띈다
    const timer = setTimeout(() => {
      wheel.classList.add('hint-turn');
      markWheelHintSeen();
    }, 700);
    wheel.addEventListener('animationend', () => wheel.classList.remove('hint-turn'), { once: true });

    // 힌트가 뜨기 전에 링을 스스로 잡았다면 알려줄 필요가 없는 사람이다.
    // 좌우·가운데 버튼은 제외한다 — 버튼만 쓰는 사람이야말로 휠을 못 찾은 사람이라
    // 여기서 취소해버리면 정작 필요한 쪽에서 힌트가 사라진다.
    wheel.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.mp3-side, .mp3-center, .mp3-lbl')) return;
      clearTimeout(timer);
      markWheelHintSeen();
    });
  }

  /* 링 위아래의 볼륨 버튼. 각인이던 걸 실제로 동작하게 바꿨다 —
     [19번](MAKING-OF)에서 라벨만 정정하고 기능은 안 붙였던 자리다.
     휠은 동적으로 그려지므로 아이콘도 여기서 심는다(전역 mountIcons 는 로드 때 한 번뿐). */
  function wireWheelVolume(shell) {
    mountIcons(shell);
    shell.querySelectorAll('.mp3-lbl').forEach((btn) => {
      const dir = btn.classList.contains('vol-up') ? 1 : -1;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();          // 휠의 클릭 처리로 새어나가지 않게
        const v = DittoPlayer.nudgeVolume(dir);
        toast(`볼륨 ${Math.round(v * 100)}%`, 900);
      });
    });
  }

  function renderTuner(container, defs, era) {
    const shell = document.createElement('div');
    shell.className = 'mp3';
    shell.innerHTML = `
      <div class="mp3-screen">
        <div class="mp3-status">
          <span class="mp3-clock mono">${era.years(defs[0])}</span>
          <span class="mp3-status-mid mono">TUNER</span>
          <span class="mp3-batt"></span>
        </div>
        <div class="mp3-rail rail"></div>
        <div class="mp3-icons">
          <span class="mp3-ico on"></span><span class="mp3-ico"></span><span class="mp3-ico"></span>
          <span class="mp3-ico"></span><span class="mp3-ico"></span><span class="mp3-ico"></span>
          <span class="mp3-ico grid"></span>
        </div>
      </div>
      <div class="mp3-wheel">
        <button type="button" class="mp3-lbl vol-up" aria-label="볼륨 높이기"
                data-icon="chevron-up" data-icon-size="16"></button>
        <button type="button" class="mp3-lbl vol-down" aria-label="볼륨 낮추기"
                data-icon="chevron-down" data-icon-size="16"></button>
        <button type="button" class="mp3-side prev" aria-label="이전 연도">◀◀</button>
        <button type="button" class="mp3-side next" aria-label="다음 연도">▶▶</button>
        <button type="button" class="mp3-center" aria-label="재생"></button>
      </div>
    `;
    container.appendChild(shell);

    const rail = shell.querySelector('.mp3-rail');
    const clock = shell.querySelector('.mp3-clock');

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
        if (!st.classList.contains('is-active')) { railScrollTo(rail, idx); return; }
        openPair(def);
      });
      rail.appendChild(st);
      lazyArt(rail, def, era.art);
    });

    /* 상태바 시계 자리에는 지금 맞춰진 연도를 띄운다 — 이 기기의 '주파수 표시창'.
       기기 밖 점 인디케이터는 걷어냈으므로 여기서 갱신할 것도 이 한 줄뿐이다. */
    const syncHead = () => {
      const i = railNearest(rail);
      const def = defs[i];
      if (def) clock.textContent = era.years(def);
    };

    attachRail(rail, { onSettle: syncHead });
    rail.addEventListener('scroll', syncHead, { passive: true });

    // 클릭휠 — 좌우는 튜닝, 가운데는 재생
    const step = (d) => {
      const to = Math.max(0, Math.min(defs.length - 1, railNearest(rail) + d));
      railScrollTo(rail, to);
    };
    shell.querySelector('.mp3-side.prev').addEventListener('click', () => step(-1));
    shell.querySelector('.mp3-side.next').addEventListener('click', () => step(1));
    shell.querySelector('.mp3-center').addEventListener('click', () => {
      const def = defs[railNearest(rail)];
      if (def) openPair(def);
    });

    /* ----- 휠 회전 -----
       실물처럼 링을 따라 손가락을 돌리면 다이얼이 좌우로 흐른다.
       중심에서의 각도 변화를 스크롤 픽셀로 바꾸고, 손을 떼면 가까운 방송국에 안착시킨다.
       시계방향이 다음 연도 — 화면 좌표계는 y 가 아래로 자라서 각도도 시계방향으로 커진다. */
    const WHEEL_PX_PER_DEG = 2.4;   // 한 바퀴(360°)에 약 5칸
    const WHEEL_SLOP_DEG = 8;       // 이만큼 안 돌면 '누른 것'으로 본다
    const wheel = shell.querySelector('.mp3-wheel');
    primeWheelHint(wheel);          // 다이얼이 가로로 흐르니 호는 링 '위'에서 시작한다
    wireWheelVolume(shell);
    let turning = false;
    let lastAngle = 0;
    let turnedDeg = 0;

    const angleAt = (e) => {
      const r = wheel.getBoundingClientRect();
      return Math.atan2(e.clientY - (r.top + r.height / 2),
                        e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
    };

    wheel.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      // 가운데는 재생, 위아래는 볼륨 — 버튼 위에서 시작한 누름은 회전이 아니다
      if (e.target.closest('.mp3-center, .mp3-lbl')) return;
      turning = true;
      turnedDeg = 0;
      lastAngle = angleAt(e);
      railStopGlide(rail);
      rail.style.scrollBehavior = 'auto';
      rail.style.scrollSnapType = 'none';            // 돌리는 동안 스냅이 끼어들면 튄다
      wheel.classList.add('is-turning');
      try { wheel.setPointerCapture(e.pointerId); } catch {}
    });

    wheel.addEventListener('pointermove', (e) => {
      if (!turning) return;
      let d = angleAt(e) - lastAngle;
      if (d > 180) d -= 360;        // -180 ↔ 180 경계를 넘는 순간 튀지 않게
      if (d < -180) d += 360;
      lastAngle += d;
      turnedDeg += Math.abs(d);
      rail.scrollLeft += d * WHEEL_PX_PER_DEG;
    });

    /* 돌리고 손을 뗀 걸 ◀◀ ▶▶ 클릭으로 처리하지 않는다.
       단, 억제는 '제스처 직후 한 번'으로 한정한다 — 회전 뒤에 클릭이 따라오지 않는
       경우(버튼 밖에서 손을 뗀 경우)가 흔한데, 플래그를 남겨두면 그다음의 멀쩡한
       클릭까지 삼켜서 버튼이 죽는다. 실제로 그렇게 죽었다. */
    let suppressClick = false;

    const endTurn = () => {
      if (!turning) return;
      turning = false;
      wheel.classList.remove('is-turning');
      rail.style.scrollBehavior = '';
      rail.style.scrollSnapType = '';
      railScrollTo(rail, railNearest(rail));   // 가까운 방송국에 안착

      if (turnedDeg > WHEEL_SLOP_DEG) {
        suppressClick = true;
        // click 은 pointerup 과 같은 태스크에서 뒤이어 온다. 그 한 번만 막고 푼다.
        setTimeout(() => { suppressClick = false; }, 0);
      }
      turnedDeg = 0;
    };
    wheel.addEventListener('pointerup', endTurn);
    wheel.addEventListener('pointercancel', endTurn);

    wheel.addEventListener('click', (e) => {
      if (!suppressClick) return;
      /* 이 억제는 '링을 돌린 것' 이 '링을 누른 것' 으로 읽히지 않게 하는 장치다.
         캡처 단계라 링 위에 얹힌 진짜 버튼보다 먼저 도는데, 거기까지 삼키면
         돌린 직후 볼륨을 누르는 흔한 동작이 한 번 씹힌다. 버튼은 통과시킨다. */
      if (e.target.closest('.mp3-lbl, .mp3-side, .mp3-center')) return;
      e.stopPropagation();
      e.preventDefault();
      suppressClick = false;
    }, true);

    railSync(rail);
    syncHead();
    requestAnimationFrame(() => { railSync(rail); syncHead(); });
  }

  /* ----- MP3AMP: MP3 몸체 + 화면 안은 WINAMP -----
     TUNER 와 기기는 같고 화면만 갈아끼운다. 다이얼 대신 WINAMP 플레이리스트가
     LCD 안에 들어앉는다.

     휠이 세로 목록을 넘기는 건 실물 아이팟이 하던 짓 그대로다 —
     TUNER 의 가로 다이얼보다 이쪽이 기기 동작에 더 가깝다. */
  function renderMp3Amp(container, defs, era) {
    const years = defs.map((d) => Number(era.years(d))).filter(Boolean);
    const shell = document.createElement('div');
    shell.className = 'mp3 mp3-amp';
    shell.innerHTML = `
      <div class="mp3-screen">
        <div class="mp3-status">
          <span class="mp3-clock mono">${era.years(defs[0])}</span>
          <span class="mp3-status-mid mono">WINAMP</span>
          <span class="mp3-batt"></span>
        </div>
        <div class="wa-title ma-title">
          <span class="wa-title-line"></span>
          <span class="wa-title-text">PLAYLIST</span>
          <span class="wa-title-line"></span>
        </div>
        <div class="wa-pl-body ma-list">
          ${defs.map((def, i) => `
            <div class="wa-row" data-i="${i}">
              <span class="wa-idx">${i + 1}.</span>
              <span class="wa-name">${era.sub(def)} - ${def.title}</span>
              <span class="wa-dur">'${String(era.years(def)).slice(2)}</span>
            </div>`).join('')}
        </div>
        <div class="wa-pl-foot ma-foot">
          <span class="wa-pf">ADD</span><span class="wa-pf">REM</span>
          <span class="wa-pl-total">${Math.min(...years)}-${Math.max(...years)}</span>
          <span class="wa-pf wa-listopts">LIST<br>OPTS</span>
        </div>
      </div>
      <div class="mp3-wheel">
        <button type="button" class="mp3-lbl vol-up" aria-label="볼륨 높이기"
                data-icon="chevron-up" data-icon-size="16"></button>
        <button type="button" class="mp3-lbl vol-down" aria-label="볼륨 낮추기"
                data-icon="chevron-down" data-icon-size="16"></button>
        <button type="button" class="mp3-side prev" aria-label="이전 곡">◀◀</button>
        <button type="button" class="mp3-side next" aria-label="다음 곡">▶▶</button>
        <button type="button" class="mp3-center" aria-label="재생"></button>
      </div>
    `;
    container.appendChild(shell);

    const list = shell.querySelector('.ma-list');
    const clock = shell.querySelector('.mp3-clock');
    const rows = [...shell.querySelectorAll('.wa-row')];
    let sel = 0;

    const select = (i, { scroll = true } = {}) => {
      sel = Math.max(0, Math.min(defs.length - 1, i));
      rows.forEach((row, n) => row.classList.toggle('on', n === sel));
      clock.textContent = era.years(defs[sel]);
      if (scroll) rows[sel].scrollIntoView({ block: 'nearest', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    };

    rows.forEach((row) => {
      row.addEventListener('click', () => {
        const i = Number(row.dataset.i);
        if (i !== sel) { select(i); return; }   // 먼저 고르고, 다시 눌러야 재생
        openPair(defs[i]);
      });
    });

    shell.querySelector('.mp3-side.prev').addEventListener('click', () => select(sel - 1));
    shell.querySelector('.mp3-side.next').addEventListener('click', () => select(sel + 1));
    shell.querySelector('.mp3-center').addEventListener('click', () => openPair(defs[sel]));

    /* 휠 회전 — 목록이라 연속 스크롤이 아니라 한 칸씩 끊어 넘긴다.
       실물 클릭휠도 딸깍거리며 한 항목씩 움직인다. */
    const DEG_PER_ROW = 26;
    const wheel = shell.querySelector('.mp3-wheel');
    primeWheelHint(wheel);          // 목록이 세로로 밀리니 호는 링 '오른쪽'에서 시작한다
    wireWheelVolume(shell);
    let turning = false;
    let lastAngle = 0;
    let acc = 0;
    let turnedDeg = 0;
    let suppressClick = false;

    const angleAt = (e) => {
      const r = wheel.getBoundingClientRect();
      return Math.atan2(e.clientY - (r.top + r.height / 2),
                        e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
    };

    wheel.addEventListener('pointerdown', (e) => {
      // 가운데는 재생, 위아래는 볼륨 — 버튼 위에서 시작한 누름은 회전이 아니다
      if (e.button !== 0 || e.target.closest('.mp3-center, .mp3-lbl')) return;
      turning = true; acc = 0; turnedDeg = 0;
      lastAngle = angleAt(e);
      wheel.classList.add('is-turning');
      try { wheel.setPointerCapture(e.pointerId); } catch {}
    });

    wheel.addEventListener('pointermove', (e) => {
      if (!turning) return;
      let d = angleAt(e) - lastAngle;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      lastAngle += d;
      turnedDeg += Math.abs(d);
      acc += d;
      while (Math.abs(acc) >= DEG_PER_ROW) {
        const dir = acc > 0 ? 1 : -1;
        acc -= dir * DEG_PER_ROW;
        select(sel + dir);
      }
    });

    const endTurn = () => {
      if (!turning) return;
      turning = false;
      wheel.classList.remove('is-turning');
      // 돌린 직후 따라오는 클릭 한 번만 삼킨다 (플래그를 남기면 다음 클릭이 죽는다)
      if (turnedDeg > 8) { suppressClick = true; setTimeout(() => { suppressClick = false; }, 0); }
      turnedDeg = 0;
    };
    wheel.addEventListener('pointerup', endTurn);
    wheel.addEventListener('pointercancel', endTurn);
    wheel.addEventListener('click', (e) => {
      if (!suppressClick) return;
      /* 이 억제는 '링을 돌린 것' 이 '링을 누른 것' 으로 읽히지 않게 하는 장치다.
         캡처 단계라 링 위에 얹힌 진짜 버튼보다 먼저 도는데, 거기까지 삼키면
         돌린 직후 볼륨을 누르는 흔한 동작이 한 번 씹힌다. 버튼은 통과시킨다. */
      if (e.target.closest('.mp3-lbl, .mp3-side, .mp3-center')) return;
      e.stopPropagation();
      e.preventDefault();
      suppressClick = false;
    }, true);

    select(0, { scroll: false });
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
    // 두 줄 사이의 다리 — 지금 맞물린 두 곡이 몇 년 떨어져 있는지 보여준다
    const bridge = document.createElement('div');
    bridge.className = 'twin-bridge';
    bridge.innerHTML = '<span class="tb-gap mono"></span>';
    const bridgeGap = bridge.querySelector('.tb-gap');
    const setBridge = (idx) => {
      const gap = yearGap(defs[idx]);
      bridgeGap.textContent = gap ? `${gap}년을 건너뜁니다` : '';
    };

    ['original', 'remake'].forEach((side) => {
      const wrap = document.createElement('div');
      // 색은 그대로 두고 형태만 각 시대의 것으로 — 한 화면에 두 시대가 같이 선다
      wrap.className = `twin-side ${side} ${side === 'original' ? 'era-past' : 'era-present'}`;
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

    // 다리는 두 줄 사이에 낀다
    container.insertBefore(bridge, container.children[1]);

    // 두 줄을 서로에게 묶는다
    attachRail(rails.original, {
      twin: () => rails.remake,
      onSettle: (i) => { railScrollTo(rails.remake, i, { silent: true }); setBridge(i); },
    });
    attachRail(rails.remake, {
      twin: () => rails.original,
      onSettle: (i) => { railScrollTo(rails.original, i, { silent: true }); setBridge(i); },
    });

    // 끄는 동안에도 연차가 따라 바뀌게 — 안착까지 기다리면 숫자가 뒤늦게 튄다
    ['original', 'remake'].forEach((side) => {
      rails[side].addEventListener('scroll', () => setBridge(railNearest(rails[side])), { passive: true });
    });

    railSync(rails.original);
    railSync(rails.remake);
    setBridge(0);
    requestAnimationFrame(() => { railSync(rails.original); railSync(rails.remake); });
  }

  /* ----- 디스패처 ----- */
  function renderPairCards(container, defs, { removable = false, layout = 'grid' } = {}) {
    const era = ERA[eraFilter];
    container.innerHTML = '';
    if (layout === 'rack') return renderRack(container, defs, era);
    if (layout === 'winamp') return renderWinamp(container, defs, era);
    if (layout === 'tuner') return renderTuner(container, defs, era);
    if (layout === 'mp3amp') return renderMp3Amp(container, defs, era);
    if (layout === 'dial') return renderDial(container, defs, era);
    if (layout === 'twin') return renderTwin(container, defs);
    return renderCards(container, defs, era, layout, removable);
  }

  /* ---------- 시대 필터 토글 (원곡 | 양쪽 | 리메이크) ---------- */
  function applyEra(next) {
    eraFilter = next;
    const era = ERA[next];
    setTheme(era.theme);
    // 헤더·토글처럼 목록 바깥에 있는 것까지 시대에 맞춰 칠해야 할 때가 있다
    // ('양쪽' 은 화면 맨 위부터 과거색으로 시작한다). 테마만으로는 구분이 안 된다 —
    // '양쪽' 과 '리메이크' 가 같은 modern 테마를 쓰기 때문.
    document.documentElement.dataset.era = next;
    $('#list-caption').textContent = era.caption;
    $$('#view-toggle .vt-btn').forEach((b) => {
      const on = b.dataset.era === next;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    /* 시대를 고르면 그 시대의 기본 레이아웃(layouts[0])으로 연다.
       예전에는 '마지막에 고른 것'을 기억했는데, tweak 으로 한 번 바꾸면 그 시대는
       계속 그걸로 열려서 기본값이 없는 것과 같았다 —
       원곡을 눌렀는데 WINAMP 이 나오는 식. 기본값은 layouts[0] 하나로 정한다. */
    layoutMode = ERA[next].layouts[0];
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
    twin: 'TWIN', mp3amp: 'MP3AMP',
  };
  const LAYOUT_ICON = {
    carousel: 'gallery-horizontal-end', grid: 'layout-grid', list: 'layout-list',
    rack: 'grid-3x3', winamp: 'list-music', tuner: 'radio', dial: 'disc-3',
    twin: 'rows-2', mp3amp: 'list-music',
  };
  const ALL_LAYOUTS = Object.keys(LAYOUT_LABEL);
  /* 각 시대의 기본 레이아웃은 ERA[…].layouts[0] 하나로 정한다.
     기본값을 두 군데 두면 반드시 어긋난다 — 실제로 그래서 원곡의 기본이 무시됐다. */
  let layoutMode = ERA[eraFilter].layouts[0];

  const listEl = $('#pair-list');
  const dotsEl = $('#carousel-dots');

  /** 가운데 정렬 가로 스크롤을 쓰는 레이아웃 (관성·스냅·인디케이터 대상) */
  /* #pair-list 자체가 레일인 레이아웃은 캐러셀 하나뿐이다.
     TWIN 과 TUNER 는 레일을 안쪽에 중첩해 만들고 각자 attachRail() 을 건다. */
  const RAIL_LAYOUTS = ['carousel'];
  /* TUNER 는 점 인디케이터를 쓰지 않는다. 기기 밖 화면 바닥에 점이 뜨면
     '기기를 보고 있다'는 감각이 깨진다 — 실물 기기 아래에 웹 인디케이터가
     붙어 있을 리 없다. 게다가 TUNER 는 LCD 상태바의 연도가 이미 같은 일을
     하고 있어서(지금 어느 곡에 맞춰졌는지) 두 번 말하는 셈이었다. */
  const DOT_LAYOUTS = ['carousel'];

  function applyLayout() {
    // WINAMP 은 목록 하나가 아니라 화면 전체를 덮는 스킨이다 (헤더·여백·하단바까지)
    if (layoutMode === 'winamp') document.documentElement.dataset.skin = 'winamp';
    else delete document.documentElement.dataset.skin;

    ALL_LAYOUTS.forEach((l) => listEl.classList.toggle(l, l === layoutMode));
    listEl.classList.toggle('rail', RAIL_LAYOUTS.includes(layoutMode));
    dotsEl.classList.toggle('hidden', !DOT_LAYOUTS.includes(layoutMode));
    $('#btn-layout').innerHTML = iconSvg(LAYOUT_ICON[layoutMode], 16);
    $('#btn-layout').setAttribute('aria-label', `레이아웃 전환 (현재 ${LAYOUT_LABEL[layoutMode]})`);
    $('#list-caption').textContent = `${ERA[eraFilter].caption} · ${LAYOUT_LABEL[layoutMode]}`;
    renderPairCards(listEl, orderedPairs(), { layout: layoutMode });
  }

  // tweak 버튼 — 현재 시대가 가진 레이아웃들만 돌린다
  $('#btn-layout').addEventListener('click', () => {
    const set = ERA[eraFilter].layouts;
    layoutMode = set[(set.indexOf(layoutMode) + 1) % set.length];
    // 기억해두지 않는다 — 시대를 다시 고르면 기본값으로 돌아간다
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
      // rAF 가 멈춘 환경(배경 탭 등)에서 syncPending 이 영영 안 풀리는 걸 막는다
      clearTimeout(st.syncFallback);
      st.syncFallback = setTimeout(() => {
        if (!st.syncPending) return;
        cancelAnimationFrame(st.syncPending);
        st.syncPending = 0;
        railSync(el);
      }, 200);
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
    if (!st) return;
    clearTimeout(st.glideFallback);
    st.glideFallback = 0;
    if (!st.glideRaf) return;
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

    const land = () => {                // 어떤 경로로 끝나든 도착점은 한 곳
      clearTimeout(st.glideFallback);
      st.glideFallback = 0;
      if (st.glideRaf) { cancelAnimationFrame(st.glideRaf); st.glideRaf = 0; }
      el.scrollLeft = to;
      el.style.scrollSnapType = '';
      el.style.scrollBehavior = '';
      done();
    };

    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      el.scrollLeft = from + dist * (1 - Math.pow(1 - p, 3));
      if (p < 1) st.glideRaf = requestAnimationFrame(tick);
      else land();
    };
    st.glideRaf = requestAnimationFrame(tick);

    /* rAF 는 탭이 배경으로 가거나 화면이 합성되지 않으면 아예 돌지 않는다.
       그러면 글라이드가 중간에 멈춘 채 glideRaf 가 영영 남아, 이후 조작이 전부 죽는다.
       타이머로 한 번 더 받쳐서 어떤 경우에도 도착은 보장한다. */
    clearTimeout(st.glideFallback);
    st.glideFallback = setTimeout(land, dur + 120);
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

  /** rail: 점을 눌렀을 때 움직일 레일. TUNER 처럼 레일이 #pair-list 가 아닌 경우 넘긴다. */
  function buildDots(defs, rail = listEl) {
    dotsEl.innerHTML = '';
    defs.forEach((def, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', `${i + 1}번째 · ${def.title}`);
      dot.addEventListener('click', () => railScrollTo(rail, i));
      dotsEl.appendChild(dot);
    });
  }

  document.documentElement.dataset.era = eraFilter;   // 첫 로드에도 서 있어야 한다
  applyLayout();

  /* ---------- Player 열기 ---------- */
  async function openPair(def, { show = true } = {}) {
    if (show) showScreen('player');
    currentPairIndex = DITTO_PAIRS.findIndex((p) => p.id === def.id);
    if (activeScreen === 'player') $('#fab').classList.toggle('hidden', currentPairIndex < 0);
    syncFab();
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
      // 검색 결과는 30초 미리듣기 고정. 추천 셔틀과 달리 videoId 를 미리 확보해 둘 수
      // 없어서 곡마다 Data API 검색이 나가는데, 일 할당량이 검색 100회밖에 안 된다.
      previewOnly: true,
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

    /* ---- 셔틀 콘솔 ---- */
    $('#year-original').textContent = pair.original?.year ?? '—';
    $('#year-remake').textContent = pair.remake?.year ?? '—';
    $('#artist-original').textContent = pair.original?.artist ?? '—';
    $('#artist-remake').textContent = pair.remake?.artist ?? '—';

    const shuttle = $('#shuttle');
    const canTravel = !!(pair.original && pair.remake);
    shuttle.value = isOriginal ? 0 : 100;
    shuttle.disabled = !canTravel;

    // 지금 서 있는 정거장에 불이 들어온다 — 슬라이더 위치만으로는 상태가 안 읽힌다
    $('#stop-original').classList.toggle('is-active', isOriginal);
    $('#stop-remake').classList.toggle('is-active', !isOriginal);
    $('#stop-original').disabled = !canTravel;
    $('#stop-remake').disabled = !canTravel;

    const gap = yearGap(pair);
    $('#shuttle-gap').textContent = gap ? `${gap}년 사이` : '';
    $('#shuttle-caption').textContent = canTravel
      ? '양쪽 어디로 옮겨도 듣던 위치는 그대로예요'
      : '단일 트랙 — 셔틀 불가';

    // 검색 결과는 설정이 YouTube 여도 미리듣기로 나간다 — 표시도 실제와 맞춘다
    $('#source-tag').textContent =
      (DittoPlayer.state.source === 'youtube' && !pair.previewOnly)
        ? 'YouTube 전체 곡'
        : 'iTunes 30초 미리듣기';

    setTheme(isOriginal ? 'retro' : 'modern');
  }

  /* ---------- 글리치 타임슬립 연출 (PRD 5-1) ----------
     전환은 이 앱에서 시간 이동이 실제로 일어나는 유일한 순간이다.
     방향(과거/현재)에 따라 색과 줄무늬가 흐르는 쪽이 갈리고,
     가운데 연도는 출발 연도에서 도착 연도까지 굴러간다. */
  const YEAR_ROLL_MS = 700;   // 크로스페이드(800ms)보다 살짝 먼저 도착하게
  let glitchRaf = 0;

  function glitch(show, toMode, pair) {
    const overlay = $('#glitch');

    if (!show) {
      if (glitchRaf) cancelAnimationFrame(glitchRaf);
      glitchRaf = 0;
      overlay.classList.add('hidden');
      return;
    }

    const fromMode = toMode === 'original' ? 'remake' : 'original';
    const from = Number(pair?.[fromMode]?.year) || 0;
    const to = Number(pair?.[toMode]?.year) || 0;
    const goingBack = toMode === 'original';

    overlay.dataset.dir = goingBack ? 'back' : 'fwd';
    $('#glitch-dir').textContent = goingBack ? '◀◀ REWINDING' : '▶▶ FAST-FORWARD';
    $('#glitch-sub').textContent = pair?.[toMode]?.artist ?? '';

    const yearEl = $('#glitch-year');
    yearEl.textContent = String(from || to || '—');
    overlay.classList.remove('hidden');
    if (navigator.vibrate) navigator.vibrate(30); // Haptic 피드백

    // 굴릴 구간이 없거나 모션을 줄이는 설정이면 도착 연도를 바로 박는다
    if (!from || !to || from === to || reduceMotion.matches) {
      yearEl.textContent = String(to || from || '—');
      return;
    }

    if (glitchRaf) cancelAnimationFrame(glitchRaf);
    const t0 = performance.now();
    const roll = (now) => {
      const p = Math.min(1, (now - t0) / YEAR_ROLL_MS);
      const eased = 1 - Math.pow(1 - p, 3);   // 빠르게 튀어나갔다가 도착점에서 잦아든다
      yearEl.textContent = String(Math.round(from + (to - from) * eased));
      glitchRaf = p < 1 ? requestAnimationFrame(roll) : 0;
    };
    glitchRaf = requestAnimationFrame(roll);
  }

  /* ---------- 타임 셔틀 ----------
     목적지가 둘뿐이라 슬라이더를 끄는 것 말고 정거장을 눌러서도 갈 수 있다.
     두 경로 모두 travelTo() 하나로 모은다. */
  const shuttleEl = $('#shuttle');
  let traveling = false;

  async function travelTo(toMode) {
    const { pair, mode } = DittoPlayer.state;
    if (!pair || !pair.original || !pair.remake) return;
    // 이동 중 재입력은 무시한다 — 크로스페이드가 겹치면 두 음원이 같이 남는다
    if (traveling || toMode === mode) {
      shuttleEl.value = mode === 'original' ? 0 : 100;
      return;
    }

    traveling = true;
    shuttleEl.value = toMode === 'original' ? 0 : 100;
    glitch(true, toMode, pair);
    let ok = false;
    try {
      ok = await DittoPlayer.shuttle(toMode);
    } finally {
      // 전환이 어떻게 끝나든 오버레이는 반드시 걷는다.
      // (여기서 놓치면 글리치 화면이 걸린 채 화면이 잠긴다)
      glitch(false);
      traveling = false;
    }
    if (!ok) shuttleEl.value = mode === 'original' ? 0 : 100; // 실패 시 원위치
  }

  shuttleEl.addEventListener('change', () => {
    travelTo(Number(shuttleEl.value) < 50 ? 'original' : 'remake');
  });
  $('#stop-original').addEventListener('click', () => travelTo('original'));
  $('#stop-remake').addEventListener('click', () => travelTo('remake'));

  /* ---------- 재생 컨트롤 ---------- */
  $('#btn-play').addEventListener('click', () => DittoPlayer.toggle());

  function step(delta) {
    if (currentPairIndex < 0) return toast('추천 목록에서만 이동할 수 있어요.');
    // 이전/다음은 화면에 보이는 순서(연대순)를 따라간다 — 목록과 어긋나면 안 된다
    const list = orderedPairs();
    const here = list.findIndex((p) => p.id === DITTO_PAIRS[currentPairIndex].id);
    const next = (here + delta + list.length) % list.length;
    // 자동/수동 곡 이동 시 사용자가 보던 화면을 빼앗지 않음
    openPair(list[next], { show: activeScreen === 'player' });
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

  /* ---------- Library (localStorage) ----------
     빈 라이브러리로 시작하면 이 화면이 무슨 화면인지 볼 방법이 없다.
     처음 열었을 때만 세 곡을 넣어둔다 — 저장된 목록이 어떤 모습인지,
     해제는 어떻게 하는지가 설명 없이 보이는 게 안내문보다 낫다.

     '한 번도 저장한 적 없음'(키 자체가 없음)과 '전부 지웠음'(빈 배열)은
     다른 상태다. 후자에 다시 채워 넣으면 사용자가 지운 걸 앱이 되돌리는 셈이라
     키가 아예 없을 때만 심는다. */
  const LIBRARY_SEED = ['pair-01', 'pair-02', 'pair-03'];
  function getLibrary() {
    try {
      const raw = localStorage.getItem(DITTO_CONFIG.STORAGE_KEYS.LIBRARY);
      if (raw === null) { setLibrary(LIBRARY_SEED); return [...LIBRARY_SEED]; }
      return JSON.parse(raw) || [];
    } catch { return []; }
  }
  function setLibrary(ids) {
    localStorage.setItem(DITTO_CONFIG.STORAGE_KEYS.LIBRARY, JSON.stringify(ids));
  }
  function renderLibrary() {
    const ids = getLibrary();
    const defs = DITTO_PAIRS.filter((p) => ids.includes(p.id));
    const box = $('#library-list');
    if (!defs.length) {
      box.innerHTML = '<p class="search-hint lib-hint">저장된 셔틀이 없어요.</p>';
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
  /* FAB 는 토글이다 — 저장이 되면 해제도 같은 자리에서 돼야 한다.
     예전에는 이미 저장된 곡을 누르면 '이미 있어요' 만 뜨고 끝이라,
     해제하려면 라이브러리 화면까지 가야 했다. 누른 자리에서 되돌릴 수 없으면
     그건 버튼이 아니라 경고문이다. */
  /* 셔틀 id 는 currentPairIndex 로 바로 알 수 있다. DittoPlayer.state.pair 는
     트랙 매칭이 끝나야 채워지므로, 그걸 기다리면 화면이 열린 뒤 한 박자 늦게
     버튼 모양이 바뀐다. */
  const currentPairId = () => (currentPairIndex >= 0 ? DITTO_PAIRS[currentPairIndex].id : null);
  function syncFab() {
    const fab = $('#fab');
    const id = currentPairId();
    const saved = !!id && getLibrary().includes(id);
    fab.classList.toggle('is-saved', saved);
    fab.setAttribute('aria-pressed', String(saved));
    fab.setAttribute('aria-label', saved ? '라이브러리에서 빼기' : '라이브러리에 추가');
    fab.innerHTML = `<span data-icon="${saved ? 'check' : 'plus'}" data-icon-size="22"></span>`;
    mountIcons(fab);
  }
  $('#fab').addEventListener('click', () => {
    const id = currentPairId();
    if (!id) return;
    const ids = getLibrary();
    if (ids.includes(id)) {
      setLibrary(ids.filter((x) => x !== id));
      toast('라이브러리에서 뺐어요.');
    } else {
      setLibrary([...ids, id]);
      toast('라이브러리에 저장했어요 ♡');
    }
    syncFab();
    if (activeScreen === 'library') renderLibrary();
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
    // 지금 걸린 트랙이 미리듣기 고정(검색 결과)이면 설정과 무관하게 그대로 표시한다
    $('#source-tag').textContent =
      (source === 'youtube' && !DittoPlayer.state.pair?.previewOnly)
        ? 'YouTube 전체 곡'
        : 'iTunes 30초 미리듣기';
    await DittoPlayer.setSource(source);
  });

  /* ---------- 초기 화면 ----------
     앱을 열면 홈이 아니라 '응답하라' 주제곡 하나가 걸린 플레이어로 시작한다.
     매번 다른 곡이 걸리게 두는 편이 이 앱의 '발견' 성격에 맞는다.

     브라우저는 사용자 제스처 없는 자동재생을 막는다. 막히면 재생 버튼이 뜬
     정지 상태로 보이는데, 이게 정직한 표시다 — 소리는 안 나는데 일시정지
     아이콘만 떠 있는 상태보다 낫다. (player.js 의 play() 참조) */
  const REPLY_PAIRS = DITTO_PAIRS.filter((p) => /응답하라/.test(p.remake && p.remake.album || ''));
  const bootFrom = REPLY_PAIRS.length ? REPLY_PAIRS : DITTO_PAIRS;
  showScreen('home');   // 뒤로가기로 돌아올 화면을 먼저 세워둔다
  openPair(bootFrom[Math.floor(Math.random() * bootFrom.length)]);
})();
