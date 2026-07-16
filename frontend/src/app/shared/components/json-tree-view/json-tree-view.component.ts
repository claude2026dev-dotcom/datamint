import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/// Generic, fully dynamic expandable/collapsible JSON tree - not specific to documents or
/// export data, works on any JSON-compatible value (object, array, or primitive). Used to let a
/// user inspect the exact structured shape (sections/fields) that will be exported, live from
/// whatever is currently loaded/edited on screen, before committing to an actual export.
@Component({
  selector: 'app-json-tree-view',
  standalone: true,
  imports: [CommonModule],
  template: `
    <ng-container *ngTemplateOutlet="node; context: { $implicit: data, key: rootLabel, depth: 0 }" />

    <ng-template #node let-value let-key="key" let-depth="depth">
      @if (isExpandable(value)) {
        <div class="tree-node" [style.marginLeft.px]="depth === 0 ? 0 : 16">
          <button type="button" class="tree-toggle" (click)="toggle(value)">
            <span class="chevron" [class.open]="isOpen(value)">▸</span>
            @if (key !== null) { <span class="tree-key">{{ key }}</span><span class="colon">:</span> }
            <span class="muted small">{{ isArray(value) ? '[' + value.length + ']' : '{' + objectKeys(value).length + '}' }}</span>
          </button>
          @if (isOpen(value)) {
            <div class="tree-children">
              @if (isArray(value)) {
                @for (item of value; track $index) {
                  <ng-container *ngTemplateOutlet="node; context: { $implicit: item, key: '[' + $index + ']', depth: depth + 1 }" />
                }
              } @else {
                @for (k of objectKeys(value); track k) {
                  <ng-container *ngTemplateOutlet="node; context: { $implicit: value[k], key: k, depth: depth + 1 }" />
                }
              }
            </div>
          }
        </div>
      } @else {
        <div class="tree-leaf" [style.marginLeft.px]="depth === 0 ? 0 : 16">
          @if (key !== null) { <span class="tree-key">{{ key }}</span><span class="colon">:</span> }
          <span class="tree-value" [class.is-null]="value === null" [class.is-bool]="isBool(value)" [class.is-number]="isNumber(value)">
            {{ formatLeaf(value) }}
          </span>
        </div>
      }
    </ng-template>
  `,
  styles: [`
    :host { display: block; font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: 0.85rem; line-height: 1.7; }
    .muted { color: var(--dm-text-muted); }
    .small { font-size: 0.78rem; }
    .tree-node, .tree-leaf { position: relative; }
    .tree-toggle {
      display: inline-flex; align-items: center; gap: 4px; background: none; border: none; cursor: pointer;
      padding: 1px 4px; border-radius: var(--dm-radius-sm); color: var(--dm-text); font: inherit;
    }
    .tree-toggle:hover { background: var(--dm-surface-hover); }
    .chevron { display: inline-block; transition: transform 0.15s ease; color: var(--dm-text-muted); }
    .chevron.open { transform: rotate(90deg); }
    .tree-key { color: var(--dm-primary); font-weight: 600; }
    .colon { color: var(--dm-text-muted); margin-right: 4px; }
    .tree-leaf { padding: 1px 4px 1px 20px; }
    .tree-value { overflow-wrap: break-word; }
    .tree-value.is-null { color: var(--dm-text-muted); font-style: italic; }
    .tree-value.is-bool, .tree-value.is-number { color: var(--dm-accent); }
    .tree-children { border-left: 1px solid var(--dm-border); margin-left: 9px; padding-left: 4px; }
  `]
})
export class JsonTreeViewComponent {
  @Input() data: unknown;
  @Input() rootLabel: string | null = null;

  private openState = new Map<unknown, boolean>();

  isExpandable(value: unknown): value is Record<string, unknown> | unknown[] {
    return value !== null && typeof value === 'object';
  }

  isArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
  }

  isBool(value: unknown): boolean {
    return typeof value === 'boolean';
  }

  isNumber(value: unknown): boolean {
    return typeof value === 'number';
  }

  objectKeys(value: object): string[] {
    return Object.keys(value);
  }

  isOpen(value: object): boolean {
    // Default expanded for the first two levels' worth of typical section/field trees;
    // deeper/large collections start collapsed so the tree doesn't overwhelm on first render.
    return this.openState.get(value) ?? true;
  }

  toggle(value: object) {
    this.openState.set(value, !this.isOpen(value));
  }

  formatLeaf(value: unknown): string {
    if (value === null) return 'null';
    if (typeof value === 'string') return `"${value}"`;
    return String(value);
  }
}
