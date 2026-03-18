const _isOpen = ref(false)
const _docId = ref(null)

export function useDocViewer() {
  return {
    isOpen: _isOpen,
    docId: _docId,
    openDoc: (id) => { _docId.value = id; _isOpen.value = true },
    closeDoc: () => { _isOpen.value = false; _docId.value = null },
  }
}
