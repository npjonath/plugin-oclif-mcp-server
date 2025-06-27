# simple-mcp-server-example

A simple cli with basic command that use the mcp server plugin for oclif

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/simple-mcp-server-example.svg)](https://npmjs.org/package/simple-mcp-server-example)
[![Downloads/week](https://img.shields.io/npm/dw/simple-mcp-server-example.svg)](https://npmjs.org/package/simple-mcp-server-example)

<!-- toc -->

- [Usage](#usage)
- [Commands](#commands)
<!-- tocstop -->

# Usage

<!-- usage -->

```sh-session
$ npm install -g simple-mcp-server-example
$ simple-mcp-server-example COMMAND
running command...
$ simple-mcp-server-example (--version)
simple-mcp-server-example/0.0.0 darwin-arm64 node-v22.13.0
$ simple-mcp-server-example --help [COMMAND]
USAGE
  $ simple-mcp-server-example COMMAND
...
```

<!-- usagestop -->

# Commands

<!-- commands -->

- [`simple-mcp-server-example hello PERSON`](#simple-mcp-server-example-hello-person)
- [`simple-mcp-server-example hello world`](#simple-mcp-server-example-hello-world)
- [`simple-mcp-server-example help [COMMAND]`](#simple-mcp-server-example-help-command)
- [`simple-mcp-server-example plugins`](#simple-mcp-server-example-plugins)
- [`simple-mcp-server-example plugins add PLUGIN`](#simple-mcp-server-example-plugins-add-plugin)
- [`simple-mcp-server-example plugins:inspect PLUGIN...`](#simple-mcp-server-example-pluginsinspect-plugin)
- [`simple-mcp-server-example plugins install PLUGIN`](#simple-mcp-server-example-plugins-install-plugin)
- [`simple-mcp-server-example plugins link PATH`](#simple-mcp-server-example-plugins-link-path)
- [`simple-mcp-server-example plugins remove [PLUGIN]`](#simple-mcp-server-example-plugins-remove-plugin)
- [`simple-mcp-server-example plugins reset`](#simple-mcp-server-example-plugins-reset)
- [`simple-mcp-server-example plugins uninstall [PLUGIN]`](#simple-mcp-server-example-plugins-uninstall-plugin)
- [`simple-mcp-server-example plugins unlink [PLUGIN]`](#simple-mcp-server-example-plugins-unlink-plugin)
- [`simple-mcp-server-example plugins update`](#simple-mcp-server-example-plugins-update)

## `simple-mcp-server-example hello PERSON`

Say hello

```
USAGE
  $ simple-mcp-server-example hello PERSON -f <value>

ARGUMENTS
  PERSON  Person to say hello to

FLAGS
  -f, --from=<value>  (required) Who is saying hello

DESCRIPTION
  Say hello

EXAMPLES
  $ simple-mcp-server-example hello friend --from oclif
  hello friend from oclif! (./src/commands/hello/index.ts)
```

_See code: [src/commands/hello/index.ts](https://github.com/npjonath/oclif-plugin-mcp-server/blob/v0.0.0/src/commands/hello/index.ts)_

## `simple-mcp-server-example hello world`

Say hello world

```
USAGE
  $ simple-mcp-server-example hello world

DESCRIPTION
  Say hello world

EXAMPLES
  $ simple-mcp-server-example hello world
  hello world! (./src/commands/hello/world.ts)
```

_See code: [src/commands/hello/world.ts](https://github.com/npjonath/oclif-plugin-mcp-server/blob/v0.0.0/src/commands/hello/world.ts)_

## `simple-mcp-server-example help [COMMAND]`

Display help for simple-mcp-server-example.

```
USAGE
  $ simple-mcp-server-example help [COMMAND...] [-n]

ARGUMENTS
  COMMAND...  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for simple-mcp-server-example.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v6.2.29/src/commands/help.ts)_

## `simple-mcp-server-example plugins`

List installed plugins.

```
USAGE
  $ simple-mcp-server-example plugins [--json] [--core]

FLAGS
  --core  Show core plugins.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List installed plugins.

EXAMPLES
  $ simple-mcp-server-example plugins
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.42/src/commands/plugins/index.ts)_

## `simple-mcp-server-example plugins add PLUGIN`

Installs a plugin into simple-mcp-server-example.

```
USAGE
  $ simple-mcp-server-example plugins add PLUGIN... [--json] [-f] [-h] [-s | -v]

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
  Installs a plugin into simple-mcp-server-example.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the SIMPLE_MCP_SERVER_EXAMPLE_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the SIMPLE_MCP_SERVER_EXAMPLE_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ simple-mcp-server-example plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ simple-mcp-server-example plugins add myplugin

  Install a plugin from a github url.

    $ simple-mcp-server-example plugins add https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ simple-mcp-server-example plugins add someuser/someplugin
```

## `simple-mcp-server-example plugins:inspect PLUGIN...`

Displays installation properties of a plugin.

```
USAGE
  $ simple-mcp-server-example plugins inspect PLUGIN...

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
  $ simple-mcp-server-example plugins inspect myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.42/src/commands/plugins/inspect.ts)_

## `simple-mcp-server-example plugins install PLUGIN`

Installs a plugin into simple-mcp-server-example.

```
USAGE
  $ simple-mcp-server-example plugins install PLUGIN... [--json] [-f] [-h] [-s | -v]

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
  Installs a plugin into simple-mcp-server-example.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the SIMPLE_MCP_SERVER_EXAMPLE_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the SIMPLE_MCP_SERVER_EXAMPLE_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ simple-mcp-server-example plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ simple-mcp-server-example plugins install myplugin

  Install a plugin from a github url.

    $ simple-mcp-server-example plugins install https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ simple-mcp-server-example plugins install someuser/someplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.42/src/commands/plugins/install.ts)_

## `simple-mcp-server-example plugins link PATH`

Links a plugin into the CLI for development.

```
USAGE
  $ simple-mcp-server-example plugins link PATH [-h] [--install] [-v]

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
  $ simple-mcp-server-example plugins link myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.42/src/commands/plugins/link.ts)_

## `simple-mcp-server-example plugins remove [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ simple-mcp-server-example plugins remove [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ simple-mcp-server-example plugins unlink
  $ simple-mcp-server-example plugins remove

EXAMPLES
  $ simple-mcp-server-example plugins remove myplugin
```

## `simple-mcp-server-example plugins reset`

Remove all user-installed and linked plugins.

```
USAGE
  $ simple-mcp-server-example plugins reset [--hard] [--reinstall]

FLAGS
  --hard       Delete node_modules and package manager related files in addition to uninstalling plugins.
  --reinstall  Reinstall all plugins after uninstalling.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.42/src/commands/plugins/reset.ts)_

## `simple-mcp-server-example plugins uninstall [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ simple-mcp-server-example plugins uninstall [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ simple-mcp-server-example plugins unlink
  $ simple-mcp-server-example plugins remove

EXAMPLES
  $ simple-mcp-server-example plugins uninstall myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.42/src/commands/plugins/uninstall.ts)_

## `simple-mcp-server-example plugins unlink [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ simple-mcp-server-example plugins unlink [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ simple-mcp-server-example plugins unlink
  $ simple-mcp-server-example plugins remove

EXAMPLES
  $ simple-mcp-server-example plugins unlink myplugin
```

## `simple-mcp-server-example plugins update`

Update installed plugins.

```
USAGE
  $ simple-mcp-server-example plugins update [-h] [-v]

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Update installed plugins.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.42/src/commands/plugins/update.ts)_

<!-- commandsstop -->
