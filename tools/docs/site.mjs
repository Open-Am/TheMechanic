#!/usr/bin/env node
// Bundles every project document into one HTML page for review from any device.
// Usage: node tools/docs/site.mjs <output.html>
// The page renders Markdown in the browser with marked (loaded from cdnjs).

import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, dirname, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = process.argv[2];
if (!out) {
  console.error("usage: node tools/docs/site.mjs <output.html>");
  process.exit(1);
}

function walk(dir) {
  const full = join(root, dir);
  let files = [];
  for (const name of readdirSync(full).sort()) {
    const p = join(full, name);
    if (statSync(p).isDirectory()) files = files.concat(walk(join(dir, name)));
    else if (name.endsWith(".md")) files.push(join(dir, name));
  }
  return files;
}

function frontMatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: text.slice(m[0].length) };
}

const groups = [
  { title: "Start here", files: ["AGENTS.md", "CLAUDE.md", "open-am-build-brief.md", "docs/README.md", "docs/open-questions.md"] },
  { title: "Decisions", files: walk("docs/adr").filter((f) => !f.endsWith("TEMPLATE.md")) },
  { title: "Plans", files: walk("docs/plans").filter((f) => !f.endsWith("TEMPLATE.md")) },
  { title: "Releases", files: walk("docs/releases").filter((f) => !f.endsWith("TEMPLATE.md")) },
  { title: "Design", files: walk("docs/design") },
  { title: "Reference", files: walk("docs/reference") },
  { title: "Templates", files: ["docs/adr/TEMPLATE.md", "docs/plans/TEMPLATE.md", "docs/releases/TEMPLATE.md"] },
];

