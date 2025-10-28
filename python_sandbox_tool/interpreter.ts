import { loadPyodide } from "pyodide";

export class PythonInstance {
    directory: string;
    pyodide;

    constructor(directory = "./") {
        this.directory = directory;
    } 

    async initialize_instance(): Promise<void> {
        this.pyodide = await loadPyodide();
        let mountDir = "/mnt";
        this.pyodide.FS.mkdirTree(mountDir);
        this.pyodide.FS.mount(this.pyodide.FS.filesystems.NODEFS, {root: this.directory}, mountDir)
    }

    async runFile(filename: string): Promise<{ result: unknown; stdout: string; stderr: string; }>
    {
        console.log("running")
        if (!this.pyodide) {
            await this.initialize_instance();
        }
        
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

    async checkPackages(packageNames: string[]): Promise<{ [packageName: string]: boolean }> {
        if (!this.pyodide) {
            await this.initialize_instance();
        }

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

    async installPackages(packageNames: string[]): Promise<{ [packageName: string]: { success: boolean; error?: string } }> {
        if (!this.pyodide) {
            await this.initialize_instance();
        }

        const results: { [packageName: string]: { success: boolean; error?: string } } = {};
        
        for (const packageName of packageNames) {
            try {
                await this.pyodide.loadPackage(packageName);
                results[packageName] = { success: true };
            } catch (error) {
                results[packageName] = { 
                    success: false, 
                    error: error instanceof Error ? error.message : String(error)
                };
            }
        }
        
        return results;
    }
 
}