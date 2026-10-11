/**
 * Core types for the ticket-based orchestrator
 */

export interface TicketFrontmatter {
  id: string;
  title: string;
  status: 'active' | 'done' | 'blocked';
  created: string; // ISO date
  updated: string; // ISO date
  acceptance_criteria: string[];
  verify_commands: string[];
  assignee?: string;
  labels?: string[];
  pr_url?: string;
  base_branch?: string;
  head_branch?: string;
  sha?: string;
  retry_count?: number;
  max_retries?: number;
}

export interface Ticket {
  frontmatter: TicketFrontmatter;
  body: string;
  path: string;
  plan?: string;
  enrichResult?: EnrichResult;
  codeReviewResult?: CodeReviewResult;
}

export interface EnrichResult {
  files: string[];
  edgeCases: string[];
  patterns: string[];
  summary: string;
}

export interface PlanResult {
  markdown: string;
  tasks: PlanTask[];
  verificationCommands: string[];
}

export interface PlanTask {
  id: string;
  title: string;
  description: string;
  files: string[];
  dependencies: string[]; // other task IDs
  estimatedTokens: number;
}

export interface CodeReviewResult {
  issues: CodeReviewIssue[];
  summary: string;
  approved: boolean;
}

export interface CodeReviewIssue {
  severity: 'critical' | 'major' | 'minor' | 'nit';
  file: string;
  line?: number;
  message: string;
  suggestion?: string;
}

export interface StepResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  durationMs: number;
  tokensUsed?: number;
}

export interface OrchestratorConfig {
  ticketsDir: string;
  maxRetries: number;
  defaultModel: string;
  defaultThinking: 'none' | 'low' | 'medium' | 'high' | 'xhigh';
  timeoutMs: number;
  worktreeBaseDir: string;
  autoApprove: boolean;
}