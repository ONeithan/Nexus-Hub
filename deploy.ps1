# Script para instalar/atualizar o plugin Nexus Hub no seu cofre do Obsidian

# 1. Compila o projeto para produção
Write-Host "Compilando o plugin..."
npm run build

# Verifica se a compilação foi bem-sucedida
if ($LASTEXITCODE -ne 0) {
    Write-Host "----------------------------------------------------" -ForegroundColor Red
    Write-Host "  Erro durante a compilacao. A instalacao foi abortada." -ForegroundColor Red
    Write-Host "----------------------------------------------------" -ForegroundColor Red
    Write-Host "Corrija os erros de TypeScript mostrados acima e tente novamente."
    exit 1 # Encerra o script com um código de erro
}

# 2. Define os caminhos
$sourceDir = $PSScriptRoot # Diretório atual do script
$destinationDir = "C:\Users\Administrator\Documents\Obsidian teste ruins\testessss\.obsidian\plugins\nexus-hub"

# 3. Cria o diretório de destino se ele não existir
if (-not (Test-Path $destinationDir)) {
    Write-Host "Criando o diretório do plugin em: $destinationDir"
    New-Item -ItemType Directory -Force -Path $destinationDir
}

# 4. Copia os arquivos necessários
# 4. Copia os arquivos necessários
Write-Host "Limpando versão anterior em: $destinationDir"
if (Test-Path "$destinationDir\main.js") { Remove-Item "$destinationDir\main.js" -Force }
if (Test-Path "$destinationDir\manifest.json") { Remove-Item "$destinationDir\manifest.json" -Force }
if (Test-Path "$destinationDir\styles.css") { Remove-Item "$destinationDir\styles.css" -Force }

Write-Host "Copiando arquivos para o cofre do Obsidian..."
Copy-Item -Path "$sourceDir\main.js" -Destination $destinationDir -Force
Copy-Item -Path "$sourceDir\manifest.json" -Destination $destinationDir -Force
Copy-Item -Path "$sourceDir\styles.css" -Destination $destinationDir -Force
Copy-Item -Path "$sourceDir\assets" -Destination $destinationDir -Recurse -Force

# 5. Mensagem de sucesso
Write-Host "----------------------------------------------------" -ForegroundColor Green
Write-Host "  Plugin 'Nexus Hub' instalado com sucesso!" -ForegroundColor Green
Write-Host "----------------------------------------------------" -ForegroundColor Green
Write-Host ""
Write-Host "Agora voce pode abrir o Obsidian e ativar o plugin."
Write-Host "Dica: Se o Obsidian ja estiver aberto, recarregue-o (Ctrl+R) para ver as mudancas."