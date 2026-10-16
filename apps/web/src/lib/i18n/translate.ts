import { messageList } from './messages/index.ts'
import { getLocale, type AppLocale } from './locale-store.ts'

const chineseMessageMap = new Map<string, string>()
const englishMessageMap = new Map<string, string>()
for (const [chinese, english] of messageList) {
  chineseMessageMap.set(chinese, chinese)
  chineseMessageMap.set(english, chinese)
  englishMessageMap.set(chinese, english)
  englishMessageMap.set(english, english)
}

/**
 * 翻译产品文案并插入参数，未知消息原样保留，参数内容不参与翻译。
 *
 * @param message - 词典中的原始界面文案
 * @param locale - 目标语言
 * @param values - 插入到编号占位符的文件名、数量等值
 * @returns 翻译后的纯文本
 */
const getTranslation = (
  message: string,
  locale: AppLocale,
  ...values: unknown[]
) => {
  const dictionary = locale === 'en-US' ? englishMessageMap : chineseMessageMap
  const translated = dictionary.get(message) ?? message
  return translated.replace(/\{(\d+)\}/g, (placeholder, index: string) =>
    Number(index) < values.length
      ? String(values[Number(index)] ?? '')
      : placeholder,
  )
}
const t = (message: string, ...values: unknown[]) =>
  getTranslation(message, getLocale(), ...values)
export { getTranslation, t }
