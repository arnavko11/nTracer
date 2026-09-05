#!/usr/bin/env python3
"""nTracer discovery pipeline.

Scans the local network with nmap and prints a single JSON blob to stdout for
the Electron main process to consume.

Pipeline
--------
1. Ping sweep (``-sn``) to find live hosts, their MACs and vendors.
2. Tag hosts whose MAC vendor matches a known fragile/IoT vendor.
3. Deep probe each host:
     - normal devices: full OS + service fingerprinting (``-O -sV``)
     - fragile devices: light service scan only, narrow port list, no ``-O``

Output (one JSON object, see README for the full schema)::

    {"router": {...}, "devices": [...], "scanned_at": "..."}

Errors are also reported as JSON (``{"error": "..."}``) so the caller never has
to parse free-form text; the exit code is non-zero in that case.
"""

from __future__ import annotations

import argparse
import ipaddress
import json
import re
import socket
import subprocess
import sys
from datetime import datetime, timezone

try:
    import nmap  # python-nmap
except ImportError:  # pragma: no cover - surfaced to the caller as JSON
    nmap = None


# MAC-vendor substrings that mark a device as "fragile": cheap IoT gear that
# tends to lock up, reboot or drop off the network under an aggressive scan.
# Matched case-insensitively against the OUI vendor string nmap reports.
FRAGILE_VENDORS = (
    "espressif",
    "sonoff",
    "itead",
    "tuya",
    "ring",
    "nest",
    "google",          # Nest/Chromecast hardware reports as Google
    "amazon",          # Echo / Ring rebrands
    "wyze",
    "shelly",
    "tp-link",         # Kasa smart plugs
    "belkin",          # WeMo
    "lifx",
    "signify",         # Philips Hue
    "philips",
    "roku",
    "ecobee",
    "arlo",
)

# Ports worth probing on fragile devices. Full/`-p-` sweeps are what actually
# knock these off the network, so we ask for a handful of likely ones instead.
FRAGILE_PORTS = "80,443,8080,8883,1883,554,5000"

# Coarse OS buckets. nmap's raw osmatch strings are noisy, so we map them onto
# a few labels that are actually useful on a topology map.
OS_BUCKETS = (
    ("linux", "Linux"),
    ("darwin", "macOS"),
    ("mac os", "macOS"),
    ("apple", "Apple"),
    ("ios", "Apple"),
    ("windows", "Windows"),
    ("android", "Android"),
    ("embedded", "Embedded/IoT"),
    ("router", "Router"),
)


class ScanError(Exception):
    """Anything that should be reported to the caller as a JSON error."""


# --------------------------------------------------------------------------
# Network helpers
# --------------------------------------------------------------------------

def local_ipv4() -> str:
    """Best-effort local IPv4 address of the interface with the default route.

    Opens a UDP socket towards a public address; no packets are actually sent,
    but the kernel picks the outbound interface for us.
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    finally:
        sock.close()


def default_gateway() -> str | None:
    """IP of the default gateway (the router), or None if it can't be read."""
    try:
        out = subprocess.run(
            ["route", "-n", "get", "default"],
            capture_output=True, text=True, timeout=5,
        ).stdout
        match = re.search(r"gateway:\s*([\d.]+)", out)
        if match:
            return match.group(1)
    except (OSError, subprocess.SubprocessError):
        pass

    try:  # Linux fallback
        out = subprocess.run(
            ["ip", "route", "show", "default"],
            capture_output=True, text=True, timeout=5,
        ).stdout
        match = re.search(r"via\s+([\d.]+)", out)
        if match:
            return match.group(1)
    except (OSError, subprocess.SubprocessError):
        pass

    return None


def guess_subnet() -> str:
    """CIDR of the local network, assumed /24 (true for consumer routers)."""
    return str(ipaddress.ip_network(f"{local_ipv4()}/24", strict=False))


# --------------------------------------------------------------------------
# Classification helpers
# --------------------------------------------------------------------------

def is_fragile(vendor: str) -> bool:
    """True if the MAC vendor is on the fragile/IoT list."""
    vendor = (vendor or "").lower()
    return any(name in vendor for name in FRAGILE_VENDORS)


def bucket_os(osmatches: list[dict], fragile: bool) -> str:
    """Collapse nmap's osmatch list into one short label."""
    for match in osmatches:
        name = match.get("name", "").lower()
        for needle, label in OS_BUCKETS:
            if needle in name:
                return label
    return "Embedded/IoT" if fragile else "Unknown"


def pick_icon(vendor: str, os_guess: str, is_router: bool) -> str:
    """Icon key for the renderer to draw."""
    if is_router:
        return "router"
    if os_guess in ("macOS", "Apple", "Android"):
        return "phone" if os_guess == "Android" else "computer"
    if os_guess in ("Windows", "Linux"):
        return "computer"
    if is_fragile(vendor):
        return "iot"
    return "unknown"


# --------------------------------------------------------------------------
# Scan stages
# --------------------------------------------------------------------------

