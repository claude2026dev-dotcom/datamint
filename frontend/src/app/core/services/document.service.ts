import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { DocumentSummary, ExtractedFieldEdit } from '../models/models';

@Injectable({ providedIn: 'root' })
export class DocumentService {
  constructor(private http: HttpClient) {}

  upload(files: File[], extractionMode: 'Dynamic' | 'Formatted' = 'Dynamic', requestedFields?: string) {
    const form = new FormData();
    files.forEach(f => form.append('files', f));
    form.append('extractionMode', extractionMode);
    if (extractionMode === 'Formatted' && requestedFields) form.append('requestedFields', requestedFields);
    // The free-tier limit is enforced server-side (by IP for anonymous users,
    // by subscription for logged-in ones) — no client-supplied counter is trusted.
    return this.http.post<{ success: boolean; documents: DocumentSummary[] }>(
      `${environment.apiBaseUrl}/documents/upload`, form);
  }

  getDetail(id: string) {
    return this.http.get<{
      success: boolean; id: string; originalFileName: string; pageCount: number; requiresOcr: boolean;
      status: string; extractionMode: string; requestedFields: string | null; fields: ExtractedFieldEdit[];
    }>(`${environment.apiBaseUrl}/documents/${id}`);
  }

  updateField(documentId: string, fieldId: string, newValue: string, newKey?: string) {
    return this.http.put(`${environment.apiBaseUrl}/documents/${documentId}/fields`, { fieldId, newValue, newKey });
  }

  exportExcel(documentId: string) {
    return this.http.get(`${environment.apiBaseUrl}/documents/${documentId}/export`, { responseType: 'blob' });
  }

  sendEmail(documentId: string, toAddress: string, message?: string) {
    return this.http.post<{ success: boolean; message: string }>(
      `${environment.apiBaseUrl}/documents/${documentId}/send-email`, { documentId, toAddress, message });
  }

  batchExport(documentIds: string[]) {
    return this.http.post(`${environment.apiBaseUrl}/documents/batch-export`, { documentIds }, { responseType: 'blob' });
  }

  batchSendEmail(documentIds: string[], toAddress: string) {
    return this.http.post<{ success: boolean; message: string }>(
      `${environment.apiBaseUrl}/documents/batch-send-email`, { documentIds, toAddress });
  }

  getMine() {
    return this.http.get<{ success: boolean; documents: DocumentSummary[] }>(`${environment.apiBaseUrl}/documents/mine`);
  }
}
