import { Component, Input, OnChanges, OnDestroy, SimpleChanges, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

/// "Slow network" state: drop this next to any loading skeleton/spinner. It renders
/// nothing for the first few seconds (a normal fast load never shows it) and only then
/// admits the request is taking a while - reassurance for a real slow-network wait,
/// not noise on every ordinary page load.
@Component({
  selector: 'app-loading-hint',
  standalone: true,
  imports: [CommonModule],
  template: `@if (show()) { <p class="loading-hint">Still working — this is taking longer than usual…</p> }`,
  styles: [`.loading-hint { color: var(--dm-text-muted); font-size: 0.82rem; margin: 10px 0 0; }`]
})
export class LoadingHintComponent implements OnChanges, OnDestroy {
  @Input() loading = false;
  /// Delay before admitting the wait is unusual - tuned to sit well above a normal
  /// request/response round trip so it never flickers on a healthy connection.
  @Input() delayMs = 5000;

  show = signal(false);
  private timer?: ReturnType<typeof setTimeout>;

  ngOnChanges(changes: SimpleChanges) {
    if (!changes['loading']) return;
    clearTimeout(this.timer);
    this.show.set(false);
    if (this.loading) {
      this.timer = setTimeout(() => this.show.set(true), this.delayMs);
    }
  }

  ngOnDestroy() {
    clearTimeout(this.timer);
  }
}
