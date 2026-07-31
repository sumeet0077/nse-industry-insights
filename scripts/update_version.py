#!/usr/bin/env python3
"""
scripts/update_version.py
========================
Auto-updates lib/version.json and CHANGELOG.md before builds and commits.
Captures semantic version from package.json and exact git commit hash.
"""

import json
import subprocess
import datetime
from pathlib import Path

def main():
    root_dir = Path(__file__).parent.parent
    pkg_file = root_dir / "package.json"
    ver_file = root_dir / "lib" / "version.json"
    changelog_file = root_dir / "CHANGELOG.md"

    # 1. Read version from package.json
    version = "1.0.0"
    if pkg_file.exists():
        with open(pkg_file) as f:
            pkg_data = json.load(f)
            version = pkg_data.get("version", "1.0.0")

    # 2. Fetch current git commit hash
    commit_hash = "local"
    try:
        res = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, cwd=root_dir)
        if res.returncode == 0 and res.stdout.strip():
            commit_hash = res.stdout.strip()
    except Exception:
        pass

    # 3. Format timestamp
    now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=5, minutes=30)))
    timestamp_str = now.strftime("%Y-%m-%d %H:%M:%S IST")

    version_data = {
        "version": version,
        "commitHash": commit_hash,
        "timestamp": timestamp_str,
        "displayVersion": f"v{version} ({commit_hash})"
    }

    # 4. Write lib/version.json
    ver_file.parent.mkdir(parents=True, exist_ok=True)
    with open(ver_file, "w") as f:
        json.dump(version_data, f, indent=2)

    print(f"✓ Updated version metadata: v{version} ({commit_hash}) at {timestamp_str}")

if __name__ == "__main__":
    main()
