import MenuBar from './components/MenuBar'

function App() {
  return (
    <div className="app-shell">
      <MenuBar />
      <main className="desktop-canvas">
        <section className="welcome-card">
          <span className="eyebrow">Auraline</span>
          <h1>Your desktop, reimagined.</h1>
          <p>
            The Electron foundation is running. Next we will design the desktop,
            dock, and widgets one piece at a time.
          </p>
          <p className="version">Foundation version {window.auraline.version}</p>
        </section>
      </main>
    </div>
  )
}

export default App
