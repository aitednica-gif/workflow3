/**
 * Step 7: QAES - Generate manual QA test notes for the ticket
 */
import { Ticket, StepResult } from '../types';
import { runCline, extractFinalText } from '../utils';

const QAES_PROMPT = `You are a QA engineer creating a manual test guide for this feature.

TICKET: {ticketTitle}
ID: {ticketId}

ACCEPTANCE CRITERIA:
{criteria}

IMPLEMENTATION SUMMARY:
{planSummary}

INSTRUCTIONS:
1. Create a comprehensive manual test guide
2. Include step-by-step test cases for each acceptance criterion
3. Add edge case scenarios based on the implementation
4. Include setup/teardown instructions if needed
5. Format as Markdown suitable for attaching to the ticket

OUTPUT FORMAT (Markdown):
# Manual QA Test Guide: {ticketTitle}

## Setup
...

## Test Cases

### TC-001: [Criterion description]
**Steps:**
1. ...
2. ...
**Expected:** ...

### TC-002: ...

## Edge Cases
...

## Cleanup
...`;

export async function step7_qaes(ticket: Ticket, plan: any): Promise<StepResult<{ testGuide: string }>> {
  const startTime = Date.now();
  console.log(`[Step 7: QAES] Starting for ticket ${ticket.frontmatter.id}`);

  try {
    const criteria = ticket.frontmatter.acceptance_criteria.map(c => `- ${c}`).join('\n');
    const planSummary = plan.markdown || plan.data?.markdown || 'No plan available';

    const prompt = QAES_PROMPT
      .replace('{ticketTitle}', ticket.frontmatter.title)
      .replace('{ticketId}', ticket.frontmatter.id)
      .replace('{criteria}', criteria)
      .replace('{planSummary}', planSummary.substring(0, 5000));

    const result = await runCline(prompt, {
      cwd: process.cwd(),
      thinking: 'medium',
      timeoutMs: 120000,
    });

    const testGuide = extractFinalText(result);

    // In a real implementation, this would be posted to Linear/ticket system
    // For now, we save it alongside the ticket
    const guidePath = ticket.path.replace('.md', '-QA-GUIDE.md');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(guidePath, testGuide, 'utf-8');

    console.log(`[Step 7: QAES] Generated QA guide at ${guidePath}`);
    
    return {
      success: true,
      data: { testGuide },
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