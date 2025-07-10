/* eslint-disable @typescript-eslint/no-explicit-any */
import {Args, Command, Flags} from '@oclif/core'

export default class TestReadonly extends Command {
  static args = {
    identifier: Args.string({
      description: 'Resource identifier to read',
      required: true,
    }),
  }
  static description = 'Demonstrates a read-only command that only retrieves data without making changes'
  static examples = [`$ example test-readonly user123`, `$ example test-readonly user123 --format json --include-meta`]
  static flags = {
    fields: Flags.string({
      description: 'Comma-separated fields to include',
      required: false,
    }),
    format: Flags.option({
      char: 'f',
      default: 'json',
      description: 'Output format',
      options: ['json', 'yaml', 'table', 'csv'],
    })(),
    'include-meta': Flags.boolean({
      default: false,
      description: 'Include metadata in output',
    }),
    verbose: Flags.boolean({
      char: 'v',
      default: false,
      description: 'Verbose output',
    }),
  }
  static summary = 'Test read-only operation (safe for MCP)'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TestReadonly)

    this.log('=== Read-Only Operation Test ===')
    this.log(`🔍 Reading data for: ${args.identifier}`)

    // Simulate reading data (no modifications)
    const data = this.simulateDataRetrieval(args.identifier)

    if (flags.verbose) {
      this.log(`📊 Data retrieval completed at ${new Date().toISOString()}`)
      this.log(`📁 Source: mock-database`)
      this.log(`🔢 Record count: ${data.length}`)
    }

    // Filter fields if specified
    let filteredData = data
    if (flags.fields) {
      const fieldsArray = flags.fields.split(',').map((f) => f.trim())
      filteredData = data.map((item) => {
        const filtered: Record<string, any> = {}
        for (const field of fieldsArray) {
          if (field in item) {
            filtered[field] = item[field]
          }
        }

        return filtered
      })
    }

    // Add metadata if requested
    if (flags['include-meta']) {
      const metadata = {
        identifier: args.identifier,
        readOnly: true,
        recordCount: filteredData.length,
        source: 'example-cli',
        timestamp: new Date().toISOString(),
      }

      this.log('\n📋 Metadata:')
      this.log(JSON.stringify(metadata, null, 2))
    }

    // Output data in requested format
    this.log('\n📄 Data:')
    this.outputData(filteredData, flags.format)

    // Read-only operation summary
    this.log('\n✅ Read-only operation completed successfully')
    this.log('🛡️  No data was modified during this operation')

    if (flags.verbose) {
      this.log(`📊 Summary: Retrieved ${filteredData.length} records for ${args.identifier}`)
      this.log(`🔧 Format: ${flags.format}`)
      this.log(`📝 Fields: ${flags.fields || 'all'}`)
    }
  }

  private outputData(data: Record<string, any>[], format: string): void {
    switch (format) {
      case 'csv': {
        this.log('id,name,type,status')
        for (const item of data) {
          this.log(`${item.id},${item.name},${item.type},${item.status}`)
        }

        break
      }

      case 'json': {
        this.log(JSON.stringify(data, null, 2))
        break
      }

      case 'table': {
        this.log('ID\t\tName\t\tType\t\tStatus')
        this.log('---\t\t----\t\t----\t\t------')
        for (const item of data) {
          this.log(`${item.id}\t${item.name}\t${item.type}\t${item.status}`)
        }

        break
      }

      case 'yaml': {
        this.log('---')
        for (const item of data) {
          this.log(`- id: ${item.id}`)
          this.log(`  name: ${item.name}`)
          this.log(`  type: ${item.type}`)
          this.log(`  status: ${item.status}`)
          if (item.parentId) {
            this.log(`  parentId: ${item.parentId}`)
          }
        }

        break
      }
    }
  }

  private simulateDataRetrieval(identifier: string): Record<string, any>[] {
    // Simulate reading data from a database or API
    const baseData: Record<string, any>[] = [
      {
        createdAt: '2024-01-01T00:00:00Z',
        id: identifier,
        metadata: {
          tags: ['example', 'test'],
          version: '1.0.0',
        },
        name: `Resource ${identifier}`,
        status: 'active',
        type: 'example',
        updatedAt: '2024-01-15T12:00:00Z',
      },
    ]

    // Add some related records
    for (let i = 1; i <= 3; i++) {
      baseData.push({
        createdAt: `2024-01-${String(i).padStart(2, '0')}T00:00:00Z`,
        id: `${identifier}-related-${i}`,
        metadata: {
          tags: ['related', 'test'],
          version: `1.0.${i}`,
        },
        name: `Related Resource ${i}`,
        parentId: identifier,
        status: 'active',
        type: 'related',
        updatedAt: `2024-01-${String(i + 10).padStart(2, '0')}T12:00:00Z`,
      })
    }

    return baseData
  }
}
