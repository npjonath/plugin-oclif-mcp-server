/* eslint-disable no-promise-executor-return */
/* eslint-disable no-await-in-loop */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {Args, Command, Flags} from '@oclif/core'

export default class TestStreaming extends Command {
  static args = {
    operation: Args.string({
      description: 'Type of streaming operation to perform',
      options: ['counter', 'log-analysis', 'data-processing', 'file-scan', 'report-generation'],
      required: false,
    }),
  }
  static description = 'Demonstrates long streaming output to test MCP server handling of extended responses'
  static examples = [
    `$ example test-streaming --count 100 --delay 50`,
    `$ example test-streaming log-analysis --size large --format json`,
    `$ example test-streaming data-processing --records 1000 --batch-size 50`,
    `$ example test-streaming file-scan --path /large/directory --detailed`,
  ]
  static flags = {
    'batch-size': Flags.integer({
      default: 10,
      description: 'Batch size for processing',
      max: 100,
      min: 1,
    }),
    count: Flags.integer({
      char: 'c',
      default: 20,
      description: 'Number of items to process/stream',
      max: 10_000,
      min: 1,
    }),
    delay: Flags.integer({
      char: 'd',
      default: 10,
      description: 'Delay between items in milliseconds',
      max: 1000,
      min: 0,
    }),
    detailed: Flags.boolean({
      default: false,
      description: 'Show detailed output',
    }),
    format: Flags.option({
      char: 'f',
      default: 'text',
      description: 'Output format',
      options: ['text', 'json', 'csv', 'table'],
    })(),
    'include-metadata': Flags.boolean({
      default: false,
      description: 'Include metadata in streaming output',
    }),
    path: Flags.string({
      default: '/tmp/example',
      description: 'Path to simulate scanning',
    }),
    'progress-bar': Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Show progress indicators',
    }),
    'real-time': Flags.boolean({
      default: false,
      description: 'Simulate real-time streaming',
    }),
    records: Flags.integer({
      default: 100,
      description: 'Number of records to generate',
      max: 50_000,
      min: 1,
    }),
    size: Flags.option({
      char: 's',
      default: 'medium',
      description: 'Size of the streaming operation',
      options: ['small', 'medium', 'large', 'xlarge'],
    })(),
  }
  static summary = 'Test long streaming responses for MCP'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TestStreaming)

    const operation = args.operation || 'counter'

    this.log('=== Long Streaming Response Test ===')
    this.log(`🔄 Operation: ${operation}`)
    this.log(`📊 Size: ${flags.size}`)
    this.log(`⏱️  Delay: ${flags.delay}ms`)
    this.log(`📝 Format: ${flags.format}`)

    if (flags['real-time']) {
      this.log('⚡ Real-time mode enabled')
    }

    this.log('\n🚀 Starting streaming operation...\n')

    // Adjust parameters based on size
    const sizeMultipliers = {
      large: 2,
      medium: 1,
      small: 0.5,
      xlarge: 5,
    }

    const multiplier = sizeMultipliers[flags.size as keyof typeof sizeMultipliers]
    const adjustedCount = Math.floor(flags.count * multiplier)
    const adjustedRecords = Math.floor(flags.records * multiplier)

    switch (operation) {
      case 'counter': {
        await this.streamCounter(adjustedCount, flags)
        break
      }

      case 'data-processing': {
        await this.streamDataProcessing(adjustedRecords, flags)
        break
      }

      case 'file-scan': {
        await this.streamFileScan(adjustedCount, flags)
        break
      }

      case 'log-analysis': {
        await this.streamLogAnalysis(adjustedCount, flags)
        break
      }

      case 'report-generation': {
        await this.streamReportGeneration(adjustedCount, flags)
        break
      }

      default: {
        this.error(`Unknown operation: ${operation}`)
      }
    }

    this.log('\n✅ Streaming operation completed successfully!')
    this.log(`📈 Total output: ${this.estimateOutputSize(operation, adjustedCount, flags)} characters`)
  }

  private estimateOutputSize(operation: string, count: number, flags: any): number {
    const baseSize = flags.format === 'json' ? 150 : 50
    const detailMultiplier = flags.detailed ? 2 : 1
    const metadataMultiplier = flags['include-metadata'] ? 1.5 : 1

    return Math.round(count * baseSize * detailMultiplier * metadataMultiplier)
  }

  private formatFileSize(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unit = 0

    while (size >= 1024 && unit < sizes.length - 1) {
      size /= 1024
      unit++
    }

    return `${size.toFixed(1)} ${sizes[unit]}`
  }

  private generateLogAnalysis(level: string): string {
    const analyses = {
      DEBUG: 'Debug information',
      ERROR: 'Critical error occurred',
      INFO: 'Normal operation',
      WARN: 'Potential issue detected',
    }
    return analyses[level as keyof typeof analyses] || 'Unknown'
  }

  private generateProgressBar(current: number, total: number, width: number = 20): string {
    const percentage = Math.round((current / total) * 100)
    const filled = Math.round((width * current) / total)
    const bar = '█'.repeat(filled) + '░'.repeat(width - filled)
    return `[${bar}] ${percentage}%`
  }

  private generateReportLine(section: string, line: number): string {
    const templates = [
      `Data point ${line}: ${Math.round(Math.random() * 1000)} transactions processed`,
      `Metric ${line}: ${Math.round(Math.random() * 100)}% system utilization`,
      `Finding ${line}: ${Math.round(Math.random() * 50)} anomalies detected`,
      `Recommendation ${line}: Optimize ${section.toLowerCase()} configuration`,
    ]
    return templates[Math.floor(Math.random() * templates.length)]
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private async streamCounter(count: number, flags: any): Promise<void> {
    this.log(`🔢 Streaming counter from 1 to ${count}`)

    for (let i = 1; i <= count; i++) {
      if (flags.format === 'json') {
        const data = {
          counter: i,
          percentage: Math.round((i / count) * 100),
          timestamp: new Date().toISOString(),
          ...(flags['include-metadata'] && {
            metadata: {
              batch: Math.ceil(i / flags['batch-size']),
              operation: 'counter',
              remaining: count - i,
            },
          }),
        }
        this.log(JSON.stringify(data))
      } else if (flags.format === 'csv') {
        if (i === 1) {
          this.log('counter,timestamp,percentage')
        }

        this.log(`${i},${new Date().toISOString()},${Math.round((i / count) * 100)}`)
      } else {
        const progress = flags['progress-bar'] ? this.generateProgressBar(i, count) : ''
        this.log(`📊 Count: ${i}/${count} ${progress}`)

        if (flags.detailed) {
          this.log(`   ⏱️  Timestamp: ${new Date().toISOString()}`)
          this.log(`   � Progress: ${Math.round((i / count) * 100)}%`)
        }
      }

      if (flags.delay > 0) {
        await this.sleep(flags.delay)
      }
    }
  }

  private async streamDataProcessing(records: number, flags: any): Promise<void> {
    this.log(`🔄 Processing ${records} data records`)

    const batchSize = flags['batch-size']
    const totalBatches = Math.ceil(records / batchSize)

    for (let batch = 1; batch <= totalBatches; batch++) {
      const startRecord = (batch - 1) * batchSize + 1
      const endRecord = Math.min(batch * batchSize, records)
      const batchRecords = endRecord - startRecord + 1

      this.log(`\n📦 Batch ${batch}/${totalBatches} - Processing records ${startRecord}-${endRecord}`)

      for (let i = 0; i < batchRecords; i++) {
        const recordId = startRecord + i

        if (flags.format === 'json') {
          const record = {
            batch,
            data: {
              category: ['A', 'B', 'C'][Math.floor(Math.random() * 3)],
              name: `Record ${recordId}`,
              processed: true,
              value: Math.round(Math.random() * 1000),
            },
            id: recordId,
            ...(flags['include-metadata'] && {
              metadata: {
                checksum: Math.random().toString(36).slice(7),
                processingTime: Math.round(Math.random() * 100),
                validator: `validator-${Math.floor(Math.random() * 5)}`,
              },
            }),
          }
          this.log(`  ${JSON.stringify(record)}`)
        } else {
          this.log(`  ✅ Record ${recordId}: Processed successfully`)

          if (flags.detailed) {
            this.log(`     📊 Value: ${Math.round(Math.random() * 1000)}`)
            this.log(`     🏷️  Category: ${['A', 'B', 'C'][Math.floor(Math.random() * 3)]}`)
            this.log(`     ⏱️  Time: ${Math.round(Math.random() * 100)}ms`)
          }
        }

        if (flags['real-time']) {
          await this.sleep(Math.random() * 50)
        }
      }

      if (flags.delay > 0) {
        await this.sleep(flags.delay)
      }
    }
  }

  private async streamFileScan(count: number, flags: any): Promise<void> {
    this.log(`🔍 Scanning ${count} files in ${flags.path}`)

    const fileExtensions = ['.js', '.ts', '.json', '.md', '.txt', '.log', '.cfg', '.yml']
    const directories = ['src', 'lib', 'test', 'docs', 'config', 'scripts', 'assets']

    for (let i = 1; i <= count; i++) {
      const ext = fileExtensions[Math.floor(Math.random() * fileExtensions.length)]
      const dir = directories[Math.floor(Math.random() * directories.length)]
      const filename = `${flags.path}/${dir}/file${i}${ext}`
      const size = Math.floor(Math.random() * 100_000)

      if (flags.format === 'json') {
        const fileInfo = {
          id: i,
          lastModified: new Date(Date.now() - Math.random() * 86_400_000).toISOString(),
          path: filename,
          size,
          type: ext.slice(1),
          ...(flags['include-metadata'] && {
            metadata: {
              group: 'users',
              inode: Math.floor(Math.random() * 1_000_000),
              owner: 'user',
              permissions: '644',
            },
          }),
        }
        this.log(JSON.stringify(fileInfo))
      } else {
        this.log(`📄 ${filename} (${this.formatFileSize(size)})`)

        if (flags.detailed) {
          this.log(`   📅 Modified: ${new Date(Date.now() - Math.random() * 86_400_000).toISOString()}`)
          this.log(`   🔐 Permissions: 644`)
          this.log(`   👤 Owner: user:users`)
        }
      }

      if (flags['progress-bar'] && i % 25 === 0) {
        this.log(`📊 Scanned: ${this.generateProgressBar(i, count)}`)
      }

      if (flags.delay > 0) {
        await this.sleep(flags.delay)
      }
    }
  }

  private async streamLogAnalysis(count: number, flags: any): Promise<void> {
    this.log(`� Analyzing ${count} log entries`)

    const logLevels = ['INFO', 'WARN', 'ERROR', 'DEBUG']
    const services = ['auth-service', 'api-gateway', 'user-service', 'payment-service', 'notification-service']

    for (let i = 1; i <= count; i++) {
      const level = logLevels[Math.floor(Math.random() * logLevels.length)]
      const service = services[Math.floor(Math.random() * services.length)]
      const timestamp = new Date(Date.now() - Math.random() * 86_400_000).toISOString()

      if (flags.format === 'json') {
        const logEntry = {
          duration: Math.round(Math.random() * 1000),
          id: i,
          level,
          message: `Log entry ${i} from ${service}`,
          service,
          timestamp,
          ...(flags['include-metadata'] && {
            metadata: {
              lineNumber: Math.floor(Math.random() * 10_000),
              sourceFile: `${service}.log`,
              thread: `thread-${Math.floor(Math.random() * 10)}`,
            },
          }),
        }
        this.log(JSON.stringify(logEntry))
      } else {
        this.log(`[${timestamp}] ${level.padEnd(5)} ${service.padEnd(15)} - Log entry ${i}`)

        if (flags.detailed) {
          this.log(`   🔍 Analysis: ${this.generateLogAnalysis(level)}`)
          this.log(`   ⏱️  Duration: ${Math.round(Math.random() * 1000)}ms`)
        }
      }

      if (flags['progress-bar'] && i % 10 === 0) {
        this.log(`📊 Progress: ${this.generateProgressBar(i, count)}`)
      }

      if (flags.delay > 0) {
        await this.sleep(flags.delay)
      }
    }
  }

  private async streamReportGeneration(count: number, flags: any): Promise<void> {
    this.log(`📊 Generating comprehensive report with ${count} sections`)

    const sections = [
      'Executive Summary',
      'Performance Metrics',
      'Error Analysis',
      'User Activity',
      'System Resources',
      'Security Audit',
      'Recommendations',
      'Appendices',
    ]

    for (let i = 1; i <= count; i++) {
      const section = sections[Math.floor(Math.random() * sections.length)]

      this.log(`\n📋 Section ${i}/${count}: ${section}`)
      this.log('─'.repeat(60))

      // Generate subsections
      const subsectionCount = Math.floor(Math.random() * 5) + 2
      for (let j = 1; j <= subsectionCount; j++) {
        this.log(`  ${i}.${j} ${section} - Part ${j}`)

        if (flags.detailed) {
          // Generate detailed content
          const lines = Math.floor(Math.random() * 10) + 5
          for (let k = 1; k <= lines; k++) {
            this.log(`       ${this.generateReportLine(section, k)}`)
          }
        }

        if (flags['real-time']) {
          await this.sleep(Math.random() * 200)
        }
      }

      // Add metrics
      if (flags.format === 'json') {
        const metrics = {
          generatedAt: new Date().toISOString(),
          metrics: {
            complexity: Math.random(),
            confidence: Math.random(),
            dataPoints: Math.floor(Math.random() * 1000),
          },
          name: section,
          section: i,
          subsections: subsectionCount,
        }
        this.log(JSON.stringify(metrics, null, 2))
      }

      if (flags.delay > 0) {
        await this.sleep(flags.delay)
      }
    }
  }
}
