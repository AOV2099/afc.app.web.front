import { redirect } from "@sveltejs/kit";

export function load({ cookies }) {
  const session = cookies.get("session");

  if (!session) {
    throw redirect(303, "/login");
  }

  return {};
}
