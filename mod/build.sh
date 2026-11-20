#!/usr/bin/env bash
# Builds the companion mod against the installed Hytale server: mod/out/SkinEditor-<version>.jar
set -euo pipefail
B="$(cd "$(dirname "$0")" && pwd)"
JDK="${JDK:-/c/Program Files/Eclipse Adoptium/jdk-25.0.4.101-hotspot/bin}"
S="${HYTALE_SERVER_JAR:-$APPDATA/Hytale/install/release/package/game/latest/Server/HytaleServer.jar}"
V=$(python -c "import json,sys;print(json.load(open(sys.argv[1]))['Version'])" "$B/src/manifest.json")
rm -rf "$B/classes" && mkdir -p "$B/classes" "$B/out"
mapfile -t SRC < <(find "$B/src" -name '*.java')
"$JDK/javac.exe" --release 25 -Xlint:-removal -cp "$S" -d "$B/classes" "${SRC[@]}"
python -I - "$B" "$V" <<'EOF'
import os, sys, zipfile
b, v = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(os.path.join(b, "out", f"SkinEditor-{v}.jar"), "w", zipfile.ZIP_DEFLATED) as z:
    z.write(os.path.join(b, "src", "manifest.json"), "manifest.json")
    for r, _, fs in os.walk(os.path.join(b, "classes")):
        for f in fs:
            p = os.path.join(r, f); z.write(p, os.path.relpath(p, os.path.join(b, "classes")))
EOF
echo "built out/SkinEditor-$V.jar"
