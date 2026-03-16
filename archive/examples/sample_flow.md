# v0.1 Sample Flow — Refactor Time Blackhole

## Step 1: detect_triggers
Input: archive/examples/sample_signals.json

Expected:
- returns `signals` (same as input)
- notes may be non-empty

## Step 2: assess
Input: signals from step 1

Expected:
- rule_hit.hit = true
- reasons length >= 2
- risk: present
- decision: present

## Step 3: plan
Input: decision from step 2

Expected:
- next_actions length >= 3

## Step 4: followup
Input: decision from step 2

Expected:
- questions length >= 2
