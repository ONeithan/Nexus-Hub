Write-Host "Iniciando Build..."
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Build falhou! Abortando deploy."
    exit $LASTEXITCODE
}

$DEST_DIR = "D:\Neithan\Documentos\Obsidian teste ruins\testessss\.obsidian\plugins\nexus-hub"

if (!(Test-Path -Path $DEST_DIR)) {
    New-Item -ItemType Directory -Force -Path $DEST_DIR
    Write-Host "Created target directory: $DEST_DIR"
}

Copy-Item "main.js" -Destination $DEST_DIR
Copy-Item "manifest.json" -Destination $DEST_DIR
Copy-Item "styles.css" -Destination $DEST_DIR

Write-Host "Deployed Nexus Hub to $DEST_DIR"
