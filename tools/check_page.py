"""Open the page as a visitor would (desktop and phone size), measure the frame rate, drag across the water,
switch to the look-down view, and save screenshots.
  python tools/check_page.py <out dir> [url]
"""
import functools
import http.server
import os
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web")


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    s = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=ROOT))
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s.server_address[1]


FPS_JS = """() => new Promise((res) => { let n = 0; const t0 = performance.now();
  const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); };
  requestAnimationFrame(f); })"""


def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    url = sys.argv[2] if len(sys.argv) > 2 else f"http://127.0.0.1:{serve()}/index.html"
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", headless=False, args=["--window-position=-3400,0", "--ignore-gpu-blocklist"])
        for name, vp, scale, mobile in [("desktop", {"width": 1440, "height": 900}, 2, False), ("phone", {"width": 390, "height": 844}, 3, True)]:
            ctx = b.new_context(viewport=vp, device_scale_factor=scale, is_mobile=mobile, has_touch=mobile)
            pg = ctx.new_page()
            bad = []
            pg.on("pageerror", lambda e: bad.append(str(e)))
            pg.on("console", lambda m: bad.append(m.text) if m.type == "error" else None)
            pg.on("response", lambda r: bad.append(f"{r.status} {r.url}") if r.status >= 400 else None)
            pg.goto(url)
            pg.wait_for_timeout(4000)
            fps = pg.evaluate(FPS_JS)
            w, h = vp["width"], vp["height"]
            pg.mouse.move(w * 0.25, h * 0.55)
            pg.mouse.down()
            for i in range(40):
                pg.mouse.move(w * (0.25 + i * 0.012), h * (0.55 + 0.04 * ((i % 10) / 10)))
                pg.wait_for_timeout(30)
            pg.mouse.up()
            pg.wait_for_timeout(200)
            pg.screenshot(path=os.path.join(out, f"{name}_up.png"))
            pg.click("#b-down")
            pg.wait_for_timeout(3000)
            pg.mouse.move(w * 0.5, h * 0.35)
            pg.mouse.down()
            for i in range(25):
                pg.mouse.move(w * (0.5 + i * 0.008), h * (0.35 + i * 0.006))
                pg.wait_for_timeout(30)
            pg.mouse.up()
            pg.wait_for_timeout(500)
            pg.screenshot(path=os.path.join(out, f"{name}_down.png"))
            print(name, f"{fps:.1f} fps", "errors:", bad[:5])
            ctx.close()
        b.close()


main()
