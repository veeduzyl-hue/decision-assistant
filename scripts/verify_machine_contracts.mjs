import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";

function loadJson(relPath) {
  return JSON.parse(readFileSync(resolve(process.cwd(), relPath), "utf8"));
}

const ajv = new Ajv2020({ allErrors: true, strict: false });

function validateFixture(schemaPath, fixturePath) {
  const schema = loadJson(schemaPath);
  const fixture = loadJson(fixturePath);
  const validate = ajv.compile(schema);
  const ok = validate(fixture);
  assert.ok(ok, `${fixturePath} should satisfy ${schemaPath}: ${ajv.errorsText(validate.errors)}`);
}

function main() {
  validateFixture("config/schema/policy-config.schema.json", "tests/fixtures/schema/policy-config.valid.json");
  validateFixture("config/schema/receipt.schema.json", "tests/fixtures/schema/receipt.valid.json");
  validateFixture("config/schema/decision-log.schema.json", "tests/fixtures/schema/decision-log.valid.json");

  const receiptSchema = loadJson("config/schema/receipt.schema.json");
  const validateReceipt = new Ajv2020({ allErrors: true, strict: false }).compile(receiptSchema);
  const invalidReceipt = loadJson("tests/fixtures/schema/receipt.valid.json");
  delete invalidReceipt.nonce;
  assert.equal(validateReceipt(invalidReceipt), false, "receipt without nonce must fail validation");

  const decisionLogSchema = loadJson("config/schema/decision-log.schema.json");
  const validateDecisionLog = new Ajv2020({ allErrors: true, strict: false }).compile(decisionLogSchema);
  const invalidLog = loadJson("tests/fixtures/schema/decision-log.valid.json");
  delete invalidLog.receipt_id;
  assert.equal(validateDecisionLog(invalidLog), false, "receipt event without receipt_id must fail validation");

  const policySchemaText = JSON.stringify(loadJson("config/schema/policy-config.schema.json"));
  const receiptSchemaText = JSON.stringify(receiptSchema);
  const decisionLogSchemaText = JSON.stringify(decisionLogSchema);

  for (const schemaText of [policySchemaText, receiptSchemaText, decisionLogSchemaText]) {
    assert.equal(schemaText.includes("responsibility"), false, "schemas must not define responsibility contracts");
    assert.equal(schemaText.includes("boundary"), false, "schemas must not define boundary contracts");
    assert.equal(schemaText.includes("misuse_report"), false, "schemas must not define misuse_report contracts");
  }

  console.log("[verify:machine-contracts] OK");
}

main();
