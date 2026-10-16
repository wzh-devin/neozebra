type AppLocale = 'zh-CN' | 'en-US'
const localeStorageKey = 'neozebra.locale'
const listenerSet = new Set<() => void>()

// 浏览器不允许访问本地存储时，仍能使用默认中文界面。
const readLocale = (): AppLocale => {
  try {
    return globalThis.localStorage?.getItem(localeStorageKey) === 'en-US'
      ? 'en-US'
      : 'zh-CN'
  } catch {
    return 'zh-CN'
  }
}
let locale = readLocale()
const getLocale = () => locale
const subscribeLocale = (listener: () => void) => {
  listenerSet.add(listener)
  return () => listenerSet.delete(listener)
}

/**
 * 切换界面语言并保存选择，存储不可用时仍更新当前会话。
 *
 * @param nextLocale - 用户选择的语言
 * @returns 是否成功保存；通知界面订阅者重新渲染
 */
const setLocale = (nextLocale: AppLocale): boolean => {
  locale = nextLocale
  let saved = true
  try {
    globalThis.localStorage.setItem(localeStorageKey, nextLocale)
  } catch {
    saved = false
  }
  listenerSet.forEach((listener) => listener())
  return saved
}
export { getLocale, setLocale, subscribeLocale }
export type { AppLocale }
