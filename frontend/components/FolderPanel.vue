<template>
  <Teleport to="body">
    <div v-if="panel.isOpen.value" class="folder-overlay" @click="panel.close()"></div>

    <aside class="folder-panel" :class="{ open: panel.isOpen.value }" :style="desktopWidth" aria-label="Folder explorer">
      <div class="fp-header">
        <div class="fp-header-title">
          <svg class="ui-icon" aria-hidden="true"><use href="#ui-folder"/></svg>
          <span class="fp-title">Folders</span>
        </div>
        <div class="fp-header-actions">
          <button v-if="auth.user" type="button" class="btn btn-xs btn-soft" @click="startCreate">
            <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-plus"/></svg>
            New
          </button>
          <button type="button" class="fp-close" aria-label="Close folders" @click="panel.close()">
            <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-close"/></svg>
          </button>
        </div>
      </div>

      <!-- Quick filter inside folder explorer -->
      <div class="fp-filter">
        <svg class="ui-icon ui-icon--sm fp-filter-icon" aria-hidden="true"><use href="#ui-search"/></svg>
        <input v-model="filterQuery" type="search" placeholder="Filter folders or docs…" />
      </div>

      <div v-if="creatingInFolder === 'root'" class="inline-create">
        <input
          v-model="newFolderName"
          class="input-control"
          placeholder="New root folder name…"
          autofocus
          @keyup.enter="submitCreate(null)"
          @keyup.esc="cancelCreate"
        />
        <button type="button" class="btn btn-xs btn-primary" @click="submitCreate(null)">Add</button>
        <button type="button" class="btn btn-xs" @click="cancelCreate">Cancel</button>
      </div>

      <div class="fp-scroll">
        <!-- Virtual views -->
        <div
          class="fp-row"
          :class="{ active: panel.selectedFolderId.value === undefined }"
          @click="handlePickFolder(undefined)"
        >
          <svg class="ui-icon ui-icon--sm fp-row-icon" aria-hidden="true"><use href="#ui-grid"/></svg>
          <span class="fp-name">All Documents</span>
          <span class="fp-count">{{ allDocuments?.length || 0 }}</span>
        </div>

        <div
          class="fp-row"
          :class="{ active: panel.selectedFolderId.value === null }"
          @click="handlePickFolder(null)"
        >
          <svg class="ui-icon ui-icon--sm fp-row-icon" aria-hidden="true"><use href="#ui-folder"/></svg>
          <span class="fp-name">Root (Unfiled)</span>
          <span class="fp-count">{{ rootDocCount }}</span>
        </div>

        <div v-if="flatFolders.length" class="fp-section-label">Folder Hierarchy</div>

        <template v-for="item in filteredFolders" :key="item.id">
          <div
            class="fp-row"
            :class="{ active: panel.selectedFolderId.value === item.id }"
            :style="{ paddingLeft: (12 + item.depth * 18) + 'px' }"
            @click="handlePickFolder(item.id)"
          >
            <svg class="ui-icon ui-icon--sm fp-row-icon" aria-hidden="true"><use href="#ui-folder"/></svg>
            <span class="fp-name">{{ item.name }}</span>
            <span class="fp-count">{{ folderDocCounts[item.id] || 0 }}</span>
            <div v-if="auth.user" class="fp-actions" @click.stop>
              <button type="button" class="btn-icon" title="Folder actions" @click="toggleFolderMenu(item.id)">···</button>
              <div v-if="folderMenuOpen === item.id" class="fp-menu">
                <button type="button" @click="startRename(item)">Rename folder</button>
                <button type="button" @click="startCreateChild(item.id)">Add subfolder</button>
                <button
                  v-if="!nonEmptyFolderIds.has(item.id)"
                  type="button"
                  class="danger"
                  @click="handleDeleteFolder(item.id)"
                >
                  Delete folder
                </button>
              </div>
            </div>
          </div>

          <div
            v-for="doc in docsInFolder(item.id)"
            :key="doc.id"
            class="fp-doc"
            :style="{ paddingLeft: (28 + item.depth * 18) + 'px' }"
          >
            <a href="#" @click.prevent="openDocInViewer(doc.id)">
              <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-doc"/></svg>
              <span>{{ doc.title }}</span>
            </a>
          </div>

          <div
            v-if="creatingInFolder === item.id"
            class="inline-create"
            :style="{ paddingLeft: (16 + (item.depth + 1) * 18) + 'px' }"
          >
            <input
              v-model="newFolderName"
              class="input-control"
              placeholder="Subfolder name…"
              autofocus
              @keyup.enter="submitCreate(item.id)"
              @keyup.esc="cancelCreate"
            />
            <button type="button" class="btn btn-xs btn-primary" @click="submitCreate(item.id)">Add</button>
            <button type="button" class="btn btn-xs" @click="cancelCreate">✕</button>
          </div>
        </template>

        <template v-if="docsInFolder(null).length">
          <div class="fp-section-label">Unfiled Documents</div>
          <div v-for="doc in docsInFolder(null)" :key="doc.id" class="fp-doc" style="padding-left: 20px;">
            <a href="#" @click.prevent="openDocInViewer(doc.id)">
              <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-doc"/></svg>
              <span>{{ doc.title }}</span>
            </a>
          </div>
        </template>
      </div>

      <!-- Resize handle (desktop only) -->
      <div class="fp-resize-handle" @mousedown.prevent="startResize"></div>
    </aside>

    <!-- Rename modal -->
    <div v-if="renamingFolder" class="modal-backdrop" @click.self="cancelRename">
      <div class="modal-card">
        <div class="modal-card-header">
          <h3>Rename Folder</h3>
          <button type="button" class="btn btn-xs btn-ghost" @click="cancelRename">✕</button>
        </div>
        <div class="modal-card-body">
          <input
            ref="renameInput"
            v-model="renameValue"
            class="input-control"
            placeholder="Folder name"
            @keyup.enter="confirmRename"
            @keyup.esc="cancelRename"
          />
        </div>
        <div class="modal-card-footer">
          <button type="button" class="btn btn-sm" @click="cancelRename">Cancel</button>
          <button type="button" class="btn btn-sm btn-primary" @click="confirmRename">Save Changes</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
