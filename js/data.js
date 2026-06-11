/* ============================================================
   ditto — PoC 추천 트랙 데이터셋 (원곡 ↔ 리메이크 10쌍)
   PRD 3-2: "PoC 전용 추천 트랙 10쌍 수동 데이터셋 구축"
   실제 아트워크/미리듣기 URL은 iTunes Search API 로 런타임 매칭.
   query: iTunes 검색어 / ytQuery: YouTube 검색어(곡명+가수명+Official Audio)
   ============================================================ */

window.DITTO_PAIRS = [
  {
    id: 'pair-01',
    title: '너에게',
    original: { artist: '서태지와 아이들', year: 1993, query: '서태지와 아이들 너에게', ytQuery: '서태지와 아이들 너에게 Official Audio' },
    remake:   { artist: '성시경', year: 2013, album: '응답하라 1994 OST PART 2', query: '성시경 너에게', ytQuery: '성시경 너에게 응답하라 1994 Official Audio' },
  },
  {
    id: 'pair-02',
    title: '소녀',
    original: { artist: '이문세', year: 1985, query: '이문세 소녀', ytQuery: '이문세 소녀 Official Audio' },
    remake:   { artist: '오혁', year: 2015, album: '응답하라 1988 OST', query: '오혁 소녀', ytQuery: '오혁 소녀 응답하라 1988 Official Audio' },
  },
  {
    id: 'pair-03',
    title: '청춘',
    original: { artist: '산울림', year: 1981, query: '산울림 청춘', ytQuery: '산울림 청춘 Official Audio' },
    remake:   { artist: '김필', year: 2015, album: '응답하라 1988 OST', query: '김필 청춘 응답하라', ytQuery: '김필 청춘 응답하라 1988 Official Audio' },
  },
  {
    id: 'pair-04',
    title: '걱정말아요 그대',
    original: { artist: '전인권', year: 2004, query: '전인권 걱정말아요 그대', ytQuery: '전인권 걱정말아요 그대 Official Audio' },
    remake:   { artist: '이적', year: 2015, album: '응답하라 1988 OST', query: '이적 걱정말아요 그대', ytQuery: '이적 걱정말아요 그대 응답하라 1988 Official Audio' },
  },
  {
    id: 'pair-05',
    title: '너의 의미',
    original: { artist: '산울림', year: 1984, query: '산울림 너의 의미', ytQuery: '산울림 너의 의미 Official Audio' },
    remake:   { artist: '아이유', year: 2014, album: '꽃갈피', query: '아이유 너의 의미', ytQuery: '아이유 너의 의미 Official Audio' },
  },
  {
    id: 'pair-06',
    title: '나의 옛날이야기',
    original: { artist: '조덕배', year: 1985, query: '조덕배 나의 옛날이야기', ytQuery: '조덕배 나의 옛날이야기 Official Audio' },
    remake:   { artist: '아이유', year: 2014, album: '꽃갈피', query: '아이유 나의 옛날이야기', ytQuery: '아이유 나의 옛날이야기 Official Audio' },
  },
  {
    id: 'pair-07',
    title: '가을 아침',
    original: { artist: '양희은', year: 1991, query: '양희은 가을 아침', ytQuery: '양희은 가을 아침 Official Audio' },
    remake:   { artist: '아이유', year: 2017, album: '꽃갈피 둘', query: '아이유 가을 아침', ytQuery: '아이유 가을 아침 Official Audio' },
  },
  {
    id: 'pair-08',
    title: '사랑이 지나가면',
    original: { artist: '이문세', year: 1987, query: '이문세 사랑이 지나가면', ytQuery: '이문세 사랑이 지나가면 Official Audio' },
    remake:   { artist: '아이유', year: 2017, album: '꽃갈피 둘', query: '아이유 사랑이 지나가면', ytQuery: '아이유 사랑이 지나가면 Official Audio' },
  },
  {
    id: 'pair-09',
    title: 'All For You',
    original: { artist: '쿨', year: 1997, query: '쿨 All For You', ytQuery: '쿨 All For You Official Audio' },
    remake:   { artist: '서인국, 정은지', year: 2012, album: '응답하라 1997 OST', query: '서인국 정은지 All For You', ytQuery: '서인국 정은지 All For You Official Audio' },
  },
  {
    id: 'pair-10',
    title: '서울 이곳은',
    original: { artist: '장철웅', year: 1995, query: '장철웅 서울 이곳은', ytQuery: '장철웅 서울 이곳은 Official Audio' },
    remake:   { artist: '로이킴', year: 2013, album: '응답하라 1994 OST', query: '로이킴 서울 이곳은', ytQuery: '로이킴 서울 이곳은 응답하라 1994 Official Audio' },
  },
];
