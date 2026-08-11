import { useEffect, useMemo, useRef, useState } from 'react'

function GenericLauncherIcon({ name }: { name: string }) {
  return (
    <span aria-hidden="true" className="launcher-generic-icon">
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m7 7 10 10M17 7 7 17" />
    </svg>
  )
}

function AppLauncher() {
  const [apps, setApps] = useState<LauncherApp[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const searchInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    searchInput.current?.focus()
    void window.auraline.launcher
      .list()
      .then(setApps)
      .catch(() => setError('Auraline could not read the Windows applications menu.'))
      .finally(() => setLoading(false))

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') void window.auraline.launcher.close()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const visibleApps = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    if (!normalizedQuery) return apps
    return apps.filter((app) => app.name.toLocaleLowerCase().includes(normalizedQuery))
  }, [apps, query])

  async function launch(app: LauncherApp) {
    try {
      setError(null)
      await window.auraline.apps.launch(app.id)
    } catch {
      setError(`Auraline could not open ${app.name}.`)
    }
  }

  return (
    <main className="app-launcher" aria-label="Auraline applications menu">
      <header className="launcher-header">
        <div>
          <span className="launcher-eyebrow">Auraline</span>
          <h1>Applications</h1>
        </div>
        <button
          aria-label="Close applications menu"
          className="launcher-close"
          type="button"
          onClick={() => void window.auraline.launcher.close()}
        >
          <CloseIcon />
        </button>
      </header>

      <label className="launcher-search">
        <SearchIcon />
        <span className="visually-hidden">Search applications</span>
        <input
          ref={searchInput}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search applications"
        />
      </label>

      {error && <p className="launcher-error" role="alert">{error}</p>}

      <section className="launcher-content" aria-live="polite">
        {loading && (
          <div className="launcher-loading" aria-label="Loading applications">
            {Array.from({ length: 12 }, (_, index) => (
              <span className="launcher-skeleton" key={index} />
            ))}
          </div>
        )}

        {!loading && visibleApps.length === 0 && (
          <div className="launcher-empty">
            <strong>No applications found</strong>
            <span>Try a different search.</span>
            <button type="button" onClick={() => setQuery('')}>Clear search</button>
          </div>
        )}

        {!loading && visibleApps.length > 0 && (
          <div className="launcher-grid">
            {visibleApps.map((app) => (
              <button
                className="launcher-app"
                key={app.id}
                type="button"
                onClick={() => void launch(app)}
                title={app.name}
              >
                <span className="launcher-app-icon">
                  {app.iconDataUrl ? (
                    <img alt="" draggable="false" src={app.iconDataUrl} />
                  ) : (
                    <GenericLauncherIcon name={app.name} />
                  )}
                </span>
                <span className="launcher-app-name">{app.name}</span>
                {app.pinned && <span className="launcher-pinned">In Dock</span>}
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

export default AppLauncher
