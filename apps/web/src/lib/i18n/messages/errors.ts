const errorsMessages = {
  '网络连接中断，请重试': 'Connection interrupted. Please try again.',
  '文件服务响应无效，请重试':
    'Invalid file service response. Please try again.',
  '无法确认任务请求结果，请检查连接后重新读取计划。':
    'Could not confirm the task request. Check your connection and reload tasks.',
  '任务请求失败，请稍后重试。': 'Task request failed. Please try again later.',
  '任务响应格式无效，原计划已保留。':
    'Invalid task response. Your original plan is preserved.',
} satisfies Record<string, string>
export { errorsMessages }
