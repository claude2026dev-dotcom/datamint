import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { SettingsNavComponent } from '../../shared/components/settings-nav/settings-nav.component';
import { BackButtonComponent } from '../../shared/components/back-button/back-button.component';

const MAX_AVATAR_MB = 5;
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'];

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, SettingsNavComponent, BackButtonComponent],
  template: `
    <div class="dm-container page">
      <app-back-button />
      <h1>Account</h1>
      <app-settings-nav />

      @if (loading) {
        <p class="muted">Loading…</p>
      } @else {
        <div class="dm-card section">
          <h3>Profile picture</h3>
          <div class="avatar-row">
            <span class="avatar-preview">
              @if (avatarUrl) {
                <img [src]="avatarUrl" alt="Your profile picture" />
              } @else {
                {{ initials() }}
              }
            </span>
            <div class="avatar-actions">
              <input #fileInput type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/bmp" hidden (change)="onFileSelected($event)" />
              <button class="dm-btn dm-btn-ghost" type="button" [disabled]="uploading" (click)="fileInput.click()">
                {{ uploading ? 'Uploading…' : (avatarUrl ? 'Change photo' : 'Choose photo') }}
              </button>
              @if (avatarUrl) {
                <button class="dm-btn dm-btn-ghost danger-btn" type="button" [disabled]="removing" (click)="removePhoto()">
                  {{ removing ? 'Removing…' : 'Remove photo' }}
                </button>
              }
            </div>
          </div>
          <p class="hint">JPEG, PNG, WebP, GIF, or BMP, up to {{ maxAvatarMb }}MB.</p>
        </div>

        <div class="dm-card section">
          <h3>Account details</h3>
          <div class="field">
            <label>Email</label>
            <input class="dm-input" [value]="email" disabled />
            <p class="hint">Email can't be changed here — contact support if you need to update it.</p>
          </div>
          <div class="field">
            <label>Display name</label>
            <input class="dm-input" [(ngModel)]="displayName" placeholder="Your name" />
          </div>
          <div class="card-footer">
            <button class="dm-btn dm-btn-primary" (click)="save()" [disabled]="saving">
              {{ saving ? 'Saving…' : 'Save changes' }}
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding-top: 40px; padding-bottom: 80px; max-width: 560px; }
    h1 { font-size: 1.6rem; margin-bottom: 24px; }
    .section { padding: 24px; margin-bottom: 18px; }
    .section h3 { font-size: 1rem; margin-bottom: 16px; }
    .field { margin-bottom: 16px; }
    .field label { display: block; font-size: 0.82rem; color: var(--dm-text-muted); margin-bottom: 6px; }
    .hint { font-size: 0.76rem; color: var(--dm-text-muted); margin-top: 4px; }
    .muted { color: var(--dm-text-muted); font-size: 0.9rem; }

    .avatar-row { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
    .avatar-preview {
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      width: 72px; height: 72px; border-radius: 50%; background: var(--dm-gradient-primary);
      color: white; font-weight: 700; font-size: 1.3rem; letter-spacing: 0.02em; overflow: hidden;
    }
    .avatar-preview img { width: 100%; height: 100%; object-fit: cover; }
    .avatar-actions { display: flex; gap: 10px; flex-wrap: wrap; }
    .danger-btn { color: var(--dm-danger); border-color: var(--dm-danger); }
    .danger-btn:hover { background: rgba(239,68,68,0.1); }

    .card-footer { margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--dm-border); display: flex; justify-content: flex-end; }
    @media (max-width: 480px) {
      .card-footer { flex-direction: column-reverse; align-items: stretch; }
      .card-footer .dm-btn { width: 100%; }
      .avatar-actions { width: 100%; }
      .avatar-actions .dm-btn { flex: 1; }
    }
  `]
})
export class ProfileComponent implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  loading = true;
  saving = false;
  uploading = false;
  removing = false;
  email = '';
  displayName = '';
  avatarUrl: string | null = null;
  maxAvatarMb = MAX_AVATAR_MB;

  constructor(
    private auth: AuthService,
    private toast: ToastService
  ) {}

  ngOnInit() {
    this.auth.getProfile().subscribe(res => {
      this.email = res.profile.email;
      this.displayName = res.profile.displayName ?? '';
      this.avatarUrl = res.profile.avatarUrl ?? null;
      this.loading = false;
    });
  }

  save() {
    this.saving = true;
    this.auth.updateProfile(this.displayName).subscribe({
      next: () => { this.saving = false; this.toast.success('Profile updated.'); },
      error: () => this.saving = false
    });
  }

  initials(): string {
    const source = (this.displayName || this.email || '?').trim();
    return source.slice(0, 2).toUpperCase();
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // lets choosing the exact same file again still fire (change) next time
    if (!file) return;

    // Checked client-side purely for fast feedback - the backend re-validates and
    // re-encodes every upload regardless, since a client-side check is trivially
    // bypassable and proves nothing about what's actually inside the file.
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      this.toast.error('Please choose a JPEG, PNG, WebP, GIF, or BMP image.');
      return;
    }
    if (file.size > MAX_AVATAR_MB * 1024 * 1024) {
      this.toast.error(`Please choose an image under ${MAX_AVATAR_MB}MB.`);
      return;
    }

    this.uploading = true;
    this.auth.uploadAvatar(file).subscribe({
      next: res => {
        this.uploading = false;
        this.avatarUrl = res.profile.avatarUrl ?? null;
        this.toast.success('Profile picture updated.');
      },
      error: err => {
        this.uploading = false;
        this.toast.error(err?.error?.message || 'Could not upload that image. Please try again.');
      }
    });
  }

  removePhoto() {
    this.removing = true;
    this.auth.removeAvatar().subscribe({
      next: () => {
        this.removing = false;
        this.avatarUrl = null;
        this.toast.success('Profile picture removed.');
      },
      error: () => {
        this.removing = false;
        this.toast.error('Could not remove your profile picture. Please try again.');
      }
    });
  }
}
