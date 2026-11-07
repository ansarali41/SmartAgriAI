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
#include <WiFiClientSecure.h>
#include <time.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <WiFiManager.h>
#include <esp_mac.h>
#include <esp_sleep.h>
#include <driver/gpio.h>
#if __has_include("config.h")
#include "config.h"
#include "root_ca.h"
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
#ifndef DEFAULT_SERVER_URL
#define DEFAULT_SERVER_URL ""  // e.g. "https://your-app.vercel.app" — pre-fills the setup page
#endif
#ifndef HTTP_TIMEOUT_MS
#define HTTP_TIMEOUT_MS 10000  // HTTPS handshakes to a hosted server take longer
#endif
// How often the board reports soil moisture and asks for pump commands. Kept
// modest so one board stays well inside a free Vercel plan (~13k requests/day).
// Override in config.h, e.g. for faster readings on a local server.
#ifndef TELEMETRY_INTERVAL_MS
#define TELEMETRY_INTERVAL_MS 20000UL
#endif
// Between those reports the probes are checked every SAMPLE_INTERVAL_MS, and a
// change of REPORT_CHANGE_PERCENT or more (or a probe / pump changing state) is
// reported straight away — at most once per MIN_REPORT_GAP_MS. Readings show up
// in the app within a few seconds while the request count stays low.
#ifndef SAMPLE_INTERVAL_MS
#define SAMPLE_INTERVAL_MS 2000UL
#endif
#ifndef REPORT_CHANGE_PERCENT
#define REPORT_CHANGE_PERCENT 2
#endif
#ifndef MIN_REPORT_GAP_MS
#define MIN_REPORT_GAP_MS 3000UL
#endif
#ifndef COMMAND_POLL_INTERVAL_MS
#define COMMAND_POLL_INTERVAL_MS 10000UL
#endif
#ifndef COMMUNICATION_LOSS_FAILSAFE_MS
#define COMMUNICATION_LOSS_FAILSAFE_MS 60000UL
#endif

#define FIRMWARE_VERSION "smartagri-2.10"
#define SETUP_AP_NAME "SmartAgri-Setup"

// Ports: each pot this board serves gets a soil probe + a pump relay.
// Probes must be on ADC1 pins (36, 39, 34, 35, 32, 33) — ADC2 stops working
// while Wi-Fi is on — so one board serves at most 6 pots. PORT_COUNT is only
// the starting number: add or remove ports in the app (Devices → + Add port),
// firmware 2.9+ applies it by itself. Pins can be changed in config.h.
#ifndef PORT_COUNT
#define PORT_COUNT 1
#endif
#ifndef SOIL_PINS
#define SOIL_PINS {36, 39, 34, 35, 32, 33}
#endif
#ifndef RELAY_PINS
#define RELAY_PINS {5, 18, 19, 21, 22, 23}
#endif
const int MAX_PORTS = 6;
static_assert(PORT_COUNT >= 1 && PORT_COUNT <= MAX_PORTS, "PORT_COUNT must be 1-6");
const int SOIL_PIN_LIST[MAX_PORTS] = SOIL_PINS;
const int RELAY_PIN_LIST[MAX_PORTS] = RELAY_PINS;
const int SETUP_BUTTON_PIN = 0;    // the board's BOOT button
const int LED_PIN = 2;     // on-board LED: blinks while waiting to be claimed

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

bool pumpOn[MAX_PORTS] = {false};  // index = port - 1
// Ports in use. Starts at PORT_COUNT; the app can change it (Devices → + Add
// port) — the board then saves it and sets up the new relay pin, no re-flash.
int portCount = PORT_COUNT;
// What the last report said per port (-1 = probe not reading), and whether
// something changed that should be reported right away.
int reportedPercent[MAX_PORTS] = {-2, -2, -2, -2, -2, -2};
int probeStreak[MAX_PORTS] = {0};  // good probe readings in a row, per port
bool reportNow = false;
unsigned long lastSampleAt = 0;
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

