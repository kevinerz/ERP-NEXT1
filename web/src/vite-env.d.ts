/// <reference types="vite/client" />

declare const __APP_VERSION__: string
declare const __APP_GIT_HASH__: string
declare const __APP_CHANGELOG__: Array<{
  version: string
  hash: string
  date: string
  type: string
  subject: string
}>
