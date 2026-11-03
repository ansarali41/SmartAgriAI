/*
 * SmartAgri ESP32 node
 *
 * Sends one pot's soil moisture to /api/iot/ingest. Pump commands are fetched from
 * /api/iot/commands and acknowledged only after the relay has been changed.
 *
 * Required libraries: WiFi.h, HTTPClient.h, ArduinoJson.
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include "secrets.h"

const int SOIL_PIN = 36;   // GPIO36 / VP (ADC1); safe to use while Wi-Fi is active.
const int RELAY_PIN = 5;

const unsigned long TELEMETRY_INTERVAL_MS = 5000;
const unsigned long COMMAND_POLL_INTERVAL_MS = 2000;
#ifndef COMMUNICATION_LOSS_FAILSAFE_MS
#define COMMUNICATION_LOSS_FAILSAFE_MS 60000UL
#endif

bool pumpIsOn = false;
unsigned long lastTelemetryAt = 0;
unsigned long lastCommandPollAt = 0;
unsigned long lastServerCommunicationAt = 0;
Preferences commandStore;

int savedCommandSlot(const char *commandId) {
  for (int slot = 0; slot < 8; slot++) {
    if (commandStore.getString((String("id") + slot).c_str()) == commandId) return slot;
  }
  return -1;
}

void saveCommandResult(const char *commandId, bool success) {
  int slot = commandStore.getUInt("nextSlot", 0) % 8;
  commandStore.putString((String("id") + slot).c_str(), commandId);
  commandStore.putBool((String("ok") + slot).c_str(), success);
  commandStore.putUInt("nextSlot", (slot + 1) % 8);
}

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(" connected.");
}

void setPump(bool on) {
  // Some relay boards are active-low. RELAY_ON_LEVEL/RELAY_OFF_LEVEL in
  // secrets.h make the hardware polarity explicit instead of assuming HIGH.
  digitalWrite(RELAY_PIN, on ? RELAY_ON_LEVEL : RELAY_OFF_LEVEL);
  pumpIsOn = on;
  Serial.printf("Pump %s\n", on ? "ON" : "OFF");
}

// Calibrate these readings for the actual probe: dry air/soil and saturated
// soil/water respectively. Most capacitive probes produce a lower raw value
// when wet, hence the inverted mapping.
int readMoisturePercent() {
  int raw = analogRead(SOIL_PIN);
  int percentage = map(raw, SOIL_RAW_DRY, SOIL_RAW_WET, 0, 100);
  return constrain(percentage, 0, 100);
}

void acknowledgeCommand(const char *commandId, const char *kind, bool success = true, const char *error = nullptr) {
  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.begin(COMMANDS_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-key", DEVICE_KEY);

  StaticJsonDocument<256> body;
  body["hardwareId"] = HARDWARE_ID;
  body["commandId"] = commandId;
  body["kind"] = kind;
  body["success"] = success;
  if (error != nullptr) body["error"] = error;

  String payload;
  serializeJson(body, payload);
  int code = http.POST(payload);
  if (code >= 200 && code < 300) {
    lastServerCommunicationAt = millis();
  } else {
    Serial.printf("Command acknowledgement failed: %d\n", code);
  }
  http.end();
}

void processPendingCommands() {
  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  // `deviceId` is the registered hardware ID on the wire (not the database ID).
  String endpoint = String(COMMANDS_URL) + "?deviceId=" + HARDWARE_ID;
  http.begin(endpoint);
  http.addHeader("x-device-key", DEVICE_KEY);
  int code = http.GET();
  if (code != HTTP_CODE_OK) {
    Serial.printf("Command poll failed: %d\n", code);
    http.end();
    return;
  }
  lastServerCommunicationAt = millis();

  DynamicJsonDocument response(2048);
  DeserializationError parseError = deserializeJson(response, http.getString());
  http.end();
  if (parseError) {
    Serial.println("Invalid command response");
    return;
  }

  for (JsonObject command : response["commands"].as<JsonArray>()) {
    const char *commandId = command["id"] | "";
    const char *type = command["command"] | "";
    const char *targetPotId = command["potId"] | "";
    long sequence = command["sequence"] | 0;
    if (!commandId[0]) continue;
    acknowledgeCommand(commandId, "delivery");

    int previousSlot = savedCommandSlot(commandId);
    if (previousSlot >= 0) {
      bool priorSuccess = commandStore.getBool((String("ok") + previousSlot).c_str(), false);
      acknowledgeCommand(commandId, "execution", priorSuccess, priorSuccess ? nullptr : "Previously rejected command");
      continue;
    }

    if (String(targetPotId) != POT_ID) {
      // Commands are marked SENT by the server once polled. Explicitly fail a
      // command for another pot rather than leaving it permanently in-flight.
      Serial.printf("Command %s targets unmapped pot\n", commandId);
      saveCommandResult(commandId, false);
      acknowledgeCommand(commandId, "execution", false, "Unmapped pot");
    } else if (sequence <= commandStore.getLong("highestSeq", 0)) {
      saveCommandResult(commandId, false);
      acknowledgeCommand(commandId, "execution", false, "Stale command sequence");
    } else if (String(type) == "PUMP_ON") {
      // This is intentionally continuous: the backend issues PUMP_OFF when it
      // wants watering to stop. Do not replace this with a timed delay.
      setPump(true);
      commandStore.putLong("highestSeq", sequence);
      saveCommandResult(commandId, true);
      acknowledgeCommand(commandId, "execution", true);
    } else if (String(type) == "PUMP_OFF") {
      setPump(false);
      commandStore.putLong("highestSeq", sequence);
      saveCommandResult(commandId, true);
      acknowledgeCommand(commandId, "execution", true);
    } else {
      saveCommandResult(commandId, false);
      acknowledgeCommand(commandId, "execution", false, "Unsupported command");
    }
  }
}

void sendTelemetry() {
  const int moisture = readMoisturePercent();

  StaticJsonDocument<384> doc;
  doc["hardwareId"] = HARDWARE_ID;

  JsonArray readings = doc.createNestedArray("readings");
  JsonObject potReading = readings.createNestedObject();
  potReading["potId"] = POT_ID;
  potReading["soil_moisture"] = moisture;
  potReading["pump"] = pumpIsOn;

  String body;
  serializeJson(doc, body);

  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.begin(INGEST_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-key", DEVICE_KEY);
  int code = http.POST(body);
  if (code >= 200 && code < 300) {
    lastServerCommunicationAt = millis();
    Serial.printf("Sent moisture=%d%% pump=%s\n", moisture, pumpIsOn ? "ON" : "OFF");
  } else {
    Serial.printf("Telemetry POST failed: %d\n", code);
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  // Preload the output latch before enabling the pin so an active-low relay
  // does not briefly energize while the ESP32 boots.
  digitalWrite(RELAY_PIN, RELAY_OFF_LEVEL);
  pinMode(RELAY_PIN, OUTPUT);
  setPump(false); // Always establish the configured OFF state before Wi-Fi.
  commandStore.begin("pumpcmd", false);
  // Command sequences are numbered per pot on the server. If this board was
  // previously configured for a different pot (or another install), forget the
  // old high-water mark; otherwise every new command is rejected as stale.
  if (commandStore.getString("potId", "") != POT_ID) {
    commandStore.clear();
    commandStore.putString("potId", POT_ID);
    Serial.println("Command history reset for this pot");
  }
  connectWiFi();
  lastServerCommunicationAt = millis();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();

  const unsigned long now = millis();
  if (now - lastServerCommunicationAt >= COMMUNICATION_LOSS_FAILSAFE_MS && pumpIsOn) {
    setPump(false);
    Serial.println("Communication-loss fail-safe switched pump OFF");
  }
  if (now - lastTelemetryAt >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryAt = now;
    sendTelemetry();
  }
  if (now - lastCommandPollAt >= COMMAND_POLL_INTERVAL_MS) {
    lastCommandPollAt = now;
    processPendingCommands();
  }
}
