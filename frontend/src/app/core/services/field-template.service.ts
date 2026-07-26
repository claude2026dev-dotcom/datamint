import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { FieldTemplate } from '../models/models';

@Injectable({ providedIn: 'root' })
export class FieldTemplateService {
  constructor(private http: HttpClient) {}

  getMine() {
    return this.http.get<{ success: boolean; templates: FieldTemplate[] }>(`${environment.apiBaseUrl}/field-templates`);
  }

  create(name: string, fields: string[]) {
    return this.http.post<{ success: boolean; template: FieldTemplate }>(`${environment.apiBaseUrl}/field-templates`, { name, fields });
  }

  update(id: string, name: string, fields: string[]) {
    return this.http.put<{ success: boolean; template: FieldTemplate }>(`${environment.apiBaseUrl}/field-templates/${id}`, { name, fields });
  }

  delete(id: string) {
    return this.http.delete<{ success: boolean }>(`${environment.apiBaseUrl}/field-templates/${id}`);
  }
}
