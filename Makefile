PORT ?= 8814
PY ?= .venv/bin/python

.PHONY: serve setup film video preview stills check clean

# Open http://127.0.0.1:8814/ after this (?render plays the film frame by frame)
serve:
	python3 -m http.server $(PORT) --bind 127.0.0.1 --directory web

setup:
	python3 -m venv .venv
	.venv/bin/pip install -r requirements.txt
	.venv/bin/playwright install chromium

# the film, frame by frame (1080x1350 PNG, 60 fps, drawn at 3x and scaled down), then the mp4
film:
	SCALE=3 $(PY) tools/render.py build/frames 0 -1 60

video:
	sh tools/encode.sh build/frames build/cenote.mp4

# a rough, fast version of the film (540x675, 30 fps) to check the cut
preview:
	SCALE=1 $(PY) tools/render.py build/preview 0 -1 30
	ffmpeg -v error -y -framerate 30 -i build/preview/%05d.png -vf "scale=540:676,format=yuv420p" -c:v libx264 -crf 20 build/preview.mp4

stills:
	tools/sheet.sh build/stills.jpg 0.5 4.5 7.5 10.5 13.5

# pyflakes, then the page at desktop and phone size: frame rate, errors, a drag, the look-down view and a drag there
check:
	$(PY) -m pyflakes tools
	$(PY) tools/check_page.py build/page

clean:
	rm -rf build
