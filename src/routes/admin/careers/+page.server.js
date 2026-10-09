import { redirect } from '@sveltejs/kit';

export async function load({ parent }) {
	const { user } = await parent();
	if (Number(user?.career_id ?? user?.careerId) !== 1) {
		throw redirect(303, '/admin/home');
	}
	return {};
}
