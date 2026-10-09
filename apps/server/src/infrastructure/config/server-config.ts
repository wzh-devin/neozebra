/**
 * 读取监听配置，在启动前拒绝无效端口和空监听地址。
 *
 * @param environment - Node 环境变量
 * @returns 监听地址和合法端口
 */
const getServerConfig = (environment: NodeJS.ProcessEnv) => {
  const hostname = environment.HOST ?? '127.0.0.1'
  const portValue = environment.PORT ?? '3000'
  const port = Number(portValue)

  if (!/^\d+$/.test(portValue) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535')
  }

  if (!hostname.trim()) {
    throw new Error('HOST must be a non-empty hostname or IP address')
  }

  return { hostname, port }
}

export { getServerConfig }
