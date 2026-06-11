/* ============================================================
   ditto — YouTube 연동
   1) Data API v3 검색: 곡명+가수명+Official Audio → videoId 매칭
      (API 키는 설정 화면에서 입력, localStorage 보관 — 코드에 키 없음)
   2) IFrame Player API: 전체 곡 재생 엔진 (크로스페이드용 2-플레이어)
   ============================================================ */

window.DittoYoutube = (() => {
  const videoCache = new Map(); // query -> videoId

  /* ---------- Data API v3 검색 ---------- */
  async function searchVideoId(query) {
    if (videoCache.has(query)) return videoCache.get(query);
    const key = DittoConfig.getYtKey();
    if (!key) throw new Error('NO_KEY');

    const url =
      `${DITTO_CONFIG.YT_SEARCH_ENDPOINT}?part=snippet&type=video&videoCategoryId=10` +
      `&maxResults=1&q=${encodeURIComponent(query)}&key=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const reason = body?.error?.errors?.[0]?.reason || res.status;
      throw new Error(`YT_API_ERROR:${reason}`);
    }
    const data = await res.json();
    const id = data.items?.[0]?.id?.videoId || null;
    if (id) videoCache.set(query, id);
    return id;
  }

  /* ---------- IFrame Player API 로더 ---------- */
  let apiPromise = null;
  function loadIframeApi() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (apiPromise) return apiPromise;
    apiPromise = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    });
    return apiPromise;
  }

  /* ---------- 플레이어 엔진 (player.js 의 Engine 인터페이스 구현) ---------- */
  class YoutubeEngine {
    constructor(mountId) {
      this.mountId = mountId;
      this.player = null;
      this.readyPromise = null;
      this.volume = 100;
      this.onEnded = null;
    }

    async _ensurePlayer() {
      if (this.player) return this.readyPromise;
      await loadIframeApi();
      this.readyPromise = new Promise((resolve) => {
        this.player = new YT.Player(this.mountId, {
          width: 1, height: 1,
          playerVars: { controls: 0, disablekb: 1, playsinline: 1, origin: location.origin },
          events: {
            onReady: () => resolve(),
            onStateChange: (e) => {
              if (e.data === YT.PlayerState.ENDED) this.onEnded?.();
            },
          },
        });
      });
      return this.readyPromise;
    }

    /** videoId 를 seekSec 지점에 버퍼링 완료 상태로 준비 (PRD 5-2 안전 락) */
    async prepare(videoId, seekSec = 0) {
      await this._ensurePlayer();
      const p = this.player;
      p.setVolume(0);
      p.loadVideoById({ videoId, startSeconds: seekSec });
      // BUFFERING → PLAYING 까지 대기 후 일시정지 상태로 홀드
      await new Promise((resolve) => {
        const check = setInterval(() => {
          const s = p.getPlayerState();
          if (s === YT.PlayerState.PLAYING || s === YT.PlayerState.PAUSED) {
            clearInterval(check);
            resolve();
          }
        }, 100);
        setTimeout(() => { clearInterval(check); resolve(); }, 6000); // 안전 타임아웃
      });
      p.pauseVideo();
    }

    play() { this.player?.playVideo(); }
    pause() { this.player?.pauseVideo(); }
    seek(sec) { this.player?.seekTo(sec, true); }
    getCurrentTime() { return this.player?.getCurrentTime?.() || 0; }
    getDuration() { return this.player?.getDuration?.() || 0; }
    setVolume(v01) {
      this.volume = Math.round(Math.max(0, Math.min(1, v01)) * 100);
      this.player?.setVolume(this.volume);
    }
    isPlaying() {
      return this.player?.getPlayerState?.() === YT.PlayerState.PLAYING;
    }
    stop() { this.player?.stopVideo?.(); }
  }

  return { searchVideoId, YoutubeEngine };
})();
