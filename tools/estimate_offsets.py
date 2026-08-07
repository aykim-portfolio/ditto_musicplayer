"""
estimate_offsets.py — iTunes 미리듣기 쌍의 시간 오프셋 자동 추정

의존성:
    Python 3.8+
    pip install librosa scipy numpy

실행 전제:
    - 이 스크립트는 Python + librosa + scipy + numpy 가 설치된 환경에서만 돌아간다.
    - Windows 에 기본 깔려 있는 python.exe (WindowsApps 스텁) 로는 안 된다.
    - python.org 에서 설치한 뒤 `pip install librosa scipy numpy` 를 먼저 돌려야 한다.

주의:
    이 스크립트의 결과는 참고용 초기 추정치다. 26번(MAKING-OF)에서 확인된 것처럼
    원곡과 리메이크는 템포·조성·편곡·보컬이 모두 달라 자동 정렬의 신뢰도가 낮다.
    결과를 그대로 align.js 에 넣지 말고 반드시 tools/manual_align.html 로
    귀로 확인한 뒤 채울 것.

사용법:
    cd tools
    python estimate_offsets.py
"""

import urllib.request
import json
import re
import os
import ssl
import numpy as np
import librosa
from scipy import signal

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
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
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

    # 두 onset envelope 간의 cross-correlation 계산
    correlation = signal.correlate(onset_orig, onset_rmk, mode='full')

    # ---- 탐색 범위 제한 ----
    # lag 인덱스 → 초 변환 계수
    hop_length = 512
    frames_per_sec = sr_orig / hop_length
    max_lag_frames = int(MAX_LAG_SEC * frames_per_sec)

    # correlation 배열에서 lag=0 에 해당하는 인덱스
    zero_lag_idx = len(onset_rmk) - 1

    # ±max_lag_frames 밖을 0 으로 마스킹
    mask = np.zeros_like(correlation)
    lo = max(0, zero_lag_idx - max_lag_frames)
    hi = min(len(correlation), zero_lag_idx + max_lag_frames + 1)
    mask[lo:hi] = 1
    correlation = correlation * mask

    # 최대 상관관계를 가지는 인덱스 찾기
    best_idx = np.argmax(correlation)
    lag = best_idx - zero_lag_idx

    # lag(프레임 수)를 초(second) 단위로 변환
    offset_seconds = lag * hop_length / sr_orig

    # confidence 추정 — 마스킹된 범위 안에서의 상대적 피크 높이
    masked_corr = correlation[lo:hi]
    confidence = masked_corr.max() / (masked_corr.mean() + 1e-6)
    conf_norm = min(1.0, confidence / 50.0)

    return -offset_seconds, conf_norm  # 리메이크 - 원곡


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
            print(f"[{pair_id}] Estimated Offset: {offset:.2f}s  Confidence: {conf:.3f}")
        except Exception as e:
            print(f"Error analyzing {pair_id}: {e}")

    print("\n\n===== js/align.js 에 넣을 내용 (참고용 — 반드시 귀로 확인할 것) =====")
    print("window.DITTO_ALIGN = {")
    for pair_id, data in results.items():
        print(f"  '{pair_id}': {{ offset: {data['offset']}, confidence: {data['confidence']} }},")
    print("};")


if __name__ == '__main__':
    main()
