/* ============================================================
   ditto — 타임 셔틀 플레이어 엔진
   PRD 3 필수 기능:
   [현재 재생 시간 저장 → 기존 곡 일시정지 → 새 음원 seekTo → 재생]
   + 크로스페이드(페이드아웃/인) + 버퍼링 안전 락(PRD 5-2)
   소스: 'preview' (iTunes 30초) | 'youtube' (전체 곡)
   ============================================================ */

/* 무음 WAV 한 조각. iOS 잠금 해제용으로만 쓴다 — 아래 unlock() 참조. */
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

/* ---------- iTunes 미리듣기 엔진 (HTMLAudio) ---------- */
class PreviewEngine {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.onEnded = null;
    this._unlocked = false;
    this.audio.addEventListener('ended', () => this.onEnded?.());
  }

  /* iOS 는 '사용자 제스처 안에서 한 번이라도 재생된 적 있는' 오디오 요소에만
     이후 프로그램 재생을 허용한다. 이 요소들은 앱이 뜰 때 만들어지므로
     그 조건을 못 채운다 — 그래서 사용자가 첫 탭을 하는 순간, 그 제스처 안에서
     무음을 한 번 재생해 요소를 열어둔다. 소리도 안 나고 화면도 안 바뀐다.

     실패해도 조용히 넘어간다. 안 되면 지금과 같아질 뿐이지 더 나빠지지 않는다. */
  unlock() {
    if (this._unlocked) return;
    this._unlocked = true;
    if (this.audio.getAttribute('src')) return;   // 이미 곡이 물려 있으면 건드리지 않는다
    this.audio.src = SILENT_WAV;
    /* 뒷정리는 비동기로 온다. 그 사이 사용자가 곡을 눌러 진짜 src 가 물렸을 수 있으니
       '아직 무음이 걸려 있을 때만' 걷는다 — 안 그러면 재생 중인 곡의 src 를 지운다. */
    const done = () => {
      if (this.audio.getAttribute('src') !== SILENT_WAV) return;
      this.audio.pause();
      this.audio.removeAttribute('src');
    };
    try {
      const p = this.audio.play();
      if (p && p.then) p.then(done, done); else done();
    } catch { done(); }
  }

  /** url 을 seekSec 지점에 재생 가능 상태로 준비 (버퍼링 락) */
  async prepare(url, seekSec = 0) {
    if (this.audio.src !== url) {
      this.audio.src = url;
      /* 아래 '무음 킥' 이 소리로 새지 않게 먼저 죽여둔다. 준비가 끝나면 되돌린다. */
      const prevVolume = this.audio.volume;
      this.audio.volume = 0;
      try {
        await new Promise((resolve, reject) => {
          // 네트워크가 막히면 미디어 요소는 canplay 도 error 도 안 낸다.
          // (networkState=LOADING 인 채 stalled 만 반복) 이때를 대비한 한도.
          const timer = setTimeout(() => {
            cleanup();
            this.audio.removeAttribute('src'); // 다음 시도가 다시 로드하도록
            reject(new Error('LOAD_TIMEOUT'));
          }, DITTO_CONFIG.LOAD_TIMEOUT_MS);
          const ok = () => { cleanup(); resolve(); };
          const fail = () => { cleanup(); reject(new Error('오디오 로드 실패')); };
          const cleanup = () => {
            clearTimeout(timer);
            this.audio.removeEventListener('canplay', ok);
            this.audio.removeEventListener('error', fail);
          };
          this.audio.addEventListener('canplay', ok);
          this.audio.addEventListener('error', fail);
          this.audio.load();

          /* ★ 모바일에서 셔틀이 죽던 자리.
             iOS 는 사용자 제스처로 재생된 적 없는 오디오 요소를 load() 만으로는
             실제로 받아오지 않는다(preload 를 무시한다). 그러면 canplay 가 영영
             안 오고, 8초 뒤 LOAD_TIMEOUT 으로 셔틀이 실패한다 —
             화면에는 글리치만 지나가고 시대는 안 넘어간다.
             재생을 한 번 걸어 버퍼링을 강제로 시작시킨다. 볼륨이 0 이라 안 들린다.
             잠금이 안 풀린 요소라면 여기서 거부되는데, 그때는 원래대로
             canplay 를 기다리다 타임아웃 → 셔틀의 대체 경로로 넘어간다. */
          const kick = this.audio.play();
          if (kick && kick.catch) kick.catch(() => {});
        });
      } finally {
        // 킥으로 시작된 재생을 되돌린다. 실제 재생은 호출부가 결정한다.
        this.audio.pause();
        this.audio.volume = prevVolume;
      }
    }
    const dur = this.getDuration();
    this.audio.currentTime = dur ? Math.min(seekSec, Math.max(0, dur - 0.5)) : seekSec;
  }

  /* 실제로 재생이 시작됐는지를 돌려준다.
     브라우저는 사용자 제스처 없는 자동재생을 거부하는데, 그걸 삼켜버리면
     화면에는 일시정지 버튼이 떠 있고 소리는 안 나는 상태가 된다. */
  play() { return this.audio.play().then(() => true).catch(() => false); }
  pause() { this.audio.pause(); }
  /* canplay 를 기다리지 않고 곧장 재생한다.
     크로스페이드 준비가 실패했을 때의 최후 수단이다 — 이음새는 거칠지만
     시대 이동 자체는 성사시킨다. 이 앱에서 시대 이동은 부가 기능이 아니라 본체라,
     '매끄럽게 못 하면 아예 안 한다' 가 제일 나쁜 선택이다. */
  playFrom(url, seekSec = 0) {
    if (this.audio.getAttribute('src') !== url) {
      this.audio.src = url;
      this.audio.load();
    }
    const seek = () => {
      const dur = this.getDuration();
      try { this.audio.currentTime = dur ? Math.min(seekSec, Math.max(0, dur - 0.5)) : seekSec; }
      catch { /* 아직 못 옮기면 처음부터 나온다 — 안 넘어가는 것보다 낫다 */ }
    };
    if (this.audio.readyState >= 1) seek();
    else this.audio.addEventListener('loadedmetadata', seek, { once: true });
    return this.play();
  }

  seek(sec) { this.audio.currentTime = sec; }
  getCurrentTime() { return this.audio.currentTime || 0; }
  getDuration() { return this.audio.duration || 0; }
  setVolume(v01) { this.audio.volume = Math.max(0, Math.min(1, v01)); }
  isPlaying() { return !this.audio.paused; }
  stop() { this.audio.pause(); this.audio.removeAttribute('src'); }
}

