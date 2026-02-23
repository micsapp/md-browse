<template>
  <div class="page" @click="closeMenus">
    <!-- ── Folder Panel (desktop: side panel, mobile: full overlay) ────── -->
    <Teleport to="body">
      <div v-if="folderPanelOpen" class="folder-overlay" @click="folderPanelOpen = false"></div>
      <aside class="folder-panel" :class="{ open: folderPanelOpen }">
        <div class="fp-header">
          <span class="fp-title">Folders</span>
          <button class="fp-close" @click="folderPanelOpen = false">✕</button>
        </div>

        <div class="fp-row" :class="{ active: selectedFolderId === undefined }" @click="pickFolder(undefined)">
          <span>📁</span> <span class="fp-name">All Documents</span>
          <span class="fp-count">{{ allDocuments?.length || 0 }}</span>
        </div>
        <div class="fp-row" :class="{ active: selectedFolderId === null }" @click="pickFolder(null)">
          <span>📁</span> <span class="fp-name">Root (Unfiled)</span>
          <span class="fp-count">{{ rootDocCount }}</span>
        </div>

        <template v-for="item in flatFolders" :key="item.id">
          <div class="fp-row" :class="{ active: selectedFolderId === item.id }" :style="{ paddingLeft: (0.75 + item.depth * 1.25) + 'rem' }" @click="pickFolder(item.id)">
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
          <!-- Documents inside this folder -->
          <div v-for="doc in docsInFolder(item.id)" :key="doc.id" class="fp-doc" :style="{ paddingLeft: (1.5 + item.depth * 1.25) + 'rem' }">
            <NuxtLink :to="`/documents/${doc.id}`" @click="folderPanelOpen = false">📄 {{ doc.title }}</NuxtLink>
          </div>
          <!-- Inline child create form -->
          <div v-if="creatingInFolder === item.id" class="inline-create" :style="{ paddingLeft: (0.75 + (item.depth + 1) * 1.25) + 'rem' }">
            <input v-model="newFolderName" placeholder="Folder name" @keyup.enter="submitCreate(item.id)" @keyup.esc="cancelCreate" autofocus />
            <button @click="submitCreate(item.id)" class="btn-sm">Add</button>
            <button @click="cancelCreate" class="btn-sm btn-cancel">✕</button>
          </div>
        </template>
        <!-- Root-level unfiled docs -->
        <div v-for="doc in docsInFolder(null)" :key="doc.id" class="fp-doc" style="padding-left: 1.5rem;">
          <NuxtLink :to="`/documents/${doc.id}`" @click="folderPanelOpen = false">📄 {{ doc.title }}</NuxtLink>
        </div>

        <div class="fp-new">
          <button @click="startCreate" class="btn-new-folder">+ New Folder</button>
          <div v-if="creatingInFolder === 'root'" class="inline-create">
            <input v-model="newFolderName" placeholder="Folder name" @keyup.enter="submitCreate(null)" @keyup.esc="cancelCreate" autofocus />
            <button @click="submitCreate(null)" class="btn-sm">Add</button>
            <button @click="cancelCreate" class="btn-sm btn-cancel">✕</button>
          </div>
        </div>
      </aside>
    </Teleport>

    <!-- ── Main content ───────────────────────────────────────────────────── -->
    <div class="main-header">
      <h1>{{ selectedFolderLabel }}</h1>
      <div class="view-controls">
        <button :class="['view-btn', { active: viewMode === 'card' }]" @click="viewMode = 'card'" title="Card view">⊞</button>
        <button :class="['view-btn', { active: viewMode === 'compact' }]" @click="viewMode = 'compact'" title="Compact view">☰</button>
        <button :class="['view-btn', { active: viewMode === 'table' }]" @click="viewMode = 'table'" title="Table view">⊟</button>
      </div>
    </div>

    <!-- Card view -->
    <div v-if="viewMode === 'card'" class="documents documents-card">
      <div v-for="doc in documents" :key="doc.id" class="doc-card">
        <div class="doc-card-top">
          <h2><NuxtLink :to="`/documents/${doc.id}`">{{ doc.title }}</NuxtLink></h2>
          <div class="doc-actions" @click.stop>
            <button @click="openMoveModal(doc.id)" class="btn-sm">Move</button>
            <button @click="handleDeleteDoc(doc.id)" class="btn-sm btn-danger">Del</button>
          </div>
        </div>
        <div class="meta">
          <span v-if="doc.category" class="category">{{ doc.category }}</span>
          <span v-for="tag in doc.tags" :key="tag" class="tag">{{ tag }}</span>
          <span class="info-inline">{{ formatDate(doc.updated_at) }}</span>
        </div>
      </div>
      <div v-if="!documents?.length" class="empty">No documents. <NuxtLink to="/upload">Upload one</NuxtLink></div>
    </div>

    <!-- Compact list view -->
    <div v-else-if="viewMode === 'compact'" class="documents documents-compact">
      <div v-for="doc in documents" :key="doc.id" class="compact-row">
        <NuxtLink :to="`/documents/${doc.id}`" class="compact-title">{{ doc.title }}</NuxtLink>
        <span class="compact-date">{{ formatDate(doc.updated_at) }}</span>
        <div class="doc-actions compact-actions" @click.stop>
          <button @click="openMoveModal(doc.id)" class="btn-sm">Move</button>
          <button @click="handleDeleteDoc(doc.id)" class="btn-sm btn-danger">Del</button>
        </div>
      </div>
      <div v-if="!documents?.length" class="empty">No documents. <NuxtLink to="/upload">Upload one</NuxtLink></div>
    </div>

    <!-- Table view -->
    <div v-else class="documents documents-table">
      <table class="doc-table">
        <thead>
          <tr>
            <th>Title</th>
            <th class="col-hide-sm">Category</th>
            <th class="col-hide-sm">Tags</th>
            <th>Updated</th>
            <th class="col-hide-sm">By</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="doc in documents" :key="doc.id" class="doc-row">
            <td class="td-title"><NuxtLink :to="`/documents/${doc.id}`">{{ doc.title }}</NuxtLink></td>
            <td class="col-hide-sm"><span v-if="doc.category" class="category">{{ doc.category }}</span></td>
            <td class="td-tags col-hide-sm"><span v-for="tag in doc.tags" :key="tag" class="tag">{{ tag }}</span></td>
            <td class="td-date">{{ formatDate(doc.updated_at) }}</td>
            <td class="td-by col-hide-sm">{{ doc.created_by }}</td>
            <td class="td-actions" @click.stop>
              <div class="doc-actions">
                <button @click="openMoveModal(doc.id)" class="btn-sm">Move</button>
                <button @click="handleDeleteDoc(doc.id)" class="btn-sm btn-danger">Del</button>
              </div>
            </td>
          </tr>
          <tr v-if="!documents?.length"><td colspan="6" class="empty">No documents. <NuxtLink to="/upload">Upload one</NuxtLink></td></tr>
        </tbody>
      </table>
    </div>

    <!-- ── Move Modal ──────────────────────────────────────────────────────── -->
    <div v-if="moveDocId" class="modal-overlay" @click.self="moveDocId = null">
      <div class="modal">
        <h3>Move to folder</h3>
        <div class="move-list">
          <div @click="moveDoc(moveDocId, null)" class="move-item" :class="{ active: !movingDocFolderId }">📁 Root (no folder)</div>
          <div v-for="f in flatFolders" :key="f.id" @click="moveDoc(moveDocId, f.id)" class="move-item" :class="{ active: movingDocFolderId === f.id }" :style="{ paddingLeft: (0.75 + f.depth) + 'rem' }">📁 {{ f.name }}</div>
        </div>
        <div class="modal-btns">
          <button @click="moveDocId = null" class="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>

    <!-- ── Rename Modal ────────────────────────────────────────────────────── -->
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
  </div>
