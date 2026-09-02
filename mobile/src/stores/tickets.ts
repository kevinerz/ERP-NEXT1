import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../services/api'

export const useTicketsStore = defineStore('tickets', () => {
  const tickets = ref<any[]>([])
  const loading = ref(false)
  const error = ref('')

  async function fetchTickets(status?: string) {
    loading.value = true
    error.value = ''
    try {
      const { data } = await api.get('/mobile/tickets', { params: status ? { status } : {} })
      tickets.value = data
    } catch (e: any) {
      error.value = e?.response?.data?.message || 'Gagal memuat tiket'
    } finally {
      loading.value = false
    }
  }

  async function acceptTicket(id: number) {
    const { data } = await api.patch(`/mobile/tickets/${id}/accept`)
    const idx = tickets.value.findIndex(t => t.id_ticket === id)
    if (idx >= 0) tickets.value[idx] = data
    return data
  }

  async function resolveTicket(id: number, catatan: string) {
    const { data } = await api.patch(`/mobile/tickets/${id}/resolve`, { catatan })
    const idx = tickets.value.findIndex(t => t.id_ticket === id)
    if (idx >= 0) tickets.value[idx] = data
    return data
  }

  return { tickets, loading, error, fetchTickets, acceptTicket, resolveTicket }
})
