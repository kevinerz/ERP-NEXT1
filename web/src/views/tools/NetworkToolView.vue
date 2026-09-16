<script setup lang="ts">
import { ref, computed } from 'vue'
import api from '@/services/api'

type Tab = 'ping' | 'traceroute' | 'mtr' | 'dns' | 'port'

const tabs: { key: Tab; label: string; emoji: string; desc: string }[] = [
  { key: 'ping',       label: 'Ping',       emoji: '🏓', desc: 'Cek konektivitas & latensi' },
  { key: 'traceroute', label: 'Traceroute', emoji: '🗺️', desc: 'Lacak jalur routing hop per hop' },
  { key: 'mtr',        label: 'MTR',        emoji: '📡', desc: 'Gabungan ping + traceroute (statistik lengkap)' },
  { key: 'dns',        label: 'DNS Lookup', emoji: '🔍', desc: 'Cek resolusi DNS domain' },
  { key: 'port',       label: 'Port Check', emoji: '🔌', desc: 'Cek apakah port TCP terbuka' },
]

const activeTab = ref<Tab>('ping')
const host      = ref('')
const portNum   = ref('')
const pingCount = ref('5')
const maxHops   = ref('30')
const dnsType   = ref('A')

const loading   = ref(false)
const result    = ref<any>(null)
const error     = ref('')
const elapsed   = ref(0)

let timer: ReturnType<typeof setInterval> | null = null

const dnsTypes = ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME', 'PTR', 'SOA']

const pingStatusColor = computed(() => {
  if (!result.value?.stats) return ''
  const loss = result.value.stats.loss_pct
  if (loss === 0) return 'good'
  if (loss < 50) return 'warn'
  return 'bad'
})

async function run() {
  if (!host.value.trim()) { error.value = 'Masukkan host / IP dulu'; return }
  if (activeTab.value === 'port' && !portNum.value) { error.value = 'Masukkan nomor port'; return }
  loading.value = true
  error.value   = ''
  result.value  = null
  elapsed.value = 0

  timer = setInterval(() => { elapsed.value++ }, 1000)

  try {
    let res: any
    const h = host.value.trim()
    if (activeTab.value === 'ping') {
      res = await api.get('/tools/ping', { params: { host: h, count: pingCount.value } })
    } else if (activeTab.value === 'traceroute') {
      res = await api.get('/tools/traceroute', { params: { host: h, maxhops: maxHops.value } })
    } else if (activeTab.value === 'mtr') {
      res = await api.get('/tools/mtr', { params: { host: h } })
    } else if (activeTab.value === 'dns') {
      res = await api.get('/tools/dns', { params: { host: h, type: dnsType.value } })
    } else if (activeTab.value === 'port') {
      res = await api.get('/tools/port', { params: { host: h, port: portNum.value } })
    }
    result.value = res.data
  } catch (e: any) {
    error.value = e.response?.data?.message || 'Request gagal'
  } finally {
    loading.value = false
    if (timer) { clearInterval(timer); timer = null }
  }
}

function setTab(t: Tab) {
  activeTab.value = t
  result.value    = null
  error.value     = ''
  elapsed.value   = 0
}

