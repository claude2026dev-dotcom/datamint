import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { trigger, transition, style, animate } from '@angular/animations';

export type ProcessingStage = 'uploading' | 'reading' | 'extracting' | 'done' | 'failed';

const STAGE_CAPTION: Record<ProcessingStage, string> = {
  uploading: 'Uploading your file…',
  reading: 'Reading pages…',
  extracting: 'Extracting your data…',
  done: 'All done',
  failed: 'Something went wrong'
};

/// Rotating sub-messages shown beneath the main stage caption, cycled on a timer while that
/// stage is active - a real AI extraction call can run long enough that a single static caption
/// starts reading as "is this stuck?" rather than "still working". Written to describe what
/// Datamint is actually doing at each stage, so the wait itself communicates the product's value
/// instead of just padding time.
const STAGE_SUBMESSAGES: Record<ProcessingStage, string[]> = {
  uploading: ['Sending your file over a secure connection…', 'Almost there…'],
  reading: ['Opening every page…', 'Recovering text from scanned or image pages…', 'Lining up pages in order…'],
  extracting: [
    'Reading every field, line by line…',
    'Matching each value to the right label…',
    'Grouping related fields into sections…',
    'Double-checking numbers and dates…',
    'Polishing the results for you…'
  ],
  done: ['All set - taking you to your results…'],
  failed: ['You can try again, or reach out if this keeps happening.']
};

/// A representative sample of field names real documents tend to have - shown as a continuously
/// spawning/fading stream of chips while extraction runs, standing in for "fields are being found
/// right now" since the real field names obviously aren't known until the extraction call
/// actually returns. Deliberately broad across document types, since Datamint handles all of them.
const SAMPLE_FIELD_POOL = [
  'Invoice No.', 'Date', 'Total', 'Vendor', 'Address', 'Tax', 'Reference No.',
  'Amount Due', 'Account No.', 'Signature', 'Quantity', 'Due Date', 'Customer Name',
  'Description', 'Subtotal', 'Terms', 'Contact Email', 'Order No.'
];

const TABLE_CELL_COUNT = 9;

interface LiveChip { key: number; label: string; }

