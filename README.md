# x

An Electron application with React and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ pnpm install
```

### Development

```bash
$ pnpm dev
```

### Build

```bash
# For windows
$ pnpm build:win

# For macOS
$ pnpm build:mac

# For Linux
$ pnpm build:linux
```

## GitHub Actions

GitHub Actions will automatically build installers for Linux, Windows, and macOS on:

- pushes to `main` or `master`
- pull requests
- manual runs from the Actions tab

When you push a tag like `v1.0.0`, the workflow also creates or updates a GitHub Release and uploads the generated installers as release assets.
