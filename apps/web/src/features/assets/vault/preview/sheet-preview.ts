import sheetPreviewTemplate from './sheet-preview.html?raw'
import { getLocale, getTranslation } from '@/lib/i18n'
import type { AppLocale } from '@/lib/i18n/locale-store'

/**
 * 为隔离的表格 iframe 填充同源票据地址，页面模板只由前端维护。
 *
 * @param url - 后端返回的短期预览地址
 * @param name - 原文件名，用于区分文本表格和工作簿
 * @param origin - 当前前端 origin
 * @param locale - 当前界面语言，默认使用已选语言
 * @returns 不具备应用同源权限的 iframe 文档
 */
const buildVaultSheetDocument = (
  url: string,
  name: string,
  origin: string,
  locale: AppLocale = getLocale(),
): string => {
  const t = (message: string) => getTranslation(message, locale)
  const viewer = new URL(url, origin)
  if (
    viewer.origin !== origin ||
    !/^\/api\/assets\/vault\/viewer\/[a-f0-9]{64}\/onlinePreview$/.test(
      viewer.pathname,
    )
  ) {
    throw new Error('表格预览地址无效')
  }
  const base = new URL('./', viewer).href
  return sheetPreviewTemplate
    .replace('__UI_CONFIG__', () =>
      JSON.stringify({
        locale,
        loading: t('正在读取工作表…'),
        readError: t('读取失败'),
        sizeError: t('表格超过 25 MiB，请下载查看'),
        sheetsError: t('工作表超过 100 张，请下载查看'),
        rangeError: t('表格范围过大，请下载原文件查看'),
        missingValue: t('（无缓存值）'),
        ready: t('只读 · {0} 个工作表 · 显示文件保存时的结果'),
        error: t('表格无法读取'),
      }).replaceAll('<', '\\u003c'),
    )
    .replaceAll('__CSP_ORIGIN__', origin)
    .replace('__ORIGIN__', JSON.stringify(origin))
    .replaceAll('__DELIMITED__', String(/\.(csv|tsv)$/i.test(name)))
    .replaceAll('="xspreadsheet/', '="' + base + 'xspreadsheet/')
    .replace(
      "fetch('getCorsFile')",
      'fetch(' + JSON.stringify(base + 'getCorsFile') + ')',
    )
}

export { buildVaultSheetDocument }
