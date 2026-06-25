import { createClient } from '@supabase/supabase-js';

// Supabase connection. The anon key is public by design (protected by RLS) and
// is safe to ship in the client bundle. The service_role key is NEVER used here.
export const SUPABASE_URL = 'https://rzuwhjusecbsczigskyw.supabase.co';
const SUPABASE_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6dXdoanVzZWNic2N6aWdza3l3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNjY3NjMsImV4cCI6MjA5Nzk0Mjc2M30.UT8sjyyhUsfOFlxb4oWeyCYqJ5KE4XRLVL3iHmPHR_8';

export const WORLD_ID = 'main'; // single shared world for now

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  realtime: { params: { eventsPerSecond: 20 } },
});
