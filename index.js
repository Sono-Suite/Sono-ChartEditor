/*
This specific launcher is open-source, but the Sonolus Server is governed under the Nexint TOS.
Sono-Overlay is under the AGPL-v3.
This program is simply a wrapper that makes calling Sono-Overlay easier for the user,
as well as unifies all Sonolus utilities into one megapackage.
*/

const { spawn, execSync } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { release } = require('os');
const ver = "1.0.0"

const MENU_ITEMS = [
  '1. Miku Miku World',
  '2. Supernova',
  'Update All Subsystems', // Added Update Option
  'Exit Sub Menu'
];

let selectedIndex = 0;
let activeChildStdin = null;

// Define the process directory
// Just to sync up the process of making a new directory.
try {
  process.chdir(__dirname);
  console.log(`New directory: ${process.cwd()}`);
} catch (err) {
  console.error(`Error changing directory: ${err}`);
}

function onRawConsoleDataInput(chunk) {
  if (activeChildStdin && activeChildStdin.writable) {
    activeChildStdin.write(chunk);
    return;
  }

  const key = chunk.toString();

  if (key === '\u001b[A' || key === '\u001bOA') {
    selectedIndex = (selectedIndex - 1 + MENU_ITEMS.length) % MENU_ITEMS.length;
    renderMenu();
  } else if (key === '\u001b[B' || key === '\u001bOB') {
    selectedIndex = (selectedIndex + 1) % MENU_ITEMS.length;
    renderMenu();
  } else if (key === '\r' || key === '\n') {
    handleSelection(MENU_ITEMS[selectedIndex]);
  } else if (key === '\u0003') {
    process.exit(0);
  }
}

function initMenuInputEngine() {
  activeChildStdin = null;
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.removeListener('data', onRawConsoleDataInput);
  process.stdin.on('data', onRawConsoleDataInput);
}

function handleSelection(label) {
  process.stdout.write('\x1b[2J\x1b[0;0H');
  const workingDir = process.pkg ? path.dirname(process.execPath) : __dirname;

  const dir = path.join(workingDir, 'server');

  if (label === 'Exit Sub Menu') process.exit(0);
  if (label === 'Update All Subsystems') {
    const allTools = ['mmw', 'supernova'];
    console.log(`\x1b[95m--- Initializing Global System Update Loop ---\x1b[0m\n`);

    const triggerSequentialUpdate = (index) => {
      if (index >= allTools.length) {
        console.log(`\x1b[32m[Success]: All core systems up to date!\x1b[0m\n`);
        returnToMenu();
        return;
      }
      // Pass 'true' to force download and overwrite local files
      verifyAssetDependency(workingDir, allTools[index], () => {
        triggerSequentialUpdate(index + 1);
      }, true);
    };

    triggerSequentialUpdate(0);
    return;
  } else if (label === '1. Miku Miku World') {
    const mmwDir = path.join(workingDir, 'MikuMikuWorld');
    const binaryName = process.platform === 'win32' ? 'MikuMikuWorld.exe' : 'MikuMikuWorld';
    const overlayPath = path.join(mmwDir, binaryName);

    // Call the dynamic loader passing false so it runs instantly if present
    verifyAssetDependency(workingDir, 'mmw', () => {
      startSonoOverlayProcess(mmwDir, overlayPath);
    }, false);
    return;
  } else if (label === '2. Supernova') {
    const mmwDir = path.join(workingDir, 'Supernova-win64');
    const binaryName = process.platform === 'win32' ? 'Supernova.exe' : 'Supernova';
    const overlayPath = path.join(mmwDir, binaryName);

    // Call the dynamic loader passing false so it runs instantly if present
    verifyAssetDependency(workingDir, 'supernova', () => {
      startSonoOverlayProcess(mmwDir, overlayPath);
    }, false);
    return;
  }
}

