import { Injectable, signal } from '@angular/core';

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

interface ConfirmState extends ConfirmRequest {
  resolve: (confirmed: boolean) => void;
}

/// Lightweight, dependency-free confirm-dialog bus, mirroring ToastService:
/// any component calls confirmDialog.ask(...) and <app-confirm-dialog>
/// (mounted once in AppComponent) renders it and resolves the promise.
@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  state = signal<ConfirmState | null>(null);

  ask(request: ConfirmRequest): Promise<boolean> {
    return new Promise(resolve => {
      this.state.set({ ...request, resolve });
    });
  }

  respond(confirmed: boolean) {
    this.state()?.resolve(confirmed);
    this.state.set(null);
  }
}
