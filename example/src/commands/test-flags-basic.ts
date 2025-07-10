import {Command, Flags} from '@oclif/core'

export default class TestFlagsBasic extends Command {
  static description = 'Demonstrates string, boolean, and integer flags with various validation patterns'
  static examples = [
    `$ example test-flags-basic --message "Hello World" --count 42 --enabled`,
    `$ example test-flags-basic --message "Test" --count 0 --no-enabled`,
  ]
  static flags = {
    count: Flags.integer({
      char: 'c',
      default: 1,
      description: 'An optional integer count',
      max: 100,
      min: 0,
    }),
    enabled: Flags.boolean({
      allowNo: true,
      char: 'e',
      default: false,
      description: 'Enable or disable the feature',
    }),
    message: Flags.string({
      char: 'm',
      description: 'A required string message',
      required: true,
    }),
    optional: Flags.string({
      char: 'o',
      description: 'An optional string field',
      required: false,
    }),
    url: Flags.url({
      char: 'u',
      description: 'A URL input field',
      required: false,
    }),
  }
  static summary = 'Test basic flag types for MCP schema generation'

  async run(): Promise<void> {
    const {flags} = await this.parse(TestFlagsBasic)

    this.log('=== Basic Flags Test Results ===')
    this.log(`Message: ${flags.message}`)
    this.log(`Count: ${flags.count}`)
    this.log(`Enabled: ${flags.enabled}`)
    this.log(`Optional: ${flags.optional || 'not provided'}`)
    this.log(`URL: ${flags.url || 'not provided'}`)

    // Demonstrate different outputs based on flags
    if (flags.enabled) {
      this.log('✅ Feature is enabled!')
    } else {
      this.log('❌ Feature is disabled')
    }

    if (flags.count > 10) {
      this.log(`🚀 High count detected: ${flags.count}`)
    }

    this.log(`\n📊 Summary: Processed ${flags.count} items with message "${flags.message}"`)
  }
}
