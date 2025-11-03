import { Component, inject, OnInit, ChangeDetectorRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../core/supabase.service';
import { CartService, CartItem } from '../core/cart.service';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icon issue in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface Partner {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postal_code: string;
  country: string;
  latitude?: number;
  longitude?: number;
  showAvailability?: boolean;
  loadingScreens?: boolean;
  screens?: Screen[];
  bookingCounts?: BookingCount[]; // Total bookings for all screens
  disabledMonths?: string[]; // Months with 20+ bookings (array for change detection)
  selectedMonth?: string; // Selected month for booking
  price_per_month?: number; // Partner-level pricing
}

interface Screen {
  id: string;
  partner_id: string;
  name: string;
  location: string;
  address: string;
  city: string;
  postal_code: string;
  screen_type: string;
  price_per_hour: number;
  price_per_day: number;
  bookingCounts?: BookingCount[];
  disabledMonths?: Set<string>;
  selectedMonth?: string;
}

interface BookingCount {
  year: number;
  month: number;
  count: number;
}

@Component({
  selector: 'app-locations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './locations.html',
  styleUrl: './locations.scss'
})
export class LocationsComponent implements OnInit {
  private supabase = inject(SupabaseService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private cartService = inject(CartService);

  partners: Partner[] = [];
  allPartners: Partner[] = []; // Store all partners for filtering
  screens: Screen[] = [];
  loading = true;
  errorMessage = '';
  selectedPartner: Partner | null = null;
  selectedPartnerForModal: Partner | null = null;
  private map: L.Map | null = null;
  favoritePartners: Set<string> = new Set(); // Store favorite partner IDs
  selectedScreen: Screen | null = null;
  selectedMonth: string = '';
  customSelectedMonth: string = ''; // For custom picker
  selectedYear: number = new Date().getFullYear();
  bookingCounts: BookingCount[] = [];
  disabledMonths: string[] = []; // Changed to array for change detection
  successMessage = '';
  isBooking = false;
  
  // Filter properties
  showFilterModal = false;
  activeView: 'map' | 'list' = 'list';
  filters = {
    availability: 'all',
    city: '',
    radius: 0
  };

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

  // Redirect to login if unauthorized
  private handleUnauthorizedError() {
    const currentPath = this.router.url;
    if (currentPath !== '/login') {
      this.router.navigate(['/login']);
    }
  }

  ngOnInit(): void {
    this.loadPartners();
    this.loadFavorites();
  }

  loadFavorites() {
    // Load favorites from localStorage
    const savedFavorites = localStorage.getItem('favoritePartners');
    if (savedFavorites) {
      try {
        const favorites = JSON.parse(savedFavorites);
        this.favoritePartners = new Set(favorites);
      } catch (e) {
        console.error('Error loading favorites:', e);
      }
    }
  }

  toggleFavorite(partnerId: string) {
    if (this.favoritePartners.has(partnerId)) {
      this.favoritePartners.delete(partnerId);
    } else {
      this.favoritePartners.add(partnerId);
    }
    // Save to localStorage
    localStorage.setItem('favoritePartners', JSON.stringify(Array.from(this.favoritePartners)));
  }

  isFavorite(partnerId: string): boolean {
    return this.favoritePartners.has(partnerId);
  }

  onBookNow(partner: Partner) {
    // Open availability modal for this partner
    this.openAvailabilityModal(partner);
  }

  async loadPartners() {
    console.log('loadPartners START - loading:', this.loading);
    this.errorMessage = '';
    
    try {
      const response = await this.supabase.getClient()
        .from('partners')
        .select('*')
        .order('city', { ascending: true });
      
      console.log('Partners response:', response);
      const { data, error } = response;

      if (error) {
        console.error('Error loading partners:', error);
        if (this.isUnauthorizedError(error)) {
          this.handleUnauthorizedError();
          return;
        }
        throw error;
      }

      console.log('Setting partners data:', data?.length || 0, 'partners');
      const partnerData = (data || []).map(partner => ({
        ...partner,
        showAvailability: false,
        loadingScreens: false,
        screens: [],
        bookingCounts: [],
        disabledMonths: [],
        selectedMonth: '',
        price_per_month: 299.00 // Default partner price
      }));
      this.allPartners = partnerData;
      this.partners = partnerData;
      this.cdr.detectChanges();
    } catch (error: any) {
      console.error('Exception loading partners:', error);
      if (this.isUnauthorizedError(error)) {
        this.handleUnauthorizedError();
        return;
      }
      this.errorMessage = 'Fehler beim Laden der Standorte: ' + error.message;
    } finally {
      console.log('FINALLY - Setting loading to false');
      this.loading = false;
      this.cdr.detectChanges();
      console.log('Partners after load:', this.partners.length);
    }
  }

  async openAvailabilityModal(partner: Partner) {
    // Set modal partner first
    this.selectedPartnerForModal = partner;
    
    // Mark as loading
    partner.loadingScreens = true;
    this.cdr.detectChanges();
    
    // Load booking counts for partner
    await this.loadBookingCountsForPartner(partner);
    
    // Done loading
    partner.loadingScreens = false;
    
    // Refresh reference to trigger change detection (deep copy to ensure change detection works)
    this.selectedPartnerForModal = {
      ...partner,
      disabledMonths: partner.disabledMonths ? [...partner.disabledMonths] : [],
      bookingCounts: partner.bookingCounts ? [...partner.bookingCounts] : []
    };
    this.cdr.detectChanges();
  }

  closeAvailabilityModal() {
    this.selectedPartnerForModal = null;
  }

  async togglePartnerAvailability(partner: Partner) {
    if (partner.showAvailability) {
      // Already showing, just hide
      partner.showAvailability = false;
      return;
    }

    // Show and load screens
    partner.showAvailability = true;
    partner.loadingScreens = true;

    if (!partner.screens || partner.screens.length === 0) {
      await this.loadScreensForPartner(partner);
    } else {
      partner.loadingScreens = false;
    }
  }

  async loadScreensForPartner(partner: Partner) {
    try {
      const { data, error } = await this.supabase.getClient()
        .from('screens')
        .select('*')
        .eq('partner_id', partner.id)
        .eq('is_active', true);

      if (error) {
        if (this.isUnauthorizedError(error)) {
          this.handleUnauthorizedError();
          return;
        }
        throw error;
      }

      // Initialize screens with empty booking data
      partner.screens = (data || []).map(screen => ({
        ...screen,
        bookingCounts: [],
        disabledMonths: new Set<string>(),
        selectedMonth: ''
      }));

      // Load booking counts for partner (aggregate across all screens)
      await this.loadBookingCountsForPartner(partner);

      partner.loadingScreens = false;
    } catch (error: any) {
      partner.loadingScreens = false;
      if (this.isUnauthorizedError(error)) {
        this.handleUnauthorizedError();
        return;
      }
      console.error('Error loading screens:', error);
    }
  }

  async loadBookingCountsForPartner(partner: Partner) {
    try {
      console.log('Loading booking counts for partner:', partner.id, partner.name);
      const { data, error } = await this.supabase.getClient()
        .from('bookings')
        .select('start_time')
        .eq('partner_id', partner.id)
        .in('status', ['confirmed', 'pending']);

      console.log('Booking counts response:', { data, error });

      if (error) {
        if (this.isUnauthorizedError(error)) {
          this.handleUnauthorizedError();
          return;
        }
        throw error;
      }

      // Group by year-month and count
      const counts = new Map<string, number>();
      if (data) {
        data.forEach(booking => {
          const date = new Date(booking.start_time);
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          counts.set(key, (counts.get(key) || 0) + 1);
        });
      }

      partner.bookingCounts = Array.from(counts.entries()).map(([key, count]) => {
        const [year, month] = key.split('-');
        return { year: parseInt(year), month: parseInt(month), count };
      });

      // Calculate disabled months
      partner.disabledMonths = [];
      partner.bookingCounts.forEach(bc => {
        if (bc.count >= 20) {
          const key = `${bc.year}-${String(bc.month).padStart(2, '0')}`;
          partner.disabledMonths!.push(key);
        }
      });
      
      console.log('Booking counts calculated:', partner.bookingCounts, 'Disabled months:', partner.disabledMonths);
      
      // Force change detection
      this.cdr.detectChanges();
    } catch (error: any) {
      if (this.isUnauthorizedError(error)) {
        this.handleUnauthorizedError();
        return;
      }
      console.error('Error loading booking counts for partner:', error);
    }
  }

  async loadBookingCountsForScreen(screen: Screen) {
    try {
      const { data, error } = await this.supabase.getClient()
        .from('bookings')
        .select('start_time')
        .eq('screen_id', screen.id)
        .in('status', ['confirmed', 'pending']);

      if (error) {
        if (this.isUnauthorizedError(error)) {
          this.handleUnauthorizedError();
          return;
        }
        throw error;
      }

      // Group by year-month and count
      const counts = new Map<string, number>();
      if (data) {
        data.forEach(booking => {
          const date = new Date(booking.start_time);
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          counts.set(key, (counts.get(key) || 0) + 1);
        });
      }

      screen.bookingCounts = Array.from(counts.entries()).map(([key, count]) => {
        const [year, month] = key.split('-');
        return { year: parseInt(year), month: parseInt(month), count };
      });

      // Calculate disabled months
      screen.disabledMonths = new Set<string>();
      screen.bookingCounts.forEach(bc => {
        if (bc.count >= 20) {
          const key = `${bc.year}-${String(bc.month).padStart(2, '0')}`;
          screen.disabledMonths!.add(key);
        }
      });
    } catch (error: any) {
      if (this.isUnauthorizedError(error)) {
        this.handleUnauthorizedError();
        return;
      }
      console.error('Error loading booking counts:', error);
    }
  }

  async selectScreen(screen: Screen) {
    this.selectedScreen = screen;
    this.selectedMonth = '';
    await this.loadBookingCounts(screen.id);
    this.calculateDisabledMonths();
  }

  async loadBookingCounts(screenId: string) {
    try {
      const { data, error } = await this.supabase.getClient()
        .from('bookings')
        .select('start_time')
        .eq('screen_id', screenId)
        .in('status', ['confirmed', 'pending']);

      if (error) {
        if (this.isUnauthorizedError(error)) {
          this.handleUnauthorizedError();
          return;
        }
        throw error;
      }

      // Group by year-month and count
      const counts = new Map<string, number>();
      if (data) {
        data.forEach(booking => {
          const date = new Date(booking.start_time);
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          counts.set(key, (counts.get(key) || 0) + 1);
        });
      }

      this.bookingCounts = Array.from(counts.entries()).map(([key, count]) => {
        const [year, month] = key.split('-');
        return { year: parseInt(year), month: parseInt(month), count };
      });
    } catch (error: any) {
      if (this.isUnauthorizedError(error)) {
        this.handleUnauthorizedError();
        return;
      }
      console.error('Error loading booking counts:', error);
    }
  }

  calculateDisabledMonths() {
    this.disabledMonths = [];
    this.bookingCounts.forEach(bc => {
      if (bc.count >= 20) {
        const key = `${bc.year}-${String(bc.month).padStart(2, '0')}`;
        this.disabledMonths.push(key);
      }
    });
  }

  isMonthDisabled(year: number, month: number): boolean {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    return this.disabledMonths.includes(key);
  }

  bookPartner(partner: Partner) {
    if (!partner.selectedMonth) {
      this.errorMessage = 'Bitte wählen Sie einen Monat aus.';
      return;
    }

    const [year, month] = partner.selectedMonth.split('-').map(Number);
    const key = `${year}-${String(month).padStart(2, '0')}`;

    this.errorMessage = '';
    this.successMessage = '';
    
    // Check if month is disabled
    if (partner.disabledMonths?.includes(key)) {
      this.errorMessage = 'Dieser Monat ist bereits vollständig ausgebucht.';
      return;
    }

    // Add to cart
    const cartItem: CartItem = {
      screen_id: '', // No longer needed
      partner_id: partner.id,
      screen_name: partner.name,
      partner_name: partner.name,
      location: partner.address,
      city: partner.city,
      price_per_day: partner.price_per_month || 299.00,
      selectedMonth: partner.selectedMonth,
      screen_type: 'partner' // Placeholder type
    };

    this.cartService.addToCart(cartItem);
    this.successMessage = 'Zur Buchung hinzugefügt!';
    partner.selectedMonth = '';
    
    // Close modal after adding to cart
    this.closeAvailabilityModal();
  }

  closeBookingModal() {
    this.selectedScreen = null;
    this.selectedMonth = '';
    this.errorMessage = '';
    this.successMessage = '';
  }

  getCurrentMonth(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  getAvailableYears(): number[] {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let i = 0; i < 3; i++) {
      years.push(currentYear + i);
    }
    return years;
  }

  getAvailableMonths(): { value: number, label: string }[] {
    const months = [
      { value: 1, label: 'Januar' },
      { value: 2, label: 'Februar' },
      { value: 3, label: 'März' },
      { value: 4, label: 'April' },
      { value: 5, label: 'Mai' },
      { value: 6, label: 'Juni' },
      { value: 7, label: 'Juli' },
      { value: 8, label: 'August' },
      { value: 9, label: 'September' },
      { value: 10, label: 'Oktober' },
      { value: 11, label: 'November' },
      { value: 12, label: 'Dezember' }
    ];
    return months;
  }

  isMonthDisabledForCustomPicker(partner: Partner, year: number, month: number): boolean {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    return partner.disabledMonths?.includes(key) || false;
  }

  onCustomMonthChange(partner: Partner, year: number, month: number) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    
    // Check if disabled
    if (partner.disabledMonths?.includes(key)) {
      this.errorMessage = 'Dieser Monat ist bereits vollständig ausgebucht.';
      partner.selectedMonth = '';
      return;
    }
    
    partner.selectedMonth = key;
    this.errorMessage = '';
  }

  applyCustomDate(partner: Partner) {
    if (!this.customSelectedMonth) {
      this.errorMessage = 'Bitte wählen Sie einen Monat aus.';
      return;
    }
    
    this.onCustomMonthChange(partner, this.selectedYear, parseInt(this.customSelectedMonth));
    this.customSelectedMonth = ''; // Reset after applying
  }

  getMonthLabel(monthKey: string): string {
    if (!monthKey) return '';
    const [year, month] = monthKey.split('-').map(Number);
    const months = ['', 'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    return `${months[month]} ${year}`;
  }

  checkDisabledMonth() {
    if (!this.selectedMonth) return;
    
    const [year, month] = this.selectedMonth.split('-').map(Number);
    if (this.isMonthDisabled(year, month)) {
      this.errorMessage = 'Dieser Monat ist bereits vollständig ausgebucht (20 Buchungen erreicht).';
    } else {
      this.errorMessage = '';
    }
  }

  isMonthDisabledForPartner(partner: Partner): boolean {
    if (!partner.selectedMonth) return false;
    
    const [year, month] = partner.selectedMonth.split('-').map(Number);
    const key = `${year}-${String(month).padStart(2, '0')}`;
    
    // Check partner-level disabled months
    return partner.disabledMonths?.includes(key) || false;
  }

  checkDisabledMonthForPartner(partner: Partner) {
    // Check if selected month is disabled and show appropriate message
    if (!partner.selectedMonth) return;
    
    const isDisabled = this.isMonthDisabledForPartner(partner);
    if (isDisabled && this.errorMessage !== 'Dieser Monat ist bereits vollständig ausgebucht.') {
      this.errorMessage = 'Dieser Monat ist ausgebucht';
      // Clear the selection after a short delay
      setTimeout(() => {
        partner.selectedMonth = '';
        this.errorMessage = '';
      }, 1500);
    }
  }

  // Filter functions
  toggleFilterModal() {
    this.showFilterModal = !this.showFilterModal;
  }

  closeFilterModal() {
    this.showFilterModal = false;
  }

  applyFilters() {
    let filteredPartners = [...this.allPartners];

    // Filter by city
    if (this.filters.city) {
      const cityLower = this.filters.city.toLowerCase();
      filteredPartners = filteredPartners.filter(partner => 
        partner.city.toLowerCase().includes(cityLower)
      );
    }

    // Filter by availability (placeholder for future implementation)
    if (this.filters.availability === 'available') {
      // This would check if partner has available slots
      // For now, just show all
    }

    // Filter by radius (placeholder for future implementation)
    if (this.filters.radius > 0) {
      // This would filter by distance from user's location
      // For now, just show all
    }

    this.partners = filteredPartners;
    this.cdr.detectChanges();
  }

  resetFilters() {
    this.filters = {
      availability: 'all',
      city: '',
      radius: 0
    };
    this.partners = [...this.allPartners];
    this.cdr.detectChanges();
  }

  // Map functions
  setActiveView(view: 'map' | 'list') {
    this.activeView = view;
    if (view === 'map') {
      setTimeout(() => {
        this.initializeMap();
        // Scroll to view controls (tabs) so they're at the top
        this.scrollToViewControls();
      }, 100);
    }
  }

  scrollToViewControls() {
    // Find the view controls element and scroll to it
    setTimeout(() => {
      const viewControls = document.querySelector('.view-controls');
      if (viewControls) {
        const offset = viewControls.getBoundingClientRect().top + window.pageYOffset - 80; // 80px offset for header
        window.scrollTo({
          top: offset,
          behavior: 'smooth'
        });
      }
    }, 150);
  }

  async initializeMap() {
    const mapContainer = document.getElementById('mapContainer');
    if (!mapContainer) return;

    // Clear previous map if exists
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    
    mapContainer.innerHTML = '';

    // Initialize Leaflet map centered on South Germany
    // Center: approximate center of South Germany
    const centerLat = 48.5;
    const centerLon = 9.5;
    
    this.map = L.map(mapContainer, {
      center: [centerLat, centerLon],
      zoom: 7,
      minZoom: 6,
      maxZoom: 18
    });

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(this.map);

    // Wait for map to initialize
    this.map.whenReady(() => {
      // Add markers after map is ready
      this.addMarkersToMap();
    });
  }

  async geocodeAddress(address: string, city: string, postalCode: string, country: string): Promise<[number, number] | null> {
    try {
      // Build search query for Nominatim API
      const query = `${address}, ${postalCode} ${city}, ${country}`;
      const encodedQuery = encodeURIComponent(query);
      
      // Use Nominatim API (OpenStreetMap geocoding service)
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodedQuery}&limit=1`,
        {
          headers: {
            'User-Agent': 'DigiSpots/1.0' // Required by Nominatim
          }
        }
      );
      
      if (!response.ok) {
        console.error('Geocoding failed:', response.statusText);
        return null;
      }
      
      const data = await response.json();
      
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        return [lat, lon];
      }
      
      return null;
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  }

  async addMarkersToMap() {
    if (!this.map) return;
    
    // Check if partners need geocoding (missing coordinates)
    const partnersWithoutCoords = this.partners.filter(p => !p.latitude || !p.longitude);
    
    if (partnersWithoutCoords.length > 0) {
      // Geocode missing coordinates and store them
      await this.geocodeAndStorePartners(partnersWithoutCoords);
      
      // Reload partners to get updated coordinates from database
      await this.loadPartners();
    }
    
    // Create custom icon for Leaflet using SVG from assets
    // Load SVG content from public/assets (Angular serves from public folder)
    let markerIcon: L.DivIcon;
    try {
      const response = await fetch('assets/map-marker.svg');
      if (response.ok) {
        const svgContent = await response.text();
        markerIcon = L.divIcon({
          className: 'custom-marker-icon',
          html: svgContent,
          iconSize: [24, 30],
          iconAnchor: [12, 30],
          popupAnchor: [0, -30]
        });
      } else {
        throw new Error('Failed to load marker icon');
      }
    } catch (error) {
      console.error('Error loading marker icon, using fallback:', error);
      // Fallback to inline SVG
      const fallbackSvg = `<svg width="24" height="30" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 0C5.373 0 0 5.373 0 12C0 18.627 12 30 12 30C12 30 24 18.627 24 12C24 5.373 18.627 0 12 0Z" fill="#667eea" fill-opacity="0.8"/>
        <circle cx="12" cy="12" r="4" fill="white"/>
      </svg>`;
      markerIcon = L.divIcon({
        className: 'custom-marker-icon',
        html: fallbackSvg,
        iconSize: [24, 30],
        iconAnchor: [12, 30],
        popupAnchor: [0, -30]
      });
    }
    
    // Add markers for all partners with coordinates (from database)
    this.partners.forEach(partner => {
      if (partner.latitude && partner.longitude) {
        // Ensure coordinates are numbers (they might come as strings from database)
        const lat = typeof partner.latitude === 'string' ? parseFloat(partner.latitude) : Number(partner.latitude);
        const lon = typeof partner.longitude === 'string' ? parseFloat(partner.longitude) : Number(partner.longitude);
        
        if (isNaN(lat) || isNaN(lon)) {
          console.error(`Invalid coordinates for partner ${partner.name}:`, lat, lon);
          return;
        }
        
        // Create Leaflet marker at the exact coordinates
        const marker = L.marker([lat, lon], {
          icon: markerIcon
        }).addTo(this.map!);
        
        // Create popup content with buttons
        const isFavorite = this.isFavorite(partner.id);
        const heartIcon = isFavorite ? '❤️' : '🤍';
        
        const popupContent = `
          <div class="map-popup-content" style="text-align: center; padding: 0.75rem; min-width: 200px;">
            <h4 style="margin: 0 0 0.5rem 0; font-weight: 700; color: #2d3748;">${partner.name}</h4>
            <p style="margin: 0.25rem 0; font-size: 0.85rem; color: #666;">${partner.address}</p>
            <p style="margin: 0.25rem 0 0.75rem 0; font-size: 0.85rem; color: #666;">${partner.postal_code} ${partner.city}</p>
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
              <button 
                class="map-popup-btn-book" 
                data-partner-id="${partner.id}"
                style="
                  background: #667eea; 
                  color: white; 
                  border: none; 
                  padding: 0.6rem 1rem; 
                  border-radius: 6px; 
                  cursor: pointer; 
                  font-weight: 600; 
                  font-size: 0.9rem;
                  transition: background 0.2s;
                "
                onmouseover="this.style.background='#5568d3'"
                onmouseout="this.style.background='#667eea'">
                Verfügbarkeiten
              </button>
              <button 
                class="map-popup-btn-favorite" 
                data-partner-id="${partner.id}"
                data-is-favorite="${isFavorite}"
                style="
                  background: transparent; 
                  border: 2px solid #667eea; 
                  color: #667eea; 
                  padding: 0.5rem; 
                  border-radius: 6px; 
                  cursor: pointer; 
                  font-size: 1.2rem;
                  transition: all 0.2s;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  width: 100%;
                "
                onmouseover="this.style.borderColor='#5568d3'; this.style.color='#5568d3'"
                onmouseout="this.style.borderColor='#667eea'; this.style.color='#667eea'">
                ${heartIcon}
              </button>
            </div>
          </div>
        `;
        
        // Bind popup for click
        marker.bindPopup(popupContent, {
          closeButton: true,
          className: 'map-marker-popup'
        });
        
        // Also add hover tooltip
        let tooltip: L.Popup | null = null;
        let tooltipTimeout: any = null;
        
        marker.on('mouseover', () => {
          if (tooltipTimeout) {
            clearTimeout(tooltipTimeout);
            tooltipTimeout = null;
          }
          if (!tooltip && !marker.isPopupOpen()) {
            tooltip = L.popup({
              className: 'map-marker-tooltip',
              closeButton: false,
              offset: [0, -35],
              autoClose: false,
              closeOnClick: false
            })
            .setLatLng([lat, lon])
            .setContent(popupContent)
            .openOn(this.map!);
            
            // Add button event listeners for tooltip
            setTimeout(() => {
              const tooltipElement = document.querySelector('.map-marker-tooltip');
              if (tooltipElement) {
                // Prevent tooltip from closing when hovering over it
                tooltipElement.addEventListener('mouseenter', () => {
                  if (tooltipTimeout) {
                    clearTimeout(tooltipTimeout);
                    tooltipTimeout = null;
                  }
                });
                
                tooltipElement.addEventListener('mouseleave', () => {
                  tooltipTimeout = setTimeout(() => {
                    if (!tooltipElement.matches(':hover') && tooltip) {
                      this.map!.closePopup(tooltip);
                      tooltip = null;
                    }
                  }, 100);
                });
              }
              
              const bookBtn = document.querySelector(`.map-popup-btn-book[data-partner-id="${partner.id}"]`);
              const favoriteBtn = document.querySelector(`.map-popup-btn-favorite[data-partner-id="${partner.id}"]`);
              
              if (bookBtn) {
                bookBtn.addEventListener('click', () => {
                  this.onBookNow(partner);
                  if (tooltip) {
                    this.map!.closePopup(tooltip);
                    tooltip = null;
                  }
                });
              }
              
              if (favoriteBtn) {
                favoriteBtn.addEventListener('click', () => {
                  this.toggleFavorite(partner.id);
                  const isFav = this.isFavorite(partner.id);
                  favoriteBtn.setAttribute('data-is-favorite', isFav.toString());
                  favoriteBtn.innerHTML = isFav ? '❤️' : '🤍';
                  // Recreate popup content
                  const updatedContent = `
                    <div class="map-popup-content" style="text-align: center; padding: 0.75rem; min-width: 200px;">
                      <h4 style="margin: 0 0 0.5rem 0; font-weight: 700; color: #2d3748;">${partner.name}</h4>
                      <p style="margin: 0.25rem 0; font-size: 0.85rem; color: #666;">${partner.address}</p>
                      <p style="margin: 0.25rem 0 0.75rem 0; font-size: 0.85rem; color: #666;">${partner.postal_code} ${partner.city}</p>
                      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                        <button 
                          class="map-popup-btn-book" 
                          data-partner-id="${partner.id}"
                          style="
                            background: #667eea; 
                            color: white; 
                            border: none; 
                            padding: 0.6rem 1rem; 
                            border-radius: 6px; 
                            cursor: pointer; 
                            font-weight: 600; 
                            font-size: 0.9rem;
                            transition: background 0.2s;
                          "
                          onmouseover="this.style.background='#5568d3'"
                          onmouseout="this.style.background='#667eea'">
                          Verfügbarkeiten
                        </button>
                        <button 
                          class="map-popup-btn-favorite" 
                          data-partner-id="${partner.id}"
                          data-is-favorite="${isFav}"
                          style="
                            background: transparent; 
                            border: 2px solid #667eea; 
                            color: #667eea; 
                            padding: 0.5rem; 
                            border-radius: 6px; 
                            cursor: pointer; 
                            font-size: 1.2rem;
                            transition: all 0.2s;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            width: 100%;
                          "
                          onmouseover="this.style.borderColor='#5568d3'; this.style.color='#5568d3'"
                          onmouseout="this.style.borderColor='#667eea'; this.style.color='#667eea'">
                          ${isFav ? '❤️' : '🤍'}
                        </button>
                      </div>
                    </div>
                  `;
                  if (tooltip) {
                    tooltip.setContent(updatedContent);
                  }
                });
              }
            }, 100);
          }
        });
        
        marker.on('mouseout', () => {
          // Delay closing tooltip to allow mouse to move to tooltip
          if (tooltip && !marker.isPopupOpen()) {
            tooltipTimeout = setTimeout(() => {
              // Check if mouse is still over tooltip
              const tooltipElement = document.querySelector('.map-marker-tooltip');
              if (tooltipElement && !tooltipElement.matches(':hover') && tooltip) {
                this.map!.closePopup(tooltip);
                tooltip = null;
              }
            }, 100);
          }
        });
        
        // Also handle mouse events on the tooltip itself to prevent it from closing
        marker.on('popupopen', () => {
          setTimeout(() => {
            const tooltipElement = document.querySelector('.map-marker-tooltip');
            if (tooltipElement) {
              tooltipElement.addEventListener('mouseenter', () => {
                if (tooltipTimeout) {
                  clearTimeout(tooltipTimeout);
                  tooltipTimeout = null;
                }
              });
              tooltipElement.addEventListener('mouseleave', () => {
                tooltipTimeout = setTimeout(() => {
                  if (!tooltipElement.matches(':hover') && tooltip) {
                    this.map!.closePopup(tooltip);
                    tooltip = null;
                  }
                }, 100);
              });
            }
          }, 50);
        });
        
        // Handle button clicks in popup (on click, not hover)
        marker.on('popupopen', () => {
          setTimeout(() => {
            const bookBtn = document.querySelector(`.map-popup-btn-book[data-partner-id="${partner.id}"]`);
            const favoriteBtn = document.querySelector(`.map-popup-btn-favorite[data-partner-id="${partner.id}"]`);
            
            if (bookBtn) {
              bookBtn.addEventListener('click', () => {
                this.onBookNow(partner);
                marker.closePopup();
              });
            }
            
            if (favoriteBtn) {
              favoriteBtn.addEventListener('click', () => {
                this.toggleFavorite(partner.id);
                // Update button state
                const isFav = this.isFavorite(partner.id);
                favoriteBtn.setAttribute('data-is-favorite', isFav.toString());
                favoriteBtn.innerHTML = isFav ? '❤️' : '🤍';
                // Update popup content
                const updatedContent = `
                  <div class="map-popup-content" style="text-align: center; padding: 0.75rem; min-width: 200px;">
                    <h4 style="margin: 0 0 0.5rem 0; font-weight: 700; color: #2d3748;">${partner.name}</h4>
                    <p style="margin: 0.25rem 0; font-size: 0.85rem; color: #666;">${partner.address}</p>
                    <p style="margin: 0.25rem 0 0.75rem 0; font-size: 0.85rem; color: #666;">${partner.postal_code} ${partner.city}</p>
                    <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                      <button 
                        class="map-popup-btn-book" 
                        data-partner-id="${partner.id}"
                        style="
                          background: #667eea; 
                          color: white; 
                          border: none; 
                          padding: 0.6rem 1rem; 
                          border-radius: 6px; 
                          cursor: pointer; 
                          font-weight: 600; 
                          font-size: 0.9rem;
                          transition: background 0.2s;
                        "
                        onmouseover="this.style.background='#5568d3'"
                        onmouseout="this.style.background='#667eea'">
                        Verfügbarkeiten
                      </button>
                      <button 
                        class="map-popup-btn-favorite" 
                        data-partner-id="${partner.id}"
                        data-is-favorite="${isFav}"
                        style="
                          background: transparent; 
                          border: 2px solid #667eea; 
                          color: #667eea; 
                          padding: 0.5rem; 
                          border-radius: 6px; 
                          cursor: pointer; 
                          font-size: 1.2rem;
                          transition: all 0.2s;
                          display: flex;
                          align-items: center;
                          justify-content: center;
                          width: 100%;
                        "
                        onmouseover="this.style.borderColor='#5568d3'; this.style.color='#5568d3'"
                        onmouseout="this.style.borderColor='#667eea'; this.style.color='#667eea'">
                        ${isFav ? '❤️' : '🤍'}
                      </button>
                    </div>
                  </div>
                `;
                marker.setPopupContent(updatedContent);
              });
            }
          }, 100);
        });
      }
    });
    
    // Fit map to show all markers if there are any
    const markers = this.partners.filter(p => p.latitude && p.longitude);
    if (markers.length > 0) {
      const bounds = markers.map(p => {
        const lat = typeof p.latitude === 'string' ? parseFloat(p.latitude) : Number(p.latitude);
        const lon = typeof p.longitude === 'string' ? parseFloat(p.longitude) : Number(p.longitude);
        return [lat, lon] as [number, number];
      }).filter(([lat, lon]) => !isNaN(lat) && !isNaN(lon));
      
      if (bounds.length > 0) {
        this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 10 });
      }
    }
  }

  async geocodeAndStorePartners(partners: Partner[]) {
    // Process partners in batches to avoid rate limiting
    const batchSize = 5;
    
    for (let i = 0; i < partners.length; i += batchSize) {
      const batch = partners.slice(i, i + batchSize);
      
      // Geocode batch in parallel
      const geocodePromises = batch.map(async (partner) => {
        const coords = await this.geocodeAddress(
          partner.address,
          partner.city,
          partner.postal_code,
          partner.country || 'Deutschland'
        );
        
        if (coords) {
          // Update partner in database
          try {
            await this.supabase.getClient()
              .from('partners')
              .update({
                latitude: coords[0],
                longitude: coords[1]
              })
              .eq('id', partner.id);
            
            // Update local data
            partner.latitude = coords[0];
            partner.longitude = coords[1];
          } catch (error) {
            console.error(`Failed to update coordinates for ${partner.name}:`, error);
          }
        }
      });
      
      await Promise.all(geocodePromises);
      
      // Delay between batches to respect rate limits
      if (i + batchSize < partners.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
}