/// A different visual metaphor from a generic spinner: a document on the left feeding a stream of
/// data through a connecting channel into a spreadsheet grid on the right, whose cells fill in as
/// real @Input() progress advances - not a looping animation guessing at completeness, but a
/// direct reflection of it. Paired with rotating status text and a stream of sample field-name
/// chips so a real extraction call that can run several seconds still feels alive and worth
/// watching. Deliberately CSS/SVG-driven (no video/gif asset) so it stays crisp at any size, costs
/// no extra network request, and re-themes for free with the same --dm-* tokens as everything else.
@Component({
  selector: 'app-upload-progress',
  standalone: true,
  imports: [CommonModule],
  animations: [
    trigger('captionSwap', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(6px)' }),
        animate('280ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('160ms ease-in', style({ opacity: 0, transform: 'translateY(-4px)' }))
      ])
    ]),
    trigger('chipLifecycle', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(-10px) scale(0.85)' }),
        animate('320ms cubic-bezier(.2,.8,.2,1)', style({ opacity: 1, transform: 'translateX(0) scale(1)' }))
      ]),
      transition(':leave', [
        animate('280ms ease-in', style({ opacity: 0, transform: 'translateX(10px) scale(0.9)' }))
      ])
    ]),
    trigger('cellFill', [
      transition(':enter', [
        style({ transform: 'scale(0.4)', opacity: 0 }),
        animate('260ms cubic-bezier(.2,.8,.2,1)', style({ transform: 'scale(1)', opacity: 1 }))
      ])
    ])
  ],
  template: `
    <div class="stage-wrap">
      <div class="aura" aria-hidden="true"></div>

      <div class="pipeline" [class.paused]="!isActive()">
        <!-- Source: the document being read - a plain page for reading/extracting, or an
             upward arrow into a cloud while the file itself is still in transit. -->
        <svg class="node source" viewBox="0 0 64 76" aria-hidden="true">
          @if (stage === 'uploading') {
            <path d="M14 46a13 13 0 0 1 3-25.6A17 17 0 0 1 49 24a11 11 0 0 1-3 21.8" class="cloud" />
            <path d="M32 34v22M24 44l8-9 8 9" class="upload-arrow" />
          } @else {
            <rect x="8" y="4" width="48" height="68" rx="6" class="page" />
            <rect x="8" y="4" width="48" height="68" rx="6" class="page-outline" />
            @for (line of docLines; track $index) {
              <rect [attr.x]="line.x" [attr.y]="line.y" [attr.width]="line.w" height="4" rx="2" class="text-line" [style.animation-delay.ms]="$index * 90" />
            }
          }
        </svg>

        <!-- Channel: a connecting track with small pulses continuously travelling from source to
             destination while active - the "data is moving right now" signal. -->
        <div class="channel">
          <svg viewBox="0 0 100 8" preserveAspectRatio="none" class="track">
            <line x1="2" y1="4" x2="98" y2="4" />
          </svg>
          @if (isActive()) {
            <span class="pulse p1"></span>
            <span class="pulse p2"></span>
            <span class="pulse p3"></span>
          }
        </div>

        <!-- Destination: a small spreadsheet grid whose filled cell count is driven directly by
             the real progress percentage - never a looping guess at how "done" things look. -->
        <svg class="node table" viewBox="0 0 76 76" aria-hidden="true">
          <rect x="2" y="2" width="72" height="72" rx="8" class="table-frame" />
          @for (cell of tableCells; track cell.index) {
            <rect [attr.x]="cell.x" [attr.y]="cell.y" width="20" height="20" rx="4"
                  class="table-cell" [class.filled]="cell.index < filledCellCount" [class.error]="stage === 'failed'" />
          }
          @if (stage === 'done') {
            <circle cx="38" cy="38" r="15" class="done-badge" />
            <path d="M31 38 L36 44 L46 32" class="done-check" />
          }
          @if (stage === 'failed') {
            <circle cx="38" cy="38" r="15" class="fail-badge" />
            <path d="M32 32 L44 44 M44 32 L32 44" class="fail-x" />
          }
        </svg>
      </div>

      <div class="status">
        <p class="caption">
          @if (true) {
            <span [@captionSwap]>{{ stage === 'failed' ? (errorMessage || STAGE_CAPTION[stage]) : STAGE_CAPTION[stage] }}</span>
          }
        </p>
        <p class="sub-caption">
          @if (isActive()) { <span class="live-dot"></span> }
          <span [@captionSwap]="subIndex">{{ currentSubMessages[subIndex] }}</span>
        </p>

        @if (isActive()) {
          <div class="bar-track"><div class="bar-fill" [style.width.%]="progress"></div></div>
        }

        @if (stage === 'extracting') {
          <div class="chip-row">
            @for (chip of liveChips; track chip.key) {
              <span class="chip" [@chipLifecycle]>{{ chip.label }}</span>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; }
    /* No artificial max-width - stage-wrap always spans whatever width the parent card gives it,
       and .aura (inset:0 within it) reaches every corner regardless of how wide the card is,
       instead of leaving a blank margin around a narrow, centered content island. */
    .stage-wrap { position: relative; display: flex; flex-direction: column; align-items: center; gap: 26px; padding: 48px 32px; width: 100%; min-height: 320px; overflow: hidden; }
    /* A subtle dot-grid ("data points") plus two slow drifting color washes - reads as a
       data-processing motif and gives the wide card genuine corner-to-corner visual texture.
       Colors derive from --dm-* tokens via color-mix, so light/dark contrast stays correct
       automatically without a separate override block per theme. */
    .aura {
      position: absolute; inset: 0; z-index: 0; pointer-events: none;
      background-image:
        radial-gradient(circle at 15% 20%, color-mix(in srgb, var(--dm-primary) 13%, transparent) 0%, transparent 50%),
        radial-gradient(circle at 85% 80%, color-mix(in srgb, var(--dm-accent) 11%, transparent) 0%, transparent 50%),
        radial-gradient(circle, color-mix(in srgb, var(--dm-text-muted) 22%, transparent) 1px, transparent 1.4px);
      background-size: auto, auto, 26px 26px;
      animation: aura-drift 10s ease-in-out infinite;
    }
    @keyframes aura-drift {
      0%, 100% { background-position: 0 0, 0 0, 0 0; }
      50% { background-position: -2% 2%, 2% -2%, 4px 4px; }
    }

    .pipeline { position: relative; z-index: 1; display: flex; align-items: center; gap: 18px; }
    .node { flex-shrink: 0; overflow: visible; filter: drop-shadow(0 10px 22px rgba(20,22,31,0.14)); }
    .node.source { width: 72px; height: 84px; }
    .node.table { width: 96px; height: 96px; }
    .page { fill: var(--dm-bg-elevated); }
    .page-outline { fill: none; stroke: var(--dm-border); stroke-width: 2; }
    .text-line { fill: var(--dm-border); animation: line-glow 2.4s ease-in-out infinite; }
    .pipeline.paused .text-line { animation-play-state: paused; }
    @keyframes line-glow { 0%, 100% { fill: var(--dm-border); } 50% { fill: var(--dm-primary-light); } }
    .cloud { fill: none; stroke: var(--dm-primary); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
    .upload-arrow { fill: none; stroke: var(--dm-accent); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; animation: arrow-bob 1.4s ease-in-out infinite; }
    @keyframes arrow-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }

    /* A short connecting track between source and destination, with 3 small pulses travelling
       along it on a stagger - the visual read is "data is flowing right now", not a static link. */
    .channel { position: relative; flex: 1 1 120px; min-width: 60px; max-width: 160px; height: 8px; }
    .track { width: 100%; height: 100%; overflow: visible; }
    .track line { stroke: var(--dm-border); stroke-width: 2; stroke-dasharray: 4 4; }
    .pulse {
      position: absolute; top: 50%; left: 0; width: 8px; height: 8px; margin-top: -4px; border-radius: 50%;
      background: var(--dm-gradient-primary); box-shadow: 0 0 8px color-mix(in srgb, var(--dm-primary) 60%, transparent);
      animation: pulse-travel 1.8s linear infinite;
    }
    .p1 { animation-delay: 0s; } .p2 { animation-delay: 0.6s; } .p3 { animation-delay: 1.2s; }
    @keyframes pulse-travel { 0% { left: 0; opacity: 0; } 8% { opacity: 1; } 92% { opacity: 1; } 100% { left: 100%; opacity: 0; } }

    /* The destination grid - filled-cell count is bound directly to [class.filled] driven by the
       real progress percentage in the component class, so this genuinely reports progress rather
       than looping through a canned sequence independent of what's actually happening. */
    .table-frame { fill: var(--dm-bg-elevated); stroke: var(--dm-border); stroke-width: 2; }
    .table-cell { fill: var(--dm-border); transition: fill 0.4s ease; }
    .table-cell.filled { fill: var(--dm-primary); }
    .table-cell.filled.error { fill: var(--dm-danger); }
    .done-badge { fill: var(--dm-success); }
    .done-check { fill: none; stroke: white; stroke-width: 3.4; stroke-linecap: round; stroke-linejoin: round; }
    .fail-badge { fill: var(--dm-danger); }
    .fail-x { fill: none; stroke: white; stroke-width: 3.4; stroke-linecap: round; stroke-linejoin: round; }

    .status { position: relative; z-index: 1; width: 100%; max-width: 420px; text-align: center; }
    .caption { margin: 0 0 8px; font-size: 1.15rem; font-weight: 700; color: var(--dm-text); }
    .sub-caption { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 20px; margin: 0 0 18px; font-size: 0.9rem; color: var(--dm-text-muted); }
    .live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dm-accent); flex-shrink: 0; animation: pulse-dot 1.3s ease-in-out infinite; }
    @keyframes pulse-dot { 0%, 100% { opacity: 0.4; transform: scale(0.85); } 50% { opacity: 1; transform: scale(1.15); } }

    .bar-track { width: 100%; height: 6px; border-radius: 999px; background: var(--dm-bg-elevated); border: 1px solid var(--dm-border); overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 999px; background: var(--dm-gradient-primary); background-size: 200% 100%; animation: shimmer-move 1.6s ease-in-out infinite; transition: width 0.4s ease; }
    @keyframes shimmer-move { 0% { background-position: 0% 0; } 100% { background-position: 100% 0; } }

    /* A continuously spawning/fading stream of sample field chips (see SAMPLE_FIELD_POOL) - never
       the same fixed set sitting still, always a new one arriving as an old one leaves, so
       "extraction is actively happening" reads from motion, not a hardcoded snapshot. */
    .chip-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 14px; min-height: 30px; }
    .chip {
      background: var(--dm-surface); border: 1px solid var(--dm-border); color: var(--dm-primary);
      font-size: 0.76rem; font-weight: 700; padding: 5px 12px; border-radius: 999px;
      box-shadow: 0 3px 10px rgba(20,22,31,0.1); white-space: nowrap;
    }

    @media (prefers-reduced-motion: reduce) {
      .aura, .text-line, .pulse, .upload-arrow, .bar-fill, .live-dot { animation: none; }
    }

    @media (max-width: 560px) {
      .stage-wrap { padding: 36px 20px; min-height: 0; gap: 22px; }
      .pipeline { gap: 12px; }
      .node.source { width: 56px; height: 66px; }
      .node.table { width: 76px; height: 76px; }
      .channel { flex-basis: 60px; max-width: 90px; }
    }
  `]
})
export class UploadProgressComponent implements OnChanges, OnDestroy {
  @Input() stage: ProcessingStage = 'uploading';
  @Input() progress = 0;
  @Input() errorMessage?: string;

