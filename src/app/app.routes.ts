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
    path: 'energieoptimizer',
    loadComponent: () => import('./energieoptimizer/energieoptimizer').then(m => m.EnergieOptimizerComponent)
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
    path: 'about',
    loadComponent: () => import('./about/about').then(m => m.AboutComponent)
  },
  {
    path: 'werbespots',
    loadComponent: () => import('./advertising/advertising').then(m => m.AdvertisingComponent)
  },
  {
    path: 'login',
    loadComponent: () => import('./auth/auth').then(m => m.AuthComponent)
  }
];
