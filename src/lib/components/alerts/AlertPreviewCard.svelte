<script>
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { AlertTriangle, Briefcase, Megaphone } from 'lucide-svelte';
	import { getEventCategoryStyleClasses } from '$lib/stores/eventCategoryStyles';

	export let item = {};
	let Icon = AlertTriangle;

	function iconFor(alertItem) {
		if (alertItem?.categoryIcon) return alertItem.categoryIcon;
		if (alertItem?.icon === 'briefcase') return Briefcase;
		if (alertItem?.icon === 'megaphone') return Megaphone;
		return AlertTriangle;
	}

	function categoryPaletteClasses(alertItem) {
		const key = String(alertItem?.categoryKey || 'general');
		const style = getEventCategoryStyleClasses(key);
		return `${style.bgClass} ${style.colorClass}`;
	}

	$: Icon = iconFor(item);
</script>

<Card class="rounded-2xl border">
	<CardContent class="flex gap-4 px-4 sm:px-5">
		<div class={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${categoryPaletteClasses(item)}`}>
			<Icon class="h-5 w-5" />
		</div>

		<div class="min-w-0 flex-1">
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0">
					<div class="truncate text-sm font-semibold sm:text-base">{item?.title || 'Alerta'}</div>
					{#if item?.categoryLabel}
						<Badge class={`mt-1 rounded-full ${categoryPaletteClasses(item)}`}>
							{item.categoryLabel}
						</Badge>
					{/if}
				</div>
				<div class="shrink-0 text-xs text-muted-foreground sm:text-sm">{item?.time || 'Reciente'}</div>
			</div>

			<div class="mt-1 line-clamp-2 text-sm text-muted-foreground">
				{item?.description || 'Sin descripción'}
			</div>
		</div>
	</CardContent>
</Card>
