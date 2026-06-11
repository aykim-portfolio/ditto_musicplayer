/* ============================================================
   ditto — iTunes Search API 연동 (키 불필요)
   - 곡 메타데이터(제목/아티스트/연도/앨범아트) + 30초 미리듣기 URL
   - CORS 제약 회피를 위해 JSONP 사용 (file:// 환경에서도 동작)
   ============================================================ */

window.DittoItunes = (() => {
  let jsonpSeq = 0;

  function jsonp(url) {
    return new Promise((resolve, reject) => {
      const cbName = `__dittoItunesCb${++jsonpSeq}`;
      const script = document.createElement('script');
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('iTunes 요청 시간 초과'));
      }, 10000);

      function cleanup() {
        clearTimeout(timer);
        delete window[cbName];
        script.remove();
      }

      window[cbName] = (data) => { cleanup(); resolve(data); };
      script.onerror = () => { cleanup(); reject(new Error('iTunes 요청 실패')); };
      script.src = `${url}&callback=${cbName}`;
      document.head.appendChild(script);
    });
  }

  function normalize(item) {
    return {
      trackId: item.trackId,
      title: item.trackName,
      artist: item.artistName,
      album: item.collectionName || '',
      year: item.releaseDate ? new Date(item.releaseDate).getFullYear() : null,
      artwork: (item.artworkUrl100 || '').replace('100x100', '600x600'),
      previewUrl: item.previewUrl || null,
      durationMs: item.trackTimeMillis || 30000,
    };
  }

  /** 검색어로 곡 목록 조회 */
  async function search(term, limit = 10) {
    const url =
      `${DITTO_CONFIG.ITUNES_ENDPOINT}?term=${encodeURIComponent(term)}` +
      `&media=music&entity=song&country=${DITTO_CONFIG.ITUNES_COUNTRY}&limit=${limit}`;
    const data = await jsonp(url);
    return (data.results || []).filter((r) => r.previewUrl).map(normalize);
  }

  /** 검색어와 가장 잘 맞는 한 곡 매칭 (미리듣기 URL 있는 첫 결과) */
  async function matchOne(term) {
    const results = await search(term, 5);
    return results[0] || null;
  }

  return { search, matchOne };
})();
