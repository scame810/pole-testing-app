import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Allow public routes
  const publicRoutes = ["/login", "/update-password", "/auth/callback", "/accept-invite"];

  if (publicRoutes.some((route) => request.nextUrl.pathname.startsWith(route))) {
    return response;
  }

  // If not logged in → send to login
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Check membership
  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // prevent caching of auth responses
  response.headers.set("Cache-Control", "private, no-store");

  return response;
  }

  export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};