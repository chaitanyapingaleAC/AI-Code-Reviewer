const { app, BrowserWindow, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

let mainWindow;
const servers = [];

function getServerDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "server")
    : path.join(__dirname, "server");
}

function logToFile(msg) {
  try {
    const logPath = path.join(app.getPath("userData"), "app-log.txt");
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (e) {}
  console.log(msg);
}

function spawnServer(name, scriptPath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(scriptPath)) {
      logToFile(`[${name}] FILE NOT FOUND: ${scriptPath}`);
      resolve(null);
      return;
    }

    logToFile(`[${name}] Spawning: ${scriptPath}`);

    const child = spawn(process.execPath, [scriptPath], {
      cwd: path.dirname(scriptPath),
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
      },
      windowsHide: true,
    });

    child.stdout.on("data", (d) => logToFile(`[${name}] OUT: ${d.toString().trim()}`));
    child.stderr.on("data", (d) => logToFile(`[${name}] ERR: ${d.toString().trim()}`));

    child.on("error", (err) => {
      logToFile(`[${name}] SPAWN ERROR: ${err.message}`);
    });

    child.on("exit", (code, signal) => {
      logToFile(`[${name}] EXITED with code=${code} signal=${signal}`);
    });

    servers.push(child);
    setTimeout(() => resolve(child), 800);
  });
}

async function startBackend() {
  const serverDir = getServerDir();
  logToFile(`Server directory: ${serverDir}`);
  logToFile(`Exists: ${fs.existsSync(serverDir)}`);

  if (fs.existsSync(serverDir)) {
    logToFile(`Files in server dir: ${fs.readdirSync(serverDir).join(", ")}`);
  }

  await spawnServer("Review",    path.join(serverDir, "server.js"));
  await spawnServer("Generator", path.join(serverDir, "Generator.js"));
  await spawnServer("Chat",      path.join(serverDir, "Chat.js"));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, "client", "dist", "index.html"));
  } else {
    mainWindow.loadURL("http://localhost:5173");
  }

  mainWindow.setMenuBarVisibility(false);
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  logToFile("=== APP STARTING ===");
  logToFile(`isPackaged: ${app.isPackaged}`);
  logToFile(`userData path (log location): ${app.getPath("userData")}`);

  try {
    await startBackend();
  } catch (e) {
    logToFile(`startBackend threw: ${e.message}`);
  }

  await new Promise((r) => setTimeout(r, 3000));

  createWindow();

  app.on("activate", () => {
    if (!mainWindow) createWindow();
  });
});

app.on("window-all-closed", () => {
  servers.forEach((s) => { try { s.kill(); } catch (e) {} });
  if (process.platform !== "darwin") app.quit();
});

process.on("uncaughtException", (err) => {
  logToFile(`UNCAUGHT EXCEPTION: ${err.message}\n${err.stack}`);
});