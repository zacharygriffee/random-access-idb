import {pack, rollupFromSourcePlugin} from "bring-your-own-storage-utilities/deploy";
import commonjs from "@rollup/plugin-commonjs";
import {fileURLToPath} from "bring-your-own-storage-utilities/find";
import path from "node:path";

import LocalDrive from "localdrive";
import terser from "@rollup/plugin-terser";

const p = fileURLToPath(import.meta.url);
const __dirname = path.dirname(p);

const projectFolder = new LocalDrive(path.resolve(__dirname, "./"));

await pack("./index.js", "./dist/index.min.js", {
    output: {
        banner() {
            return `
                globalThis.process = {
                    platform: "browser"
                };
            `;
        }
    },
    plugins: [
        rollupFromSourcePlugin(projectFolder),
        commonjs(),
        terser()
    ]
});

