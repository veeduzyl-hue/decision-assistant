export type FollowupInput = {
    decision: any;
  };
  
  export type FollowupOutput = {
    questions: string[];
  };
  
  export function followup(_: FollowupInput): FollowupOutput {
    // v0.1：用最少问题补足决策信息
    return {
      questions: [
        "你最近一次“可展示/可合并”的交付是什么？大概多久之前？",
        "本轮重构的明确目标是什么？（性能/可维护性/解耦/迁移/修 bug）",
        "有没有一个功能切片可以先交付以验证方向？",
      ],
    };
  }
  