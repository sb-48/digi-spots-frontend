import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../core/supabase.service';

interface Booking {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  customer_address: string | null;
  customer_city: string | null;
  customer_postal_code: string | null;
  start_time: string;
  end_time: string;
  status: string;
  total_price: number;
  currency: string;
  payment_status: string;
  notes: string | null;
  created_at: string;
  partner_id: string | null;
  screen_id: string | null;
}

@Component({
  selector: 'app-my-bookings',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './my-bookings.html',
  styleUrl: './my-bookings.scss'
})
export class MyBookingsComponent implements OnInit {
  private supabase = inject(SupabaseService);
  private router = inject(Router);

  bookings = signal<Booking[]>([]);
  isLoading = signal(true);
  errorMessage = signal('');

  async ngOnInit() {
    // Check if user is logged in
    const { data: { user } } = await this.supabase.getClient().auth.getUser();
    
    if (!user) {
      this.router.navigate(['/login']);
      return;
    }

    await this.loadBookings(user.email);
  }

  async loadBookings(userEmail: string | undefined) {
    if (!userEmail) {
      this.errorMessage.set('Keine E-Mail-Adresse gefunden.');
      this.isLoading.set(false);
      return;
    }

    try {
      const { data, error } = await this.supabase.getClient()
        .from('bookings')
        .select('*')
        .eq('customer_email', userEmail)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      this.bookings.set(data || []);
    } catch (error: any) {
      this.errorMessage.set('Fehler beim Laden der Buchungen: ' + error.message);
    } finally {
      this.isLoading.set(false);
    }
  }

  getStatusClass(status: string): string {
    const statusMap: { [key: string]: string } = {
      'pending': 'status-pending',
      'confirmed': 'status-confirmed',
      'completed': 'status-completed',
      'cancelled': 'status-cancelled'
    };
    return statusMap[status] || '';
  }

  getStatusLabel(status: string): string {
    const statusMap: { [key: string]: string } = {
      'pending': 'Ausstehend',
      'confirmed': 'Bestätigt',
      'completed': 'Abgeschlossen',
      'cancelled': 'Storniert'
    };
    return statusMap[status] || status;
  }

  getPaymentStatusLabel(status: string): string {
    const statusMap: { [key: string]: string } = {
      'pending': 'Ausstehend',
      'paid': 'Bezahlt',
      'failed': 'Fehlgeschlagen',
      'refunded': 'Erstattet'
    };
    return statusMap[status] || status;
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

