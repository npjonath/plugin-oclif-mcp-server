/* eslint-disable @typescript-eslint/no-explicit-any */
import {Args, Command, Flags} from '@oclif/core'

export default class TestLongResponse extends Command {
  static args = {
    type: Args.string({
      description: 'Type of long response to generate',
      options: ['text', 'json', 'xml', 'csv', 'documentation', 'data-dump', 'code-generation', 'log-dump'],
      required: false,
    }),
  }
  static description = 'Generates very long single responses to test MCP server handling of large output blocks'
  static examples = [
    `$ example test-long-response --size 10000 --format json`,
    `$ example test-long-response documentation --sections 50`,
    `$ example test-long-response data-dump --records 5000 --detailed`,
    `$ example test-long-response code-generation --lines 2000 --language typescript`,
  ]
  static flags = {
    'compress-output': Flags.boolean({
      default: false,
      description: 'Compress output (remove formatting)',
    }),
    detailed: Flags.boolean({
      default: false,
      description: 'Include detailed/verbose output',
    }),
    format: Flags.option({
      char: 'f',
      default: 'text',
      description: 'Output format',
      options: ['text', 'json', 'xml', 'csv', 'yaml', 'html'],
    })(),
    'include-metadata': Flags.boolean({
      default: false,
      description: 'Include metadata in output',
    }),
    language: Flags.option({
      default: 'typescript',
      description: 'Programming language (for code generation)',
      options: ['javascript', 'typescript', 'python', 'java', 'go', 'rust', 'sql'],
    })(),
    lines: Flags.integer({
      char: 'l',
      default: 50,
      description: 'Number of lines to generate',
      max: 10_000,
      min: 10,
    }),
    'nested-depth': Flags.integer({
      default: 3,
      description: 'Nesting depth for complex structures',
      max: 10,
      min: 1,
    }),
    records: Flags.integer({
      default: 100,
      description: 'Number of records (for data dump)',
      max: 50_000,
      min: 10,
    }),
    sections: Flags.integer({
      default: 10,
      description: 'Number of sections (for documentation)',
      max: 500,
      min: 1,
    }),
    size: Flags.integer({
      char: 's',
      default: 5000,
      description: 'Target size in characters',
      max: 100_000,
      min: 100,
    }),
  }
  static summary = 'Test extremely long single responses for MCP'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TestLongResponse)

    const type = args.type || 'text'

    this.log('=== Long Response Test ===')
    this.log(`📄 Type: ${type}`)
    this.log(`📏 Target size: ${flags.size.toLocaleString()} characters`)
    this.log(`📊 Lines: ${flags.lines.toLocaleString()}`)
    this.log(`🎨 Format: ${flags.format}`)

    if (flags.detailed) {
      this.log('📋 Detailed mode enabled')
    }

    this.log('\n🚀 Generating long response...\n')
    this.log('─'.repeat(80))

    const startTime = Date.now()
    let output = ''

    switch (type) {
      case 'code-generation': {
        output = this.generateCode(flags)
        break
      }

      case 'csv': {
        output = this.generateLongCsv(flags)
        break
      }

      case 'data-dump': {
        output = this.generateDataDump(flags)
        break
      }

      case 'documentation': {
        output = this.generateDocumentation(flags)
        break
      }

      case 'json': {
        output = this.generateLongJson(flags)
        break
      }

      case 'log-dump': {
        output = this.generateLogDump(flags)
        break
      }

      case 'text': {
        output = this.generateLongText(flags)
        break
      }

      case 'xml': {
        output = this.generateLongXml(flags)
        break
      }

      default: {
        this.error(`Unknown type: ${type}`)
      }
    }

    // Output the generated content
    this.log(output)

    const endTime = Date.now()
    const actualSize = output.length
    const generationTime = endTime - startTime

    this.log('\n─'.repeat(80))
    this.log('\n📊 Generation Statistics:')
    this.log(`  📏 Actual size: ${actualSize.toLocaleString()} characters`)
    this.log(`  📐 Target size: ${flags.size.toLocaleString()} characters`)
    this.log(`  📈 Size ratio: ${Math.round((actualSize / flags.size) * 100)}%`)
    this.log(`  ⏱️  Generation time: ${generationTime}ms`)
    this.log(`  🔢 Lines generated: ${output.split('\n').length.toLocaleString()}`)
    this.log(`  💾 Memory estimate: ${Math.round(actualSize / 1024)} KB`)

    if (actualSize > 10_000) {
      this.log(`  ⚠️  Large response detected - may test MCP buffer limits`)
    }

    if (actualSize > 50_000) {
      this.log(`  🚨 Very large response - may cause MCP timeouts`)
    }
  }

  private generateCode(flags: any): string {
    const {language} = flags
    let code = `// Generated ${language} code\n`
    code += `// Created: ${new Date().toISOString()}\n`
    code += `// Lines: ${flags.lines}\n\n`

    const lineCount = Math.min(flags.lines, Math.floor(flags.size / 50))

    for (let i = 1; i <= lineCount; i++) {
      code += this.generateCodeLine(language, i, flags.detailed)
      code += '\n'
    }

    return code
  }

  private generateCodeBlock(language: string, lines: number): string {
    const code = []
    for (let i = 1; i <= lines; i++) {
      code.push(this.generateCodeLine(language, i, true))
    }

    return code.join('\n')
  }

  private generateCodeLine(language: string, lineNumber: number, _detailed: boolean): string {
    const templates = {
      javascript: [
        `const variable${lineNumber} = 'value ${lineNumber}';`,
        `function process${lineNumber}(data) {`,
        `  return new Promise((resolve, reject) => {`,
        `    // Processing logic for line ${lineNumber}`,
        `    setTimeout(() => resolve(), 100);`,
        `  });`,
        `}`,
      ],
      python: [
        `variable_${lineNumber} = 'value ${lineNumber}'`,
        `def process_${lineNumber}(data):`,
        `    """Process data for line ${lineNumber}"""`,
        `    return {'status': 'ok', 'data': data}`,
        ``,
        `class Handler${lineNumber}:`,
        `    def __init__(self, config):`,
        `        self.config = config`,
        `    `,
        `    def handle(self, request):`,
        `        return {'status': 'ok', 'data': request.get('body')}`,
      ],
      typescript: [
        `const variable${lineNumber}: string = 'value ${lineNumber}';`,
        `function process${lineNumber}(data: any): Promise<void> {`,
        `  return new Promise((resolve, reject) => {`,
        `    // Processing logic for line ${lineNumber}`,
        `    setTimeout(() => resolve(), 100);`,
        `  });`,
        `}`,
        `export class Handler${lineNumber} {`,
        `  private readonly config: Config;`,
        `  public async handle(request: Request): Promise<Response> {`,
        `    return { status: 'ok', data: request.body };`,
        `  }`,
        `}`,
      ],
    }

    const lines = templates[language as keyof typeof templates] || templates.typescript
    return lines[Math.floor(Math.random() * lines.length)]
  }

  private generateDataDump(flags: any): string {
    let dump = '=== SYSTEM DATA DUMP ===\n\n'
    dump += `Timestamp: ${new Date().toISOString()}\n`
    dump += `Records: ${flags.records}\n`
    dump += `Format: ${flags.format}\n\n`
    dump += '─'.repeat(80) + '\n\n'

    const recordCount = Math.min(flags.records, Math.floor(flags.size / 150))

    for (let i = 1; i <= recordCount; i++) {
      dump += `RECORD ${i}:\n`
      dump += `  ID: ${i}\n`
      dump += `  Name: Data Record ${i}\n`
      dump += `  Value: ${Math.round(Math.random() * 1000)}\n`
      dump += `  Category: ${['SYSTEM', 'USER', 'CONFIG', 'CACHE'][Math.floor(Math.random() * 4)]}\n`
      dump += `  Timestamp: ${new Date().toISOString()}\n`
      dump += `  Status: ${Math.random() > 0.5 ? 'ACTIVE' : 'INACTIVE'}\n`

      if (flags.detailed) {
        dump += `  Details:\n`
        dump += `    Description: This is detailed information about record ${i}\n`
        dump += `    Properties: weight=${Math.random() * 100}, size=${Math.random() * 50}\n`
        dump += `    Tags: [tag-${i}, category-data, generated]\n`
        dump += `    History: ${Math.floor(Math.random() * 10)} previous modifications\n`
      }

      dump += `\n`
    }

    return dump
  }

  private generateDocumentation(flags: any): string {
    let doc = '# Comprehensive System Documentation\n\n'
    doc += `Generated on: ${new Date().toISOString()}\n\n`
    doc += '---\n\n'

    const sections = [
      'Introduction',
      'Architecture Overview',
      'Installation Guide',
      'Configuration',
      'API Reference',
      'Examples',
      'Troubleshooting',
      'Performance Tuning',
      'Security Considerations',
      'Deployment Guide',
      'Monitoring and Logging',
      'Backup and Recovery',
      'Migration Guide',
      'Advanced Topics',
      'Appendices',
    ]

    const sectionCount = Math.min(flags.sections, sections.length)

    for (let i = 0; i < sectionCount; i++) {
      const section = sections[i]
      doc += `## ${i + 1}. ${section}\n\n`

      const subsections = Math.floor(Math.random() * 5) + 3
      for (let j = 1; j <= subsections; j++) {
        doc += `### ${i + 1}.${j} ${section} - Part ${j}\n\n`

        const paragraphs = flags.detailed ? Math.floor(Math.random() * 5) + 3 : 2
        for (let k = 1; k <= paragraphs; k++) {
          doc += `${this.generateParagraph(k, true)}\n\n`
        }

        if (flags.detailed && Math.random() > 0.5) {
          doc += '```typescript\n'
          doc += this.generateCodeBlock(flags.language, 10)
          doc += '\n```\n\n'
        }
      }

      doc += '---\n\n'
    }

    return doc
  }

  private generateLogDump(flags: any): string {
    let logs = '=== APPLICATION LOG DUMP ===\n\n'
    logs += `Generated: ${new Date().toISOString()}\n`
    logs += `Lines: ${flags.lines}\n\n`

    const logLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']
    const services = ['auth', 'api', 'db', 'cache', 'queue', 'monitor']

    const lineCount = Math.min(flags.lines, Math.floor(flags.size / 120))

    for (let i = 1; i <= lineCount; i++) {
      const timestamp = new Date(Date.now() - Math.random() * 86_400_000).toISOString()
      const level = logLevels[Math.floor(Math.random() * logLevels.length)]
      const service = services[Math.floor(Math.random() * services.length)]
      const thread = `thread-${Math.floor(Math.random() * 10)}`

      logs += `[${timestamp}] ${level.padEnd(5)} [${service}] [${thread}] Log message ${i}\n`

      if (flags.detailed && Math.random() > 0.7) {
        logs += `    Stack trace for message ${i}:\n`
        logs += `      at function${i}() (file${i}.js:${Math.floor(Math.random() * 1000)})\n`
        logs += `      at handler() (handler.js:${Math.floor(Math.random() * 100)})\n`
        logs += `      at process() (process.js:${Math.floor(Math.random() * 200)})\n`
      }
    }

    return logs
  }

  private generateLongCsv(flags: any): string {
    const headers = ['id', 'name', 'value', 'category', 'timestamp', 'active']

    if (flags.detailed) {
      headers.push('description', 'weight', 'width', 'height', 'depth')
    }

    if (flags['include-metadata']) {
      headers.push('created_by', 'last_modified', 'checksum', 'version')
    }

    let csv = headers.join(',') + '\n'

    const recordCount = Math.min(flags.records, Math.floor(flags.size / 100))

    for (let i = 1; i <= recordCount; i++) {
      const row = [
        i,
        `"Item ${i}"`,
        Math.round(Math.random() * 1000),
        ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)],
        new Date().toISOString(),
        Math.random() > 0.5,
      ]

      if (flags.detailed) {
        row.push(
          `"Description for item ${i}"`,
          Math.round(Math.random() * 100),
          Math.round(Math.random() * 50),
          Math.round(Math.random() * 50),
          Math.round(Math.random() * 50),
        )
      }

      if (flags['include-metadata']) {
        row.push(
          'test-system',
          new Date().toISOString(),
          Math.random().toString(36).slice(7),
          Math.floor(Math.random() * 10) + 1,
        )
      }

      csv += row.join(',') + '\n'
    }

    return csv
  }

  private generateLongJson(flags: any): string {
    const data: any = {
      items: [],
      metadata: {
        format: 'json',
        generated: new Date().toISOString(),
        size: flags.size,
        version: '1.0.0',
      },
    }

    const itemCount = Math.min(flags.records, Math.floor(flags.size / 200))

    for (let i = 1; i <= itemCount; i++) {
      const item: any = {
        active: Math.random() > 0.5,
        category: ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)],
        id: i,
        name: `Item ${i}`,
        timestamp: new Date().toISOString(),
        value: Math.round(Math.random() * 1000),
      }

      if (flags.detailed) {
        item.details = {
          description: `This is a detailed description for item ${i}. It contains additional information about the item's properties, usage, and configuration.`,
          history: Array.from({length: 5}, (_, j) => ({
            action: ['created', 'updated', 'archived', 'restored'][Math.floor(Math.random() * 4)],
            timestamp: new Date(Date.now() - j * 86_400_000).toISOString(),
            user: `user-${Math.floor(Math.random() * 10)}`,
          })),
          properties: {
            dimensions: {
              depth: Math.random() * 50,
              height: Math.random() * 50,
              width: Math.random() * 50,
            },
            tags: [`tag-${i}`, `category-${item.category}`, 'generated'],
            weight: Math.random() * 100,
          },
        }
      }

      if (flags['include-metadata']) {
        item.metadata = {
          checksum: Math.random().toString(36).slice(7),
          createdBy: 'test-system',
          lastModified: new Date().toISOString(),
          version: Math.floor(Math.random() * 10) + 1,
        }
      }

      data.items.push(item)
    }

    return JSON.stringify(data, null, flags['compress-output'] ? 0 : 2)
  }

  private generateLongText(flags: any): string {
    const paragraphs = []
    const targetSize = flags.size
    let currentSize = 0
    let paragraphCount = 0

    while (currentSize < targetSize && paragraphCount < flags.lines) {
      const paragraph = this.generateParagraph(paragraphCount + 1, flags.detailed)
      paragraphs.push(paragraph)
      currentSize += paragraph.length
      paragraphCount++
    }

    return paragraphs.join('\n\n')
  }

  private generateLongXml(flags: any): string {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    xml += '<data>\n'
    xml += '  <metadata>\n'
    xml += `    <generated>${new Date().toISOString()}</generated>\n`
    xml += `    <size>${flags.size}</size>\n`
    xml += '    <format>xml</format>\n'
    xml += '  </metadata>\n'
    xml += '  <items>\n'

    const itemCount = Math.min(flags.records, Math.floor(flags.size / 300))

    for (let i = 1; i <= itemCount; i++) {
      xml += `    <item id="${i}">\n`
      xml += `      <name>Item ${i}</name>\n`
      xml += `      <value>${Math.round(Math.random() * 1000)}</value>\n`
      xml += `      <category>${['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)]}</category>\n`
      xml += `      <timestamp>${new Date().toISOString()}</timestamp>\n`
      xml += `      <active>${Math.random() > 0.5}</active>\n`

      if (flags.detailed) {
        xml += '      <details>\n'
        xml += `        <description>Detailed description for item ${i}</description>\n`
        xml += '        <properties>\n'
        xml += `          <weight>${Math.random() * 100}</weight>\n`
        xml += '          <dimensions>\n'
        xml += `            <width>${Math.random() * 50}</width>\n`
        xml += `            <height>${Math.random() * 50}</height>\n`
        xml += `            <depth>${Math.random() * 50}</depth>\n`
        xml += '          </dimensions>\n'
        xml += '        </properties>\n'
        xml += '      </details>\n'
      }

      xml += '    </item>\n'
    }

    xml += '  </items>\n'
    xml += '</data>\n'

    return xml
  }

  private generateParagraph(index: number, detailed: boolean): string {
    const sentences = detailed ? Math.floor(Math.random() * 8) + 4 : Math.floor(Math.random() * 4) + 2
    const paragraph = []

    for (let i = 0; i < sentences; i++) {
      const sentence = this.generateSentence(index, i + 1)
      paragraph.push(sentence)
    }

    return paragraph.join(' ')
  }

  private generateSentence(paragraphIndex: number, sentenceIndex: number): string {
    const templates = [
      `This is sentence ${sentenceIndex} of paragraph ${paragraphIndex}.`,
      `The system processes data according to predefined rules and configurations.`,
      `Performance metrics indicate optimal throughput under current load conditions.`,
      `Error handling mechanisms ensure graceful degradation during failure scenarios.`,
      `Monitoring tools provide real-time visibility into system operations.`,
      `Configuration parameters can be adjusted to meet specific requirements.`,
      `Security protocols protect against unauthorized access and data breaches.`,
      `Load balancing distributes traffic across multiple service instances.`,
      `Caching strategies improve response times and reduce database load.`,
      `Logging facilities capture detailed information for troubleshooting purposes.`,
    ]

    return templates[Math.floor(Math.random() * templates.length)]
  }
}
