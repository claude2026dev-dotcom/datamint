import { Directive, ElementRef, HostListener, AfterViewInit } from '@angular/core';

/// Grows a <textarea appAutoGrow> to fit its content instead of leaving a long
/// value scrollable/clipped inside a fixed-height box - resizes on load (so an
/// already-long extracted value is fully visible without the user touching it
/// first) and again on every keystroke.
@Directive({
  selector: 'textarea[appAutoGrow]',
  standalone: true
})
export class AutoGrowDirective implements AfterViewInit {
  constructor(private el: ElementRef<HTMLTextAreaElement>) {}

  ngAfterViewInit() {
    // Runs after the textarea has its real content (ngModel binds asynchronously
    // relative to construction), and deferred one tick so scrollHeight reflects
    // final layout rather than a pre-render measurement of zero.
    setTimeout(() => this.resize());
  }

  @HostListener('input')
  onInput() {
    this.resize();
  }

  private resize() {
    const textarea = this.el.nativeElement;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }
}
