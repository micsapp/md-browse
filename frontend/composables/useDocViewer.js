const _modals = ref([])
let _nextUid = 0
const BASE_Z = 820

export function useDocViewer() {
  function openDoc(docId) {
    // If already open, bring to front
    const existing = _modals.value.find(m => m.docId === docId)
    if (existing) {
      focusModal(existing.uid)
      return
    }

    // Cap at 6, evict oldest
    if (_modals.value.length >= 6) _modals.value.splice(0, 1)

    let x = 80, y = 60, w = 860, h = 680
    if (import.meta.client) {
      const count = _modals.value.length
      w = Math.min(860, Math.round(window.innerWidth * 0.82))
      h = Math.min(680, Math.round(window.innerHeight * 0.78))
      x = Math.max(0, Math.round((window.innerWidth - w) / 2) + count * 28)
      y = Math.max(0, Math.round((window.innerHeight - h) / 2) + count * 28)
    }

    const maxZ = _modals.value.reduce((m, v) => Math.max(m, v.zIndex), BASE_Z)
    _modals.value.push({ uid: ++_nextUid, docId, x, y, width: w, height: h, zIndex: maxZ + 1 })
  }

  function closeDoc(uid) {
    const idx = _modals.value.findIndex(m => m.uid === uid)
    if (idx !== -1) _modals.value.splice(idx, 1)
  }

  function focusModal(uid) {
    const maxZ = _modals.value.reduce((m, v) => Math.max(m, v.zIndex), BASE_Z)
    const modal = _modals.value.find(m => m.uid === uid)
    if (modal && modal.zIndex < maxZ) modal.zIndex = maxZ + 1
  }

  function updateModal(uid, updates) {
    const modal = _modals.value.find(m => m.uid === uid)
    if (modal) Object.assign(modal, updates)
  }

  return { modals: _modals, openDoc, closeDoc, focusModal, updateModal }
}
