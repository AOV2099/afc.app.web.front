<script>
	import { Tooltip as TooltipPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 6,
		children,
		...restProps
	} = $props();
</script>

<TooltipPrimitive.Content
	bind:ref
	data-slot="tooltip-content"
	{sideOffset}
	class={cn(
		"z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground shadow-md data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</TooltipPrimitive.Content>
