import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

type Element = { type: unknown; props: Record<string, unknown> };
const jsx = (type: unknown, props: Element["props"]): Element => ({ type, props });
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const element = value as Element;
  return [element, ...nodes(element.props.children)];
}
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join("");
  if (value && typeof value === "object" && "props" in value) return text((value as Element).props.children);
  return typeof value === "string" ? value : "";
}

/** Render the actual phone component with controlled native-scroll progress. */
function phone(minimal: boolean) {
  const state: unknown[] = [];
  let cursor = 0, progress = 0, tree: Element;
  const source = ts.transpileModule(readFileSync(resolve(process.cwd(), "src/components/phone-story.tsx"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const testModule: { exports: unknown } = { exports: {} };
  runInNewContext(source, {
    module: testModule, exports: testModule.exports,
    require(name: string) {
      if (name === "react") return { useState(initial: unknown) {
        const i = cursor++;
        if (!(i in state)) state[i] = initial;
        return [state[i], (next: unknown) => { state[i] = typeof next === "function" ? next(state[i]) : next; }];
      } };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      if (name === "./pixel-appliance") return { PixelAppliance: "sprite" };
      if (name === "./scroll-stage") return { ScrollStage: "scroll-stage" };
      if (name.endsWith(".css")) return {};
      throw Error(name);
    },
  });
  const stage = (testModule.exports as { PhoneStory: (props: { minimal: boolean }) => Element }).PhoneStory({ minimal });
  function render(nextProgress = progress) {
    progress = nextProgress; cursor = 0;
    const child = (stage.props.children as (value: number) => Element)(progress);
    tree = (child.type as (props: Element["props"]) => Element)(child.props);
  }
  function click(label: string) {
    const button = nodes(tree).find(node => node.type === "button" && text(node).startsWith(label));
    assert.ok(button, `Expected ${label}`);
    assert.notEqual(button.props.disabled, true);
    (button.props.onClick as () => void)(); render();
  }
  render();
  return { render, click, visible: () => nodes(tree).filter(node => typeof node.props.className === "string" && node.props.className.startsWith("hm-story-message ") && node.props["aria-hidden"] === false).length };
}

test("landing phone starts empty, supports a manual step, and resumes reveal on subsequent scrolling", () => {
  const p = phone(true);
  assert.equal(p.visible(), 0);
  p.click("Next message"); assert.equal(p.visible(), 1);
  p.render(.65); assert.equal(p.visible(), 3);
  p.render(1); assert.equal(p.visible(), 4);
  p.click("Replay conversation"); assert.equal(p.visible(), 0);
  p.render(.8); assert.equal(p.visible(), 4);
});

test("existing household phone retains explicit manual mode until Follow scroll is chosen", () => {
  const p = phone(false);
  p.click("Next message"); assert.equal(p.visible(), 1);
  p.render(1); assert.equal(p.visible(), 1);
  p.click("Follow scroll"); assert.equal(p.visible(), 4);
  p.click("Restart"); assert.equal(p.visible(), 0);
  p.click("Show all"); assert.equal(p.visible(), 4);
});
