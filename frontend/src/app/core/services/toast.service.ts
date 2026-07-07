import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info';
export interface ToastMessage { id: number; kind: ToastKind; text: string; }

/// Lightweight, dependency-free toast bus. Any component can call
/// toastService.show(...) and <app-toast> (mounted once in AppComponent)
/// renders it — no prop drilling between unrelated feature modules.
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  messages = signal<ToastMessage[]>([]);

  show(text: string, kind: ToastKind = 'info', durationMs = 4000) {
    const id = this.nextId++;
    this.messages.update(list => [...list, { id, kind, text }]);
    setTimeout(() => this.dismiss(id), durationMs);
  }

  success(text: string) { this.show(text, 'success'); }
  error(text: string) { this.show(text, 'error'); }
  info(text: string) { this.show(text, 'info'); }

  dismiss(id: number) {
    this.messages.update(list => list.filter(m => m.id !== id));
  }
}
