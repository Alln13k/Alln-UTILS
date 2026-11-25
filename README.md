# Alln UTILS

Bot Discord utilitaire en Node.js / discord.js v14.

## Prérequis

- Node.js 20 ou plus
- Un bot Discord avec les intents privilégiés activés :
  - `Server Members Intent`
  - `Message Content Intent`
  - `Presence Intent`

## Installation

```bash
npm ci
cp .env.example .env
```

Remplis `.env` :

```env
DISCORD_TOKEN=ton_token
CLIENT_ID=ton_client_id
GUILD_ID=ton_guild_id
```

Démarre le bot :

```bash
npm start
```

Si ton hébergeur lance directement `node index.js`, un fichier `index.js` à la racine redirige vers `src/index.js`.

Enregistre les slash commands sur la guilde :

```bash
npm run deploy
```

## Configuration

L’assistant universel parcourt toutes les clés une par une avec possibilité de passer :

```text
/config wizard
```

Boutons disponibles à chaque étape : **Modifier**, **Passer**, **Passer tout**.

## Données

Le dossier `data/` est ignoré par Git : il contient la configuration et les données runtime (warns, tickets, giveaways, etc.).

Garde-le persistant sur l’hébergeur et ne l’écrase pas lors d’une mise à jour.

## Mise à jour

```bash
git pull
npm ci
pm2 restart alln-utils
```

Si les slash commands ont changé :

```bash
npm run deploy
```

## Vérifications

```bash
node --check src/index.js
npm run check
```
