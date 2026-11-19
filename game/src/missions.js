// NEON BAY's story and missions. Vic rolls into Neon Bay broke, and Rosa
// Marlowe — who runs the garage on Palm Row — puts him to work. The Sharks,
// Marlo Vane's crew, own the docks; Chief Dray's police own the streets.
// Six jobs, each a list of steps the world runs through in order. A step is
// one of:
//   goto     — reach the marked place (radius in `radius`)
//   steal    — get into any car (or the named car, `carKind`)
//   pickup   — stand on the marked spot to grab the package
//   deliver  — reach the marked place while carrying the package
//   wait     — stay inside the marked zone for `seconds`
//   eliminate— take down `count` rivals (spawned at the marked place)
//   loseheat — drop the wanted level to zero
//   timer    — the whole mission fails if `seconds` run out (set on the mission)
import { PLACES } from './config.js';

export const STORY_INTRO = [
  'NEON BAY — a sun-baked coastal city where the tide brings in money',
  'and trouble in equal measure.',
  'Vic arrives with $50 and a borrowed jacket. Rosa Marlowe, who runs',
  "the garage on Palm Row, has work — if Vic can handle the heat.",
];

export const MISSIONS = [
  {
    id: 1,
    title: 'Hot Wheels',
    giver: 'Rosa',
    brief: 'First rule of Neon Bay: wheels beat feet. Grab any car and bring it to my garage.',
    steps: [
      { type: 'steal', text: 'Steal a car — walk up to one and press E' },
      { type: 'goto', place: 'garage', radius: 110, text: "Drive it to Rosa's Garage" },
    ],
    reward: 150,
  },
  {
    id: 2,
    title: 'Package Run',
    giver: 'Rosa',
    brief: 'A client at the docks needs a package moved, quiet and fast. Pick it up, run it to the Saltwater Bar. Ninety seconds.',
    timer: 90,
    steps: [
      { type: 'goto', place: 'docks', radius: 110, text: 'Go to the Docks' },
      { type: 'pickup', place: 'docks', radius: 70, text: 'Pick up the package' },
      { type: 'deliver', place: 'beachBar', radius: 110, text: 'Deliver it to the Saltwater Bar' },
    ],
    reward: 250,
  },
  {
    id: 3,
    title: 'Lose the Heat',
    giver: 'Rosa',
    brief: "The Sharks tipped off the cops — you're hot. Lose the wanted level and meet me at the safehouse.",
    startWanted: 2,
    steps: [
      { type: 'loseheat', text: 'Lose the cops — stay out of sight until the stars clear' },
      { type: 'goto', place: 'safehouse', radius: 110, text: 'Reach the Safehouse' },
    ],
    reward: 200,
  },
  {
    id: 4,
    title: 'Dockside Payback',
    giver: 'Rosa',
    brief: "Marlo Vane's Sharks jumped one of my drivers at the docks. Go settle it. Fists or pistol — your call.",
    steps: [
      { type: 'goto', place: 'docks', radius: 160, text: 'Head to the Docks' },
      { type: 'eliminate', place: 'docks', count: 4, radius: 260, text: 'Take down 4 Sharks' },
    ],
    reward: 400,
  },
  {
    id: 5,
    title: 'The Marina Job',
    giver: 'Rosa',
    brief: 'The Marina Office keeps the weekend take in a floor safe. Hold the room while the safe cracks — the alarm will bring the whole precinct. Then vanish.',
    steps: [
      { type: 'goto', place: 'marina', radius: 110, text: 'Reach the Marina Office' },
      { type: 'wait', place: 'marina', radius: 90, seconds: 8, alarmWanted: 3, text: 'Hold the office while the safe cracks' },
      { type: 'goto', place: 'safehouse', radius: 110, text: 'Escape to the Safehouse' },
    ],
    reward: 600,
  },
  {
    id: 6,
    title: 'The Big Score',
    giver: 'Rosa',
    brief: "One last job and we're out. Marlo's Comet GT is parked at the casino — steal it and bring it to my yacht at the marina. The whole city will be watching.",
    steps: [
      { type: 'steal', carKind: 'comet', place: 'casino', radius: 200, text: 'Steal the Comet GT at the Casino' },
      { type: 'goto', place: 'yacht', radius: 120, text: "Deliver the Comet GT to Rosa's Yacht" },
    ],
    reward: 1000,
  },
];

export const STORY_END = [
  'The Comet GT purrs onto the yacht as the sun drops over the bay.',
  'Rosa tosses Vic the keys to the city. "Neon Bay is yours now."',
  'NEON BAY — story complete. Free roam unlocked. Keep the streets hot.',
];

/** Mission by its number (1-based), or null past the last one. */
export function missionByNumber(n) {
  return MISSIONS[n - 1] ?? null;
}

export function missionCount() {
  return MISSIONS.length;
}
