
const { spawn } = require("child_process");

const DEFAULT_SETTINGS = {
  inputMode: "mouse",
  clickSpeed: 10,
  keySpeed: 10,
  clickButton: "left",
  selectedKey: "F",
  activationKey: "F6",
  activationMode: "toggle"
};

const ALLOWED = {
  inputMode: ["mouse", "keyboard"],
  clickButton: ["left", "right", "middle", "mouse4", "mouse5"],
  selectedKey: ["F", "R", "E", "Q", "SPACE", "SHIFT", "CTRL", "ALT"],
  activationKey: ["F6", "F7", "F8", "F9", "F10", "F11", "F12", "INSERT"],
  activationMode: ["toggle", "hold"]
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

const ACTIVATION_CODES = {
  F6: 0x75,
  F7: 0x76,
  F8: 0x77,
  F9: 0x78,
  F10: 0x79,
  F11: 0x7A,
  F12: 0x7B,
  INSERT: 0x2D
};

class MacroController {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };
    this.process = null;
    this.running = false;
    this.lastError = null;
  }

  getStatus() {
    return {
      running: this.running,
      settings: { ...this.settings },
      error: this.lastError
    };
  }

  updateSettings(settings = {}) {
    const next = { ...this.settings, ...settings };

    for (const key of Object.keys(ALLOWED)) {
      if (!ALLOWED[key].includes(next[key])) {
        throw new Error("Invalid setting: " + key);
      }
    }

    for (const key of ["clickSpeed", "keySpeed"]) {
      const value = Number(next[key]);

      if (!Number.isFinite(value) || value < 1 || value > 1000) {
        throw new Error(key + " must be between 1 and 1000.");
      }

      next[key] = Math.round(value);
    }

    this.settings = next;
    return { success: true };
  }

  buildPowerShellScript() {
    const s = this.settings;

    const inputMode = s.inputMode;
    const clickSpeed = s.clickSpeed;
    const keySpeed = s.keySpeed;
    const clickButton = s.clickButton;
    const selectedKey = s.selectedKey;
    const activationCode = ACTIVATION_CODES[s.activationKey];
    const activationMode = s.activationMode;
    const outputKey = KEY_CODES[selectedKey];

    const script = `
$ErrorActionPreference = 'Stop'

try {
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class VMacroInput
{
    [StructLayout(LayoutKind.Sequential)]
    public struct MOUSEINPUT
    {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public UIntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT
    {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public UIntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Explicit)]
    public struct INPUTUNION
    {
        [FieldOffset(0)]
        public MOUSEINPUT mi;

        [FieldOffset(0)]
        public KEYBDINPUT ki;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT
    {
        public uint type;
        public INPUTUNION U;
    }

    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int vKey);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint SendInput(
        uint nInputs,
        INPUT[] pInputs,
        int cbSize
    );

    public static bool IsDown(int key)
    {
        return GetAsyncKeyState(key) < 0;
    }

    public static void Click(uint downFlag, uint upFlag, uint data)
    {
        INPUT[] inputs = new INPUT[2];

        inputs[0].type = 0;
        inputs[0].U.mi.dwFlags = downFlag;
        inputs[0].U.mi.mouseData = data;

        inputs[1].type = 0;
        inputs[1].U.mi.dwFlags = upFlag;
        inputs[1].U.mi.mouseData = data;

        Send(inputs);
    }

    public static void PressKey(int key)
    {
        INPUT[] inputs = new INPUT[2];

        inputs[0].type = 1;
        inputs[0].U.ki.wVk = (ushort)key;

        inputs[1].type = 1;
        inputs[1].U.ki.wVk = (ushort)key;
        inputs[1].U.ki.dwFlags = 2;

        Send(inputs);
    }

    private static void Send(INPUT[] inputs)
    {
        uint sent = SendInput(
            (uint)inputs.Length,
            inputs,
            Marshal.SizeOf(typeof(INPUT))
        );

        if (sent != inputs.Length)
        {
            throw new Exception("Windows did not accept all input events.");
        }
    }
}
'@

$inputMode = '${inputMode}'
$clickSpeed = ${clickSpeed}
$keySpeed = ${keySpeed}
$clickButton = '${clickButton}'
$outputKey = ${outputKey}
$activationKey = ${activationCode}
$activationMode = '${activationMode}'

$interval = if ($inputMode -eq 'mouse') {
    [Math]::Max(1, [Math]::Round(1000 / $clickSpeed))
} else {
    [Math]::Max(1, [Math]::Round(1000 / $keySpeed))
}

$mouseDown = 0
$mouseUp = 0
$mouseData = 0

switch ($clickButton) {
    'left' {
        $mouseDown = 0x0002
        $mouseUp = 0x0004
    }
    'right' {
        $mouseDown = 0x0008
        $mouseUp = 0x0010
    }
    'middle' {
        $mouseDown = 0x0020
        $mouseUp = 0x0040
    }
    'mouse4' {
        $mouseDown = 0x0080
        $mouseUp = 0x0100
        $mouseData = 1
    }
    'mouse5' {
        $mouseDown = 0x0080
        $mouseUp = 0x0100
        $mouseData = 2
    }
}

$wasDown = $false
$toggledOn = $false
$clock = [System.Diagnostics.Stopwatch]::StartNew()
$nextAction = 0

while ($true) {
    $isDown = [VMacroInput]::IsDown($activationKey)

    if ($activationMode -eq 'hold') {
        $enabled = $isDown
    } else {
        if ($isDown -and -not $wasDown) {
            $toggledOn = -not $toggledOn
        }

        $enabled = $toggledOn
    }

    $wasDown = $isDown

    if ($enabled -and $clock.ElapsedMilliseconds -ge $nextAction) {
        if ($inputMode -eq 'mouse') {
            [VMacroInput]::Click(
                [uint32]$mouseDown,
                [uint32]$mouseUp,
                [uint32]$mouseData
            )
        } else {
            [VMacroInput]::PressKey($outputKey)
        }

        $nextAction = $clock.ElapsedMilliseconds + $interval
    }

    Start-Sleep -Milliseconds 1
}
}
catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
`;

    return script;
  }

  start() {
    if (process.platform !== "win32") {
      throw new Error("V Macro requires Windows.");
    }

    if (this.running) {
      return true;
    }

    this.lastError = null;

    const script = this.buildPowerShellScript();

    const encodedScript = Buffer
      .from(script, "utf16le")
      .toString("base64");

    const worker = spawn(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        encodedScript
      ],
      {
        windowsHide: true,
        stdio: ["ignore", "ignore", "pipe"]
      }
    );

    this.process = worker;
    this.running = true;

    let errorOutput = "";

    worker.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    worker.on("error", (error) => {
      this.lastError = error.message;
      this.running = false;
      this.process = null;
    });

    worker.on("close", (code) => {
      if (this.process === worker) {
        this.process = null;
        this.running = false;

        if (code !== 0 && errorOutput.trim()) {
          this.lastError = errorOutput.trim();
        }
      }
    });

    return true;
  }

  stop() {
    if (this.process) {
      const worker = this.process;
      this.process = null;
      this.running = false;
      worker.kill();
    } else {
      this.running = false;
    }

    return false;
  }
}

module.exports = { MacroController };
