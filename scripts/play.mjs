import { spawn } from "node:child_process";
import { once } from "node:events";
import process from "node:process";

const PORT = "8000";
const HOST = "0.0.0.0";
const PLAY_URL = `http://localhost:${PORT}`;

function spawnInherited(command, args) {
  return spawn(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

async function runBuild() {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const buildProcess = spawnInherited(npmCommand, ["run", "build"]);
  const [exitCode] = await once(buildProcess, "exit");

  if (exitCode !== 0) {
    process.exit(exitCode ?? 1);
  }
}

function openBrowser(url) {
  const browserCommandByPlatform = {
    darwin: ["open", [url]],
    win32: ["cmd", ["/c", "start", "", url]],
  };

  const [command, args] =
    browserCommandByPlatform[process.platform] ?? ["xdg-open", [url]];
  const browserProcess = spawn(command, args, {
    detached: true,
    stdio: "ignore",
  });
  browserProcess.unref();
}

function startPreview() {
  const previewProcess = spawn(
    process.execPath,
    [
      "./node_modules/vite/bin/vite.js",
      "preview",
      "--host",
      HOST,
      "--port",
      PORT,
    ],
    {
      stdio: ["inherit", "pipe", "pipe"],
    },
  );

  let browserOpened = false;

  previewProcess.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);

    if (!browserOpened && text.includes("Local")) {
      browserOpened = true;
      openBrowser(PLAY_URL);
    }
  });

  previewProcess.stderr.on("data", (chunk) => {
    process.stderr.write(chunk.toString());
  });

  previewProcess.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

await runBuild();
startPreview();
