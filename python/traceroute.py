#!/usr/bin/env python3
"""nTracer traceroute wrapper.

Runs the system ``traceroute`` against one host and prints the parsed hops as
a single JSON object on stdout, following the same contract as ``scan.py``:
one blob out, and failures reported as ``{"error": "..."}`` rather than as
free-form text on stderr.

Output::

    {
      "target": "192.168.1.42",
      "reached": true,
      "hops": [
        {"hop": 1, "ip": "192.168.1.1", "rtt_ms": [2.1, 1.9], "avg_ms": 2.0,
         "timed_out": false}
      ]
    }

On a home LAN this is nearly always a single hop, which is exactly the point:
it confirms the device is reachable through the router and tells you what the
latency to it looks like.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys

# Defaults chosen so a scan of an unreachable host gives up in well under a
# minute: 12 hops x 2 probes x 2s.
DEFAULT_MAX_HOPS = 12
DEFAULT_PROBES = 2
DEFAULT_WAIT_S = 2

# Overall ceiling, generously above max_hops * probes * wait.
TIMEOUT_S = 90

# " 3  10.0.0.1  12.3 ms  11.9 ms" — the hop number leads the line.
HOP_LINE = re.compile(r"^\s*(\d+)\s+(.*)$")
IPV4 = re.compile(r"\b(\d{1,3}(?:\.\d{1,3}){3})\b")
RTT = re.compile(r"([\d.]+)\s*ms")


class TracerouteError(Exception):
    """Anything that should be reported to the caller as a JSON error."""


def parse_hops(output: str) -> list[dict]:
    """Turn traceroute's text output into hop dicts.

    Lines that aren't hops (the "traceroute to ..." header) are skipped, and a
    hop that only produced ``*`` is recorded as timed out rather than dropped —
    a silent hop is information, not absence of it.
    """
    hops = []
    for line in output.splitlines():
        match = HOP_LINE.match(line)
        if not match:
            continue

        number, rest = int(match.group(1)), match.group(2)
        addresses = IPV4.findall(rest)
        timings = [float(value) for value in RTT.findall(rest)]

        hops.append({
            "hop": number,
            # A hop can answer from more than one address; the first is enough
            # for a topology label.
            "ip": addresses[0] if addresses else None,
            "rtt_ms": timings,
            "avg_ms": round(sum(timings) / len(timings), 2) if timings else None,
            "timed_out": not timings,
        })
    return hops


def run_traceroute(target: str, max_hops: int, probes: int, wait: int) -> dict:
    """Trace the route to `target` and return the JSON-serialisable result."""
    binary = shutil.which("traceroute")
    if binary is None:
        raise TracerouteError("traceroute is not installed or not on PATH.")

    command = [
        binary,
        "-n",                  # don't resolve names; keeps it fast
        "-m", str(max_hops),
        "-q", str(probes),
        "-w", str(wait),
        target,
    ]

    try:
        completed = subprocess.run(
            command, capture_output=True, text=True, timeout=TIMEOUT_S,
        )
    except subprocess.TimeoutExpired:
        raise TracerouteError(f"traceroute to {target} timed out.") from None
    except OSError as exc:
        raise TracerouteError(f"Could not run traceroute: {exc}") from None

    hops = parse_hops(completed.stdout)

    if not hops:
        # Non-zero exit with no hops usually means the target didn't resolve.
        raise TracerouteError(
            completed.stderr.strip() or f"No route information for {target}."
        )

    return {
        "target": target,
        # The trace reached the target if the final answering hop is the target.
        "reached": any(hop["ip"] == target for hop in hops),
        "hops": hops,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="nTracer traceroute")
    parser.add_argument("target", help="IP address or hostname to trace")
    parser.add_argument("--max-hops", type=int, default=DEFAULT_MAX_HOPS)
    parser.add_argument("--probes", type=int, default=DEFAULT_PROBES)
    parser.add_argument("--wait", type=int, default=DEFAULT_WAIT_S)
    args = parser.parse_args()

    try:
        result = run_traceroute(args.target, args.max_hops, args.probes, args.wait)
    except TracerouteError as exc:
        json.dump({"error": str(exc)}, sys.stdout)
        return 1
    except Exception as exc:  # noqa: BLE001 - caller only speaks JSON
        json.dump({"error": f"{type(exc).__name__}: {exc}"}, sys.stdout)
        return 1

    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
