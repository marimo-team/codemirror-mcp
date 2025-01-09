import { defineConfig } from "vitest/config";

export default defineConfig({
	root: process.env.VITEST ? "." : "demo",
	test: {
		environment: "jsdom",
		coverage: {
			enabled: true,
			include: ["src/**"],
			exclude: ["demo/**", "scripts/**"],
			reportOnFailure: true,
			reporter: ["text", "html", "json-summary", "json"],
		},
	},
	base: "/codemirror-mcp/",
});
