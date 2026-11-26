<template>
  <div class="page">
    <!-- Workspace Topline / Breadcrumbs -->
    <div class="workspace-topline">
      <div class="workspace-topline-crumbs">
        <button
          type="button"
          class="workspace-topline-crumb"
          :class="{ current: selectedFolderId === undefined }"
          @click="panel.pickFolder(undefined)"
        >
          Knowledge Workspace
        </button>
        <template v-if="selectedFolderId === null">
          <span>/</span>
          <span class="workspace-topline-crumb current">Root (Unfiled)</span>
        </template>
        <template v-else-if="folderBreadcrumbs.length">
          <template v-for="(crumb, idx) in folderBreadcrumbs" :key="crumb.id">
            <span>/</span>
            <button
              type="button"
              class="workspace-topline-crumb"
              :class="{ current: idx === folderBreadcrumbs.length - 1 }"
              @click="panel.pickFolder(crumb.id)"
            >
              {{ crumb.name }}
            </button>
          </template>
        </template>
      </div>
      <div class="workspace-topline-actions">
        <button type="button" class="workspace-topline-link" @click="panel.open()">
          <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-folder"/></svg>
          <span>Folder Tree</span>
        </button>
        <button v-if="auth.user" type="button" class="workspace-topline-link" @click="uploadModal.open()">
          <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-upload"/></svg>
          <span>Upload Document</span>
        </button>
      </div>
    </div>

    <!-- Page Header -->
    <header class="page-header">
      <div class="page-header-copy">
        <p class="page-eyebrow">{{ selectedFolderId === undefined ? 'THE COLLECTION' : 'FOLDER WORKSPACE' }}</p>
        <h1 class="page-title">{{ selectedFolderLabel }}</h1>
        <p class="page-subtitle">Browse, organize, and collaborate on your markdown documentation.</p>
      </div>
      <div class="catalog-total">
        <strong>{{ totalDocs }}</strong>
        <span>{{ totalDocs === 1 ? 'document in view' : 'documents in view' }}</span>
      </div>
    </header>

    <!-- Quick Folder Filter Pills -->
    <div class="folder-strip" role="navigation" aria-label="Quick folder filter">
      <button
        type="button"
        class="folder-chip"
        :class="{ active: selectedFolderId === undefined }"
        @click="panel.pickFolder(undefined)"
      >
        <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-grid"/></svg>
        <span>All Documents</span>
      </button>
      <button
        type="button"
        class="folder-chip"
        :class="{ active: selectedFolderId === null }"
        @click="panel.pickFolder(null)"
      >
        <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-folder"/></svg>
        <span>Root (Unfiled)</span>
      </button>
      <button
        v-for="f in quickFolders"
        :key="f.id"
        type="button"
        class="folder-chip"
        :class="{ active: selectedFolderId === f.id }"
        @click="panel.pickFolder(f.id)"
      >
        <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-folder"/></svg>
        <span>{{ f.name }}</span>
      </button>
      <button type="button" class="folder-chip folder-chip--more" @click="panel.open()">
        <span>All Folders…</span>
      </button>
    </div>

    <!-- Unified Control Bar -->
    <div class="workspace-bar">
      <div class="workspace-bar-search">
        <svg class="ui-icon search-leading-icon" aria-hidden="true"><use href="#ui-search"/></svg>
        <input
          v-model="filterText"
          type="search"
          placeholder="Filter by title, description, or tag… (press Enter for full-text search)"
          aria-label="Filter documents"
          @keyup.enter="goToFullSearch"
        />
        <button
          v-if="filterText"
          type="button"
          class="btn btn-xs btn-ghost"
          title="Clear filter"
          @click="filterText = ''"
        >
          Clear
        </button>
      </div>

      <div class="workspace-bar-divider"></div>

      <label class="catalog-sort">
        <span>Sort by</span>
        <select v-model="sortOption" aria-label="Sort documents">
          <option value="updated_at:desc">Recently updated</option>
          <option value="created_at:desc">Recently created</option>
          <option value="title:asc">Title A–Z</option>
          <option value="title:desc">Title Z–A</option>
        </select>
      </label>

      <div class="workspace-bar-actions">
        <button
          v-if="auth.user && selectedFolderId !== undefined"
          type="button"
          class="btn btn-sm btn-soft"
          title="Upload images or media to this folder"
          @click="showAssetUpload = true"
        >
          <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-image"/></svg>
          <span>Media</span>
        </button>
        <button
          v-if="auth.user"
          type="button"
          class="btn btn-sm"
          :class="{ 'btn-soft': selectMode }"
          title="Toggle multi-select mode"
          @click="toggleSelectMode"
        >
          <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-check"/></svg>
          <span>{{ selectMode ? 'Done' : 'Select' }}</span>
        </button>
        <div class="view-switcher" role="group" aria-label="View options">
          <button
            type="button"
            :class="{ active: viewMode === 'card' }"
            :aria-pressed="viewMode === 'card' ? 'true' : 'false'"
            title="Card grid view"
            aria-label="Card grid view"
            @click="viewMode = 'card'"
          >
            <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-grid"/></svg>
          </button>
          <button
            type="button"
            :class="{ active: viewMode === 'compact' }"
            :aria-pressed="viewMode === 'compact' ? 'true' : 'false'"
            title="Compact list view"
            aria-label="Compact list view"
            @click="viewMode = 'compact'"
          >
            <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-list"/></svg>
          </button>
          <button
            type="button"
            :class="{ active: viewMode === 'table' }"
            :aria-pressed="viewMode === 'table' ? 'true' : 'false'"
            title="Table view"
            aria-label="Table view"
            @click="viewMode = 'table'"
          >
            <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-table"/></svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Batch Action Bar -->
    <div v-if="selectedIds.size > 0" class="batch-bar">
      <div class="batch-bar-left">
        <input type="checkbox" :checked="allSelected" class="doc-check" @change="toggleSelectAll" />
        <span class="batch-count">{{ selectedIds.size }} selected</span>
      </div>
      <div class="batch-bar-actions">
        <button type="button" class="btn btn-sm" @click="batchDownloadSelected">
          <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-download"/></svg>
          Download
        </button>
        <button type="button" class="btn btn-sm btn-soft" @click="batchMoveSelected">
          <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-folder"/></svg>
          Move
        </button>
        <button type="button" class="btn btn-sm btn-danger" @click="batchDeleteSelected">
          <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-trash"/></svg>
          Delete
        </button>
        <button type="button" class="btn btn-sm btn-ghost" @click="clearSelection">Clear</button>
      </div>
    </div>

    <!-- ── Card Grid View ─────────────────────────────────────────────────── -->
    <div v-if="viewMode === 'card'" class="documents documents-card">
      <article
        v-for="doc in documents"
        :key="doc.id"
        class="doc-card"
        :class="{ selected: selectedIds.has(doc.id) }"
        @click="onDocCardClick(doc.id)"
      >
        <div class="doc-card-head">
          <div class="doc-card-badges">
            <input
              v-if="selectMode"
              type="checkbox"
              :checked="selectedIds.has(doc.id)"
              class="doc-check"
              @change="toggleSelect(doc.id)"
              @click.stop
            />
            <span
              v-if="doc.category && doc.category !== 'uncategorized'"
              class="pill pill-accent"
              @click.stop="router.push(`/categories/${doc.category}`)"
            >
              {{ doc.category }}
            </span>
            <span
              v-if="selectedFolderId === undefined && doc.folder_id && folderNameById(doc.folder_id)"
              class="pill doc-folder-pill"
              @click.stop="panel.pickFolder(doc.folder_id)"
            >
              <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-folder"/></svg>
              {{ folderNameById(doc.folder_id) }}
            </span>
            <span v-if="doc.latest_version" class="pill doc-ver-pill">v{{ doc.latest_version }}</span>
          </div>
          <div class="doc-actions" @click.stop>
            <NuxtLink
              :to="`/documents/${doc.id}`"
              class="card-icon-btn"
              title="Open full page"
            >
              <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-external"/></svg>
            </NuxtLink>
            <button
              v-if="auth.user"
              type="button"
              class="card-icon-btn"
              title="Move to folder"
              @click="openMoveModal(doc.id)"
            >
              <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-folder"/></svg>
            </button>
            <button
              v-if="auth.user"
              type="button"
              class="card-icon-btn card-icon-btn--danger"
              title="Delete document"
              @click="handleDeleteDoc(doc.id)"
            >
              <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-trash"/></svg>
            </button>
          </div>
        </div>

        <div class="doc-card-body">
          <h2 class="doc-card-title">
            <a href="#" @click.prevent.stop="docViewer.openDoc(doc.id)">{{ doc.title }}</a>
          </h2>
          <p v-if="doc.description" class="doc-card-desc">{{ doc.description }}</p>
          <div v-if="doc.tags?.length" class="doc-card-tags" @click.stop>
            <NuxtLink
              v-for="tag in doc.tags.slice(0, 4)"
              :key="tag"
              :to="`/tags/${tag}`"
              class="tag-chip"
            >
              #{{ tag }}
            </NuxtLink>
            <span v-if="doc.tags.length > 4" class="tag-chip">+{{ doc.tags.length - 4 }}</span>
          </div>
        </div>

        <div class="doc-card-footer">
          <span class="doc-author">
            <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-user"/></svg>
            {{ doc.created_by || 'system' }}
          </span>
          <span class="doc-date">{{ formatDate(doc.updated_at) }}</span>
        </div>
      </article>
    </div>

    <!-- ── Compact List View ──────────────────────────────────────────────── -->
    <div v-else-if="viewMode === 'compact'" class="documents documents-compact">
      <div
        v-for="doc in documents"
        :key="doc.id"
        class="compact-row"
        :class="{ selected: selectedIds.has(doc.id) }"
        @click="onDocCardClick(doc.id)"
      >
        <input
          v-if="selectMode"
          type="checkbox"
          :checked="selectedIds.has(doc.id)"
          class="doc-check"
          @change="toggleSelect(doc.id)"
          @click.stop
        />
        <span class="compact-icon">
          <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-doc"/></svg>
        </span>
        <div class="compact-main">
          <a href="#" class="compact-title" @click.prevent.stop="docViewer.openDoc(doc.id)">{{ doc.title }}</a>
          <span v-if="doc.description" class="compact-desc">{{ doc.description }}</span>
        </div>
        <div class="compact-badges" @click.stop>
          <span v-if="doc.category && doc.category !== 'uncategorized'" class="pill pill-accent">{{ doc.category }}</span>
          <span v-for="tag in (doc.tags || []).slice(0, 2)" :key="tag" class="tag-chip">#{{ tag }}</span>
        </div>
        <span class="compact-date">{{ formatDate(doc.updated_at) }}</span>
        <div class="doc-actions compact-actions" @click.stop>
          <NuxtLink :to="`/documents/${doc.id}`" class="btn btn-xs" title="Full page">Open</NuxtLink>
          <button v-if="auth.user" type="button" class="btn btn-xs" @click="openMoveModal(doc.id)">Move</button>
          <button v-if="auth.user" type="button" class="btn btn-xs btn-danger" @click="handleDeleteDoc(doc.id)">Delete</button>
        </div>
      </div>
    </div>

    <!-- ── Table View ─────────────────────────────────────────────────────── -->
    <div v-else-if="documents?.length" class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th v-if="selectMode" class="col-check">
              <input type="checkbox" :checked="allSelected" class="doc-check" @change="toggleSelectAll" />
            </th>
            <th>Document</th>
            <th class="col-hide-sm">Category</th>
            <th class="col-hide-sm">Tags</th>
            <th>Updated</th>
            <th class="col-hide-sm">Author</th>
            <th style="text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="doc in documents"
            :key="doc.id"
            class="doc-row"
            :class="{ selected: selectedIds.has(doc.id) }"
            @click="onDocCardClick(doc.id)"
          >
            <td v-if="selectMode" class="col-check" @click.stop>
              <input
                type="checkbox"
                :checked="selectedIds.has(doc.id)"
                class="doc-check"
                @change="toggleSelect(doc.id)"
              />
            </td>
            <td class="td-title">
              <a href="#" class="table-doc-title" @click.prevent.stop="docViewer.openDoc(doc.id)">{{ doc.title }}</a>
              <span v-if="doc.description" class="table-doc-desc">{{ doc.description }}</span>
            </td>
            <td class="col-hide-sm">
              <span v-if="doc.category" class="pill pill-accent">{{ doc.category }}</span>
            </td>
            <td class="td-tags col-hide-sm">
              <div class="table-tags">
                <span v-for="tag in (doc.tags || []).slice(0, 3)" :key="tag" class="tag-chip">#{{ tag }}</span>
              </div>
            </td>
            <td class="td-date">{{ formatDate(doc.updated_at) }}</td>
            <td class="td-by col-hide-sm">{{ doc.created_by }}</td>
            <td class="td-actions" @click.stop>
              <div class="doc-actions" style="justify-content:flex-end;">
                <NuxtLink :to="`/documents/${doc.id}`" class="btn btn-xs">Open</NuxtLink>
                <button v-if="auth.user" type="button" class="btn btn-xs" @click="openMoveModal(doc.id)">Move</button>
                <button v-if="auth.user" type="button" class="btn btn-xs btn-danger" @click="handleDeleteDoc(doc.id)">Delete</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Empty State -->
    <div v-if="!documents?.length" class="catalog-empty">
      <svg class="ui-icon" aria-hidden="true"><use href="#ui-doc"/></svg>
      <strong>{{ filterText ? 'No matching documents' : 'No documents in this view yet' }}</strong>
      <span>
        {{ filterText ? 'Try clearing the filter or run a full-text search across document bodies.' : 'Upload a markdown document or select another folder to get started.' }}
      </span>
      <div style="display:flex; gap:10px; margin-top:6px;">
        <button v-if="filterText" type="button" class="btn btn-sm" @click="filterText = ''">Clear Filter</button>
        <button v-if="auth.user" type="button" class="btn btn-sm btn-primary" @click="uploadModal.open()">
          <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-plus"/></svg>
          Upload Document
        </button>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="totalDocs > PAGE_SIZE" class="pagination">
      <button type="button" class="btn btn-sm" :disabled="page <= 1" @click="page--">‹ Previous</button>
      <span class="pagination-info">Page <strong>{{ page }}</strong> of <strong>{{ totalPages }}</strong> · {{ totalDocs }} documents</span>
      <button type="button" class="btn btn-sm" :disabled="page >= totalPages" @click="page++">Next ›</button>
    </div>

    <!-- ── Move Modal (single or batch) ──────────────────────────────────── -->
    <div v-if="moveDocId || batchMoving" class="modal-backdrop" @click.self="moveDocId = null; batchMoving = false">
      <div class="modal-card">
        <div class="modal-card-header">
          <h3>{{ batchMoving ? `Move ${selectedIds.size} documents` : 'Move to Folder' }}</h3>
          <button type="button" class="btn btn-xs btn-ghost" @click="moveDocId = null; batchMoving = false">✕</button>
        </div>
        <div class="modal-card-body">
          <div class="move-list">
            <button
              type="button"
              class="move-item"
              :class="{ active: !movingDocFolderId }"
              @click="batchMoving ? doBatchMove(null) : moveDoc(moveDocId, null)"
            >
              <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-folder"/></svg>
              <span>Root (Unfiled)</span>
            </button>
            <button
              v-for="f in flatFolders"
              :key="f.id"
              type="button"
              class="move-item"
              :class="{ active: movingDocFolderId === f.id }"
              :style="{ paddingLeft: (14 + f.depth * 18) + 'px' }"
              @click="batchMoving ? doBatchMove(f.id) : moveDoc(moveDocId, f.id)"
            >
              <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-folder"/></svg>
              <span>{{ f.name }}</span>
            </button>
          </div>
        </div>
        <div class="modal-card-footer">
          <button type="button" class="btn btn-sm" @click="moveDocId = null; batchMoving = false">Cancel</button>
        </div>
      </div>
    </div>

    <!-- ── Asset Upload Modal ────────────────────────────────────────────── -->
    <div v-if="showAssetUpload" class="modal-backdrop" @click.self="showAssetUpload = false">
      <div class="modal-card">
        <div class="modal-card-header">
          <h3>Upload Images &amp; Media</h3>
          <button type="button" class="btn btn-xs btn-ghost" @click="showAssetUpload = false">✕</button>
        </div>
        <div class="modal-card-body">
          <p class="asset-folder-label">Target folder: <strong>{{ selectedFolderLabel }}</strong></p>
          <div
            class="drop-zone"
            :class="{ dragover: isDragging }"
            @dragover.prevent="isDragging = true"
            @dragleave="isDragging = false"
            @drop.prevent="onDrop"
          >
            <svg class="ui-icon ui-icon--lg" aria-hidden="true"><use href="#ui-image"/></svg>
            <strong v-if="!assetFiles.length">Drop images here or click to browse</strong>
            <strong v-else>{{ assetFiles.length }} file{{ assetFiles.length > 1 ? 's' : '' }} selected</strong>
            <input type="file" multiple accept="image/*,.svg" class="drop-input" @change="onAssetFilePick" />
          </div>
          <div v-if="assetFiles.length" class="asset-file-list">
            <div v-for="(f, i) in assetFiles" :key="i" class="asset-file-item">
              <span class="asset-file-name">{{ f.name }}</span>
              <span class="asset-file-size">{{ formatFileSize(f.size) }}</span>
              <button type="button" class="btn btn-xs btn-danger" @click="assetFiles.splice(i, 1)">✕</button>
            </div>
          </div>
          <div v-if="assetUploadError" class="error-msg">{{ assetUploadError }}</div>
        </div>
        <div class="modal-card-footer">
          <button type="button" class="btn btn-sm" @click="showAssetUpload = false; assetFiles = []; assetUploadError = ''">Cancel</button>
          <button
            type="button"
            class="btn btn-sm btn-primary"
            :disabled="!assetFiles.length || assetUploading"
            @click="doAssetUpload"
          >
            {{ assetUploading ? 'Uploading…' : `Upload ${assetFiles.length || ''} file${assetFiles.length !== 1 ? 's' : ''}` }}
          </button>
        </div>
      </div>
    </div>

    <!-- ── Folder Asset Gallery ────────────────────────────────────────────── -->
    <section v-if="folderAssets.length && selectedFolderId !== undefined" class="asset-gallery surface-card">
      <div class="asset-gallery-header">
        <div class="asset-gallery-title">
          <svg class="ui-icon" aria-hidden="true"><use href="#ui-image"/></svg>
          <h3>Folder Media &amp; Assets ({{ folderAssets.length }})</h3>
        </div>
        <button type="button" class="btn btn-xs" @click="showAssetGallery = !showAssetGallery">
          {{ showAssetGallery ? 'Hide Gallery' : 'Show Gallery' }}
        </button>
      </div>
      <div v-if="showAssetGallery" class="asset-grid">
        <div v-for="asset in folderAssets" :key="asset.name" class="asset-card">
          <img :src="assetUrl(asset.name)" :alt="asset.name" class="asset-thumb" loading="lazy" />
          <div class="asset-info">
            <span class="asset-name" :title="asset.name">{{ asset.name }}</span>
            <div class="asset-actions">
              <button
                type="button"
                class="btn btn-xs"
                title="Copy Markdown image reference"
                @click="copyAssetRef(asset.name)"
              >
                {{ copiedAsset === asset.name ? '✓' : 'Copy MD' }}
              </button>
              <button
                v-if="auth.user"
                type="button"
                class="btn btn-xs btn-danger"
                title="Delete asset"
                @click="deleteAsset(asset.name)"
              >
                <svg class="ui-icon ui-icon--sm" aria-hidden="true"><use href="#ui-trash"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
