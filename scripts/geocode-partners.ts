/**
 * Script to geocode all partners without coordinates and update the database
 * Usage: npx tsx scripts/geocode-partners.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env['NG_APP_SUPABASE_URL'] || 'https://puelspyscgxsqpmealwq.supabase.co';
const SUPABASE_SERVICE_KEY = process.env['SUPABASE_SERVICE_KEY'] || '';

if (!SUPABASE_SERVICE_KEY) {
  console.error('Error: SUPABASE_SERVICE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function geocodeAddress(address: string, postalCode: string, city: string, country: string): Promise<[number, number] | null> {
  try {
    const query = `${address}, ${postalCode} ${city}, ${country}`;
    const encodedQuery = encodeURIComponent(query);
    
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodedQuery}&limit=1`,
      {
        headers: {
          'User-Agent': 'DigiSpots/1.0'
        }
      }
    );
    
    if (!response.ok) {
      console.error(`Geocoding failed: ${response.statusText}`);
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

async function main() {
  console.log('Starting geocoding process...\n');
  
  // Fetch all partners without coordinates
  const { data: partners, error: fetchError } = await supabase
    .from('partners')
    .select('id, name, address, city, postal_code, country')
    .is('latitude', null)
    .order('name', { ascending: true });
  
  if (fetchError) {
    console.error('Error fetching partners:', fetchError);
    process.exit(1);
  }
  
  if (!partners || partners.length === 0) {
    console.log('All partners already have coordinates!');
    return;
  }
  
  console.log(`Found ${partners.length} partners without coordinates\n`);
  
  // Process partners one by one (respecting rate limits)
  for (let i = 0; i < partners.length; i++) {
    const partner = partners[i];
    console.log(`[${i + 1}/${partners.length}] Geocoding: ${partner.name}...`);
    
    const coords = await geocodeAddress(
      partner.address,
      partner.postal_code,
      partner.city,
      partner.country || 'Deutschland'
    );
    
    if (coords) {
      try {
        const { error: updateError } = await supabase
          .from('partners')
          .update({
            latitude: coords[0],
            longitude: coords[1]
          })
          .eq('id', partner.id);
        
        if (updateError) {
          console.error(`  ✗ Failed to update: ${updateError.message}`);
        } else {
          console.log(`  ✓ Updated: ${coords[0]}, ${coords[1]}`);
        }
      } catch (error: any) {
        console.error(`  ✗ Failed to update: ${error.message}`);
      }
    } else {
      console.log(`  ✗ Could not geocode address`);
    }
    
    // Rate limiting: wait 1 second between requests
    if (i < partners.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log(`\n✓ Geocoding complete! Updated ${partners.length} partners.`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

