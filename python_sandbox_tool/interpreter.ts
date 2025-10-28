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
 
}