import {Args, Command, Flags} from '@oclif/core'

export default class TestArgsRequired extends Command {
  static args = {
    email: Args.string({
      description: 'Email address (required)',
      required: true,
    }),
    fullName: Args.string({
      description: 'Full name of the user (required)',
      required: true,
    }),
    userId: Args.string({
      description: 'User ID (required)',
      required: true,
    }),
  }
  static description = 'Demonstrates required arguments with validation for MCP schema generation'
  static examples = [
    `$ example test-args-required user123 "John Doe" john@example.com`,
    `$ example test-args-required admin "Admin User" admin@company.com --role admin`,
  ]
  static flags = {
    active: Flags.boolean({
      allowNo: true,
      char: 'a',
      default: true,
      description: 'User is active',
    }),
    department: Flags.string({
      char: 'd',
      description: 'Department name',
      required: false,
    }),
    role: Flags.option({
      char: 'r',
      default: 'user',
      description: 'User role',
      options: ['user', 'admin', 'moderator'],
    })(),
  }
  static summary = 'Test required positional arguments'

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TestArgsRequired)

    this.log('=== Required Arguments Test Results ===')
    this.log(`User ID: ${args.userId}`)
    this.log(`Full Name: ${args.fullName}`)
    this.log(`Email: ${args.email}`)
    this.log(`Role: ${flags.role}`)
    this.log(`Department: ${flags.department || 'not specified'}`)
    this.log(`Active: ${flags.active}`)

    // Validate email format (basic validation)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (emailRegex.test(args.email)) {
      this.log(`✅ Email format is valid`)
    } else {
      this.warn(`⚠️  Email format might be invalid: ${args.email}`)
    }

    // Generate user profile
    const userProfile = {
      active: flags.active,
      createdAt: new Date().toISOString(),
      department: flags.department,
      email: args.email,
      id: args.userId,
      name: args.fullName,
      role: flags.role,
    }

    this.log('\n👤 Generated User Profile:')
    this.log(JSON.stringify(userProfile, null, 2))

    // Role-specific actions
    if (flags.role === 'admin') {
      this.log('\n🔐 Admin privileges granted')
    } else if (flags.role === 'moderator') {
      this.log('\n🛡️  Moderator permissions applied')
    } else {
      this.log('\n👥 Standard user permissions applied')
    }

    // Status summary
    const status = flags.active ? 'active' : 'inactive'
    this.log(`\n📊 Summary: Created ${status} ${flags.role} account for ${args.fullName}`)
  }
}
