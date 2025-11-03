import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

export interface CartItem {
  screen_id: string;
  partner_id: string;
  screen_name: string;
  partner_name: string;
  location: string;
  city: string;
  price_per_day: number; // This is actually price_per_month now
  selectedMonth: string;
  screen_type: string;
}

@Injectable({
  providedIn: 'root'
})
export class CartService {
  private readonly STORAGE_KEY = 'digispots_cart';
  
  // Signal for reactive cart updates
  cartItems = signal<CartItem[]>([]);
  cartCount = signal<number>(0);
  
  // Subject to notify when cart should be opened
  private openCartSubject = new Subject<void>();
  openCart$ = this.openCartSubject.asObservable();

  constructor() {
    // Load cart from localStorage on init
    const items = this.loadFromStorage();
    this.cartItems.set(items);
    this.cartCount.set(items.length);
  }

  addToCart(item: CartItem): void {
    const currentItems = this.cartItems();
    const existingIndex = currentItems.findIndex(
      i => i.screen_id === item.screen_id && i.selectedMonth === item.selectedMonth
    );

    if (existingIndex !== -1) {
      // Item with same month already in cart
      console.log('Item already in cart for this month');
      return;
    }

    // Add new item
    const newItems = [...currentItems, item];
    this.cartItems.set(newItems);
    this.saveToStorage(newItems);
    this.cartCount.set(newItems.length);
    
    // Notify that cart should be opened
    this.openCartSubject.next();
  }
  
  openCart(): void {
    this.openCartSubject.next();
  }

  removeFromCart(index: number): void {
    const currentItems = this.cartItems();
    const newItems = currentItems.filter((_, i) => i !== index);
    this.cartItems.set(newItems);
    this.saveToStorage(newItems);
    this.cartCount.set(newItems.length);
  }

  clearCart(): void {
    this.cartItems.set([]);
    this.cartCount.set(0);
    localStorage.removeItem(this.STORAGE_KEY);
  }

  private loadFromStorage(): CartItem[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const items = JSON.parse(stored);
        // Validate that items is an array
        if (Array.isArray(items)) {
          return items;
        }
      }
    } catch (error) {
      console.error('Error loading cart from storage:', error);
      // Clear corrupted data
      localStorage.removeItem(this.STORAGE_KEY);
    }
    return [];
  }

  private saveToStorage(items: CartItem[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      console.error('Error saving cart to storage:', error);
    }
  }


  getTotalPrice(): number {
    return this.cartItems().reduce((total, item) => total + item.price_per_day, 0);
  }
}

