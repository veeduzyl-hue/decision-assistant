export type RefactorTimeBlackholeConfig = {
    enabled: boolean;
  
    // 触发阈值（默认值可后续开放给用户编辑）
    thresholds: {
      refactor_days_without_ship: number; // 连续 refactor 天数且无交付
      refactor_commits_ratio: number; // refactor相关提交占比
      todo_growth_ratio: number; // TODO / FIXME 增长比
      churn_ratio: number; // 代码变更抖动（重复改动）占比
    };
  
    // 评分权重（总和不强制=1；由 scoring 内部归一）
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
  
  export type AppConfig = {
    app: {
      name: string;
      version: string;
    };
    rules: {
      refactor_time_blackhole: RefactorTimeBlackholeConfig;
    };
    storage: {
      artifacts_dir: string;
    };
  };
  
  export const defaultConfig: AppConfig = {
    app: {
      name: "decision-assistant",
      version: "0.1.0",
    },
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
    },
    storage: {
      artifacts_dir: "src/artifacts",
    },
  };
  