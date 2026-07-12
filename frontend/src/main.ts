import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { authInterceptor } from './app/core/interceptors/auth.interceptor';
import { errorInterceptor } from './app/core/interceptors/error.interceptor';

bootstrapApplication(AppComponent, {
  providers: [
    // anchorScrolling lets navbar's "Current plan" link (routerLink="/profile"
    // fragment="your-plan") actually scroll to that section instead of just
    // landing at the top of a page the user then has to scroll down manually.
    // scrollPositionRestoration: 'top' (not 'enabled') is deliberate - 'enabled'
    // restores the OLD scroll offset on any back-navigation, which includes our
    // in-app <app-back-button> (it just calls Location.back()). Every navigation,
    // including back, should land at the top of the new page unless an anchor
    // says otherwise.
    provideRouter(routes, withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'top' })),
    provideAnimations(),
    // Order matters: Angular interceptors run request-side in this order but
    // response/error-side in REVERSE - so authInterceptor (listed second) sees
    // a raw error first and gets to try a silent token refresh before
    // errorInterceptor's blanket "session expired" handling ever runs.
    provideHttpClient(withInterceptors([errorInterceptor, authInterceptor]))
  ]
}).catch(err => console.error(err));
