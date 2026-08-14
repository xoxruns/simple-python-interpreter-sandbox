import { assert, assertEquals } from "jsr:@std/assert@1";

Deno.test("stdio worker preserves stdout newlines", async () => {
  const repoRoot = decodeURIComponent(new URL("..", import.meta.url).pathname);
  const testsDir = decodeURIComponent(new URL(".", import.meta.url).pathname);
  const workerPath = `${repoRoot}/python_sandbox_tool/main_stdio.ts`;

  const enc = new TextEncoder();
  const input =
    JSON.stringify({ id: 1, op: "setdirectory", directory: testsDir }) + "\n" +
    JSON.stringify({ id: 2, op: "runscript", filename: "python_file_newlines.py" }) + "\n" +
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

  const resp2 = JSON.parse(lines[1]) as any;
  assertEquals(resp2.ok, true);

  const stdout = resp2.data.stdout as string;
  // Before the fix, stdout was a single glued line like:
  // "=== Testing standard payloads ====== Payload 1 ---Payload: ..."
  // After the fix, each print() call is on its own line.
  assert(stdout.includes("=== Testing standard payloads ==="), stdout);
  assert(stdout.includes("--- Payload 1 ---"), stdout);
  assert(stdout.includes("Context snippet: c422a7fded}"), stdout);

  // The decisive check: the original line boundaries are preserved.
  const linesInStdout = stdout.split("\n");
  assertEquals(linesInStdout[0], "=== Testing standard payloads ===");
  assertEquals(linesInStdout[1], "--- Payload 1 ---");
  assertEquals(linesInStdout[2], "Payload: <b>test</b>");
  assertEquals(linesInStdout[3], "Status: 200");
  assertEquals(linesInStdout[4], "Reflected unescaped: yes");
  assertEquals(linesInStdout[5], "Context snippet: c422a7fded}");
});