const api = useApi()
const auth = useAuth()
const route = useRoute()
const router = useRouter()
const panel = useFolderPanel()
const docViewer = useDocViewer()
const uploadModal = useUploadModal()

onMounted(() => {
  const q = route.query.folder
  if (q === 'root') panel.pickFolder(null)
  else if (q) panel.pickFolder(q)
})

const selectedFolderId = panel.selectedFolderId

// Filter & Sort state
const filterText = ref('')
const debouncedFilter = ref('')
const sortOption = ref('updated_at:desc')
let filterTimer = null

watch(filterText, (val) => {
  if (filterTimer) clearTimeout(filterTimer)
  filterTimer = setTimeout(() => {
    debouncedFilter.value = val.trim()
    page.value = 1
  }, 220)
})

watch(sortOption, () => { page.value = 1 })

function goToFullSearch() {
  if (filterText.value.trim()) {
    router.push({ path: '/search', query: { q: filterText.value.trim() } })
  }
}

// Multi-select
const selectMode = ref(false)
const selectedIds = reactive(new Set())
const batchMoving = ref(false)

function toggleSelectMode() { selectMode.value = !selectMode.value; if (!selectMode.value) selectedIds.clear() }
function toggleSelect(id) { selectedIds.has(id) ? selectedIds.delete(id) : selectedIds.add(id) }
function clearSelection() { selectedIds.clear(); selectMode.value = false }
const allSelected = computed(() => documents.value?.length > 0 && documents.value.every(d => selectedIds.has(d.id)))
function toggleSelectAll() {
  if (allSelected.value) { documents.value.forEach(d => selectedIds.delete(d.id)) }
  else { documents.value.forEach(d => selectedIds.add(d.id)) }
}

