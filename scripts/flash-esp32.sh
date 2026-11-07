#!/usr/bin/env bash
# Flash the SmartAgri firmware to an ESP32 over USB.
#
#   npm run flash            # new board, or update an existing one (keeps Wi-Fi + pairing)
#   npm run flash:reset      # broken board: wipe ALL flash first, then install fresh
#   npm run flash -- -p /dev/cu.usbserial-XXXX   # pick the port yourself
#
# If the upload can't connect: hold the board's BOOT button until "Writing..." appears.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/iot/esp32/src"
BUILD="${TMPDIR:-/tmp}/smartagri_node"
FQBN_BASE="esp32:esp32:esp32"
ERASE=none
PORT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --erase|--reset) ERASE=all ;;
    -p|--port) PORT="$2"; shift ;;
    -h|--help) sed -n 2,8p "$0"; exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
  shift
done

command -v arduino-cli >/dev/null || { echo "Install arduino-cli first:  brew install arduino-cli"; exit 1; }

echo "==> Checking ESP32 core and libraries (first run downloads them)"
arduino-cli core list | grep -q '^esp32:esp32' || { arduino-cli core update-index; arduino-cli core install esp32:esp32; }
arduino-cli lib install "ArduinoJson@7.4.3" "WiFiManager@2.0.17" >/dev/null

# Find the USB serial port (ignores Bluetooth/debug ports).
if [[ -z "$PORT" ]]; then
  PORTS=$(ls /dev/cu.usbserial* /dev/cu.SLAB_USBtoUART* /dev/cu.wchusbserial* /dev/cu.usbmodem* /dev/ttyUSB* /dev/ttyACM* 2>/dev/null || true)
  COUNT=$(printf '%s' "$PORTS" | grep -c . || true)
  if [[ "$COUNT" -eq 0 ]]; then
    echo "No ESP32 found. Plug it in with a DATA USB cable (not charge-only) and retry."
    exit 1
  elif [[ "$COUNT" -gt 1 ]]; then
    echo "Several boards found — pick one with -p:"; echo "$PORTS"; exit 1
  fi
  PORT="$PORTS"
fi
echo "==> Board on $PORT"

# Assemble the sketch folder (arduino-cli needs folder name == .ino name).
[[ -f "$SRC/config.h" ]] || { cp "$SRC/config.example.h" "$SRC/config.h"; echo "==> Created config.h from config.example.h"; }
rm -rf "$BUILD" && mkdir -p "$BUILD"
cp "$SRC/main.ino" "$BUILD/smartagri_node.ino"
cp "$SRC/config.h" "$SRC/root_ca.h" "$BUILD/"

echo "==> Compiling"
arduino-cli compile --fqbn "$FQBN_BASE" "$BUILD"

[[ "$ERASE" == all ]] && echo "==> Erasing the whole flash (saved Wi-Fi and device key are wiped)"
echo "==> Uploading (hold BOOT if it says 'Connecting....' for long)"
arduino-cli upload --fqbn "$FQBN_BASE:UploadSpeed=115200,EraseFlash=$ERASE" -p "$PORT" "$BUILD"

echo
echo "Done. Next:"
if [[ "$ERASE" == all ]]; then
  echo "  1. Join Wi-Fi 'SmartAgri-Setup' on your phone, pick your Wi-Fi + server address."
  echo "  2. App: Devices -> Add device, press BOOT on the board when asked."
  echo "     (If the app still lists this board, it reconnects to that same entry.)"
else
  echo "  New board: join Wi-Fi 'SmartAgri-Setup' on your phone, then App -> Devices -> Add device."
  echo "  Existing board: it reconnects by itself with its saved Wi-Fi and pairing."
fi
echo "  Watch logs:  arduino-cli monitor -p $PORT -c baudrate=115200"
