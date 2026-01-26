import { json } from "@sveltejs/kit";

export async function POST({ cookies }) {
  // ✅ sesión dummy (siempre válida)
  cookies.set("session", "dev-ok", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: false, // pon true cuando uses https
    maxAge: 60 * 60 * 24 * 7
  });

  return json({ ok: true });
}
