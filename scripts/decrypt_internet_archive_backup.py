#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
from pathlib import Path
from typing import Iterable

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from backup_internet_archive import (
    ENCRYPTED_INDEX_REMOTE_NAME,
    ENCRYPTION_MAGIC,
    derive_file_key,
    derive_master_key,
)


def require_passphrase() -> bytes:
    passphrase_file = os.environ.get("IA_ENCRYPTION_PASSPHRASE_FILE", "").strip()
    if passphrase_file:
        value = Path(passphrase_file).read_text().strip()
    else:
        value = os.environ.get("IA_ENCRYPTION_PASSPHRASE", "").strip()
    if not value:
        raise RuntimeError("IA_ENCRYPTION_PASSPHRASE is required to decrypt the backup.")
    return value.encode("utf-8")


def decrypt_bytes(payload: bytes, master_key: bytes) -> bytes:
    if not payload.startswith(ENCRYPTION_MAGIC):
        raise ValueError("Unsupported encrypted file format.")
    remainder = payload[len(ENCRYPTION_MAGIC) :]
    header_bytes, ciphertext = remainder.split(b"\n", 1)
    header = json.loads(header_bytes.decode("utf-8"))
    salt = base64.b64decode(header["salt"])
    nonce = base64.b64decode(header["nonce"])
    key = derive_file_key(master_key, salt)
    return AESGCM(key).decrypt(nonce, ciphertext, ENCRYPTION_MAGIC + header_bytes)


def decrypt_file(source: Path, destination: Path, master_key: bytes) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(decrypt_bytes(source.read_bytes(), master_key))


def default_output_path(source: Path) -> Path:
    if source.name.endswith(".iaenc"):
        return source.with_name(source.name.removesuffix(".iaenc"))
    return source.with_suffix(source.suffix + ".dec")


def safe_restore_path(root: Path, logical_name: str) -> Path:
    candidate = (root / logical_name).resolve()
    resolved_root = root.resolve()
    if resolved_root not in candidate.parents and candidate != resolved_root:
        raise ValueError(f"Unsafe restore path in encrypted index: {logical_name}")
    return candidate


def restore_tree(download_dir: Path, output_dir: Path, master_key: bytes) -> None:
    encrypted_index = download_dir / ENCRYPTED_INDEX_REMOTE_NAME
    if not encrypted_index.exists():
        raise FileNotFoundError(f"Encrypted index not found: {encrypted_index}")

    private_index_bytes = decrypt_bytes(encrypted_index.read_bytes(), master_key)
    private_index = json.loads(private_index_bytes.decode("utf-8"))
    index_output = output_dir / "index" / "files.json"
    index_output.parent.mkdir(parents=True, exist_ok=True)
    index_output.write_bytes(private_index_bytes)

    records = private_index.get("catalog") or private_index.get("files", [])
    restored = 0
    seen: set[str] = set()
    for record in records:
        encrypted_name = record["encrypted_name"]
        logical_name = record["logical_name"]
        if encrypted_name in seen:
            continue
        seen.add(encrypted_name)
        encrypted_path = download_dir / encrypted_name
        if not encrypted_path.exists():
            continue
        output_path = safe_restore_path(output_dir, logical_name)
        decrypt_file(encrypted_path, output_path, master_key)
        restored += 1
    print(f"Restored {restored} file(s) to {output_dir}")


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Decrypt an Isaibox Internet Archive backup.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--file", help="Single .iaenc file to decrypt")
    group.add_argument("--dir", help="Directory containing downloaded Archive item files")
    parser.add_argument("--output", help="Output file for --file")
    parser.add_argument("--output-dir", default="restored-isaibox-backup", help="Restore directory for --dir")
    return parser.parse_args(list(argv))


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    passphrase = require_passphrase()
    master_key = derive_master_key(passphrase)
    if args.file:
        source = Path(args.file)
        destination = Path(args.output) if args.output else default_output_path(source)
        decrypt_file(source, destination, master_key)
        print(f"Decrypted {source} -> {destination}")
        return 0

    restore_tree(Path(args.dir), Path(args.output_dir), master_key)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