// Styling for the board's setup page, to match the SmartAgri app.
static const char PORTAL_STYLE[] PROGMEM =
  "<meta name='theme-color' content='#0b1220'><style>"
  "body{background:#0b1220;color:#e2e8f0;font-family:-apple-system,system-ui,Segoe UI,Roboto,sans-serif;margin:0}"
  ".wrap{max-width:440px;padding:14px 16px 24px;text-align:left}"
  "h1{color:#34d399;font-size:1.4em;margin:.2em 0}h3{color:#94a3b8;font-weight:500;margin:0 0 .8em}br{display:none}"
  // Network list: compact rows with CSS signal bars (the stock icons look poor on dark).
  "div:has(>a[data-ssid]){display:flex;align-items:center;justify-content:space-between;background:#111827;"
  "border:1px solid #1f2937;border-top:0;padding:0 14px;margin:0}"
  "div:has(>a[data-ssid]):first-of-type{border-top:1px solid #1f2937;border-radius:12px 12px 0 0}"
  "div:has(>a[data-ssid]):last-of-type{border-radius:0 0 12px 12px}"
  "a[data-ssid]{flex:1;color:#f1f5f9;text-decoration:none;font-weight:600;padding:12px 0}"
  ".q{float:none;min-width:0;padding:0;width:17px;height:13px;margin-left:8px;--a:#334155;--b:#334155;--c:#334155;--d:#334155;"
  "background:linear-gradient(var(--a),var(--a)) 0 100%/3px 4px no-repeat,linear-gradient(var(--b),var(--b)) 4.5px 100%/3px 7px no-repeat,"
  "linear-gradient(var(--c),var(--c)) 9px 100%/3px 10px no-repeat,linear-gradient(var(--d),var(--d)) 13.5px 100%/3px 13px no-repeat!important}"
  ".q:after,.q:before{display:none!important}"
  ".q-1{--a:#34d399}.q-2{--a:#34d399;--b:#34d399}.q-3{--a:#34d399;--b:#34d399;--c:#34d399}"
  ".q-4{--a:#34d399;--b:#34d399;--c:#34d399;--d:#34d399}"
  // Form
  "form{margin-top:14px}label{display:block;color:#94a3b8;font-weight:600;font-size:13px;margin:10px 0 4px}"
  "label[for=s]{font-size:0}label[for=s]:after{content:'Wi-Fi name';font-size:13px}"
  "label[for=showpass]{display:inline;margin:0 0 0 6px;font-weight:500}#showpass{width:auto;margin:6px 0 0}"
  "input{width:100%;box-sizing:border-box;background:#0f172a;color:#f8fafc;border:1px solid #334155;border-radius:10px;"
  "padding:12px;font-size:16px;margin:0}input:focus{outline:2px solid #10b981;border-color:#10b981}"
  "button,.btn{display:block;width:100%;box-sizing:border-box;background:#059669;color:#fff;border:0;border-radius:12px;"
  "font-size:16px;font-weight:700;padding:13px;margin:14px 0 0;text-align:center;text-decoration:none}"
  "button:active,.btn:active{background:#047857}"
  "form[action*=refresh] button{background:none;color:#34d399;font-size:14px;font-weight:600;padding:8px;margin:4px 0 0}"
  ".wrap:has(a[data-ssid]):before{content:'Choose your Wi-Fi';display:block;color:#f1f5f9;font-weight:700;font-size:18px;margin:2px 0 10px}"
  ".next{display:block;margin-top:4px}"
  ".tip{background:#111827;border:1px solid #1f2937;border-radius:12px;padding:10px 12px;margin:14px 0 0;font-size:13px;color:#94a3b8;line-height:1.5}"
  ".code{color:#34d399;font-weight:800;font-size:18px;letter-spacing:2px;white-space:nowrap}"
  "details{margin:12px 0 0}summary{color:#94a3b8;font-size:13px;cursor:pointer}.msg{border-radius:12px}"
  "</style>";

