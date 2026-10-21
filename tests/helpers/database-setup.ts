import { afterAll } from "vitest";
import { closeUnusedTestDatabase, prepareTestDatabase } from "./database";

// Runtime startup belongs to environment preparation, before timed test hooks.
// Schema failures still reject setup; test, query and hook deadlines are unchanged.
await prepareTestDatabase();
afterAll(closeUnusedTestDatabase);
