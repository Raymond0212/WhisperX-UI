const { app, BrowserWindow } = require('electron');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

let backendProcess = null;
let backendStopping = false;

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === 'string') {
          reject(new Error('Unable to determine free backend port.'));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForBackendHealth(baseUrl, timeoutMs = 30000) {
  const startedAt = Date.now();
  const healthUrl = `${baseUrl}/api/health`;
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        return;
      }
      lastError = new Error(`Health check failed with status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(300);
  }

  throw new Error(
    `Backend did not become healthy at ${healthUrl}: ${lastError?.message || 'unknown error'}`
  );
}

function resolvePaths() {
  if (app.isPackaged) {
    const resourcesRoot = process.resourcesPath;
    return {
      frontendDist: path.join(resourcesRoot, 'frontend', 'dist', 'index.html'),
      backendCwd: resourcesRoot,
    };
  }

  const repoRoot = path.resolve(__dirname, '..');
  return {
    frontendDist: path.join(repoRoot, 'frontend', 'dist', 'index.html'),
    backendCwd: repoRoot,
  };
}

function startBackend({ host, port, appDataDir, cwd }) {
  const args = ['run', 'python', '-m', 'whisperx_ui_backend.server'];

  const env = {
    ...process.env,
    WHISPERX_UI_DESKTOP: '1',
    WHISPERX_UI_HOST: host,
    WHISPERX_UI_PORT: String(port),
    WHISPERX_UI_APP_DATA: appDataDir,
  };

  backendProcess = spawn('uv', args, {
    cwd,
    env,
    stdio: 'inherit',
  });

  backendProcess.once('exit', (code, signal) => {
    if (!backendStopping) {
      console.error(`Backend exited unexpectedly with code=${code} signal=${signal}`);
    }
  });
}

function stopBackend() {
  if (!backendProcess || backendStopping) {
    return;
  }

  backendStopping = true;
  if (!backendProcess.killed) {
    backendProcess.kill('SIGTERM');
  }

  setTimeout(() => {
    if (backendProcess && !backendProcess.killed) {
      backendProcess.kill('SIGKILL');
    }
  }, 3000);
}

async function createMainWindow() {
  const host = '127.0.0.1';
  const port = await findFreePort();
  const apiBaseUrl = `http://${host}:${port}`;
  const appDataDir = path.join(app.getPath('userData'), 'WhisperX-UI');
  const { frontendDist, backendCwd } = resolvePaths();

  startBackend({ host, port, appDataDir, cwd: backendCwd });
  await waitForBackendHealth(apiBaseUrl);

  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: [`--whisperx-api-base-url=${apiBaseUrl}`],
    },
  });

  await mainWindow.loadFile(frontendDist);
}

app.whenReady().then(async () => {
  try {
    await createMainWindow();
  } catch (error) {
    console.error(error);
    stopBackend();
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow().catch((error) => {
        console.error(error);
        stopBackend();
        app.quit();
      });
    }
  });
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopBackend();
});

app.on('will-quit', () => {
  stopBackend();
});
