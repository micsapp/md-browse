// Module-level refs persist across page navigations (singleton state)
const _isOpen = ref(false)
const _selectedFolderId = ref(undefined) // undefined=all, null=root, string=folder id
const _folderRefreshKey = ref(0)

export function useFolderPanel() {
  return {
    isOpen: _isOpen,
    selectedFolderId: _selectedFolderId,
    folderRefreshKey: _folderRefreshKey,
    toggle: () => { _isOpen.value = !_isOpen.value },
    open: () => { _isOpen.value = true },
    close: () => { _isOpen.value = false },
    pickFolder: (id) => { _selectedFolderId.value = id },
    notifyFolderChange: () => { _folderRefreshKey.value++ },
  }
}
