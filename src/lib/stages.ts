export interface Stage {
  key: string;
  label: string;
  group: string;
}

export const STAGES: Stage[] = [
  { key: 'new', label: 'New', group: 'Intake' },
  { key: 'reviewing', label: 'Initial review', group: 'Intake' },
  { key: 'shortlisted', label: 'Shortlisted', group: 'Intake' },
  { key: 'discovery_call', label: 'Discovery call', group: 'Engage' },
  { key: 'structuring', label: 'Structuring & negotiation', group: 'Engage' },
  { key: 'hots', label: 'Heads of Terms', group: 'Deal' },
  { key: 'dd_financial', label: 'DD · Financial', group: 'Due diligence' },
  { key: 'dd_commercial', label: 'DD · Commercial', group: 'Due diligence' },
  { key: 'dd_legal', label: 'DD · Legal', group: 'Due diligence' },
  { key: 'funding', label: 'Funding', group: 'Deal' },
  { key: 'pre_completion', label: 'Pre-completion', group: 'Close' },
  { key: 'takeover', label: 'Takeover', group: 'Close' },
  { key: 'completed', label: 'Completed', group: 'Done' },
  { key: 'passed', label: 'Passed', group: 'Closed' },
  { key: 'ineligible', label: 'Ineligible', group: 'Closed' },
];

/** Sandeep's 21 steps, attached as per-stage checklists that stick to each deal. */
export const CHECKLISTS: Record<string, string[]> = {
  new: [
    'Step 1 — Confirm fit with laser-targeted objective',
    'Step 2 — Confirm it’s the right type of business to buy',
  ],
  discovery_call: [
    'Step 3 — Hold discovery call',
    'Step 3 — Request VAT returns (more reliable than accounts)',
    'Step 5 — Book first meeting',
  ],
  structuring: [
    'Step 6 — Structure the deal & funding',
    'Step 10 — Design corporate structure (HoldCo / SPVs)',
    'Step 12 — Negotiate price + terms',
  ],
  dd_financial: ['Step 13 — Verify cash flow + profitability'],
  dd_commercial: [
    'Step 8 — Commercial property considerations',
    'Step 9 — Distressed-purchase considerations',
    'Step 17 — People aspects of takeover',
  ],
  dd_legal: ['Step 14 — Run legal process'],
  hots: ['Step 7 — Issue HoTs · appoint solicitor panel to close'],
  funding: ['Step 4 — Fund the deal'],
  pre_completion: [
    'Step 15 — Bring together finance, legal, structure',
    'Step 16 — Pre-completion checklist (incl. bank access from seller)',
  ],
  takeover: ['Step 18 — Takeover week'],
  completed: [
    'Step 19 — Execute 100-day plan',
    'Step 21 — Plan for exit or growth + increased funding',
  ],
};

export const ITEM_KINDS: [string, string][] = [
  ['next_step', 'Next step'],
  ['red_flag', 'Red flag'],
  ['clarification', 'Clarification'],
  ['funding', 'Funding'],
  ['vendor_outstanding', 'From vendor'],
  ['note', 'Note'],
];

export const TERMINAL_STAGES = ['completed', 'passed', 'ineligible'];

/** Stages that can run in parallel alongside the primary stage. */
export const PARALLEL_STAGES = ['dd_financial', 'dd_commercial', 'dd_legal'];

/** Stage → AI assists available (key matches the stage-assist Edge Function). */
export const STAGE_ASSISTS: Record<string, [string, string][]> = {
  new: [['screen-brief', 'Initial screening brief']],
  reviewing: [['screen-brief', 'Initial screening brief']],
  shortlisted: [['screen-brief', 'Initial screening brief'], ['discovery-pack', 'Prep the discovery call']],
  discovery_call: [['discovery-pack', 'Discovery call pack (agenda + questions)']],
  structuring: [['structure-proposal', 'Deal structure proposal (with numbers)']],
  hots: [['hots-draft', 'Draft Heads of Terms + cover email'], ['structure-proposal', 'Deal structure proposal']],
  dd_financial: [['accountant-pack', 'Financial DD pack → email to accountant']],
  dd_commercial: [['commercial-dd-plan', 'Commercial DD plan']],
  dd_legal: [['solicitor-pack', 'Legal DD pack → email to solicitor']],
  funding: [['lender-pack', 'Funding pack — lender summary'], ['structure-proposal', 'Revisit deal structure']],
  pre_completion: [['completion-checklist', 'Pre-completion checklist']],
  takeover: [['takeover-plan', 'Takeover week plan']],
  completed: [['hundred-day-plan', '100-day plan']],
};

export function gbp(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!isFinite(n)) return '—';
  if (n >= 1e6) return '£' + (n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1) + 'M';
  if (n >= 1e3) return '£' + Math.round(n / 1e3) + 'k';
  return '£' + n.toLocaleString('en-GB');
}
