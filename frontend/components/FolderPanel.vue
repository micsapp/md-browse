<template>
  <Teleport to="body">
    <div v-if="panel.isOpen.value" class="folder-overlay" @click="panel.close()"></div>

    <aside class="folder-panel" :class="{ open: panel.isOpen.value }" :style="desktopWidth">
      <div class="fp-header">
        <span class="fp-title">Folders</span>
        <button class="fp-close" @click="panel.close()">✕</button>
      </div>

      <div class="fp-scroll">
        <div class="fp-row" :class="{ active: panel.selectedFolderId.value === undefined }" @click="handlePickFolder(undefined)">
          <span>📁</span><span class="fp-name">All Documents</span>
          <span class="fp-count">{{ allDocuments?.length || 0 }}</span>
        </div>
        <div class="fp-row" :class="{ active: panel.selectedFolderId.value === null }" @click="handlePickFolder(null)">
          <span>📁</span><span class="fp-name">Root (Unfiled)</span>
          <span class="fp-count">{{ rootDocCount }}</span>
        </div>

        <template v-for="item in flatFolders" :key="item.id">
          <div class="fp-row"
               :class="{ active: panel.selectedFolderId.value === item.id }"
               :style="{ paddingLeft: (0.75 + item.depth * 1.25) + 'rem' }"
               @click="handlePickFolder(item.id)">
            <span>📁</span>
            <span class="fp-name">{{ item.name }}</span>
            <span class="fp-count">{{ folderDocCounts[item.id] || 0 }}</span>
            <div class="fp-actions" @click.stop>
              <button class="btn-icon" @click="toggleFolderMenu(item.id)">···</button>
              <div v-if="folderMenuOpen === item.id" class="fp-menu">
                <button @click="startRename(item)">Rename</button>
                <button @click="startCreateChild(item.id)">Add subfolder</button>
                <button v-if="!nonEmptyFolderIds.has(item.id)" @click="handleDeleteFolder(item.id)" class="danger">Delete</button>
              </div>
            </div>
          </div>
          <div v-for="doc in docsInFolder(item.id)" :key="doc.id" class="fp-doc"
               :style="{ paddingLeft: (1.5 + item.depth * 1.25) + 'rem' }">
            <a href="#" @click.prevent="openDocInViewer(doc.id)">📄 {{ doc.title }}</a>
          </div>
          <div v-if="creatingInFolder === item.id" class="inline-create"
               :style="{ paddingLeft: (0.75 + (item.depth + 1) * 1.25) + 'rem' }">
            <input v-model="newFolderName" placeholder="Folder name" @keyup.enter="submitCreate(item.id)" @keyup.esc="cancelCreate" autofocus />
            <button @click="submitCreate(item.id)" class="btn-sm">Add</button>
            <button @click="cancelCreate" class="btn-sm">✕</button>
          </div>
        </template>

        <div v-for="doc in docsInFolder(null)" :key="doc.id" class="fp-doc" style="padding-left: 1.5rem;">
          <a href="#" @click.prevent="openDocInViewer(doc.id)">📄 {{ doc.title }}</a>
        </div>

        <div class="fp-new">
          <button @click="startCreate" class="btn-new-folder">+ New Folder</button>
          <div v-if="creatingInFolder === 'root'" class="inline-create">
            <input v-model="newFolderName" placeholder="Folder name" @keyup.enter="submitCreate(null)" @keyup.esc="cancelCreate" autofocus />
            <button @click="submitCreate(null)" class="btn-sm">Add</button>
            <button @click="cancelCreate" class="btn-sm">✕</button>
          </div>
        </div>
      </div>

      <!-- Resize handle (desktop only) -->
      <div class="fp-resize-handle" @mousedown.prevent="startResize"></div>
    </aside>

    <!-- Rename modal outside aside to avoid z-index/overflow issues -->
    <div v-if="renamingFolder" class="modal-overlay" @click.self="cancelRename">
      <div class="modal">
        <h3>Rename Folder</h3>
        <input v-model="renameValue" @keyup.enter="confirmRename" @keyup.esc="cancelRename" ref="renameInput" />
        <div class="modal-btns">
          <button @click="confirmRename" class="btn-primary">Save</button>
          <button @click="cancelRename" class="btn-secondary">Cancel</button>
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

// ── Resizable width (desktop only) ───────────────────────────────────────────
const DEFAULT_WIDTH = 280
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
  panelWidth.value = Math.max(200, Math.min(600, resizeStartW + (e.clientX - resizeStartX)))
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
  if (import.meta.server) return []
  try { return await api.getFolders() } catch { return [] }
}, { default: () => [], server: false })

const { data: allDocuments, refresh: refreshAllDocs } = await useAsyncData('fp-all-docs', async () => {
  if (import.meta.server) return []
  try { return await api.getDocuments({}) } catch { return [] }
}, { default: () => [], server: false })

