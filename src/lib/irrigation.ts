// Per-pot irrigation decision logic (pure functions): validate a pot's
// watering levels and decide whether its pump should be on or off and why.

import type { IrrigationStatus, PotIrrigationMode } from "@prisma/client";

export interface PotIrrigationConfigInput {
  irrigationMode: PotIrrigationMode;
  moistureOnThreshold: number;
  moistureOffThreshold: number;
  pumpState: IrrigationStatus;
}

export interface PotIrrigationDecision {
  pumpState: IrrigationStatus;
  changed: boolean;
  reason: PotIrrigationReason;
  message: string;
  mode: PotIrrigationMode;
}

export type PotIrrigationReason =
  | "MANUAL_MODE"
  | "SOIL_MOISTURE_UNAVAILABLE"
  | "SOIL_DRY"
  | "SOIL_MOISTURE_NORMAL";

export function validatePotIrrigationThresholds(
  moistureOnThreshold: number,
  moistureOffThreshold: number,
) {
  return (
    Number.isFinite(moistureOnThreshold) &&
    Number.isFinite(moistureOffThreshold) &&
    moistureOnThreshold >= 0 &&
    moistureOffThreshold <= 100 &&
    moistureOnThreshold < moistureOffThreshold
  );
}

export function decidePotIrrigation(params: {
  moisture: number | undefined;
  config: PotIrrigationConfigInput;
}): PotIrrigationDecision {
  const { moisture, config } = params;

  if (
    !validatePotIrrigationThresholds(
      config.moistureOnThreshold,
      config.moistureOffThreshold,
    )
  ) {
    throw new Error("moistureOnThreshold must be less than moistureOffThreshold");
  }

  if (config.irrigationMode === "MANUAL") {
    return {
      pumpState: config.pumpState,
      changed: false,
      reason: "MANUAL_MODE",
      message: "Manual mode uses the configured pump state.",
      mode: "MANUAL",
    };
  }

  if (moisture === undefined) {
    return {
      pumpState: config.pumpState,
      changed: false,
      reason: "SOIL_MOISTURE_UNAVAILABLE",
      message: "No soil moisture reading is available, so the pump state is unchanged.",
      mode: "AUTO",
    };
  }

  let nextPumpState = config.pumpState;
  let reason: PotIrrigationReason = "SOIL_MOISTURE_NORMAL";
  let message = `Soil moisture is within the configured hysteresis band (${config.moistureOnThreshold}%-${config.moistureOffThreshold}%); the pump state is unchanged.`;
  if (moisture <= config.moistureOnThreshold) {
    nextPumpState = "on";
    reason = "SOIL_DRY";
    message = `Soil moisture ${moisture}% is at or below the ON threshold ${config.moistureOnThreshold}%.`;
  } else if (moisture >= config.moistureOffThreshold) {
    nextPumpState = "off";
    reason = "SOIL_MOISTURE_NORMAL";
    message = `Soil moisture ${moisture}% is at or above the OFF threshold ${config.moistureOffThreshold}%.`;
  }

  return {
    pumpState: nextPumpState,
    changed: config.pumpState !== nextPumpState,
    reason,
    message,
    mode: "AUTO",
  };
}
