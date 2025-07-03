export function matchUriTemplate(uri: string, template: string): null | Record<string, string> {
  const templateParts = template.split('/')
  const uriParts = uri.split('/')

  // Handle templates with parameters that can capture multiple path segments
  const params: Record<string, string> = {}
  let uriIndex = 0

  for (let templateIndex = 0; templateIndex < templateParts.length; templateIndex++) {
    const templatePart = templateParts[templateIndex]

    if (templatePart.startsWith('{') && templatePart.endsWith('}')) {
      const paramName = templatePart.slice(1, -1)

      // For parameter parts, we need to find how many URI parts to consume
      const remainingTemplateParts = templateParts.length - templateIndex - 1
      const remainingUriParts = uriParts.length - uriIndex

      // If this is the last template part, consume all remaining URI parts
      if (remainingTemplateParts === 0) {
        params[paramName] = decodeURIComponent(uriParts.slice(uriIndex).join('/'))
        uriIndex = uriParts.length
      } else {
        // Otherwise, consume URI parts until we can match the remaining template parts
        const partsToConsume = remainingUriParts - remainingTemplateParts
        if (partsToConsume < 1) {
          return null
        }

        params[paramName] = decodeURIComponent(uriParts.slice(uriIndex, uriIndex + partsToConsume).join('/'))
        uriIndex += partsToConsume
      }
    } else {
      // For literal parts, must match exactly
      if (uriIndex >= uriParts.length || templatePart !== uriParts[uriIndex]) {
        return null
      }

      uriIndex++
    }
  }

  // Must have consumed all URI parts
  if (uriIndex !== uriParts.length) {
    return null
  }

  return params
}

export function resolveUriTemplate(template: string, parameters: Record<string, string>): string {
  return template.replaceAll(/{(\w+)}/g, (match, key) => {
    const value = parameters[key]
    return value ? encodeURIComponent(value) : match
  })
}