function onDocCardClick(docId) {
  if (selectMode.value) {
    toggleSelect(docId)
  } else {
    docViewer.openDoc(docId)
  }
}

async function batchDeleteSelected() {
  if (!confirm(`Delete ${selectedIds.size} documents?`)) return
  try { await api.batchDelete([...selectedIds]); selectedIds.clear(); await refreshDocs(); await refreshAllDocs(); panel.notifyFolderChange() }
  catch (e) { console.error('Batch delete failed', e) }
}
async function batchMoveSelected() { batchMoving.value = true }
async function doBatchMove(folderId) {
  batchMoving.value = false
  try { await api.batchMove([...selectedIds], folderId); selectedIds.clear(); await refreshDocs(); await refreshAllDocs(); panel.notifyFolderChange() }
  catch (e) { console.error('Batch move failed', e) }
}
async function batchDownloadSelected() {
  if (selectedIds.size === 1) {
    await api.downloadDocument([...selectedIds][0])
  } else {
    await api.batchDownload([...selectedIds])
  }
}

// Folders
const { data: allFolders, refresh: refreshFolders } = await useAsyncData('folders', async () => {
  if (import.meta.server || !auth.isLoggedIn) return []
  try { return await api.getFolders() } catch { return [] }
}, { default: () => [], server: false })

