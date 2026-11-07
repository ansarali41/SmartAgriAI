// Optional per-board settings. Copy to config.h (ignored by Git) to override
// the defaults in main.ino. Wi-Fi, server address and the device key are NOT
// set here — the board asks for them on its "SmartAgri-Setup" page and
// receives its key when you claim it in the app.

// Soil probe calibration: analogRead(36) with the probe in dry air, and in water.
#define SOIL_RAW_DRY 3200
#define SOIL_RAW_WET 1200

// Relay polarity: the pin level that switches the pump ON. Test with the pump
// disconnected first; many opto-isolated relay boards are active-LOW.
#define RELAY_ON_LEVEL HIGH
#define RELAY_OFF_LEVEL LOW

// Reporting rate (defaults: soil every 20 s, pump commands every 10 s — sized
// for a free Vercel plan). For a local server you can go faster:
// #define TELEMETRY_INTERVAL_MS 5000UL
// #define COMMAND_POLL_INTERVAL_MS 2000UL
// A moisture change is reported at once (checked every 2 s, sent when a probe
// moves by 2% or more, at most every 3 s), so the app stays quick without
// raising the regular rate. Tune if needed:
// #define SAMPLE_INTERVAL_MS 2000UL
// #define REPORT_CHANGE_PERCENT 2
// #define MIN_REPORT_GAP_MS 3000UL

// Your SmartAgri address, pre-filled on the setup page so users only choose
// Wi-Fi + password. E.g. the live site or a server on your network:
// #define DEFAULT_SERVER_URL "https://your-app.vercel.app"

// How many pots this board serves at first (1-6). Each port = one soil probe + one
// pump relay. With firmware 2.9+ you can add / remove ports later in the app instead.
//   Port:        1   2   3   4   5   6
//   Soil probe:  36  39  34  35  32  33   (ADC1 pins only - ADC2 doesn't work with Wi-Fi)
//   Relay IN:    5   18  19  21  22  23
// #define PORT_COUNT 3
// Different wiring? List the pins in port order:
// #define SOIL_PINS {36, 39, 34, 35, 32, 33}
// #define RELAY_PINS {5, 18, 19, 21, 22, 23}
