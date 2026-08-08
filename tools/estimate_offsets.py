"""
estimate_offsets.py — iTunes 미리듣기 쌍의 시간 오프셋 자동 추정

의존성:
    Python 3.8+
    pip install librosa numpy

실행 전제:
    - 이 스크립트는 Python + librosa + numpy 가 설치된 환경에서만 돌아간다.
    - Windows 에 기본 깔려 있는 python.exe (WindowsApps 스텁) 로는 안 된다.
    - python.org 에서 설치한 뒤 `pip install librosa numpy` 를 먼저 돌려야 한다.

주의 — 이 방식은 이미 실패한 것으로 판명됐다 (MAKING-OF 29번):
    같은 알고리즘(onset flux + ±10초 제한 + 정규화 상관)을 브라우저 Web Audio 로
    10쌍 전부 돌려봤다. r = 0.082~0.470, 임계값 0.45 를 넘은 건 한 쌍뿐이고
    그 한 쌍마저 탐색 경계(-8.15초)에 붙어 있어 신뢰할 수 없다.
    26번의 크로마 실패(0.06~0.47, 1/10)와 사실상 같은 결과다 —
    특징을 화성에서 온셋으로 바꿔도 벽은 그대로였다.

    그래서 이 스크립트는 **참고용 기록**이지 align.js 를 채우는 경로가 아니다.
    채우는 길은 tools/manual_align.html 로 귀로 재는 것뿐이다.

사용법:
    cd tools
    python estimate_offsets.py
"""

import urllib.request
import re
import os
import numpy as np
import librosa

# iTunes catalog 파일에서 미리듣기 URL 추출 (JS 정규표현식 파싱)
CATALOG_PATH = '../js/catalog.js'
DOWNLOAD_DIR = './audio_temp'

# 탐색 범위 제한 — ±MAX_LAG_SEC 초 밖의 후보는 무시한다.
# 30초 클립에 ±30초 lag 를 허용하면 겹침 5초짜리 '우연의 일치' 가
# 최대 상관으로 잡힌다 (MAKING-OF 26번의 함정). 겹침 66% 이상을 강제한다.
MAX_LAG_SEC = 10.0


def get_catalog():
    with open(CATALOG_PATH, 'r', encoding='utf-8') as f:
        content = f.read()

    # window.DITTO_CATALOG 전체 블록 추출
    cat_match = re.search(r'window\.DITTO_CATALOG\s*=\s*(\{.*?\});', content, re.DOTALL)
    if not cat_match:
        raise ValueError("Cannot parse catalog.js — window.DITTO_CATALOG 를 찾을 수 없다")

    cat_body = cat_match.group(1)

    # 쌍 단위로 분리: 'pair-XX': { ... } 블록을 greedy 로 잡되
    # 다음 'pair-' 또는 닫는 }; 직전까지.
    pairs = {}
    for m in re.finditer(
        r"'(pair-\d+)':\s*\{(.*?)(?=\n\s*'pair-|\n\};)",
        cat_body,
        re.DOTALL,
    ):
        pair_id = m.group(1)
        block = m.group(2)

        orig_url = re.search(r"original:\s*\{.*?previewUrl:\s*'([^']+)'", block, re.DOTALL)
        rmk_url = re.search(r"remake:\s*\{.*?previewUrl:\s*'([^']+)'", block, re.DOTALL)

        if not orig_url or not rmk_url:
            print(f"[{pair_id}] previewUrl 파싱 실패 — 건너뜀")
            continue

        pairs[pair_id] = {
            'original': orig_url.group(1),
            'remake': rmk_url.group(1),
        }

    if not pairs:
        raise ValueError("catalog.js 에서 쌍을 하나도 읽지 못했다")

    return pairs


def download_audio(url, filepath):
    if os.path.exists(filepath):
        return
    # 인증서 검증은 끄지 않는다. 예전엔 여기서 ssl 컨텍스트를 만들어 검증을 껐는데,
    # urlretrieve 는 context 인자를 받지 않아 그 컨텍스트가 쓰이지도 않았다 — 죽은 코드였다.
    # apple 의 미리듣기 CDN 은 정상 인증서를 쓰므로 끌 이유도 없다.
    print(f"Downloading {url} to {filepath}...")
    urllib.request.urlretrieve(url, filepath)


