import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { BatchExportMode, DocumentSummary, ExportOptions, ExtractedFieldEdit } from '../models/models';

@Injectable({ providedIn: 'root' })
export class DocumentService {
  constructor(private http: HttpClient) {}

  upload(files: File[], extractionMode: 'Dynamic' | 'Formatted' = 'Dynamic', requestedFields?: string,
         pageSelections?: { fileIndex: number; pages: string }[]) {
    const form = new FormData();
    files.forEach(f => form.append('files', f));
    form.append('extractionMode', extractionMode);
    if (extractionMode === 'Formatted' && requestedFields) form.append('requestedFields', requestedFields);
    if (pageSelections?.length) form.append('pageSelections', JSON.stringify(pageSelections));
    // The plan's page limit is enforced server-side against the user's subscription (and, when a
    // page selection is given, only against the selected pages) — no client-supplied counter is trusted.
    return this.http.post<{ success: boolean; documents: DocumentSummary[] }>(
      `${environment.apiBaseUrl}/documents/upload`, form);
  }

  /// Read-only pre-upload check: returns each file's page count / OCR need without touching
  /// quota or saving anything permanent, so a page-range picker can be offered before committing.
  peek(files: File[]) {
    const form = new FormData();
    files.forEach(f => form.append('files', f));
    return this.http.post<{ success: boolean; files: { fileName: string; pageCount: number; requiresOcr: boolean }[] }>(
      `${environment.apiBaseUrl}/documents/peek`, form);
  }

  getDetail(id: string) {
    return this.http.get<{
      success: boolean; id: string; originalFileName: string; pageCount: number; requiresOcr: boolean;
      status: string; extractionMode: string; requestedFields: string | null; fields: ExtractedFieldEdit[];
    }>(`${environment.apiBaseUrl}/documents/${id}`);
  }

  updateField(documentId: string, fieldId: string, newValue: string, newKey?: string, includeInExport?: boolean) {
    // The backend recomputes wasEditedByUser from the actual before/after diff and
    // returns the resulting field state - callers should use that returned value
    // instead of assuming "the save succeeded" means "something was edited".
    return this.http.put<{ success: boolean; field: ExtractedFieldEdit }>(
      `${environment.apiBaseUrl}/documents/${documentId}/fields`, { fieldId, newValue, newKey, includeInExport });
  }

  reorderFields(documentId: string, fields: { fieldId: string; sectionLabel: string; sortOrder: number }[]) {
    return this.http.put<{ success: boolean }>(`${environment.apiBaseUrl}/documents/${documentId}/fields/reorder`, { fields });
  }

  renameSection(documentId: string, oldLabel: string, newLabel: string) {
    return this.http.put<{ success: boolean }>(`${environment.apiBaseUrl}/documents/${documentId}/sections/rename`, { oldLabel, newLabel });
  }

  exportDocument(documentId: string, options: ExportOptions = { format: 'Excel', layout: 'RowsPerField' }) {
    const params = new HttpParams().set('format', options.format).set('layout', options.layout);
    return this.http.get(`${environment.apiBaseUrl}/documents/${documentId}/export`, { params, responseType: 'blob' });
  }

  sendEmail(documentId: string, toAddress: string, message?: string, options?: ExportOptions) {
    return this.http.post<{ success: boolean; message: string }>(
      `${environment.apiBaseUrl}/documents/${documentId}/send-email`, { documentId, toAddress, message, options });
  }

  batchExport(documentIds: string[], exportMode: BatchExportMode = 'SingleSheet', options?: ExportOptions) {
    return this.http.post(`${environment.apiBaseUrl}/documents/batch-export`, { documentIds, exportMode, options }, { responseType: 'blob' });
  }

  batchSendEmail(documentIds: string[], toAddress: string, exportMode: BatchExportMode = 'SingleSheet', options?: ExportOptions) {
    return this.http.post<{ success: boolean; message: string }>(
      `${environment.apiBaseUrl}/documents/batch-send-email`, { documentIds, toAddress, exportMode, options });
  }

  getMine() {
    return this.http.get<{ success: boolean; documents: DocumentSummary[] }>(`${environment.apiBaseUrl}/documents/mine`);
  }
}
