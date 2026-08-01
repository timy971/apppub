const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const UI_ROOTS = ["src/routes", "src/components"];
const TRIGGER_COMPONENTS = new Set([
  "AlertDialogTrigger",
  "DialogTrigger",
  "DropdownMenuTrigger",
  "PopoverTrigger",
  "SheetTrigger",
  "TooltipTrigger",
]);
const LINK_COMPONENTS = new Set(["CopilotActionLink", "Link"]);

function collectTsxFiles() {
  const files = [];
  const visitDirectory = (relativeDirectory) => {
    const absoluteDirectory = path.join(ROOT, relativeDirectory);
    for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
      const relativePath = path.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) {
        // Les primitives UI ont leur propre contrat Radix et ne représentent
        // pas les actions métier visibles de l'application.
        if (relativePath !== "src/components/ui") visitDirectory(relativePath);
      } else if (entry.name.endsWith(".tsx")) {
        files.push(relativePath);
      }
    }
  };
  UI_ROOTS.forEach(visitDirectory);
  return files;
}

function sourceFile(relativePath) {
  return ts.createSourceFile(
    relativePath,
    fs.readFileSync(path.join(ROOT, relativePath), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function walk(node, callback) {
  callback(node);
  ts.forEachChild(node, (child) => walk(child, callback));
}

function jsxName(node, source) {
  return node.tagName.getText(source);
}

function hasAttribute(node, source, name) {
  return node.attributes.properties.some(
    (attribute) =>
      ts.isJsxAttribute(attribute) && attribute.name.getText(source) === name,
  );
}

function hasSubmitType(node, source) {
  return node.attributes.properties.some(
    (attribute) =>
      ts.isJsxAttribute(attribute) &&
      attribute.name.getText(source) === "type" &&
      attribute.initializer?.getText(source) === '"submit"',
  );
}

function hasLinkDescendant(node, source) {
  const container = ts.isJsxOpeningElement(node) && ts.isJsxElement(node.parent)
    ? node.parent
    : undefined;
  if (!container) return false;
  let found = false;
  walk(container, (child) => {
    if (
      (ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child)) &&
      LINK_COMPONENTS.has(jsxName(child, source))
    ) {
      found = true;
    }
  });
  return found;
}

function isInsideTrigger(node, source) {
  let parent = node.parent;
  while (parent) {
    if (
      ts.isJsxElement(parent) &&
      TRIGGER_COMPONENTS.has(jsxName(parent.openingElement, source))
    ) {
      return true;
    }
    parent = parent.parent;
  }
  return false;
}

function location(source, node) {
  const position = source.getLineAndCharacterOfPosition(node.getStart(source));
  return `${source.fileName}:${position.line + 1}`;
}

test("every visible button is connected to an action, link, or UI trigger", () => {
  const offenders = [];
  let inspected = 0;

  for (const relativePath of collectTsxFiles()) {
    const source = sourceFile(relativePath);
    walk(source, (node) => {
      if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) return;
      const name = jsxName(node, source);
      if (name !== "Button" && name !== "button") return;
      inspected += 1;

      const wired =
        hasAttribute(node, source, "onClick") ||
        hasSubmitType(node, source) ||
        (hasAttribute(node, source, "asChild") && hasLinkDescendant(node, source)) ||
        isInsideTrigger(node, source);
      if (!wired) offenders.push(location(source, node));
    });
  }

  assert.ok(inspected > 50, `interaction inventory unexpectedly small (${inspected})`);
  assert.deepEqual(offenders, [], `buttons without an action:\n${offenders.join("\n")}`);
});

test("all hard-coded internal destinations match a declared route", () => {
  const routeFiles = fs
    .readdirSync(path.join(ROOT, "src/routes"))
    .filter((name) => name.endsWith(".tsx"));
  const declaredRoutes = new Set(["/"]);

  for (const fileName of routeFiles) {
    const source = sourceFile(path.join("src/routes", fileName));
    walk(source, (node) => {
      if (!ts.isCallExpression(node)) return;
      if (node.expression.getText(source) !== "createFileRoute") return;
      const route = node.arguments[0];
      if (route && ts.isStringLiteral(route)) {
        declaredRoutes.add(route.text);
        // TanStack utilise `_` dans l'identifiant de fichier pour détacher
        // une route de son parent, sans l'exposer dans l'URL publique.
        declaredRoutes.add(route.text.replace(/_\//g, "/"));
      }
    });
  }

  const destinations = [];
  const internalAnchors = [];
  for (const relativePath of collectTsxFiles()) {
    const source = sourceFile(relativePath);
    walk(source, (node) => {
      if (ts.isPropertyAssignment(node)) {
        const name = node.name.getText(source).replace(/["']/g, "");
        if (
          ["route", "to", "url"].includes(name) &&
          ts.isStringLiteral(node.initializer) &&
          node.initializer.text.startsWith("/")
        ) {
          destinations.push({ value: node.initializer.text, at: location(source, node) });
        }
      }

      if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) return;
      const tag = jsxName(node, source);
      for (const attribute of node.attributes.properties) {
        if (!ts.isJsxAttribute(attribute) || !attribute.initializer) continue;
        const name = attribute.name.getText(source);
        if (!ts.isStringLiteral(attribute.initializer)) continue;
        const value = attribute.initializer.text;
        if (tag === "Link" && name === "to" && value.startsWith("/")) {
          destinations.push({ value, at: location(source, node) });
        }
        if (tag === "a" && name === "href" && value.startsWith("/")) {
          internalAnchors.push(location(source, node));
        }
      }
    });
  }

  const unknown = destinations.filter(({ value }) => !declaredRoutes.has(value));
  assert.deepEqual(
    unknown,
    [],
    `unknown internal routes:\n${unknown.map((item) => `${item.at} -> ${item.value}`).join("\n")}`,
  );
  assert.deepEqual(
    internalAnchors,
    [],
    `internal navigation must use TanStack Link (Electron hash history):\n${internalAnchors.join("\n")}`,
  );
});

test("the project cockpit route is a root-level route", () => {
  const nestedRoute = path.join(ROOT, "src/routes/projects.$id.tsx");
  const cockpitRoute = path.join(ROOT, "src/routes/projects_.$id.tsx");
  assert.equal(fs.existsSync(nestedRoute), false, "the cockpit must not be nested below the projects list");
  assert.equal(fs.existsSync(cockpitRoute), true, "the non-nested cockpit route is missing");

  const generatedTree = fs.readFileSync(path.join(ROOT, "src/routeTree.gen.ts"), "utf8");
  assert.match(
    generatedTree,
    /const ProjectsIdRoute = ProjectsIdRouteImport\.update\(\{[\s\S]*?getParentRoute: \(\) => rootRouteImport/,
    "the generated route tree must attach the cockpit directly to the root route",
  );
});
