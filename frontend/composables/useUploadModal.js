const _isOpen = ref(false)

export function useUploadModal() {
  return {
    isOpen: _isOpen,
    open: () => { _isOpen.value = true },
    close: () => { _isOpen.value = false },
  }
}