const docs = [];
for (const g of groups) {
  for (const f of g.files) {
    const rel = f.replace(/\\/g, "/");
    const text = readFileSync(join(root, rel), "utf8");
    const { meta, body } = frontMatter(text);
    const h1 = body.match(/^#\s+(.+)$/m);
    const id = rel.replace(/\.md$/, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    docs.push({
      id,
      group: g.title,
      path: rel,
      title: meta.title || (h1 ? h1[1] : basename(rel, ".md")),
      status: meta.status || null,
      date: meta.date || null,
      meta,
      body,
    });
  }
}

const commit = (() => {
  try {
    return readFileSync(join(root, ".git", "HEAD"), "utf8").trim();
  } catch {
    return "";
  }
})();
const generated = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
const payload = JSON.stringify({ docs, generated }).replace(/<\//g, "<\\/");

const html = `<title>Open Am Docs</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Layout: fixed left index of documents, reading column on the right; on phones the index becomes a select at the top. */
:root {
  --bg: #faf8f4; --panel: #f1ede6; --fg: #1d1a16; --muted: #6d665c; --line: #ddd6ca;
  --accent: #b8650e; --accent-soft: #f6e3c8;
  --ok: #2f6b3a; --ok-soft: #dcefdf; --warn: #8a5a00; --warn-soft: #f8e9c2; --dead: #7a7a7a; --dead-soft: #e7e4df;
  --code-bg: #efeae1;
  --sans: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, "Cascadia Mono", Consolas, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #161411; --panel: #1f1c18; --fg: #ebe6de; --muted: #a39b8f; --line: #353028;
  --accent: #e9962f; --accent-soft: #3a2a14;
  --ok: #8fd39a; --ok-soft: #1f3324; --warn: #f0c35a; --warn-soft: #3a2f10; --dead: #9a9a9a; --dead-soft: #2b2a28;
  --code-bg: #242019; color-scheme: dark;
} }
:root[data-theme="dark"] {
  --bg: #161411; --panel: #1f1c18; --fg: #ebe6de; --muted: #a39b8f; --line: #353028;
  --accent: #e9962f; --accent-soft: #3a2a14;
  --ok: #8fd39a; --ok-soft: #1f3324; --warn: #f0c35a; --warn-soft: #3a2f10; --dead: #9a9a9a; --dead-soft: #2b2a28;
  --code-bg: #242019; color-scheme: dark;
}
html, body { height: 100%; }
body { background: var(--bg); color: var(--fg); font-family: var(--sans); font-size: 16px; line-height: 1.6; margin: 0; }
.shell { display: grid; grid-template-columns: 280px minmax(0, 1fr); min-height: 100%; }
nav { background: var(--panel); border-right: 1px solid var(--line); padding-block: 20px; padding-inline: 16px; position: sticky; top: env(safe-area-inset-top, 0px); height: 100vh; overflow-y: auto; box-sizing: border-box; }
nav h1 { font-size: 15px; font-weight: 600; margin: 0 0 4px; letter-spacing: 0.02em; }
nav .gen { font-size: 12px; color: var(--muted); margin: 0 0 18px; font-family: var(--mono); }
nav h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin: 18px 0 6px; font-weight: 600; }
nav ul { list-style: none; margin: 0; padding: 0; }
nav li a { display: flex; align-items: baseline; gap: 8px; padding: 5px 8px; border-radius: 4px; color: var(--fg); text-decoration: none; font-size: 14px; line-height: 1.35; }
nav li a:hover { background: var(--accent-soft); }
nav li a.active { background: var(--accent); color: #fff; }
nav li a .num { font-family: var(--mono); font-size: 12px; color: inherit; opacity: 0.8; flex: none; }
.chip { font-size: 11px; font-family: var(--mono); padding: 1px 6px; border-radius: 3px; flex: none; margin-left: auto; }
.chip.accepted, .chip.approved, .chip.done { background: var(--ok-soft); color: var(--ok); }
.chip.proposed { background: var(--warn-soft); color: var(--warn); }
.chip.superseded, .chip.rejected, .chip.abandoned { background: var(--dead-soft); color: var(--dead); }
nav li a.active .chip { background: rgba(255,255,255,0.2); color: #fff; }
.phone-nav { display: none; }
.search { width: 100%; box-sizing: border-box; font: inherit; font-size: 14px; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); }
.search:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
nav .hint { font-size: 12px; color: var(--muted); margin: 6px 0 0; line-height: 1.4; }
nav li.hidden { display: none; }
mark { background: var(--accent-soft); color: inherit; padding: 0 2px; border-radius: 2px; }
mark.current { outline: 2px solid var(--accent); }
.results h2 { margin-top: 0; }
.result { padding: 14px 0; border-top: 1px solid var(--line); }
.result:last-child { border-bottom: 1px solid var(--line); }
.result a.title { font-weight: 600; color: var(--fg); text-decoration: none; font-size: 17px; }
.result a.title:hover { color: var(--accent); }
.result .where { font-family: var(--mono); font-size: 12px; color: var(--muted); margin-left: 8px; }
.result p { margin: 6px 0 0; font-size: 14px; color: var(--muted); max-width: 72ch; }
.result p b { font-weight: 500; color: var(--fg); }
.count { font-size: 13px; color: var(--muted); margin: 0 0 12px; }
main { padding-block: 32px 64px; padding-inline: clamp(16px, 5vw, 64px); }
article { max-width: 72ch; min-width: 0; }
.meta { display: flex; flex-wrap: wrap; gap: 8px 16px; font-family: var(--mono); font-size: 12px; color: var(--muted); margin: 0 0 20px; align-items: center; }
.meta .path { word-break: break-all; }
article h1 { font-size: 30px; line-height: 1.2; font-weight: 600; margin: 0 0 8px; text-wrap: balance; }
article h2 { font-size: 21px; margin: 36px 0 10px; font-weight: 600; text-wrap: balance; }
article h3 { font-size: 17px; margin: 24px 0 8px; font-weight: 600; }
article p, article li { max-width: 72ch; }
article a { color: var(--accent); }
article code { font-family: var(--mono); font-size: 0.88em; background: var(--code-bg); padding: 1px 5px; border-radius: 3px; }
article pre { background: var(--code-bg); padding: 14px 16px; border-radius: 6px; overflow-x: auto; font-size: 13px; line-height: 1.5; }
article pre code { background: none; padding: 0; font-size: inherit; }
.tablewrap { overflow-x: auto; margin: 14px 0; }
article table { border-collapse: collapse; font-size: 14px; min-width: 100%; }
article th, article td { border: 1px solid var(--line); padding: 7px 10px; text-align: left; vertical-align: top; }
article th { background: var(--panel); font-weight: 600; }
article blockquote { border-left: 3px solid var(--accent); margin: 14px 0; padding: 2px 16px; color: var(--muted); }
article hr { border: 0; border-top: 1px solid var(--line); margin: 28px 0; }
article input[type=checkbox] { margin-right: 6px; }
.empty { color: var(--muted); font-style: italic; }
a:focus-visible, select:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (max-width: 760px) {
  .shell { grid-template-columns: 1fr; }
  nav { display: none; }
  .phone-nav { display: block; position: sticky; top: env(safe-area-inset-top, 0px); background: var(--panel); border-bottom: 1px solid var(--line); padding-block: 10px; padding-inline: 16px; z-index: 2; }
  .phone-nav { display: grid; gap: 8px; }
  .phone-nav select { width: 100%; font: inherit; font-size: 15px; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); }
  main { padding-block: 20px 48px; }
  article h1 { font-size: 24px; }
}
@media (prefers-reduced-motion: no-preference) { nav li a { transition: background 0.12s; } }
</style>
<div class="phone-nav">
  <input id="phone-search" class="search" type="search" placeholder="Search all documents" aria-label="Search all documents" autocomplete="off">
  <select id="phone-select" aria-label="Document"></select>
</div>
<div class="shell">
  <nav id="nav"><h1>Open Am docs</h1><p class="gen" id="gen"></p>
    <input id="search" class="search" type="search" placeholder="Search all documents" aria-label="Search all documents" autocomplete="off">
    <p class="hint">Type two or more characters. Matches titles in the index and text in every document.</p>
  </nav>
  <main><article id="article"><p class="empty">Loading.</p></article></main>
</div>
<script id="docs-data" type="application/json">${payload}</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js"></script>
<script>
(function () {
  var data = JSON.parse(document.getElementById("docs-data").textContent);
  var docs = data.docs;
  var byId = {};
  docs.forEach(function (d) { byId[d.id] = d; });
  document.getElementById("gen").textContent = "generated " + data.generated;

  var nav = document.getElementById("nav");
  var select = document.getElementById("phone-select");
  var groups = [];
  docs.forEach(function (d) { if (groups.indexOf(d.group) < 0) groups.push(d.group); });
  groups.forEach(function (g) {
    var h = document.createElement("h2"); h.textContent = g; nav.appendChild(h);
    var ul = document.createElement("ul"); nav.appendChild(ul);
    var og = document.createElement("optgroup"); og.label = g; select.appendChild(og);
    var members = docs.filter(function (d) { return d.group === g; });
    if (!members.length) {
      var li = document.createElement("li"); li.className = "empty"; li.textContent = "none yet"; li.style.padding = "5px 8px"; li.style.fontSize = "13px"; ul.appendChild(li);
    }
    members.forEach(function (d) {
      var li = document.createElement("li");
      var a = document.createElement("a"); a.href = "#" + d.id; a.id = "link-" + d.id;
      var m = d.path.match(/(?:ADR-)?(\\d{4})-/);
      if (m) { var n = document.createElement("span"); n.className = "num"; n.textContent = m[1]; a.appendChild(n); }
      var t = document.createElement("span"); t.textContent = d.title; a.appendChild(t);
      if (d.status) { var c = document.createElement("span"); c.className = "chip " + d.status; c.textContent = d.status; a.appendChild(c); }
      li.appendChild(a); ul.appendChild(li);
      var opt = document.createElement("option"); opt.value = d.id;
      opt.textContent = (m ? m[1] + "  " : "") + d.title + (d.status ? "  [" + d.status + "]" : "");
      og.appendChild(opt);
    });
  });
  select.addEventListener("change", function () { location.hash = select.value; });

  marked.setOptions({ gfm: true, breaks: false });
  var renderer = new marked.Renderer();
  var baseLink = renderer.link.bind(renderer);
  renderer.link = function (href, title, text) {
    var h = typeof href === "object" ? href.href : href;
    var txt = typeof href === "object" ? href.text : text;
    if (h && !/^[a-z]+:/i.test(h) && /\\.md(#.*)?$/.test(h)) {
      var target = h.replace(/#.*$/, "").replace(/^\\.\\//, "").replace(/\\.md$/, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      var hit = docs.filter(function (d) { return d.id === target || d.id.slice(-target.length) === target; })[0];
      if (hit) return '<a href="#' + hit.id + '">' + txt + "</a>";
    }
    var out = baseLink.apply(renderer, arguments);
    return h && /^https?:/i.test(h) ? out.replace("<a ", '<a target="_blank" rel="noopener" ') : out;
  };

  function show(id) {
    var d = byId[id] || docs[0];
    var art = document.getElementById("article");
    var meta = [];
    meta.push('<span class="path">' + d.path + "</span>");
    if (d.status) meta.push('<span class="chip ' + d.status + '">' + d.status + "</span>");
    if (d.date) meta.push("<span>" + d.date + "</span>");
    if (d.meta.supersedes && d.meta.supersedes !== "[]") meta.push("<span>supersedes " + d.meta.supersedes + "</span>");
    if (d.meta.superseded_by && d.meta.superseded_by !== "null") meta.push("<span>superseded by " + d.meta.superseded_by + "</span>");
    if (d.meta.adrs) meta.push("<span>ADRs " + d.meta.adrs + "</span>");
    var html = marked.parse(d.body, { renderer: renderer });
    html = html.replace(/<table>/g, '<div class="tablewrap"><table>').replace(/<\\/table>/g, "</table></div>");
    art.innerHTML = '<div class="meta">' + meta.join("") + "</div>" + html;
    document.querySelectorAll("nav a.active").forEach(function (a) { a.classList.remove("active"); });
    var link = document.getElementById("link-" + d.id);
    if (link) { link.classList.add("active"); link.scrollIntoView({ block: "nearest" }); }
    select.value = d.id;
    document.title = d.title + " · Open Am docs";
    if (lastQuery) highlight(art, lastQuery);
    window.scrollTo(0, 0);
    var first = art.querySelector("mark");
    if (first) { first.classList.add("current"); first.scrollIntoView({ block: "center" }); }
  }

  // ---- search ----
  var inputs = [document.getElementById("search"), document.getElementById("phone-search")];
  var lastQuery = "";
  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function escRe(s) { return s.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&"); }

  function highlight(rootEl, q) {
    var re = new RegExp(escRe(q), "gi");
    var walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (n) {
      if (!re.test(n.nodeValue)) return;
      re.lastIndex = 0;
      var frag = document.createDocumentFragment(), last = 0, m, text = n.nodeValue;
      while ((m = re.exec(text))) {
        frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        var mk = document.createElement("mark"); mk.textContent = m[0]; frag.appendChild(mk);
        last = m.index + m[0].length;
      }
      frag.appendChild(document.createTextNode(text.slice(last)));
      n.parentNode.replaceChild(frag, n);
    });
  }

  function filterNav(q) {
    var lq = q.toLowerCase();
    docs.forEach(function (d) {
      var a = document.getElementById("link-" + d.id);
      if (!a) return;
      var hit = !lq || d.title.toLowerCase().indexOf(lq) >= 0 || d.path.toLowerCase().indexOf(lq) >= 0 || d.body.toLowerCase().indexOf(lq) >= 0;
      a.parentNode.classList.toggle("hidden", !hit);
    });
  }

  function snippets(body, q, max) {
    var re = new RegExp(escRe(q), "gi"), out = [], m, used = [];
    var plain = body.replace(/^---[\\s\\S]*?---\\n/, "").replace(/[#*>\`|]/g, " ").replace(/\\s+/g, " ");
    while ((m = re.exec(plain)) && out.length < max) {
      var start = Math.max(0, m.index - 70), end = Math.min(plain.length, m.index + q.length + 90);
      if (used.some(function (u) { return start < u[1] && end > u[0]; })) continue;
      used.push([start, end]);
      var s = plain.slice(start, end);
      s = esc(s).replace(new RegExp(escRe(esc(q)), "gi"), function (x) { return "<b>" + x + "</b>"; });
      out.push((start > 0 ? "… " : "") + s + (end < plain.length ? " …" : ""));
    }
    return out;
  }

  function searchAll(q) {
    var art = document.getElementById("article");
    var re = new RegExp(escRe(q), "gi");
    var hits = docs.map(function (d) {
      var n = (d.body.match(re) || []).length + (d.title.match(re) || []).length;
      return { d: d, n: n };
    }).filter(function (h) { return h.n > 0; }).sort(function (a, b) { return b.n - a.n; });
    var html = '<div class="results"><h2>Search</h2><p class="count">' +
      (hits.length ? hits.length + " document" + (hits.length === 1 ? "" : "s") + " mention “" + esc(q) + "”" : "Nothing mentions “" + esc(q) + "”") + "</p>";
    hits.forEach(function (h) {
      html += '<div class="result"><a class="title" href="#' + h.d.id + '">' + esc(h.d.title) + "</a>" +
        '<span class="where">' + esc(h.d.path) + " · " + h.n + " match" + (h.n === 1 ? "" : "es") + "</span>";
      snippets(h.d.body, q, 3).forEach(function (s) { html += "<p>" + s + "</p>"; });
      html += "</div>";
    });
    art.innerHTML = html + "</div>";
    document.querySelectorAll("nav a.active").forEach(function (a) { a.classList.remove("active"); });
    document.title = "Search · Open Am docs";
    window.scrollTo(0, 0);
  }

  function onSearch(q) {
    lastQuery = q.length >= 2 ? q : "";
    inputs.forEach(function (i) { if (i.value !== q) i.value = q; });
    filterNav(lastQuery);
    if (lastQuery) searchAll(lastQuery); else route();
  }
  inputs.forEach(function (i) {
    i.addEventListener("input", function () { onSearch(i.value.trim()); });
    i.addEventListener("keydown", function (e) { if (e.key === "Escape") { onSearch(""); i.blur(); } });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "SELECT") { e.preventDefault(); inputs[0].focus(); }
  });

  function route() {
    var id = (location.hash || "").replace(/^#/, "");
    if (!id && lastQuery) { searchAll(lastQuery); return; }
    show(id);
  }
  window.addEventListener("hashchange", route);
  route();
})();
</script>
`;
writeFileSync(out, html);
console.log(`${docs.length} documents bundled into ${relative(process.cwd(), out)}`);
