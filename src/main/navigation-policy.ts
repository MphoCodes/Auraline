export function isAllowedNavigation(destination: string, rendererLocation: string): boolean {
  try {
    const requested = new URL(destination)
    const renderer = new URL(rendererLocation)
    return requested.protocol === renderer.protocol && requested.host === renderer.host && requested.pathname === renderer.pathname
  } catch { return false }
}
