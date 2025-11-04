import { loadPyodide } from "pyodide";

export class PythonInstance {
    directory: string;
    pyodide;
    cache_directory: string;

    constructor(directory = "./") {
        this.directory = directory;
        this.cache_directory = directory
    }

    async load_pyodide(): Promise<void> {
        this.pyodide = await loadPyodide({
            packageCacheDir: this.cache_directory
        });
    }

    async initialize_instance(directory = "./"): Promise<void> {
        this.directory = directory;
        let mountDir = "/mnt";
        this.pyodide.FS.mkdirTree(mountDir);
        this.pyodide.FS.mount(this.pyodide.FS.filesystems.NODEFS, {root: this.directory}, mountDir)
        console.log(this.pyodide.FS.readdir("/home"));
    }

    async runFile(filename: string, directory: string): Promise<{ result: unknown; stdout: string; stderr: string; }>
    {
        console.log("running")

        const pathInfo = this.pyodide.FS.analyzePath(filename);
        if (!pathInfo.exists) {
            throw new Error(`File not found: ${filename}`);
        }
        console.log(pathInfo)

        const stdoutChunks: string[] = [];
        const stderrChunks: string[] = [];

        const restoreStdout = this.pyodide.setStdout({
            batched: (s: string) => stdoutChunks.push(s)
        });
        const restoreStderr = this.pyodide.setStderr({
            batched: (s: string) => stderrChunks.push(s)
        });

        try {
            const code = this.pyodide.FS.readFile(filename, { encoding: "utf8" });
            const result = await this.pyodide.runPythonAsync(code);
            return {
                result,
                stdout: stdoutChunks.join(""),
                stderr: stderrChunks.join("")
            };
        } finally {
            // Restore previous stdout/stderr handlers if available
            if (typeof restoreStdout === "function") restoreStdout();
            if (typeof restoreStderr === "function") restoreStderr();
        }
    }

    async checkPackages(packageNames: string[], directory: string): Promise<{ [packageName: string]: boolean }> {
        // if (!this.pyodide) {
        //     await this.load_pyodide()
        // }

        const results: { [packageName: string]: boolean } = {};
        
        for (const packageName of packageNames) {
            try {
                // Try to import the package to check if it exists
                const code = `
try:
    import ${packageName}
    result = True
except ImportError:
    result = False
result
`;
                const exists = await this.pyodide.runPythonAsync(code);
                results[packageName] = exists;
            } catch (error) {
                // If there's an error running the code, assume package doesn't exist
                results[packageName] = false;
            }
        }
        
        return results;
    }

    async installPackages(packageNames: string[], directory: string): Promise<{ [packageName: string]: { success: boolean; error?: string } }> {
        // if (!this.pyodide) {
        //     await this.load_pyodide()
        // }
        // await this.initialize_instance(directory);
        console.log("Starting install packages")
        const results: { [packageName: string]: { success: boolean; error?: string } } = {};

        // Lazily load micropip only if needed
        let micropip: any | null = null;

        for (const packageName of packageNames) {
            console.log("starting installing " + packageName)
            // First, try pyodide's built-in packages (faster, prebuilt on CDN)
            try {
                await this.pyodide.loadPackage(packageName, );
                // Verify import works
                const ok = await this.pyodide.runPythonAsync(`\ntry:\n    import ${packageName}\n    result = True\nexcept Exception:\n    result = False\nresult\n`);
                if (ok) {
                    results[packageName] = { success: true };
                    continue;
                }
                // If import still fails, fall through to micropip
            } catch (_e) {
                // loadPackage failed; try micropip below
            }

            try {
                if (!micropip) {
                    await this.pyodide.loadPackage("micropip");
                    micropip = this.pyodide.pyimport("micropip");
                }
                await micropip.install(packageName);
                // Verify import works after install
                const ok = await this.pyodide.runPythonAsync(`\ntry:\n    import ${packageName}\n    result = True\nexcept Exception as e:\n    result = str(e)\nresult\n`);
                if (ok === true) {
                    results[packageName] = { success: true };
                } else if (ok === false) {
                    results[packageName] = { success: false, error: "import failed" };
                } else {
                    results[packageName] = { success: false, error: String(ok) };
                }
            } catch (error) {
                results[packageName] = {
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                };
            }
        }

        // Optionally, print installed packages when micropip is used
        try {
            if (micropip) {
                console.log(micropip.list());
            }
        } catch (_e) {
            // ignore listing errors
        }

        return results;
    }
 
}