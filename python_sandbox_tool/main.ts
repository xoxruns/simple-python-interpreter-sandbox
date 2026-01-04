import { Application, Router } from "@oak/oak";
import { PythonInstance } from "./interpreter.ts";

// Safe logging that handles broken pipe errors gracefully
function safeLog(...args: unknown[]): void {
    try {
        console.log(...args);
    } catch (_e) {
        // Ignore EPIPE/broken pipe errors when stdout is closed
    }
}

const router = new Router();
const python_sb = new PythonInstance();
await python_sb.load_pyodide();

router.post("/runscript", async (ctx) => {
  try {
    const { filename } = await ctx.request.body.json();

    if (!filename) {
      ctx.response.status = 400;
      ctx.response.body = { error: "'filename' is required" };
      return;
    }

    const pyodidePath = filename.startsWith("/mnt") ? filename : `/mnt/${filename}`;
    const { result, stdout, stderr } = await python_sb.runFile(pyodidePath);

    ctx.response.status = 200;
    ctx.response.body = { result, stdout, stderr };
  } catch (err) {
    ctx.response.status = 500;
    ctx.response.body = { error: String(err?.message ?? err) };
  }
});

router.post("/setdirectory", async (ctx) => {
  try {
    const { directory } = await ctx.request.body.json()
    // set directory
    await python_sb.initialize_instance(directory);
    ctx.response.status = 200;
    ctx.response.body = { current_directory : directory }
    
  } catch (err) {
    ctx.response.status = 500;
    ctx.response.body = {
      error : String(err?.message ?? err)
    }
  }
})

router.post("/checkpackages", async (ctx) => {
  try {
    const { packages } = await ctx.request.body.json();

    if (!packages || !Array.isArray(packages)) {
      ctx.response.status = 400;
      ctx.response.body = { error: "'packages' array is required" };
      return;
    }

    const results = await python_sb.checkPackages(packages);

    ctx.response.status = 200;
    ctx.response.body = { results };
  } catch (err) {
    ctx.response.status = 500;
    ctx.response.body = { error: String(err?.message ?? err) };
  }
});

router.post("/installpackages", async (ctx) => {
  try {
    const { packages } = await ctx.request.body.json();

    if (!packages || !Array.isArray(packages)) {
      ctx.response.status = 400;
      ctx.response.body = { error: "'packages' array is required" };
      return;
    }

    const results = await python_sb.installPackages(packages);

    ctx.response.status = 200;
    ctx.response.body = { results };
  } catch (err) {
    ctx.response.status = 500;
    ctx.response.body = { error: String(err?.message ?? err) };
  }
});

const app = new Application();
app.use(router.routes());
app.use(router.allowedMethods());

const port = Number(45555);
safeLog(`Server running on http://localhost:${port}`);
await app.listen({ port });
