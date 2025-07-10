/* eslint-disable @typescript-eslint/no-explicit-any */
import {Args, Command, Flags} from '@oclif/core'

export default class TestNestedSchema extends Command {
  static args = {
    operation: Args.string({
      description: 'Type of nested schema operation',
      options: ['validate', 'transform', 'merge', 'extract'],
      required: false,
    }),
  }
  static description = 'Demonstrates complex nested object schemas for advanced MCP schema generation testing'
  static examples = [
    `$ example test-nested-schema --config '{"database":{"host":"localhost","port":5432}}'`,
    `$ example test-nested-schema --users '[{"name":"John","roles":["admin","user"]}]'`,
    `$ example test-nested-schema --metadata '{"tags":["prod","api"],"version":"1.0.0"}'`,
  ]
  static flags = {
    'array-of-objects': Flags.string({
      description: 'Array of objects (JSON string)',
      required: false,
    }),
    config: Flags.string({
      description: 'Configuration object (JSON string)',
      required: false,
    }),
    'deep-nesting': Flags.string({
      description: 'Deep nested structure (JSON string)',
      required: false,
    }),
    metadata: Flags.string({
      description: 'Metadata object (JSON string)',
      required: false,
    }),
    'nested-object': Flags.string({
      description: 'Complex nested object (JSON string)',
      required: false,
    }),
    'output-format': Flags.option({
      default: 'json',
      description: 'Output format for results',
      options: ['json', 'yaml', 'table', 'tree'],
    })(),
    'show-schema': Flags.boolean({
      default: false,
      description: 'Show the expected schema definitions',
    }),
    'transform-keys': Flags.boolean({
      default: false,
      description: 'Transform keys to camelCase',
    }),
    users: Flags.string({
      description: 'Users array (JSON string)',
      required: false,
    }),
    'validate-schema': Flags.boolean({
      default: false,
      description: 'Validate input against expected schema',
    }),
  }
  static summary = 'Test complex nested schema generation'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TestNestedSchema)

    this.log('=== Nested Schema Testing ===')

    if (flags['show-schema']) {
      this.showExpectedSchemas()
      return
    }

    const operation = args.operation || 'validate'
    this.log(`🔧 Operation: ${operation}`)

    // Parse all JSON inputs
    const inputs = this.parseInputs(flags)

    // Display parsed inputs
    this.displayInputs(inputs)

    // Validate schemas if requested
    if (flags['validate-schema']) {
      this.validateSchemas(inputs)
    }

    // Perform the requested operation
    const results = this.performOperation(operation, inputs, flags)

    // Display results
    this.displayResults(results, flags['output-format'])
  }

  private analyzeStructure(obj: any, depth: number = 0): string {
    if (depth > 3) return '[deep...]'

    const structure: string[] = []
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value)) {
          structure.push(`${key}[${value.length}]`)
        } else {
          structure.push(`${key}{${this.analyzeStructure(value, depth + 1)}}`)
        }
      } else {
        structure.push(`${key}:${typeof value}`)
      }
    }

    return structure.join(', ')
  }

  private displayInputs(inputs: Record<string, any>): void {
    this.log('\n📋 Parsed Inputs:')
    this.log('─'.repeat(60))

    for (const [key, value] of Object.entries(inputs)) {
      if (value !== null) {
        this.log(`🔹 ${key}:`)
        this.log(`   Type: ${Array.isArray(value) ? 'array' : typeof value}`)
        this.log(`   Keys: ${Array.isArray(value) ? `[${value.length} items]` : Object.keys(value).join(', ')}`)

        // Show structure for complex objects
        if (typeof value === 'object' && !Array.isArray(value)) {
          const structure = this.analyzeStructure(value)
          this.log(`   Structure: ${structure}`)
        }
      }
    }
  }

  private displayResults(results: Record<string, any>, format: string): void {
    this.log('\n📊 Operation Results:')
    this.log('─'.repeat(60))

    switch (format) {
      case 'json': {
        this.log(JSON.stringify(results, null, 2))
        break
      }

      case 'table': {
        this.displayTable(results)
        break
      }

      case 'tree': {
        this.displayTree(results)
        break
      }

      case 'yaml': {
        this.displayYaml(results)
        break
      }
    }
  }

  private displayTable(results: Record<string, any>): void {
    this.log('Key\t\tType\t\tValue')
    this.log('---\t\t----\t\t-----')

    for (const [key, value] of Object.entries(results)) {
      const type = Array.isArray(value) ? 'array' : typeof value
      const displayValue = typeof value === 'object' ? `{${Object.keys(value).length} keys}` : String(value)
      this.log(`${key}\t\t${type}\t\t${displayValue}`)
    }
  }

  private displayTree(obj: any, prefix: string = ''): void {
    const entries = Object.entries(obj)
    for (const [index, [key, value]] of entries.entries()) {
      const isLast = index === entries.length - 1
      const connector = isLast ? '└── ' : '├── '
      const nextPrefix = prefix + (isLast ? '    ' : '│   ')

      if (Array.isArray(value)) {
        this.log(`${prefix}${connector}${key} [${value.length}]`)
      } else if (typeof value === 'object' && value !== null) {
        this.log(`${prefix}${connector}${key} {${Object.keys(value).length}}`)
        this.displayTree(value, nextPrefix)
      } else {
        this.log(`${prefix}${connector}${key}: ${value}`)
      }
    }
  }

  private displayYaml(obj: any, indent: string = ''): void {
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        this.log(`${indent}${key}:`)
        for (const [, item] of value.entries()) {
          this.log(`${indent}  - ${JSON.stringify(item)}`)
        }
      } else if (typeof value === 'object' && value !== null) {
        this.log(`${indent}${key}:`)
        this.displayYaml(value, indent + '  ')
      } else {
        this.log(`${indent}${key}: ${value}`)
      }
    }
  }

  private extractFromInputs(inputs: Record<string, any>): Record<string, any> {
    const extracted: Record<string, any> = {
      arrays: [],
      booleans: [],
      nested: [],
      numbers: [],
      objects: [],
      strings: [],
    }

    for (const [key, value] of Object.entries(inputs)) {
      if (value) {
        this.extractValues(value, extracted, key)
      }
    }

    return extracted
  }

  private extractValues(obj: any, extracted: Record<string, any>, path: string): void {
    if (Array.isArray(obj)) {
      extracted.arrays.push({length: obj.length, path})
      for (const [index, item] of obj.entries()) this.extractValues(item, extracted, `${path}[${index}]`)
    } else if (typeof obj === 'object' && obj !== null) {
      extracted.objects.push({keys: Object.keys(obj), path})
      for (const [key, value] of Object.entries(obj)) {
        this.extractValues(value, extracted, `${path}.${key}`)
      }
    } else {
      const type = typeof obj
      extracted[`${type}s`].push({path, value: obj})
    }
  }

  private mergeInputs(inputs: Record<string, any>): Record<string, any> {
    const merged: Record<string, any> = {}

    // Merge all object inputs
    for (const [, value] of Object.entries(inputs)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(merged, value)
      }
    }

    // Add arrays as separate sections
    for (const [key, value] of Object.entries(inputs)) {
      if (Array.isArray(value)) {
        merged[key] = value
      }
    }

    return merged
  }

  private parseInputs(flags: any): Record<string, any> {
    const inputs: Record<string, any> = {}

    // Parse each JSON input
    const jsonFields = ['config', 'users', 'metadata', 'nested-object', 'array-of-objects', 'deep-nesting']

    for (const field of jsonFields) {
      const value = flags[field]
      if (value) {
        try {
          inputs[field] = JSON.parse(value)
          this.log(`✅ Parsed ${field}: ${typeof inputs[field]} with ${Object.keys(inputs[field]).length} properties`)
        } catch (error) {
          this.warn(`❌ Failed to parse ${field}: ${error instanceof Error ? error.message : 'Invalid JSON'}`)
          inputs[field] = null
        }
      }
    }

    return inputs
  }

  private performOperation(operation: string, inputs: Record<string, any>, flags: any): Record<string, any> {
    this.log(`\n🔧 Performing ${operation} operation:`)
    this.log('─'.repeat(60))

    const results: Record<string, any> = {}

    switch (operation) {
      case 'extract': {
        results.extracted = this.extractFromInputs(inputs)
        break
      }

      case 'merge': {
        results.merged = this.mergeInputs(inputs)
        break
      }

      case 'transform': {
        results.transformed = this.transformInputs(inputs, flags)
        break
      }

      case 'validate': {
        results.validation = this.validateAllInputs(inputs)
        break
      }

      default: {
        results.error = `Unknown operation: ${operation}`
      }
    }

    return results
  }

  private showExpectedSchemas(): void {
    this.log('\n� Expected Schema Definitions:')
    this.log('─'.repeat(60))

    const schemas = {
      config: {
        cache: {
          enabled: 'boolean',
          ttl: 'number',
        },
        database: {
          host: 'string',
          port: 'number',
        },
      },
      metadata: {
        created: 'string',
        tags: ['string'],
        version: 'string',
      },
      users: [
        {
          email: 'string',
          name: 'string',
          roles: ['string'],
        },
      ],
    }

    this.log(JSON.stringify(schemas, null, 2))
  }

  private transformInputs(inputs: Record<string, any>, flags: any): Record<string, any> {
    const transformed: Record<string, any> = {}

    for (const [key, value] of Object.entries(inputs)) {
      if (value) {
        transformed[key] = flags['transform-keys'] ? this.transformKeys(value) : value
      }
    }

    return transformed
  }

  private transformKeys(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map((item) => this.transformKeys(item))
    }

    if (typeof obj === 'object' && obj !== null) {
      const transformed: Record<string, any> = {}
      for (const [key, value] of Object.entries(obj)) {
        const camelKey = key.replaceAll(/_([a-z])/g, (_, letter) => letter.toUpperCase())
        transformed[camelKey] = this.transformKeys(value)
      }

      return transformed
    }

    return obj
  }

  private validateAgainstSchema(value: any, schema: any): boolean {
    // Simple schema validation (in a real implementation, use a proper schema validator)
    if (Array.isArray(schema)) {
      return Array.isArray(value) && value.every((item) => this.validateAgainstSchema(item, schema[0]))
    }

    if (typeof schema === 'object') {
      if (typeof value !== 'object') return false

      for (const [key, expectedType] of Object.entries(schema)) {
        if (!(key in value)) return false
        if (!this.validateAgainstSchema(value[key], expectedType)) return false
      }

      return true
    }

    return typeof value === schema
  }

  private validateAllInputs(inputs: Record<string, any>): Record<string, any> {
    const results: Record<string, any> = {}

    for (const [key, value] of Object.entries(inputs)) {
      results[key] = {
        size: Array.isArray(value) ? value.length : Object.keys(value || {}).length,
        structure: this.analyzeStructure(value),
        type: Array.isArray(value) ? 'array' : typeof value,
        valid: value !== null,
      }
    }

    return results
  }

  private validateSchemas(inputs: Record<string, any>): void {
    this.log('\n� Schema Validation:')
    this.log('─'.repeat(60))

    // Define expected schemas
    const expectedSchemas = {
      config: {
        cache: {enabled: 'boolean', ttl: 'number'},
        database: {host: 'string', port: 'number'},
      },
      metadata: {
        created: 'string',
        tags: ['string'],
        version: 'string',
      },
      users: [{email: 'string', name: 'string', roles: ['string']}],
    }

    for (const [key, value] of Object.entries(inputs)) {
      if (value && expectedSchemas[key as keyof typeof expectedSchemas]) {
        const isValid = this.validateAgainstSchema(value, expectedSchemas[key as keyof typeof expectedSchemas])
        const status = isValid ? '✅' : '❌'
        this.log(`${status} ${key}: ${isValid ? 'Valid' : 'Invalid schema'}`)
      } else {
        this.log(`⚪ ${key}: No schema defined`)
      }
    }
  }
}