// Hardened, production-ready configuration dependency router
function verifyAssetDependency(workingDir, assetKey, onReadyCallback, forceDownload = false) {
  const mmwDir = path.join(workingDir, `MikuMikuWorld`);
  const superNovaDir = path.join(workingDir, `Supernova-win64`);
  const isWin = process.platform === 'win32';

  const ASSET_MANIFESTS = {
    'mmw': {
      repo: 'Sono-Suite/MikuMikuWorld-Archive',
      binary: isWin ? 'MikuMikuWorld.exe' : 'MikuMikuWorld',
      targetDir: mmwDir,
      getPattern: () => '.zip',
      extract: (tmp, dest) => {
        console.log(`Extraction in progress...`);
        if (isWin) {
          execSync(`powershell -Command "Expand-Archive -Path '${tmp}' -DestinationPath '${workingDir}' -Force"`);
        } else {
          // Safeguard: Verify system zip capability before spawning process loops
          try {
            execSync(`unzip -v`, { stdio: 'ignore' });
            execSync(`unzip -o "${tmp}" -d "${mmwDir}"`);
          } catch (e) {
            throw new Error("Missing system dependency: 'unzip' utility is required on this system profile. Please install it.");
          }
        }
      }
    },
    'supernova': {
      repo: 'Purplaxo/SupernovaEditor',
      binary: isWin ? 'Supernova.exe' : 'Supernova',
      targetDir: superNovaDir,
      getPattern: () => isWin ? '-win64.zip' : '-linux-x86_64.AppImage',
      extract: (tmp, dest) => {
        console.log(`Extraction in progress...`);
        if (isWin) {
          execSync(`powershell -Command "Expand-Archive -Path '${tmp}' -DestinationPath '${workingDir}' -Force"`);
        } else {
          // Safeguard: Verify system zip capability before spawning process loops
          try {
            execSync(`unzip -v`, { stdio: 'ignore' });
            execSync(`unzip -o "${tmp}" -d "${workingDir}"`);
          } catch (e) {
            throw new Error("Missing system dependency: 'unzip' utility is required on this system profile. Please install it.");
          }
        }
      }
    },
  };

  const manifest = ASSET_MANIFESTS[assetKey];
  const targetPath = path.join(manifest.targetDir, manifest.binary);

  if (fs.existsSync(targetPath) && !forceDownload) {
    onReadyCallback();
    return;
  }

  if (fs.existsSync(manifest.targetDir) && !forceDownload) {
    onReadyCallback();
    return;
  }

  console.log(`\x1b[33m[Notice]: ${forceDownload ? 'Updating' : 'Missing'} ${assetKey.toUpperCase()} component. Reaching GitHub API...\x1b[0m\n`);
  try { fs.mkdirSync(manifest.targetDir, { recursive: true }); } catch (e) { }

  const searchPattern = manifest.getPattern(manifest.binary);

  const apiOptions = {
    hostname: 'api.github.com',
    path: assetKey != "supernova" ? `/repos/${manifest.repo}/releases/latest` : `/repos/${manifest.repo}/releases`,
    headers: {
      'User-Agent': 'SonoUtils-Launcher-Client-v1',
      'Accept': 'application/vnd.github.v3+json'
    }
  };

  https.get(apiOptions, (res) => {
    let data = '';

    // SAFE RATE-LIMIT TRAP: Clean error catching for API exhaustion
    if (res.statusCode === 403) {
      console.error(`\x1b[31m[API Error]: GitHub API Rate Limit Exceeded (403 Forbidden).\x1b[0m`);
      console.error(`\x1b[33mUnauthenticated requests are limited to 60/hr. Please wait or place binaries manually.\x1b[0m\n`);
      returnToMenu();
      return;
    }

    if (res.statusCode !== 200) {
      console.error(`\x1b[31mGitHub API Error: Server responded with status ${res.statusCode} checking ${assetKey}\x1b[0m\n`);
      returnToMenu();
      return;
    }

    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      try {
        const releaseInfo = assetKey != "supernova" ? JSON.parse(data) : JSON.parse(data)[0];
        if (!releaseInfo.assets || !Array.isArray(releaseInfo.assets)) throw new Error("Invalid or empty asset array schema returned by API.");

        const targetAsset = releaseInfo.assets.find(asset => asset && asset.name && (asset.name.toLowerCase().includes(searchPattern.toLowerCase()) || asset.name === searchPattern));

        // SAFE VALUE GUARD: Prevent script crash if search returns null/undefined
        if (!targetAsset || !targetAsset.name) {
          throw new Error(`Could not locate a valid compiled binary payload matching pattern string: "${searchPattern}"`);
        }

        const assetExtension = path.extname(targetAsset.name);
        const tempPath = path.join(manifest.targetDir, `${assetKey}-temp${assetExtension || (isWin ? '.exe' : '')}`);

        console.log(`Downloading latest ${assetKey.toUpperCase()} build (${releaseInfo.tag_name || 'Latest'})...`);
        downloadFile(targetAsset.browser_download_url, tempPath, (err) => {
          if (err) {
            console.error(`\x1b[31m${assetKey.toUpperCase()} download sequence failed: ${err.message}\x1b[0m\n`);
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            returnToMenu();
            return;
          }

          try {
            manifest.extract(tempPath, targetPath, manifest.binary);
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

            console.log(`\x1b[32m${assetKey.toUpperCase()} subsystem verified successfully!\x1b[0m\n`);
            if (process.platform !== 'win32') {
              try { fs.chmodSync(targetPath, '755'); } catch (e) { }
            }
            onReadyCallback();
          } catch (exErr) {
            console.error(`\x1b[31mExtraction engine failure mapping ${assetKey.toUpperCase()}: ${exErr.message}\x1b[0m\n`);
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            returnToMenu();
          }
        });
      } catch (validationErr) {
        console.error(`\x1b[31mValidation processing error: ${validationErr.message}\x1b[0m\n`);
        returnToMenu();
      }
    });
  }).on('error', (apiErr) => {
    console.error(`\x1b[31mNetwork connection fault checking ${assetKey}: ${apiErr.message}\x1b[0m\n`);
    returnToMenu();
  });
}

