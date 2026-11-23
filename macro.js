
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
    this.status = "stopped";
    this.lastError = null;
  }

  getStatus() {
    return {
      status: this.status,
      running: this.status === "running",
      settings: { ...this.settings },
      error: this.lastError
    };
  }

  updateSettings(settings = {}) {
    if (this.status === "starting" || this.status === "running") {
      throw new Error("Stop V Macro before changing settings.");
    }

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
    this.lastError = null;

    return { success: true };
  }

  buildPowerShellScript() {
    const s = this.settings;

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
            throw new Exception(
                "Windows did not accept all input events."
            );
        }
    }
}
'@

$inputMode = '${s.inputMode}'
$clickSpeed = ${s.clickSpeed}
$keySpeed = ${s.keySpeed}
$clickButton = '${s.clickButton}'
$outputKey = ${KEY_CODES[s.selectedKey]}
$activationKey = ${ACTIVATION_CODES[s.activationKey]}
$activationMode = '${s.activationMode}'

if ($inputMode -eq 'mouse') {
    $interval = [Math]::Max(1, [Math]::Round(1000 / $clickSpeed))
} else {
    $interval = [Math]::Max(1, [Math]::Round(1000 / $keySpeed))
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

[Console]::WriteLine("VMACRO_READY")
[Console]::Out.Flush()

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

    if (this.status === "starting" || this.status === "running") {
      return true;
    }

    this.lastError = null;
    this.status = "starting";

    const script = this.buildPowerShellScript();

    const encodedScript = Buffer
      .from(script, "utf16le")
      .toString("base64");

    let worker;

    try {
      worker = spawn(
        "powershell.exe",
        [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-EncodedCommand",
          encodedScript
        ],
        {
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"]
        }
      );
    } catch (error) {
      this.status = "error";
      this.lastError = error.message;
      throw error;
    }

    this.process = worker;

    let outputBuffer = "";
    let errorOutput = "";
    let ready = false;

    worker.stdout.on("data", data => {
      outputBuffer += data.toString();

      if (!ready && outputBuffer.includes("VMACRO_READY")) {
        ready = true;
        if (this.process === worker) {
          this.status = "running";
        }
      }
    });

    worker.stderr.on("data", data => {
      errorOutput += data.toString();
    });

    worker.on("error", error => {
      if (this.process === worker) {
        this.process = null;
        this.status = "error";
        this.lastError = error.message;
      }
    });

    worker.on("close", code => {
      if (this.process === worker) {
        this.process = null;

        if (code !== 0) {
          this.status = "error";
          this.lastError =
            errorOutput.trim() ||
            "The Windows input process stopped unexpectedly.";
        } else {
          this.status = "stopped";
        }
      }
    });

    return true;
  }

  stop() {
    const worker = this.process;

    this.process = null;
    this.status = "stopped";

    if (worker) {
      worker.kill();
    }

    return false;
  }
}

module.exports = { MacroController };
