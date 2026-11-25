# 7las

![Banner do 7las](.github/assets/banner.jpg)

App de compartilhamento de tela para Windows, construído com Tauri 2, React, TypeScript e WebRTC. Funciona na bandeja do sistema e oferece salas privadas para transmitir um monitor ou uma janela.

## Desenvolvimento

Requisitos: Node.js 24, Rust 1.90 ou superior e as dependências de build do Tauri para Windows.

```bash
npm ci
npx tauri dev
```

## Neon

Contas e sessões usam Neon Auth. Salas, membros, amigos e presença usam o schema `sevenlas` no Lakebase Postgres, acessado somente pela Function autenticada em `server/api/index.ts`.

```bash
neon link --project-id <projeto> --branch <branch> -y
neon deploy
npm run db:migrate
neon functions get api
```

Os endereços públicos do backend atual já vêm configurados em `src/lib/public-config.ts`; o app local funciona sem criar aliases manualmente. Para usar outro branch, copie `NEON_AUTH_BASE_URL` para `VITE_NEON_AUTH_URL` no `.env.local` e preencha `VITE_API_URL` com a URL de invocação da Function. Esses dois endereços são públicos; `DATABASE_URL` nunca é usado pelo frontend. Para substituir os padrões no build de release, configure os secrets `VITE_NEON_AUTH_URL` e `VITE_API_URL` no GitHub.

No Neon Auth, cadastre `http://tauri.localhost` como domínio confiável para o app instalado. As portas de localhost usadas pelo Vite são liberadas por padrão.

## Verificações

```bash
npm run lint
npm test
npm run typecheck
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

## Build

```bash
npx tauri build
```

O instalador NSIS é gerado em `src-tauri/target/release/bundle/nsis/`.

## Releases

O workflow `.github/workflows/release.yml` compila o app no Windows quando uma tag `v*` é publicada e cria um rascunho de release no GitHub com o instalador.

```bash
git tag v0.1.0
git push origin v0.1.0
```

## Estado da mídia

A captura de vídeo e áudio do sistema, múltiplas telas por sala, retransmissão P2P e fallback TURN estão implementados. O app não abre conexões P2P enquanto está fora de uma sala. Para grupos maiores que quatro espectadores ou várias transmissões simultâneas com maior demanda, a evolução recomendada é um SFU como LiveKit, com TURN próprio; Postgres e Neon Auth cuidam de contas e persistência, não transportam mídia.
