import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { authInterceptor } from './app/core/interceptors/auth.interceptor';
import { errorInterceptor } from './app/core/interceptors/error.interceptor';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideAnimations(),
    // Order matters: Angular interceptors run request-side in this order but
    // response/error-side in REVERSE - so authInterceptor (listed second) sees
    // a raw error first and gets to try a silent token refresh before
    // errorInterceptor's blanket "session expired" handling ever runs.
    provideHttpClient(withInterceptors([errorInterceptor, authInterceptor]))
  ]
}).catch(err => console.error(err));
