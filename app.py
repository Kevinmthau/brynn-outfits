#!/usr/bin/env python3
"""
Local Flask server for Brynn's Outfit Finder (static files + images).

This app is intentionally simple: the client loads `data/collections.json`
and renders everything client-side.
"""

import json
import os
from pathlib import Path

from flask import Flask, abort, jsonify, request, send_from_directory


BASE_DIR = Path(__file__).parent
APP_PORT = 5003
DATA_FILE = BASE_DIR / "data" / "collections.json"

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


def load_collections_data() -> dict:
    with DATA_FILE.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_collections_data(data: dict) -> None:
    tmp_file = DATA_FILE.with_suffix(".json.tmp")
    with tmp_file.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    tmp_file.replace(DATA_FILE)


def ensure_edit_key() -> None:
    expected = os.environ.get("EDIT_API_KEY", "").strip()
    if not expected:
        return
    provided = request.headers.get("x-edit-key", "").strip()
    if provided != expected:
        abort(401)


@app.route("/api/data", methods=["GET", "POST"])
def api_data():
    if request.method == "GET":
        return jsonify(load_collections_data())

    ensure_edit_key()
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Request body must be a JSON object."}), 400

    if not isinstance(payload.get("all_index"), dict):
        return jsonify({"error": "Missing or invalid all_index."}), 400
    if not isinstance(payload.get("all_items"), dict):
        return jsonify({"error": "Missing or invalid all_items."}), 400

    save_collections_data(payload)
    return jsonify({"ok": True, "data": payload})


def main() -> None:
    app.run(host="0.0.0.0", port=APP_PORT, debug=True)


if __name__ == "__main__":
    main()
