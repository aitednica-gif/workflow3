/**
 * Step 1: Enrich - Investigate repositories, edge cases, and technical context
 */
import { Ticket, EnrichResult, StepResult } from '../types';
import { runCline, extractFinalText, runCommand } from '../utils';

const ENRICH_PROMPT = `You are a senior software engineer investigating a ticket. Your task is to deeply analyze the codebase and gather all relevant context.

TICKET: {title}
ID: {id}

ACCEPTANCE CRITERIA:
{criteria}

INSTRUCTIONS:
1. Explore the repository structure to understand the architecture
2. Find all files relevant to implementing this ticket
3. Identify edge cases and potential pitfalls
4. Document existing patterns and conventions used in the codebase
5. Look for similar implementations to follow as examples

OUTPUT FORMAT (JSON only):
{
  "files": ["relative/path/to/file1.ts", "relative/path/to/file2.ts"],
  "edgeCases": ["Description of edge case 1", "Description of edge case 2"],
  "patterns": ["Pattern 1: description", "Pattern 2: description"],
  "summary": "Brief summary of findings and recommended approach"
}`;

export async function step1_enrich(ticket: Ticket): Promise<StepResult<EnrichResult>> {
  const startTime = Date.now();
  console.log(`[Step 1: Enrich] Starting for ticket ${ticket.frontmatter.id}`);

  try {
    const criteria = ticket.frontmatter.acceptance_criteria.map(c => `- ${c}`).join('\n');
    const prompt = ENRICH_PROMPT
      .replace('{title}', ticket.frontmatter.title)
      .replace('{id}', ticket.frontmatter.id)
      .replace('{criteria}', criteria);

    const result = await runCline(prompt, { 
      cwd: process.cwd(),
      thinking: 'high',
      timeoutMs: 300000,
    });

    const text = extractFinalText(result);
    
    // Try to parse JSON from the response
    let enrichResult: EnrichResult;
    try {
      // Find JSON in the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        enrichResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (e) {
      // Fallback: create structured result from text
      enrichResult = {
        files: [],
        edgeCases: [],
        patterns: [],
        summary: text.substring(0, 2000),
      };
    }

    // Validate structure
    enrichResult.files = enrichResult.files || [];
    enrichResult.edgeCases = enrichResult.edgeCases || [];
    enrichResult.patterns = enrichResult.patterns || [];
    enrichResult.summary = enrichResult.summary || 'No summary provided';

    console.log(`[Step 1: Enrich] Found ${enrichResult.files.length} files, ${enrichResult.edgeCases.length} edge cases`);
    
    return {
      success: true,
      data: enrichResult,
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