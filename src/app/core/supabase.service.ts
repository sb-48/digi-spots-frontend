import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { createClient, SupabaseClient, PostgrestError } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabaseClient: SupabaseClient;
  private router = inject(Router);

  constructor() {
    this.supabaseClient = createClient(
      environment.supabaseUrl,
      environment.supabaseAnonKey
    );

    // Listen for auth state changes
    this.supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
        // User logged out or session expired, redirect to login
        const currentPath = this.router.url;
        if (currentPath !== '/login') {
          this.router.navigate(['/login']);
        }
      }
    });
  }

  getClient(): SupabaseClient {
    return this.supabaseClient;
  }

  // Check if error is a 401 unauthorized error
  private isUnauthorizedError(error: any): boolean {
    if (!error) return false;
    
    // Check error code (PostgreSQL/Supabase errors)
    if (error.code === 'PGRST301') return true;
    
    // Check status code
    if (error.status === 401) return true;
    
    // Check HTTP status
    if (error.statusCode === 401) return true;
    
    // Check message
    if (typeof error.message === 'string') {
      const msg = error.message.toLowerCase();
      if (msg.includes('401') || msg.includes('unauthorized')) return true;
    }
    
    return false;
  }

  // Wrapper method that intercepts 401 errors
  async safeQuery<T>(query: Promise<{ data: T | null; error: any }>): Promise<{ data: T | null; error: any }> {
    try {
      const result = await query;
      
      // Check for 401 errors in result
      if (this.isUnauthorizedError(result.error)) {
        const currentPath = this.router.url;
        if (currentPath !== '/login') {
          this.router.navigate(['/login']);
        }
        return { data: null, error: { message: 'Unauthorized - please log in' } };
      }
      
      return result;
    } catch (error: any) {
      if (this.isUnauthorizedError(error)) {
        const currentPath = this.router.url;
        if (currentPath !== '/login') {
          this.router.navigate(['/login']);
        }
        return { data: null, error: { message: 'Unauthorized - please log in' } };
      }
      return { data: null, error };
    }
  }
}

