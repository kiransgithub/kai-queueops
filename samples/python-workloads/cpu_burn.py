"""Bounded CPU load for validating KAI scheduling and Metrics API dashboards."""

from __future__ import annotations

import math
import multiprocessing
import os
import time


def burn_cpu(stop_at: float) -> None:
    value = 1.000001
    while time.monotonic() < stop_at:
        # Keep the interpreter doing floating-point work without allocating memory.
        value = math.sqrt(value * value + 0.000001)


def main() -> None:
    duration_seconds = max(10, int(os.getenv("DURATION_SECONDS", "600")))
    workers = max(1, int(os.getenv("CPU_WORKERS", str(os.cpu_count() or 1))))
    stop_at = time.monotonic() + duration_seconds
    processes = [multiprocessing.Process(target=burn_cpu, args=(stop_at,)) for _ in range(workers)]
    print(f"Starting {workers} CPU workers for {duration_seconds} seconds", flush=True)
    for process in processes:
        process.start()
    for process in processes:
        process.join()
    print("CPU sample completed", flush=True)


if __name__ == "__main__":
    main()
