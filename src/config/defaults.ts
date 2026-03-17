/**
 * ============================
 * Rule Configs
 * ============================
 */

export type RefactorTimeBlackholeConfig = {
  enabled: boolean;

  // 触发阈值（默认值；未来可开放给用户编辑）
  thresholds: {
    refactor_days_without_ship: number; // 连续 refactor 天数且无交付
    refactor_commits_ratio: number; // refactor 相关提交占比
    todo_growth_ratio: number; // TODO / FIXME 增长比
    churn_ratio: number; // 代码变更抖动（重复改动）占比
  };

  // 评分权重（总和不强制 = 1；由 scoring 内部归一）
  weights: {
    ship_gap: number;
    refactor_ratio: number;
    todo_growth: number;
    churn: number;
  };

  // 输出建议文本模板（v0.1 固定；v0.2 可做模板系统）
  copy: {
    title: string;
    summary: string;
  };
};

export type AiMomentumOverrideConfig = {
  enabled: boolean;
  thresholds: {
    files_touched_warn: number;
    diff_lines_warn: number;
  };
};

/**
 * ============================
 * Guardrail Defaults
 * ============================
 *
 * 注意：
 * - 这是“默认固定值”，不是用户可调参数
 * - v0.2 保证行为可预测、可复现
 * - 后续版本可在不破坏协议的前提下开放配置
 */
export type GuardrailDefaults = {
  files_touched: {
    warn: number;
    block: number;
  };
};

/**
 * ============================
 * App Config
 * ============================
 */

export type AppConfig = {
  app: {
    name: string;
    version: string;
  };

  /**
   * Product mode:
   * - cold: Phase 1 surface (cold-first, single-hit, low-noise)
   * - full: v0.2 engine mode (can include latent rules / richer logic)
   *
   * NOTE: keep deterministic. Default is "full" so latent rules are reachable in demo.
   */
  mode?: "cold" | "full";

  rules: {
    refactor_time_blackhole: RefactorTimeBlackholeConfig;
    ai_momentum_override: AiMomentumOverrideConfig;
  };

  /**
   * Guardrail 默认阈值（v0.2 固定）
   */
  guardrail: GuardrailDefaults;

  storage: {
    artifacts_dir: string;
  };
};

/**
 * ============================
 * Default Config
 * ============================
 */

export const defaultConfig: AppConfig = {
  app: {
    name: "decision-assistant",
    version: "0.7.1",
  },

  // IMPORTANT: default to full so latent rules can run unless explicitly set to cold
  mode: "full",

  rules: {
    refactor_time_blackhole: {
      enabled: true,
      thresholds: {
        refactor_days_without_ship: 3,
        refactor_commits_ratio: 0.55,
        todo_growth_ratio: 0.3,
        churn_ratio: 0.35,
      },
      weights: {
        ship_gap: 0.35,
        refactor_ratio: 0.30,
        todo_growth: 0.20,
        churn: 0.15,
      },
      copy: {
        title: "检测到可能的“重构时间黑洞”",
        summary:
          "你可能在持续重构但缺少可交付产出。建议先收敛目标、定义可交付切片，并为重构设置明确的退出条件。",
      },
    },
    ai_momentum_override: {
      enabled: true,
      thresholds: {
        files_touched_warn: 8,
        diff_lines_warn: 400,
      },
    },
  },

  /**
   * Guardrail 默认阈值（用于 infra policy / guardrail 判定）
   */
  guardrail: {
    files_touched: {
      warn: 8,
      block: 16,
    },
  },

  storage: {
    artifacts_dir: "src/artifacts",
  },
};

// Provide default export for convenience (node -e import(...).then(m=>m.default))
export default defaultConfig;
