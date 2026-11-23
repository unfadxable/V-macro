
const { spawn } = require("child_process");

const DEFAULT_SETTINGS = {
  clickSpeed: 10,
  keySpeed: 10,
  clickButton: "left",
  selectedKey: "F",
  activationMode: "toggle"
};

const MAX_SPEED = 1000;

const MOUSE_FLAGS = {
  left: [0x0002, 0x0004, 0],
  right: [0x0008, 0x0010, 0],
  middle: [0x0020, 0x0040, 0],
  mouse4: [0x0080, 0x0100, 1],
  mouse5: [0x0080, 0x0100, 2]
};

const KEY_CODES = {
  F: 0x46,
  R: 0x52,
  E: 0x45,
  Q: 0x51,
  SPACE: 0x20,
  SHIFT: 0x10,
  CTRL: 0x11,
  ALT: 0x12
};

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
    this.worker = null;
    this.running = false;
  }

  updateSettings(newSettings) {
    if (!newSettings || typeof newSettings !== "object") {
      throw new Error("Invalid settings.");
    }

    if ("clickSpeed" in newSettings) {
      this.settings.clickSpeed = validateSpeed(newSettings.clickSpeed);
    }

    if ("keySpeed" in newSettings) {
      this.settings.keySpeed = validateSpeed(newSettings.keySpeed);
    }

    if ("clickButton" in newSettings) {
      if (!MOUSE_FLAGS[newSettings.clickButton]) {
        throw new Error("Invalid mouse button.");
      }
      this.settings.clickButton = newSettings.clickButton;
    }

    if ("selectedKey" in newSettings) {
      const key = String(newSettings.selectedKey).toUpperCase();
      if (!KEY_CODES[key]) {
        throw new Error("Invalid key.");
      }
      this.settings.selectedKey = key;
    }

    if ("activationMode" in newSettings) {
      if (!["hold", "toggle"].includes(newSettings.activationMode)) {
        throw new Error("Invalid activation mode.");
      }
      this.settings.activationMode = newSettings.activationMode;
    }

    return { ...this.settings };
  }

  start() {
    if (this.running) return true;

    if (process.platform !== "win32") {
      throw new Error("V Macro input requires Windows.");
    }

    const mouse = MOUSE_FLAGS[this.settings.clickButton];
    const key = KEY_CODES[this.settings.selectedKey];

    const script = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public class VMacroInput {
    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT {
        public uint type;
        public InputUnion U;
    }

    [StructLayout(LayoutKind.Explicit)]
    public struct InputUnion {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct MOUSEINPUT {
        public int dx, dy;
        public uint mouseData, dwFlags, time;
        public UIntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT {
        public ushort wVk, wScan;
        public uint dwFlags, time;
        public UIntPtr dwExtraInfo;
    }

    [DllImport("user32.dll", SetLastError=true)]
    public static extern uint SendInput(
        uint count, INPUT[] inputs, int size
    );

    public static void Click(uint down, uint up, uint data) {
        INPUT[] inputs = new INPUT[2];
        inputs[0].type = 0;
        inputs[0].U.mi.dwFlags = down;
        inputs[0].U.mi.mouseData = data;
        inputs[1].type = 0;
        inputs[1].U.mi.dwFlags = up;
        inputs[1].U.mi.mouseData = data;
        SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
    }

    public static void Press(ushort vk) {
        INPUT[] inputs = new INPUT[2];
        inputs[0].type = 1;
        inputs[0].U.ki.wVk = vk;
        inputs[1].type = 1;
        inputs[1].U.ki.wVk = vk;
        inputs[1].U.ki.dwFlags = 2;
        SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
    }
}
'@

$clickDown = ${mouse[0]}
$clickUp = ${mouse[1]}
$mouseData = ${mouse[2]}
$keyCode = ${key}
$clickDelay = 1000.0 / ${this.settings.clickSpeed}
$keyDelay = 1000.0 / ${this.settings.keySpeed}

$clock = [System.Diagnostics.Stopwatch]::StartNew()
$nextClick = 0.0
$nextKey = 0.0

while ($true) {
    $now = $clock.Elapsed.TotalMilliseconds

    if ($now -ge $nextClick) {
        [VMacroInput]::Click($clickDown, $clickUp, $mouseData)
        $nextClick = $now + $clickDelay
    }

    if ($now -ge $nextKey) {
        [VMacroInput]::Press($keyCode)
        $nextKey = $now + $keyDelay
    }

    Start-Sleep -Milliseconds 1
}
`;

    const encoded = Buffer.from(script, "utf16le").toString("base64");

    this.worker = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        encoded
      ],
      { windowsHide: true, stdio: "ignore" }
    );

    this.worker.on("error", () => {
      this.running = false;
      this.worker = null;
    });

    this.worker.on("exit", () => {
      this.running = false;
      this.worker = null;
    });

    this.running = true;
    return true;
  }

  stop() {
    if (this.worker) {
      this.worker.kill();
      this.worker = null;
    }

    this.running = false;
    return true;
  }

  getStatus() {
    return {
      running: this.running,
      settings: { ...this.settings }
    };
  }
}

module.exports = { MacroController };
