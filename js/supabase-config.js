// ============================================================
// SUPABASE CONFIG — Keyboard Fantasia Player
// ============================================================
// 
// HOW TO SET UP:
// 1. Go to https://supabase.com and create a free project
// 2. Go to Project Settings → API
// 3. Copy your "Project URL" and "anon/public" key below
// 4. Set up Google Auth:
//    a. Go to Authentication → Providers → Google
//    b. Enable Google provider
//    c. Go to https://console.cloud.google.com
//    d. Create OAuth 2.0 Client ID (Web Application)
//    e. Add your Supabase callback URL as authorized redirect URI:
//       https://YOUR-PROJECT.supabase.co/auth/v1/callback
//    f. Copy the Client ID and Secret into Supabase Google provider settings
//
// ============================================================

var SUPABASE_CONFIG = {
  url: 'https://fgydtvjspoxhckmezykw.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZneWR0dmpzcG94aGNrbWV6eWt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNDM2NzAsImV4cCI6MjEwMDgxOTY3MH0.PMKs7g9DvaQiFbBrEsYlR8pfZlYQUo3FW2Bt51CkgJE'
};

// Initialize Supabase client (loaded from CDN in index.html)
var supabaseClient = null;

function initSupabase() {
  if (typeof supabase !== 'undefined' && supabase.createClient) {
    supabaseClient = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    console.log('✅ Supabase client initialized');
    return supabaseClient;
  } else {
    console.error('❌ Supabase JS library not loaded. Check CDN script in index.html.');
    return null;
  }
}

function getSupabase() {
  if (!supabaseClient) initSupabase();
  return supabaseClient;
}

// Check if Supabase is configured (not default placeholder values)
function isSupabaseConfigured() {
  return SUPABASE_CONFIG.url !== 'YOUR_SUPABASE_URL' && 
         SUPABASE_CONFIG.anonKey !== 'YOUR_SUPABASE_ANON_KEY' &&
         SUPABASE_CONFIG.url.includes('supabase.co');
}