</template>

<script setup>
const api = useApi()

// undefined = all docs, null = root/unfiled, string = folder id
const selectedFolderId = ref(undefined)

// Folders
const { data: allFolders, refresh: refreshFolders } = await useAsyncData('folders', async () => {
  if (import.meta.server) return []
  try { return await api.getFolders() } catch { return [] }
}, { default: () => [], server: false })

// Documents filtered by selected folder
const { data: documents, refresh: refreshDocs } = await useAsyncData('documents', async () => {
  if (import.meta.server) return []
  try {
    const params = {}
    if (selectedFolderId.value === null) params.folder_id = 'root'
    else if (selectedFolderId.value !== undefined) params.folder_id = selectedFolderId.value
    return await api.getDocuments(params)
  } catch { return [] }
}, { watch: [selectedFolderId], default: () => [], server: false })

// All documents (for folder membership check & folder panel)
const { data: allDocuments, refresh: refreshAllDocs } = await useAsyncData('all-documents', async () => {
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

// Doc counts per folder (for folder panel badges)
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

const selectedFolderLabel = computed(() => {
  if (selectedFolderId.value === undefined) return 'All Documents'
  if (selectedFolderId.value === null) return 'Root (Unfiled)'
  return (allFolders.value || []).find(f => f.id === selectedFolderId.value)?.name || 'Documents'
})

// ── Folder panel ─────────────────────────────────────────────────────────────
const folderPanelOpen = ref(false)

// Expose globally so app.vue nav can toggle it
if (import.meta.client) { window.__toggleFolders = () => { folderPanelOpen.value = !folderPanelOpen.value } }

function pickFolder(id) {
  selectedFolderId.value = id
  closeMenus()
  folderPanelOpen.value = false
}

// ── Folder creation ──────────────────────────────────────────────────────────
const creatingInFolder = ref(null)
const newFolderName = ref('')

function startCreate() { creatingInFolder.value = 'root'; newFolderName.value = '' }
function startCreateChild(folderId) { creatingInFolder.value = folderId; newFolderName.value = ''; folderMenuOpen.value = null }
function cancelCreate() { creatingInFolder.value = null; newFolderName.value = '' }

async function submitCreate(parentId) {
  const name = newFolderName.value.trim()
  if (!name) return
  try { await api.createFolder(name, parentId); await refreshFolders(); cancelCreate() }
  catch (e) { console.error('Create folder failed', e) }
}

// ── Folder rename ────────────────────────────────────────────────────────────
const renamingFolder = ref(null)
const renameValue = ref('')
const renameInput = ref(null)

function startRename(folder) { renamingFolder.value = folder; renameValue.value = folder.name; folderMenuOpen.value = null; nextTick(() => renameInput.value?.focus()) }
function cancelRename() { renamingFolder.value = null; renameValue.value = '' }
async function confirmRename() {
  if (!renamingFolder.value) return
  const name = renameValue.value.trim()
  if (!name) return
  try { await api.updateFolder(renamingFolder.value.id, { name }); await refreshFolders(); cancelRename() }
  catch (e) { console.error('Rename failed', e) }
}

// ── Folder delete ────────────────────────────────────────────────────────────
async function handleDeleteFolder(id) {
  folderMenuOpen.value = null
  if (!confirm('Delete this folder? Documents inside will be moved to parent.')) return
  try { await api.deleteFolder(id); if (selectedFolderId.value === id) selectedFolderId.value = undefined; await refreshFolders(); await refreshDocs() }
  catch (e) { console.error('Delete folder failed', e) }
}

// ── Document move (modal-based) ──────────────────────────────────────────────
const moveDocId = ref(null)
const movingDocFolderId = computed(() => {
  if (!moveDocId.value) return null
  const doc = (documents.value || []).find(d => d.id === moveDocId.value) || (allDocuments.value || []).find(d => d.id === moveDocId.value)
  return doc?.folder_id || null
})

function openMoveModal(docId) { moveDocId.value = docId }

async function moveDoc(docId, folderId) {
  moveDocId.value = null
  try { await api.moveDocument(docId, folderId); await refreshDocs(); await refreshAllDocs() }
  catch (e) { console.error('Move failed', e) }
}

// ── Document delete ──────────────────────────────────────────────────────────
async function handleDeleteDoc(id) {
  if (!confirm('Delete this document?')) return
  try { await api.deleteDocument(id); await refreshDocs(); await refreshAllDocs() }
  catch (e) { console.error('Delete failed', e) }
}

// ── Folder context menu ──────────────────────────────────────────────────────
const folderMenuOpen = ref(null)
function toggleFolderMenu(id) { folderMenuOpen.value = folderMenuOpen.value === id ? null : id }
function closeMenus() { folderMenuOpen.value = null }

function formatDate(date) { return date ? new Date(date).toLocaleDateString() : '' }

// ── View mode ────────────────────────────────────────────────────────────────
const viewMode = ref(import.meta.client ? (localStorage.getItem('viewMode') || 'card') : 'card')
watch(viewMode, v => { if (import.meta.client) localStorage.setItem('viewMode', v) })
</script>

<style scoped>
/* ── Page ───────────────────────────────────────────────────────────────── */
.page { width: 100%; }

/* ── Folder Panel (teleported) ──────────────────────────────────────────── */
.folder-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 400;
}
.folder-panel {
  position: fixed;
  top: 0; left: 0;
  width: 300px; height: 100dvh;
  background: var(--surface);
  z-index: 401;
  overflow-y: auto;
  transform: translateX(-100%);
  transition: transform 0.25s ease;
  box-shadow: 4px 0 20px var(--shadow2);
}
.folder-panel.open { transform: translateX(0); }

.fp-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.75rem 1rem; border-bottom: 1px solid var(--border);
  position: sticky; top: 0; background: var(--surface); z-index: 1;
}
.fp-title { font-weight: 700; font-size: 1rem; color: var(--text); }
.fp-close { background: none; border: none; font-size: 1.2rem; cursor: pointer; color: var(--text3); padding: 0.2rem; }

