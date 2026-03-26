import { assert, assertEquals } from "jsr:@std/assert@1";

Deno.test("stdio worker: setdirectory + runscript", async () => {
  const repoRoot = decodeURIComponent(new URL("..", import.meta.url).pathname);
  const testsDir = decodeURIComponent(new URL(".", import.meta.url).pathname);
  const workerPath = `${repoRoot}/python_sandbox_tool/main_stdio.ts`;

  const enc = new TextEncoder();
  const input =
    JSON.stringify({ id: 1, op: "setdirectory", directory: testsDir }) + "\n" +
    JSON.stringify({ id: 2, op: "runscript", filename: "python_file_simple.py" }) + "\n" +
    JSON.stringify({ id: 3, op: "shutdown" }) + "\n";

  const child = new Deno.Command("deno", {
    args: [
      "run",
      "--allow-env",
      "--allow-net",
      "--allow-read",
      "--allow-write",
      workerPath,
    ],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();

  const stdinWriter = child.stdin!.getWriter();
  await stdinWriter.write(enc.encode(input));
  await stdinWriter.close();

  const stdoutTextPromise = child.stdout
    ? new Response(child.stdout).text()
    : Promise.resolve("");
  const stderrTextPromise = child.stderr
    ? new Response(child.stderr).text()
    : Promise.resolve("");

  const status = await child.status;
  const [stdoutText, stderrText] = await Promise.all([
    stdoutTextPromise,
    stderrTextPromise,
  ]);

  assertEquals(status.success, true, `worker failed: ${stderrText}`);

  const lines = stdoutText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l.startsWith("{"));

  assertEquals(lines.length >= 3, true, `unexpected stdout: ${stdoutText}`);

  const resp1 = JSON.parse(lines[0]) as any;
  const resp2 = JSON.parse(lines[1]) as any;
  const resp3 = JSON.parse(lines[2]) as any;

  assertEquals(resp1.ok, true);
  assertEquals(resp2.ok, true);
  assertEquals(resp3.ok, true);

  assert(resp2.data.stdout.includes("hello from python_file_simple.py"));
});