const panel = useFolderPanel()
const docViewer = useDocViewer()
const api = useApi()
const route = useRoute()
const router = useRouter()
const auth = useAuth()

const filterQuery = ref('')

// ── Resizable width (desktop only) ───────────────────────────────────────────
const DEFAULT_WIDTH = 310
const panelWidth = ref(import.meta.client ? (parseInt(localStorage.getItem('fpWidth')) || DEFAULT_WIDTH) : DEFAULT_WIDTH)
const desktopWidth = computed(() => {
  if (import.meta.client && window.innerWidth <= 768) return {}
  return { width: panelWidth.value + 'px' }
})

let resizing = false, resizeStartX = 0, resizeStartW = 0
function startResize(e) {
  if (import.meta.client && window.innerWidth <= 768) return
  resizing = true; resizeStartX = e.clientX; resizeStartW = panelWidth.value
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeUp)
}
function onResizeMove(e) {
  if (!resizing) return
  panelWidth.value = Math.max(240, Math.min(600, resizeStartW + (e.clientX - resizeStartX)))
}
function onResizeUp() {
  resizing = false
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeUp)
  if (import.meta.client) localStorage.setItem('fpWidth', panelWidth.value)
}
onUnmounted(() => {
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeUp)
})

// ── Data ──────────────────────────────────────────────────────────────────────
const { data: allFolders, refresh: refreshFolders } = await useAsyncData('fp-folders', async () => {
  if (import.meta.server || !auth.isLoggedIn) return []
  try { return await api.getFolders() } catch { return [] }
}, { default: () => [], server: false })

const { data: allDocuments, refresh: refreshAllDocs } = await useAsyncData('fp-all-docs', async () => {
  if (import.meta.server || !auth.isLoggedIn) return []
  try { return await api.getDocuments({ page_size: 100 }) } catch { return [] }
}, { default: () => [], server: false })

watch(() => auth.isLoggedIn, async (loggedIn) => {
  if (loggedIn) {
    await refreshFolders()
    await refreshAllDocs()
  }
})

