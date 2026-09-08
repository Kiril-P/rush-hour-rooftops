# Rush Hour Rooftops

## Product brief

Build a polished, playable desktop browser game about connecting rooftop homes to matching rooftop destinations with a growing cable network. Tiny autonomous cabins travel out, serve demand, and return home. Players draw and revise connections, manage congestion, collect weekly construction upgrades, and survive until a destination remains overloaded for too long.

This is a visual and implementation capability test for Astra. The deliverable is a complete local game with attractive art, satisfying motion, reliable simulation, and replayability—not a mockup or a landing page. Target a first meaningful decision within 20 seconds and a typical first run of 5–10 minutes.

The user's direction is Mini Motorways with a rooftop cable-car theme and as little mechanical invention as possible. Preserve its core experience and familiar infrastructure roles. Use original graphics, sounds, map, title, and interface composition with a similarly calm, minimal visual language.

## Reference and specification authority

The [official Mini Motorways overview](https://dinopoloclub.com/games/mini-motorways/) describes drawing a network for a growing city, redesigning it to maintain flow, and managing upgrades. Its linked screenshots and trailer are the primary visual reference. Inspect them if browsing is available.

This PRD defines an explicit implementation contract. Its numbers, dispatch rules, queue semantics, and simplified junction algorithm are prototype design decisions, not verified descriptions of Mini Motorways internals. Reference familiarity does not guarantee correct simulation. When details are unspecified, choose the simplest consistent behavior and record it in the README; use the rules here over guesses about the reference.

## Scope and theme mapping

| Familiar role | Rooftop implementation |
| --- | --- |
| House and its cars | Small residential roof with two home-owned cabins |
| Matching destination | Larger commercial rooftop with a color and shape marker |
| Road network | Paired directional cable tracks on a square grid |
| Road junction | Small rooftop or pylon switching platform |
| Bridge | Reinforced cable span over a canal |
| Motorway | Numbered express cable between two distant nodes |
| Traffic light | Timed junction signal |
| Roundabout | Circular switching platform with greater throughput |
| Demand pins | Requests displayed above a destination roof |
| Weekly reward | Choice between two construction supply bundles |

Cabins behave like cars on a network: each owns its route, can turn at junctions, and returns home after service. The cable theme is stylized; fixed gondola loops, passenger transfers, timetables, fares, physics, and line management are outside scope. Building height is decorative and does not change connectivity. Keep one logical transport plane, with express links crossing above it.

Ship one original seeded city map, three commuter colors, a guided opening, endless progression, all infrastructure roles above, pause and speed controls, sound toggle, game over, restart, and a local best score. Additional maps, accounts, online scores, mobile polish, weather, and campaign progression are outside this build.

## Player experience

1. A compact city diorama appears with one residential roof and one matching destination. A short contextual hint says “Drag a cable from the home to the matching rooftop.”
2. Drawing the connection creates supports and cables. A request appears; a cabin leaves automatically, crosses the skyline, serves the request, and returns.
3. More homes and destinations appear with a gentle pop and clear highlight. The player extends or reorganizes the network.
4. Shared junctions and busy corridors cause visible queues. The player can separate routes, change connections, or spend a special upgrade.
5. Each simulation week pauses for a choice between two supply bundles.
6. An overloaded destination shows a conspicuous countdown ring. Clearing enough requests recovers it. Sustained overload ends the run.
7. The final city stays visible beneath a small results panel showing score, best score, days survived, and “Try again” / “New city.”

## World and construction

- Use a 32 × 22 logical node grid. Reveal a centered 16 × 12 region initially; expand its bounds at weekly milestones until the full map is visible. Fit the revealed area with a gentle camera transition. Freeze camera transforms during a drawing gesture.
- Give the city a narrow canal, muted city blocks, and small parks. Decorative buildings are visual only. Occupied gameplay roof footprints, parks designated as obstacles, and canal cells have explicit construction rules and readable silhouettes.
- Each gameplay roof occupies one logical cell and has a visible terminal. Terminals are endpoints, never shortcuts through a building. Give each spawned roof at least one legal neighboring approach cell.
- Ordinary construction joins neighboring nodes horizontally, vertically, or diagonally. Each undirected segment costs one cable piece and contains a lane in each direction. Diagonals take proportionally longer to traverse. An existing segment costs nothing to redraw.
- Intermediate nodes automatically create pylons or switching platforms. Lines sharing a node connect. Diagonal segments crossing inside a cell without a shared node are rejected with a clear preview; express links may cross freely without connecting.
- Dragging samples a contiguous grid path even during fast pointer movement. Show legal segments, invalid segments, and exact resource cost before committing on release. Commit the entire gesture atomically or leave the board unchanged with an explanation.
- Start with 35 ordinary cable pieces and one canal span. Drawing and editing work while paused. Invalid or unaffordable actions never consume inventory.
- A canal crossing is a straight, contiguous run across water between land nodes. It costs ordinary pieces for its segments plus one canal-span token per crossing. Reject branches or turns on water. Preview the complete crossing and its costs before committing.
- Erase a segment by right-clicking, or use an Erase tool and drag. Suppress the browser context menu over the board. Escape cancels an unfinished gesture. UI clicks never edit the map.

## Cabins, requests, and routing

Every home owns exactly two cabins of its color. Each destination generates individual requests of its color. A request is either unassigned or reserved by exactly one outbound cabin. Pending demand includes both states until service completes.

Cabin lifecycle: idle at home → outbound with one reserved request → servicing at destination → returning to its original home → idle. Completing service clears that request and increments score once. Returning consumes network capacity; a cabin cannot dispatch again until home. Use a 0.8-second service duration and one service slot per destination with a FIFO arrival queue. The destination queue is visible and uses the same pending requests; it does not generate extra demand.

Dispatch every 0.25 simulation seconds. Process unassigned requests oldest first, using a stable ID tie-break. Assign the nearest reachable idle matching cabin using shortest path by travel time, then cabin ID. Require a valid path home as well. Unreachable requests remain pending; different colors never satisfy them. Cabins travel at an initial ordinary speed of 2.5 grid units per second.

Use deterministic shortest paths with stable tie-breaks. Route cost includes edge travel time and fixed junction delay. Dynamic queue avoidance is unnecessary for this version: congestion should motivate the player's edits. Recompute at nodes when a route becomes invalid; continuous per-frame replanning is unnecessary.

Each directional lane has finite occupancy and a minimum following distance of 0.32 grid units. A trailing cabin slows or waits rather than overlapping. Opposing directions use separate lanes. Reservations for junction exits must include enough downstream space, preventing cabins from entering a junction they cannot leave.

### Junctions and special infrastructure

- A normal junction admits one cabin at a time in FIFO arrival order, with stable ID tie-breaks and a 0.35-second admission interval. Traffic waits before entry; turning is animated smoothly. Endpoints and degree-two bends do not impose junction delay.
- A signal upgrade applies to a junction of degree three or more. Split incoming approaches into two deterministic, visibly indicated phases, alternating every 3 seconds. During green, admit eligible cabins at 0.20-second intervals using the same downstream-space safety check. Diagonal approaches must belong to a defined phase. Show placement validity and phase feedback.
- A roundabout upgrade applies to a junction of degree three or more, removes signal control, and uses fair FIFO admission at 0.15-second intervals. Render circulation around the platform; a single logical junction controller is sufficient. Signals and roundabouts are mutually exclusive, with the displaced token refunded safely.
- An express cable consumes one express token, connects two distinct legal land nodes, has separate directional lanes, travels at 5 grid units per second, and ignores intermediate terrain and crossings. Cost and occupancy depend on its geometric length. It shares ordinary junction rules at its endpoints. Label both ends with the same number and show a distinct elevated arc. It never connects at intermediate crossings.
- Special upgrades must materially affect the simulation; they cannot be decorative buttons.

### Editing an active network

Favor predictable, safe reclamation over teleporting vehicles. Mark deleted infrastructure as retiring: new routes exclude it, but cabins already committed to routes containing it retain access until those trips reach home. Preserve their reserved route edges, including return paths, for that whole trip. Existing cabin routes can finish; new dispatch cannot claim retiring edges.

Render retiring segments as dashed and translucent. Refund their pieces and any associated special token exactly once after all trip references and occupants are gone. Upstream controllers remain alive until dependent trips drain. Cancel retirement if the player redraws the same segment before it disappears, without charging or refunding it. Inspect pending refunds in the inventory tooltip.

A stale or invalid assignment must release its request reservation exactly once. Cabin and request IDs remain stable through edits. If a truly unreachable state occurs despite these rules, expose it in debug diagnostics and preserve state rather than silently teleporting or dropping demand.

## Progression and balance

All timing below uses simulation time; collect the values in one tuning configuration.

| Parameter | Initial value |
| --- | --- |
| Day / week | 15 seconds / 105 seconds |
| Opening state | One home, one destination, one color |
| First request | After the first connection, or after 20 seconds |
| New home | Roughly every 22 seconds |
| New destination | Roughly every 55 seconds |
| Second / third color | Second / fourth destination |
| Normal destination request interval | 9 seconds, seeded ±10% jitter |
| Weekly demand increase | Multiply intervals by 0.94, minimum 3.5 seconds |
| Overload threshold | 6 pending requests |
| Overload grace | 25 seconds |
| Larger destination | Threshold 10; 1.5× request rate; same service slot |
| Entity limits | 36 homes, 12 destinations, 72 cabins |

Overload time accumulates while pending demand is at or above threshold. Below threshold it drains at twice real simulation speed until zero. Lose when any destination reaches 25 seconds. Show pending count and remaining grace clearly, using shape and animation as well as color.

After reaching the destination cap, gradually upgrade existing destinations to larger destinations. After all are upgraded, demand continues increasing to its configured minimum interval. Actual difficulty must be playtested: tune these starting values so an unattended connected starter network eventually fails, while thoughtful construction can survive several weeks.

At each week boundary, pause and offer two distinct seeded bundles. Each grants 20 ordinary cable pieces plus one special token: canal span, express cable, signal, or roundabout. Ensure an express option at week two and offer canal spans when new development needs them. Initial ordinary-piece inventory cap is unnecessary. Upgrade selection resumes the previously selected speed exactly once.

Use seeded randomness for spawn timing, locations, and offers. New destinations spawn with zero requests and 12 seconds before their first request. Before introducing a color, spawn a matching home in the same event. Validate that development has a constructible route within the current revealed area and available construction resources, including pending refunds or an immediately granted supply. Retry a bounded number of candidates, then defer the spawn. Never overwrite buildings, live cables, or reserved access cells. Existing player-created disconnections may still cause failure; the generator only guarantees a feasible connection opportunity.

## Visual direction

The board is the hero: a calm miniature city seen from a fixed, shallow oblique angle, with crisp geometric roofs, soft extruded walls, slender paired cables, and tiny legible moving cabins. Use a 2D or 2.5D renderer with deliberate depth sorting. True 3D is optional and should earn its complexity.

Aim for the visual calm and clarity of the reference: generous negative space, muted terrain, expressive colored destinations, minimal chrome, and smooth motion. Create an original city arrangement and interface. Suggested palette: warm ivory ground #F3EFE5, subdued stone #D9D5CC, blue-green water #B7D9D8, dark cable #46535D, coral #E97868, mustard #D5AB45, and teal #4B9E9A.

- Residential roofs are small and cozy; commercial roofs are larger with a distinct rooftop station. Use tiny vents, skylights, planters, and railings sparingly. Decorative height must never obscure terminals or requests.
- Give the three colors a circle, triangle, and square emblem. Repeat emblems on homes, destinations, and cabins for color-independent matching.
- Cables have restrained sag; paired directions remain distinguishable at normal zoom. Supports appear intentionally positioned. Cabins hang beneath cables with windows, a shadow, slight sway, and smoothly eased turns.
- Establish consistent layer ordering for ground, building walls, roofs, cables, cabins, and status markers. Fade an occluding decoration when necessary to keep routes readable. Logical picking must match the rendered grid projection.
- New roofs rise into view over roughly 400 ms. Route placement has a short draw-on animation. Service triggers a restrained pulse and request disappearance. Congestion is primarily shown by real waiting cabins.
- Keep water and ambient motion subtle. Reduced-motion mode removes sway, camera easing, and decorative pulses while retaining readable vehicle movement.
- Finish the default daylight scene before adding optional lighting variations. Avoid a generic dashboard, heavy panels, photorealism, and visual clutter.

At 1440 × 900, the map should occupy approximately 85% of the screen. A compact top bar shows title, delivered count, day/week, pause, speed, and sound. A floating bottom tray shows ordinary pieces and the four special tools with counts. Tooltips explain placement and costs. Demand markers remain above the board, and UI remains readable at 1280 × 720 and device pixel ratios 1 and 2.

## Controls, sound, and persistence

Mouse drag draws; right-click or Erase removes; Space toggles pause; 1 and 2 select normal and double speed; Escape cancels placement or closes a nonessential panel. Provide equivalent visible controls. Selecting an express tool uses two endpoint clicks with a preview between them. Special tools highlight eligible locations.

Pause stops movement, demand, overload, day progression, and spawns while permitting construction. Tutorial, weekly choice, and game-over states have explicit pause ownership. Returning from a hidden browser tab must not fast-forward the city; discard wall-clock backlog.

Use restrained synthesized or locally available original audio: construction tick, delivery chime with variation, new-building cue, warning pulse, and soft ambient bed. Start audio only after a user gesture. Sound can be muted and preference persists. Store best score and settings locally with graceful fallback when storage is unavailable. Restart with the same seed resets all simulation state; New city selects a new seed.

## Implementation and delivery

Inspect the repository first and preserve its existing stack if viable. In an empty repository, use TypeScript, Vite, a Canvas 2D game renderer, and lightweight HTML/CSS overlays. Keep simulation independent of rendering and inputs. Use a fixed simulation tick with render interpolation and seeded randomness; double speed advances simulation time rather than changing travel rules.

Separate world generation, graph/construction, routing, traffic/dispatch, progression, rendering, and UI sufficiently to test behavior without a browser. Prefer explicit entity IDs and cabin/request state machines. Cache routes by graph version when useful; avoid all-pairs routing every frame.

Include a development-only diagnostic overlay with seed, tick, entity counts, pending requests, reserved requests, retiring segments, graph version, and frame time. Provide deterministic fixtures for congestion, overload recovery, active-route deletion, and infrastructure upgrades so they can be inspected without waiting through a full run.

Deliver source, a concise README with exact run/build/test commands and controls, relevant automated tests, and screenshots of the opening, busy network, and overload state. Run locally and visually inspect the actual game. Public deployment and a pull request are not required. If creating a branch for a later PR, use the user's `kp/` prefix.

## Acceptance checks

### Simulation correctness

- A matching connected home dispatches, serves one request, increments score once, and returns its cabin. A mismatched or disconnected home does not dispatch.
- Two cabins cannot reserve the same request; pending demand equals unassigned plus reserved requests. Total cabins always equals twice the number of homes.
- Opposing cabins pass on separate lanes; following cabins maintain spacing; congested junctions queue visibly and eventually admit every eligible waiting approach.
- Deleting an occupied route, including its return leg and a special crossing, allows committed trips to finish and refunds each resource once. Redrawing retirement cancels it cleanly.
- Duplicate drawing, invalid crossings, failed gestures, insufficient inventory, and canceled placement leave correct resources and topology.
- Express links cross without creating accidental junctions. Signals change admission phases. Roundabouts increase measured throughput in a controlled congested fixture.
- Demand reaching the threshold starts overload; recovery drains it; sustained overload ends the game once. Score and motion stop afterward.
- Pause and hidden-tab behavior preserve simulation state. Equivalent simulation tick counts at 1× and 2× produce the same seeded outcome for the same tick-indexed inputs.
- Weekly rewards appear once per week, pause correctly, and grant exactly the selected bundle. Restart clears all old timers, reservations, audio loops, and event handlers.
- Seeded generation respects footprints, approach access, resource feasibility, and entity caps over a long automated simulation.

### Playability and presentation

- A new player can complete the first route from the on-screen hint and observe a successful delivery without reading the README.
- Play at least one real run through two weekly choices, use each special tool through play or fixtures, recover one overloaded destination, and reach game over and restart.
- At normal zoom, distinguish all roof types, three commuter types, both cable lanes, request warnings, tool selections, and retiring infrastructure.
- Inspect opening, dense traffic, placement previews, paused editing, upgrade choice, and game over at both target resolutions. Fix clipping, occlusion, inaccurate hit targets, and console errors.
- Aim for 60 fps with 72 cabins on the test machine; report the measured browser, scene size, and performance rather than asserting unsupported performance.
- Document any remaining issue with a reproduction. Completion requires a playable, visually finished build with the checks above satisfied, not merely a successful compilation.

## Suggested execution order

1. Establish the projected board and one complete request → dispatch → service → return cycle. Finish when it runs deterministically and is visible in the browser.
2. Add drawing, erasing, finite inventory, junction traffic, and safe retirement. Finish when active edits pass the correctness fixtures.
3. Add seeded growth, demand, overload, weekly choices, and all four infrastructure tools. Finish when a full run can end and restart reliably.
4. Finish rooftop art, cabin motion, UI, sound, and onboarding. Inspect actual screenshots and interaction at both resolutions.
5. Run the acceptance checks, tune a real playthrough, fix failures, and deliver the runnable game with evidence and concise instructions.