// Helper function to handle the on-the-fly zip download safely with a progress bar
function downloadFile(url, dest, callback) {
  const file = fs.createWriteStream(dest);
  const parsedUrl = new URL(url);
  const requestOptions = {
    hostname: parsedUrl.hostname,
    path: parsedUrl.pathname + parsedUrl.search,
    headers: { 'User-Agent': 'SonoUtils-Launcher-NodeJS' }
  };

  https.get(requestOptions, (response) => {
    // Safely forward down both relative and absolute redirect rules
    if (response.statusCode === 302 || response.statusCode === 301) {
      let redirectUrl = response.headers.location;

      if (!redirectUrl.startsWith('http://') && !redirectUrl.startsWith('https://')) {
        redirectUrl = new URL(redirectUrl, 'https://github.com').href;
      }

      file.close(() => {
        fs.unlink(dest, () => {
          downloadFile(redirectUrl, dest, callback); // Recursively loop
        });
      });
      return;
    }

    // STRICT ERROR CHECKING: Abort extraction sequence if the response isn't a success code
    if (response.statusCode !== 200) {
      file.close(() => {
        fs.unlink(dest, () => {
          callback(new Error(`Server responded with status code: ${response.statusCode}`));
        });
      });
      return;
    }

    // Progress Bar Variables
    const totalBytes = parseInt(response.headers['content-length'], 10);
    let receivedBytes = 0;

    response.on('data', (chunk) => {
      receivedBytes += chunk.length;

      if (totalBytes) {
        const percentage = ((receivedBytes / totalBytes) * 100).toFixed(1);
        const barWidth = 30;
        const filledWidth = Math.round((receivedBytes / totalBytes) * barWidth);
        const emptyWidth = barWidth - filledWidth;

        const progressBar = '█'.repeat(filledWidth) + '░'.repeat(emptyWidth);
        const currentMB = (receivedBytes / (1024 * 1024)).toFixed(2);
        const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);

        // Clear current terminal line and write the visual progress bar status
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);
        process.stdout.write(`📥 Downloading: [${progressBar}] ${percentage}% (${currentMB} / ${totalMB} MB)`);
      } else {
        // Fallback layout context status loop if the asset server drops Content-Length headers
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);
        process.stdout.write(`📥 Downloading: ${(receivedBytes / (1024 * 1024)).toFixed(2)} MB received...`);
      }
    });

    response.pipe(file);

    file.on('finish', () => {
      process.stdout.write('\n\n'); // Append clean breaking line structure upon loop exit completion
      file.close(callback);
    });
  }).on('error', (err) => {
    fs.unlink(dest, () => { });
    callback(err);
  });
}

