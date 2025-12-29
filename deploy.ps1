$DEST_DIR = "C:\Users\ONeithan\Documents\Obsidian teste ruins\testessss\.obsidian\plugins\nexus-hub"

if (!(Test-Path -Path $DEST_DIR)) {
    New-Item -ItemType Directory -Force -Path $DEST_DIR
    Write-Host "Created target directory: $DEST_DIR"
}

Copy-Item "main.js" -Destination $DEST_DIR
Copy-Item "manifest.json" -Destination $DEST_DIR
Copy-Item "styles.css" -Destination $DEST_DIR

Write-Host "Deployed Nexus Hub to $DEST_DIR"
