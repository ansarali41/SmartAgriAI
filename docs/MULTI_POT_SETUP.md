# One ESP32, several pots — setup & flow

One ESP32 can serve **up to 6 pots**. Each pot (a "port") has its own **soil probe** and its
own **pump** on a relay channel. Example below: 3 pots.

## 1. Hardware

```
                    ┌──────────────── ESP32 ────────────────┐
 Soil probe 1 ──AO──▶ GPIO 36                     GPIO 5  ──▶ Relay CH1 ──▶ Pump 1 → Pot 1
 Soil probe 2 ──AO──▶ GPIO 39                     GPIO 18 ──▶ Relay CH2 ──▶ Pump 2 → Pot 2
 Soil probe 3 ──AO──▶ GPIO 34                     GPIO 19 ──▶ Relay CH3 ──▶ Pump 3 → Pot 3
 Probes VCC/GND ────▶ 3V3 / GND                   5V/GND  ──▶ Relay module VCC/GND
                    └───────────────────────────────────────┘
 Pump power: separate 5 V / 12 V supply → relay COM → NO → pump (+), pump (−) → supply GND
 Shared ground: supply GND ↔ ESP32 GND
```

| Port | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Soil probe signal | GPIO 36 | 39 | 34 | 35 | 32 | 33 |
| Relay IN | GPIO 5 | 18 | 19 | 21 | 22 | 23 |

- Use a multi-channel relay module (2 / 4 / 6 channels) — one channel per pump.
- Never power pumps from the ESP32; use a separate supply with a shared GND.
- Why 6 max: soil probes need ADC1 pins (ADC2 stops working while Wi-Fi is on).

## 2. Firmware (once)

Flash firmware **2.9+** (see the main README → "Connect a device"). That's all — the
number of ports is set in the app (step 4), no `config.h` change or re-flash needed.

Different wiring? Override the pin lists in `config.h`:
```c
#define SOIL_PINS  {36, 39, 34, 35, 32, 33}
#define RELAY_PINS {5, 18, 19, 21, 22, 23}
```
(Older firmware 2.7–2.8: set `#define PORT_COUNT 3` in `config.h` and re-flash.)

## 3. Put the board online (no code)

1. Power the board → on your phone join Wi-Fi **SmartAgri-Setup**.
2. Tap your home Wi-Fi → type its password → **Save** (the server address is pre-filled).
3. In the app: **Devices → Add device** → press **BOOT** on the board. It's now in your account.

## 4. Connect the ports to pots (in the app)

1. **Gardens** → create the garden and 3 pots, each with its plant
   (watering levels are set automatically from the plant guide).
2. **Devices** → the board's card → **+ Add port 2 (probe + pump)**, then **+ Add port 3**.
   Each new port shows the pins to wire (e.g. *probe → GPIO 39 · relay → GPIO 18*) and
   *Waiting for the board* until the board picks it up (within ~10 s). The **×** on the
   last port removes it again (only when no pot is connected to it).
3. **⋮ → Move or rename** → choose the garden, then pick a pot for each port
   (Port 1 → POT-1, Port 2 → POT-2, Port 3 → POT-3) → **Save**.

Each port row on the card shows, live:

| | Shows | Meaning |
|---|---|---|
| Probe | **42%** · **No probe** | the soil probe on that port is reading · nothing valid (no probe wired, or a loose AO/VCC/GND wire) |
| Pump | **Pump on** · **Pump off** | the relay's state (the board can't sense whether a pump is actually wired) |
| Pot | **POT-5** · **Connect a pot** | which pot that port waters |

## 5. What happens while it runs

```
Every 20 s   ESP32 reads all probes ──▶ POST /api/iot/ingest
                                         [port 1: 42%, port 2: 25%, port 3: 61%]
             Server: port → pot (from step 4) → saves each reading on its pot
                     each pot in Automatic mode: below its start level? → queue "PUMP_ON" for that pot

Every 10 s   ESP32 asks for commands ──▶ GET /api/iot/commands
             Server: "PUMP_ON, port 2" ──▶ ESP32 switches relay CH2 → only Pump 2 runs
             ESP32 confirms ──▶ app shows "Watering now" on POT-2, logs it, sends alerts

Next reading POT-2 reaches its stop level ──▶ "PUMP_OFF, port 2" ──▶ Pump 2 stops
```

- **Each pot is independent** — its own levels, its own pump, its own history in
  **Irrigation** and **Analytics**.
- **Manual mode** (Irrigation → Manual) → **Turn on / Turn off** controls just that pot's pump.
- **Alerts** (bell + Telegram): pump started / failed, dry pot in manual mode, probe not
  reading, board offline.
- A port with no pot connected is simply ignored.

## 6. Safety

- No contact with the server for **60 s** → **all pumps switch off**.
- Restart / Reset Wi-Fi / Turn off (sleep) / Factory reset → all pumps off first
  (sleep also holds them off).
- A faulty probe → that pot shows "Probe not reading" and its automatic watering pauses;
  the other pots carry on.
- One pot per port, one device per pot — the app prevents doubles and tells you when every
  port is in use.

## Alternative: one pump for several pots

One pump + one **normally-closed solenoid valve** per pot, each valve on its own relay
channel (plus one channel for the pump). Needs a small firmware option (`SHARED_PUMP_PIN`)
that isn't built yet — ask if you want it.
