import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../core/supabase.service';

@Component({
  selector: 'app-bookings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bookings.html',
  styleUrl: './bookings.scss'
})
export class BookingsComponent {
  private supabase = inject(SupabaseService);

  formData = {
    companyName: '',
    lastName: '',
    firstName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    postalCode: ''
  };

  isSubmitting = false;
  submitSuccess = false;
  errorMessage = '';

  async onSubmit() {
    this.isSubmitting = true;
    this.errorMessage = '';
    this.submitSuccess = false;

    try {
      // Create booking
      const { data, error } = await this.supabase.getClient()
        .from('bookings')
        .insert({
          partner_id: null,
          customer_name: `${this.formData.firstName} ${this.formData.lastName}`,
          customer_email: this.formData.email,
          customer_phone: this.formData.phone,
          customer_address: this.formData.address,
          customer_city: this.formData.city,
          customer_postal_code: this.formData.postalCode,
          screen_id: null, // Will be set when selecting a screen
          start_time: new Date().toISOString(),
          end_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours later
          status: 'pending',
          total_price: 0,
          currency: 'EUR',
          payment_status: 'pending',
          notes: `Company: ${this.formData.companyName}`
        });

      if (error) throw error;

      this.submitSuccess = true;
      this.resetForm();
    } catch (error: any) {
      this.errorMessage = error.message || 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.';
    } finally {
      this.isSubmitting = false;
    }
  }

  resetForm() {
    this.formData = {
      companyName: '',
      lastName: '',
      firstName: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      postalCode: ''
    };
  }
}

