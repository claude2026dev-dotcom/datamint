import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ContactService {
  constructor(private http: HttpClient) {}

  submit(name: string, email: string, message: string) {
    return this.http.post<{ success: boolean; message: string }>(`${environment.apiBaseUrl}/contact`, { name, email, message });
  }
}
