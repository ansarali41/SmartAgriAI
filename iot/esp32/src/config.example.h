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