def estimate_offset(orig_path, rmk_path):
    """두 미리듣기의 onset envelope 교차 상관으로 시간 오프셋을 추정한다."""
    print(f"Analyzing {orig_path} and {rmk_path}...")
    y_orig, sr_orig = librosa.load(orig_path, sr=22050, mono=True)
    y_rmk, sr_rmk = librosa.load(rmk_path, sr=22050, mono=True)

    # onset envelope (비트 및 음의 시작점 에너지)
    onset_orig = librosa.onset.onset_strength(y=y_orig, sr=sr_orig)
    onset_rmk = librosa.onset.onset_strength(y=y_rmk, sr=sr_rmk)

    hop_length = 512
    frames_per_sec = sr_orig / hop_length
    max_lag_frames = int(MAX_LAG_SEC * frames_per_sec)

    # ---- lag 마다 정규화 상관계수(Pearson r)를 직접 구한다 ----
    #
    # 예전엔 signal.correlate 의 raw 피크를 그 범위의 평균으로 나눠 confidence 를
    # 만들었다(`peak / mean / 50`). 그 계수 50 은 탐색 범위 제한이 *없던* 시절에
    # 맞춰진 값이다 — 그때는 대부분의 lag 에서 겹침이 거의 없어 평균이 바닥이라
    # 비율이 크게 나왔다. ±10초로 제한한 뒤에는 평균이 피크에 가까워져 비율이
    # 1.3 언저리로 주저앉는다. 실측하니 10쌍 전부 0.025~0.033 이 나왔다 —
    # ALIGN_MIN_CONFIDENCE(0.45)를 **구조적으로 넘을 수 없는** 값이다.
    # (탐색 범위 제한과 confidence 공식이 서로를 무효화하고 있었다.)
    #
    # 그래서 척도 자체를 바꾼다. 겹치는 구간에서만 평균·표준편차를 다시 구한
    # 정규화 상관계수는 겹침 길이와 신호 크기에 영향을 받지 않고 [-1, 1] 에
    # 떨어지므로 0.45 라는 임계값과 곧바로 비교된다.
    best_r, best_lag = -2.0, 0
    n_min = min(len(onset_orig), len(onset_rmk))

    for lag in range(-max_lag_frames, max_lag_frames + 1):
        lo = max(0, lag)
        hi = min(len(onset_orig), len(onset_rmk) + lag)
        if hi - lo < 0.5 * n_min:      # 겹침 50% 미만은 비교 대상이 아니다
            continue

        a = onset_orig[lo:hi]
        b = onset_rmk[lo - lag:hi - lag]
        a = a - a.mean()
        b = b - b.mean()

        denom = np.sqrt((a * a).sum() * (b * b).sum())
        r = float((a * b).sum() / denom) if denom > 0 else 0.0

        if r > best_r:
            best_r, best_lag = r, lag

    offset_seconds = best_lag * hop_length / sr_orig

    return -offset_seconds, max(0.0, best_r)  # 리메이크 - 원곡


def main():
    if not os.path.exists(DOWNLOAD_DIR):
        os.makedirs(DOWNLOAD_DIR)

    catalog = get_catalog()
    results = {}

    for pair_id, urls in catalog.items():
        orig_path = os.path.join(DOWNLOAD_DIR, f"{pair_id}_orig.m4a")
        rmk_path = os.path.join(DOWNLOAD_DIR, f"{pair_id}_rmk.m4a")

        download_audio(urls['original'], orig_path)
        download_audio(urls['remake'], rmk_path)

        try:
            offset, conf = estimate_offset(orig_path, rmk_path)
            results[pair_id] = {
                'offset': round(offset, 2),
                'confidence': round(conf, 3),
            }
            flag = '' if conf >= 0.45 else '   ← 임계값 미만, 앱이 무시함'
            print(f"[{pair_id}] Estimated Offset: {offset:.2f}s  r: {conf:.3f}{flag}")
        except Exception as e:
            print(f"Error analyzing {pair_id}: {e}")

    passed = sum(1 for d in results.values() if d['confidence'] >= 0.45)
    print(f"\n임계값 0.45 를 넘은 쌍: {passed} / {len(results)}")
    print("브라우저 재현 실측(MAKING-OF 29번)에서는 1/10 이었고, 그 하나도 "
          "탐색 경계에 붙어 있어 신뢰할 수 없었다.")

    print("\n\n===== js/align.js 참고용 출력 — 그대로 붙여넣지 말 것 =====")
    print("# 이 숫자는 manual_align.html 로 귀로 확인하기 전까지는 추정치일 뿐이다.")
    print("window.DITTO_ALIGN = {")
    for pair_id, data in results.items():
        print(f"  '{pair_id}': {{ offset: {data['offset']}, confidence: {data['confidence']} }},")
    print("};")


if __name__ == '__main__':
    main()