void runWiFiSetup(bool forcePortal) {
  WiFiManager wm;
  wm.setConfigPortalTimeout(300);  // 5 minutes, then restart and try again
  wm.setConnectTimeout(20);
  wm.setTitle("SmartAgri");
  wm.setCustomHeadElement(PORTAL_STYLE);
  // Only what's needed: set up Wi-Fi (no Info / Update / Erase buttons).
  std::vector<const char *> menu = {"wifi", "exit"};
  wm.setMenu(menu);
  wm.setShowInfoUpdate(false);
  wm.setShowInfoErase(false);
  wm.setMinimumSignalQuality(20);  // hide networks too weak to use
  wm.setRemoveDuplicateAPs(true);

  if (!serverUrl.length() && strlen(DEFAULT_SERVER_URL)) serverUrl = DEFAULT_SERVER_URL;

  String info;
  if (!deviceKey.length()) {
    info += "<div class='tip'>Pairing code <span class='code'>" + formattedCode() + "</span>"
            "<span class='next'>After <b>Save</b>: SmartAgri → <b>Sensors → Add device</b>, then press <b>BOOT</b> on the board.</span>"
            "<a class='btn' id='sa' href='#' style='display:none'>Open SmartAgri</a></div>"
            // After Save the phone returns to home Wi-Fi; this button then opens
            // the app's Add device guide for this board.
            "<script>function sa(){var s=document.getElementById('server');var a=document.getElementById('sa');"
            "if(!s||!a)return;var v=s.value.trim().replace(/\\/+$/,'');if(v&&v.indexOf('http')!==0)v='http://'+v;"
            "a.href=v+'/sensors?claim=" + hardwareId + "&code=" + pairCode + "';a.style.display=v?'block':'none';}"
            "document.addEventListener('input',sa);window.addEventListener('load',sa);setTimeout(sa,300);</script>";
  } else {
    info += "<div class='tip'>Sensor " + hardwareId + " is already in your SmartAgri account.</div>";
  }
  // The app's "Add device" QR opens /wifi?server=<address>: fill it in for the user.
  info += "<script>(function(){var q=new URLSearchParams(location.search).get('server');if(!q)return;"
          "function f(){var s=document.getElementById('server');if(s){s.value=q;if(window.sa)sa();}}"
          "document.addEventListener('DOMContentLoaded',f);setTimeout(f,200);})();</script>";
  // Server address: pre-filled, so it's tucked away unless it's still empty.
  String advancedOpen = serverUrl.length() ? "<details>" : "<details open>";
  advancedOpen += "<summary>Server address</summary>";
  WiFiManagerParameter infoParam(info.c_str());
  WiFiManagerParameter advancedStart(advancedOpen.c_str());
  WiFiManagerParameter serverParam("server", "SmartAgri address", serverUrl.c_str(), 100, "placeholder='https://your-app.vercel.app' autocomplete='off'");
  WiFiManagerParameter advancedEnd("</details>");
  wm.addParameter(&infoParam);
  wm.addParameter(&advancedStart);
  wm.addParameter(&serverParam);
  wm.addParameter(&advancedEnd);

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
  syncClock();
}

