# Example CLI for MCP Plugin Testing

A test CLI for the oclif-plugin-mcp-server, demonstrating how to integrate the MCP (Model Context Protocol) plugin into an oclif CLI.

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/example.svg)](https://npmjs.org/package/example)
[![Downloads/week](https://img.shields.io/npm/dw/example.svg)](https://npmjs.org/package/example)

<!-- toc -->

- [MCP Plugin Testing](#mcp-plugin-testing)
  - [Quick Start](#quick-start)
  - [Development Scripts](#development-scripts)
  - [Testing & Debugging](#testing--debugging)
  - [HTTP Mode Testing](#http-mode-testing)
- [Usage](#usage)
- [Commands](#commands)
<!-- tocstop -->

# MCP Plugin Testing

This example CLI is specifically designed to test the `oclif-plugin-mcp-server` plugin. It demonstrates how to integrate MCP capabilities into any oclif CLI.

## Quick Start

1. **Install dependencies:**

   ```bash
   yarn install
   ```

2. **Build the CLI:**

   ```bash
   yarn build
   ```

3. **Link the MCP plugin:** (already done in package.json)

   ```bash
   yarn plugins link ..
   ```

4. **Test the MCP server:**
   ```bash
   yarn mcp:inspect
   ```

## Development Scripts

The following npm scripts are available for testing and debugging the MCP plugin:

### MCP Server Scripts

- `yarn mcp:start` - Start MCP server in stdio mode with debug logging
- `yarn mcp:start:http` - Start MCP server in HTTP mode on port 3000
- `yarn mcp:start:dev` - Start with development profile
- `yarn mcp:start:prod` - Start with production profile

### Debugging Scripts

- `yarn mcp:inspect` - Open MCP inspector for interactive testing
- `yarn mcp:inspect:http` - Open MCP inspector for HTTP mode
- `yarn mcp:debug` - Start with full debug logging (MCP + oclif)
- `yarn mcp:tools` - Show available tools and filtered commands
- `yarn debug:full` - Start with maximum debug output

### Plugin Management Scripts

- `yarn plugin:rebuild` - Rebuild parent plugin and relink to this CLI
- `yarn plugin:status` - Check plugin installation status

## Testing & Debugging

### 1. Interactive Testing with MCP Inspector

The MCP Inspector provides a GUI for testing the MCP server:

```bash
yarn mcp:inspect
```

This will:

- Start the MCP server in stdio mode
- Open a web interface for testing
- Allow you to inspect tools, resources, and execute commands

### 2. HTTP Mode Testing

For testing with HTTP transport:

```bash
# Terminal 1: Start HTTP server
yarn mcp:start:http

# Terminal 2: Test with curl scripts
yarn mcp:test:init      # Initialize connection
yarn mcp:test:tools     # List available tools
yarn mcp:test:resources # List available resources
yarn mcp:test:hello     # Execute hello command
```

### 3. Debug Logging

Enable detailed logging to troubleshoot issues:

```bash
# MCP-specific debugging
yarn mcp:debug

# Full debug output (verbose)
yarn debug:full
```

### 4. Plugin Development Workflow

When making changes to the parent plugin:

```bash
# Rebuild and relink the plugin
yarn plugin:rebuild

# Test the changes
yarn mcp:inspect
```

### 5. Manual Testing

You can also test manually:

```bash
# Check available commands
./bin/run.js --help

# Test MCP command directly
./bin/run.js mcp --help
./bin/run.js mcp --show-filtered

# Test with different profiles
./bin/run.js mcp --profile development
./bin/run.js mcp --profile production
```

## HTTP Mode Testing

When testing in HTTP mode, the server runs on `http://localhost:3000`. You can test using:

### Curl Commands (via npm scripts)

```bash
yarn mcp:test:init      # Test initialization
yarn mcp:test:tools     # List tools
yarn mcp:test:resources # List resources
yarn mcp:test:hello     # Execute hello command
```

### Manual Curl Commands

```bash
# Initialize
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"0.1.0","capabilities":{}},"id":1}'

# List tools
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":2}'

# Execute hello command
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"hello","arguments":{"person":"World","from":"MCP"}},"id":3}'
```

### Configuration

The MCP configuration is in `package.json` under `oclif.mcp`:

```json
{
  "oclif": {
    "mcp": {
      "resources": {
        "static": [
          {
            "uri": "file://example/README.md",
            "name": "Example CLI Documentation",
            "description": "Documentation for the example CLI"
          }
        ]
      },
      "prompts": [
        {
          "name": "example-help",
          "description": "Get help with example CLI commands"
        }
      ],
      "profiles": {
        "development": {"enabled": true, "debug": true},
        "production": {"enabled": true, "debug": false}
      }
    }
  }
}
```

# Usage

<!-- usage -->

```sh-session
$ npm install -g example
$ example COMMAND
running command...
$ example (--version)
example/0.0.0 darwin-arm64 node-v22.13.0
$ example --help [COMMAND]
USAGE
  $ example COMMAND
...
```

<!-- usagestop -->

# Commands

<!-- commands -->

- [`example hello PERSON`](#example-hello-person)
- [`example hello world`](#example-hello-world)
- [`example help [COMMAND]`](#example-help-command)
- [`example plugins`](#example-plugins)
- [`example plugins add PLUGIN`](#example-plugins-add-plugin)
- [`example plugins:inspect PLUGIN...`](#example-pluginsinspect-plugin)
- [`example plugins install PLUGIN`](#example-plugins-install-plugin)
- [`example plugins link PATH`](#example-plugins-link-path)
- [`example plugins remove [PLUGIN]`](#example-plugins-remove-plugin)
- [`example plugins reset`](#example-plugins-reset)
- [`example plugins uninstall [PLUGIN]`](#example-plugins-uninstall-plugin)
- [`example plugins unlink [PLUGIN]`](#example-plugins-unlink-plugin)
- [`example plugins update`](#example-plugins-update)

## `example hello PERSON`

Say hello

```
USAGE
  $ example hello PERSON -f <value>

ARGUMENTS
  PERSON  Person to say hello to

FLAGS
  -f, --from=<value>  (required) Who is saying hello

DESCRIPTION
  Say hello

EXAMPLES
  $ example hello friend --from oclif
  hello friend from oclif! (./src/commands/hello/index.ts)
```

_See code: [src/commands/hello/index.ts](https://github.com/plugin-mcp-server/example/blob/v0.0.0/src/commands/hello/index.ts)_

## `example hello world`

Say hello world

```
USAGE
  $ example hello world

DESCRIPTION
  Say hello world

EXAMPLES
  $ example hello world
  hello world! (./src/commands/hello/world.ts)
```

_See code: [src/commands/hello/world.ts](https://github.com/plugin-mcp-server/example/blob/v0.0.0/src/commands/hello/world.ts)_

## `example help [COMMAND]`

Display help for example.

```
USAGE
  $ example help [COMMAND...] [-n]

ARGUMENTS
  COMMAND...  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for example.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v6.2.30/src/commands/help.ts)_

## `example plugins`

List installed plugins.

```
USAGE
  $ example plugins [--json] [--core]

FLAGS
  --core  Show core plugins.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List installed plugins.

EXAMPLES
  $ example plugins
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.44/src/commands/plugins/index.ts)_

## `example plugins add PLUGIN`

Installs a plugin into example.

```
USAGE
  $ example plugins add PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into example.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the EXAMPLE_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the EXAMPLE_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ example plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ example plugins add myplugin

  Install a plugin from a github url.

    $ example plugins add https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ example plugins add someuser/someplugin
```

## `example plugins:inspect PLUGIN...`

Displays installation properties of a plugin.

```
USAGE
  $ example plugins inspect PLUGIN...

ARGUMENTS
  PLUGIN...  [default: .] Plugin to inspect.

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Displays installation properties of a plugin.

EXAMPLES
  $ example plugins inspect myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.44/src/commands/plugins/inspect.ts)_

## `example plugins install PLUGIN`

Installs a plugin into example.

```
USAGE
  $ example plugins install PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into example.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the EXAMPLE_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the EXAMPLE_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ example plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ example plugins install myplugin

  Install a plugin from a github url.

    $ example plugins install https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ example plugins install someuser/someplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.44/src/commands/plugins/install.ts)_

## `example plugins link PATH`

Links a plugin into the CLI for development.

```
USAGE
  $ example plugins link PATH [-h] [--install] [-v]

ARGUMENTS
  PATH  [default: .] path to plugin

FLAGS
  -h, --help          Show CLI help.
  -v, --verbose
      --[no-]install  Install dependencies after linking the plugin.

DESCRIPTION
  Links a plugin into the CLI for development.

  Installation of a linked plugin will override a user-installed or core plugin.

  e.g. If you have a user-installed or core plugin that has a 'hello' command, installing a linked plugin with a 'hello'
  command will override the user-installed or core plugin implementation. This is useful for development work.


EXAMPLES
  $ example plugins link myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.44/src/commands/plugins/link.ts)_

## `example plugins remove [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ example plugins remove [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ example plugins unlink
  $ example plugins remove

EXAMPLES
  $ example plugins remove myplugin
```

## `example plugins reset`

Remove all user-installed and linked plugins.

```
USAGE
  $ example plugins reset [--hard] [--reinstall]

FLAGS
  --hard       Delete node_modules and package manager related files in addition to uninstalling plugins.
  --reinstall  Reinstall all plugins after uninstalling.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.44/src/commands/plugins/reset.ts)_

## `example plugins uninstall [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ example plugins uninstall [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ example plugins unlink
  $ example plugins remove

EXAMPLES
  $ example plugins uninstall myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.44/src/commands/plugins/uninstall.ts)_

## `example plugins unlink [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ example plugins unlink [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ example plugins unlink
  $ example plugins remove

EXAMPLES
  $ example plugins unlink myplugin
```

## `example plugins update`

Update installed plugins.

```
USAGE
  $ example plugins update [-h] [-v]

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Update installed plugins.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.44/src/commands/plugins/update.ts)_

<!-- commandsstop -->
