#!/bin/bash
# Frames (PNG, 60 fps, 1080x1350) -> an mp4 that X accepts (H.264 High, yuv420p, TV range, no sound)
#   tools/encode.sh <frames dir> <out.mp4>
set -e
ffmpeg -v error -y -framerate 60 -i "$1/%05d.png" \
  -vf "scale=1080:1350:flags=lanczos:out_color_matrix=bt709:out_range=tv,format=yuv420p" \
  -c:v libx264 -profile:v high -crf ${CRF:-17} -preset slow -pix_fmt yuv420p -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -an -movflags +faststart "$2"
ffprobe -v error -select_streams v:0 -show_entries stream=pix_fmt,color_range,width,height,nb_frames,r_frame_rate -of csv=p=0 "$2"