function quickSet(h: string, p?: string) {
  host.value = h
  if (p) portNum.value = p
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>Network Tools</h2>
        <p class="sub">Ping, Traceroute, MTR, DNS Lookup, Port Check — dijalankan dari server</p>
      </div>
    </div>

    <!-- Tab Navigation -->
    <div class="tab-nav">
      <button
        v-for="t in tabs" :key="t.key"
        :class="['tab-btn', { active: activeTab === t.key }]"
        @click="setTab(t.key)"
      >
        <span class="tab-emoji">{{ t.emoji }}</span>
        <span class="tab-label">{{ t.label }}</span>
      </button>
    </div>

    <div class="tool-card">
      <!-- Tab Description -->
      <div class="tab-desc">
        {{ tabs.find(t => t.key === activeTab)?.emoji }}
        {{ tabs.find(t => t.key === activeTab)?.desc }}
      </div>

      <!-- Input Area -->
      <div class="input-area">
        <div class="input-row">
          <div class="field-wrap">
            <label>Host / IP Address</label>
            <input
              v-model="host"
              placeholder="8.8.8.8 atau google.com"
              @keyup.enter="run"
              class="host-input"
            />
          </div>

          <div v-if="activeTab === 'ping'" class="field-wrap narrow">
            <label>Jumlah Paket</label>
            <input v-model="pingCount" type="number" min="1" max="20" class="narrow-input" />
          </div>

          <div v-if="activeTab === 'traceroute'" class="field-wrap narrow">
            <label>Max Hops</label>
            <input v-model="maxHops" type="number" min="5" max="64" class="narrow-input" />
          </div>

          <div v-if="activeTab === 'dns'" class="field-wrap narrow">
            <label>Tipe Record</label>
            <select v-model="dnsType" class="narrow-input">
              <option v-for="t in dnsTypes" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>

          <div v-if="activeTab === 'port'" class="field-wrap narrow">
            <label>Port</label>
            <input v-model="portNum" type="number" min="1" max="65535" placeholder="80" class="narrow-input" @keyup.enter="run" />
          </div>

          <button class="run-btn" @click="run" :disabled="loading">
            <span v-if="loading" class="spin">⟳</span>
            <span v-else>▶ Jalankan</span>
          </button>
        </div>

        <!-- Quick Hosts -->
        <div class="quick-hosts">
          <span class="quick-label">Quick:</span>
          <button class="qbtn" @click="quickSet('8.8.8.8')">8.8.8.8 (Google DNS)</button>
          <button class="qbtn" @click="quickSet('1.1.1.1')">1.1.1.1 (Cloudflare)</button>
          <button class="qbtn" @click="quickSet('103.12.28.12')">103.12.28.12 (Server)</button>
          <button class="qbtn" @click="quickSet('nextone.id')">nextone.id</button>
          <button v-if="activeTab === 'port'" class="qbtn" @click="quickSet('', '80')">Port 80</button>
          <button v-if="activeTab === 'port'" class="qbtn" @click="quickSet('', '443')">Port 443</button>
          <button v-if="activeTab === 'port'" class="qbtn" @click="quickSet('', '3306')">Port 3306</button>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="terminal-loading">
        <div class="pulse-dot"></div>
        <span>Menjalankan {{ activeTab }} ke <strong>{{ host }}</strong>... ({{ elapsed }}s)</span>
      </div>

      <!-- Error -->
      <div v-if="error && !loading" class="alert-err">⚠ {{ error }}</div>

      <!-- Ping Result - Summary Cards -->
      <div v-if="activeTab === 'ping' && result?.stats" class="ping-summary">
        <div :class="['stat-box', pingStatusColor]">
          <div class="stat-val">{{ result.stats.loss_pct }}%</div>
          <div class="stat-lbl">Packet Loss</div>
        </div>
        <div class="stat-box">
          <div class="stat-val">{{ result.stats.transmitted }}</div>
          <div class="stat-lbl">Terkirim</div>
        </div>
        <div class="stat-box">
          <div class="stat-val">{{ result.stats.received }}</div>
          <div class="stat-lbl">Diterima</div>
        </div>
        <div v-if="result.stats.rtt_avg !== null" class="stat-box">
          <div class="stat-val">{{ result.stats.rtt_avg }}ms</div>
          <div class="stat-lbl">RTT Avg</div>
        </div>
        <div v-if="result.stats.rtt_min !== null" class="stat-box">
          <div class="stat-val">{{ result.stats.rtt_min }}ms</div>
          <div class="stat-lbl">RTT Min</div>
        </div>
        <div v-if="result.stats.rtt_max !== null" class="stat-box">
          <div class="stat-val">{{ result.stats.rtt_max }}ms</div>
          <div class="stat-lbl">RTT Max</div>
        </div>
      </div>

      <!-- Port Check Result -->
      <div v-if="activeTab === 'port' && result" class="port-result">
        <div :class="['port-badge', result.open ? 'port-open' : 'port-closed']">
          {{ result.open ? '✓ TERBUKA' : '✗ TERTUTUP' }}
        </div>
        <span class="port-detail">{{ result.output }}</span>
      </div>

      <!-- Terminal Output -->
      <div v-if="result?.output && !loading" class="terminal">
        <div class="terminal-bar">
          <span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
          <span class="terminal-title">
            {{ activeTab }} {{ result.host }}
            <span v-if="activeTab === 'port'">:{{ portNum }}</span>
          </span>
        </div>
        <pre class="terminal-body">{{ result.output }}</pre>
      </div>

      <!-- Empty State -->
      <div v-if="!result && !loading && !error" class="empty-state">
        <div class="empty-icon">{{ tabs.find(t => t.key === activeTab)?.emoji }}</div>
        <div class="empty-text">Masukkan host dan klik Jalankan</div>
        <div class="empty-sub">Tool dijalankan langsung dari server — tidak dari browser Anda</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 28px 32px; max-width: 960px; }
