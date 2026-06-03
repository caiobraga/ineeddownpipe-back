import type { Product } from "./types.js";

/** Chassis / platform codes parsed from retailer titles. */
export type ChassisTag =
  | "e8x"
  | "e9x"
  | "f20"
  | "f21"
  | "f22"
  | "f23"
  | "f30"
  | "f31"
  | "f32"
  | "f33"
  | "f34"
  | "f36"
  | "f39"
  | "f80"
  | "f82"
  | "f87"
  | "f3x"
  | "f8x"
  | "g20"
  | "g21"
  | "g22"
  | "g23"
  | "g26"
  | "g28"
  | "g30"
  | "g42"
  | "g8x"
  | "g80"
  | "g82"
  | "g87"
  | "g01"
  | "g02"
  | "f10"
  | "f12"
  | "f15"
  | "f16"
  | "f25"
  | "f26"
  | "f48"
  | "f54"
  | "f57"
  | "a90";

/** Engine families parsed from titles. */
export type EngineTag =
  | "b58"
  | "b58tu"
  | "b58a"
  | "b46"
  | "b48"
  | "n55"
  | "n54"
  | "n20"
  | "n26"
  | "s55"
  | "s58"
  | "n63"
  | "n63tu";

export interface ProductFitment {
  chassis: ChassisTag[];
  engines: EngineTag[];
  /** True when title lists several distinct models / platforms. */
  multiModel: boolean;
}

export interface VehiclePreset {
  id: string;
  label: string;
  chassis: ChassisTag[];
  engines: EngineTag[];
  /** Also match inferred catalog model string (e.g. M340i/M440i (B58)). */
  modelHints: string[];
}

export const VEHICLE_PRESETS: VehiclePreset[] = [
  {
    id: "g20-b58-2022",
    label: "2022 G20/G30 340i · M340i (B58)",
    chassis: ["g20", "g21", "g22", "g23", "g26", "g30", "f30", "f3x"],
    engines: ["b58", "b58tu", "b58a"],
    modelHints: ["b58", "m340", "340i", "m440"],
  },
  {
    id: "g20-b48-2022",
    label: "2022 G20/G30 330i · M330i (B46/B48)",
    chassis: ["g20", "g21", "g22", "g23", "g30", "f30", "f3x"],
    engines: ["b46", "b48"],
    modelHints: ["b46", "b48", "330i", "430i", "g20"],
  },
  {
    id: "f30-n55",
    label: "F30/F31 335i · 340i (N55)",
    chassis: ["f30", "f31", "f32", "f33", "f34", "f36", "f3x"],
    engines: ["n55"],
    modelHints: ["n55", "335", "435"],
  },
  {
    id: "f30-n20",
    label: "F30 320i · 328i · 428i (N20/N26)",
    chassis: ["f30", "f31", "f32", "f33", "f34", "f36", "f22", "f23", "f3x"],
    engines: ["n20", "n26"],
    modelHints: ["n20", "n26", "320", "328", "428", "228"],
  },
  {
    id: "f8x-s55",
    label: "F8x M2/M3/M4 (S55)",
    chassis: ["f22", "f23", "f30", "f32", "f33", "f36", "f80", "f82", "f87", "f8x"],
    engines: ["s55"],
    modelHints: ["s55", "f8x", "m3", "m4"],
  },
  {
    id: "g8x-s58",
    label: "G8x M2/M3/M4 (S58)",
    chassis: ["g20", "g22", "g26", "g42", "g80", "g82", "g87", "g8x"],
    engines: ["s58"],
    modelHints: ["s58", "g8x", "m2", "m3", "m4"],
  },
  {
    id: "supra-b58",
    label: "Toyota Supra GR / A90 (B58)",
    chassis: ["a90"],
    engines: ["b58", "b58tu"],
    modelHints: ["supra", "a90", "b58"],
  },
];

const CHASSIS_PATTERNS: Array<{ tag: ChassisTag; re: RegExp }> = [
  { tag: "f3x", re: /\bf3x\b/i },
  { tag: "f8x", re: /\bf8x\b/i },
  { tag: "g8x", re: /\bg8x\b/i },
  { tag: "e8x", re: /\be8x\b/i },
  { tag: "e9x", re: /\be9x\b/i },
  { tag: "g20", re: /\bg20\b/i },
  { tag: "g21", re: /\bg21\b/i },
  { tag: "g22", re: /\bg22\b/i },
  { tag: "g23", re: /\bg23\b/i },
  { tag: "g26", re: /\bg26\b/i },
  { tag: "g28", re: /\bg28\b/i },
  { tag: "g30", re: /\bg30\b/i },
  { tag: "g42", re: /\bg42\b/i },
  { tag: "g01", re: /\bg0?1\b/i },
  { tag: "g02", re: /\bg0?2\b/i },
  { tag: "f30", re: /\bf30\b/i },
  { tag: "f31", re: /\bf31\b/i },
  { tag: "f32", re: /\bf32\b/i },
  { tag: "f33", re: /\bf33\b/i },
  { tag: "f34", re: /\bf34\b/i },
  { tag: "f36", re: /\bf36\b/i },
  { tag: "f39", re: /\bf39\b/i },
  { tag: "f22", re: /\bf22\b/i },
  { tag: "f23", re: /\bf23\b/i },
  { tag: "f20", re: /\bf20\b/i },
  { tag: "f21", re: /\bf21\b/i },
  { tag: "f80", re: /\bf80\b/i },
  { tag: "f82", re: /\bf82\b/i },
  { tag: "f87", re: /\bf87\b/i },
  { tag: "f10", re: /\bf10\b/i },
  { tag: "f12", re: /\bf12\b/i },
  { tag: "f15", re: /\bf15\b/i },
  { tag: "f16", re: /\bf16\b/i },
  { tag: "f25", re: /\bf25\b/i },
  { tag: "f26", re: /\bf26\b/i },
  { tag: "f48", re: /\bf48\b/i },
  { tag: "f54", re: /\bf54\b/i },
  { tag: "f57", re: /\bf57\b/i },
  { tag: "a90", re: /\b(a90|supra)\b/i },
];

