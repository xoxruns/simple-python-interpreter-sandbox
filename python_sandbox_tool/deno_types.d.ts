// Minimal ambient declarations to satisfy TypeScript in non-Deno tooling
declare const Deno: any;

declare module "@oak/oak" {
  export class Application {
    use: (...middleware: any[]) => void;
    listen: (opts: { port: number }) => Promise<void>;
  }
  export class Router {
    constructor();
    post: (path: string, handler: (ctx: any) => Promise<void> | void) => Router;
    routes: () => any;
    allowedMethods: () => any;
  }
}


