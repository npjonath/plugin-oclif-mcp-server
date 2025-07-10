import {Command, Flags} from '@oclif/core'

export default class TestFlagsOptions extends Command {
  static description = 'Demonstrates enum-style flags and option validation for MCP schema generation'
  static examples = [
    `$ example test-flags-options --format json --level info --env production`,
    `$ example test-flags-options --format yaml --level debug --env development`,
  ]
  static flags = {
    env: Flags.option({
      char: 'e',
      default: 'development',
      description: 'Environment',
      options: ['development', 'staging', 'production'],
    })(),
    format: Flags.option({
      char: 'f',
      default: 'json',
      description: 'Output format',
      options: ['json', 'yaml', 'xml', 'csv'],
    })(),
    level: Flags.option({
      char: 'l',
      description: 'Log level',
      options: ['debug', 'info', 'warn', 'error'],
      required: true,
    })(),
    region: Flags.option({
      char: 'r',
      description: 'AWS region',
      options: ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'],
      required: false,
    })(),
    size: Flags.option({
      char: 's',
      default: 'medium',
      description: 'Instance size',
      options: ['small', 'medium', 'large', 'xlarge'],
    })(),
  }
  static summary = 'Test option flags with predefined choices'

  async run(): Promise<void> {
    const {flags} = await this.parse(TestFlagsOptions)

    this.log('=== Option Flags Test Results ===')
    this.log(`Format: ${flags.format}`)
    this.log(`Level: ${flags.level}`)
    this.log(`Environment: ${flags.env}`)
    this.log(`Region: ${flags.region || 'not specified'}`)
    this.log(`Size: ${flags.size}`)

    // Demonstrate logic based on options
    const config = {
      env: flags.env,
      format: flags.format,
      level: flags.level,
      region: flags.region,
      size: flags.size,
    }

    this.log('\n📋 Generated Configuration:')
    if (flags.format === 'json') {
      this.log(JSON.stringify(config, null, 2))
    } else if (flags.format === 'yaml') {
      this.log('---')
      for (const [key, value] of Object.entries(config)) {
        this.log(`${key}: ${value || 'null'}`)
      }
    } else {
      this.log(
        Object.entries(config)
          .map(([k, v]) => `${k}=${v || 'null'}`)
          .join('\n'),
      )
    }

    // Environment-specific messages
    if (flags.env === 'production') {
      this.log('\n⚠️  Production environment detected - using secure settings')
    } else if (flags.env === 'development') {
      this.log('\n🔧 Development environment - debug mode enabled')
    }

    // Log level validation
    const logLevels = {debug: 0, error: 3, info: 1, warn: 2}
    const currentLevel = logLevels[flags.level as keyof typeof logLevels]
    this.log(`\n📊 Log level priority: ${currentLevel} (${flags.level})`)
  }
}
