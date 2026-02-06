export type AiMomentumOverrideSignals = {
  files_touched?: number;
  diff_lines_total?: number;
  new_files?: number;
  touches_package_json?: boolean;
  touches_lockfile?: boolean;
  touched_paths?: string[];
};

export type AiMomentumOverrideBoundary = {
  timebox_minutes: 20;
  max_files: 2;
  forbid_new_deps: true;
  forbid_protected_paths: false;
};

export type AiMomentumOverrideInput = {
  intent?: string;
  signals: AiMomentumOverrideSignals;
};

export type AiMomentumOverrideResult = {
  rule_id: "r3_ai_momentum_override";
  hit: boolean;
  verdict: "REQUIRE_CONFIRM" | "ALLOW";
  reasons: string[];
  boundary: AiMomentumOverrideBoundary;
};

const GENERIC_INTENT_RE =
  /\b(refactor|cleanup|clean\s*up|optimize|improve|quick\s*fix)\b/i;
const FILE_EXT_RE =
  /\b[\w./-]+\.(ts|tsx|js|jsx|mjs|cjs|json|md|yaml|yml|toml|lock|go|py|java|rb|rs|cpp|c|h|cs|php|swift|kt)\b/i;
const PATH_TOKEN_RE =
  /\b(?:src|lib|app|packages|infra|docker|terraform)\/[\w./-]+\b/i;
const FILE_NAME_RE =
  /\b(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|npm-shrinkwrap\.json|dockerfile|docker-compose\.ya?ml|tsconfig\.json)\b/i;

const LOCKFILE_NAMES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "npm-shrinkwrap.json",
]);

const BOUNDARY = {
  timebox_minutes: 20,
  max_files: 2,
  forbid_new_deps: true,
  forbid_protected_paths: false,
} as const;

function hasFileOrModuleToken(intentLower: string): boolean {
  return (
    FILE_EXT_RE.test(intentLower) ||
    PATH_TOKEN_RE.test(intentLower) ||
    FILE_NAME_RE.test(intentLower)
  );
}

function normalizePaths(paths: string[] | undefined): string[] {
  if (!Array.isArray(paths)) return [];
  return paths.filter((p) => typeof p === "string").map((p) => p.toLowerCase());
}

function detectLockfile(pathsLower: string[]): boolean {
  return pathsLower.some((p) => LOCKFILE_NAMES.has(p.split("/").pop() ?? ""));
}

function detectPackageJson(pathsLower: string[]): boolean {
  return pathsLower.some((p) => p.endsWith("package.json"));
}

function detectBoundaryPrefixes(pathsLower: string[]): string[] {
  const prefixes = ["infra/", "docker/", "terraform/"];
  return prefixes.filter((prefix) => pathsLower.some((p) => p.includes(prefix)));
}

export const r3_ai_momentum_override = {
  rule_id: "r3_ai_momentum_override" as const,
  evaluate(input: AiMomentumOverrideInput): AiMomentumOverrideResult {
    const intentRaw = (input.intent ?? "").trim();
    const intentLower = intentRaw.toLowerCase();
    const isShort = intentRaw.length < 20;
    const isGeneric = GENERIC_INTENT_RE.test(intentLower);
    const hasToken = hasFileOrModuleToken(intentLower);
    const weakIntent = isShort || (isGeneric && !hasToken);

    const signals = input.signals ?? {};
    const filesTouched = signals.files_touched ?? 0;
    const diffLinesTotal = signals.diff_lines_total ?? 0;
    const newFiles = signals.new_files ?? 0;

    const reasons: string[] = [];
    if (weakIntent) {
      if (isShort) reasons.push(`weak_intent: intent_short(${intentRaw.length})`);
      if (isGeneric && !hasToken) reasons.push("weak_intent: generic_intent_without_target");
    }

    const amplificationReasons: string[] = [];
    if (filesTouched >= 8) {
      amplificationReasons.push(
        `amplification_high: files_touched=${filesTouched} (>= 8)`
      );
    }
    if (diffLinesTotal >= 400) {
      amplificationReasons.push(
        `amplification_high: diff_lines_total=${diffLinesTotal} (>= 400)`
      );
    }
    if (newFiles >= 6) {
      amplificationReasons.push(`amplification_high: new_files=${newFiles} (>= 6)`);
    }
    const amplificationHigh = amplificationReasons.length > 0;
    reasons.push(...amplificationReasons);

    const touchedPaths = normalizePaths(signals.touched_paths);
    const touchesPackageJson =
      signals.touches_package_json === true || detectPackageJson(touchedPaths);
    const touchesLockfile =
      signals.touches_lockfile === true || detectLockfile(touchedPaths);
    const boundaryPrefixes = detectBoundaryPrefixes(touchedPaths);

    const boundaryReasons: string[] = [];
    if (touchesPackageJson) boundaryReasons.push("boundary_cross: touches_package_json");
    if (touchesLockfile) boundaryReasons.push("boundary_cross: touches_lockfile");
    for (const prefix of boundaryPrefixes) {
      boundaryReasons.push(`boundary_cross: touched_paths includes ${prefix}`);
    }
    const boundaryCross = boundaryReasons.length > 0;
    reasons.push(...boundaryReasons);

    const hit = weakIntent && (amplificationHigh || boundaryCross);
    return {
      rule_id: "r3_ai_momentum_override",
      hit,
      verdict: hit ? "REQUIRE_CONFIRM" : "ALLOW",
      reasons,
      boundary: BOUNDARY,
    };
  },
};
