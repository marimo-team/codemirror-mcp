import { StateEffect, type StateEffectType, StateField } from "@codemirror/state";
import type { Prompt, Resource } from "@modelcontextprotocol/sdk/types.js";

type ResourceURI = string;
type ResourceMap = Map<ResourceURI, Resource>;

// Effect to update resources
export const updateResources: StateEffectType<ResourceMap> = StateEffect.define<ResourceMap>();

// StateField to track resources
export const resourcesField: StateField<ResourceMap> = StateField.define<ResourceMap>({
	create() {
		return new Map<ResourceURI, Resource>();
	},
	update(oldResources, tr) {
		for (const e of tr.effects) {
			if (e.is(updateResources)) {
				// merge resources
				const newResources = new Map<ResourceURI, Resource>(oldResources);
				for (const [resourceURI, resource] of e.value) {
					newResources.set(resourceURI, resource);
				}
				return newResources;
			}
		}
		return oldResources;
	},
});

export type ResourceClickHandler = (resource: Resource) => void;

export const resourceClickHandlerField = StateField.define<ResourceClickHandler | null>({
	create() {
		return null;
	},
	update(value) {
		return value;
	},
});

type PromptMap = Map<string, Prompt>;

// Effect to update prompts
export const updatePrompts = StateEffect.define<PromptMap>();

// StateField to track prompts
export const promptsField = StateField.define<PromptMap>({
	create() {
		return new Map<string, Prompt>();
	},
	update(oldPrompts, tr) {
		for (const e of tr.effects) {
			if (e.is(updatePrompts)) {
				// merge prompts
				const newPrompts = new Map<string, Prompt>(oldPrompts);
				for (const [name, prompt] of e.value) {
					newPrompts.set(name, prompt);
				}
				return newPrompts;
			}
		}
		return oldPrompts;
	},
});
