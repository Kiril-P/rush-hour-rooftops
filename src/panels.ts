import { type MixLevels } from "./audio-score";
import { type World, TUNE, type Tool, type Supply, pending } from "./model";
import { icon } from "./icons";
import { roofInsight, shapes } from "./insight";
export const tools: Tool[] = [
  "cable",
  "express",
  "roundabout",
  "erase",
  "inspect",
];
export const toolNames: Record<Tool, string> = {
  cable: "Cable",
  express: "Express",
  roundabout: "Interchange",
  erase: "Erase",
  inspect: "Inspect",
  span: "Legacy span",
  signal: "Legacy signal",
};
export const descriptions: Record<Tool, string> = {
  cable:
    "Drag in any direction, including diagonally. Gardens stay clear; roofs are endpoints.",
  express:
    "Click two endpoints. A faster direct link that crosses cables and skips junctions.",
  roundabout:
    "Click a junction with 3+ approaches. More than twice the switching capacity.",
  erase:
    "Sweep over cables or right-click. Occupied cables return supplies after trips finish.",
  inspect:
    "Click a roof or junction to see its routes, available cabins and queues.",
  span: "",
  signal: "",
};
export function helpPanel() {
  return `<section class="modal-card help"><button class="close" id="close-help" aria-label="Close help">${icon("close")}</button><span class="eyebrow">WELCOME TO BELLWETHER</span><h2 id="modal-title">Small cabins.<br>Big connections.</h2><p>Connect homes to stations with the same color and shape. Each home has two cabins. Every delivery is a round trip.</p><div class="help-steps"><div><b>01</b><p><strong>Draw your first connection</strong>Drag between the bright roof terminals. Diagonals work. Build anywhere inside the dotted city boundary, keeping garden islands clear.</p></div><div><b>02</b><p><strong>Watch the flow</strong>Rush hours bring more commuters. Click a station to see whether it needs another home, a shorter route, or relief at a junction.</p></div><div><b>03</b><p><strong>Give the city room</strong>Every week brings supplies. Express skips junctions; Interchanges make busy junctions faster. Separate routes can help just as much.</p></div></div><div class="keys"><span><kbd>Space</kbd> Pause & build</span><span><kbd>C</kbd> Cable</span><span><kbd>E</kbd> Erase</span><span><kbd>I</kbd> Inspect</span><span><kbd>Esc</kbd> Cancel / menu</span></div><p class="small">New stations wait up to ${TUNE.stationGrace}s for a connection before opening. At ${TUNE.overload} requests (${TUNE.largeOverload} at a large station), you have ${TUNE.grace}s to reduce the queue. Pause any time to redesign. Scroll to zoom; Alt-drag or arrows pan; F fits the city.</p><button class="primary" id="close-help-play">Back to the rooftops <span>↗</span></button></section>`;
}
export function menuPanel(levels: MixLevels, enabled: boolean) {
  return `<section class="modal-card menu"><span class="eyebrow">A MOMENT ABOVE IT ALL</span><h2 id="modal-title">Room to think.</h2><p>The city will wait for you.</p><button class="primary" id="resume">Resume city <span>↗</span></button><fieldset class="audio-mixer"><legend>Sound above the clouds</legend><button id="menu-sound" type="button" aria-pressed="${enabled}">${enabled ? "Sound on" : "Sound off"}</button>${(["music", "ambience", "effects"] as const).map((channel) => `<label for="volume-${channel}"><span>${channel === "music" ? "Music" : channel === "ambience" ? "Ambience" : "Effects"}</span><input id="volume-${channel}" data-volume="${channel}" type="range" min="0" max="100" step="1" value="${Math.round(levels[channel] * 100)}"><output id="volume-${channel}-value" for="volume-${channel}">${Math.round(levels[channel] * 100)}%</output></label>`).join("")}</fieldset><div class="menu-actions"><button id="menu-help">How to play</button><button id="retry">Restart this city</button><button id="new-city">Start a new city</button></div><span class="modal-note">You can also pause with Space and build at your own pace.</span></section>`;
}
export function suppliesPanel(w: World) {
  const copy: Record<Supply, [string, string]> = {
    cable: [
      "Room to build",
      "Separate busy routes and bring more homes into service.",
    ],
    express: [
      "Above the rush",
      "A direct cable with double speed. Bypass the busiest part of your network.",
    ],
    roundabout: [
      "Keep it flowing",
      "Upgrade a junction with 3+ approaches to more than twice its capacity.",
    ],
  };
  return `<section class="modal-card supplies"><span class="eyebrow">WEEK ${String(w.claimedWeeks + 1).padStart(2, "0")} COMPLETE</span><h2 id="modal-title">A little room to grow.</h2><p>The skyline is opening up. Choose how your network grows.</p><div class="supply-options">${w.weekly!.map((t) => `<button class="supply" data-supply="${t}"><span class="supply-art">${icon(t)}</span><h3>${copy[t][0]}</h3><span class="supply-count">${t === "cable" ? `+${TUNE.bulkCables} cables` : `+${TUNE.supplyCables} cables <i>+</i> 1 ${toolNames[t]}`}</span><p>${copy[t][1]}</p><span class="choose">Choose supplies <span>↗</span></span></button>`).join("")}</div><button class="text-button" id="inspect-week">Look at my network first</button></section>`;
}
export function resultsPanel(w: World, best: number) {
  const roof = w.failedRoof === null ? null : w.roofs.get(w.failedRoof),
    info = roof ? roofInsight(w, roof) : null;
  return `<section class="modal-card results"><span class="result-icon">${icon("cable")}</span><span class="eyebrow">THE CITY TAKES A BREATHER</span><h2 id="modal-title">A station reached its limit.</h2><p>${roof ? `${shapes[roof.color]} station had ${pending(w, roof.id)} requests waiting after ${TUNE.grace}s of overload.` : "The network could not keep up with demand."}</p><p class="failure-detail">${info ? info.status + ". " + (info.connected && info.bottleneck === null ? "Shorten the round trip or connect another matching home to increase this station’s capacity." : info.detail.replace(/^\d+s to clear the queue\. /, "")) : ""}</p><div class="result-stats"><div><strong>${w.score}</strong><span>DELIVERED</span></div><div><strong>${Math.floor(w.time / TUNE.day) + 1}</strong><span>DAYS SURVIVED</span></div><div><strong>${best}</strong><span>PERSONAL BEST</span></div></div><button class="primary" id="inspect-failure">Inspect the final network <span>↗</span></button><div class="menu-actions"><button id="retry">Try this city again</button><button id="new-city">Start a new city</button></div><span class="seed-label">BELLWETHER · CITY ${w.seed}</span></section>`;
}
