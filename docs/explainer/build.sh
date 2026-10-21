#!/usr/bin/env bash
# Rebuilds docs/explainer/dragon-farm-dashboard-explainer.mp4.
# Narration: voice/nNN.mp3 per scene (ElevenLabs, voice "Blue Ashby", script in narration.txt).
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
  n=${f#s}; n=${n%.png}; v="$D/voice/n$n.mp3"
  if [ -f "$v" ]; then
    # Scene lasts as long as its narration plus a beat; card-heavy scenes get time to read.
    d=$(python3 -c "import sys;a=float(sys.argv[1]);print(round(max(a+1.6,12 if sys.argv[2] in ('16','17','18') else 6),2))" \
      "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$v")" "$n")
    ffmpeg -v error -y -loop 1 -t $d -i "$f" -i "$v" \
      -vf "fps=30,format=yuv420p,fade=t=in:st=0:d=0.5,fade=t=out:st=$(echo "$d-0.5"|bc):d=0.5" \
      -af "adelay=600|600,apad,atrim=0:$d,aformat=sample_rates=44100:channel_layouts=stereo" \
      -c:v libx264 -preset medium -crf 18 -tune stillimage -c:a aac -b:a 160k -t $d "c_$f.mp4"
  else
    case $f in s00.png) d=6;; s20.png) d=8;; s16.png|s17.png|s18.png|s19.png) d=14;; *) d=11;; esac
    ffmpeg -v error -y -loop 1 -t $d -i "$f" -f lavfi -t $d -i anullsrc=r=44100:cl=stereo \
      -vf "fps=30,format=yuv420p,fade=t=in:st=0:d=0.5,fade=t=out:st=$(echo "$d-0.5"|bc):d=0.5" \
      -c:v libx264 -preset medium -crf 18 -tune stillimage -c:a aac -b:a 160k -t $d "c_$f.mp4"
  fi
  echo "file 'c_$f.mp4'" >> list.txt
done
ffmpeg -v error -y -f concat -safe 0 -i list.txt -c copy -movflags +faststart "$D/dragon-farm-dashboard-explainer.mp4"