.page-header { margin-bottom: 20px; }
.page-header h2 { margin: 0 0 4px; font-size: 22px; color: #0f172a; font-weight: 700; }
.sub { margin: 0; font-size: 13px; color: #64748b; }

/* Tabs */
.tab-nav { display: flex; gap: 4px; margin-bottom: 16px; flex-wrap: wrap; }
.tab-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 14px; border: 1.5px solid #e2e8f0; border-radius: 8px;
  background: #fff; font-size: 13px; font-weight: 600; color: #64748b;
  cursor: pointer; transition: all 0.15s;
}
.tab-btn:hover { border-color: #3b82f6; color: #1d4ed8; background: #eff6ff; }
.tab-btn.active { border-color: #3b82f6; background: #1d4ed8; color: #fff; }
.tab-emoji { font-size: 15px; }

/* Tool card */
.tool-card { background: #fff; border-radius: 14px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); overflow: hidden; }
.tab-desc { padding: 12px 20px; background: #f8fafc; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #64748b; }

/* Input */
.input-area { padding: 18px 20px 14px; border-bottom: 1px solid #f1f5f9; }
.input-row { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
.field-wrap { display: flex; flex-direction: column; gap: 5px; }
.field-wrap label { font-size: 12px; font-weight: 600; color: #374151; }
.host-input { padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; min-width: 260px; color: #0f172a; }
.host-input:focus { border-color: #3b82f6; }
.narrow-input { padding: 9px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; width: 90px; color: #0f172a; }
.narrow-input:focus { border-color: #3b82f6; }
.run-btn {
  padding: 9px 22px; background: linear-gradient(135deg, #1e40af, #3b82f6);
  color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 700;
  cursor: pointer; white-space: nowrap; align-self: flex-end;
}
.run-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.spin { display: inline-block; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.quick-hosts { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; align-items: center; }
.quick-label { font-size: 11.5px; color: #94a3b8; font-weight: 600; }
.qbtn { padding: 3px 10px; border: 1px solid #e2e8f0; border-radius: 6px; background: #f8fafc; font-size: 12px; color: #475569; cursor: pointer; }
.qbtn:hover { background: #eff6ff; border-color: #bfdbfe; color: #1d4ed8; }

/* Loading */
.terminal-loading { display: flex; align-items: center; gap: 12px; padding: 28px 20px; color: #64748b; font-size: 14px; }
.pulse-dot { width: 10px; height: 10px; border-radius: 50%; background: #3b82f6; animation: pulse 1s ease-in-out infinite; flex-shrink: 0; }
@keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.7); } }

/* Alerts */
.alert-err { margin: 16px 20px; padding: 10px 14px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 13px; }

/* Ping summary */
.ping-summary { display: flex; gap: 10px; padding: 16px 20px; flex-wrap: wrap; border-bottom: 1px solid #f1f5f9; }
.stat-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 16px; text-align: center; min-width: 80px; }
.stat-val { font-size: 20px; font-weight: 700; color: #0f172a; }
.stat-lbl { font-size: 11px; color: #94a3b8; margin-top: 2px; font-weight: 600; text-transform: uppercase; }
.stat-box.good .stat-val { color: #16a34a; }
.stat-box.warn .stat-val { color: #d97706; }
.stat-box.bad  .stat-val { color: #dc2626; }

/* Port result */
.port-result { display: flex; align-items: center; gap: 14px; padding: 14px 20px; border-bottom: 1px solid #f1f5f9; }
.port-badge { padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: 700; letter-spacing: 0.04em; }
.port-open   { background: #dcfce7; color: #15803d; }
.port-closed { background: #fef2f2; color: #dc2626; }
.port-detail { font-size: 13px; color: #475569; }

/* Terminal */
.terminal { margin: 0; }
.terminal-bar { display: flex; align-items: center; gap: 6px; padding: 9px 16px; background: #1e293b; }
.dot { width: 11px; height: 11px; border-radius: 50%; }
.dot.r { background: #ff5f57; }
.dot.y { background: #ffbd2e; }
.dot.g { background: #28c840; }
.terminal-title { margin-left: 8px; font-size: 12px; color: #94a3b8; font-family: 'Courier New', monospace; }
.terminal-body {
  background: #0f172a; color: #e2e8f0; padding: 16px 20px;
  font-family: 'Courier New', Consolas, monospace; font-size: 13px;
  line-height: 1.65; margin: 0; white-space: pre-wrap; word-break: break-word;
  max-height: 520px; overflow-y: auto;
}

/* Empty */
.empty-state { padding: 52px 20px; text-align: center; }
.empty-icon { font-size: 40px; margin-bottom: 12px; }
.empty-text { font-size: 15px; color: #334155; font-weight: 600; }
.empty-sub  { font-size: 13px; color: #94a3b8; margin-top: 6px; }

@media (max-width: 768px) {
  .page { padding: 16px !important; }
  .host-input { min-width: 0; width: 100%; }
  .input-row { flex-direction: column; }
  .run-btn { width: 100%; padding: 11px; }
  .tab-btn .tab-label { display: none; }
  .tab-emoji { font-size: 18px; }
  .tab-btn { padding: 8px 12px; }
}
</style>