.fp-row {
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.45rem 0.75rem; cursor: pointer; position: relative;
  color: var(--text);
}
.fp-row:hover { background: var(--hover-bg); }
.fp-row.active { background: var(--active-bg); color: var(--active-color); font-weight: 500; }
.fp-name { flex: 1; font-size: 0.88rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fp-count { font-size: 0.72rem; color: var(--text3); background: var(--surface2); padding: 0 0.4rem; border-radius: 8px; min-width: 1.2rem; text-align: center; }

.fp-doc {
  padding: 0.25rem 0.75rem; font-size: 0.82rem;
}
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

.fp-new { padding: 0.5rem 0.75rem; border-top: 1px solid var(--border); }
.btn-new-folder { background: none; border: none; cursor: pointer; color: var(--accent); font-size: 0.85rem; padding: 0; font-weight: 500; }
.btn-new-folder:hover { text-decoration: underline; }

/* ── Main header ────────────────────────────────────────────────────────── */
.main-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
.main-header h1 { margin: 0; flex: 1; font-size: 1.2rem; color: var(--text); }

.view-controls { display: flex; gap: 0.25rem; }
.view-btn { background: none; border: 1px solid var(--border2); border-radius: 4px; padding: 0.25rem 0.5rem; cursor: pointer; font-size: 1rem; color: var(--text2); line-height: 1; }
.view-btn:hover { background: var(--hover-bg); }
.view-btn.active { background: var(--accent); color: white; border-color: var(--accent); }

/* ── Card view ──────────────────────────────────────────────────────────── */
.documents-card {
  display: grid;
  gap: 0.5rem;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
}
.doc-card {
  background: var(--surface);
  padding: 0.5rem 0.65rem;
  border-radius: 6px;
  box-shadow: 0 1px 3px var(--shadow);
  border: 1px solid var(--border);
  overflow: hidden;
}
.doc-card-top { display: flex; align-items: center; gap: 0.3rem; margin-bottom: 0.15rem; }
.doc-card-top h2 { margin: 0; flex: 1; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.doc-card-top h2 a { color: var(--text); text-decoration: none; }
.doc-card-top h2 a:hover { color: var(--accent); }
.meta { display: flex; gap: 0.25rem; flex-wrap: wrap; align-items: center; }
.category { background: var(--accent); color: white; padding: 0.05rem 0.35rem; border-radius: 3px; font-size: 0.7rem; }
.tag { background: #6c7a89; color: white; padding: 0.05rem 0.35rem; border-radius: 3px; font-size: 0.7rem; }
.info-inline { font-size: 0.7rem; color: var(--text3); margin-left: auto; }

/* ── Compact list view ──────────────────────────────────────────────────── */
.documents-compact { display: flex; flex-direction: column; }
.compact-row {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.4rem 0.65rem; background: var(--surface); border-bottom: 1px solid var(--border);
}
.compact-row:first-child { border-radius: 6px 6px 0 0; }
.compact-row:last-child { border-radius: 0 0 6px 6px; border-bottom: none; }
.compact-title { flex: 1; font-size: 0.88rem; color: var(--text); text-decoration: none; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.compact-title:hover { color: var(--accent); }
.compact-date { font-size: 0.76rem; color: var(--text3); white-space: nowrap; flex-shrink: 0; }

/* ── Table view ─────────────────────────────────────────────────────────── */
.documents-table { overflow-x: auto; max-width: 100%; }
.doc-table {
  width: 100%; border-collapse: collapse; background: var(--surface);
  border-radius: 6px; overflow: hidden; box-shadow: 0 1px 3px var(--shadow); font-size: 0.85rem; table-layout: fixed;
}
.doc-table th {
  text-align: left; padding: 0.45rem 0.5rem; background: var(--surface2);
  border-bottom: 2px solid var(--border); font-size: 0.72rem; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.04em; color: var(--text3); overflow: hidden;
}
.doc-table td { padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--border); vertical-align: middle; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.doc-row:last-child td { border-bottom: none; }
.doc-row:hover td { background: var(--hover-bg); }
.td-title a { color: var(--text); text-decoration: none; font-weight: 500; }
.td-title a:hover { color: var(--accent); }
.td-tags { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.td-date, .td-by { font-size: 0.78rem; color: var(--text3); }
.td-actions { width: 100px; }

/* ── Shared ─────────────────────────────────────────────────────────────── */
.doc-actions { display: flex; align-items: center; gap: 0.3rem; flex-shrink: 0; }
.empty { text-align: center; padding: 2rem; color: var(--text3); font-size: 0.9rem; }
.btn-sm { padding: 0.2rem 0.5rem; font-size: 0.76rem; border: 1px solid var(--border2); border-radius: 4px; cursor: pointer; background: var(--surface); color: var(--text); white-space: nowrap; }
.btn-sm:hover { background: var(--hover-bg); }
.btn-danger { border-color: var(--danger); color: var(--danger); }

/* ── Modals ─────────────────────────────────────────────────────────────── */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 500; }
.modal { background: var(--surface); padding: 1.25rem; border-radius: 8px; width: min(360px, calc(100vw - 2rem)); box-shadow: 0 8px 32px var(--shadow2); color: var(--text); }
.modal h3 { margin: 0 0 0.75rem; font-size: 1rem; }
.modal input { width: 100%; padding: 0.5rem; border: 1px solid var(--border2); border-radius: 4px; margin-bottom: 0.75rem; font-size: 0.95rem; background: var(--surface2); color: var(--text); box-sizing: border-box; }
.modal-btns { display: flex; gap: 0.5rem; justify-content: flex-end; }
.btn-primary { padding: 0.4rem 0.9rem; background: var(--accent); color: white; border: none; border-radius: 4px; cursor: pointer; }
.btn-primary:hover { background: var(--accent-hover); }
.btn-secondary { padding: 0.4rem 0.9rem; background: var(--surface2); border: 1px solid var(--border2); border-radius: 4px; cursor: pointer; color: var(--text); }
.btn-secondary:hover { background: var(--hover-bg); }
.btn-cancel { color: var(--text2); }

.move-list { max-height: 300px; overflow-y: auto; margin-bottom: 0.75rem; border: 1px solid var(--border); border-radius: 4px; }
.move-item { padding: 0.45rem 0.75rem; cursor: pointer; font-size: 0.88rem; color: var(--text); }
.move-item:hover { background: var(--hover-bg); }
.move-item.active { background: var(--active-bg); color: var(--active-color); }

/* ── Mobile ─────────────────────────────────────────────────────────────── */
@media (max-width: 768px) {
  .doc-card-top { flex-direction: column; align-items: flex-start; gap: 0.2rem; }
  .doc-actions { align-self: flex-end; }
  .col-hide-sm { display: none; }
  .td-title { overflow: hidden; text-overflow: ellipsis; }
  .documents-card { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
}

/* ── Desktop: wider panel ──────────────────────────────────────────────── */
@media (min-width: 769px) {
  .folder-panel { width: 320px; }
}
</style>
