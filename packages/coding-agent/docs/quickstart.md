# Quickstart

This page gets you from install to a useful first jesus session.

## Install

Pi is distributed as an npm package:

```bash
npm install -g --ignore-scripts @jesus/coding-agent
```

`--ignore-scripts` disables dependency lifecycle scripts during install. Pi does not require install scripts for normal npm installs.

### Uninstall

Use the package manager that installed jesus. The curl installer uses npm globally, so curl and npm installs are removed with npm:

```bash
# curl installer or npm install -g
npm uninstall -g @jesus/coding-agent

# pnpm
pnpm remove -g @jesus/coding-agent

# Yarn
yarn global remove @jesus/coding-agent

# Bun
bun uninstall -g @jesus/coding-agent
```

Uninstalling jesus leaves settings, credentials, sessions, and installed jesus packages in `~/.jesus/agent/`.

Then start jesus in the project directory you want it to work on:

```bash
cd /path/to/project
jesus
```

## Authenticate

Pi can use subscription providers through `/login`, or API-key providers through environment variables or the auth file.

### Option 1: subscription login

Start jesus and run:

```text
/login
```

Then select a provider. Built-in subscription logins include Claude Pro/Max, ChatGPT Plus/Pro (Codex), and GitHub Copilot.

### Option 2: API key

Set an API key before launching jesus:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
jesus
```

You can also run `/login` and select an API-key provider to store the key in `~/.jesus/agent/auth.json`.

See [Providers](providers.md) for all supported providers, environment variables, and cloud-provider setup.

## First session

Once jesus starts, type a request and press Enter:

```text
Summarize this repository and tell me how to run its checks.
```

By default, jesus gives the model four tools:

- `read` - read files
- `write` - create or overwrite files
- `edit` - patch files
- `bash` - run shell commands

Additional built-in read-only tools (`grep`, `find`, `ls`) are available through tool options. Pi runs in your current working directory and can modify files there. Use git or another checkpointing workflow if you want easy rollback.

## Give jesus project instructions

Pi loads context files at startup. Add an `AGENTS.md` file to tell it how to work in a project:

```markdown
# Project Instructions

- Run `npm run check` after code changes.
- Do not run production migrations locally.
- Keep responses concise.
```

Pi loads:

- `~/.jesus/agent/AGENTS.md` for global instructions
- `AGENTS.md` or `CLAUDE.md` from parent directories and the current directory

If a directory contains `AGENTS.override.md`, Pi loads it instead of `AGENTS.md` or `CLAUDE.md` from that directory.

Restart jesus, or run `/reload`, after changing context files.

## Common things to try

### Reference files

Type `@` in the editor to fuzzy-search files, or pass files on the command line:

```bash
jesus @README.md "Summarize this"
jesus @src/app.ts @src/app.test.ts "Review these together"
```

Images or text can be pasted with Ctrl+V (Alt+V on Windows); images can also be dragged into supported terminals.

### Run shell commands

In interactive mode:

```text
!npm run lint
```

The command output is sent to the model. Use `!!command` to run a command without adding its output to the model context.

### Switch models

Use `/model` or Ctrl+L to choose a model for the current session. Press Ctrl+S in the model picker to save the highlighted model as the startup default. Use `/thinking` to choose a thinking level for the current session, or Ctrl+S in that picker to save the startup default thinking level. Use Shift+Tab to cycle thinking level. Use Ctrl+P / Shift+Ctrl+P to cycle through scoped models.

### Continue later

Sessions are saved automatically:

```bash
jesus -c                  # Continue most recent session
jesus -r                  # Browse previous sessions
jesus --name "my task"    # Set session display name at startup
jesus --session <path|id> # Open a specific session
```

Inside jesus, use `/resume`, `/new`, `/tree`, `/fork`, and `/clone` to manage sessions.

### Non-interactive mode

For one-shot prompts:

```bash
jesus -p "Summarize this codebase"
cat README.md | jesus -p "Summarize this text"
jesus -p @screenshot.png "What's in this image?"
```

Use `--mode json` for JSON event output or `--mode rpc` for process integration.

## Next steps

- [Using Pi](usage.md) - interactive mode, slash commands, sessions, context files, and CLI reference.
- [Providers](providers.md) - authentication and model setup.
- [Settings](settings.md) - global and project configuration.
- [Keybindings](keybindings.md) - shortcuts and customization.
- [Pi Packages](packages.md) - install shared extensions, skills, prompts, and themes.

Platform notes: [Windows](windows.md), [Termux](termux.md), [tmux](tmux.md), [Terminal setup](terminal-setup.md), [Shell aliases](shell-aliases.md).
