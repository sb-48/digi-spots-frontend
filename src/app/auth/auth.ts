import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../core/supabase.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth.html',
  styleUrl: './auth.scss'
})
export class AuthComponent {
  private supabase = inject(SupabaseService);
  private router = inject(Router);

  isLogin = true; // true = login, false = register
  isLoading = false;
  errorMessage = '';
  successMessage = '';

  formData = {
    email: '',
    password: '',
    confirmPassword: '',
    fullName: ''
  };

  async toggleMode() {
    this.isLogin = !this.isLogin;
    this.errorMessage = '';
    this.successMessage = '';
  }

  async onSubmit() {
    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      if (this.isLogin) {
        await this.login();
      } else {
        await this.register();
      }
    } catch (error: any) {
      this.errorMessage = error.message || 'Ein Fehler ist aufgetreten.';
    } finally {
      this.isLoading = false;
    }
  }

  private async login() {
    const { data, error } = await this.supabase.getClient().auth.signInWithPassword({
      email: this.formData.email,
      password: this.formData.password
    });

    if (error) throw error;

    this.successMessage = 'Erfolgreich angemeldet!';
    setTimeout(() => {
      this.router.navigate(['/locations']);
    }, 1000);
  }

  private async register() {
    if (this.formData.password !== this.formData.confirmPassword) {
      throw new Error('Passwörter stimmen nicht überein.');
    }

    const { data, error } = await this.supabase.getClient().auth.signUp({
      email: this.formData.email,
      password: this.formData.password,
      options: {
        data: {
          full_name: this.formData.fullName
        }
      }
    });

    if (error) throw error;

    this.successMessage = 'Registrierung erfolgreich! Bitte prüfen Sie Ihre E-Mails zur Bestätigung.';
  }
}

