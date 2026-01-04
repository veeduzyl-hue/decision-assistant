export type Decision = "SHIP" | "SCOPED_REFACTOR" | "HARD_REFACTOR";

export interface Signals {
  structure: {
    hot_files: string[];
    duplicated_logic_hint?: boolean;
    module_boundary_smell?: boolean;
  };
  evolution: {
    refactor_days: number;
    no_user_feature_delivery_days: number;
    refactor_commits_ratio: number;
    refactor_scope_expanding?: boolean;
    todo_count_in_refactor_area_increasing?: boolean;
    files_touched_per_change_median: number;
    same_module_touch_count_14d: number;
    rollback_or_rework_events_14d: number;
    todo_fixme_density_hotspot: number;
    decision_file_missing: boolean;
    decision_file_invalid: boolean;
  };
  complexity: {
    branching_growth_hint?: boolean;
    parameter_bloat_hint?: boolean;
    workaround_comment_hint?: boolean;
  };
}

export interface Answers {
  feature_lead_time_trend?: "DOWN" | "FLAT" | "UP" | "UNKNOWN";
  fear_of_touching_hotspot?: boolean;
  expected_next_feature_similarity?: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  timebox_weeks?: number;
}