// Helper function to launch Sono-Overlay once downloaded/extracted
function startSonoOverlayProcess(overlayDir, overlayPath, adminNeeded) {
  process.stdin.removeListener('data', onRawConsoleDataInput);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  process.stdin.pause();

  console.log(`--- Starting Sono-Overlay ---\n`);

  if (adminNeeded) {
    const os = require('os'); const platform = os.platform();

    try {
      if (platform === 'win32') {
        // Windows: Use PowerShell to request elevation
        // '-Verb RunAs' triggers the UAC prompt
        const psCommand = `Start-Process "${overlayPath}" -WorkingDirectory "${overlayDir}" -Verb RunAs -Wait`;

        console.log('Launching admin process (waiting)...');
        execSync(`powershell -Command "${psCommand}"`);
        console.log('Admin process has closed.');

      } else {
        // macOS / Linux: Use sudo
        // 'stdio: inherit' lets the user type their password in the terminal
        console.log('Launching admin process via sudo...');
        execSync(`sudo "${overlayPath}"`, {
          cwd: overlayDir,
          stdio: 'inherit'
        });
        console.log('Admin process has closed.');
      }
    } catch (error) {
      console.error('Failed to run as admin or user denied permissions:', error.message);
    }
    initMenuInputEngine();
    returnToMenu();
  } else {
    const overlayProcess = spawn(overlayPath, [], {
      cwd: overlayDir,
      stdio: 'inherit'
    });

    overlayProcess.on('close', (code) => {
      console.log(`\n👋 Sono-Overlay completed or closed (Code: ${code}).`);
      initMenuInputEngine();
      returnToMenu();
    });

    overlayProcess.on('error', (err) => {
      console.error(`\x1b[31m[Spawn Error]: ${err.message}\x1b[0m\n`);
      initMenuInputEngine();
      returnToMenu();
    });
  }
}

function renderMenu() {
  process.stdout.write('\x1b[2J\x1b[0;0H');
  console.log(`--- \x1b[96mSono \x1b[95mCharts \x1b[0m(v${ver}) ---\n(Use Arrow Keys, Press Enter to Select)\n`);
  MENU_ITEMS.forEach((item, idx) => {
    if (idx == selectedIndex) {
      console.log(`\x1b[32m > [ ${item} ] \x1b[0m`)
    } else {
      console.log(`   [ ${item} ] `)
    }
  });
}

function returnToMenu() {
  process.stdout.write('\n\x1b[33mPress any key to return to main menu...\x1b[0m');
  process.stdin.removeListener('data', onRawConsoleDataInput);

  const tempHandler = () => {
    process.stdin.removeListener('data', tempHandler);
    initMenuInputEngine();
    renderMenu();
  };

  // 100ms timeout prevents previous Enter-key buffer sequences from auto-triggering the prompt page context
  setTimeout(() => {
    process.stdin.on('data', tempHandler);
  }, 100);
}

// Automatically scrubs loose, half-downloaded or corrupted temp files from previous sessions
function cleanTrailingDebris(workingDir) {
  const targets = [path.join(workingDir, 'addons'), path.join(workingDir, 'Sono-Overlay'), path.join(workingDir, 'server')];

  targets.forEach(dir => {
    try {
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        if (file.includes('-temp')) {
          const brokenFilePath = path.join(dir, file);
          fs.unlinkSync(brokenFilePath);
        }
      });
    } catch (e) { /* Fail silently during initial workspace load setups */ }
  });
}

// Global execution hooks
cleanTrailingDebris(process.pkg ? path.dirname(process.execPath) : __dirname);
initMenuInputEngine();
renderMenu();