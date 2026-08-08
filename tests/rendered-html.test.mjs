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
  assert.match(html, /<title>Draft Intelligence — Fantasy Football Draft Manager<\/title>/i);
  assert.match(html, /Trip/);
  assert.match(html, /Draft Room/);
  assert.match(html, /Mock Lab/);
  assert.match(html, /Offline Bridge/);
  assert.match(html, /Rankings/);
  assert.match(html, /League Setup/);
  assert.match(html, /Best decision now/);
  assert.match(html, /Risk profile/);
  assert.match(html, /Decision Engine v2/);
  assert.match(html, /Draft now versus wait comparison/);
  assert.match(html, /Best overall/);
  assert.match(html, /Position pivot/);
  assert.match(html, /Completed roster forecast/);
  assert.match(html, /Available players/);
  assert.match(html, /Draft event log active/);
  assert.match(html, /Offline companion ready/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Starter Project/i);
});
