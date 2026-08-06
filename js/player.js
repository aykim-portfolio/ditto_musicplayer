/* ============================================================
   ditto — 타임 셔틀 플레이어 엔진
   PRD 3 필수 기능:
   [현재 재생 시간 저장 → 기존 곡 일시정지 → 새 음원 seekTo → 재생]
   + 크로스페이드(페이드아웃/인) + 버퍼링 안전 락(PRD 5-2)
   소스: 'preview' (iTunes 30초) | 'youtube' (전체 곡)
   ============================================================ */

/* ---------- iTunes 미리듣기 엔진 (HTMLAudio) ---------- */
class PreviewEngine {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.onEnded = null;
    this.audio.addEventListener('ended', () => this.onEnded?.());
  }

  /** url 을 seekSec 지점에 재생 가능 상태로 준비 (버퍼링 락) */
  async prepare(url, seekSec = 0) {
    if (this.audio.src !== url) {
      this.audio.src = url;
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
      });
    }
    const dur = this.getDuration();
    this.audio.currentTime = dur ? Math.min(seekSec, Math.max(0, dur - 0.5)) : seekSec;
  }

  /* 실제로 재생이 시작됐는지를 돌려준다.
     브라우저는 사용자 제스처 없는 자동재생을 거부하는데, 그걸 삼켜버리면
     화면에는 일시정지 버튼이 떠 있고 소리는 안 나는 상태가 된다. */
  play() { return this.audio.play().then(() => true).catch(() => false); }
  pause() { this.audio.pause(); }
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
    if (!meta.previewUrl) throw new Error('NO_PREVIEW');
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
      const toEngine = await prepareEngine(toMode, t);

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
      handleSourceError(err);
      return false;
    } finally {
      state.shuttling = false;
    }
  }

  function crossfade(outE, inE, ms, fadeIn) {
    return new Promise((resolve) => {
      const start = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - start) / ms);
        applyVol(outE, 1 - p);
        if (fadeIn) applyVol(inE, p);
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

  return {
    on, loadPair, play, pause, toggle, seekRatio, shuttle, stop, setSource,
    setMasterVolume, nudgeVolume,
    get volume() { return masterVol; },
    get state() { return state; },
  };
})();
