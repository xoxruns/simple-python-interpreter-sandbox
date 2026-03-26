import { PythonInstance } from "./interpreter.ts";

type StdioRequest =
  | { id?: string | number; op: "setdirectory"; directory: string }
  | { id?: string | number; op: "runscript"; filename: string }
  | { id?: string | number; op: "checkpackages"; packages: string[] }
  | { id?: string | number; op: "installpackages"; packages: string[] }
  | { id?: string | number; op: "shutdown" };

type StdioResponse =
  | {
      id?: string | number;
      ok: true;
      data?: unknown;
      error?: never;
    }
  | {
      id?: string | number;
      ok: false;
      error: string;
      data?: never;
    };

function logErr(...args: unknown[]): void {
  try {
    console.error(...args);
  } catch {
    // Ignore any stderr write issues.
  }
}

function forceLogsToStderr(): void {
  const original = console.log.bind(console);
  console.log = (...args: unknown[]) => {
    try {
      console.error(...args);
    } catch {
      // Fall back to original behavior if stderr is unavailable.
      original(...args);
    }
  };
}

async function writeJsonLine(obj: StdioResponse): Promise<void> {
  const enc = new TextEncoder();
  await Deno.stdout.write(enc.encode(JSON.stringify(obj) + "\n"));
}

async function readJsonLines(
  onLine: (line: string) => Promise<void>,
): Promise<void> {
  const decoder = new TextDecoder();
  const reader = Deno.stdin.readable.getReader();

  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const newlineIdx = buffer.indexOf("\n");
      if (newlineIdx === -1) break;

      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);

      if (!line) continue;
      await onLine(line);
    }
  }
}

async function runStdioWorker(): Promise<void> {
  // Keep stdout reserved for JSON responses only.
  forceLogsToStderr();

  const python_sb = new PythonInstance();
  await python_sb.load_pyodide();

  let isInitialized = false;
  const SHUTDOWN = "__STDIO_WORKER_SHUTDOWN__";

  logErr("stdio worker ready");

  const handleRequest = async (line: string): Promise<void> => {
    const parsed = JSON.parse(line) as Partial<StdioRequest> & { id?: unknown };
    const id = parsed.id as string | number | undefined;

    const fail = (msg: string): StdioResponse => ({ id, ok: false, error: msg });
    const ok = (data?: unknown): StdioResponse => ({ id, ok: true, data });

    try {
      if (!parsed.op) {
        await writeJsonLine(fail("Missing 'op' field"));
        return;
      }

      switch (parsed.op) {
        case "setdirectory": {
          if (typeof parsed.directory !== "string" || !parsed.directory) {
            await writeJsonLine(fail("'directory' must be a non-empty string"));
            return;
          }
          await python_sb.initialize_instance(parsed.directory);
          isInitialized = true;
          await writeJsonLine(ok({ current_directory: parsed.directory }));
          return;
        }
        case "runscript": {
          if (!isInitialized) {
            await writeJsonLine(fail("Worker not initialized: call 'setdirectory' first"));
            return;
          }
          if (typeof parsed.filename !== "string" || !parsed.filename) {
            await writeJsonLine(fail("'filename' must be a non-empty string"));
            return;
          }

          const pyodidePath = parsed.filename.startsWith("/mnt")
            ? parsed.filename
            : `/mnt/${parsed.filename}`;
          const { result, stdout, stderr } = await python_sb.runFile(pyodidePath);
          await writeJsonLine(ok({ result, stdout, stderr }));
          return;
        }
        case "checkpackages": {
          if (!isInitialized) {
            await writeJsonLine(fail("Worker not initialized: call 'setdirectory' first"));
            return;
          }
          if (!Array.isArray((parsed as any).packages)) {
            await writeJsonLine(fail("'packages' must be an array"));
            return;
          }
          const packages = (parsed as any).packages as string[];
          const results = await python_sb.checkPackages(packages);
          await writeJsonLine(ok({ results }));
          return;
        }
        case "installpackages": {
          if (!isInitialized) {
            await writeJsonLine(fail("Worker not initialized: call 'setdirectory' first"));
            return;
          }
          if (!Array.isArray((parsed as any).packages)) {
            await writeJsonLine(fail("'packages' must be an array"));
            return;
          }
          const packages = (parsed as any).packages as string[];
          const results = await python_sb.installPackages(packages);
          await writeJsonLine(ok({ results }));
          return;
        }
        case "shutdown": {
          await writeJsonLine(ok({ bye: true }));
          throw SHUTDOWN;
        }
        default:
          await writeJsonLine(fail(`Unknown op: ${(parsed as any).op}`));
          return;
      }
    } catch (err) {
      // For shutdown we want to abort the whole worker (stop reading stdin).
      if (err === SHUTDOWN) throw err;
      await writeJsonLine(fail(String((err as any)?.message ?? err)));
    }
  };

  try {
    await readJsonLines(handleRequest);
  } catch (err) {
    if (err !== SHUTDOWN) {
      logErr("worker loop crashed:", err);
      throw err;
    }
  }
}

await runStdioWorker();

