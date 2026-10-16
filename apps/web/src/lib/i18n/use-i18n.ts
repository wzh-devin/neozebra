import { useSyncExternalStore } from 'react'
import { getLocale, setLocale, subscribeLocale } from './locale-store.ts'
import { t } from './translate.ts'

// 订阅共享语言状态，切换语言时保留组件、表单和请求缓存。
const useI18n = () => {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getLocale)
  return { locale, t, setLocale }
}
export { useI18n }
