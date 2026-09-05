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
| 2 | Electron + React shell, static topology canvas | ✅ |
| 3 | Scan button wired end to end | ✅ |
| 4 | Save / load `.nettrace`, auto-load last map | ✅ |
| 5 | Rescan + diff (offline marking, layout preserved) | ✅ |
| 6 | Traceroute overlay | ⬜ |

## Requirements

- `nmap` (`brew install nmap`)
- Python 3.11+
- Node 18+

## Setup

```bash
python3 -m venv .venv
.venv/bin/pip install -r python/requirements.txt
npm install
```

## Running the app

```bash
npm run dev
```

Starts Vite with hot reload and opens the Electron window against it. For a
production-style run instead: `npm start` (builds to `dist/`, then launches
Electron off the built files).

The app reopens whatever map you last saved or opened. First run — or if that
file has since been moved — it falls back to the sample map in
[`saved-maps/sample.nettrace`](saved-maps/sample.nettrace) so there's
something to look at; hit **Scan** to replace it with your real network.

**Quick scan** (on by default) runs the ping sweep only — seconds instead of
minutes. Untick it for full OS and service fingerprinting.

**Run the app with `sudo` if you want a complete map.** Same reason as the CLI
above: without root, nmap can't ARP. nTracer shows a warning banner when a
scan comes back unprivileged, so you won't mistake a partial result for an
empty network.

nTracer looks for Python at `.venv/bin/python`, falling back to `python3`.
Override with the `NTRACER_PYTHON` environment variable.

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

## Scan vs. Rescan

**Scan** builds a map from scratch — whatever's on the canvas is replaced.

**Rescan** merges a fresh scan into the map you already have, matching devices
by `id` (MAC address):

| | What happens |
| --- | --- |
| Device still there | Refreshed with new scan data. Your `position`, `label` and `notes` are left alone, and `first_seen` is preserved. |
| Device gone | Marked `offline` — dimmed, with a dashed link. Never deleted, so an unplugged device keeps its place. |
| Device new | Added with a `new` badge, in a tray row below the existing layout so it can't land on top of nodes you've arranged. |

A summary lands in the banner: *"Rescan: 1 new · 1 went offline · 1 back
online · 1 still up"*.

One caveat, and it's the reason to run with sudo: an unprivileged scan has no
MAC addresses, so devices are identified by IP instead. A device that picks up
a new DHCP lease between rescans then looks like a brand new device. The merge
can't fix that — only root can.

The merge logic lives in [`src/lib/diff.js`](src/lib/diff.js).

## Saving and loading

| Action | Shortcut | Behaviour |
| --- | --- | --- |
| Save | `⌘S` | Writes to the current file. Prompts for a location the first time. |
| Save a copy | `⇧⌘S` | Always prompts. |
| Load | `⌘O` | Opens a `.nettrace` (or `.json`) file. |

The toolbar shows the current filename with a `•` when there are unsaved
changes — dragging a node counts, since your layout is part of the map.

Files are pretty-printed JSON so they stay readable and diffable. The path of
the last file you saved or opened is remembered in `electron-store` and
reopened on launch; if it's gone by then, nTracer quietly forgets it rather
than complaining.

## How the pieces talk

The renderer is fully sandboxed — no Node, no filesystem. Everything
privileged goes over IPC:

```
React (Scan button)
  → window.ntracer.scan()            electron/preload.js  (contextBridge)
  → ipcMain.handle('scan:run')       electron/main.js
  → spawn python/scan.py             electron/scanner.js
  ← one JSON object on stdout
  ← { ok: true, map } | { ok: false, error }
```

Save and load work the same way (`map:save`, `map:load`, `map:load-last` in
[`electron/mapFiles.js`](electron/mapFiles.js)), with native dialogs owned by
the main process. If the preload script ever fails to load, the renderer falls
back to a stub bridge and says so in a banner, rather than showing a blank
window.

Failures cross the bridge as data, never as exceptions, so the renderer only
ever has two cases to handle. `scan.py` reports its own errors as JSON too, so
unparseable stdout means something went wrong before Python got that far —
usually a missing `nmap`.

## Layout

Positions are only ever *filled in*, never overwritten: `applyStarLayout` in
[`src/lib/layout.js`](src/lib/layout.js) assigns an arc position to nodes that
don't have one and leaves everything else alone, so dragging a node — or
loading a saved map — always wins over the automatic layout.

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
