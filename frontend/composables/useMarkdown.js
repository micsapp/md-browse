import { marked } from 'marked'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'

let hljsConfigured = false

function ensureMarkedConfigured() {
  if (import.meta.client && !hljsConfigured) {
    marked.setOptions({
      highlight: (code, lang) => {
        if (lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value
        }
        return hljs.highlightAuto(code).value
      }
    })
    hljsConfigured = true
  }
}

export function fixSvgBlocks(md) {
  return String(md || '').replace(/<svg[\s\S]*?<\/svg>/gi, m => m.replace(/\n\s*\n/g, '\n'))
}

export function slugifyHeading(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-')
}

export function useMarkdown() {
  ensureMarkedConfigured()

  function mdToHtml(md) {
    if (!md) return ''
    const renderer = new marked.Renderer()
    const seen = Object.create(null)

    renderer.heading = function (text, level, raw) {
      let id = slugifyHeading(raw || text)
      if (!id) return `<h${level}>${text}</h${level}>\n`
      if (seen[id] !== undefined) {
        seen[id]++
        id = `${id}-${seen[id]}`
      } else {
        seen[id] = 0
      }
      return `<h${level} id="${id}">${text}</h${level}>\n`
    }

    const origCode = renderer.code.bind(renderer)
    renderer.code = function (code, infostring, escaped) {
      const lang = (infostring || '').match(/^\S*/)?.[0] || ''
      if (lang === 'mermaid') {
        const safe = String(code)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
        return `<pre class="mermaid">${safe}</pre>\n`
      }
      return origCode(code, infostring, escaped)
    }

    return marked(fixSvgBlocks(md), { renderer })
  }

  function renderDocHtml(docOrMd, docId) {
    if (!docOrMd) return ''
    let html = ''
    if (typeof docOrMd === 'string') {
      html = mdToHtml(docOrMd)
    } else {
      html = docOrMd.content_html || mdToHtml(docOrMd.content_md || '')
    }
    if (docId) {
      html = html.replace(
        /(<img\s[^>]*src=")(?!https?:|data:|\/)(.*?)(")/g,
        `$1/api/v1/documents/${docId}/assets/$2$3`
      )
    }
    return import.meta.client ? DOMPurify.sanitize(html) : html
  }

  function extractToc(md) {
    if (!md) return []
    const cleaned = String(md).replace(/```[\s\S]*?```/g, '')
    const lines = cleaned.split('\n')
    const seen = Object.create(null)
    const items = []
    for (const line of lines) {
      const m = line.match(/^(#{1,3})\s+(.+?)\s*$/)
      if (!m) continue
      const level = m[1].length
      const rawText = m[2].replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`~]/g, '').trim()
      let id = slugifyHeading(m[2])
      if (!id) continue
      if (seen[id] !== undefined) {
        seen[id]++
        id = `${id}-${seen[id]}`
      } else {
        seen[id] = 0
      }
      items.push({ id, text: rawText, level })
    }
    return items
  }

  function handleAnchorClick(e) {
    const a = e.target.closest('a[href^="#"]')
    if (!a) return
    const id = decodeURIComponent((a.getAttribute('href') || '').slice(1))
    if (!id) return
    const root = e.currentTarget || document
    const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id
    const target = root.querySelector(`[id="${escaped}"]`) || document.getElementById(id)
    if (target) {
      e.preventDefault()
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return {
    mdToHtml,
    renderDocHtml,
    extractToc,
    handleAnchorClick
  }
}
