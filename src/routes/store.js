import { writable } from "svelte/store";

export const selectedView = writable(null); 
// valores: "home" | "explore" | "history" | "account"
