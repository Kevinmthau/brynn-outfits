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
