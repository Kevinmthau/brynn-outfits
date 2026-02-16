# Brynn's Outfit Finder

This is a standalone Outfit Finder app, backed by outfit PDFs.

## Data Source

PDFs are read from (default):

- `./pdfs` (if you create it)
- otherwise `~/Desktop/brynn-outfits/pdfs`

The extractor renders each PDF page to an image (default: JPG) and extracts the per-page item list from the PDF's embedded text.

## Extract / Rebuild Data

```bash
python3 extract_brynn_pdfs.py --pdf-dir ~/Desktop/brynn-outfits/pdfs --scale 2.0 --image-format jpg --jpg-quality 85 --clean
```

If images already exist and you only want to rebuild `collections.json`:

```bash
python3 extract_brynn_pdfs.py --pdf-dir ~/Desktop/brynn-outfits/pdfs --no-render
```

Outputs:

- `images/<source>/page_<n>.(jpg|png)`
- `brynn-outfits/data/collections.json`

## Run Locally

```bash
python3 app.py
```

Then open:

- `http://127.0.0.1:5003`

## Live Edit Support

The app now supports editing item names/categories directly from the UI and persisting them to both local and live environments:

- Local Flask: `GET/POST /api/data` reads/writes `data/collections.json`.
- Netlify: `GET/POST /api/data` is routed to `netlify/functions/data.js`, which persists data in Netlify Blobs.

Optional write protection:

- Set `EDIT_API_KEY` in your environment.
- When enabled, saves require the `x-edit-key` header and the UI will prompt for the key on first save attempt.

Netlify setup:

1. Ensure dependencies install (`package.json` includes `@netlify/blobs`).
2. Keep `EDIT_API_KEY` configured in Netlify Environment Variables if you want write protection.
3. Deploy normally; redirects in `netlify.toml` map `/api/data` to the function.

## PWA (Installable App)

This repo was not a PWA originally (no web app manifest / service worker). It now includes:

- `manifest.webmanifest`
- `sw.js`

To set the app icon, save your source image to:

- `assets/icon-source.png`

Then generate the required sizes (macOS):

```bash
./scripts/generate_pwa_icons.sh
```
