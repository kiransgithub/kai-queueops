"""Bounded, page-touched memory load for dashboard verification."""

from __future__ import annotations

import os
import time


MEBIBYTE = 1024 * 1024


def main() -> None:
    duration_seconds = max(10, int(os.getenv("DURATION_SECONDS", "600")))
    target_mib = max(16, int(os.getenv("MEMORY_MIB", "768")))
    chunks: list[bytearray] = []
    print(f"Allocating and touching {target_mib} MiB for {duration_seconds} seconds", flush=True)
    for _ in range(target_mib):
        chunk = bytearray(MEBIBYTE)
        # Touch each page so the memory becomes resident and visible to Metrics Server.
        for offset in range(0, len(chunk), 4096):
            chunk[offset] = 1
        chunks.append(chunk)
    stop_at = time.monotonic() + duration_seconds
    while time.monotonic() < stop_at:
        # Read one byte from each chunk so the allocation remains active.
        _ = sum(chunk[0] for chunk in chunks)
        time.sleep(1)
    print("Memory sample completed", flush=True)


if __name__ == "__main__":
    main()
