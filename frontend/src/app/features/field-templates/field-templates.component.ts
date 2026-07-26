import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FieldTemplateService } from '../../core/services/field-template.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { ToastService } from '../../core/services/toast.service';
import { FieldTemplate } from '../../core/models/models';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { BackButtonComponent } from '../../shared/components/back-button/back-button.component';

/// Lets a user who repeatedly uploads the same kind of document (an invoice, a GST return,
/// a fixed report format) save the field list once instead of retyping it every time they
/// pick "Choose specific fields" on the upload page. Pure CRUD over FieldTemplate - creation/
/// editing happens here; the upload page only ever reads this list to populate its field boxes.
@Component({
  selector: 'app-field-templates',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IconComponent, BackButtonComponent],
  template: `
    <div class="dm-container page">
      <app-back-button fallbackUrl="/upload" />
      <div class="header">
        <div>
          <h1>Saved field templates</h1>
          <p class="muted">Save a field list once, then pick it from the upload page instead of retyping it every time.</p>
        </div>
        @if (!formOpen) {
          <button class="dm-btn dm-btn-primary" (click)="openNewForm()">+ New template</button>
        }
      </div>

      @if (formOpen) {
        <div class="dm-card form-card">
          <h3>{{ editingId ? 'Edit template' : 'New template' }}</h3>
          <label class="field-label">Name</label>
          <input class="dm-input" [(ngModel)]="formName" name="templateName" placeholder="e.g. GST Return, Standard Invoice" />

          <label class="field-label">Fields</label>
          @for (fieldName of formFields; track $index; let i = $index) {
            <div class="field-box-row">
              <input class="dm-input" [(ngModel)]="formFields[i]" [name]="'field-' + i" placeholder="e.g. Invoice Number" />
              @if (formFields.length > 1) {
                <button type="button" class="remove-btn" (click)="removeFieldBox(i)" aria-label="Remove this field">✕</button>
              }
            </div>
          }
          <button type="button" class="dm-btn dm-btn-ghost add-field-btn" (click)="addFieldBox()">+ Add another field</button>

          <div class="form-actions">
            <button class="dm-btn dm-btn-ghost" (click)="closeForm()" [disabled]="saving">Cancel</button>
            <button class="dm-btn dm-btn-primary" (click)="save()" [disabled]="saving">{{ saving ? 'Saving…' : 'Save template' }}</button>
          </div>
        </div>
      }

      @if (loading) {
        <p class="muted">Loading…</p>
      } @else if (templates.length === 0 && !formOpen) {
        <div class="dm-card empty-card">
          <div class="icon"><app-icon name="file-text" [size]="26" /></div>
          <h3>No saved templates yet</h3>
          <p class="muted">Create one to reuse the same field list across uploads.</p>
        </div>
      } @else {
        <div class="template-list">
          @for (t of templates; track t.id) {
            <div class="dm-card template-card">
              <div class="template-head">
                <span class="template-name">{{ t.name }}</span>
                <div class="template-actions">
                  <button class="dm-btn dm-btn-ghost" (click)="openEditForm(t)" [disabled]="formOpen">Edit</button>
                  <button class="dm-btn dm-btn-ghost danger" (click)="remove(t)" [disabled]="formOpen">Delete</button>
                </div>
              </div>
              <div class="chip-list">
                @for (f of t.fields; track f) { <span class="chip">{{ f }}</span> }
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding-top: 40px; padding-bottom: 80px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; margin-bottom: 24px; }
    h1 { font-size: 1.6rem; margin-bottom: 6px; }
    .muted { color: var(--dm-text-muted); font-size: 0.9rem; }

    .form-card { padding: 20px; margin-bottom: 22px; display: flex; flex-direction: column; gap: 6px; }
    .form-card h3 { font-size: 1rem; margin-bottom: 10px; }
    .field-label { display: block; font-size: 0.8rem; color: var(--dm-text-muted); margin: 12px 0 4px; }
    .field-box-row { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
    .field-box-row .dm-input { flex: 1; }
    .remove-btn {
      flex-shrink: 0; width: 30px; height: 30px; border-radius: var(--dm-radius-sm); border: 1px solid var(--dm-border);
      background: transparent; color: var(--dm-text-muted); cursor: pointer; font-size: 0.85rem;
    }
    .remove-btn:hover { color: var(--dm-danger); border-color: var(--dm-danger); }
    .add-field-btn { align-self: flex-start; margin-top: 4px; padding: 6px 14px; font-size: 0.85rem; }
    .form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--dm-border); }

    .empty-card { max-width: 420px; margin: 40px auto; padding: 36px 28px; text-align: center; }
    .empty-card .icon { color: var(--dm-text-muted); display: flex; justify-content: center; margin-bottom: 12px; }
    .empty-card h3 { margin-bottom: 8px; }

    .template-list { display: flex; flex-direction: column; gap: 14px; }
    .template-card { padding: 18px 20px; }
    .template-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
    .template-name { font-weight: 700; font-size: 1.02rem; overflow-wrap: break-word; }
    .template-actions { display: flex; gap: 8px; flex-shrink: 0; }
    .template-actions .dm-btn { padding: 5px 12px; font-size: 0.82rem; }
    .danger:hover { color: var(--dm-danger); border-color: var(--dm-danger); }
    .chip-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { font-size: 0.78rem; padding: 3px 10px; border-radius: 999px; background: rgba(99,102,241,0.1); color: var(--dm-primary); }

    @media (max-width: 700px) {
      .header { flex-direction: column; }
      .template-head { flex-direction: column; align-items: flex-start; }
    }
  `]
})
export class FieldTemplatesComponent implements OnInit {
  templates: FieldTemplate[] = [];
  loading = true;

