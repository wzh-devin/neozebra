import { useI18n, t } from '@/lib/i18n'
import type { DashboardSummaryItem } from '@/features/dashboard/types'
import styles from '@/features/dashboard/components/DashboardSummary.module.css'

/**
 * 渲染一项概览统计，保持标签、数值和说明的语义关联。
 *
 * @param item - 统计内容和图标
 * @returns 统计定义项 JSX
 */
const renderSummaryItem = (item: DashboardSummaryItem) => {
  const Icon = item.icon
  return (
    <div key={item.label} className={styles.item}>
      <dt className={styles.label}>
        <Icon aria-hidden="true" style={{ color: item.color }} />
        {t(item.label)}
      </dt>
      <dd className={styles.value}>{item.value}</dd>
      <dd className={styles.detail}>{t(item.detail)}</dd>
    </div>
  )
}

/**
 * 将已有统计汇总为一个紧凑概览区域。
 *
 * @param props - 概览统计列表
 * @returns 统计区域 JSX
 */
const DashboardSummary = ({
  summaryList,
}: {
  summaryList: DashboardSummaryItem[]
}) => {
  const { t } = useI18n()
  return (
    <dl className={styles.summary} aria-label={t('Workspace summary')}>
      {summaryList.map(renderSummaryItem)}
    </dl>
  )
}

export { DashboardSummary }
