import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the fantasy football draft room", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Fantasy Football Draft Manager<\/title>/i);
  assert.match(html, /Sunday Night Strategists/);
  assert.match(html, /Draft room/);
  assert.match(html, /Rankings/);
  assert.match(html, /League setup/);
  assert.match(html, /Best decision now/);
  assert.match(html, /Available players/);
  assert.match(html, /Deterministic engine active/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Starter Project/i);
});
