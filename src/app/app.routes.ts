import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home-page').then((m) => m.HomePage),
  },
  {
    path: 'privacy',
    loadComponent: () => import('./pages/privacy/privacy-page').then((m) => m.PrivacyPage),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
