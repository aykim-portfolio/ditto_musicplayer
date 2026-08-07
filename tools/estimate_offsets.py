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

def get_catalog():
    with open(CATALOG_PATH, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # window.DITTO_CATALOG 파싱
    match = re.search(r'window\.DITTO_CATALOG\s*=\s*(\{.*?\});', content, re.DOTALL)
    if not match:
        raise ValueError("Cannot parse catalog.js")
    
    pairs = {}
    for pair_match in re.finditer(r"'([^']+)':\s*\{(.*?)\},?\n", match.group(1), re.DOTALL):
        pair_id = pair_match.group(1)
        pair_data = pair_match.group(2)
        
        orig_url = re.search(r'original:.*?previewUrl:\s*\'([^\']+)\'', pair_data).group(1)
        rmk_url = re.search(r'remake:.*?previewUrl:\s*\'([^\']+)\'', pair_data).group(1)
        
        pairs[pair_id] = {
            'original': orig_url,
            'remake': rmk_url
        }
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
    # librosa로 오디오 로드 및 onset envelope 계산
    print(f"Analyzing {orig_path} and {rmk_path}...")
    y_orig, sr_orig = librosa.load(orig_path, sr=22050, mono=True)
    y_rmk, sr_rmk = librosa.load(rmk_path, sr=22050, mono=True)
    
    # onset envelope (비트 및 음의 시작점 에너지)
    onset_orig = librosa.onset.onset_strength(y=y_orig, sr=sr_orig)
    onset_rmk = librosa.onset.onset_strength(y=y_rmk, sr=sr_rmk)
    
    # 두 onset envelope 간의 cross-correlation 계산
    correlation = signal.correlate(onset_orig, onset_rmk, mode='full')
    
    # 최대 상관관계를 가지는 인덱스 찾기
    lag = np.argmax(correlation) - (len(onset_rmk) - 1)
    
    # lag(프레임 수)를 초(second) 단위로 변환
    hop_length = 512
    offset_seconds = lag * hop_length / sr_orig
    
    # confidence 추정
    confidence = correlation.max() / (correlation.mean() + 1e-6)
    conf_norm = min(1.0, confidence / 50.0) 
    
    return -offset_seconds, conf_norm # 리메이크 - 원곡

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
                'confidence': 1 # 수동 덮어쓰기용 1.0 적용
            }
            print(f"[{pair_id}] Estimated Offset: {offset:.2f}s (Raw Conf: {conf:.2f})")
        except Exception as e:
            print(f"Error analyzing {pair_id}: {e}")
            
    print("\n\n===== js/align.js 에 넣을 내용 =====")
    print("window.DITTO_ALIGN = {")
    for pair_id, data in results.items():
        print(f"  '{pair_id}': {{ offset: {data['offset']}, confidence: {data['confidence']} }},")
    print("};")

if __name__ == '__main__':
    main()
