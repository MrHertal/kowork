import type { ComponentType } from "react";

import type { ToolProps } from "./tools/basic-tool";

export type ToolComponent = ComponentType<ToolProps>;

const state: Record<string, { name: string; render?: ToolComponent }> = {};

export function registerTool(input: { name: string; render?: ToolComponent }) {
  state[input.name] = input;
  return input;
}

export function getTool(name: string): ToolComponent | undefined {
  return state[name]?.render;
}

export const ToolRegistry = {
  register: registerTool,
  render: getTool,
};
