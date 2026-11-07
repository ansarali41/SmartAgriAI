# Device management guide

How to install, add, look after and repair SmartAgri ESP32 boards.
Current firmware: **smartagri-2.10**.

- [Quick reference](#quick-reference)
- [1. Install the software on a new board](#1-install-the-software-on-a-new-board)
- [2. Add the board to the app](#2-add-the-board-to-the-app)
- [3. Connect it to pots](#3-connect-it-to-pots)
- [4. Check if a board is working](#4-check-if-a-board-is-working)
- [5. Everyday actions](#5-everyday-actions)
- [6. Update the software](#6-update-the-software)
- [7. Repair a broken board](#7-repair-a-broken-board)
- [8. Move, replace or remove a board](#8-move-replace-or-remove-a-board)
- [Troubleshooting](#troubleshooting)

---

## Quick reference

| I want to… | Do this |
|---|---|
| Install software on a new board | Plug in by USB → `npm run flash` |
| Update a working board | Plug in by USB → `npm run flash` (keeps Wi-Fi and pairing) |
| Fix a board that won't start or connect | Plug in by USB → `npm run flash:reset`, then add it again |
| Add a board to the app | Phone → Wi-Fi **SmartAgri-Setup** → app **Devices → Add device** → press **BOOT** |
| Change the board's Wi-Fi | Hold **BOOT** for 3 s, or app card **⋮ → Reset Wi-Fi** |
| Restart a board | App card **⋮ → Restart**, or press **EN** on the board |
| Switch a board off | App card **⋮ → Turn off (sleep)**. Press **BOOT** or **EN** to wake it |
| Water another pot from the same board | App card **+ Add port**, then wire the extra probe and relay |
| Watch what the board is doing | `arduino-cli monitor -p /dev/cu.usbserial-XXXX -c baudrate=115200` |

**The two buttons on the board:**
- **BOOT:** a short press confirms pairing. Holding it for 3 s opens the Wi-Fi setup page again.
- **EN:** restarts the board.

**What the blue LED means:**

| LED | Meaning |
|---|---|
| Slow blink (about once a second) | Waiting to be added in the app |
| Fast blink | The app is adding it right now. Press **BOOT** |
| Off | Normal operation (or asleep) |

---

## 1. Install the software on a new board

**Needed once on your computer:** `arduino-cli` (`brew install arduino-cli`). The flash
script downloads the ESP32 core and libraries by itself the first time.

1. Plug the board into your computer with a **data** USB cable. Charge-only cables don't work.
2. From the project folder run:

   ```bash
   npm run flash
   ```

3. Wait for `Done.`. The first run takes a few minutes; after that it takes about a minute.

The script finds the board, builds the firmware and uploads it. If it stays on
`Connecting....`, **hold BOOT** until it starts writing.

**Several boards plugged in?** Pick one: `npm run flash -- -p /dev/cu.usbserial-10`
(`arduino-cli board list` shows the ports).

**Optional per-board settings** go in `iot/esp32/src/config.h` (copied from
`config.example.h` on the first run). Most boards don't need any changes. The usual reasons to edit it:
- the pump runs when it should be off: swap `RELAY_ON_LEVEL` / `RELAY_OFF_LEVEL`
- moisture readings are wrong: set `SOIL_RAW_DRY` / `SOIL_RAW_WET` from real readings
- you want the server address pre-filled on the setup page: set `DEFAULT_SERVER_URL`

Flash again after editing `config.h`.

---

## 2. Add the board to the app

No code needed. You do this once per board.

1. Power the board. The blue LED blinks slowly.
2. On your phone, join the Wi-Fi network **SmartAgri-Setup**. The setup page opens.
   If it doesn't, browse to `192.168.4.1`.
3. Pick your home Wi-Fi (**2.4 GHz only**) and type its password.
4. Check the **SmartAgri address**:
   - hosted app: `https://your-app.vercel.app`
   - local app: your computer's LAN IP, for example `http://192.168.1.10:3000` (not `localhost`)
5. Tap **Save**. The board joins your Wi-Fi.
6. In the app: **Devices → Add device** (or **New devices found**) → choose the board.
7. When the LED blinks fast, **press BOOT once**. The board is now in your account.

Typing the 6-digit pairing code works too. The code is shown on the setup page and in the serial
monitor, and stays the same until the board is added.

The setup page closes after 5 minutes. The board then restarts and opens it again.

---

## 3. Connect it to pots

A board starts with one port (one soil probe and one pump). Readings are only saved after
the port is connected to a pot.

1. On the board's card: **⋮ → Move or rename** (or **Assign to garden & pot**).
2. Choose the garden, then the pot for each port → **Save**.

**More pots on one board (up to 6):** on the card, tap **+ Add port N (probe + pump)**. The
new port shows which pins to wire. It says *Waiting for the board* until the board picks
it up, which takes about 10 s. You don't need to flash again.

| Port | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Soil probe signal | GPIO 36 | 39 | 34 | 35 | 32 | 33 |
| Relay IN | GPIO 5 | 18 | 19 | 21 | 22 | 23 |

To remove the extra ports, tap the **×** on the last port. This works only when no pot is connected to it.
Full wiring diagram: [MULTI_POT_SETUP.md](MULTI_POT_SETUP.md).

> Never power pumps from the ESP32. Use a separate 5 V / 12 V supply, and connect its GND to the ESP32's GND.

---

## 4. Check if a board is working

**Devices** page, board card:

| Status | Meaning |
|---|---|
| 🟢 **Online** | Reported within the last 45 s |
| 🟡 **Delayed** | 45–90 s since the last report |
| 🔴 **Offline** | Over 90 s. You also get an alert (and a Telegram message if set up) |
| **Waiting** | Added, but no first reading yet |

Each port row shows:
- **Probe:** `42%` is a live reading. `No probe` means nothing is wired, or a wire is loose.
- **Pump:** `Pump on` / `Pump off` is the relay state.
- **Pot:** the pot this port waters, or **Connect a pot**.

The board reports every 20 s, and straight away when a reading changes by 2% or more.

**Safety:** if the board can't reach the app for 60 s, it switches every pump off by itself.

**See the board's own log:** plug it in by USB and run
`arduino-cli monitor -p /dev/cu.usbserial-XXXX -c baudrate=115200`. It prints its ID,
firmware version, pairing code and any errors.

---

## 5. Everyday actions

All of these are in the board card's **⋮** menu. The board carries them out within a few seconds.
If it's offline, the request is dropped after 2 minutes.

| Action | What happens | Stays in your account? |
|---|---|---|
| **Restart** | The board reboots | Yes |
| **Reset Wi-Fi** | Forgets the Wi-Fi and opens **SmartAgri-Setup**. Use this for a new router or password | Yes, it reconnects by itself after setup |
| **Turn off (sleep)** | All pumps off, then deep sleep. Press **BOOT** or **EN** to wake | Yes |
| **Factory reset** | Wipes Wi-Fi and the device key, and **removes the board from the app** | No, add it again (step 2) |
| **Delete from app** | Removes it from the app only. Nothing changes on the board | No |

Every action switches all pumps off first.

---

## 6. Update the software

1. Pull the latest code.
2. Plug the board in by USB and run `npm run flash`.

Saved Wi-Fi, pairing and pot connections are all kept. The board comes back online by
itself, and its card shows the new firmware version.

Boards on firmware older than 2.9 can't add or remove ports from the app. Update them.

---

## 7. Repair a broken board

Signs of a broken board: it keeps restarting, the LED does nothing, it never shows up
on the Wi-Fi, or it stays offline after a normal flash.

1. Plug it in by USB and run:

   ```bash
   npm run flash:reset
   ```

   This erases **everything** on the board (software, Wi-Fi, device key) and installs fresh firmware.
2. Set it up again as in [step 2](#2-add-the-board-to-the-app).
   If the app still lists the board, it reconnects to that same entry, so its name and pots stay.

**If the upload itself fails:**
- Try another USB cable and another USB port. Charge-only cables are the most common cause.
- Hold **BOOT**, tap **EN**, release **BOOT**, then run the command again.
- Unplug the probes and relay while flashing. Something wired to GPIO 0, 2, 12 or 15 can stop the board from entering upload mode.
- Still no port in `arduino-cli board list`? Install the USB driver for the board's chip
  (CP210x or CH340). Some boards also have a hardware fault.

---

## 8. Move, replace or remove a board

| Task | Steps |
|---|---|
| **Move it to another pot or garden** | Card **⋮ → Move or rename** → pick the new pot → **Save**. No flash needed |
| **Rename it** | Card **⋮ → Move or rename** |
| **Replace a dead board** | Flash the new board (step 1) → add it (step 2) → connect it to the old board's pots. Delete the old card |
| **Give it to someone else** | Card **⋮ → Factory reset** (or `npm run flash:reset`). They then add it to their own account |
| **Stop using it** | Card **⋮ → Delete from app**, then unplug it |

A board can belong to only one account. If adding it says *registered to another account*,
the owner must factory-reset or delete it first. Each pot can have only one board. If a pot
already has one, disconnect that board first.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `No ESP32 found` when flashing | Use a data USB cable. Check `arduino-cli board list` and install the CP210x/CH340 driver |
| Upload stuck on `Connecting....` | Hold **BOOT** until it starts writing |
| **SmartAgri-Setup** Wi-Fi doesn't appear | Hold **BOOT** for 3 s. If that doesn't work, run `npm run flash:reset` |
| Board never appears in **Add device** | Wrong server address. Use the LAN IP + `:3000` (local) or the `https://` app URL. The phone and the board must use the same Wi-Fi |
| Can't join home Wi-Fi | The board supports **2.4 GHz** only. Check the password, then hold **BOOT** for 3 s to try again |
| LED blinks fast but adding fails | Press **BOOT** once within 15 s of the app asking |
| Online, but no readings on the pot | The port isn't connected to a pot. Use **⋮ → Move or rename** |
| Probe shows **No probe** | Check the probe's AO, VCC and GND wires, and that it's on the right pin for that port |
| Moisture always 0% or 100% | Calibrate `SOIL_RAW_DRY` / `SOIL_RAW_WET` in `config.h` and flash again |
| Pump runs when it should be off | Swap `RELAY_ON_LEVEL` / `RELAY_OFF_LEVEL` in `config.h` and flash again |
| Keeps going **Offline** | Weak Wi-Fi or power. Move it closer to the router and use a 2 A supply. Check the log in the serial monitor |
| New port stuck on *Waiting for the board* | Firmware older than 2.9. Run `npm run flash` |
| Anything else | Run `npm run flash:reset`, then add the board again |
