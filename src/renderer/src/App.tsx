import { useCallback, useEffect, useState } from 'react'
import Dock from './components/Dock'
import MenuBar from './components/MenuBar'

function ShellMenuSurface() {
  return (
    <div className="shell-surface shell-menu-surface">
      <MenuBar />
    </div>
  )
}

function ShellDockSurface() {
  return (
    <div className="shell-surface shell-dock-surface">
      <Dock
        shellMode
        onShellModeChange={(enabled) => void window.auraline.shellMode.set(enabled)}
        onStatus={() => undefined}
      />
    </div>
  )
}

function ControlCenter() {
  const [launchMessage, setLaunchMessage] = useState('Dock ready')
  const [shellMode, setShellMode] = useState(false)
  const [startup, setStartup] = useState<StartupState>({ available: false, enabled: false })

  const updateStatus = useCallback((message: string) => setLaunchMessage(message), [])

  useEffect(() => {
    void Promise.all([window.auraline.shellMode.get(), window.auraline.startup.get()]).then(
      ([currentShellMode, startupState]) => {
        setShellMode(currentShellMode)
        setStartup(startupState)
      }
    )

    return window.auraline.shellMode.onChanged(setShellMode)
  }, [])

  async function changeShellMode(enabled: boolean) {
    try {
      setShellMode(await window.auraline.shellMode.set(enabled))
      setLaunchMessage(enabled ? 'Desktop mode enabled' : 'Desktop mode exited')
    } catch {
      setLaunchMessage('Auraline could not change desktop mode.')
    }
  }

  async function changeStartup(enabled: boolean) {
    try {
      const nextStartup = await window.auraline.startup.set(enabled)
      setStartup(nextStartup)
      setLaunchMessage(
        nextStartup.available
          ? enabled
            ? 'Auraline will start when you sign in.'
            : 'Automatic startup was disabled.'
          : 'Startup becomes available after Auraline is packaged as an installer.'
      )
    } catch {
      setLaunchMessage('Auraline could not update the startup setting.')
    }
  }

  return (
    <div className={`app-shell${shellMode ? ' shell-mode' : ''}`}>
      <div className="interactive-surface">
        <MenuBar />
      </div>

      <main className="desktop-canvas">
        <section className="welcome-card">
          <span className="eyebrow">Auraline Desktop</span>
          <h1>Your Windows shell, reimagined.</h1>
          <p>
            Pin the applications you use, launch them from the dock, and switch
            into desktop mode when you want Auraline to stay above your workspace.
          </p>

          <div className="desktop-settings" aria-label="Desktop settings">
            <div>
              <strong>Desktop mode</strong>
              <span>Keep the Auraline menu and dock available over Windows.</span>
            </div>
            <button
              aria-pressed={shellMode}
              className="setting-toggle"
              type="button"
              onClick={() => void changeShellMode(!shellMode)}
            >
              {shellMode ? 'On' : 'Off'}
            </button>

            <div>
              <strong>Start with Windows</strong>
              <span>
                {startup.available
                  ? 'Open Auraline automatically after sign-in.'
                  : 'Available when the installable EXE is created.'}
              </span>
            </div>
            <button
              aria-pressed={startup.enabled}
              className="setting-toggle"
              disabled={!startup.available}
              type="button"
              onClick={() => void changeStartup(!startup.enabled)}
            >
              {startup.enabled ? 'On' : 'Off'}
            </button>
          </div>

          <p className="version">Foundation version {window.auraline.version}</p>
        </section>
      </main>

      <Dock
        shellMode={shellMode}
        onShellModeChange={(enabled) => void changeShellMode(enabled)}
        onStatus={updateStatus}
      />

      <p className="launch-message" role="status" aria-live="polite">
        {launchMessage}
      </p>
    </div>
  )
}

function App() {
  const surface = new URLSearchParams(window.location.search).get('surface')
  if (surface === 'menu') return <ShellMenuSurface />
  if (surface === 'dock') return <ShellDockSurface />
  return <ControlCenter />
}

export default App
