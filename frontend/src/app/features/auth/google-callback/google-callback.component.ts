import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

/// Landing target if you choose Google's redirect-based OAuth flow instead of
/// the popup-based Identity Services widget used in login.component.ts.
@Component({
  selector: 'app-google-callback',
  standalone: true,
  template: `<div class="loading"><p>Signing you in…</p></div>`,
  styles: [`.loading { display:flex; align-items:center; justify-content:center; height: 60vh; color: var(--dm-text-muted); }`]
})
export class GoogleCallbackComponent implements OnInit {
  constructor(private route: ActivatedRoute, private auth: AuthService) {}

  ngOnInit() {
    const idToken = this.route.snapshot.queryParamMap.get('id_token');
    if (idToken) {
      this.auth.loginWithGoogle(idToken).subscribe(res => this.auth.completeLogin(res));
    }
  }
}
