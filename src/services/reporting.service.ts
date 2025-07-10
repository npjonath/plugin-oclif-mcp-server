import {Command} from '@oclif/core'

import {McpConfig} from '../types/index.js'

export class ReportingService {
  public async showFilteredCommands(
    filteredCommands: Command.Loadable[],
    excludedCommands: Command.Loadable[],
    mcpConfig: McpConfig,
    showFiltered: boolean,
  ): Promise<void> {
    if (!showFiltered) return

    console.log('\n🔍 Command Filtering Report\n')

    console.log(`📊 Statistics:`)
    console.log(`  • Total commands: ${filteredCommands.length + excludedCommands.length}`)
    console.log(`  • Included: ${filteredCommands.length}`)
    console.log(`  • Excluded: ${excludedCommands.length}`)
    console.log(`  • Tool limit: ${mcpConfig.toolLimits?.maxTools || 128}`)
    console.log()

    if (excludedCommands.length > 0) {
      console.log(`❌ Excluded Commands (${excludedCommands.length}):`)
      for (const cmd of excludedCommands.slice(0, 20)) {
        const reason = cmd.hidden
          ? 'hidden'
          : cmd.disableMCP
            ? 'disableMCP'
            : cmd.pluginType === 'jit'
              ? 'JIT'
              : cmd.id === 'mcp'
                ? 'self'
                : 'filtered'
        console.log(`  • ${cmd.id} (${reason})`)
      }

      if (excludedCommands.length > 20) {
        console.log(`  ... and ${excludedCommands.length - 20} more`)
      }

      console.log()
    }

    console.log(`✅ Included Commands (${filteredCommands.length}):`)
    for (const cmd of filteredCommands.slice(0, 20)) {
      console.log(`  • ${cmd.id}`)
    }

    if (filteredCommands.length > 20) {
      console.log(`  ... and ${filteredCommands.length - 20} more`)
    }

    console.log('\n💡 Configuration Help:')
    console.log('  Use --include-topics to filter by topics')
    console.log('  Use --exclude-patterns to exclude specific commands')
    console.log('  Use --max-tools to adjust the tool limit')
    console.log('  Use --profile to apply predefined configurations')
  }
}
