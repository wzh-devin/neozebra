import { enUS, zhCN } from 'date-fns/locale'
import { getLocale } from './locale-store.ts'

// 使用现有 date-fns 语言包，与应用日期和月历保持一致。
const getDateFnsLocale = () => (getLocale() === 'en-US' ? enUS : zhCN)
export { getDateFnsLocale }