const flatFolders = computed(() => {
  function flatten(parentId, depth) {
    return (allFolders.value || [])
      .filter(f => f.parent_id === parentId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap(f => [{ ...f, depth }, ...flatten(f.id, depth + 1)])
  }
  return flatten(null, 0)
})

const filteredFolders = computed(() => {
  const q = filterQuery.value.trim().toLowerCase()
  if (!q) return flatFolders.value
  return flatFolders.value.filter(f => {
    if (f.name.toLowerCase().includes(q)) return true
    return docsInFolder(f.id).length > 0
  })
})

const nonEmptyFolderIds = computed(() => {
  const set = new Set()
  for (const f of (allFolders.value || [])) { if (f.parent_id) set.add(f.parent_id) }
  for (const d of (allDocuments.value || [])) { if (d.folder_id) set.add(d.folder_id) }
  return set
})

const folderDocCounts = computed(() => {
  const counts = {}
  for (const d of (allDocuments.value || [])) {
    if (d.folder_id) counts[d.folder_id] = (counts[d.folder_id] || 0) + 1
  }
  return counts
})

const rootDocCount = computed(() => (allDocuments.value || []).filter(d => !d.folder_id).length)

function docsInFolder(folderId) {
  const q = filterQuery.value.trim().toLowerCase()
  return (allDocuments.value || []).filter(d => {
    const inTarget = folderId === null ? !d.folder_id : d.folder_id === folderId
    if (!inTarget) return false
    if (!q) return true
    return d.title?.toLowerCase().includes(q)
  })
}

watch(() => panel.folderRefreshKey.value, async () => {
  await refreshFolders()
  await refreshAllDocs()
})

// ── Navigation ────────────────────────────────────────────────────────────────
function handlePickFolder(id) {
  panel.pickFolder(id)
  folderMenuOpen.value = null
  panel.close()
  if (route.path !== '/') {
    const q = id === undefined ? {} : id === null ? { folder: 'root' } : { folder: id }
    router.push({ path: '/', query: q })
  }
}

function openDocInViewer(id) {
  panel.close()
  docViewer.openDoc(id)
}

// ── Folder context menu ───────────────────────────────────────────────────────
const folderMenuOpen = ref(null)
function toggleFolderMenu(id) { folderMenuOpen.value = folderMenuOpen.value === id ? null : id }

// ── Folder creation ───────────────────────────────────────────────────────────
const creatingInFolder = ref(null)
const newFolderName = ref('')
function startCreate() { creatingInFolder.value = 'root'; newFolderName.value = '' }
function startCreateChild(folderId) { creatingInFolder.value = folderId; newFolderName.value = ''; folderMenuOpen.value = null }
function cancelCreate() { creatingInFolder.value = null; newFolderName.value = '' }
async function submitCreate(parentId) {
  const name = newFolderName.value.trim()
  if (!name) return
  try {
    await api.createFolder(name, parentId)
    await refreshFolders()
    cancelCreate()
    panel.notifyFolderChange()
  } catch (e) { console.error('Create folder failed', e) }
}

// ── Folder rename ─────────────────────────────────────────────────────────────
const renamingFolder = ref(null)
const renameValue = ref('')
const renameInput = ref(null)
function startRename(folder) {
  renamingFolder.value = folder
  renameValue.value = folder.name
  folderMenuOpen.value = null
  nextTick(() => renameInput.value?.focus())
}
function cancelRename() { renamingFolder.value = null; renameValue.value = '' }
async function confirmRename() {
  if (!renamingFolder.value) return
  const name = renameValue.value.trim()
  if (!name) return
  try {
    await api.updateFolder(renamingFolder.value.id, { name })
    await refreshFolders()
    cancelRename()
    panel.notifyFolderChange()
  } catch (e) { console.error('Rename failed', e) }
}

// ── Folder delete ─────────────────────────────────────────────────────────────
async function handleDeleteFolder(id) {
  folderMenuOpen.value = null
  if (!confirm('Delete this folder? Documents inside will be moved to parent.')) return
  try {
    await api.deleteFolder(id)
    if (panel.selectedFolderId.value === id) panel.pickFolder(undefined)
    await refreshFolders()
    await refreshAllDocs()
    panel.notifyFolderChange()
  } catch (e) { console.error('Delete folder failed', e) }
}
</script>

<style scoped>
.folder-overlay {
  position: fixed;
  inset: 0;
  background: rgba(12, 20, 36, 0.45);
  backdrop-filter: blur(2px);
  z-index: 400;
}

.folder-panel {
  position: fixed;
  top: 0;
  left: 0;
  width: 310px;
  height: 100dvh;
  background: var(--surface);
  border-right: 1px solid var(--line);
  z-index: 401;
  display: flex;
  flex-direction: column;
  transform: translateX(-100%);
  transition: transform 0.24s cubic-bezier(0.22, 1, 0.36, 1);
  box-shadow: var(--shadow-lg);
}

.folder-panel.open {
  transform: translateX(0);
}

.fp-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 18px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}

