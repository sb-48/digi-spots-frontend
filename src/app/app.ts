import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { CartService } from './core/cart.service';
import { CartComponent } from './cart/cart';
import { SupabaseService } from './core/supabase.service';
import { User } from '@supabase/supabase-js';
import { Subscription } from 'rxjs';
import { AccessGuardComponent } from './access-guard/access-guard';
import { environment } from '../environments/environment';

const ACCESS_STORAGE_KEY = 'digispots-access-granted';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, CartComponent, AccessGuardComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit, OnDestroy {
  protected readonly title = signal('mein-projekt');
  protected readonly isMenuOpen = signal(false);
  protected openCartModal = false;
  protected readonly hasAccess = signal(false);
  protected readonly guardError = signal('');
  currentUser: User | null = null;
  private cartSubscription?: Subscription;

  get cartCount() {
    return this.cartService.cartCount;
  }

  constructor(
    private cartService: CartService,
    private supabase: SupabaseService
  ) {}

  ngOnInit() {
    const storedAccess = localStorage.getItem(ACCESS_STORAGE_KEY);
    if (storedAccess === 'true') {
      this.hasAccess.set(true);
    }

    // Check initial auth state
    this.checkAuthState();
    
    // Listen for auth changes
    this.supabase.getClient().auth.onAuthStateChange((event, session) => {
      this.currentUser = session?.user || null;
    });
    
    // Listen for cart open requests
    this.cartSubscription = this.cartService.openCart$.subscribe(() => {
      this.openCartModal = true;
    });
  }

  ngOnDestroy() {
    // Cleanup will be handled by Supabase
    if (this.cartSubscription) {
      this.cartSubscription.unsubscribe();
    }
  }

  async checkAuthState() {
    const { data: { user } } = await this.supabase.getClient().auth.getUser();
    this.currentUser = user;
  }

  async logout() {
    await this.supabase.getClient().auth.signOut();
    this.currentUser = null;
  }

  toggleMenu() {
    this.isMenuOpen.update(value => !value);
  }

  closeMenu() {
    this.isMenuOpen.set(false);
  }

  closeCart() {
    this.openCartModal = false;
  }

  handlePasswordSubmit(password: string) {
    if (password === environment.guardPassword) {
      this.hasAccess.set(true);
      this.guardError.set('');
      localStorage.setItem(ACCESS_STORAGE_KEY, 'true');
    } else {
      this.guardError.set('Falsches Passwort, bitte erneut versuchen.');
    }
  }
}
