const DEFAULT_SETTINGS = {
  clickSpeed: 10,
  keySpeed: 10,
  clickButton: "left",
  selectedKey: "F",
  activationMode: "toggle"
};

const MAX_SPEED = 1000;

function validateSpeed(value) {
  const speed = Number(value);

  if (!Number.isFinite(speed)) {
    throw new Error("Speed must be a number.");
  }

  return Math.max(1, Math.min(MAX_SPEED, Math.round(speed)));
}

class MacroController {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };
    this.running = false;
  }

  updateSettings(newSettings) {
    if ("clickSpeed" in newSettings) {
      this.settings.clickSpeed =
        validateSpeed(newSettings.clickSpeed);
    }

    if ("keySpeed" in newSettings) {
      this.settings.keySpeed =
        validateSpeed(newSettings.keySpeed);
    }

    if ("clickButton" in newSettings) {
      this.settings.clickButton = newSettings.clickButton;
    }

    if ("selectedKey" in newSettings) {
      this.settings.selectedKey = newSettings.selectedKey;
    }

    if ("activationMode" in newSettings) {
      this.settings.activationMode = newSettings.activationMode;
    }

    return { ...this.settings };
  }

  start() {
    this.running = true;
    return this.running;
  }

  stop() {
    this.running = false;
    return this.running;
  }

  getStatus() {
    return {
      running: this.running,
      settings: { ...this.settings }
    };
  }
}

module.exports = { MacroController };
