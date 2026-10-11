/**
 * Step 5: QACode - Execute deterministic acceptance commands
 */
import { Ticket, StepResult } from '../types';
import { runCommand } from '../utils';

export async function step5_qacode(ticket: Ticket): Promise<StepResult<{ passed: boolean; results: Array<{ command: string; passed: boolean; output: string }> }>> {
  const startTime = Date.now();
  console.log(`[Step 5: QACode] Starting for ticket ${ticket.frontmatter.id}`);

  const commands = ticket.frontmatter.verify_commands;
  if (commands.length === 0) {
    console.log('[Step 5: QACode] No verification commands defined, skipping');
    return {
      success: true,
      data: { passed: true, results: [] },
      durationMs: Date.now() - startTime,
    };
  }

  const results = [];
  let allPassed = true;

  for (const cmd of commands) {
    console.log(`[Step 5] Running: ${cmd}`);
    const result = await runCommand(cmd, process.cwd(), 120000); // 2 min per command
    const passed = result.code === 0;
    
    results.push({
      command: cmd,
      passed,
      output: result.stdout + (result.stderr ? '\nSTDERR:\n' + result.stderr : ''),
    });

    if (!passed) {
      allPassed = false;
      console.log(`[Step 5] FAILED: ${cmd}`);
    } else {
      console.log(`[Step 5] PASSED: ${cmd}`);
    }
  }

  return {
    success: allPassed,
    data: { passed: allPassed, results },
    durationMs: Date.now() - startTime,
    error: allPassed ? undefined : 'One or more verification commands failed',
  };
}