// Lazily render <pre class="mermaid"> blocks (emitted by the markdown renderer)
// into SVG diagrams. mermaid is dynamically imported so it stays out of the
// main bundle and only loads when a document actually contains a diagram.
let mermaidMod = null

function isDark() {
  return document.documentElement.getAttribute('data-theme') === 'dark'
}

export function useMermaid() {
  async function render(root) {
    if (!import.meta.client || !root) return
    const nodes = root.querySelectorAll('pre.mermaid:not([data-processed])')
    if (!nodes.length) return
    if (!mermaidMod) {
      mermaidMod = (await import('mermaid')).default
      mermaidMod.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: isDark() ? 'dark' : 'default',
      })
    }
    try {
      await mermaidMod.run({ nodes })
    } catch (e) {
      // On a parse error mermaid leaves the source visible; nothing more to do.
      console.warn('mermaid render failed:', e?.message || e)
    }
  }
  return { render }
}
