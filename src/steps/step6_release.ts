/**
 * Step 6: Release - Create Pull Request on GitHub
 */
import { Ticket, StepResult } from '../types';
import { runCommand } from '../utils';

export async function step6_release(ticket: Ticket): Promise<StepResult<{ prUrl: string; prNumber: number }>> {
  const startTime = Date.now();
  console.log(`[Step 6: Release] Starting for ticket ${ticket.frontmatter.id}`);

  try {
    // Ensure we're on a feature branch
    const branchName = ticket.frontmatter.head_branch || `feature/${ticket.frontmatter.id.toLowerCase()}`;
    const baseBranch = ticket.frontmatter.base_branch || 'main';

    // Check if branch exists, create if needed
    const { stdout: branches } = await runCommand('git branch --list ' + branchName);
    if (!branches.trim()) {
      await runCommand(`git checkout -b ${branchName} ${baseBranch}`);
    } else {
      await runCommand(`git checkout ${branchName}`);
    }

    // Stage all changes
    await runCommand('git add -A');
    
    // Check if there are changes to commit
    const { stdout: status } = await runCommand('git status --porcelain');
    if (!status.trim()) {
      return {
        success: false,
        error: 'No changes to commit',
        durationMs: Date.now() - startTime,
      };
    }

    // Commit with ticket reference
    const commitMsg = `${ticket.frontmatter.id}: ${ticket.frontmatter.title}\n\nCloses #${ticket.frontmatter.id}`;
    await runCommand(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);

    // Push branch
    await runCommand(`git push -u origin ${branchName}`);

    // Create PR using gh CLI
    const { stdout: prOutput } = await runCommand(
      `gh pr create --base ${baseBranch} --head ${branchName} --title "${ticket.frontmatter.id}: ${ticket.frontmatter.title}" --body "## Ticket: ${ticket.frontmatter.id}\n\n${ticket.body}\n\n## Acceptance Criteria\n${ticket.frontmatter.acceptance_criteria.map(c => `- [ ] ${c}`).join('\n')}\n\n## Verification\n${ticket.frontmatter.verify_commands.map(c => '`'+c+'`').join('\n')}"`
    );

    const prUrl = prOutput.trim();
    const prNumberMatch = prUrl.match(/\/pull\/(\d+)/);
    const prNumber = prNumberMatch ? parseInt(prNumberMatch[1], 10) : 0;

    // Update ticket with PR info
    ticket.frontmatter.pr_url = prUrl;
    ticket.frontmatter.head_branch = branchName;
    ticket.frontmatter.base_branch = baseBranch;

    console.log(`[Step 6: Release] Created PR: ${prUrl}`);
    
    return {
      success: true,
      data: { prUrl, prNumber },
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime,
    };
  }
}