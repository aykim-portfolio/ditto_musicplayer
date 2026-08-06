/* ============================================================
   ditto — 설정 / API 키 관리
   ⚠️ 보안: API 키를 이 파일에 직접 커밋하지 마세요.
   키는 앱 내 설정(⚙️) 화면에서 입력하면 localStorage 에만 저장됩니다.
   GCP 콘솔에서 키에 HTTP 리퍼러 제한을 걸어두는 것을 권장합니다.
   ============================================================ */

window.DITTO_CONFIG = {
  // 개발 편의용 기본값 (비워두세요 — 설정 화면에서 입력)
  YOUTUBE_API_KEY: '',

  // iTunes Search API (키 불필요)
  ITUNES_ENDPOINT: 'https://itunes.apple.com/search',
  ITUNES_COUNTRY: 'KR',

  // YouTube Data API v3
  YT_SEARCH_ENDPOINT: 'https://www.googleapis.com/youtube/v3/search',

  // 크로스페이드 길이 (ms) — PRD: 전환 버퍼링 목표 0.8초 이하
  CROSSFADE_MS: 800,

  // 음원 버퍼링 대기 한도 (ms).
  // 미디어 요소는 네트워크가 막히면 canplay 도 error 도 안 내보내고
  // stalled 상태로 머문다. 이 시간을 넘기면 실패로 보고 잠금을 푼다.
  LOAD_TIMEOUT_MS: 8000,

  STORAGE_KEYS: {
    YT_KEY: 'ditto_yt_api_key',
    SOURCE: 'ditto_play_source',   // 'preview' | 'youtube'
    LIBRARY: 'ditto_library',
    // 클릭휠이 돌아간다는 걸 한 번이라도 보여줬는지. 실제로 돌려본 뒤에는
    // 다시 안 띄운다 — 반복되는 힌트는 힌트가 아니라 잔소리다.
    WHEEL_HINT: 'ditto_wheel_hint_seen',
  },
};

window.DittoConfig = {
  getYtKey() {
    return (
      localStorage.getItem(DITTO_CONFIG.STORAGE_KEYS.YT_KEY) ||
      DITTO_CONFIG.YOUTUBE_API_KEY ||
      ''
    );
  },
  setYtKey(key) {
    if (key) localStorage.setItem(DITTO_CONFIG.STORAGE_KEYS.YT_KEY, key.trim());
    else localStorage.removeItem(DITTO_CONFIG.STORAGE_KEYS.YT_KEY);
  },
  getSource() {
    return localStorage.getItem(DITTO_CONFIG.STORAGE_KEYS.SOURCE) || 'preview';
  },
  setSource(src) {
    localStorage.setItem(DITTO_CONFIG.STORAGE_KEYS.SOURCE, src);
  },
};
