/**
 * Step 3: Implement - Execute sub-agents per subtask with lint/test validation
 */
import { Ticket, PlanResult, PlanTask, StepResult } from '../types';
import { runCline, extractFinalText, runCommand, sleep } from '../utils';

const IMPLEMENT_TASK_PROMPT = `You are implementing a specific subtask. Complete it fully and run validation.

TASK: {taskTitle}
ID: {taskId}

DESCRIPTION:
{taskDescription}

FILES TO MODIFY:
{files}

DEPENDENCIES: {dependencies}

CONTEXT:
This is part of ticket: {ticketTitle}
Full plan available in plan.md

INSTRUCTIONS:
1. Implement the changes described in the task
2. Follow existing code patterns and conventions
3. Write clean, well-tested code
4. Run lint and tests at the end
5. Fix any failures until green

OUTPUT: Just complete the implementation. The system will run validation separately.`;

const FINAL_VALIDATION_PROMPT = `You are the final validation agent. Review all implemented changes and ensure quality.

TICKET: {ticketTitle}
PLAN: {planMarkdown}

INSTRUCTIONS:
1. Review all changes made
2. Run the linter and fix any issues
3. Run the test suite and fix any failures
4. Ensure all acceptance criteria are met
5. Summarize what was implemented and any remaining issues`;

export async function step3_implement(ticket: Ticket, plan: PlanResult): Promise<StepResult<{ tasksCompleted: string[]; validationPassed: boolean }>> {
  const startTime = Date.now();
  console.log(`[Step 3: Implement] Starting for ticket ${ticket.frontmatter.id} with ${plan.tasks.length} tasks`);

  const completedTasks: string[] = [];
  let validationPassed = false;

  try {
    // Execute each task (in parallel groups by dependency)
    const tasksByDependency = groupTasksByDependency(plan.tasks);
    
    for (const group of tasksByDependency) {
      // Run tasks in this group in parallel
      const promises = group.map(task => runSubtask(ticket, plan, task));
      const results = await Promise.allSettled(promises);
      
      results.forEach((result, i) => {
        if (result.status === 'fulfilled' && result.value.success) {
          completedTasks.push(group[i].id);
          console.log(`[Step 3] Task ${group[i].id} completed`);
        } else {
          console.error(`[Step 3] Task ${group[i].id} failed:`, result.status === 'rejected' ? result.reason : result.value.error);
        }
      });
    }

    // Final validation: lint + tests
    console.log('[Step 3] Running final validation (lint + tests)...');
    const validationResult = await runFinalValidation(ticket, plan);
    validationPassed = validationResult.success;

    return {
      success: validationPassed,
      data: { tasksCompleted: completedTasks, validationPassed },
      durationMs: Date.now() - startTime,
      error: validationPassed ? undefined : 'Final validation failed',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime,
    };
  }
}

function groupTasksByDependency(tasks: PlanTask[]): PlanTask[][] {
  const groups: PlanTask[][] = [];
  const remaining = [...tasks];
  const completed = new Set<string>();

  while (remaining.length > 0) {
    const ready = remaining.filter(t => t.dependencies.every(d => completed.has(d)));
    if (ready.length === 0) {
      // Circular dependency or missing dependency - run remaining sequentially
      groups.push(remaining.splice(0));
      break;
    }
    groups.push(ready);
    ready.forEach(t => completed.add(t.id));
    // Remove from remaining
    const readyIds = new Set(ready.map(t => t.id));
    for (let i = remaining.length - 1; i >= 0; i--) {
      if (readyIds.has(remaining[i].id)) remaining.splice(i, 1);
    }
  }
  return groups;
}

async function runSubtask(ticket: Ticket, plan: PlanResult, task: PlanTask): Promise<StepResult<void>> {
  const prompt = IMPLEMENT_TASK_PROMPT
    .replace('{taskTitle}', task.title)
    .replace('{taskId}', task.id)
    .replace('{taskDescription}', task.description)
    .replace('{files}', task.files.join(', '))
    .replace('{dependencies}', task.dependencies.join(', ') || 'none')
    .replace('{ticketTitle}', ticket.frontmatter.title);

  const result = await runCline(prompt, {
    cwd: process.cwd(),
    worktree: true, // Isolated worktree per subtask
    thinking: 'medium',
    timeoutMs: 600000, // 10 min per subtask
  });

  const text = extractFinalText(result);
  const runResult = result.lines.find(l => l.type === 'run_result');
  
  if (runResult?.finishReason === 'completed') {
    return { success: true, data: undefined, durationMs: runResult.durationMs || 0 };
  }
  return { success: false, error: text || 'Subtask failed', durationMs: runResult?.durationMs || 0 };
}

async function runFinalValidation(ticket: Ticket, plan: PlanResult): Promise<StepResult<void>> {
  const prompt = FINAL_VALIDATION_PROMPT
    .replace('{ticketTitle}', ticket.frontmatter.title)
    .replace('{planMarkdown}', plan.markdown);

  const result = await runCline(prompt, {
    cwd: process.cwd(),
    thinking: 'medium',
    timeoutMs: 300000,
  });

  const runResult = result.lines.find(l => l.type === 'run_result');
  return {
    success: runResult?.finishReason === 'completed',
    data: undefined,
    durationMs: runResult?.durationMs || 0,
    error: runResult?.finishReason === 'completed' ? undefined : 'Validation failed',
  };
}