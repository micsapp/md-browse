<template>
  <Teleport to="body">
    <!-- Desktop: multiple non-blocking floating modals (no overlay) -->
    <template v-if="!isMobile">
      <DocViewerModalItem
        v-for="modal in viewer.modals.value"
        :key="modal.uid"
        :modal="modal"
        :mobile="false"
      />
    </template>

    <!-- Mobile: single full-screen blocking modal -->
    <template v-else-if="viewer.modals.value.length">
      <div class="mobile-overlay" @click.self="closeMobile"></div>
      <DocViewerModalItem
        :modal="viewer.modals.value[viewer.modals.value.length - 1]"
        :mobile="true"
      />
    </template>
  </Teleport>
</template>

<script setup>
const viewer = useDocViewer()

const isMobile = ref(false)

if (import.meta.client) {
  const update = () => { isMobile.value = window.innerWidth <= 768 }
  onMounted(() => {
    update()
    window.addEventListener('resize', update)
    // Escape key: close topmost modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && viewer.modals.value.length) {
        const top = [...viewer.modals.value].sort((a, b) => b.zIndex - a.zIndex)[0]
        viewer.closeDoc(top.uid)
      }
    })
  })
  onUnmounted(() => window.removeEventListener('resize', update))
}

function closeMobile() {
  if (viewer.modals.value.length) {
    viewer.closeDoc(viewer.modals.value[viewer.modals.value.length - 1].uid)
  }
}
</script>

<style scoped>
.mobile-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 819;
}
</style>
