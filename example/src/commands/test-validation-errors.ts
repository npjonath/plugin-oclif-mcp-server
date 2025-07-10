/* eslint-disable @typescript-eslint/no-explicit-any */
import {Args, Command, Flags} from '@oclif/core'

export default class TestValidationErrors extends Command {
  static args = {
    testType: Args.string({
      description: 'Type of validation test to run',
      options: ['email', 'age', 'url', 'count', 'enum', 'required', 'all'],
      required: false,
    }),
  }
  static description = 'Demonstrates various validation scenarios and error handling for MCP schema testing'
  static examples = [
    `$ example test-validation-errors --email invalid-email`,
    `$ example test-validation-errors --age -5`,
    `$ example test-validation-errors --url not-a-url`,
    `$ example test-validation-errors --count 150 # exceeds max`,
  ]
  static flags = {
    age: Flags.integer({
      description: 'Age (must be 0-120)',
      max: 120,
      min: 0,
      required: false,
    }),
    count: Flags.integer({
      description: 'Count (must be 1-100)',
      max: 100,
      min: 1,
      required: false,
    }),
    email: Flags.string({
      description: 'Email address to validate',
      required: false,
    }),
    percentage: Flags.integer({
      description: 'Percentage (0-100)',
      max: 100,
      min: 0,
      required: false,
    }),
    'phone-number': Flags.string({
      description: 'Phone number (format: +1-555-123-4567)',
      required: false,
    }),
    priority: Flags.option({
      description: 'Priority level',
      options: ['low', 'medium', 'high', 'critical'],
      required: false,
    })(),
    'required-field': Flags.string({
      description: 'This field is required when test-type is "required"',
      required: false,
    }),
    'show-valid': Flags.boolean({
      default: false,
      description: 'Show examples of valid inputs',
    }),
    url: Flags.url({
      description: 'URL to validate',
      required: false,
    }),
    'zip-code': Flags.string({
      description: 'ZIP code (5 digits)',
      required: false,
    }),
  }
  static summary = 'Test input validation and error handling'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TestValidationErrors)

    this.log('=== Validation Error Testing ===')

    const testType = args.testType || 'all'
    this.log(`🧪 Test Type: ${testType}`)

    if (flags['show-valid']) {
      this.showValidExamples()
      return
    }

    // Run validation tests
    const results = await this.runValidationTests(testType, flags)

    // Display results
    this.displayResults(results)
  }

  private displayResults(results: Array<{error?: string; passed: boolean; test: string; value?: any}>): void {
    this.log('\n📊 Validation Results:')
    this.log('─'.repeat(60))

    let passed = 0
    let failed = 0

    for (const result of results) {
      const status = result.passed ? '✅' : '❌'
      const testName = result.test.padEnd(15)
      const value = result.value === undefined ? '' : `(${result.value})`

      this.log(`${status} ${testName} ${value}`)

      if (result.error) {
        this.log(`    💬 ${result.error}`)
      }

      if (result.passed) {
        passed++
      } else {
        failed++
      }
    }

    this.log('─'.repeat(60))
    this.log(`📈 Summary: ${passed} passed, ${failed} failed`)

    if (failed > 0) {
      this.log('\n💡 Tips:')
      this.log('  • Use --show-valid to see examples of valid inputs')
      this.log('  • Check the error messages above for specific validation rules')
      this.log('  • Use specific test types to focus on particular validations')
    }
  }

  private async runValidationTests(
    testType: string,
    flags: any,
  ): Promise<Array<{error?: string; passed: boolean; test: string; value?: any}>> {
    const results: Array<{error?: string; passed: boolean; test: string; value?: any}> = []

    if (testType === 'all' || testType === 'email') {
      results.push(this.validateEmail(flags.email))
    }

    if (testType === 'all' || testType === 'age') {
      results.push(this.validateAge(flags.age))
    }

    if (testType === 'all' || testType === 'url') {
      results.push(this.validateUrl(flags.url))
    }

    if (testType === 'all' || testType === 'count') {
      results.push(this.validateCount(flags.count))
    }

    if (testType === 'all' || testType === 'enum') {
      results.push(this.validateEnum(flags.priority))
    }

    if (testType === 'all' || testType === 'required') {
      results.push(this.validateRequired(flags['required-field'], testType === 'required'))
    }

    // Custom validation tests
    if (flags['phone-number']) {
      results.push(this.validatePhoneNumber(flags['phone-number']))
    }

    if (flags['zip-code']) {
      results.push(this.validateZipCode(flags['zip-code']))
    }

    if (flags.percentage !== undefined) {
      results.push(this.validatePercentage(flags.percentage))
    }

    return results
  }

  private showValidExamples(): void {
    this.log('\n✅ Valid Input Examples:')
    this.log('─'.repeat(60))
    this.log('Email:        user@example.com')
    this.log('Age:          25')
    this.log('URL:          https://example.com')
    this.log('Count:        50')
    this.log('Priority:     high')
    this.log('Percentage:   75')
    this.log('Phone:        +1-555-123-4567')
    this.log('ZIP Code:     12345')
    this.log('─'.repeat(60))

    this.log('\n📝 Example Commands:')
    this.log('$ example test-validation-errors --email user@example.com')
    this.log('$ example test-validation-errors --age 25 --count 50')
    this.log('$ example test-validation-errors --url https://example.com --priority high')
    this.log('$ example test-validation-errors required --required-field "test value"')
  }

  private validateAge(age?: number): {error?: string; passed: boolean; test: string; value?: any} {
    if (age === undefined) {
      return {error: 'No age provided - skipping test', passed: true, test: 'age'}
    }

    const passed = age >= 0 && age <= 120
    return {
      error: passed ? undefined : 'Age must be between 0 and 120',
      passed,
      test: 'age',
      value: age,
    }
  }

  private validateCount(count?: number): {error?: string; passed: boolean; test: string; value?: any} {
    if (count === undefined) {
      return {error: 'No count provided - skipping test', passed: true, test: 'count'}
    }

    const passed = count >= 1 && count <= 100
    return {
      error: passed ? undefined : 'Count must be between 1 and 100',
      passed,
      test: 'count',
      value: count,
    }
  }

  private validateEmail(email?: string): {error?: string; passed: boolean; test: string; value?: any} {
    if (!email) {
      return {error: 'No email provided - skipping test', passed: true, test: 'email'}
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const passed = emailRegex.test(email)

    return {
      error: passed ? undefined : 'Invalid email format. Expected format: user@domain.com',
      passed,
      test: 'email',
      value: email,
    }
  }

  private validateEnum(priority?: string): {error?: string; passed: boolean; test: string; value?: any} {
    if (!priority) {
      return {error: 'No priority provided - skipping test', passed: true, test: 'enum'}
    }

    const validOptions = ['low', 'medium', 'high', 'critical']
    const passed = validOptions.includes(priority)

    return {
      error: passed ? undefined : `Priority must be one of: ${validOptions.join(', ')}`,
      passed,
      test: 'enum',
      value: priority,
    }
  }

  private validatePercentage(percentage: number): {error?: string; passed: boolean; test: string; value?: any} {
    const passed = percentage >= 0 && percentage <= 100
    return {
      error: passed ? undefined : 'Percentage must be between 0 and 100',
      passed,
      test: 'percentage',
      value: percentage,
    }
  }

  private validatePhoneNumber(phone: string): {error?: string; passed: boolean; test: string; value?: any} {
    const phoneRegex = /^\+1-\d{3}-\d{3}-\d{4}$/
    const passed = phoneRegex.test(phone)

    return {
      error: passed ? undefined : 'Phone number must be in format: +1-555-123-4567',
      passed,
      test: 'phone-number',
      value: phone,
    }
  }

  private validateRequired(
    value?: string,
    isRequired: boolean = false,
  ): {error?: string; passed: boolean; test: string; value?: any} {
    if (!isRequired) {
      return {error: 'Required field test not active - use testType "required"', passed: true, test: 'required'}
    }

    const passed = Boolean(value && value.trim())
    return {
      error: passed ? undefined : 'Required field cannot be empty',
      passed,
      test: 'required',
      value: value || null,
    }
  }

  private validateUrl(url?: string): {error?: string; passed: boolean; test: string; value?: any} {
    if (!url) {
      return {error: 'No URL provided - skipping test', passed: true, test: 'url'}
    }

    try {
      return {passed: true, test: 'url', value: url}
    } catch {
      return {
        error: 'Invalid URL format. Expected format: https://example.com',
        passed: false,
        test: 'url',
        value: url,
      }
    }
  }

  private validateZipCode(zipCode: string): {error?: string; passed: boolean; test: string; value?: any} {
    const zipRegex = /^\d{5}$/
    const passed = zipRegex.test(zipCode)

    return {
      error: passed ? undefined : 'ZIP code must be 5 digits',
      passed,
      test: 'zip-code',
      value: zipCode,
    }
  }
}
