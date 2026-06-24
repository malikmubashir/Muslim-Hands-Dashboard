import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (process.platform === 'win32') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  // if (require('electron-squirrel-startup')) app.quit(); 
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Muslim Hands Dashboard",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // Allowed for this simple standalone app wrapper
      webSecurity: false // Often helpful for loading local file:// resources in production
    },
  });

  // Check if we are in dev mode (looking for the Vite server)
  // In a real setup, we might pass an env var, but checking connection is a simple heuristic
  const devUrl = 'http://localhost:5173';
  
  // In production, we load the built index.html
  // path join goes up one level from 'electron' folder to root, then into 'dist'
  const prodPath = path.join(__dirname, '..', 'dist', 'index.html');

  // Attempt to connect to dev server, fallback to file
  // Note: For 'npm run dist', we purely want the file.
  // We determine mode by checking if the application is packaged.
  if (!app.isPackaged) {
    mainWindow.loadURL(devUrl).catch(() => {
        // If dev server isn't running, load file
        mainWindow.loadFile(prodPath);
    });
    // Open the DevTools.
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(prodPath);
    // Hide menu bar in production for cleaner look
    mainWindow.setMenuBarVisibility(false);
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});