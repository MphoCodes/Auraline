import { net, shell } from 'electron'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import type { SystemStatus } from '../shared/contracts'
const execFileAsync = promisify(execFile)
let taskbarWatchdogStarted = false

const taskbarInterop = `
using System;
using System.Runtime.InteropServices;
public static class AuralineTaskbar {
  [DllImport("user32.dll", CharSet = CharSet.Auto)]
  public static extern IntPtr FindWindow(string className, string windowName);
  [DllImport("user32.dll", CharSet = CharSet.Auto)]
  public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr childAfter, string className, string windowName);
  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr window, int command);
}`

function taskbarPowerShellCommand(visible: boolean): string {
  const showCommand = visible ? 5 : 0
  return `Add-Type -TypeDefinition '${taskbarInterop}'; $primary = [AuralineTaskbar]::FindWindow("Shell_TrayWnd", $null); if ($primary -ne [IntPtr]::Zero) { [AuralineTaskbar]::ShowWindow($primary, ${showCommand}) | Out-Null }; $current = [IntPtr]::Zero; do { $current = [AuralineTaskbar]::FindWindowEx([IntPtr]::Zero, $current, "Shell_SecondaryTrayWnd", $null); if ($current -ne [IntPtr]::Zero) { [AuralineTaskbar]::ShowWindow($current, ${showCommand}) | Out-Null } } while ($current -ne [IntPtr]::Zero)`
}

function runPowerShell(command: string, detached = false): void {
  if (process.platform !== 'win32') return
  const child = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', command],
    { detached, stdio: 'ignore', windowsHide: true }
  )
  child.on('error', (error) => console.error('Windows taskbar command failed:', error.message))
  child.unref()
}

export function setNativeTaskbarVisible(visible: boolean): void {
  runPowerShell(taskbarPowerShellCommand(visible))
}

export function startTaskbarRestoreWatchdog(): void {
  if (taskbarWatchdogStarted || process.platform !== 'win32') return
  taskbarWatchdogStarted = true
  runPowerShell(
    `Wait-Process -Id ${process.pid} -ErrorAction SilentlyContinue; ${taskbarPowerShellCommand(true)}`,
    true
  )
}

export async function getWindowsSystemStatus(): Promise<SystemStatus> {
  const fallback: SystemStatus = {
    online: net.isOnline(),
    wifi: { connected: false, name: null, signal: null },
    battery: { available: false, level: null, charging: false }
  }

  if (process.platform !== 'win32') return fallback

  const batteryCommand =
    "$battery = Get-CimInstance -ClassName Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1 EstimatedChargeRemaining,BatteryStatus; if ($null -eq $battery) { '{}' } else { $battery | ConvertTo-Json -Compress }"

  const [wifiResult, batteryResult] = await Promise.allSettled([
    execFileAsync('netsh.exe', ['wlan', 'show', 'interfaces'], {
      windowsHide: true,
      timeout: 5_000
    }),
    execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', batteryCommand],
      { windowsHide: true, timeout: 5_000 }
    )
  ])

  if (wifiResult.status === 'fulfilled') {
    const output = wifiResult.value.stdout
    const state = output.match(/^\s*State\s*:\s*(.+)$/im)?.[1]?.trim().toLocaleLowerCase()
    const name = output.match(/^\s*SSID\s*:\s*(.+)$/im)?.[1]?.trim() ?? null
    const signalText = output.match(/^\s*Signal\s*:\s*(\d+)%/im)?.[1]
    fallback.wifi = {
      connected: state === 'connected',
      name: state === 'connected' ? name : null,
      signal: signalText ? Number(signalText) : null
    }
  }

  if (batteryResult.status === 'fulfilled') {
    try {
      const battery = JSON.parse(batteryResult.value.stdout.trim() || '{}') as {
        EstimatedChargeRemaining?: unknown
        BatteryStatus?: unknown
      }
      const level = Number(battery.EstimatedChargeRemaining)
      const status = Number(battery.BatteryStatus)
      if (Number.isFinite(level)) {
        fallback.battery = {
          available: true,
          level: Math.max(0, Math.min(100, level)),
          charging: Number.isFinite(status) && ![1, 4, 5].includes(status)
        }
      }
    } catch {
      // Keep the unavailable fallback when Windows does not report a battery.
    }
  }

  return fallback
}

export async function openLaunchTarget(target: string): Promise<void> {
  const electronError = await shell.openPath(target)
  if (!electronError) return

  if (process.platform !== 'win32') throw new Error(electronError)

  try {
    await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "$ErrorActionPreference = 'Stop'; Start-Process -FilePath $env:AURALINE_LAUNCH_TARGET"
      ],
      {
        windowsHide: true,
        timeout: 8_000,
        env: { ...process.env, AURALINE_LAUNCH_TARGET: target }
      }
    )
  } catch {
    throw new Error(electronError)
  }
}

