<script setup lang="ts">
import { RouterView } from 'vue-router'
import DialogHost from '@/components/DialogHost.vue'
import BilahKemajuan from '@/components/BilahKemajuan.vue'
</script>

<template>
  <BilahKemajuan />
  <RouterView />
  <DialogHost />
</template>
