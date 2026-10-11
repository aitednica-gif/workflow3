/**
 * Step 4: Code Review - Specialized review agent (reports only, no modifications)
 */
import { Ticket, CodeReviewResult, StepResult } from '../types';
import { runCline, extractFinalText } from '../utils';

const CODE_REVIEW_PROMPT = `You are a senior code reviewer. Analyze the implementation against standards and the original plan.

TICKET: {ticketTitle}
ID: {ticketId}

ACCEPTANCE CRITERIA:
{criteria}

PLAN:
{planMarkdown}

INSTRUCTIONS:
1. Review all changes made in this ticket
2. Check against repository coding standards
3. Verify architectural consistency
4. Identify security, performance, and maintainability issues
5. Check that all acceptance criteria are satisfied
6. DO NOT MODIFY CODE - only report issues

OUTPUT FORMAT (JSON only):
{
  "issues": [
    {
      "severity": "critical|major|minor|nit",
      "file": "path/to/file.ts",
      "line": 42,
      "message": "Description of the issue",
      "suggestion": "How to fix it"
    }
  ],
  "summary": "Overall assessment: APPROVED|NEEDS_CHANGES - Brief summary",
  "approved": true
}`;

export async function step4_codeReview(ticket: Ticket, plan: any): Promise<StepResult<CodeReviewResult>> {
  const startTime = Date.now();
  console.log(`[Step 4: Code Review] Starting for ticket ${ticket.frontmatter.id}`);

  try {
    const criteria = ticket.frontmatter.acceptance_criteria.map(c => `- ${c}`).join('\n');
    const planMarkdown = plan.markdown || plan.data?.markdown || 'No plan available';

    const prompt = CODE_REVIEW_PROMPT
      .replace('{ticketTitle}', ticket.frontmatter.title)
      .replace('{ticketId}', ticket.frontmatter.id)
      .replace('{criteria}', criteria)
      .replace('{planMarkdown}', planMarkdown);

    const result = await runCline(prompt, {
      cwd: process.cwd(),
      thinking: 'high',
      timeoutMs: 180000,
      // Code review agent should NOT have write access
      // autoApprove: false, // This would need a read-only mode
    });

    const text = extractFinalText(result);
    
    let reviewResult: CodeReviewResult;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        reviewResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (e) {
      reviewResult = {
        issues: [],
        summary: text.substring(0, 1000),
        approved: text.toLowerCase().includes('approved'),
      };
    }

    // Ensure structure
    reviewResult.issues = reviewResult.issues || [];
    reviewResult.summary = reviewResult.summary || 'No summary';
    reviewResult.approved = reviewResult.approved ?? false;

    console.log(`[Step 4: Code Review] Found ${reviewResult.issues.length} issues, approved: ${reviewResult.approved}`);
    
    return {
      success: true,
      data: reviewResult,
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