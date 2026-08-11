import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useEffect, useState } from 'react'

type WindowAction = 'minimize' | 'toggleMaximize' | 'close'

type MenuEntry =
  | {
      type: 'item'
      label: string
      shortcut?: string
      action?: WindowAction
      disabled?: boolean
    }
  | { type: 'separator' }

type MenuDefinition = {
  label: string
  brand?: boolean
  entries: MenuEntry[]
}

const menus: MenuDefinition[] = [
  {
    label: 'Auraline',
    brand: true,
    entries: [
      { type: 'item', label: 'About Auraline', disabled: true },
      { type: 'separator' },
      { type: 'item', label: 'Settings', shortcut: 'Ctrl+,', disabled: true },
      { type: 'separator' },
      { type: 'item', label: 'Close Auraline', shortcut: 'Alt+F4', action: 'close' }
    ]
  },
  {
    label: 'Workspace',
    entries: [
      { type: 'item', label: 'Open Launcher', shortcut: 'Alt+Space', disabled: true },
      { type: 'item', label: 'New Desktop', disabled: true },
      { type: 'separator' },
      { type: 'item', label: 'Personalize', disabled: true }
    ]
  },
  {
    label: 'View',
    entries: [
      { type: 'item', label: 'Show Desktop', disabled: true },
      { type: 'item', label: 'Toggle Widgets', disabled: true },
      { type: 'separator' },
      { type: 'item', label: 'Enter Full Screen', shortcut: 'F11', disabled: true }
    ]
  },
  {
    label: 'Go',
    entries: [
      { type: 'item', label: 'Applications', disabled: true },
      { type: 'item', label: 'Documents', disabled: true },
      { type: 'item', label: 'Downloads', disabled: true }
    ]
  },
  {
    label: 'Window',
    entries: [
      { type: 'item', label: 'Minimize', shortcut: 'Alt+F9', action: 'minimize' },
      { type: 'item', label: 'Zoom', action: 'toggleMaximize' },
      { type: 'separator' },
      { type: 'item', label: 'Close', shortcut: 'Alt+F4', action: 'close' }
    ]
  },
  {
    label: 'Help',
    entries: [
      { type: 'item', label: 'Auraline Guide', disabled: true },
      { type: 'item', label: 'Keyboard Shortcuts', disabled: true },
      { type: 'separator' },
      { type: 'item', label: 'Report an Issue', disabled: true }
    ]
  }
]

function AuralineMark() {
  return (
    <svg aria-hidden="true" className="auraline-mark" viewBox="0 0 24 24">
      <path d="M5 17.5 10.7 5h2.7L19 17.5" />
      <path d="M7.8 12.2h8.4" />
      <path className="auraline-mark-accent" d="M4 20h16" />
    </svg>
  )
}

function WifiIcon({ connected }: { connected: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4.9 9.7a11.1 11.1 0 0 1 14.2 0" />
      <path d="M7.8 13a6.6 6.6 0 0 1 8.4 0" />
      <path d="M10.7 16.2a2.1 2.1 0 0 1 2.6 0" />
      <circle cx="12" cy="19" r=".8" fill="currentColor" stroke="none" />
      {!connected && <path className="wifi-disconnected" d="m5 5 14 14" />}
    </svg>
  )
}

function BatteryIcon({ level }: { level: number }) {
  const fillWidth = Math.max(1, Math.round((level / 100) * 15))

  return (
    <svg aria-hidden="true" viewBox="0 0 28 24">
      <rect x="3" y="7" width="19" height="10" rx="2" />
      <path d="M24.5 10v4" />
      <rect className="battery-level" x="5" y="9" width={fillWidth} height="6" rx="1" />
    </svg>
  )
}

function MinimizeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M3 8.5h10" />
    </svg>
  )
}

function MaximizeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <rect x="3.5" y="3.5" width="9" height="9" rx="1" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  )
}

function useClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(interval)
  }, [])

  return {
    date: new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    }).format(now),
    time: new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    }).format(now)
  }
}