const flatFolders = computed(() => {
  function flatten(parentId, depth) {
    return (allFolders.value || [])
      .filter(f => f.parent_id === parentId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap(f => [{ ...f, depth }, ...flatten(f.id, depth + 1)])
  }
  return flatten(null, 0)
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
  return (allDocuments.value || []).filter(d => folderId === null ? !d.folder_id : d.folder_id === folderId)
}

// Refresh when index.vue triggers a change (e.g. doc moved/deleted)
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
  position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 400;
}

.folder-panel {
  position: fixed;
  top: 0; left: 0;
  width: 280px; height: 100dvh;
  background: var(--surface);
  z-index: 401;
  display: flex; flex-direction: column;
  transform: translateX(-100%);
  transition: transform 0.25s ease;
  box-shadow: 4px 0 20px var(--shadow2);
}
.folder-panel.open { transform: translateX(0); }

.fp-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.75rem 1rem; border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.fp-title { font-weight: 700; font-size: 1rem; color: var(--text); }
.fp-close { background: none; border: none; font-size: 1.2rem; cursor: pointer; color: var(--text3); padding: 0.2rem; }

.fp-scroll { flex: 1; overflow-y: auto; }

.fp-row {
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.45rem 0.75rem; cursor: pointer; position: relative;
  color: var(--text);
}
.fp-row:hover { background: var(--hover-bg); }
.fp-row.active { background: var(--active-bg); color: var(--active-color); font-weight: 500; }
.fp-name { flex: 1; font-size: 0.88rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fp-count { font-size: 0.72rem; color: var(--text3); background: var(--surface2); padding: 0 0.4rem; border-radius: 8px; min-width: 1.2rem; text-align: center; }

.fp-doc { padding: 0.25rem 0.75rem; font-size: 0.82rem; }
.fp-doc a { color: var(--text2); text-decoration: none; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fp-doc a:hover { color: var(--accent); }

.fp-actions { display: none; }
.fp-row:hover .fp-actions, .fp-row.active .fp-actions { display: block; }
.btn-icon { background: none; border: none; cursor: pointer; padding: 0 0.2rem; font-size: 1rem; color: var(--text3); line-height: 1; }
.btn-icon:hover { color: var(--text); }

.fp-menu {
  position: absolute; right: 0.25rem; top: 100%;
  background: var(--surface); border: 1px solid var(--border2);
  border-radius: 6px; box-shadow: 0 4px 14px var(--shadow2);
  z-index: 100; min-width: 150px;
}
.fp-menu button { display: block; width: 100%; text-align: left; padding: 0.5rem 0.75rem; border: none; background: none; cursor: pointer; font-size: 0.85rem; color: var(--text); }
.fp-menu button:hover { background: var(--hover-bg); }
.fp-menu button.danger { color: var(--danger); }

.inline-create { display: flex; align-items: center; gap: 0.3rem; padding: 0.4rem 0.75rem; background: var(--surface2); border-top: 1px solid var(--border); }
.inline-create input { flex: 1; padding: 0.25rem 0.4rem; border: 1px solid var(--border2); border-radius: 4px; font-size: 0.82rem; background: var(--surface); color: var(--text); }

.fp-new { padding: 0.5rem 0.75rem; border-top: 1px solid var(--border); flex-shrink: 0; }
.btn-new-folder { background: none; border: none; cursor: pointer; color: var(--accent); font-size: 0.85rem; padding: 0; font-weight: 500; }
.btn-new-folder:hover { text-decoration: underline; }

.btn-sm { padding: 0.2rem 0.5rem; font-size: 0.76rem; border: 1px solid var(--border2); border-radius: 4px; cursor: pointer; background: var(--surface); color: var(--text); }
.btn-sm:hover { background: var(--hover-bg); }

/* ── Resize handle ───────────────────────────────────────────────────────── */
.fp-resize-handle {
  position: absolute; top: 0; right: 0;
  width: 5px; height: 100%;
  cursor: ew-resize;
  z-index: 10;
}
.fp-resize-handle:hover { background: var(--accent); opacity: 0.4; }

@media (max-width: 768px) {
  .folder-panel { width: 100vw !important; }
  .fp-resize-handle { display: none; }
}

/* ── Rename modal ────────────────────────────────────────────────────────── */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 600; }
.modal { background: var(--surface); padding: 1.25rem; border-radius: 8px; width: min(360px, calc(100vw - 2rem)); box-shadow: 0 8px 32px var(--shadow2); color: var(--text); }
.modal h3 { margin: 0 0 0.75rem; font-size: 1rem; }
.modal input { width: 100%; padding: 0.5rem; border: 1px solid var(--border2); border-radius: 4px; margin-bottom: 0.75rem; font-size: 0.95rem; background: var(--surface2); color: var(--text); box-sizing: border-box; }
.modal-btns { display: flex; gap: 0.5rem; justify-content: flex-end; }
.btn-primary { padding: 0.4rem 0.9rem; background: var(--accent); color: white; border: none; border-radius: 4px; cursor: pointer; }
.btn-primary:hover { background: var(--accent-hover); }
.btn-secondary { padding: 0.4rem 0.9rem; background: var(--surface2); border: 1px solid var(--border2); border-radius: 4px; cursor: pointer; color: var(--text); }
.btn-secondary:hover { background: var(--hover-bg); }
</style>
