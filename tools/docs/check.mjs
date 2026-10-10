#!/usr/bin/env node
// Validates docs/adr, docs/plans and docs/releases, and the ADR index.
// Usage: node tools/docs/check.mjs [--fix]
// No dependencies. Front matter is a small YAML subset: `key: value`,
// `key: [a, b]`, `key: null`.

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fix = process.argv.includes("--fix");
const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const ADR_STATUS = new Set(["proposed", "accepted", "superseded", "rejected"]);
const PLAN_STATUS = new Set(["proposed", "approved", "done", "abandoned"]);
const ADR_FILE_RE = /^ADR-(\d{4})-[a-z0-9-]+\.md$/;
const FILE_RE = /^(\d{4})-[a-z0-9-]+\.md$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseFrontMatter(text, file) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) {
    err(`${file}: missing front matter`);
    return null;
  }
  const out = {};
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const i = line.indexOf(":");
    if (i < 0) {
      err(`${file}: bad front matter line "${line}"`);
      continue;
    }
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if (value === "null" || value === "") value = null;
    else if (value.startsWith("[")) {
      value = value
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    out[key] = value;
  }
  return out;
}

function listDocs(dir) {
  const full = join(root, "docs", dir);
  if (!existsSync(full)) return [];
  return readdirSync(full)
    .filter((f) => f.endsWith(".md") && f !== "README.md" && f !== "TEMPLATE.md")
    .sort()
    .map((f) => {
      const text = readFileSync(join(full, f), "utf8");
      return { file: `docs/${dir}/${f}`, name: f, text, fm: parseFrontMatter(text, `docs/${dir}/${f}`) };
    });
}

// ---- ADRs ----
const adrs = listDocs("adr");
const adrById = new Map();
for (const d of adrs) {
  const m = d.name.match(ADR_FILE_RE);
  if (!m) {
    err(`${d.file}: filename must be ADR-NNNN-slug.md`);
    continue;
  }
  if (!d.fm) continue;
  const id = m[1];
  if (d.fm.id !== id) err(`${d.file}: front matter id "${d.fm.id}" does not match filename`);
  if (adrById.has(id)) err(`${d.file}: duplicate ADR number ${id}`);
  adrById.set(id, d);
  if (!d.fm.title) err(`${d.file}: missing title`);
  if (!ADR_STATUS.has(d.fm.status)) err(`${d.file}: status must be one of ${[...ADR_STATUS].join(", ")}`);
  if (!DATE_RE.test(d.fm.date ?? "")) err(`${d.file}: date must be YYYY-MM-DD`);
  if (!Array.isArray(d.fm.supersedes)) err(`${d.file}: supersedes must be a list, use [] when empty`);
  if (!("superseded_by" in d.fm)) err(`${d.file}: superseded_by must be present, use null when none`);
  for (const h of ["## Context", "## Decision", "## Consequences", "## History"]) {
    if (!d.text.includes(h)) err(`${d.file}: missing section "${h}"`);
  }
}
for (const [id, d] of adrById) {
  const fm = d.fm;
  for (const s of fm.supersedes ?? []) {
    const old = adrById.get(s);
    if (!old) {
      err(`${d.file}: supersedes ${s}, which does not exist`);
      continue;
    }
    if (fm.status === "accepted") {
      if (old.fm.status !== "superseded") err(`${d.file}: is accepted and supersedes ${s}, so ${s} must have status superseded`);
      if (old.fm.superseded_by !== id) err(`${old.file}: superseded_by must be ${id}`);
    }
  }
  if (fm.superseded_by) {
    const by = adrById.get(fm.superseded_by);
    if (!by) err(`${d.file}: superseded_by ${fm.superseded_by}, which does not exist`);
    else if (!(by.fm.supersedes ?? []).includes(id)) err(`${by.file}: must list ${id} in supersedes`);
    if (fm.status !== "superseded") err(`${d.file}: has superseded_by, so status must be superseded`);
  } else if (fm.status === "superseded") {
    err(`${d.file}: status superseded but superseded_by is null`);
  }
}

// ---- Plans ----
const plans = listDocs("plans");
const planById = new Map();
for (const d of plans) {
  const m = d.name.match(FILE_RE);
  if (!m) {
    err(`${d.file}: filename must be NNNN-slug.md`);
    continue;
  }
  if (!d.fm) continue;
  const id = m[1];
  if (d.fm.id !== id) err(`${d.file}: front matter id "${d.fm.id}" does not match filename`);
  if (planById.has(id)) err(`${d.file}: duplicate plan number ${id}`);
  planById.set(id, d);
  if (!PLAN_STATUS.has(d.fm.status)) err(`${d.file}: status must be one of ${[...PLAN_STATUS].join(", ")}`);
  if (!DATE_RE.test(d.fm.date ?? "")) err(`${d.file}: date must be YYYY-MM-DD`);
  const refs = Array.isArray(d.fm.adrs) ? d.fm.adrs : [];
  if (refs.length === 0) err(`${d.file}: must name at least one ADR in adrs`);
  for (const a of refs) {
    const adr = adrById.get(a);
    if (!adr) {
      err(`${d.file}: names ADR ${a}, which does not exist`);
      continue;
    }
    if ((d.fm.status === "approved" || d.fm.status === "done") && adr.fm.status !== "accepted") {
      err(`${d.file}: is ${d.fm.status} but ADR ${a} is ${adr.fm.status}, not accepted`);
    }
  }
  for (const h of ["## Goal", "## ADRs relied on", "## Steps", "## Done when"]) {
    if (!d.text.includes(h)) err(`${d.file}: missing section "${h}"`);
  }
}

// ---- Releases ----
for (const d of listDocs("releases")) {
  if (!d.fm) continue;
  if (!/^\d+\.\d+\.\d+$/.test(d.fm.version ?? "")) err(`${d.file}: version must be MAJOR.MINOR.PATCH`);
  if (d.name !== `${d.fm.version}.md`) err(`${d.file}: filename must be ${d.fm.version}.md`);
  if (!DATE_RE.test(d.fm.date ?? "")) err(`${d.file}: date must be YYYY-MM-DD`);
  for (const p of Array.isArray(d.fm.plans) ? d.fm.plans : []) {
    if (!planById.has(p)) err(`${d.file}: names plan ${p}, which does not exist`);
  }
}

// ---- ADR index ----
const indexPath = join(root, "docs", "adr", "README.md");
const rows = [...adrById.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([id, d]) => {
    const extra = d.fm.superseded_by ? ` (superseded by ${d.fm.superseded_by})` : "";
    return `| [${id}](${d.name}) | ${d.fm.title} | ${d.fm.status}${extra} |`;
  });
const index = [
  "# ADR index",
  "",
  "Generated by `npm run docs:check -- --fix`. Do not edit by hand.",
  "",
  "Read this first. Open only the ADRs that touch your work. Status meanings: `proposed` awaits the owner; `accepted` is binding; `superseded` and `rejected` are history.",
  "",
  "| ADR | Title | Status |",
  "| --- | --- | --- |",
  ...rows,
  "",
].join("\n");
const current = existsSync(indexPath) ? readFileSync(indexPath, "utf8").replace(/\r\n/g, "\n") : "";
if (current !== index) {
  if (fix) {
    writeFileSync(indexPath, index);
    console.log("docs/adr/README.md regenerated");
  } else {
    err("docs/adr/README.md is out of date; run `npm run docs:check -- --fix`");
  }
}

// ---- Report ----
for (const w of warnings) console.warn(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
console.log(`${adrById.size} ADRs, ${planById.size} plans checked: ${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
