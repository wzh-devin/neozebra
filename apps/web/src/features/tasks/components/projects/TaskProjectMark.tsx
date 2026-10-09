import {
  BookOpen,
  Briefcase,
  Code2,
  Leaf,
  Rocket,
  Sparkles,
} from 'lucide-react'
import type { TaskProject } from '@/features/tasks/types'
import styles from '@/features/tasks/components/projects/TaskProjectMark.module.css'

const iconRecord = {
  code: Code2,
  sparkles: Sparkles,
  book: BookOpen,
  briefcase: Briefcase,
  leaf: Leaf,
  rocket: Rocket,
}

/**
 * 展示贯穿项目卡片和清单的图标与颜色。
 *
 * @param props - 项目与尺寸
 * @returns 项目图标 JSX
 */
export const TaskProjectMark = ({
  project,
  small = false,
}: {
  project?: TaskProject
  small?: boolean
}) => {
  const Icon = project ? iconRecord[project.icon] : Sparkles
  return (
    <span
      className={styles.mark}
      data-color={project?.color ?? 'blue'}
      data-small={small}
    >
      <Icon aria-hidden="true" />
    </span>
  )
}
