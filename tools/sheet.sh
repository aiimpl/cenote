#!/bin/bash
# export stills and tile them side by side: tools/sheet.sh out.jpg seconds...
set -e
out=$1; shift
rm -rf build/st && .venv/bin/python tools/render.py build/st --at "$@" > /dev/null
ins=(); n=0
for f in build/st/s*.png; do ins+=(-i "$f"); n=$((n+1)); done
ffmpeg -v error -y "${ins[@]}" -filter_complex "hstack=$n,scale=$((n*400)):-1" "$out"