function folderNameById(id) {
  return (allFolders.value || []).find(f => f.id === id)?.name || ''
}

const folderBreadcrumbs = computed(() => {
  if (!selectedFolderId.value) return []
  const map = new Map((allFolders.value || []).map(f => [f.id, f]))
  const trail = []
  let cur = map.get(selectedFolderId.value)
  while (cur && trail.length < 10) {
    trail.unshift(cur)
    cur = cur.parent_id ? map.get(cur.parent_id) : null
  }
  return trail
})

const quickFolders = computed(() => {
  const list = allFolders.value || []
  if (selectedFolderId.value && typeof selectedFolderId.value === 'string') {
    const children = list.filter(f => f.parent_id === selectedFolderId.value)
    if (children.length) return children.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 8)
  }
  return list.filter(f => !f.parent_id).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 8)
})

// Documents filtered by selected folder, search filter, and sort order
const PAGE_SIZE = 24
const page = ref(1)
const totalDocs = ref(0)
const totalPages = computed(() => Math.max(1, Math.ceil(totalDocs.value / PAGE_SIZE)))

const { data: documents, refresh: refreshDocs } = await useAsyncData('documents', async () => {
  if (import.meta.server || !auth.isLoggedIn) return []
  try {
    const [sort_by, sort_order] = (sortOption.value || 'updated_at:desc').split(':')
    const params = { page: page.value, page_size: PAGE_SIZE, sort_by, sort_order }
    if (selectedFolderId.value === null) params.folder_id = 'root'
    else if (selectedFolderId.value !== undefined) params.folder_id = selectedFolderId.value
    if (debouncedFilter.value) params.q = debouncedFilter.value
    const res = await api.getDocumentsPaged(params)
    totalDocs.value = res?.pagination?.total || 0
    return res?.data || []
  } catch { return [] }
}, { watch: [selectedFolderId, page, debouncedFilter, sortOption], default: () => [], server: false })