def ping_sweep(scanner, cidr: str) -> list[dict]:
    """Stage 1: ``nmap -sn`` host discovery.

    Returns one dict per live host with ip / mac / vendor. MAC and vendor are
    only populated when nmap can ARP the host, which requires root; without it
    we fall back to the IP as the device identity.
    """
    scanner.scan(hosts=cidr, arguments="-sn -T3 --max-rate 50")
    hosts = []
    for ip in scanner.all_hosts():
        entry = scanner[ip]
        mac = entry["addresses"].get("mac", "")
        hosts.append({
            "ip": ip,
            "mac": mac.upper(),
            "vendor": entry.get("vendor", {}).get(mac, ""),
        })
    return hosts


def deep_probe(scanner, host: dict) -> dict:
    """Stage 3: fingerprint one host, gently if it looks fragile."""
    fragile = is_fragile(host["vendor"])
    if fragile:
        # -T2 + narrow ports + no OS detection: slow and quiet enough that
        # cheap IoT stacks stay up.
        args = (
            f"-sV --version-intensity 2 -p {FRAGILE_PORTS} "
            "-T2 --max-rate 50 --min-parallelism 1 --max-parallelism 10"
        )
    else:
        args = (
            "-O -sV -T3 --max-rate 50 "
            "--min-parallelism 1 --max-parallelism 10"
        )

    open_ports: list[int] = []
    osmatches: list[dict] = []
    try:
        scanner.scan(hosts=host["ip"], arguments=args)
        if host["ip"] in scanner.all_hosts():
            entry = scanner[host["ip"]]
            for proto in entry.all_protocols():
                open_ports += [
                    port for port, info in entry[proto].items()
                    if info.get("state") == "open"
                ]
            osmatches = entry.get("osmatch", [])
    except nmap.PortScannerError:
        # A probe failing on one device shouldn't sink the whole scan; the
        # device still shows up on the map, just without port/OS detail.
        pass

    return {
        "scan_profile": "light" if fragile else "full",
        "open_ports": sorted(set(open_ports)),
        "os_guess": bucket_os(osmatches, fragile),
    }


def build_device(host: dict, probe: dict, now: str, gateway: str | None) -> dict:
    """Assemble one device object in the save-file schema."""
    router = host["ip"] == gateway
    return {
        # MAC is the stable identity across rescans; fall back to IP when we
        # couldn't ARP (i.e. running without root).
        "id": host["mac"] or host["ip"],
        "ip": host["ip"],
        "mac": host["mac"],
        "vendor": host["vendor"],
        "os_guess": probe["os_guess"],
        "open_ports": probe["open_ports"],
        "scan_profile": probe["scan_profile"],
        "status": "online",
        "position": {"x": 0, "y": 0},   # laid out by the renderer
        "label": host["vendor"] or host["ip"],
        "icon": pick_icon(host["vendor"], probe["os_guess"], router),
        "notes": "",
        "first_seen": now,
        "last_seen": now,
    }


def run_scan(cidr: str | None, discover_only: bool) -> dict:
    """Run the full pipeline and return the JSON-serialisable result."""
    if nmap is None:
        raise ScanError(
            "python-nmap is not installed (pip install -r python/requirements.txt)"
        )

    scanner = nmap.PortScanner()
    cidr = cidr or guess_subnet()
    gateway = default_gateway()
    now = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

    hosts = ping_sweep(scanner, cidr)

    devices = []
    for host in hosts:
        probe = (
            {"scan_profile": "none", "open_ports": [], "os_guess": "Unknown"}
            if discover_only else deep_probe(scanner, host)
        )
        devices.append(build_device(host, probe, now, gateway))

    # The router is pulled out of the device list so the renderer can pin it at
    # the top of the star layout.
    router = next((d for d in devices if d["ip"] == gateway), None)
    if router:
        devices.remove(router)
        router = {
            **router,
            "id": "router",
            "label": router["vendor"] or "Router",
            "icon": "router",
        }
    elif gateway:
        router = {
            "id": "router", "ip": gateway, "mac": "", "vendor": "",
            "os_guess": "Router", "open_ports": [], "scan_profile": "none",
            "status": "online", "position": {"x": 0, "y": 0}, "label": "Router",
            "icon": "router", "notes": "", "first_seen": now, "last_seen": now,
        }

    # Without root, nmap can't ARP, so we get no MACs and only hosts that
    # answer a TCP ping — a small fraction of a real home network.
    privileged = any(d["mac"] for d in devices)

    return {
        "version": 1,
        "subnet": cidr,
        "privileged": privileged,
        "router": router,
        "devices": devices,
        "last_scan": now,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="nTracer network discovery scan")
    parser.add_argument(
        "--subnet",
        help="CIDR to scan, e.g. 192.168.1.0/24 (default: auto-detect)",
    )
    parser.add_argument(
        "--discover-only",
        action="store_true",
        help="ping sweep only; skip the per-device fingerprinting stage",
    )
    args = parser.parse_args()

    try:
        result = run_scan(args.subnet, args.discover_only)
    except ScanError as exc:
        json.dump({"error": str(exc)}, sys.stdout)
        return 1
    except Exception as exc:  # noqa: BLE001 - caller only speaks JSON
        json.dump({"error": f"{type(exc).__name__}: {exc}"}, sys.stdout)
        return 1

    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
