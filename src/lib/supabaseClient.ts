import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://uzoilsngvppytnhtmouo.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6b2lsc25ndnBweXRuaHRtb3VvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMjMyMzMsImV4cCI6MjA5NTU5OTIzM30.XsxmTf-hLj_yrq-88e9_pJwJh2NnDkETImDjSBfapsk';

export const supabase = createClient(supabaseUrl, supabaseKey);

