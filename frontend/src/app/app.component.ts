import { Component } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from './shared/components/navbar/navbar.component';
import { ToastComponent } from './shared/components/toast/toast.component';
import { ConfirmDialogComponent } from './shared/components/confirm-dialog/confirm-dialog.component';
import { FooterComponent } from './shared/components/footer/footer.component';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent, ToastComponent, ConfirmDialogComponent, FooterComponent],
  template: `
    <app-navbar></app-navbar>
    <router-outlet></router-outlet>
    <app-footer></app-footer>
    <app-toast></app-toast>
    <app-confirm-dialog></app-confirm-dialog>
  `
})
export class AppComponent {
  // index.html's static <title> is a build-time fallback for pre-JS crawlers; this is the
  // single source of truth once Angular boots, so a project rename only needs environment.appName.
  constructor(titleService: Title) {
    titleService.setTitle(`${environment.appName} — Extract PDF Data with AI`);
  }
}
