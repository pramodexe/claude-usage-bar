# usage-bar

See your Claude usage at a glance, right under the prompt.

```
context ━━━━━─── 58%   │   5h ━━────── 23% ↻ 2h10   │   week ━━━━━─── 61% ↻ 3d
```

Works in **Claude Code (CLI)** and **Claude Desktop** (the Code section). Install once and it works in both.

## What the bar means

- **context**: how full Claude's memory of this chat is. When it gets full, start a new chat or type `/compact`.
- **5h**: how much of your 5-hour limit you've used. `↻` shows when it resets.
- **week**: how much of your weekly limit you've used.

The bars get brighter as they fill up.

## Easy install: let Claude do it

Copy this prompt, paste it into Claude Code (in the terminal or in Claude Desktop), and Claude will do the rest:

```text
Please install the "usage-bar" Claude Code plugin for me from the GitHub repository pramodexe/claude-usage-bar.
Add it as a plugin marketplace, install the "usage-bar" plugin from it for my user (so it works in both Claude Code CLI and Claude Desktop), and check that it shows as enabled.
Then tell me what I need to restart to see the usage bar.
```

When it's done, restart Claude Code or Claude Desktop. The bar shows up after Claude's first reply.

## Manual install

If you prefer to do it yourself, run these two commands in a terminal:

```bash
claude plugin marketplace add pramodexe/claude-usage-bar
claude plugin install usage-bar@claude-usage-bar
```

Then restart Claude Code or Claude Desktop.

## Turn it off

Type `/plugin` in Claude Code, open the **Installed** tab, and switch **usage-bar** off. Switch it back on the same way.

## Not showing up?

- Send one message first. The bar appears after Claude replies.
- Type `/usage-bar` to check that it's running.
- The **5h** and **week** parts only show on a Claude Pro or Max plan.

## License

MIT
