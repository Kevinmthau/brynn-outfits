#!/usr/bin/env python3
"""
Local Flask server for Brynn's Outfit Finder (static files + images).

This app is intentionally simple: the client loads `data/collections.json`
and renders everything client-side.
"""

from pathlib import Path

from flask import Flask, send_from_directory


BASE_DIR = Path(__file__).parent
APP_PORT = 5003

app = Flask(__name__)


@app.route("/")
def index():
    return send_from_directory(BASE_DIR / "templates", "index.html")

@app.route("/manifest.webmanifest")
def manifest():
    # Serve from repo root so static hosts (e.g. Netlify publishing ".") and
    # this Flask app behave the same.
    return send_from_directory(BASE_DIR, "manifest.webmanifest", mimetype="application/manifest+json")


@app.route("/sw.js")
def service_worker():
    # Must be at origin root (or a directory above the app) to control navigation.
    return send_from_directory(BASE_DIR, "sw.js", mimetype="text/javascript")


@app.route("/assets/<path:filename>")
def assets(filename: str):
    return send_from_directory(BASE_DIR / "assets", filename)


@app.route("/data/<path:filename>")
def data_files(filename: str):
    return send_from_directory(BASE_DIR / "data", filename)


@app.route("/images/<source>/<path:filename>")
def images(source: str, filename: str):
    return send_from_directory(BASE_DIR / "images" / source, filename)


def main() -> None:
    app.run(host="0.0.0.0", port=APP_PORT, debug=True)


if __name__ == "__main__":
    main()
