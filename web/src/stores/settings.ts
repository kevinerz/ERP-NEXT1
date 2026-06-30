import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/services/api'

export interface CompanySettings {
  company_name: string
  company_brand: string
  company_tagline: string
  company_address: string
  company_city: string
  company_phone: string
  company_email: string
  company_website: string
  company_npwp: string
  company_logo_url: string
  invoice_prefix: string
  invoice_footer: string
  currency_symbol: string
  timezone: string
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<CompanySettings>({
    company_name: 'PT Perdana Global Internet',
    company_brand: 'Next1',
    company_tagline: 'Internet Service Provider',
    company_address: '',
    company_city: '',
    company_phone: '',
    company_email: '',
    company_website: '',
    company_npwp: '',
    company_logo_url: '',
    invoice_prefix: 'INV',
    invoice_footer: 'Terima kasih atas kepercayaan Anda.',
    currency_symbol: 'Rp',
    timezone: 'Asia/Jakarta',
  })

  const loaded = ref(false)

  async function fetch() {
    try {
      const r = await api.get('/settings')
      Object.assign(settings.value, r.data.data)
      loaded.value = true
    } catch {
      // use defaults
    }
  }

  return { settings, loaded, fetch }
})
