<script setup lang="ts">
import { useRouter } from 'vue-router'
const router = useRouter()

const menus = [
  { icon: '🌐', label: 'Layanan', desc: 'FO, M2M, Starlink, dll', to: '/master/layanan' },
  { icon: '🏢', label: 'Vendor ISP', desc: 'ISP, vendor, mitra jaringan', to: '/master/vendor' },
]
</script>

<template>
  <div class="page">
    <h2>Master Data</h2>
    <p class="sub">Data referensi yang digunakan oleh modul lain</p>
    <div class="grid">
      <div
        v-for="m in menus"
        :key="m.to"
        class="card"
        @click="router.push(m.to)"
      >
        <div class="icon">{{ m.icon }}</div>
        <div class="label">{{ m.label }}</div>
        <div class="desc">{{ m.desc }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; }
.page h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; }
.sub { margin: 0 0 28px; font-size: 13px; color: #64748b; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; max-width: 700px; }
.card {
  background: #fff; border-radius: 12px; padding: 28px 20px;
  text-align: center; cursor: pointer;
  box-shadow: 0 1px 3px rgba(0,0,0,0.07);
  transition: box-shadow 0.2s, transform 0.2s;
}
.card:hover { box-shadow: 0 6px 20px rgba(30,64,175,0.15); transform: translateY(-2px); }
.icon { font-size: 32px; margin-bottom: 12px; }
.label { font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 6px; }
.desc { font-size: 12px; color: #64748b; }
</style>
