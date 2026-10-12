"""Record the film: open the page with ?render, step it with __renderAt(frame, fps) and save each frame.
The page is laid out at 540 x 675 CSS px and drawn at 2x, so frames are 1080 x 1350 (4:5).
SCALE=3 draws at 3x (1620 x 2025) for supersampling; encode.sh scales it down. FILM_Q adds to the query (e.g. &v=en).
  python tools/render.py <out dir> [first last fps] [--lang ja]   all frames (last -1 = to the end); existing frames are kept
  python tools/render.py <out dir> --at 1.5 9 20 [--lang ja]      stills at those seconds (named s<sec>.png)
"""
import functools
import http.server
import os
import sys
import threading
import time

from playwright.sync_api import sync_playwright

SCALE = int(os.environ.get("SCALE", "2"))
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web")


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    s = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=ROOT))
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s.server_address[1]


def main():
    args = sys.argv[1:]
    lang = ""
    if "--lang" in args:
        i = args.index("--lang")
        lang = "&lang=" + args[i + 1]
        del args[i:i + 2]
    out = args[0]
    os.makedirs(out, exist_ok=True)
    stills = [float(x) for x in args[2:]] if len(args) > 1 and args[1] == "--at" else None
    port = serve()
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", headless=False, args=["--window-position=-3400,0", "--ignore-gpu-blocklist"])
        pg = b.new_page(viewport={"width": 540, "height": 675}, device_scale_factor=SCALE)
        pg.on("pageerror", lambda e: print("[pageerror]", e))
        pg.on("console", lambda m: print("[console]", m.text) if m.type in ("error", "warning") else None)
        pg.goto(f"http://127.0.0.1:{port}/index.html?render&rs={SCALE}{lang}{os.environ.get('FILM_Q', '')}")
        pg.wait_for_function("window.__ready === true", timeout=60000)
        pg.evaluate("document.fonts.ready")
        fps = 60
        if stills:
            for s in stills:
                r = pg.evaluate(f"window.__renderAt({round(s * fps)}, {fps})")
                pg.screenshot(path=os.path.join(out, f"s{s:05.2f}.png"))
                print(s, r, flush=True)
        else:
            f0 = int(args[1]) if len(args) > 1 else 0
            f1 = int(args[2]) if len(args) > 2 else -1
            fps = int(args[3]) if len(args) > 3 else 60
            if f1 < 0:
                f1 = int(round(pg.evaluate("window.__filmLen") * fps))
            t0 = time.time()
            todo = [f for f in range(f0, f1) if not os.path.exists(os.path.join(out, f"{f:05d}.png"))]
            for n, f in enumerate(todo):
                r = pg.evaluate(f"window.__renderAt({f}, {fps})")
                pg.screenshot(path=os.path.join(out, f"{f:05d}.png"))
                if n % 60 == 0:
                    print(f"frame {f}/{f1} {r.get('scene')} {(time.time() - t0) / (n + 1):.2f}s/frame", flush=True)
        b.close()


main()
