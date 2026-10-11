/**
 * Step 8: Address Review - Poll PR for review comments and address them
 */
import { Ticket, StepResult } from '../types';
import { runCommand, runCline, extractFinalText, sleep } from '../utils';

const ADDRESS_REVIEW_PROMPT = `You are addressing PR review comments. Process each comment and make necessary changes.

TICKET: {ticketTitle}
ID: {ticketId}

PR URL: {prUrl}

REVIEW COMMENTS:
{comments}

INSTRUCTIONS:
1. Analyze each review comment
2. Determine which require code changes vs. which are already addressed
3. Make necessary code changes
4. Respond to each comment thread
5. Mark resolved comments as resolved

COMMENTS TO ADDRESS:
{commentDetails}

OUTPUT: Make the changes and respond. The system will handle posting responses.`;

export async function step8_addressReview(ticket: Ticket, maxIterations = 10, pollIntervalMs = 30000): Promise<StepResult<{ iterations: number; commentsAddressed: number }>> {
  const startTime = Date.now();
  console.log(`[Step 8: Address Review] Starting for ticket ${ticket.frontmatter.id}`);

  if (!ticket.frontmatter.pr_url) {
    return {
      success: false,
      error: 'No PR URL found on ticket',
      durationMs: Date.now() - startTime,
    };
  }

  const prUrl = ticket.frontmatter.pr_url;
  const prNumberMatch = prUrl.match(/\/pull\/(\d+)/);
  if (!prNumberMatch) {
    return {
      success: false,
      error: 'Invalid PR URL format',
      durationMs: Date.now() - startTime,
    };
  }
  const prNumber = prNumberMatch[1];

  let iterations = 0;
  let totalCommentsAddressed = 0;
  let consecutiveClean = 0;

  try {
    while (iterations < maxIterations && consecutiveClean < 2) {
      iterations++;
      console.log(`[Step 8] Polling iteration ${iterations}/${maxIterations}`);

      // Fetch review comments
      const { stdout: commentsOutput } = await runCommand(
        `gh api repos/:owner/:repo/pulls/${prNumber}/comments --paginate`
      );
      
      let comments: any[] = [];
      try {
        comments = JSON.parse(commentsOutput);
      } catch {
        comments = [];
      }

      // Filter unresolved comments
      const unresolvedComments = comments.filter(c => !c.resolved_at && c.user?.type !== 'Bot');
      
      if (unresolvedComments.length === 0) {
        consecutiveClean++;
        console.log(`[Step 8] No unresolved comments (clean streak: ${consecutiveClean})`);
        await sleep(pollIntervalMs);
        continue;
      }

      consecutiveClean = 0;
      console.log(`[Step 8] Found ${unresolvedComments.length} unresolved comments`);

      // Group by file for efficient processing
      const commentsByFile = new Map<string, typeof comments>();
      for (const comment of unresolvedComments) {
        const path = comment.path || 'general';
        if (!commentsByFile.has(path)) commentsByFile.set(path, []);
        commentsByFile.get(path)!.push(comment);
      }

      // Process each file's comments
      for (const [filePath, fileComments] of commentsByFile) {
        const commentDetails = fileComments.map(c => 
          `File: ${c.path || 'N/A'}\nLine: ${c.line || c.original_line || 'N/A'}\nAuthor: ${c.user?.login}\nBody: ${c.body}\n---`
        ).join('\n');

        const prompt = ADDRESS_REVIEW_PROMPT
          .replace('{ticketTitle}', ticket.frontmatter.title)
          .replace('{ticketId}', ticket.frontmatter.id)
          .replace('{prUrl}', prUrl)
          .replace('{comments}', `${fileComments.length} comments on ${filePath}`)
          .replace('{commentDetails}', commentDetails);

        await runCline(prompt, {
          cwd: process.cwd(),
          thinking: 'medium',
          timeoutMs: 300000,
          worktree: false, // Work on main branch for review fixes
        });

        // After changes, commit and push
        await runCommand('git add -A');
        const { stdout: status } = await runCommand('git status --porcelain');
        if (status.trim()) {
          await runCommand(`git commit -m "${ticket.frontmatter.id}: Address review comments on ${filePath}"`);
          await runCommand('git push');
        }

        // Resolve comments via API
        for (const comment of fileComments) {
          await runCommand(`gh api -X PATCH repos/:owner/:repo/pulls/comments/${comment.id} -f body="Resolved by automated agent"`);
          totalCommentsAddressed++;
        }
      }

      // Wait before next poll
      await sleep(pollIntervalMs);
    }

    console.log(`[Step 8] Completed after ${iterations} iterations, addressed ${totalCommentsAddressed} comments`);
    
    return {
      success: true,
      data: { iterations, commentsAddressed: totalCommentsAddressed },
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