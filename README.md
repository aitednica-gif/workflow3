# Cline Orchestrator

Programmatic AI agent pipeline for software development using Cline CLI. Implements the 8-step pipeline from the architecture proposal with local ticket files instead of Linear.

## Architecture

This orchestrator implements the 8-step pipeline:

1. **Enrich** - Investigate codebase, find relevant files, edge cases, patterns
2. **Plan** - Generate detailed implementation plan with task breakdown
3. **Implement** - Execute sub-agents per task (isolated via git worktrees)
4. **Code Review** - Specialized review agent (reports only, no modifications)
5. **QACode** - Run deterministic verification commands
6. **Release** - Create Pull Request on GitHub
7. **QAES** - Generate manual QA test guide
8. **Address Review** - Poll PR for comments and address them

## Installation

```bash
npm install
npm run build
```

Requires:
- Node.js 20+
- Cline CLI installed and authenticated (`cline auth`)
- GitHub CLI (`gh`) authenticated for PR creation
- Git repository with remote origin

## Quick Start

```bash
# Initialize ticket structure
npm run init

# Create a new ticket
npm run create "Add user authentication" \
  -c "User can register with email/password" \
  -c "User can login and receive JWT" \
  -v "npm test" -v "npm run lint"

# Process a specific ticket
npm run process TICKET-20261011-ABCD

# Process all active tickets
npm run process

# Watch for new tickets (daemon mode)
npm run watch
```

## Ticket Structure

Tickets are Markdown files with YAML frontmatter:

```
tickets/
├── active/
│   └── TICKET-20261011-ABCD.md    # Ticket in progress
├── done/
│   └── TICKET-20261011-ABCD.md    # Completed ticket
├── blocked/
│   └── TICKET-20261011-EFGH.md    # Failed ticket
└── templates/
    └── ticket-template.md          # Template for new tickets
```

### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier (auto-generated) |
| `title` | Yes | Brief descriptive title |
| `status` | Yes | `active`, `done`, or `blocked` |
| `created` | Yes | ISO timestamp |
| `updated` | Yes | ISO timestamp (auto-updated) |
| `acceptance_criteria` | Yes | List of testable criteria |
| `verify_commands` | Yes | Commands to verify implementation |
| `labels` | No | Categorization tags |
| `pr_url` | Auto | GitHub PR URL (set during Release) |
| `head_branch` | Auto | Feature branch name |
| `base_branch` | Auto | Target branch (default: main) |

## Configuration

Create `.orchestrator.config.json` in project root:

```json
{
  "ticketsDir": "./tickets",
  "maxRetries": 3,
  "defaultModel": "claude-3-5-sonnet-20241022",
  "defaultThinking": "medium",
  "timeoutMs": 600000,
  "worktreeBaseDir": ".cline/worktrees",
  "autoApprove": true
}
```

Or use environment variables:
- `TICKETS_DIR` - Ticket directory
- `CLINE_MODEL` - Default model
- `CLINE_THINKING` - Thinking level

## How It Works

### Sub-agent Isolation (Step 3)
Each implementation task runs in its own git worktree via Cline's `--worktree` flag. This prevents conflicts when multiple sub-agents edit files concurrently.

### Deterministic Verification (Step 5)
Acceptance criteria are translated to executable commands during planning. Step 5 runs them programmatically - no subjective evaluation.

### Review Separation (Step 4)
Code review is a separate agent that ONLY reports issues. It never modifies code. This enforces single responsibility.

### Continuous Feedback (Step 8)
After PR creation, the orchestrator polls GitHub for review comments, makes fixes, and resolves threads until the PR is clean.

## Example Output

After processing, a ticket in `done/` will have:
- Updated frontmatter with `pr_url`, `sha`, `status: done`
- Enrichment research saved in ticket
- Implementation plan saved in ticket
- Code review results saved
- QA test guide at `TICKET-XXXX-QA-GUIDE.md`

## Extending

Add custom steps by creating new files in `src/steps/` and importing them in `orchestrator.ts`.

## Security Notes

- Runs with `--auto-approve` for tools (configure per-step if needed)
- Uses git worktrees for isolation
- No secrets in tickets - use environment variables
- Review Step 8 changes before merging PR

## License

MIT