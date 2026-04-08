<script>
	import { Tooltip as TooltipPrimitive } from "bits-ui";

	let { ...restProps } = $props();
</script>

<TooltipPrimitive.Root data-slot="tooltip" {...restProps} />
