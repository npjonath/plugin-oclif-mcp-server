# example

A new CLI generated with oclif

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/example.svg)](https://npmjs.org/package/example)
[![Downloads/week](https://img.shields.io/npm/dw/example.svg)](https://npmjs.org/package/example)

<!-- toc -->

- [Usage](#usage)
- [Commands](#commands)
<!-- tocstop -->

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
