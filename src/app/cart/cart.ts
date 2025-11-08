import { Component, inject, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CartService, CartItem } from '../core/cart.service';
import { SupabaseService } from '../core/supabase.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cart.html',
  styleUrl: './cart.scss'
})
export class CartComponent {
  private cartService = inject(CartService);
  private supabase = inject(SupabaseService);
  private router = inject(Router);

  @Output() cartUpdated = new EventEmitter<void>();

  cartItems = this.cartService.cartItems;
  isLoading = false;
  successMessage = '';
  errorMessage = '';

  getTotalPrice(): number {
    return this.cartService.getTotalPrice();
  }

  removeItem(index: number): void {
    this.cartService.removeFromCart(index);
  }

  async checkout(): Promise<void> {
    const items = this.cartItems();
    
    if (items.length === 0) {
      this.errorMessage = 'Warenkorb ist leer.';
      return;
    }

    // Check if user is logged in
    const { data: { user } } = await this.supabase.getClient().auth.getUser();
    
    if (!user) {
      this.errorMessage = 'Bitte melden Sie sich an, um fortzufahren.';
      this.router.navigate(['/login']);
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      // Create bookings for each cart item
      const bookings = items.map(item => {
        const [year, month] = item.selectedMonth.split('-').map(Number);
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);

        return {
          partner_id: item.partner_id,
          customer_name: user.user_metadata?.['full_name'] || user.email?.split('@')[0],
          customer_email: user.email,
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
          status: 'pending',
          total_price: item.price_per_day,
          currency: 'EUR',
          payment_status: 'pending',
          notes: `Buchung für ${item.screen_name} - ${month}/${year}`
        };
      });

      // Insert all bookings
      const { data, error } = await this.supabase.getClient()
        .from('bookings')
        .insert(bookings);

      if (error) {
        throw error;
      }

      this.successMessage = 'Buchungen erfolgreich erstellt!';
      
      // Clear cart and notify parent
      setTimeout(() => {
        this.cartService.clearCart();
        this.cartUpdated.emit();
        this.router.navigate(['/bookings']);
      }, 2000);
    } catch (error: any) {
      this.errorMessage = 'Fehler bei der Buchung: ' + error.message;
    } finally {
      this.isLoading = false;
    }
  }
}