  readonly STAGE_CAPTION = STAGE_CAPTION;
  readonly docLines = [
    { x: 16, y: 16, w: 32 }, { x: 16, y: 26, w: 24 }, { x: 16, y: 36, w: 28 },
    { x: 16, y: 50, w: 20 }, { x: 16, y: 60, w: 30 }
  ];
  readonly tableCells = Array.from({ length: TABLE_CELL_COUNT }, (_, i) => ({
    index: i, x: 6 + (i % 3) * 22, y: 6 + Math.floor(i / 3) * 22
  }));

  private readonly maxLiveChips = 3;

  liveChips: LiveChip[] = [];
  currentSubMessages: string[] = STAGE_SUBMESSAGES.uploading;
  subIndex = 0;
  private subMessageTimer?: ReturnType<typeof setInterval>;
  private chipTimer?: ReturnType<typeof setInterval>;
  private nextChipKey = 0;
  private lastLabel = '';

  /// Filled cells scale with the real progress value, capped so "done" (or a failed run stopped
  /// partway through) always shows a fully complete/complete-looking grid rather than a
  /// coincidentally partial one.
  get filledCellCount(): number {
    if (this.stage === 'done' || this.stage === 'failed') return TABLE_CELL_COUNT;
    return Math.min(TABLE_CELL_COUNT, Math.round((this.progress / 100) * TABLE_CELL_COUNT));
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['stage']) {
      this.restartSubMessageRotation();
      this.restartChipStream();
    }
  }

  ngOnDestroy() {
    if (this.subMessageTimer) clearInterval(this.subMessageTimer);
    if (this.chipTimer) clearInterval(this.chipTimer);
  }

  private restartSubMessageRotation() {
    if (this.subMessageTimer) clearInterval(this.subMessageTimer);
    this.currentSubMessages = STAGE_SUBMESSAGES[this.stage];
    this.subIndex = 0;
    if (!this.isActive() || this.currentSubMessages.length < 2) return;
    this.subMessageTimer = setInterval(() => {
      this.subIndex = (this.subIndex + 1) % this.currentSubMessages.length;
    }, 2400);
  }

  /// Keeps up to 3 chips alive at once: every tick, the oldest one is retired (triggering its
  /// leave animation) and a fresh one spawns with a label that's never the same as whatever just
  /// left, so the stream reads as continuous variety rather than a repeating loop of the same
  /// handful of words.
  private restartChipStream() {
    if (this.chipTimer) clearInterval(this.chipTimer);
    this.liveChips = [];
    if (this.stage !== 'extracting') return;
    this.spawnChip();
    this.chipTimer = setInterval(() => {
      if (this.liveChips.length >= this.maxLiveChips) this.liveChips.shift();
      this.spawnChip();
    }, 1100);
  }

  private spawnChip() {
    let label = this.lastLabel;
    while (label === this.lastLabel) {
      label = SAMPLE_FIELD_POOL[Math.floor(Math.random() * SAMPLE_FIELD_POOL.length)];
    }
    this.lastLabel = label;
    this.liveChips = [...this.liveChips, { key: this.nextChipKey++, label }];
  }

  isActive(): boolean {
    return this.stage !== 'done' && this.stage !== 'failed';
  }
}