// Certificate checks need the real date; the ESP32 starts at 1970.
void syncClock() {
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  const unsigned long startedAt = millis();
  while (time(nullptr) < 1700000000 && millis() - startedAt < 10000) delay(200);
  Serial.println(time(nullptr) >= 1700000000 ? "Clock synced." : "Clock not synced yet - HTTPS may fail until it is.");
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

int request(const char *method, const String &path, const String &body, String *response, bool authenticated) {
  if (!serverUrl.length() || WiFi.status() != WL_CONNECTED) return -1;
  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  // https:// (e.g. Vercel): the server's certificate is verified against the
  // root authorities in root_ca.h. http:// is for a server on your own network.
  static WiFiClientSecure secureClient;
  static WiFiClient plainClient;
  if (serverUrl.startsWith("https://")) {
    secureClient.setCACert(ROOT_CA_BUNDLE);
    http.begin(secureClient, serverUrl + path);
  } else {
    http.begin(plainClient, serverUrl + path);
  }
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

void setPump(int port, bool on) {
  if (port < 1 || port > portCount) return;
  digitalWrite(RELAY_PIN_LIST[port - 1], on ? RELAY_ON_LEVEL : RELAY_OFF_LEVEL);
  if (pumpOn[port - 1] != on) reportNow = true;
  pumpOn[port - 1] = on;
  Serial.printf("Port %d pump %s\n", port, on ? "ON" : "OFF");
}

void allPumpsOff() {
  for (int port = 1; port <= portCount; port++) {
    digitalWrite(RELAY_PIN_LIST[port - 1], RELAY_OFF_LEVEL);
    pumpOn[port - 1] = false;
  }
}

bool anyPumpOn() {
  for (int i = 0; i < portCount; i++) if (pumpOn[i]) return true;
  return false;
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

// ---------------------------------------------------------------------------
// Remote actions from the app: restart, reset Wi-Fi, sleep ("turn off"),
// factory reset. Confirmed to the server first, then carried out.
// ---------------------------------------------------------------------------

bool confirmAction(const char *action) {
  JsonDocument body;
  body["hardwareId"] = hardwareId;
  body["action"] = action;
  body["kind"] = "action";
  String payload;
  serializeJson(body, payload);
  int code = request("POST", "/api/iot/commands", payload, nullptr, true);
  if (code < 200 || code >= 300) Serial.printf("Action confirmation failed: %d\n", code);
  return code >= 200 && code < 300;
}

void runAction(const String &action) {
  if (!confirmAction(action.c_str())) return;  // retried on the next poll
  allPumpsOff();
  digitalWrite(LED_PIN, LOW);
  Serial.printf("Remote action: %s\n", action.c_str());
  delay(300);

  if (action == "RESTART") {
    ESP.restart();
  } else if (action == "RESET_WIFI") {
    // Keeps the device key: after choosing a new Wi-Fi it's still in your account.
    WiFiManager wm;
    wm.resetSettings();
    ESP.restart();
  } else if (action == "FACTORY_RESET") {
    WiFiManager wm;
    wm.resetSettings();
    config.clear();
    commandStore.clear();
    ESP.restart();
  } else if (action == "SLEEP") {
    // "Turn off": deep sleep with every relay held OFF. Press BOOT (or EN) to wake.
    for (int i = 0; i < portCount; i++) {
      digitalWrite(RELAY_PIN_LIST[i], RELAY_OFF_LEVEL);
      gpio_hold_en((gpio_num_t)RELAY_PIN_LIST[i]);
    }
    gpio_deep_sleep_hold_en();
    WiFi.disconnect(true);
    esp_sleep_enable_ext0_wakeup((gpio_num_t)SETUP_BUTTON_PIN, 0);
    Serial.println("Sleeping - press BOOT or EN to wake.");
    Serial.flush();
    esp_deep_sleep_start();
  }
}

// Switch to n ports (1-6), as chosen in the app. New relay pins start OFF;
// removed ports have their pump switched off.
void setPortCount(int n) {
  if (n < 1 || n > MAX_PORTS || n == portCount) return;
  for (int i = n; i < portCount; i++) {
    digitalWrite(RELAY_PIN_LIST[i], RELAY_OFF_LEVEL);
    pumpOn[i] = false;
  }
  for (int i = portCount; i < n; i++) {
    digitalWrite(RELAY_PIN_LIST[i], RELAY_OFF_LEVEL);
    pinMode(RELAY_PIN_LIST[i], OUTPUT);
    reportedPercent[i] = -2;
    probeStreak[i] = 0;
  }
  Serial.printf("Ports: %d -> %d (set in the app)\n", portCount, n);
  portCount = n;
  config.putInt("ports", n);
  reportNow = true;
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

  setPortCount(doc["ports"] | portCount);

  const char *action = doc["action"] | "";
  if (action[0]) {
    runAction(String(action));
    return;
  }

  for (JsonObject command : doc["commands"].as<JsonArray>()) {
    const char *commandId = command["id"] | "";
    const char *type = command["command"] | "";
    const char *potId = command["potId"] | "";
    int port = command["port"] | 1;
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

    // Sequences are numbered per pot, and each port serves one pot. When the
    // pot on a port changes, that port starts a fresh sequence.
    String seqPotKey = String("seqPot") + port, seqKey = String("hiSeq") + port;
    if (commandStore.getString(seqPotKey.c_str(), "") != potId) {
      commandStore.putString(seqPotKey.c_str(), potId);
      commandStore.putLong(seqKey.c_str(), 0);
    }

    if (port < 1 || port > portCount) {
      saveCommandResult(commandId, false);
      acknowledgeCommand(commandId, "execution", false, "This board has no such port");
    } else if (sequence <= commandStore.getLong(seqKey.c_str(), 0)) {
      saveCommandResult(commandId, false);
      acknowledgeCommand(commandId, "execution", false, "Stale command sequence");
    } else if (String(type) == "PUMP_ON" || String(type) == "PUMP_OFF") {
      // Continuous: the server sends PUMP_OFF when watering should stop.
      setPump(port, String(type) == "PUMP_ON");
      commandStore.putLong(seqKey.c_str(), sequence);
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
// *spread = how far the middle samples are apart (a floating pin jumps around).
int readSoilRaw(int pin, int *spread = nullptr) {
  const int n = 15;
  int samples[n];
  for (int i = 0; i < n; i++) {
    samples[i] = analogRead(pin);
    delay(4);
  }
  for (int i = 1; i < n; i++) {
    int v = samples[i], j = i - 1;
    while (j >= 0 && samples[j] > v) { samples[j + 1] = samples[j]; j--; }
    samples[j + 1] = v;
  }
  if (spread) *spread = samples[n - 3] - samples[2];  // ignore the 2 lowest / highest
  return samples[n / 2];
}

// A disconnected signal wire reads ~0, a disconnected ground ~4095, and an
// empty (floating) pin drifts around near 0. None of that is soil: a real
// probe reads between its in-water and in-dry-air values (SOIL_RAW_WET /
// SOIL_RAW_DRY), give or take PROBE_RAW_MARGIN. Outside that = "no probe".
#ifndef PROBE_RAW_MARGIN
#define PROBE_RAW_MARGIN 500
#endif
bool soilRawLooksValid(int raw) {
  const int wetEnd = min(SOIL_RAW_WET, SOIL_RAW_DRY) - PROBE_RAW_MARGIN;
  const int dryEnd = max(SOIL_RAW_WET, SOIL_RAW_DRY) + PROBE_RAW_MARGIN;
  return raw > 50 && raw < 4080 && raw >= wetEnd && raw <= dryEnd;
}

int moisturePercent(int raw) {
  int percentage = map(raw, SOIL_RAW_DRY, SOIL_RAW_WET, 0, 100);
  return constrain(percentage, 0, 100);
}

// An input with nothing wired "floats" and can drift into a believable value
// (e.g. a fake 100%). A real probe drives the pin: steady readings, and it
// holds up against the pin's built-in pull-down (GPIO 32/33 have one; 34-39
// don't). Anything else counts as "no probe".
#ifndef PROBE_NOISE_LIMIT
#define PROBE_NOISE_LIMIT 250  // raw ADC units between the middle samples
#endif
const int PROBE_STREAK_NEEDED = 3;  // good readings in a row before it counts

bool probeAttached(int pin, int raw, int spread) {
  if (!soilRawLooksValid(raw) || spread > PROBE_NOISE_LIMIT) return false;
  if (pin == 32 || pin == 33) {
    pinMode(pin, INPUT_PULLDOWN);
    delay(2);
    int pulled = analogRead(pin);
    pinMode(pin, INPUT);
    delay(2);
    if (pulled < 100 && raw > 300) return false;  // collapsed: nothing driving it
  }
  return true;
}

// This port's moisture %, or -1 when no probe is reading. A probe must read
// well PROBE_STREAK_NEEDED times in a row (~4 s) before it's reported, so one
// lucky noisy reading never shows up as a real value.
int readProbe(int port, int *rawOut = nullptr) {
  int pin = SOIL_PIN_LIST[port - 1], spread = 0;
  int raw = readSoilRaw(pin, &spread);
  if (rawOut) *rawOut = raw;
  if (probeAttached(pin, raw, spread)) {
    if (probeStreak[port - 1] < PROBE_STREAK_NEEDED) probeStreak[port - 1]++;
  } else {
    probeStreak[port - 1] = 0;
  }
  return probeStreak[port - 1] >= PROBE_STREAK_NEEDED ? moisturePercent(raw) : -1;
}

// True when a probe moved by REPORT_CHANGE_PERCENT or more since the last
// report, or started / stopped reading.
bool probesChanged() {
  bool changed = false;
  for (int port = 1; port <= portCount; port++) {
    int now = readProbe(port);
    int last = reportedPercent[port - 1];
    if ((now < 0) != (last < 0)) changed = true;
    if (now >= 0 && last >= 0 && abs(now - last) >= REPORT_CHANGE_PERCENT) changed = true;
  }
  return changed;
}

void sendTelemetry() {
  // One reading per port. The server records each on the pot connected to
  // that port in the app (ports with nothing connected are ignored). A faulty
  // probe sends only its pump state, so automatic watering never acts on it.
  JsonDocument doc;
  doc["hardwareId"] = hardwareId;
  doc["ports"] = portCount;
  doc["firmware"] = FIRMWARE_VERSION;
  JsonArray readings = doc["readings"].to<JsonArray>();
  int raws[MAX_PORTS], percents[MAX_PORTS];
  for (int port = 1; port <= portCount; port++) {
    int percent = readProbe(port, &raws[port - 1]);
    percents[port - 1] = percent;
    JsonObject reading = readings.add<JsonObject>();
    reading["port"] = port;
    if (percent >= 0) reading["soil_moisture"] = percent;
    reading["pump"] = pumpOn[port - 1];
    reportedPercent[port - 1] = percent;
  }
  String body;
  serializeJson(doc, body);

  String response;
  int code = request("POST", "/api/iot/ingest", body, &response, true);
  if (code == 401) return forgetKey("telemetry");
  if (code >= 200 && code < 300) {
    for (int port = 1; port <= portCount; port++) {
      int raw = raws[port - 1];
      if (percents[port - 1] >= 0) Serial.printf("Port %d: moisture=%d%% (raw %d) pump=%s\n", port, percents[port - 1], raw, pumpOn[port - 1] ? "ON" : "OFF");
      else Serial.printf("Port %d: no probe reading (raw %d) - nothing wired, or check the AO/VCC/GND wires.\n", port, raw);
    }
    if (response.indexOf("unconnectedPorts") >= 0) Serial.println("Some ports aren't connected to a pot yet - connect them in the app (Sensors).");
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
  // Coming out of sleep: release the relay pins that were held OFF.
  gpio_deep_sleep_hold_dis();
  // The port count chosen in the app (saved), so only those relay pins are driven.
  config.begin("cfg", false);
  portCount = config.isKey("ports") ? constrain(config.getInt("ports", PORT_COUNT), 1, MAX_PORTS) : PORT_COUNT;
  for (int i = 0; i < portCount; i++) {
    gpio_hold_dis((gpio_num_t)RELAY_PIN_LIST[i]);
    digitalWrite(RELAY_PIN_LIST[i], RELAY_OFF_LEVEL);
    pinMode(RELAY_PIN_LIST[i], OUTPUT);
  }
  pinMode(SETUP_BUTTON_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(115200);
  delay(200);
  allPumpsOff();

  WiFi.mode(WIFI_STA);
  hardwareId = makeHardwareId();
  commandStore.begin("pumpcmd", false);
  serverUrl = config.getString("server", "");
  deviceKey = config.getString("deviceKey", "");
  if (!deviceKey.length()) loadPairingIdentity();

  Serial.printf("\nSmartAgri node %s (%s), %d port%s\n", hardwareId.c_str(), FIRMWARE_VERSION, portCount, portCount == 1 ? "" : "s");
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
    allPumpsOff();
    runWiFiSetup(true);
  }
  if (WiFi.status() != WL_CONNECTED) WiFi.reconnect();

  // Safety: never leave a pump running without hearing from the server.
  if (anyPumpOn() && now - lastServerCommunicationAt >= COMMUNICATION_LOSS_FAILSAFE_MS) {
    allPumpsOff();
    Serial.println("Communication-loss fail-safe switched all pumps OFF");
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

  // Quick check of the probes between regular reports.
  if (!reportNow && now - lastSampleAt >= SAMPLE_INTERVAL_MS) {
    lastSampleAt = now;
    reportNow = probesChanged();
  }
  const bool due = now - lastTelemetryAt >= TELEMETRY_INTERVAL_MS;
  const bool early = reportNow && now - lastTelemetryAt >= MIN_REPORT_GAP_MS;
  if (due || early) {
    lastTelemetryAt = now;
    reportNow = false;
    sendTelemetry();
  }
  if (deviceKey.length() && now - lastCommandPollAt >= COMMAND_POLL_INTERVAL_MS) {
    lastCommandPollAt = now;
    processPendingCommands();
  }
}
