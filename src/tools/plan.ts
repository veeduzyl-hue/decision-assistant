export type PlanInput = {
    decision: any;
  };
  
  export type PlanOutput = {
    next_actions: string[];
  };
  
  export function plan(input: PlanInput): PlanOutput {
    // v0.1：先给一组“固定但合理”的行动建议；v0.2 再引入个性化规划
    const actions = [
      "定义一个 2-4 小时可完成的交付切片（可运行/可演示/可合并）。",
      "为当前重构写下“退出条件”：满足 X 则停止重构并交付。",
      "把重构任务拆成两类：必要修复（blocker）与锦上添花（debt）；先做 blocker。",
      "在提交说明中标记：本次提交是否带来可交付行为（yes/no）。连续 3 次 no 则暂停重构。",
    ];
    return { next_actions: actions };
  }
  