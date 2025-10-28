import { Application, Router } from "@oak/oak";
import { PythonInstance } from "./interpreter";

const router = new Router();

router.post("/runscript", async (ctx) => {
  try {
    const { directory, filename } = await ctx.request.body.json();

    if (!filename) {
      ctx.response.status = 400;
      ctx.response.body = { error: "'filename' is required" };
      return;
    }

    const instance = new PythonInstance(directory ?? "./");
    const pyodidePath = filename.startsWith("/mnt") ? filename : `/mnt/${filename}`;
    const { result, stdout, stderr } = await instance.runFile(pyodidePath);

    ctx.response.status = 200;
    ctx.response.body = { result, stdout, stderr };
  } catch (err) {
    ctx.response.status = 500;
    ctx.response.body = { error: String(err?.message ?? err) };
  }
});

router.post("/checkpackages", async (ctx) => {
  try {
    const { directory, packages } = await ctx.request.body.json();

    if (!packages || !Array.isArray(packages)) {
      ctx.response.status = 400;
      ctx.response.body = { error: "'packages' array is required" };
      return;
    }

    const instance = new PythonInstance(directory ?? "./");
    const results = await instance.checkPackages(packages);

    ctx.response.status = 200;
    ctx.response.body = { results };
  } catch (err) {
    ctx.response.status = 500;
    ctx.response.body = { error: String(err?.message ?? err) };
  }
});

router.post("/installpackages", async (ctx) => {
  try {
    const { directory, packages } = await ctx.request.body.json();

    if (!packages || !Array.isArray(packages)) {
      ctx.response.status = 400;
      ctx.response.body = { error: "'packages' array is required" };
      return;
    }

    const instance = new PythonInstance(directory ?? "./");
    const results = await instance.installPackages(packages);

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

const port = Number(Deno.env.get("PORT") ?? 45555);
console.log(`Server running on http://localhost:${port}`);
await app.listen({ port });
