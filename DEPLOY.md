# Deploying to GitHub Pages

## One-time setup

1. In your repo: **Settings → Pages**
2. Under **Build and deployment**, set **Source** to **GitHub Actions**

## Deploying

- **Automatic:** Push to the `main` branch. The workflow builds and deploys.
- **Manual:** **Actions** tab → **Deploy to GitHub Pages** → **Run workflow**

The site will be available at `https://<username>.github.io/<repo-name>/`.

## Build details

- The design system in `design-system/design-system.css` is imported from `src/style.css` and is bundled into the static assets by Vite.
- `BASE_PATH` is set in the workflow to `/<repo-name>/` so asset URLs work on GitHub Pages.