/* ---------- 타임 셔틀 컨트롤러 ---------- */
window.DittoPlayer = (() => {
  const state = {
    pair: null,            // { id, title, original: meta|null, remake: meta|null }
    mode: 'remake',        // 'original' | 'remake'
    source: 'preview',     // 'preview' | 'youtube'
    playing: false,
    shuttling: false,
  };

  const engines = {
    preview: { original: new PreviewEngine(), remake: new PreviewEngine() },
    youtube: null, // 최초 사용 시 생성
  };

  /* ---------- 마스터 볼륨 ----------
     엔진의 setVolume 은 크로스페이드가 쓰는 자리이기도 하다. 거기서 넘기는 값은
     '음량' 이 아니라 '페이드 진행률(0~1)' 이라서, 사용자 볼륨을 따로 두지 않고
     그 값을 직접 건드리면 셔틀 한 번에 볼륨이 1 로 되돌아간다.
     그래서 진행률 × 마스터 로 나눠 곱한다 — 컨트롤러 안의 모든 setVolume 은
     반드시 applyVol 을 거쳐야 한다. */
  let masterVol = 1;
  const applyVol = (engine, ratio = 1) => engine.setVolume(ratio * masterVol);

  /* ---------- 시대 간 위치 대응 ----------
     iTunes 미리듣기는 30초 '발췌' 인데, 애플이 원곡과 리메이크에서 각각 다른
     지점을 잘라낸다. 그래서 두 발췌의 '같은 12.3초' 는 음악적으로 무관하다 —
     가사가 되돌아가거나 엉뚱한 데로 튀던 원인이다. (길이는 20개 전부 30초라
     길이 정규화로는 아무것도 해결되지 않는다. 실측으로 확인했다.)

     js/align.js 가 그 어긋남을 초 단위로 담는다. 규약은 하나다:
         리메이크_시각 = 원곡_시각 + offset
     신뢰도가 낮거나 데이터가 없는 쌍은 손대지 않는다 — 어설픈 보정은
     아무 보정도 안 하느니만 못하다. */
  const ALIGN_MIN_CONFIDENCE = 0.45;
  function alignOffset(pairId) {
    const a = window.DITTO_ALIGN?.[pairId];
    if (!a || typeof a.offset !== 'number') return 0;
    if ((a.confidence ?? 0) < ALIGN_MIN_CONFIDENCE) return 0;
    return a.offset;
  }
  function mapTime(fromMode, toMode, t) {
    if (fromMode === toMode) return t;
    const off = alignOffset(state.pair?.id);
    if (!off) return t;
    const mapped = toMode === 'remake' ? t + off : t - off;
    // 발췌 밖으로 나가면 의미가 없다. 끝에서 0.5초는 남겨 뚝 끊기지 않게.
    const dur = otherEngine(toMode).getDuration() || 30;
    return Math.max(0, Math.min(mapped, Math.max(0, dur - 0.5)));
  }

  const handlers = {
    onModeChange: null,   // (mode) — 테마/UI 전환
    onTick: null,         // (cur, dur)
    onStateChange: null,  // (playing)
    onTrackLoaded: null,  // (pair, mode)
    onError: null,        // (message)
    onEnded: null,
    onVolumeChange: null, // (v01)
  };

  function on(evts) { Object.assign(handlers, evts); }

  function ytEngines() {
    if (!engines.youtube) {
      engines.youtube = {
        original: new DittoYoutube.YoutubeEngine('yt-mount-a'),
        remake: new DittoYoutube.YoutubeEngine('yt-mount-b'),
      };
    }
    return engines.youtube;
  }

  /* 실제로 YouTube 를 쓸지. 설정이 'youtube' 여도 pair.previewOnly 가 걸려 있으면 안 쓴다.
     검색 결과가 그 경우다 — 추천 셔틀과 달리 videoId 를 미리 확보해 둘 수 없어서
     곡마다 Data API 검색이 나가는데, search.list 는 호출당 100 units(일 10,000)라
     금방 바닥난다. 검색은 30초 미리듣기로 고정한다. */
  function useYoutube() {
    return state.source === 'youtube' && !state.pair?.previewOnly;
  }

  function currentEngine() {
    const set = useYoutube() ? ytEngines() : engines.preview;
    return set[state.mode];
  }
  function otherEngine(mode) {
    const set = useYoutube() ? ytEngines() : engines.preview;
    return set[mode];
  }

  /* 진행 표시 폴링 */
  setInterval(() => {
    if (!state.pair || state.shuttling) return;
    const e = currentEngine();
    handlers.onTick?.(e.getCurrentTime(), e.getDuration());
  }, 250);

  function bindEnded(engine) {
    engine.onEnded = () => {
      state.playing = false;
      handlers.onStateChange?.(false);
      handlers.onEnded?.();
    };
  }

  /** 해당 모드 트랙의 재생 소스(미리듣기 URL 또는 videoId) 확보 */
  async function resolveSrc(mode) {
    const meta = state.pair[mode];
    if (!meta) throw new Error('NO_TRACK');
    if (useYoutube()) {
      if (!meta.videoId) {
        meta.videoId = await DittoYoutube.searchVideoId(meta.ytQuery || `${state.pair.title} ${meta.artist} Official Audio`);
      }
      if (!meta.videoId) throw new Error('YT_NO_MATCH');
      return meta.videoId;
    }
    /* 미리듣기가 없는 것과 못 불러온 것은 다른 사건이다.
       예전에는 둘 다 NO_PREVIEW 로 묶여서, 요청이 막혔을 때도
       "이 곡은 미리듣기를 제공하지 않아요" 라고 거짓말을 했다. */
    if (!meta.previewUrl) throw new Error(meta.lookupFailed ? 'LOOKUP_FAILED' : 'NO_PREVIEW');
    return meta.previewUrl;
  }

  /**
   * 최종 안전망: 아래 대기들은 어느 하나도 스스로 포기하지 않는다.
   *   - YouTube IFrame API 로드, 플레이어 onReady
   *   - YT 버퍼링 상태 폴링
   *   - iTunes 검색 / 미디어 요소 canplay
   * 하나라도 응답이 없으면 셔틀 잠금이 영영 안 풀리므로 여기서 끊는다.
   */
  function withTimeout(promise, ms, label) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(label)), ms);
      }),
    ]).finally(() => clearTimeout(timer));
  }

  async function prepareEngine(mode, seekSec) {
    const engine = otherEngine(mode);
    const budget = DITTO_CONFIG.LOAD_TIMEOUT_MS;
    const src = await withTimeout(resolveSrc(mode), budget, 'LOAD_TIMEOUT');
    // prepare 안쪽에도 자체 한도가 있어 먼저 끝난다. 이건 그걸 못 빠져나온 경우용.
    await withTimeout(engine.prepare(src, seekSec), budget + 1000, 'LOAD_TIMEOUT');
    bindEnded(engine);
    return engine;
  }

  /* ---------- 공개 API ---------- */

  /** 셔틀 쌍 로드 후 지정 모드(기본: 리메이크)로 재생 시작 */
  async function loadPair(pair, { autoplay = true, startMode = null } = {}) {
    stop();
    state.pair = pair;
    state.mode = (startMode && pair[startMode])
      ? startMode
      : (pair.remake ? 'remake' : 'original');
    state.source = DittoConfig.getSource();
    handlers.onModeChange?.(state.mode);
    handlers.onTrackLoaded?.(pair, state.mode);
    if (autoplay) await play(0);
  }

  async function play(seekSec) {
    if (!state.pair) return;
    try {
      const seek = seekSec != null ? seekSec : (currentEngine().getCurrentTime() || 0);
      const engine = await prepareEngine(state.mode, seek);
      applyVol(engine, 1);
      // 자동재생이 막히면 false 가 온다 — 그때는 멈춘 상태로 정직하게 표시한다
      const started = await engine.play();
      state.playing = started !== false;
      handlers.onStateChange?.(state.playing);
    } catch (err) {
      handleSourceError(err);
    }
  }

  function pause() {
    currentEngine().pause();
    state.playing = false;
    handlers.onStateChange?.(false);
  }

  function toggle() { state.playing ? pause() : play(); }

  function seekRatio(r) {
    const e = currentEngine();
    const dur = e.getDuration();
    if (dur) e.seek(dur * r);
  }

  /**
   * ★ 타임 셔틀: 재생 위치를 유지한 채 원곡 ↔ 리메이크 크로스페이드 전환
   * 안전 락: 새 음원 버퍼링 완료 확인 후에야 기존 음원 페이드아웃
   */
  async function shuttle(toMode) {
    if (!state.pair || state.shuttling || toMode === state.mode) return false;
    if (!state.pair[toMode]) {
      handlers.onError?.('이 트랙은 매칭된 상대 버전이 없어요.');
      return false;
    }
    state.shuttling = true;
    const fromEngine = currentEngine();
    const wasPlaying = state.playing;
    const t = fromEngine.getCurrentTime(); // ① 현재 재생 시간 저장

    try {
      // ② 새 음원을 같은 시간대에 버퍼링 완료 상태로 준비
      const toEngine = await prepareEngine(toMode, mapTime(state.mode, toMode, t));

      /* ②-b 재동기화.
         t 는 준비를 시작하기 '전' 에 찍은 값이다. 버퍼링에 걸린 시간만큼 옛 곡은
         계속 흘렀는데 새 곡은 옛 지점에 서 있다 — 딱 그만큼 이미 들은 구간을
         다시 듣게 된다(데스크톱 ~94ms, 모바일은 수백 ms~수 초).
         페이드를 시작하기 직전에 지금 시각을 다시 읽어 간극을 메운다.
         버퍼 근처로의 짧은 이동만 하도록 임계값을 둔다 — 매번 seek 하면
         다시 버퍼링이 걸려 오히려 끊긴다. */
      const drift = fromEngine.getCurrentTime() - t;
      if (drift > 0.12) toEngine.seek(mapTime(state.mode, toMode, t + drift));

      // ③ 크로스페이드
      applyVol(toEngine, 0);
      if (wasPlaying) toEngine.play();
      await crossfade(fromEngine, toEngine, DITTO_CONFIG.CROSSFADE_MS, wasPlaying);
      fromEngine.pause(); // ④ 기존 곡 일시정지

      state.mode = toMode;
      handlers.onModeChange?.(toMode);
      handlers.onTrackLoaded?.(state.pair, toMode);
      return true;
    } catch (err) {
      /* 크로스페이드 준비가 실패해도 시대 이동을 포기하지 않는다.
         이 앱에서 시대 이동은 부가 기능이 아니라 존재 이유라, 이음새가 거칠지언정
         넘어가는 쪽이 '글리치만 지나가고 제자리' 보다 훨씬 낫다.
         모바일에서 버퍼링 락이 걸릴 때 실제로 이 경로를 탄다. */
      if (await hardSwitch(toMode, t, wasPlaying, fromEngine)) return true;
      handleSourceError(err);
      return false;
    } finally {
      state.shuttling = false;
    }
  }

  /** 크로스페이드 없이 곧장 갈아탄다. 성공하면 true. */
  async function hardSwitch(toMode, seekSec, wasPlaying, fromEngine) {
    // YouTube 엔진은 준비 절차가 달라 이 우회로를 쓰지 않는다
    if (useYoutube()) return false;
    const url = state.pair?.[toMode]?.previewUrl;
    if (!url) return false;
    try {
      fromEngine.pause();
      const engine = engines.preview[toMode];
      applyVol(engine, 1);
      // 대체 경로에서도 지점 대응은 똑같이 적용한다
      const started = await engine.playFrom(url, mapTime(state.mode, toMode, seekSec));

      /* 재생이 막혔더라도(자동재생 거부 등) 시대 이동은 성사시킨다.
         이동이 본체고 재생 상태는 부수적이다 — 여기서 되돌리면 옛 음원은 이미
         멈춘 뒤라 '아무것도 안 나오는 제자리' 라는 최악의 상태가 된다.
         새 시대의 정지 화면을 주면 사용자가 재생을 누르면 된다. */
      const nowPlaying = wasPlaying && started !== false;
      if (!nowPlaying) engine.pause();

      state.playing = nowPlaying;
      state.mode = toMode;
      handlers.onModeChange?.(toMode);
      handlers.onTrackLoaded?.(state.pair, toMode);
      handlers.onStateChange?.(state.playing);
      return true;
    } catch {
      return false;
    }
  }

  /* 등가전력(equal-power) 크로스페이드.

     선형으로 섞으면(1-p 와 p) 서로 무관한 두 신호의 합성 전력이 중간에서
     √((1-p)²+p²) = 0.707 로 떨어진다 — 체감 음량이 약 3dB 꺼지면서
     이음새가 '구멍' 으로 들린다. 정렬이 맞아도 어색하게 느껴지던 이유다.
     cos/sin 곡선은 (cos²+sin²)=1 이라 합성 전력이 내내 일정하다. */
  function crossfade(outE, inE, ms, fadeIn) {
    return new Promise((resolve) => {
      const start = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - start) / ms);
        const a = p * Math.PI / 2;
        applyVol(outE, Math.cos(a));
        if (fadeIn) applyVol(inE, Math.sin(a));
        else applyVol(inE, 1);
        if (p < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  function handleSourceError(err) {
    const msg = String(err?.message || err);
    if (msg === 'NO_KEY') {
      handlers.onError?.('YouTube API 키가 없어요. 설정(⚙️)에서 키를 등록하거나 미리듣기 소스를 사용하세요.');
    } else if (msg.startsWith('YT_API_ERROR')) {
      handlers.onError?.(`YouTube API 오류 (${msg.split(':')[1] || '알 수 없음'}) — 키 또는 할당량을 확인하세요.`);
    } else if (msg === 'YT_NO_MATCH') {
      handlers.onError?.('YouTube에서 음원을 찾지 못했어요.');
    } else if (msg === 'NO_PREVIEW') {
      handlers.onError?.('iTunes 미리듣기를 제공하지 않는 곡이에요.');
    } else if (msg === 'LOOKUP_FAILED') {
      handlers.onError?.('곡 정보를 불러오지 못했어요. 잠시 후 다시 눌러주세요.');
    } else if (msg === 'LOAD_TIMEOUT') {
      handlers.onError?.('음원을 불러오지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.');
    } else {
      handlers.onError?.('재생 중 오류가 발생했어요.');
    }
    state.playing = false;
    handlers.onStateChange?.(false);
  }

  function stop() {
    Object.values(engines.preview).forEach((e) => e.stop());
    if (engines.youtube) Object.values(engines.youtube).forEach((e) => e.stop());
    state.playing = false;
    state.shuttling = false;
  }

  /** 설정 변경 시 소스 교체 (같은 곡을 새 소스로 다시 준비) */
  async function setSource(src) {
    if (src === state.source) return;
    const t = state.pair ? currentEngine().getCurrentTime() : 0;
    const wasPlaying = state.playing;
    if (state.pair) currentEngine().pause();
    state.source = src;
    if (state.pair) {
      try {
        const engine = await prepareEngine(state.mode, t);
        applyVol(engine, 1);
        if (wasPlaying) { engine.play(); state.playing = true; handlers.onStateChange?.(true); }
      } catch (err) {
        handleSourceError(err);
      }
    }
  }

  /* 볼륨은 한 번에 한 칸씩 움직인다. 셔틀 중에는 크로스페이드가 매 프레임
     applyVol 로 덮어쓰므로 굳이 지금 엔진에 밀어 넣지 않아도 다음 프레임에 반영된다. */
  const VOL_STEP = 0.1;
  function setMasterVolume(v01) {
    masterVol = Math.max(0, Math.min(1, v01));
    if (state.pair && !state.shuttling) applyVol(currentEngine(), 1);
    handlers.onVolumeChange?.(masterVol);
    return masterVol;
  }
  const nudgeVolume = (dir) => setMasterVolume(masterVol + dir * VOL_STEP);

  /* 첫 사용자 제스처에서 불린다. 반드시 제스처와 같은 tick 이어야 효과가 있다 —
     await 를 하나라도 끼우면 iOS 가 제스처로 안 쳐준다. */
  function unlockAudio() {
    Object.values(engines.preview).forEach((e) => e.unlock?.());
  }

  return {
    on, loadPair, play, pause, toggle, seekRatio, shuttle, stop, setSource,
    setMasterVolume, nudgeVolume, unlockAudio,
    get volume() { return masterVol; },
    get state() { return state; },
  };
})();
