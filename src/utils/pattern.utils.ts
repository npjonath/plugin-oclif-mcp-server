export function matchesPatterns(commandId: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern === '*' || pattern === commandId) return true
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replaceAll('*', '.*'))
      return regex.test(commandId)
    }

    return false
  })
}

export function matchesTopics(commandId: string, topics: string[]): boolean {
  const [topic] = commandId.split(':')
  return topics.includes(topic) || topics.includes('*')
}