function useSystemStatus() {
  const [status, setStatus] = useState<SystemStatus | null>(null)

  useEffect(() => {
    let active = true

    async function refresh() {
      try {
        const nextStatus = await window.auraline.systemStatus.get()
        if (active) setStatus(nextStatus)
      } catch {
        if (active) {
          setStatus({
            online: false,
            wifi: { connected: false, name: null, signal: null },
            battery: { available: false, level: null, charging: false }
          })
        }
      }
    }

    void refresh()
    const interval = window.setInterval(() => void refresh(), 30_000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [])

  return status
}

function performWindowAction(action: WindowAction) {
  const controls = window.auraline.windowControls

  if (action === 'minimize') void controls.minimize()
  if (action === 'toggleMaximize') void controls.toggleMaximize()
  if (action === 'close') void controls.close()
}

function AppMenu({ label, brand, entries }: MenuDefinition) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className={`menu-trigger${brand ? ' brand-trigger' : ''}`} type="button">
          {brand && <AuralineMark />}
          <span>{label}</span>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          className="menu-popover"
          collisionPadding={10}
          sideOffset={7}
        >
          {entries.map((entry, index) => {
            if (entry.type === 'separator') {
              return <DropdownMenu.Separator className="menu-separator" key={`separator-${index}`} />
            }

            return (
              <DropdownMenu.Item
                className="menu-item"
                disabled={entry.disabled}
                key={entry.label}
                onSelect={() => entry.action && performWindowAction(entry.action)}
              >
                <span>{entry.label}</span>
                {entry.disabled ? (
                  <span className="menu-item-badge">Soon</span>
                ) : (
                  entry.shortcut && <span className="menu-shortcut">{entry.shortcut}</span>
                )}
              </DropdownMenu.Item>
            )
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function MenuBar() {
  const clock = useClock()
  const systemStatus = useSystemStatus()
  const online = systemStatus?.online ?? false
  const wifi = systemStatus?.wifi
  const battery = systemStatus?.battery
  const wifiLabel = wifi?.connected
    ? `${wifi.name ?? 'Wi-Fi'} connected${wifi.signal !== null ? ` at ${wifi.signal}% signal` : ''}`
    : online
      ? 'Online through a non-Wi-Fi connection'
      : 'Wi-Fi disconnected'

  return (
    <header className="menu-bar">
      <nav aria-label="Auraline application menu" className="application-menus">
        {menus.map((menu) => (
          <AppMenu {...menu} key={menu.label} />
        ))}
      </nav>

      <div className="menu-drag-region" />

      <div aria-label="System status" className="system-status">
        <span
          className={`ready-status${systemStatus && !online ? ' ready-status-offline' : ''}`}
          title={online ? 'Windows reports an internet connection' : 'Windows reports no internet connection'}
        >
          <span aria-hidden="true" className="ready-dot" />
          {systemStatus ? (online ? 'Online' : 'Offline') : 'Checking'}
        </span>
        <span aria-label={wifiLabel} className="status-icon" role="img" title={wifiLabel}>
          <WifiIcon connected={wifi?.connected ?? false} />
        </span>
        {battery?.available && battery.level !== null && (
          <span
            aria-label={`Battery at ${battery.level} percent${battery.charging ? ', charging' : ''}`}
            className="status-icon battery-status"
            role="img"
            title={`Battery ${battery.level}%${battery.charging ? ' — charging' : ''}`}
          >
            <BatteryIcon level={battery.level} />
            <span>{battery.level}%{battery.charging ? ' ·' : ''}</span>
          </span>
        )}
        <time className="menu-clock" dateTime={new Date().toISOString()}>
          <span>{clock.date}</span>
          <strong>{clock.time}</strong>
        </time>
      </div>

      <div aria-label="Window controls" className="window-controls">
        <button
          aria-label="Minimize Auraline"
          className="window-control"
          onClick={() => performWindowAction('minimize')}
          title="Minimize"
          type="button"
        >
          <MinimizeIcon />
        </button>
        <button
          aria-label="Maximize or restore Auraline"
          className="window-control"
          onClick={() => performWindowAction('toggleMaximize')}
          title="Maximize or restore"
          type="button"
        >
          <MaximizeIcon />
        </button>
        <button
          aria-label="Close Auraline"
          className="window-control window-control-close"
          onClick={() => performWindowAction('close')}
          title="Close"
          type="button"
        >
          <CloseIcon />
        </button>
      </div>
    </header>
  )
}

export default MenuBar
