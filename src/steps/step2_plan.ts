/**
 * Step 2: Plan - Generate detailed implementation plan and task ledger
 */
import { Ticket, PlanResult, StepResult } from '../types';
import { runCline, extractFinalText } from '../utils';

const PLAN_PROMPT = `You are a technical lead creating a detailed implementation plan. Based on the research, produce an executable plan.

TICKET: {title}
ID: {id}

ACCEPTANCE CRITERIA:
{criteria}

ENRICHMENT RESEARCH:
{enrichment}

INSTRUCTIONS:
1. Break down the work into atomic, independent subtasks
2. Each subtask should be implementable by a single sub-agent
3. Define explicit verification commands for each acceptance criterion
4. Create a task ledger template with SHA placeholders for tracking
5. Order tasks by dependency (independent tasks can run in parallel)

OUTPUT FORMAT (JSON only):
{
  "markdown": "# Implementation Plan\n\n## Overview\n...\n\n## Tasks\n...\n\n## Verification Commands\n...\n\n## Task Ledger\n| Task ID | Title | Status | SHA |\n|---------|-------|--------|-----|\n| T1 | ... | pending | |\n",
  "tasks": [
    {
      "id": "T1",
      "title": "Task title",
      "description": "Detailed description of what to implement",
      "files": ["file1.ts", "file2.ts"],
      "dependencies": [],
      "estimatedTokens": 5000
    }
  ],
  "verificationCommands": ["npm test", "npm run lint"]
}`;

export async function step2_plan(ticket: Ticket, enrichment: any): Promise<StepResult<PlanResult>> {
  const startTime = Date.now();
  console.log(`[Step 2: Plan] Starting for ticket ${ticket.frontmatter.id}`);

  try {
    const criteria = ticket.frontmatter.acceptance_criteria.map(c => `- ${c}`).join('\n');
    const enrichmentText = JSON.stringify(enrichment, null, 2);
    
    const prompt = PLAN_PROMPT
      .replace('{title}', ticket.frontmatter.title)
      .replace('{id}', ticket.frontmatter.id)
      .replace('{criteria}', criteria)
      .replace('{enrichment}', enrichmentText);

    const result = await runCline(prompt, { 
      cwd: process.cwd(),
      thinking: 'high',
      timeoutMs: 300000,
    });

    const text = extractFinalText(result);
    
    let planResult: PlanResult;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        planResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (e) {
      planResult = {
        markdown: text,
        tasks: [],
        verificationCommands: ticket.frontmatter.verify_commands,
      };
    }

    // Ensure verification commands are captured
    if (planResult.verificationCommands.length === 0) {
      planResult.verificationCommands = ticket.frontmatter.verify_commands;
    }

    console.log(`[Step 2: Plan] Generated plan with ${planResult.tasks.length} tasks`);
    
    return {
      success: true,
      data: planResult,
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