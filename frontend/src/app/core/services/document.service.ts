import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { DocumentSummary, ExtractedFieldEdit } from '../models/models';

@Injectable({ providedIn: 'root' })
export class DocumentService {
  constructor(private http: HttpClient) {}

  upload(files: File[]) {
    const form = new FormData();
    files.forEach(f => form.append('files', f));
    // The free-tier limit is enforced server-side (by IP for anonymous users,
    // by subscription for logged-in ones) — no client-supplied counter is trusted.
    return this.http.post<{ success: boolean; documents: DocumentSummary[] }>(
      `${environment.apiBaseUrl}/documents/upload`, form);
  }

  getDetail(id: string) {
    return this.http.get<{ success: boolean; id: string; originalFileName: string; pageCount: number; requiresOcr: boolean; status: string; fields: ExtractedFieldEdit[] }>(
      `${environment.apiBaseUrl}/documents/${id}`);
  }

  updateField(documentId: string, fieldId: string, newValue: string) {
    return this.http.put(`${environment.apiBaseUrl}/documents/${documentId}/fields`, { fieldId, newValue });
  }

  exportExcel(documentId: string) {
    return this.http.get(`${environment.apiBaseUrl}/documents/${documentId}/export`, { responseType: 'blob' });
  }

  sendEmail(documentId: string, toAddress: string, message?: string) {
    return this.http.post<{ success: boolean; message: string }>(
      `${environment.apiBaseUrl}/documents/${documentId}/send-email`, { documentId, toAddress, message });
  }

  getMine() {
    return this.http.get<{ success: boolean; documents: DocumentSummary[] }>(`${environment.apiBaseUrl}/documents/mine`);
  }
}
