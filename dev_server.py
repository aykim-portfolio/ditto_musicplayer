"""ditto 개발용 정적 서버 — 브라우저 캐시를 끄고 이 폴더를 서빙한다.

`python -m http.server` 는 Cache-Control 헤더를 보내지 않아서 브라우저가
CSS/JS 를 휴리스틱 캐싱한다. 그 결과 파일을 고쳐도 일반 새로고침(F5)으로는
반영되지 않고 매번 강제 새로고침(Ctrl+Shift+R)이 필요했다.
이 서버는 no-store 를 붙여 항상 최신 파일을 내려준다.

    python dev_server.py [PORT]   # 기본 5173

서빙 대상은 실행 위치가 아니라 이 스크립트가 있는 폴더다.
(프로젝트 루트에서 `python ditto/dev_server.py` 로 실행해도 동일하게 동작)
"""
import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
ROOT = os.path.dirname(os.path.abspath(__file__))


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):  # 요청 로그는 조용히
        pass


if __name__ == "__main__":
    handler = partial(NoCacheHandler, directory=ROOT)
    with ThreadingHTTPServer(("", PORT), handler) as httpd:
        print(f"ditto → http://localhost:{PORT}  (no-cache)")
        httpd.serve_forever()
