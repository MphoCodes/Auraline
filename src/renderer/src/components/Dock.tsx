import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useEffect, useState } from 'react'

type DockProps = {
  shellMode: boolean
  onShellModeChange: (enabled: boolean) => void
  onStatus: (message: string) => void
}

function GenericAppIcon({ name }: { name: string }) {
  return (
    <span aria-hidden="true" className="generic-app-icon">
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

function AddIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function LauncherIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" />
      <path d="M17 13.5 20.5 20h-7L17 13.5Z" />
    </svg>
  )
}

function DesktopModeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="3.5" y="4.5" width="17" height="12" rx="2" />
      <path d="M8 20h8M12 16.5V20" />
    </svg>
  )
}

function MoreIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="19" cy="12" r="1.2" />
    </svg>
  )
}

function Dock({ shellMode, onShellModeChange, onStatus }: DockProps) {
  const [apps, setApps] = useState<DockApp[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void window.auraline.dock
      .list()
      .then(setApps)
      .catch(() => onStatus('Auraline could not load your pinned apps.'))
      .finally(() => setLoading(false))
  }, [onStatus])

  async function launchApp(dockApp: DockApp) {
    try {
      const launched = await window.auraline.apps.launch(dockApp.id)
      onStatus(`${launched.name} opened`)
    } catch (error) {
      onStatus(error instanceof Error ? error.message : `Could not open ${dockApp.name}.`)
    }
  }

  async function addApp() {
    try {
      const dockApp = await window.auraline.dock.add()
      if (!dockApp) return
      setApps((current) => {
        const withoutDuplicate = current.filter((item) => item.id !== dockApp.id)
        return [...withoutDuplicate, dockApp]
      })
      onStatus(`${dockApp.name} was added to your dock.`)
    } catch {
      onStatus('Auraline could not add that application.')
    }
  }

  async function removeApp(dockApp: DockApp) {
    try {
      setApps(await window.auraline.dock.remove(dockApp.id))
      onStatus(`${dockApp.name} was removed from your dock.`)
    } catch {
      onStatus(`Auraline could not remove ${dockApp.name}.`)
    }
  }

  async function resetDock() {
    try {
      setApps(await window.auraline.dock.reset())
      onStatus('The default dock apps were restored.')
    } catch {
      onStatus('Auraline could not restore the default dock.')
    }
  }

  return (
    <nav className="dock interactive-surface" aria-label="Auraline app dock">
      <button
        aria-label="Open Auraline applications menu"
        className="dock-tool launcher-button"
        type="button"
        onClick={() => void window.auraline.launcher.toggle()}
        title="Applications"
      >
        <LauncherIcon />
      </button>

      <span aria-hidden="true" className="dock-divider" />

      <div className="dock-apps" aria-label="Pinned applications">
        {loading && <span className="dock-loading">Loading dock…</span>}

        {!loading && apps.length === 0 && (
          <button className="dock-empty-action" type="button" onClick={() => void addApp()}>
            Add your first app
          </button>
        )}

        {apps.map((dockApp) => (
          <span className="dock-app-slot" key={dockApp.id}>
            <button
              className="dock-app"
              type="button"
              onClick={() => void launchApp(dockApp)}
              aria-label={`Open ${dockApp.name}`}
              title={dockApp.name}
            >
              <span className="dock-icon">
                {dockApp.iconDataUrl ? (
                  <img alt="" draggable="false" src={dockApp.iconDataUrl} />
                ) : (
                  <GenericAppIcon name={dockApp.name} />
                )}
              </span>
              <span className="dock-running-indicator" aria-hidden="true" />
            </button>
            <button
              aria-label={`Remove ${dockApp.name} from the dock`}
              className="dock-remove-button"
              type="button"
              onClick={() => void removeApp(dockApp)}
              title={`Remove ${dockApp.name}`}
            >
              −
            </button>
          </span>
        ))}
      </div>

      <span aria-hidden="true" className="dock-divider" />

      <button
        aria-label="Add an application to the dock"
        className="dock-tool"
        type="button"
        onClick={() => void addApp()}
        title="Add application"
      >
        <AddIcon />
      </button>

      <button
        aria-pressed={shellMode}
        aria-label={shellMode ? 'Exit Auraline desktop mode' : 'Enter Auraline desktop mode'}
        className={`dock-tool${shellMode ? ' dock-tool-active' : ''}`}
        type="button"
        onClick={() => onShellModeChange(!shellMode)}
        title={shellMode ? 'Exit desktop mode' : 'Enter desktop mode'}
      >
        <DesktopModeIcon />
      </button>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button aria-label="Dock options" className="dock-tool" type="button" title="Dock options">
            <MoreIcon />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            className="menu-popover dock-popover interactive-surface"
            side="top"
            sideOffset={12}
          >
            <DropdownMenu.Item className="menu-item" onSelect={() => void addApp()}>
              Add application…
            </DropdownMenu.Item>
            <DropdownMenu.Item className="menu-item" onSelect={() => void resetDock()}>
              Restore default apps
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </nav>
  )
}

export default Dock
