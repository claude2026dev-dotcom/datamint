import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';

/// The logged-in landing spot ("/") redirects here instead of showing the public
/// marketing page a second time to someone who already has an account. Placeholder
/// content for now - the real dashboard widgets will be rebuilt once the new
/// feature set is defined.
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dm-container page">
      <h1>{{ greeting() }}, {{ firstName() }} 👋</h1>
      <p class="muted">Welcome back.</p>
    </div>
  `,
  styles: [`
    .page { padding-top: 40px; padding-bottom: 80px; }
    h1 { font-size: 1.7rem; margin-bottom: 6px; }
    .muted { color: var(--dm-text-muted); font-size: 0.9rem; margin: 0; }
  `]
})
export class HomeComponent implements OnInit, OnDestroy {
  // Computed once at construction and otherwise never touched again, so leaving this
  // tab open across an hour boundary (say from 6pm through to 1am) kept showing
  // whatever greeting was true at page load - "Good evening" all night - since nothing
  // was re-evaluating it. A signal + a periodic tick keeps it honest for as long as
  // the tab stays open, no reload required.
  private greetingSignal = signal(this.computeGreeting());
  private greetingTimer?: ReturnType<typeof setInterval>;

  constructor(private auth: AuthService) {}

  ngOnInit() {
    // A greeting only needs to be right to the hour, not the second - checking once a
    // minute is cheap and still catches every boundary well within a minute of it happening.
    this.greetingTimer = setInterval(() => this.greetingSignal.set(this.computeGreeting()), 60_000);
  }

  ngOnDestroy() {
    if (this.greetingTimer) clearInterval(this.greetingTimer);
  }

  firstName(): string {
    const name = this.auth.currentUser()?.displayName?.trim();
    if (name) return name.split(/\s+/)[0];
    return this.auth.currentUser()?.email?.split('@')[0] ?? 'there';
  }

  greeting(): string {
    return this.greetingSignal();
  }

  // new Date() always reads the machine's own local clock/timezone (there's no UTC
  // conversion happening, and none is needed) - ranges follow the usual everyday sense
  // of the words rather than a rigid noon/6pm split, so late night genuinely reads as
  // "night" instead of "evening" or "morning".
  private computeGreeting(): string {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Good morning';
    if (hour >= 12 && hour < 17) return 'Good afternoon';
    if (hour >= 17 && hour < 21) return 'Good evening';
    return 'Good night';
  }
}
