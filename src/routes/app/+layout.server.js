import { redirect } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";

const APP_ALLOWED_ROLES = new Set(["student", "visitor"]);

function getRoleHomePath(role) {
  if (role === "admin") return "/admin/home";
  if (role === "staff") return "/staff/scanner";
  return "/app/home";
}

export function load({ cookies }) {
  const cookieCandidates = [
    env.SESSION_COOKIE_NAME,
    "afc_sid",
    "session",
    "sid",
    "connect.sid",
    "sessionId",
    "session_id"
  ].filter(Boolean);

  const hasSession = cookieCandidates.some((cookieName) => Boolean(cookies.get(cookieName)));

  if (!hasSession) {
    throw redirect(303, "/login");
  }

  const role = String(cookies.get("afc_role") || "").trim().toLowerCase();
  if (role && !APP_ALLOWED_ROLES.has(role)) {
    throw redirect(303, getRoleHomePath(role));
  }

  return { role };
}
