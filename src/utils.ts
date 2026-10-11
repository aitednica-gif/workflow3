/**
 * Utility functions for ticket parsing, file operations, and CLI execution
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { spawn, execSync } from 'node:child_process';
import * as yaml from 'js-yaml';
import { Ticket, TicketFrontmatter, StepResult, OrchestratorConfig } from './types';

// Re-export types for convenience
export type { Ticket, TicketFrontmatter, StepResult, OrchestratorConfig };

export const DEFAULT_CONFIG: OrchestratorConfig = {
  ticketsDir: join(process.cwd(), 'tickets'),
  maxRetries: 3,
  defaultModel: 'claude-3-5-sonnet-20241022',
  defaultThinking: 'medium',
  timeoutMs: 600000, // 10 minutes
  worktreeBaseDir: join(process.cwd(), '.cline', 'worktrees'),
  autoApprove: true,
};

/**
 * Parse a ticket markdown file with YAML frontmatter
 */
export function parseTicket(filePath: string): Ticket {
  const content = readFileSync(filePath, 'utf-8');
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    throw new Error(`Invalid ticket format: ${filePath} - missing frontmatter`);
  }

  const frontmatter = yaml.load(match[1]) as TicketFrontmatter;
  const body = match[2].trim();

  return {
    frontmatter,
    body,
    path: filePath,
  };
}

/**
 * Serialize ticket back to markdown with frontmatter
 */
export function serializeTicket(ticket: Ticket): string {
  const frontmatter = yaml.dump(ticket.frontmatter, { lineWidth: 120, noRefs: true });
  return `---\n${frontmatter}---\n${ticket.body}\n`;
}

/**
 * Save ticket to its path
 */
export function saveTicket(ticket: Ticket): void {
  ticket.frontmatter.updated = new Date().toISOString();
  writeFileSync(ticket.path, serializeTicket(ticket), 'utf-8');
}
/**
 * Move ticket from active to done (or blocked)
 */
export function moveTicket(ticket: Ticket, targetStatus: 'done' | 'blocked'): string {
  const activeDir = join(DEFAULT_CONFIG.ticketsDir, 'active');
  const targetDir = join(DEFAULT_CONFIG.ticketsDir, targetStatus);
  
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  const fileName = basename(ticket.path);
  const newPath = join(targetDir, fileName);
  
  ticket.frontmatter.status = targetStatus;
  ticket.frontmatter.updated = new Date().toISOString();
  
  writeFileSync(newPath, serializeTicket(ticket), 'utf-8');
  return newPath;
}

/**
 * List active tickets
 */
export function listActiveTickets(config: OrchestratorConfig = DEFAULT_CONFIG): Ticket[] {
  const activeDir = join(config.ticketsDir, 'active');
  if (!existsSync(activeDir)) {
    return [];
  }
  return readdirSync(activeDir)
    .filter(f => f.endsWith('.md'))
    .map(f => parseTicket(join(activeDir, f)))
    .sort((a, b) => a.frontmatter.id.localeCompare(b.frontmatter.id));
}

/**
 * Run a shell command and return stdout
 */
export function runCommand(command: string, cwd: string = process.cwd(), timeoutMs = 30000): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn('bash', ['-c', command], { 
      cwd, 
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', (code) => resolve({ stdout, stderr, code: code ?? 1 }));
    proc.on('error', (err) => resolve({ stdout, stderr, code: 1 }));
  });
}

/**
 * Run Cline CLI in headless mode with JSON output
 */
export function runCline(
  prompt: string, 
  options: {
    cwd?: string;
    model?: string;
    thinking?: 'none' | 'low' | 'medium' | 'high' | 'xhigh';
    systemPrompt?: string;
    timeoutMs?: number;
    retries?: number;
    worktree?: boolean;
    sessionId?: string;
    autoApprove?: boolean;
  } = {}
): Promise<{ lines: any[]; fullOutput: string }> {
  const {
    cwd = process.cwd(),
    model,
    thinking,
    systemPrompt,
    timeoutMs = 300000,
    retries = 3,
    worktree = false,
    sessionId,
    autoApprove = true,
  } = options;

  const args = ['--json'];
  
  if (model) args.push('-m', model);
  if (thinking) args.push('--thinking', thinking);
  if (systemPrompt) args.push('-s', systemPrompt);
  if (worktree) args.push('--worktree');
  if (sessionId) args.push('--id', sessionId);
  if (autoApprove) args.push('--auto-approve', 'true');
  args.push('--retries', retries.toString());
  args.push('--timeout', Math.floor(timeoutMs / 1000).toString());
  
  args.push(prompt);

  return new Promise((resolve, reject) => {
    const proc = spawn('cline', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let stderr = '';
    
    const timeout = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`Cline timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      const lines = output.trim().split('\n').filter(l => l.trim()).map(l => {
        try {
          return JSON.parse(l);
        } catch {
          return { raw: l };
        }
      });
      
      if (code === 0) {
        resolve({ lines, fullOutput: output });
      } else {
        reject(new Error(`Cline exited with code ${code}: ${stderr || output}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Extract final text from Cline JSON output
 */
export function extractFinalText(result: { lines: any[] }): string {
  const runResult = result.lines.find(l => l.type === 'run_result');
  return runResult?.text || '';
}

/**
 * Extract run_result metadata
 */
export function extractRunResult(result: { lines: any[] }): any {
  return result.lines.find(l => l.type === 'run_result');
}

/**
 * Generate a unique ticket ID
 */
export function generateTicketId(): string {
  const date = new Date();
  const prefix = `TICKET-${date.getFullYear()}${(date.getMonth()+1).toString().padStart(2,'0')}${date.getDate().toString().padStart(2,'0')}`;
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${random}`;
}

/**
 * Ensure directory exists
 */
export function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}