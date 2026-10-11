/**
 * Main Orchestrator - Runs the 8-step pipeline for tickets
 */
import { Command } from 'commander';
import { 
  DEFAULT_CONFIG, 
  parseTicket, 
  saveTicket, 
  moveTicket, 
  listActiveTickets, 
  ensureDir,
  generateTicketId,
  OrchestratorConfig,
  Ticket,
} from './utils';
import { step1_enrich } from './steps/step1_enrich';
import { step2_plan } from './steps/step2_plan';
import { step3_implement } from './steps/step3_implement';
import { step4_codeReview } from './steps/step4_codeReview';
import { step5_qacode } from './steps/step5_qacode';
import { step6_release } from './steps/step6_release';
import { step7_qaes } from './steps/step7_qaes';
import { step8_addressReview } from './steps/step8_addressReview';
import { join } from 'node:path';

export class Orchestrator {
  private config: OrchestratorConfig;

  constructor(config: Partial<OrchestratorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize ticket directory structure
   */
  async init(): Promise<void> {
    ensureDir(join(this.config.ticketsDir, 'active'));
    ensureDir(join(this.config.ticketsDir, 'done'));
    ensureDir(join(this.config.ticketsDir, 'blocked'));
    ensureDir(join(this.config.ticketsDir, 'templates'));
    
    const templatePath = join(this.config.ticketsDir, 'templates', 'ticket-template.md');
    const template = `# Ticket Template

---
id: TICKET-YYYYMMDD-XXXX
title: "Brief descriptive title"
status: active
created: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
updated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
acceptance_criteria:
  - "Criterion 1: Specific, testable outcome"
  - "Criterion 2: Another measurable outcome"
verify_commands:
  - "npm test"
  - "npm run lint"
labels:
  - "feature"
  - "backend"
---

## Context
Describe the problem, background, and any relevant information.

## Requirements
List specific requirements for this ticket.

## Notes
Any additional notes, links, or references.
`;
    await import('node:fs').then(fs => fs.writeFileSync(templatePath, template, 'utf-8'));
    
    console.log(`Initialized ticket structure at ${this.config.ticketsDir}`);
    console.log(`Template created at ${templatePath}`);
  }

  /**
   * Create a new ticket from template
   */
  async createTicket(title: string, criteria: string[], commands: string[]): Promise<Ticket> {
    const id = generateTicketId();
    const now = new Date().toISOString();
    
    const frontmatter = {
      id,
      title,
      status: 'active' as const,
      created: now,
      updated: now,
      acceptance_criteria: criteria,
      verify_commands: commands,
      labels: [],
    };

    const body = `## Context
Describe the problem and background.

## Requirements
${criteria.map(c => `- ${c}`).join('\n')}

## Notes
`;

    const activeDir = join(this.config.ticketsDir, 'active');
    ensureDir(activeDir);
    
    const filePath = join(activeDir, `${id}.md`);
    const ticket = { frontmatter, body, path: filePath };
    saveTicket(ticket);
    
    console.log(`Created ticket ${id} at ${filePath}`);
    return ticket;
  }
/**
   * Process a single ticket through all 8 steps
   */
  async processTicket(ticket: Ticket): Promise<boolean> {
    console.log(`\n========== Processing ${ticket.frontmatter.id}: ${ticket.frontmatter.title} ==========\n`);

    try {
      // Phase I: Research & Planning
      console.log('--- PHASE I: RESEARCH & PLANNING ---');
      
      const enrichResult = await step1_enrich(ticket);
      if (!enrichResult.success) throw new Error(`Enrich failed: ${enrichResult.error}`);
      ticket.enrichResult = enrichResult.data;
      saveTicket(ticket);

      const planResult = await step2_plan(ticket, enrichResult.data);
      if (!planResult.success) throw new Error(`Plan failed: ${planResult.error}`);
      ticket.plan = planResult.data?.markdown;
      if (planResult.data?.verificationCommands.length) {
        ticket.frontmatter.verify_commands = planResult.data.verificationCommands;
      }
      saveTicket(ticket);

      // Phase II: Implementation & Review
      console.log('\n--- PHASE II: IMPLEMENTATION & REVIEW ---');
      
      const implementResult = await step3_implement(ticket, planResult.data!);
      if (!implementResult.success) throw new Error(`Implement failed: ${implementResult.error}`);

      const reviewResult = await step4_codeReview(ticket, planResult.data!);
      if (!reviewResult.success) throw new Error(`Code review failed: ${reviewResult.error}`);
      ticket.codeReviewResult = reviewResult.data;
      
      if (!reviewResult.data?.approved) {
        console.warn('[WARNING] Code review not approved, but continuing...');
      }
      saveTicket(ticket);

      // Phase III: Verification, Deployment & Feedback
      console.log('\n--- PHASE III: VERIFICATION, DEPLOYMENT & FEEDBACK ---');
      
      const qaResult = await step5_qacode(ticket);
      if (!qaResult.success) throw new Error(`QA failed: ${qaResult.error}`);

      const releaseResult = await step6_release(ticket);
      if (!releaseResult.success) throw new Error(`Release failed: ${releaseResult.error}`);
      saveTicket(ticket);

      const qaesResult = await step7_qaes(ticket, planResult.data!);
      if (!qaesResult.success) throw new Error(`QAES failed: ${qaesResult.error}`);

      const addressResult = await step8_addressReview(ticket);
      if (!addressResult.success) throw new Error(`Address review failed: ${addressResult.error}`);

      // Move to done
      moveTicket(ticket, 'done');
      console.log(`\n✅ Ticket ${ticket.frontmatter.id} completed successfully!`);
      return true;
    } catch (error) {
      console.error(`\n❌ Ticket ${ticket.frontmatter.id} failed:`, error);
      moveTicket(ticket, 'blocked');
      return false;
    }
  }

  /**
   * Process all active tickets
   */
  async processAll(): Promise<void> {
    const tickets = listActiveTickets(this.config);
    console.log(`Found ${tickets.length} active tickets`);
    
    for (const ticket of tickets) {
      await this.processTicket(ticket);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  /**
   * Watch for new tickets and process them automatically
   */
  async watch(): Promise<void> {
    const { watch } = await import('chokidar');
    const activeDir = join(this.config.ticketsDir, 'active');
    ensureDir(activeDir);

    console.log(`Watching ${activeDir} for new tickets...`);
    
    const watcher = watch(activeDir, { ignored: /^\./, persistent: true });
    
    watcher.on('add', async (path) => {
      if (path.endsWith('.md')) {
        console.log(`\nNew ticket detected: ${path}`);
        try {
          const ticket = parseTicket(path);
          if (ticket.frontmatter.status === 'active') {
            await this.processTicket(ticket);
          }
        } catch (error) {
          console.error(`Failed to process new ticket:`, error);
        }
      }
    });

    await new Promise(() => {});
  }
}

// CLI entry point
const program = new Command();

program
  .name('cline-orchestrator')
  .description('Programmatic AI agent pipeline for software development using Cline CLI')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize ticket directory structure')
  .action(async () => {
    const orchestrator = new Orchestrator();
    await orchestrator.init();
  });

program
  .command('create <title>')
  .description('Create a new ticket')
  .option('-c, --criteria <criteria...>', 'Acceptance criteria')
  .option('-v, --verify <commands...>', 'Verification commands')
  .action(async (title, options) => {
    const orchestrator = new Orchestrator();
    await orchestrator.createTicket(
      title,
      options.criteria || ['Implement the feature'],
      options.verify || ['npm test', 'npm run lint']
    );
  });

program
  .command('process [ticketId]')
  .description('Process a specific ticket or all active tickets')
  .action(async (ticketId) => {
    const orchestrator = new Orchestrator();
    
    if (ticketId) {
      const activeDir = join(orchestrator['config'].ticketsDir, 'active');
      const ticketPath = join(activeDir, `${ticketId}.md`);
      try {
        const ticket = parseTicket(ticketPath);
        await orchestrator.processTicket(ticket);
      } catch (error) {
        console.error(`Ticket ${ticketId} not found or invalid`);
        process.exit(1);
      }
    } else {
      await orchestrator.processAll();
    }
  });

program
  .command('watch')
  .description('Watch for new tickets and process automatically')
  .action(async () => {
    const orchestrator = new Orchestrator();
    await orchestrator.watch();
  });

program.parse();