  formOpen = false;
  editingId: string | null = null;
  formName = '';
  formFields: string[] = [''];
  saving = false;

  constructor(
    private fieldTemplateService: FieldTemplateService,
    private confirmDialog: ConfirmDialogService,
    private toast: ToastService
  ) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    this.fieldTemplateService.getMine().subscribe({
      next: res => { this.templates = res.templates; this.loading = false; },
      error: () => { this.loading = false; this.toast.error('Could not load your saved templates.'); }
    });
  }

  openNewForm() {
    this.editingId = null;
    this.formName = '';
    this.formFields = [''];
    this.formOpen = true;
  }

  openEditForm(t: FieldTemplate) {
    this.editingId = t.id;
    this.formName = t.name;
    this.formFields = [...t.fields];
    this.formOpen = true;
  }

  closeForm() {
    this.formOpen = false;
  }

  addFieldBox() { this.formFields.push(''); }
  removeFieldBox(index: number) { this.formFields.splice(index, 1); }

  save() {
    const name = this.formName.trim();
    const fields = this.formFields.map(f => f.trim()).filter(Boolean);

    if (!name) { this.toast.error('Give this template a name.'); return; }
    if (fields.length === 0) { this.toast.error('Add at least one field.'); return; }

    this.saving = true;
    const request = this.editingId
      ? this.fieldTemplateService.update(this.editingId, name, fields)
      : this.fieldTemplateService.create(name, fields);

    request.subscribe({
      next: () => {
        this.saving = false;
        this.formOpen = false;
        this.toast.success(this.editingId ? 'Template updated.' : 'Template saved.');
        this.load();
      },
      error: err => {
        this.saving = false;
        this.toast.error(err?.error?.message || 'Could not save that template. Please try again.');
      }
    });
  }

  async remove(t: FieldTemplate) {
    const confirmed = await this.confirmDialog.ask({
      title: 'Delete this template?',
      message: `"${t.name}" will be removed. This can't be undone.`,
      confirmLabel: 'Delete',
      danger: true
    });
    if (!confirmed) return;

    this.fieldTemplateService.delete(t.id).subscribe({
      next: () => { this.toast.success('Template deleted.'); this.load(); },
      error: () => this.toast.error('Could not delete that template. Please try again.')
    });
  }
}
