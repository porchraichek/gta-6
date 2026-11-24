// The story of PALMERA NIGHTS: Nico Vega comes home to Palmera Bay and collects what crime boss Victor Hale owes him.
import { say, goTo, getVehicle, kill, holdAt, escapeWanted, instant, chase } from './missionSteps.js';

export const CHARACTERS = {
  Nico: { color: '#ffd166' },
  Dani: { color: '#7cf29a' },
  Sal: { color: '#8ecae6' },
  Hale: { color: '#ff6b6b' },
  Quint: { color: '#9bb7ff' },
};

export const MISSIONS = [
  {
    id: 'fresh-air', title: 'Fresh Air', giver: 'diner', giverName: 'Dani',
    summary: 'Two years inside. Dani is waiting at the Seagull Diner.',
    intro: [
      ['Dani', "Nico Vega. Two years and you still walk like you own the boardwalk."],
      ['Nico', "Only the sunsets, Dani. Everything else got sold while I was away."],
      ['Dani', "Hale sold it. Victor Hale took your cut of the Marrow job and bought himself a casino."],
      ['Nico', "Then I'm collecting. I need wheels."],
      ['Dani', "Borrow one. Any one. Walk up, hit F, and drive to my garage on Cobalt Row. Okafor Auto, follow the marker."],
    ],
    steps: [
      goTo({ at: { lm: 'garage' }, text: 'Steal a car (F) and drive to Okafor Auto', needVehicle: true, radius: 6 }),
      say([['Dani', 'Smooth. The cops will not even remember that one.'], ['Dani', "Come back when you're ready. I have work that pays."]]),
    ],
    reward: { money: 300, rep: 1 },
  },
  {
    id: 'valet', title: 'Valet Parking', giver: 'garage', giverName: 'Dani',
    summary: 'Take a Vesper RS from the Bellamy Yacht Club and bring it back in one piece.',
    intro: [
      ['Dani', "Fresh start, fresh set of wheels. A Vesper RS is parked at the Bellamy Yacht Club, east side."],
      ['Dani', "Hale's money laundering buyer owns it. Bring it here with the paint intact; a dented Vesper pays nothing."],
    ],
    steps: [
      getVehicle({ type: 'sports', at: { lm: 'yacht', dz: 14, dx: 10 }, heading: 3.14, color: 0xe63946, name: 'Vesper RS', text: 'Take the red Vesper from the Yacht Club' }),
      instant((m) => { m.G.wanted.setStars(1); m.G.hud.notify('The valet saw you take it!', 'warn'); }),
      goTo({ at: { lm: 'garage' }, text: 'Bring the Vesper to Okafor Auto', missionVehicle: true, radius: 6 }),
      say([['Dani', 'Beautiful. Hale will be sick when he hears.']]),
    ],
    reward: { money: 800, rep: 1 },
  },
  {
    id: 'collections', title: 'Collections', giver: 'garage', giverName: 'Dani',
    summary: "Hale's collectors are squeezing shop owners at Dock 9. Send a message.",
    intro: [
      ['Dani', "Hale's collectors are leaning on shop owners down at Dock 9. They carry pipes, not guns."],
      ['Nico', "Then I won't need one. Fists first."],
      ['Dani', "Left click to punch, Shift to sprint, Space to jump. Don't get cornered."],
    ],
    steps: [
      goTo({ at: { lm: 'docks' }, text: 'Go to the Dock 9 warehouse', radius: 14 }),
      kill({ at: { lm: 'docks', dz: -2 }, count: 5, weapon: 'fists', text: "Beat down Hale's collectors", spread: 8, aggro: 22 }),
      instant((m) => { m.G.player.giveWeapon('pistol', 48); m.G.hud.notify('Dani gave you a Sidewinder .9 pistol (key 2)', 'good'); }),
      say([['Dani', "Word is already on the street. Take this pistol; you'll need it for what's next."]]),
    ],
    reward: { money: 1200, rep: 1 },
  },
  {
    id: 'rush-delivery', title: 'Rush Delivery', giver: 'garage', giverName: 'Dani',
    summary: "Haul a van of 'cargo' across town to the diner before the timer ends.",
    intro: [
      ['Dani', "There's a van outside loaded with cargo for the Seagull Diner. Sal's handling the buyers."],
      ['Dani', "It's hot. Somebody already tipped the police, so expect company. Don't wreck it."],
    ],
    steps: [
      getVehicle({ type: 'van', at: { lm: 'garage', dz: 12 }, heading: 0, color: 0xf1faee, name: 'Hauler V', text: 'Get in the delivery van parked outside' }),
      instant((m) => { m.G.wanted.setStars(2); }),
      goTo({ at: { lm: 'diner' }, text: 'Deliver the van to Seagull Diner', missionVehicle: true, time: 190, radius: 6 }),
      say([['Sal', 'Right on time. Cops on your tail? Not my problem, friend.'], ['Nico', 'Never is.']]),
    ],
    reward: { money: 1500, rep: 1 },
  },
  {
    id: 'hostile-takeover', title: 'Hostile Takeover', giver: 'garage', giverName: 'Dani',
    summary: "Hale's crew is guarding the Lucky Palm Casino. Take them out with the pistol.",
    intro: [
      ['Dani', "Hale's crew keeps the Lucky Palm running. Without them, his money stops flowing."],
      ['Nico', "Six guns on the front steps, right?"],
      ['Dani', "Six. Hold RMB to aim, left click to fire, R to reload. Use cover, the walls help."],
    ],
    steps: [
      goTo({ at: { lm: 'casino' }, text: 'Go to the Lucky Palm Casino', radius: 22 }),
      kill({ at: { lm: 'casino', dz: 2 }, count: 6, weapon: 'pistol', text: "Take out Hale's crew", spread: 11, aggro: 40, health: 60 }),
      say([['Dani', 'Hale just lost his front door. He knows your name now.']]),
    ],
    reward: { money: 2200, rep: 1 },
  },
  {
    id: 'chase-the-rat', title: 'Chase the Rat', giver: 'diner', giverName: 'Sal',
    summary: 'Sal Brennan sold you out to Hale. Run him down before he reaches the safehouse.',
    intro: [
      ['Sal', "Nico! Please. It wasn't personal. Hale had my kids' school fees in his pocket."],
      ['Nico', "Then you can explain it to the bumper of my car."],
    ],
    steps: [
      chase({ type: 'sedan', at: { lm: 'diner', dz: 12 }, heading: 3.14, color: 0x8338ec, text: "Wreck Sal's purple Marlin before he gets away", speedFactor: 0.8 }),
      say([['Dani', 'Is the rat quiet?'], ['Nico', 'For good. He talked first, though. The vault job is on Friday: Palmera Trust.']]),
    ],
    reward: { money: 2800, rep: 1 },
  },
  {
    id: 'clean-getaway', title: 'Clean Getaway', giver: 'garage', giverName: 'Dani',
    summary: "Crack Hale's cash vault at Palmera Trust and shake the whole police department.",
    intro: [
      ['Dani', "Hale's dirty money sits in a vault at Palmera Trust. Quint's cops are on Hale's payroll, so expect a reception."],
      ['Nico', "Cash for the vault, bullets for the cops."],
      ['Dani', "Don't fight them. Drive. Break line of sight, duck into side streets, and the heat fades."],
    ],
    steps: [
      goTo({ at: { lm: 'bank' }, text: 'Go to Palmera Trust', radius: 10 }),
      holdAt({ at: { lm: 'bank' }, seconds: 7, text: 'Hold position while the crew cracks the vault' }),
      instant((m) => { m.G.wanted.setStars(4); m.G.player.addMoney(2000); m.G.hud.notify('Vault cracked: +$2,000. The alarm is going off!', 'warn'); }),
      say([['Dani', "Alarm's live! Four squads inbound. Go go go!"]]),
      escapeWanted({ stars: 0, text: 'Lose the police: break line of sight' }),
      goTo({ at: { lm: 'garage' }, text: 'Return to Okafor Auto', radius: 7 }),
      say([['Dani', "You're a legend. Quint looks like she swallowed a lemon."]]),
    ],
    reward: { money: 4000, rep: 2 },
  },
  {
    id: 'hale-mate', title: 'Hale Mate', giver: 'garage', giverName: 'Dani',
    summary: "Storm Hale Villa in Verde Hills. End Victor Hale's rule over Palmera Bay.",
    intro: [
      ['Dani', "Hale's at his villa in Verde Hills with every goon he owns. This is it."],
      ['Nico', "Two years of sunsets from a cell window. I'm going to enjoy this one."],
      ['Dani', "Bring the SMG from Gunnar's Arms. And a fast car. He will run."],
    ],
    steps: [
      goTo({ at: { lm: 'villa' }, text: 'Drive up to Hale Villa in Verde Hills', radius: 28 }),
      kill({ at: { lm: 'villa', dz: -2 }, count: 8, weapon: 'smg', text: "Clear Hale's guards", spread: 12, aggro: 45, health: 65, armor: 20 }),
      kill({ at: { lm: 'villa', dz: -10 }, count: 1, weapon: 'smg', text: 'Take down Victor Hale', spread: 2, aggro: 60, health: 240, armor: 90, boss: true, damage: 6 }),
      say([['Hale', "You can't kill a man who owns the city, Vega!"], ['Nico', 'Watch me.']]),
      chase({ type: 'sports', at: { lm: 'villa', dz: 24 }, heading: 3.14, color: 0x151515, text: "Wreck Hale's getaway Vesper", speedFactor: 0.9, escapeDist: 280, boss: true }),
      say([['Quint', "All units, stand down. The Hale organisation is finished."], ['Nico', 'Palmera Bay looks better at sunset. Roll credits, Dani.']]),
    ],
    reward: { money: 20000, rep: 5 },
    finale: true,
  },
];
