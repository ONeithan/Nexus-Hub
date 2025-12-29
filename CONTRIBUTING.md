# Guia de Contribuição e Padrões de Desenvolvimento

Para garantir um nível profissional e organizado no desenvolvimento do plugin Nexus-Hub, seguimos estritamente os seguintes padrões.

## Padrões de Commit (Conventional Commits)

Seguimos a especificação [Conventional Commits v1.0.0](https://www.conventionalcommits.org/pt-br/v1.0.0/).

O formato da mensagem de commit deve ser:
```
<tipo>[escopo opcional]: <descrição>

[corpo opcional]

[rodapé(s) opcional(is)]
```

### Tipos Comuns
- **feat**: Uma nova funcionalidade (relaciona-se com MINOR no SemVer).
- **fix**: Correção de bug (relaciona-se com PATCH no SemVer).
- **docs**: Apenas mudanças na documentação.
- **style**: Mudanças que não afetam o significado do código (espaços, formatação, etc).
- **refactor**: Mudança de código que não corrige um bug nem adiciona uma feature.
- **perf**: Mudança de código para melhorar performance.
- **test**: Adição ou correção de testes.
- **chore**: Mudanças no processo de build, ferramentas auxiliares, etc.

### Exemplos
- `feat: adicionar sistema de conquistas`
- `fix(graficos): corrigir erro de renderização no gráfico de barras`
- `docs: atualizar README com instruções de instalação`

## Versionamento (Semantic Versioning)

Seguimos o [Semantic Versioning 2.0.0](https://semver.org/).

O número da versão segue o formato `MAJOR.MINOR.PATCH`:
1.  **MAJOR**: Mudanças incompatíveis na API.
2.  **MINOR**: Adição de funcionalidades mantendo compatibilidade.
3.  **PATCH**: Correções de bugs mantendo compatibilidade.

### Como atualizar a versão

Este projeto já está configurado para facilitar o versionamento. Utilize os comandos do npm:

- Para uma correção (patch):
  ```bash
  npm version patch
  ```
- Para uma nova funcionalidade (minor):
  ```bash
  npm version minor
  ```
- Para uma grande mudança (major):
  ```bash
  npm version major
  ```

Estes comandos irão automaticamente:
1. Atualizar o `package.json`.
2. Rodar o script `version-bump.mjs` para sincronizar `manifest.json` e `versions.json`.
3. Criar um commit com a nova versão e uma tag git.

## Fluxo de Deploy Local

Para testar suas alterações no Obsidian localmente:

1. Certifique-se de que o caminho no arquivo `deploy.ps1` está correto para o seu ambiente.
2. Execute:
   ```bash
   npm run deploy
   ```
   Isso irá compilar o projeto e copiar os arquivos necessários para a pasta de plugins do seu vault.