.fp-header-title {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--ink);
}

.fp-header-title .ui-icon {
  color: var(--accent);
}

.fp-title {
  font-weight: 700;
  font-size: 15px;
}

.fp-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fp-close {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 7px;
  background: var(--raised);
  color: var(--muted);
  cursor: pointer;
}

.fp-close:hover {
  background: var(--hover);
  color: var(--ink);
}

.fp-filter {
  position: relative;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
}

.fp-filter-icon {
  position: absolute;
  left: 24px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--subtle);
  pointer-events: none;
}

.fp-filter input {
  width: 100%;
  height: 34px;
  padding: 5px 10px 5px 31px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--canvas);
  color: var(--ink);
  font-size: 12.5px;
}

.fp-filter input:focus {
  outline: none;
  border-color: var(--accent-solid);
  background: var(--surface);
}

.fp-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.fp-section-label {
  margin: 14px 10px 6px;
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  color: var(--subtle);
}

.fp-row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 12px;
  border-radius: 9px;
  cursor: pointer;
  position: relative;
  color: var(--ink-secondary);
  transition: background 0.15s, color 0.15s;
}

.fp-row:hover {
  background: var(--raised);
  color: var(--ink);
}

.fp-row.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 650;
}

.fp-row-icon {
  color: var(--accent);
  opacity: 0.85;
}

.fp-name {
  flex: 1;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fp-count {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  background: var(--raised);
  padding: 1px 7px;
  border-radius: 999px;
  min-width: 22px;
  text-align: center;
}

.fp-row.active .fp-count {
  background: var(--surface);
  color: var(--accent);
}

.fp-doc {
  padding: 2px 8px;
}

.fp-doc a {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 8px;
  border-radius: 7px;
  color: var(--muted);
  font-size: 12.5px;
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fp-doc a:hover {
  background: var(--raised);
  color: var(--accent);
}

.fp-doc a span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.fp-actions {
  display: none;
}

.fp-row:hover .fp-actions,
.fp-row.active .fp-actions {
  display: block;
}

.btn-icon {
  background: none;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
  padding: 2px 6px;
  font-size: 14px;
  color: var(--muted);
  line-height: 1;
}

.btn-icon:hover {
  background: var(--hover);
  color: var(--ink);
}

.fp-menu {
  position: absolute;
  right: 8px;
  top: calc(100% + 2px);
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  box-shadow: var(--shadow-md);
  z-index: 100;
  min-width: 156px;
  padding: 4px;
}

.fp-menu button {
  display: block;
  width: 100%;
  text-align: left;
  padding: 7px 10px;
  border: 0;
  border-radius: 7px;
  background: none;
  cursor: pointer;
  font-size: 12.5px;
  font-weight: 550;
  color: var(--ink);
}

.fp-menu button:hover {
  background: var(--raised);
}

.fp-menu button.danger {
  color: var(--danger);
}

.fp-menu button.danger:hover {
  background: var(--danger-soft);
}

.inline-create {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: var(--raised);
  border-bottom: 1px solid var(--line);
}

.inline-create .input-control {
  padding: 5px 9px;
  font-size: 12.5px;
}

.fp-resize-handle {
  position: absolute;
  top: 0;
  right: 0;
  width: 5px;
  height: 100%;
  cursor: ew-resize;
  z-index: 10;
}

.fp-resize-handle:hover {
  background: var(--accent-solid);
  opacity: 0.4;
}

@media (max-width: 768px) {
  .folder-panel {
    width: min(320px, calc(100vw - 40px)) !important;
  }
  .fp-resize-handle {
    display: none;
  }
}
</style>
