// Copy this file to secrets.h (which is ignored by Git) before compiling.
// Register the device from the SmartAgri Sensors page and use the returned
// one-time device key plus its registered hardware ID and mapped pot ID.

#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// Use your computer/server's LAN address, not localhost, when flashing an ESP32.
#define INGEST_URL "http://YOUR_SERVER_LAN_IP:3000/api/iot/ingest"
#define COMMANDS_URL "http://YOUR_SERVER_LAN_IP:3000/api/iot/commands"
#define DEVICE_KEY "PASTE_DEVICE_REGISTRATION_KEY_HERE"
#define HARDWARE_ID "YOUR_REGISTERED_HARDWARE_ID"
#define POT_ID "YOUR_MAPPED_POT_ID"

// Soil probe calibration. Record analogRead() in dry soil/air and in wet soil.
#define SOIL_RAW_DRY 3200
#define SOIL_RAW_WET 1200

// Relay polarity varies by module. Confirm the relay LED/click with the pump
// disconnected first. Most opto-isolated modules are active-low.
#define RELAY_ON_LEVEL HIGH
#define RELAY_OFF_LEVEL LOW

// HTTP requests should not block the main loop indefinitely.
#define HTTP_TIMEOUT_MS 5000
