console.log("Happy Honda Days");
const { app, BrowserWindow, ipcMain } = require("electron/main");
const sound = require("sound-play");
const path = require("node:path");

const createWindow = () => {
  const win = new BrowserWindow({
    width: 800, // TODO Auto set this to be half-size of active screen width
    height: 600, // TODO Auto set this to be half-size of active screen height
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });
  console.log("Initializing windows on your accord");
  win.loadFile("./views/index.html");
};

app.whenReady().then(() => {
  ipcMain.handle("ping", () => "pong");
  createWindow();
  console.log("Starting engine...");
  sound.play("./audio/honda-startup.mp3", 1.0, (err) => {
    if (err) {
      console.error(
        "Sometimes hybrid/electric cars just don't make sounds: ",
        err,
      );
    }
  });
  console.log("Engine started?");

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