watch(selectedFolderId, () => { page.value = 1 })

const { data: allDocuments, refresh: refreshAllDocs } = await useAsyncData('all-documents', async () => {
  if (import.meta.server || !auth.isLoggedIn) return []
  try { return await api.getDocuments({ page_size: 100 }) } catch { return [] }
}, { default: () => [], server: false })

watch(() => auth.isLoggedIn, async (loggedIn) => {
  if (loggedIn) {
    await refreshFolders()
    await refreshDocs()
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

const selectedFolderLabel = computed(() => {
  if (selectedFolderId.value === undefined) return 'All Documents'
  if (selectedFolderId.value === null) return 'Root (Unfiled)'
  return (allFolders.value || []).find(f => f.id === selectedFolderId.value)?.name || 'Documents'
})

watch(() => panel.folderRefreshKey.value, async () => {
  await refreshFolders()
  await refreshDocs()
  await refreshAllDocs()
})

// ── Document move ────────────────────────────────────────────────────────────
const moveDocId = ref(null)
const movingDocFolderId = computed(() => {
  if (!moveDocId.value) return null
  const doc = (documents.value || []).find(d => d.id === moveDocId.value) || (allDocuments.value || []).find(d => d.id === moveDocId.value)
  return doc?.folder_id || null
})

function openMoveModal(docId) { moveDocId.value = docId }

async function moveDoc(docId, folderId) {
  moveDocId.value = null
  try { await api.moveDocument(docId, folderId); await refreshDocs(); await refreshAllDocs(); panel.notifyFolderChange() }
  catch (e) { console.error('Move failed', e) }
}

// ── Document delete ──────────────────────────────────────────────────────────
async function handleDeleteDoc(id) {
  if (!confirm('Delete this document?')) return
  try { await api.deleteDocument(id); await refreshDocs(); await refreshAllDocs(); panel.notifyFolderChange() }
  catch (e) { console.error('Delete failed', e) }
}

function formatDate(date) {
  if (!date) return ''
  return new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// ── View mode ────────────────────────────────────────────────────────────────
const viewMode = ref(import.meta.client ? (localStorage.getItem('viewMode') || 'card') : 'card')
watch(viewMode, v => { if (import.meta.client) localStorage.setItem('viewMode', v) })

// ── Folder Asset Upload ──────────────────────────────────────────────────────
const showAssetUpload = ref(false)
const showAssetGallery = ref(true)
const assetFiles = ref([])
const assetUploading = ref(false)
const assetUploadError = ref('')
const isDragging = ref(false)
const folderAssets = ref([])
const copiedAsset = ref('')

const currentAssetFolderId = computed(() => selectedFolderId.value === null ? 'root' : selectedFolderId.value)

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function onAssetFilePick(e) {
  assetFiles.value = [...assetFiles.value, ...Array.from(e.target.files)]
}

function onDrop(e) {
  isDragging.value = false
  const dropped = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/') || f.name.endsWith('.svg'))
  assetFiles.value = [...assetFiles.value, ...dropped]
}

async function doAssetUpload() {
  if (!assetFiles.value.length) return
  assetUploading.value = true
  assetUploadError.value = ''
  const formData = new FormData()
  for (const f of assetFiles.value) formData.append('files', f)
  try {
    await api.uploadFolderAssets(currentAssetFolderId.value, formData)
    assetFiles.value = []
    showAssetUpload.value = false
    await refreshFolderAssets()
  } catch (e) {
    assetUploadError.value = e.data?.error?.message || e.message || 'Upload failed'
  } finally {
    assetUploading.value = false
  }
}

function assetUrl(filename) {
  return api.folderAssetUrl(currentAssetFolderId.value, filename)
}

function copyAssetRef(filename) {
  const url = assetUrl(filename)
  const md = `![${filename}](${url})`
  navigator.clipboard.writeText(md)
  copiedAsset.value = filename
  setTimeout(() => { copiedAsset.value = '' }, 2000)
}

async function deleteAsset(filename) {
  if (!confirm(`Delete "${filename}"?`)) return
  try {
    await api.deleteFolderAsset(currentAssetFolderId.value, filename)
    await refreshFolderAssets()
  } catch (e) {
    console.error('Delete asset failed', e)
  }
}

async function refreshFolderAssets() {
  if (selectedFolderId.value === undefined) { folderAssets.value = []; return }
  try {
    const res = await api.getFolderAssets(currentAssetFolderId.value)
    folderAssets.value = res.assets || []
  } catch { folderAssets.value = [] }
}

watch(selectedFolderId, () => refreshFolderAssets(), { immediate: true })
</script>

<style scoped>
.page {
  width: 100%;
}

/* ── Quick Folder Strip ────────────────────────────────────────────────── */
.folder-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: thin;
}

.folder-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 34px;
  padding: 6px 13px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--ink-secondary);
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.folder-chip:hover {
  background: var(--raised);
  color: var(--ink);
  border-color: var(--line-strong);
}

.folder-chip.active {
  background: var(--accent-soft);
  border-color: transparent;
  color: var(--accent);
}

.folder-chip--more {
  border-style: dashed;
  color: var(--muted);
}

.workspace-bar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ── Card Grid View ────────────────────────────────────────────────────── */
.documents-card {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 18px;
}

.doc-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-width: 0;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

.doc-card:hover {
  transform: translateY(-3px);
  border-color: var(--line-strong);
  box-shadow: var(--shadow-md);
}

.doc-card.selected {
  border-color: var(--accent-solid);
  background: var(--accent-soft);
}

.doc-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.doc-card-badges {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
}

.doc-folder-pill {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.doc-ver-pill {
  font-size: 10.5px;
  padding: 2px 7px;
}

.card-icon-btn {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.card-icon-btn:hover {
  background: var(--raised);
  color: var(--ink);
}

.card-icon-btn--danger:hover {
  background: var(--danger-soft);
  color: var(--danger);
}

.doc-card-body {
  flex: 1;
  min-width: 0;
}

.doc-card-title {
  margin: 0 0 8px;
  font-size: 15.5px;
  font-weight: 650;
  line-height: 1.4;
  letter-spacing: -0.015em;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.doc-card-title a {
  color: var(--ink);
  text-decoration: none;
}

.doc-card:hover .doc-card-title a {
  color: var(--accent);
}

.doc-card-desc {
  margin: 0 0 12px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.doc-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 12px;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--raised);
  border: 1px solid var(--line);
  color: var(--ink-secondary);
  font-size: 11.5px;
  font-weight: 550;
  text-decoration: none;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.tag-chip:hover {
  background: var(--accent-soft);
  border-color: transparent;
  color: var(--accent);
}

.doc-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 12px;
}

.doc-author {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-weight: 550;
}

/* ── Compact List View ─────────────────────────────────────────────────── */
.documents-compact {
  display: grid;
  gap: 8px;
}

.compact-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.compact-row:hover {
  border-color: var(--line-strong);
  background: var(--raised);
}

.compact-row.selected {
  border-color: var(--accent-solid);
  background: var(--accent-soft);
}

.compact-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: var(--accent-soft);
  color: var(--accent);
  flex-shrink: 0;
}

.compact-main {
  flex: 1;
  min-width: 0;
}

.compact-title {
  display: block;
  font-size: 14px;
  font-weight: 650;
  color: var(--ink);
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.compact-row:hover .compact-title {
  color: var(--accent);
}

.compact-desc {
  display: block;
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.compact-badges {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.compact-date {
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
  flex-shrink: 0;
}

/* ── Table View Extras ─────────────────────────────────────────────────── */
.doc-row {
  cursor: pointer;
}

.doc-row.selected td {
  background: var(--accent-soft);
}

.table-doc-title {
  display: block;
  font-weight: 650;
  color: var(--ink);
  text-decoration: none;
}

.doc-row:hover .table-doc-title {
  color: var(--accent);
}

.table-doc-desc {
  display: block;
  font-size: 12px;
  color: var(--muted);
  margin-top: 2px;
  max-width: 440px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.table-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.td-date,
.td-by {
  font-size: 12.5px;
  color: var(--muted);
  white-space: nowrap;
}

.doc-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

/* ── Pagination ────────────────────────────────────────────────────────── */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  margin-top: 26px;
}

.pagination-info {
  color: var(--muted);
  font-size: 13px;
}

/* ── Batch Bar ─────────────────────────────────────────────────────────── */
.doc-check {
  width: 16px;
  height: 16px;
  cursor: pointer;
  flex-shrink: 0;
  accent-color: var(--accent-solid);
}

.col-check {
  width: 38px;
  text-align: center;
}

.batch-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  background: var(--surface);
  border: 1.5px solid var(--accent-solid);
  border-radius: 12px;
  margin-bottom: 18px;
  box-shadow: var(--shadow-md);
  position: sticky;
  top: 14px;
  z-index: 35;
  flex-wrap: wrap;
}

.batch-bar-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.batch-count {
  font-weight: 700;
  font-size: 13.5px;
  color: var(--ink);
}

.batch-bar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* ── Move Modal List ───────────────────────────────────────────────────── */
.move-list {
  max-height: 320px;
  overflow-y: auto;
  border: 1px solid var(--line);
  border-radius: 10px;
  display: grid;
}

.move-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 10px 14px;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
  cursor: pointer;
  font-size: 13.5px;
  font-weight: 550;
  color: var(--ink);
  text-align: left;
}

.move-item:last-child {
  border-bottom: 0;
}

.move-item:hover {
  background: var(--raised);
}

.move-item.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 650;
}

/* ── Asset Upload & Gallery ────────────────────────────────────────────── */
.asset-folder-label {
  font-size: 13px;
  color: var(--muted);
  margin: 0 0 12px;
}

.drop-zone {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1.5px dashed var(--line-strong);
  border-radius: 12px;
  padding: 28px 16px;
  text-align: center;
  color: var(--muted);
  background: var(--canvas);
  cursor: pointer;
  transition: all 0.16s;
  margin-bottom: 12px;
}

.drop-zone.dragover,
.drop-zone:hover {
  border-color: var(--accent-solid);
  background: var(--accent-soft);
  color: var(--accent);
}

.drop-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.asset-file-list {
  margin-bottom: 12px;
  max-height: 160px;
  overflow-y: auto;
}

.asset-file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  font-size: 12.5px;
  border-bottom: 1px solid var(--line);
}

.asset-file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-file-size {
  color: var(--muted);
  font-size: 11.5px;
}

.asset-gallery {
  margin-top: 28px;
}

.asset-gallery-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.asset-gallery-title {
  display: flex;
  align-items: center;
  gap: 9px;
}

.asset-gallery-title .ui-icon {
  color: var(--accent);
}

.asset-gallery-title h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(156px, 1fr));
  gap: 12px;
}

.asset-card {
  background: var(--canvas);
  border: 1px solid var(--line);
  border-radius: 10px;
  overflow: hidden;
}

.asset-thumb {
  width: 100%;
  height: 110px;
  object-fit: cover;
  display: block;
  background: var(--raised);
}

.asset-info {
  padding: 8px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.asset-name {
  flex: 1;
  font-size: 11.5px;
  color: var(--ink-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-actions {
  display: flex;
  gap: 4px;
}

@media (max-width: 768px) {
  .col-hide-sm,
  .compact-badges {
    display: none;
  }
  .documents-card {
    grid-template-columns: 1fr;
  }
}
</style>
