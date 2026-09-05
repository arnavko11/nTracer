# nTracer

A Packet-Tracer-style desktop app that maps your **real** home network. It
discovers devices with `nmap`, lays them out on a drag-and-drop canvas, and
saves the map to a portable `.nettrace` file so it reopens instantly without
rescanning.

Electron + React (React Flow canvas) on the front, Python + nmap on the back.

## Status

| Milestone | What it adds | Done |
| --- | --- | --- |
| 1 | `python/scan.py` — nmap discovery, JSON on stdout | ✅ |
| 2 | Electron + React shell, static topology canvas | ⬜ |
| 3 | Scan button wired end to end | ⬜ |
| 4 | Save / load `.nettrace`, auto-load last map | ⬜ |
| 5 | Rescan + diff (offline marking, layout preserved) | ⬜ |
| 6 | Traceroute overlay | ⬜ |

## Requirements

- `nmap` (`brew install nmap`)
- Python 3.11+
- Node 18+ (from milestone 2 on)

## Setup

```bash
python3 -m venv .venv
.venv/bin/pip install -r python/requirements.txt
```

## Running a scan

```bash
sudo .venv/bin/python python/scan.py
```

**Run it with `sudo`.** Unprivileged nmap can't send ARP requests, so it finds
only the handful of hosts that answer a TCP ping and reports no MAC addresses
— and MAC is what nTracer uses as a device's stable identity across rescans.
The output includes `"privileged": false` when this happened.

Flags:

- `--subnet 192.168.1.0/24` — scan a specific CIDR instead of auto-detecting
- `--discover-only` — ping sweep only, skip per-device fingerprinting (fast)

## Scan pipeline

1. **Ping sweep** (`-sn`) — live hosts, MAC, vendor via OUI lookup.
2. **Fragile tagging** — MAC vendors matching a known IoT list (Espressif,
   Sonoff, Ring, Nest, TP-Link/Kasa, Hue…) are flagged as fragile.
3. **Deep probe** —
   - normal devices: `-O -sV` full OS and service fingerprinting
   - fragile devices: `-sV --version-intensity 2` on a short port list, no
     `-O`, `-T2` timing — aggressive scans are what actually knock cheap IoT
     gear off the network.
4. **Rate limiting** throughout: `--max-rate 50`, parallelism capped at 10.

The fragile-vendor list lives in `FRAGILE_VENDORS` in
[`python/scan.py`](python/scan.py) — add to it if something in your house
keeps falling over.

## Output / save-file schema

`scan.py` prints one JSON object. A `.nettrace` save file is the same shape
plus an `edges` array and user-edited fields (`position`, `label`, `notes`).
See [`saved-maps/sample.nettrace`](saved-maps/sample.nettrace) for a complete
example.

```jsonc
{
  "version": 1,
  "subnet": "192.168.1.0/24",
  "privileged": true,          // false = ran without sudo, results are partial
  "router": { /* device object, id is always "router" */ },
  "devices": [ /* device objects */ ],
  "edges": [ { "source": "router", "target": "<device id>" } ],
  "last_scan": "2026-09-05T10:00:00Z"
}
```

A device object:

| Field | Notes |
| --- | --- |
| `id` | MAC address — stable identity across rescans. Falls back to IP when no MAC was available. |
| `ip`, `mac`, `vendor` | From the ping sweep. |
| `os_guess` | Bucketed label (`macOS`, `Windows`, `Linux`, `Embedded/IoT`, `Router`, `Unknown`). |
| `open_ports` | Sorted list of open TCP ports found. |
| `scan_profile` | `full`, `light` (fragile device) or `none`. |
| `status` | `online` / `offline`. Set by the rescan diff. |
| `position` | Canvas coordinates. Owned by the user, never overwritten by a rescan. |
| `label`, `notes`, `icon` | User-editable display fields. |
| `first_seen`, `last_seen` | ISO-8601 UTC. |

## Topology

Consumer routers (eero and friends) expose no LLDP or SNMP, so real physical
wiring isn't discoverable. nTracer draws a **star**: router at the top, every
device hanging directly off it. Drag nodes to rearrange — your layout is saved.

## Out of scope (v1)

Live packet capture, real physical-topology detection, work networks.
