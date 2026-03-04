console.log("SUPABASE URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log("SUPABASE ANON:", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.slice(0, 8));

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);