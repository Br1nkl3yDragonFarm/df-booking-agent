#!/usr/bin/env bash
# Rebuilds docs/explainer/dragon-farm-dashboard-explainer.mp4.
# Needs node with Playwright, Chromium and ffmpeg. Run from the repo root: bash docs/explainer/build.sh
set -euo pipefail
ROOT=$(pwd); D=$ROOT/docs/explainer; W=$(mktemp -d); mkdir -p "$W/shots" "$W/frames"
PW=$(npm root -g)/playwright
npx http-server -p 8080 -s "$ROOT" & S1=$!
cp "$D/scenes.html" "$W/"; (cd "$W" && npx http-server -p 8081 -s .) & S2=$!
trap 'kill $S1 $S2' EXIT; sleep 2
sed "s#/opt/node22/lib/node_modules/playwright#$PW#" "$D/shoot.js" > "$W/shoot.js"
sed "s#/opt/node22/lib/node_modules/playwright#$PW#" "$D/render.js" > "$W/render.js"
node "$W/shoot.js" "$W/shots"     # screenshots of the real pages, filled with sample leads
node "$W/render.js" "$W/frames"   # one 1080p still per scene
cd "$W/frames"; : > list.txt
for f in s*.png; do
  case $f in s00.png) d=6;; s20.png) d=8;; s16.png|s17.png|s18.png|s19.png) d=14;; *) d=11;; esac
  ffmpeg -v error -y -loop 1 -t $d -i "$f" -vf "fps=30,format=yuv420p,fade=t=in:st=0:d=0.5,fade=t=out:st=$(echo "$d-0.5"|bc):d=0.5" \
    -c:v libx264 -preset medium -crf 18 -tune stillimage "c_$f.mp4"
  echo "file 'c_$f.mp4'" >> list.txt
done
ffmpeg -v error -y -f concat -safe 0 -i list.txt -c copy -movflags +faststart "$D/dragon-farm-dashboard-explainer.mp4"
