import { BookOpen, Palette, Dumbbell, Users, Shapes, Search, Landmark, KeyRound } from 'lucide-svelte';

export const EVENT_CATEGORY_ICON_BY_KEY = {
	shapes: Shapes,
	palette: Palette,
	dumbbell: Dumbbell,
	book_open: BookOpen,
	users: Users,
	search: Search,
	landmark: Landmark,
	key_round: KeyRound
};

export function getEventCategoryIcon(iconKey, fallback = 'shapes') {
	if (!iconKey) return EVENT_CATEGORY_ICON_BY_KEY[fallback] || Shapes;
	return EVENT_CATEGORY_ICON_BY_KEY[iconKey] || EVENT_CATEGORY_ICON_BY_KEY[fallback] || Shapes;
}
