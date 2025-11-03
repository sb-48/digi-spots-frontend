import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./home/home').then(m => m.HomeComponent)
  },
  {
    path: 'locations',
    loadComponent: () => import('./locations/locations').then(m => m.LocationsComponent)
  },
  {
    path: 'pricing',
    loadComponent: () => import('./pricing/pricing').then(m => m.PricingComponent)
  },
  {
    path: 'bookings',
    loadComponent: () => import('./bookings/bookings').then(m => m.BookingsComponent)
  },
  {
    path: 'my-bookings',
    loadComponent: () => import('./my-bookings/my-bookings').then(m => m.MyBookingsComponent)
  },
  {
    path: 'login',
    loadComponent: () => import('./auth/auth').then(m => m.AuthComponent)
  }
];
