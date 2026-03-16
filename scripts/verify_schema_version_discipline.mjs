import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadJson(relPath) {
  return JSON.parse(readFileSync(resolve(process.cwd(), relPath), "utf8"));
}

const EXPECTED_SCHEMAS = {
  "assess.request.schema.json": {
    id: "https://decision-assistant.local/config/schema/assess.request.schema.json",
    title: "Decision Assistant Assess Request v1",
    root_schema_version: null,
  },
  "assess.response.schema.json": {
    id: "https://decision-assistant.local/config/schema/assess.response.schema.json",
    title: "Decision Assistant Assess Response Payload v1",
    root_schema_version: null,
  },
  "decision-log-entry.schema.json": {
    id: "https://decision-assistant.local/config/schema/decision-log-entry.schema.json",
    title: "Decision Assistant Decision Log Entry v1",
    root_schema_version: "decision-assistant/decision-log/v1",
  },
  "decision-log.schema.json": {
    id: "https://decision-assistant.local/config/schema/decision-log.schema.json",
    title: "Decision Assistant Decision Log Entry v1",
    root_schema_version: "decision-assistant/decision-log/v1",
  },
  "policy-config.schema.json": {
    id: "https://decision-assistant.local/config/schema/policy-config.schema.json",
    title: "Decision Assistant Policy Config v1",
    root_schema_version: "decision-assistant/policy-config/v1",
  },
  "receipt.schema.json": {
    id: "https://decision-assistant.local/config/schema/receipt.schema.json",
    title: "Decision Assistant Receipt Binding v1",
    root_schema_version: null,
  },
};

function normalizedSchema(schema) {
  const clone = structuredClone(schema);
  delete clone.$id;
  return clone;
}

function main() {
  const schemaDir = resolve(process.cwd(), "config/schema");
  const schemaFiles = readdirSync(schemaDir).filter((name) => name.endsWith(".json")).sort();

  assert.deepEqual(
    schemaFiles,
    Object.keys(EXPECTED_SCHEMAS).sort(),
    "config/schema contents must match the maintained version-bearing schema set"
  );

  for (const schemaFile of schemaFiles) {
    const schema = loadJson(`config/schema/${schemaFile}`);
    const expected = EXPECTED_SCHEMAS[schemaFile];

    assert.equal(schema.$id, expected.id, `${schemaFile} must keep its canonical $id`);
    assert.equal(schema.title, expected.title, `${schemaFile} must keep its maintained title`);

    const schemaVersionProperty = schema?.properties?.schema_version;
    if (expected.root_schema_version === null) {
      assert.equal(
        schemaVersionProperty,
        undefined,
        `${schemaFile} must not gain a new root schema_version field without explicit discipline updates`
      );
    } else {
      assert.equal(
        schemaVersionProperty?.const,
        expected.root_schema_version,
        `${schemaFile} must keep its root schema_version constant`
      );
    }
  }

  const decisionLogAlias = loadJson("config/schema/decision-log.schema.json");
  const decisionLogEntry = loadJson("config/schema/decision-log-entry.schema.json");
  assert.deepEqual(
    normalizedSchema(decisionLogAlias),
    normalizedSchema(decisionLogEntry),
    "decision-log schema alias files must remain content-identical apart from $id"
  );

  console.log(`[verify:schema-version-discipline] OK files=${schemaFiles.length}`);
}

main();