const ENGINE_PATTERNS: Array<{ tag: EngineTag; re: RegExp }> = [
  { tag: "b58tu", re: /\bb58\s*tu\b/i },
  { tag: "b58a", re: /\bb58\s*a\b/i },
  { tag: "b58", re: /\bb58\b/i },
  { tag: "b48", re: /\bb48\b/i },
  { tag: "b46", re: /\bb46\b/i },
  { tag: "n63tu", re: /\bn63\s*tu\b/i },
  { tag: "n63", re: /\bn63\b/i },
  { tag: "s58", re: /\bs58\b/i },
  { tag: "s55", re: /\bs55\b/i },
  { tag: "n55", re: /\bn55\b/i },
  { tag: "n54", re: /\bn54\b/i },
  { tag: "n26", re: /\bn26\b/i },
  { tag: "n20", re: /\bn20\b/i },
];

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

export function extractFitment(title: string, catalogModel = ""): ProductFitment {
  const text = `${title} ${catalogModel}`;
  const chassis: ChassisTag[] = [];
  const engines: EngineTag[] = [];

  for (const { tag, re } of CHASSIS_PATTERNS) {
    if (re.test(text)) chassis.push(tag);
  }

  for (const { tag, re } of ENGINE_PATTERNS) {
    if (re.test(text)) engines.push(tag);
  }

  // Broad retailer wording
  if (/\ball\s+1\s*\/\s*2\s*\/\s*3/i.test(text) || /\b1\/2\/3\/4\/5\/6\/7\s+series\b/i.test(text)) {
    if (!chassis.includes("g20")) chassis.push("g20");
    if (!chassis.includes("f30")) chassis.push("f30");
  }

  const commaParts = title.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const multiModel =
    commaParts.length >= 3 ||
    unique(chassis).length >= 2 ||
    /\b(f22|f30|f32|g20|g22|e9x|e8x|f3x|g8x|f8x).*,.*\b(f22|f30|f32|g20|g22|e9x|e8x|f3x|g8x|f8x)\b/i.test(
      title
    ) ||
    /\b(m240i|340i|440i|335i|330i|228i|320i|328i|428i|135i).*,/i.test(title);

  return {
    chassis: unique(chassis),
    engines: unique(engines),
    multiModel,
  };
}

export function enrichProductFitment(product: Product): Product {
  const fitment = extractFitment(product.title, product.model);
  return {
    ...product,
    fitmentChassis: fitment.chassis,
    fitmentEngines: fitment.engines,
    multiModelFit: fitment.multiModel,
  };
}

function matchesEngine(product: Product, engines: EngineTag[]): boolean {
  if (engines.length === 0) return true;
  const tags = product.fitmentEngines ?? [];
  if (tags.some((t) => engines.includes(t as EngineTag))) return true;
  const blob = `${product.title} ${product.model}`.toLowerCase();
  return engines.some((e) => blob.includes(e));
}

function matchesChassis(product: Product, chassis: ChassisTag[]): boolean {
  if (chassis.length === 0) return true;
  const tags = product.fitmentChassis ?? [];
  if (tags.some((t) => chassis.includes(t as ChassisTag))) return true;
  const blob = `${product.title} ${product.model}`.toLowerCase();
  return chassis.some((c) => blob.includes(c));
}

export function matchesVehiclePreset(product: Product, presetId: string): boolean {
  const preset = VEHICLE_PRESETS.find((p) => p.id === presetId);
  if (!preset) return true;

  const engineOk = matchesEngine(product, preset.engines);
  const chassisOk = matchesChassis(product, preset.chassis);
  const modelBlob = `${product.model} ${product.title}`.toLowerCase();
  const modelOk = preset.modelHints.some((h) => modelBlob.includes(h));

  return engineOk && (chassisOk || modelOk);
}

export function getFitmentMeta(products: Product[]) {
  const chassis = new Set<ChassisTag>();
  const engines = new Set<EngineTag>();
  let multiModel = 0;

  for (const p of products) {
    for (const c of p.fitmentChassis ?? []) chassis.add(c as ChassisTag);
    for (const e of p.fitmentEngines ?? []) engines.add(e as EngineTag);
    if (p.multiModelFit) multiModel++;
  }

  return {
    chassis: [...chassis].sort(),
    engines: [...engines].sort(),
    vehiclePresets: VEHICLE_PRESETS.map(({ id, label }) => ({ id, label })),
    multiModelCount: multiModel,
  };
}
