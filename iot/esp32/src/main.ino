/*
 * SmartAgri ESP32 node — one soil probe and one pump relay per board.
 *
 * Nothing secret is compiled in:
 *  1. First boot (or hold BOOT for 3 s at any time): the board opens a Wi-Fi
 *     network "SmartAgri-Setup". Connect from a phone, pick your Wi-Fi and
 *     enter the SmartAgri server address (e.g. http://192.168.1.10:3000).
 *  2. It announces itself to the server; its blue LED blinks slowly.
 *  3. In the app: Sensors -> Add device (or "New devices found") -> choose the
 *     pot. The LED then flashes fast: press BOOT once to confirm. The board
 *     receives its device key automatically. (Typing the 6-digit pairing
 *     code shown on the setup page / Serial Monitor works too; the code stays
 *     the same across restarts until the board is claimed.)
 * The server decides which pot this board serves, so moving it to another pot
 * in the app needs no re-flashing. If the key is ever rejected (device deleted
 * in the app), the board goes back to step 2 by itself.
 *
 * Libraries: WiFiManager (tzapu) 2.x, ArduinoJson 7.x. Board: ESP32 Dev Module.
 * Optional per-board calibration lives in config.h (see config.example.h).
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <WiFiManager.h>
#include <esp_mac.h>
#if __has_include("config.h")
#include "config.h"
#endif

// --- Hardware / calibration defaults (override in config.h) ----------------
#ifndef SOIL_RAW_DRY
#define SOIL_RAW_DRY 3200  // analogRead() with the probe in dry air/soil
#endif
#ifndef SOIL_RAW_WET
#define SOIL_RAW_WET 1200  // analogRead() with the probe in water
#endif
#ifndef RELAY_ON_LEVEL
#define RELAY_ON_LEVEL HIGH  // pin level that switches the pump ON
#endif
#ifndef RELAY_OFF_LEVEL
#define RELAY_OFF_LEVEL LOW
#endif
#ifndef HTTP_TIMEOUT_MS
#define HTTP_TIMEOUT_MS 5000
#endif
#ifndef COMMUNICATION_LOSS_FAILSAFE_MS
#define COMMUNICATION_LOSS_FAILSAFE_MS 60000UL
#endif

#define FIRMWARE_VERSION "smartagri-2.4"
#define SETUP_AP_NAME "SmartAgri-Setup"

const int SOIL_PIN = 36;   // GPIO36 / VP (ADC1); safe to use while Wi-Fi is active.
const int RELAY_PIN = 5;
const int SETUP_BUTTON_PIN = 0;    // the board's BOOT button
const int LED_PIN = 2;     // on-board LED: blinks while waiting to be claimed

const unsigned long TELEMETRY_INTERVAL_MS = 5000;
const unsigned long COMMAND_POLL_INTERVAL_MS = 2000;
const unsigned long PAIR_INTERVAL_MS = 2000;
const unsigned long CONFIRM_POLL_INTERVAL_MS = 1000;
// A BOOT press counts as "yes, add me" for this long, so it works whether it
// happens just before or just after the app asks.
const unsigned long PRESS_LATCH_MS = 15000;
const unsigned long SETUP_HOLD_MS = 3000;

Preferences config;        // "cfg": server URL and device key
Preferences commandStore;  // "pumpcmd": de-duplication of pump commands

String hardwareId;
String serverUrl;
String deviceKey;
String pairSecret;
String pairCode;

bool pumpIsOn = false;
unsigned long lastTelemetryAt = 0;
unsigned long lastCommandPollAt = 0;
unsigned long lastPairAt = 0;
unsigned long lastCodePrintAt = 0;
unsigned long lastServerCommunicationAt = 0;
unsigned long bootPressedAt = 0;
unsigned long confirmUntil = 0;  // the app is waiting for a BOOT press
unsigned long pressLatchedUntil = 0;
bool bootWasDown = false;

// ---------------------------------------------------------------------------
// Identity and pairing
// ---------------------------------------------------------------------------

String makeHardwareId() {
  // Unique per board, from the factory MAC burned into the chip (readable
  // before Wi-Fi starts): e.g. ESP32-D299AC.
  uint8_t mac[6];
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  char id[16];
  snprintf(id, sizeof(id), "ESP32-%02X%02X%02X", mac[3], mac[4], mac[5]);
  return String(id);
}

String formattedCode() {
  return pairCode.substring(0, 3) + " " + pairCode.substring(3);
}

void newPairingIdentity() {
  // A fresh secret + code, kept in flash until the board is claimed so the
  // code doesn't change when the board restarts.
  char secret[33];
  for (int i = 0; i < 16; i++) sprintf(secret + i * 2, "%02x", (uint8_t)(esp_random() & 0xFF));
  pairSecret = String(secret);
  char code[7];
  sprintf(code, "%06lu", (unsigned long)(esp_random() % 1000000UL));
  pairCode = String(code);
  config.putString("pairSecret", pairSecret);
  config.putString("pairCode", pairCode);
}

void loadPairingIdentity() {
  pairSecret = config.getString("pairSecret", "");
  pairCode = config.getString("pairCode", "");
  if (pairSecret.length() != 32 || pairCode.length() != 6) newPairingIdentity();
}

void printPairingHelp() {
  Serial.println();
  Serial.println("==============================================");
  Serial.printf(" Waiting to be claimed as %s\n", hardwareId.c_str());
  Serial.printf(" Pairing code: %s\n", formattedCode().c_str());
  Serial.println(" In SmartAgri: Sensors -> Add device, then press BOOT");
  Serial.println("==============================================");
}

void forgetKey(const char *reason) {
  Serial.printf("Device key rejected (%s) - pairing again.\n", reason);
  deviceKey = "";
  config.remove("deviceKey");
  newPairingIdentity();
  confirmUntil = 0;
  printPairingHelp();
}

// ---------------------------------------------------------------------------
// Wi-Fi + server address setup page
// ---------------------------------------------------------------------------

void saveServerUrl(String value) {
  value.trim();
  if (!value.length()) return;
  if (!value.startsWith("http://") && !value.startsWith("https://")) value = "http://" + value;
  while (value.endsWith("/")) value.remove(value.length() - 1);
  serverUrl = value;
  config.putString("server", serverUrl);
}

void runWiFiSetup(bool forcePortal) {
  WiFiManager wm;
  wm.setConfigPortalTimeout(300);  // 5 minutes, then restart and try again
  wm.setConnectTimeout(20);

  String info = "<p>Hardware ID: <b>" + hardwareId + "</b>";
  if (!deviceKey.length()) {
    info += "<br>Pairing code: <b style='font-size:1.4em'>" + formattedCode() + "</b></p>";
    // After Save the phone returns to home Wi-Fi; this link then opens the
    // app's Add device guide for this board. Built live from the server field.
    info += "<p>After you tap <b>Save</b>, open SmartAgri to finish:<br>"
            "<a id='sa' style='word-break:break-all' href='#'>SmartAgri</a></p>"
            "<script>function sa(){var s=document.getElementById('server');var a=document.getElementById('sa');"
            "if(!s||!a)return;var v=s.value.trim().replace(/\/+$/,'');if(v&&v.indexOf('http')!==0)v='http://'+v;"
            "a.href=v+'/sensors?claim=" + hardwareId + "&code=" + pairCode + "';a.textContent=a.href;}"
            "document.addEventListener('input',sa);window.addEventListener('load',sa);setTimeout(sa,300);</script>";
  } else {
    info += "</p>";
  }
  // The app's "Add device" QR opens /wifi?server=<address>: fill it in for
  // the user so only Wi-Fi name and password need choosing.
  info += "<script>(function(){var q=new URLSearchParams(location.search).get('server');if(!q)return;"
          "function f(){var s=document.getElementById('server');if(s){s.value=q;if(window.sa)sa();}}"
          "document.addEventListener('DOMContentLoaded',f);setTimeout(f,200);})();</script>";
  WiFiManagerParameter infoParam(info.c_str());
  WiFiManagerParameter serverParam("server", "SmartAgri server address (e.g. http://192.168.1.10:3000)", serverUrl.c_str(), 100);
  wm.addParameter(&infoParam);
  wm.addParameter(&serverParam);

  bool needPortal = forcePortal || !serverUrl.length();
  Serial.println(needPortal ? "Opening Wi-Fi setup: connect to \"" SETUP_AP_NAME "\" from your phone."
                            : "Connecting to saved Wi-Fi...");
  bool connected = needPortal ? wm.startConfigPortal(SETUP_AP_NAME) : wm.autoConnect(SETUP_AP_NAME);
  saveServerUrl(String(serverParam.getValue()));

  if (!connected) {
    Serial.println("Wi-Fi setup timed out - restarting.");
    delay(1000);
    ESP.restart();
  }
  Serial.printf("Wi-Fi connected (%s). Server: %s\n", WiFi.localIP().toString().c_str(), serverUrl.c_str());
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

int request(const char *method, const String &path, const String &body, String *response, bool authenticated) {
  if (!serverUrl.length() || WiFi.status() != WL_CONNECTED) return -1;
  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.begin(serverUrl + path);
  if (body.length()) http.addHeader("Content-Type", "application/json");
  if (authenticated) http.addHeader("x-device-key", deviceKey);
  int code = String(method) == "GET" ? http.GET() : http.POST(body);
  if (response && code > 0) *response = http.getString();
  http.end();
  if (code >= 200 && code < 300) lastServerCommunicationAt = millis();
  return code;
}

// ---------------------------------------------------------------------------
// Pump
// ---------------------------------------------------------------------------

void setPump(bool on) {
  digitalWrite(RELAY_PIN, on ? RELAY_ON_LEVEL : RELAY_OFF_LEVEL);
  pumpIsOn = on;
  Serial.printf("Pump %s\n", on ? "ON" : "OFF");
}

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

void acknowledgeCommand(const char *commandId, const char *kind, bool success = true, const char *error = nullptr) {
  JsonDocument body;
  body["hardwareId"] = hardwareId;
  body["commandId"] = commandId;
  body["kind"] = kind;
  body["success"] = success;
  if (error != nullptr) body["error"] = error;
  String payload;
  serializeJson(body, payload);
  int code = request("POST", "/api/iot/commands", payload, nullptr, true);
  if (code == 401) forgetKey("command acknowledgement");
  else if (code < 200 || code >= 300) Serial.printf("Command acknowledgement failed: %d\n", code);
}

void processPendingCommands() {
  String response;
  int code = request("GET", "/api/iot/commands?deviceId=" + hardwareId, "", &response, true);
  if (code == 401) return forgetKey("command poll");
  if (code != 200) {
    Serial.printf("Command poll failed: %d\n", code);
    return;
  }

  JsonDocument doc;
  if (deserializeJson(doc, response)) {
    Serial.println("Invalid command response");
    return;
  }

  for (JsonObject command : doc["commands"].as<JsonArray>()) {
    const char *commandId = command["id"] | "";
    const char *type = command["command"] | "";
    const char *potId = command["potId"] | "";
    long sequence = command["sequence"] | 0;
    if (!commandId[0]) continue;
    acknowledgeCommand(commandId, "delivery");
    if (!deviceKey.length()) return;  // key was rejected mid-way

    int previousSlot = savedCommandSlot(commandId);
    if (previousSlot >= 0) {
      bool priorSuccess = commandStore.getBool((String("ok") + previousSlot).c_str(), false);
      acknowledgeCommand(commandId, "execution", priorSuccess, priorSuccess ? nullptr : "Previously rejected command");
      continue;
    }

    // Sequences are numbered per pot. The server decides which pot this board
    // serves; when that changes, start a fresh sequence for the new pot.
    if (commandStore.getString("seqPot", "") != potId) {
      commandStore.putString("seqPot", potId);
      commandStore.putLong("highestSeq", 0);
    }

    if (sequence <= commandStore.getLong("highestSeq", 0)) {
      saveCommandResult(commandId, false);
      acknowledgeCommand(commandId, "execution", false, "Stale command sequence");
    } else if (String(type) == "PUMP_ON" || String(type) == "PUMP_OFF") {
      // Continuous: the server sends PUMP_OFF when watering should stop.
      setPump(String(type) == "PUMP_ON");
      commandStore.putLong("highestSeq", sequence);
      saveCommandResult(commandId, true);
      acknowledgeCommand(commandId, "execution", true);
    } else {
      saveCommandResult(commandId, false);
      acknowledgeCommand(commandId, "execution", false, "Unsupported command");
    }
  }
}

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

// Median of several samples: ignores one-off spikes (e.g. when the relay or
// pump switches) that would otherwise flip automatic watering on and off.
int readSoilRaw() {
  const int n = 15;
  int samples[n];
  for (int i = 0; i < n; i++) {
    samples[i] = analogRead(SOIL_PIN);
    delay(4);
  }
  for (int i = 1; i < n; i++) {
    int v = samples[i], j = i - 1;
    while (j >= 0 && samples[j] > v) { samples[j + 1] = samples[j]; j--; }
    samples[j + 1] = v;
  }
  return samples[n / 2];
}

// A disconnected signal wire reads ~0, a disconnected ground ~4095. Neither is
// real soil, so report "no reading" instead of a fake 100% / 0%.
bool soilRawLooksValid(int raw) {
  return raw > 50 && raw < 4080;
}

int moisturePercent(int raw) {
  int percentage = map(raw, SOIL_RAW_DRY, SOIL_RAW_WET, 0, 100);
  return constrain(percentage, 0, 100);
}

void sendTelemetry() {
  int raw = readSoilRaw();
  bool valid = soilRawLooksValid(raw);
  int moisture = moisturePercent(raw);

  // No pot ID: the server records it on the pot this device is connected to.
  // With a faulty reading only the pump state is sent, so automatic watering
  // never acts on it.
  JsonDocument doc;
  doc["hardwareId"] = hardwareId;
  if (valid) doc["soil_moisture"] = moisture;
  doc["pump"] = pumpIsOn;
  String body;
  serializeJson(doc, body);

  String response;
  int code = request("POST", "/api/iot/ingest", body, &response, true);
  if (code == 401) return forgetKey("telemetry");
  if (code >= 200 && code < 300) {
    if (valid) Serial.printf("Sent moisture=%d%% (raw %d) pump=%s\n", moisture, raw, pumpIsOn ? "ON" : "OFF");
    else Serial.printf("Soil sensor not connected (raw %d) - check the AO/VCC/GND wires. pump=%s\n", raw, pumpIsOn ? "ON" : "OFF");
  } else if (code == 400 && response.indexOf("potId") >= 0) {
    Serial.println("Not connected to a pot yet - choose one for this device in the app.");
  } else {
    Serial.printf("Telemetry failed: %d %s\n", code, response.c_str());
  }
}

// ---------------------------------------------------------------------------
// Pairing loop
// ---------------------------------------------------------------------------

void pairStep() {
  JsonDocument doc;
  doc["hardwareId"] = hardwareId;
  doc["secret"] = pairSecret;
  doc["pairingCode"] = pairCode;
  doc["firmware"] = FIRMWARE_VERSION;
  if (millis() < pressLatchedUntil) doc["confirm"] = true;
  String body;
  serializeJson(doc, body);

  String response;
  int code = request("POST", "/api/iot/pair", body, &response, false);
  if (code != 200) {
    Serial.printf("Pairing: server not reachable at %s (%d). Hold BOOT 3 s to change it.\n", serverUrl.c_str(), code);
    return;
  }
  JsonDocument reply;
  if (deserializeJson(reply, response)) return;
  String status = String((const char *)(reply["status"] | ""));
  if (status == "confirm") {
    if (!confirmUntil) Serial.println(">>> Someone is adding this board in the app: press BOOT to confirm.");
    confirmUntil = millis() + (unsigned long)(reply["msLeft"] | 30000);
    if (millis() < pressLatchedUntil) lastPairAt = 0;  // already pressed: confirm right away
    return;
  }
  confirmUntil = 0;
  if (reply["error"].is<const char *>()) Serial.printf("Pairing: %s\n", (const char *)reply["error"]);
  if (status == "claimed") {
    deviceKey = String((const char *)(reply["deviceKey"] | ""));
    if (deviceKey.length()) {
      config.putString("deviceKey", deviceKey);
      config.remove("pairSecret");
      config.remove("pairCode");
      pressLatchedUntil = 0;
      digitalWrite(LED_PIN, LOW);
      Serial.println("Claimed! Device key saved - starting normal operation.");
      lastTelemetryAt = 0;
      lastCommandPollAt = 0;
    }
  }
}

// ---------------------------------------------------------------------------

bool bootHeldFor(unsigned long ms) {
  if (digitalRead(SETUP_BUTTON_PIN) == LOW) {
    if (!bootPressedAt) bootPressedAt = millis();
    return millis() - bootPressedAt >= ms;
  }
  bootPressedAt = 0;
  return false;
}

void setup() {
  // Preload the OFF level before enabling the pin so the pump never twitches on boot.
  digitalWrite(RELAY_PIN, RELAY_OFF_LEVEL);
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(SETUP_BUTTON_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(115200);
  delay(200);
  setPump(false);

  WiFi.mode(WIFI_STA);
  hardwareId = makeHardwareId();
  config.begin("cfg", false);
  commandStore.begin("pumpcmd", false);
  serverUrl = config.getString("server", "");
  deviceKey = config.getString("deviceKey", "");
  if (!deviceKey.length()) loadPairingIdentity();

  Serial.printf("\nSmartAgri node %s (%s)\n", hardwareId.c_str(), FIRMWARE_VERSION);
  runWiFiSetup(false);
  lastServerCommunicationAt = millis();
  if (!deviceKey.length()) printPairingHelp();
}

void loop() {
  const unsigned long now = millis();

  const bool confirming = !deviceKey.length() && confirmUntil && now < confirmUntil;

  // While unclaimed, a short BOOT press means "yes, add me". Remember it for a
  // little while so the order of press and app request doesn't matter.
  bool bootDown = digitalRead(SETUP_BUTTON_PIN) == LOW;
  if (!deviceKey.length() && bootDown && !bootWasDown) {
    pressLatchedUntil = now + PRESS_LATCH_MS;
    lastPairAt = 0;  // tell the server right away
    Serial.println("BOOT pressed - confirming...");
  }
  bootWasDown = bootDown;

  // Hold BOOT for 3 s: reopen the Wi-Fi / server setup page.
  if (!confirming && bootHeldFor(SETUP_HOLD_MS)) {
    bootPressedAt = 0;
    setPump(false);
    runWiFiSetup(true);
  }
  if (WiFi.status() != WL_CONNECTED) WiFi.reconnect();

  // Safety: never leave the pump running without hearing from the server.
  if (pumpIsOn && now - lastServerCommunicationAt >= COMMUNICATION_LOSS_FAILSAFE_MS) {
    setPump(false);
    Serial.println("Communication-loss fail-safe switched pump OFF");
  }

  if (!deviceKey.length()) {
    // Slow blink: waiting to be added. Fast blink: press BOOT to confirm.
    digitalWrite(LED_PIN, (now / (confirming ? 100 : 500)) % 2);
    if (lastPairAt == 0 || now - lastPairAt >= (confirming ? CONFIRM_POLL_INTERVAL_MS : PAIR_INTERVAL_MS)) {
      lastPairAt = now;
      pairStep();
    }
    if (!deviceKey.length() && now - lastCodePrintAt >= 30000) {
      lastCodePrintAt = now;
      printPairingHelp();
    }
    return;
  }

  if (now - lastTelemetryAt >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryAt = now;
    sendTelemetry();
  }
  if (deviceKey.length() && now - lastCommandPollAt >= COMMAND_POLL_INTERVAL_MS) {
    lastCommandPollAt = now;
    processPendingCommands();
  }
}
