// The story of PALMERA NIGHTS: Nico Vega comes home to Palmera Bay and collects what crime boss Victor Hale owes him.
// Three acts, thirteen jobs, two choices (Sal's fate, Quint's deal) that colour later scenes and the ending.
import { say, goTo, getVehicle, kill, holdAt, escapeWanted, instant, chase, choice } from './missionSteps.js';
import { tail, armoredTruck, fleeBlast } from './missionStepsVehicles.js';
import { waves, stealth } from './missionStepsCombat.js';

export const CHARACTERS = {
  Nico: { color: '#ffd166', role: 'Two years inside for a job Hale planned. Out, broke and patient.' },
  Dani: { color: '#7cf29a', role: 'Dani Okafor, runs Okafor Auto on Cobalt Row. Nico\'s oldest friend.' },
  Teo: { color: '#f4a261', role: 'Teo Okafor, Dani\'s nephew. Scanner radio, fast mouth, faster car.' },
  Sal: { color: '#8ecae6', role: 'Sal Brennan, diner regular and Hale\'s informant.' },
  Hale: { color: '#ff6b6b', role: 'Victor Hale, owns the Lucky Palm and most of the people in it.' },
  Quint: { color: '#9bb7ff', role: 'Detective Rosa Quint, Palmera PD. Plays her own long game.' },
  Pratt: { color: '#c3b5e8', role: 'Lionel Pratt, Hale\'s bookkeeper. Keeps the ledger on his yacht.' },
  Mako: { color: '#e76f51', role: 'Augustin "Mako" Ferro, Hale\'s enforcer.' },
};

const giveSmg = (m) => {
  const P = m.G.player;
  if (!P.weapons.smg) { P.giveWeapon('smg', 90); m.G.hud.notify('Teo slipped you a Hornet SMG (key 3)', 'good'); }
  else P.giveWeapon('smg', 60);
};

export const MISSIONS = [
  // ---------------- ACT ONE: COMING HOME
  {
    id: 'fresh-air', title: 'Fresh Air', giver: 'diner', act: 1,
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
    reward: { money: 300, rep: 1, unlock: 'Gull Express courier runs are open (C on the map).' },
  },
  {
    id: 'valet', title: 'Valet Parking', giver: 'garage', act: 1,
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
    id: 'collections', title: 'Collections', giver: 'garage', act: 1,
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
    reward: { money: 1200, rep: 1, unlock: "Quint's bounty board is open at Palmera PD (B on the map)." },
  },
  {
    id: 'rush-delivery', title: 'Rush Delivery', giver: 'garage', act: 1,
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
    reward: { money: 1500, rep: 1, unlock: 'Properties are for sale around the bay ($ on the map).' },
  },
  {
    id: 'paper-trail', title: 'Paper Trail', giver: 'garage', act: 1,
    summary: "Hale's bagman leaves Palmera Trust every evening. Follow him without being seen.",
    intro: [
      ['Teo', "You're the famous Nico? I thought you'd be taller. I'm Teo. Dani's nephew. I listen to police radios for fun."],
      ['Dani', "Teo's been watching Palmera Trust. Every night a grey Marlin leaves with Hale's take."],
      ['Teo', "Follow it. Not too close, not too far. If he clocks you, he dumps the bag and we learn nothing."],
    ],
    steps: [
      goTo({ at: { lm: 'bank', dz: 4 }, text: 'Wait near Palmera Trust in a car', needVehicle: true, radius: 12 }),
      say([['Teo', "There. Grey Marlin, pulling out now. Give him room."]]),
      tail({ type: 'sedan', at: { lm: 'bank', dx: -14, dz: 6.5 }, heading: -Math.PI / 2, color: 0x8d99ae, dest: { lm: 'docks', dz: 11 }, name: 'the bagman', text: 'Tail the grey Marlin. Stay out of his mirrors' }),
      say([
        ['Teo', "Dock 9. He's handing the bag to... is that Sal from the diner?"],
        ['Nico', "Sal Brennan. Eating Dani's burgers and selling us to Hale."],
        ['Dani', "We'll deal with Sal. First, Hale gets a message he can't ignore."],
      ]),
    ],
    reward: { money: 1800, rep: 1 },
  },
  // ---------------- ACT TWO: WAR
  {
    id: 'hostile-takeover', title: 'Hostile Takeover', giver: 'garage', act: 2,
    summary: "Hale's crew is guarding the Lucky Palm Casino. Take them out with the pistol.",
    intro: [
      ['Dani', "Hale's crew keeps the Lucky Palm running. Without them, his money stops flowing."],
      ['Nico', "Six guns on the front steps, right?"],
      ['Dani', "Six. Hold RMB to aim, left click to fire, R to reload. Use cover, the walls help."],
    ],
    steps: [
      goTo({ at: { lm: 'casino' }, text: 'Go to the Lucky Palm Casino', radius: 22 }),
      kill({ at: { lm: 'casino', dz: 2 }, count: 6, weapon: 'pistol', text: "Take out Hale's crew", spread: 11, aggro: 40, health: 60 }),
      say([['Dani', 'Hale just lost his front door. He knows your name now.'], ['Teo', "Uh, guys? Radio says a lot of cars just left the Lucky Palm. Heading for Cobalt Row."]]),
    ],
    reward: { money: 2200, rep: 1 },
  },
  {
    id: 'under-siege', title: 'Under Siege', giver: 'garage', act: 2,
    summary: "Hale's crews are coming for Okafor Auto. Hold the garage.",
    intro: [
      ['Dani', "He's coming for the garage. My father built this place with his own hands."],
      ['Nico', "Then nobody gets through the door. Stay inside, Dani."],
      ['Teo', "Three crews, maybe more. Keep them away from the shutters!"],
    ],
    steps: [
      instant(giveSmg),
      waves({ at: { lm: 'garage' }, protect: true, radius: 12, text: 'Defend Okafor Auto', waves: [
        { count: 4, weapon: 'pistol', health: 60 },
        { count: 5, weapon: 'pistol', health: 70 },
        { count: 6, weapon: 'smg', health: 70, armor: 20 },
      ] }),
      say([
        ['Dani', "They're running. Look at my shutters. Look at them!"],
        ['Teo', "Got a voice on the radio. Sal told them you'd be here alone. Sal's at the diner right now."],
        ['Nico', "Then so am I."],
      ]),
    ],
    reward: { money: 2600, rep: 1 },
  },
  {
    id: 'chase-the-rat', title: 'Chase the Rat', giver: 'diner', act: 2,
    summary: 'Sal Brennan sold you out to Hale. Run him down before he gets away.',
    intro: [
      ['Sal', "Nico! Please. It wasn't personal. Hale had my kids' school fees in his pocket."],
      ['Nico', "Then you can explain it to the bumper of my car."],
    ],
    steps: [
      chase({ type: 'sedan', at: { lm: 'diner', dz: 12 }, heading: 3.14, color: 0x8338ec, text: "Wreck Sal's purple Marlin before he gets away", speedFactor: 0.8 }),
      say([['Sal', "Okay! Okay! I'm out, I'm out of the car. Don't shoot."], ['Sal', "Hale keeps everything in a ledger. His bookkeeper, Pratt. He lives on a yacht at the Bellamy club."]]),
      choice({ flag: 'sal', prompt: 'Sal is on his knees in the road. What now?', options: [
        { id: 'spared', label: 'Let him go. Tell him to leave Palmera Bay tonight.', lines: [['Nico', "Get your kids and get on a bus. If I see you again, this ends differently."], ['Sal', "You won't. I swear. I owe you one, Nico."]] },
        { id: 'dead', label: "Finish it. Hale's informants don't get second chances.", lines: [['Nico', "You picked a side two years ago, Sal."], ['Dani', "...Is it done? Okay. Okay. Come back to the garage."]] },
      ] }),
    ],
    reward: { money: 2800, rep: 1 },
  },
  {
    id: 'quiet-water', title: 'Quiet Water', giver: 'garage', act: 2,
    summary: "Lionel Pratt keeps Hale's ledger at the Bellamy Yacht Club. Get in and out without a fuss.",
    intro: (f) => [
      ['Dani', "Pratt's ledger has every bribe Hale ever paid. Every cop, every councilman."],
      f.sal === 'spared' ? ['Teo', "Sal's tip checks out, by the way. Guess he really did owe you one."] : ['Teo', "Pratt doesn't know Sal talked. Nobody's left to tell him."],
      ['Dani', "Pratt has guards on the dock. If they raise the alarm, he runs. Stay behind them, out of their sight lines."],
      ['Teo', "Walk up behind a guard and press E. Quietly. No guns, they'll hear it from the boulevard."],
    ],
    steps: [
      goTo({ at: { lm: 'yacht', dz: 12 }, text: 'Go to the Bellamy Yacht Club on foot', radius: 6 }),
      stealth({
        at: { lm: 'yacht', dz: -10 }, text: 'Take down Lionel Pratt without being seen',
        target: { at: [-18, -12], name: 'Pratt', health: 80 },
        guards: [
          { at: [-26, 6], patrol: [[-26, 6], [10, 6]] },
          { at: [-30, -12], patrol: [[-30, -12], [-30, 8]] },
          { at: [-6, -15], patrol: [[-6, -15], [8, -15]] },
          { at: [18, 8], patrol: [[18, 8], [32, 8], [32, -12]], weapon: 'smg' },
        ],
      }),
      instant((m) => {
        if (m.stealthClean) { m.G.player.addMoney(1500); m.G.hud.notify('Ghost bonus: nobody saw a thing. +$1,500', 'good'); }
        m.G.hud.notify("You took Pratt's ledger.", 'info');
      }),
      say([['Nico', "Got the ledger. Half of Palmera PD is in here."], ['Dani', "Then keep it somewhere safe. People will want that book."]]),
    ],
    reward: { money: 3200, rep: 1 },
  },
  {
    id: 'iron-wagon', title: 'Iron Wagon', giver: 'garage', act: 2,
    summary: "Hale is moving the casino's cash in an armored truck. Stop it, crack it, vanish.",
    intro: [
      ['Teo', "Ledger says every Friday an Ironside truck moves casino cash across the city. Today's Friday."],
      ['Dani', "Armored van, three guards inside. Shoot it or ram it until the engine dies, then deal with whoever climbs out."],
      ['Nico', "And don't blow it up. Got it."],
    ],
    steps: [
      goTo({ at: [-180, -278], text: 'Get to the ambush corner in Verde Hills', radius: 14 }),
      say([['Teo', "Truck's rolling. Green Hauler with steel plates. It's coming your way."]]),
      armoredTruck({ route: [[1, 3], [4, 3], [4, 6], [7, 6], [7, 8], [9, 8], [9, 6], [8, 6]], text: 'Disable the armored truck before it reaches the vault', guards: 3, health: 700 }),
      holdAt({ at: (m) => ({ x: m.truck.x - Math.sin(m.truck.heading) * 4, z: m.truck.z - Math.cos(m.truck.heading) * 4 }), seconds: 6, radius: 5, text: 'Pry open the back doors' }),
      instant((m) => { m.G.player.addMoney(5000); m.G.wanted.setStars(3); m.G.hud.notify('Cash bags grabbed: +$5,000. Sirens everywhere.', 'warn'); }),
      escapeWanted({ text: 'Lose the police' }),
      say([['Dani', "Hale just paid for my new shutters. And then some."]]),
    ],
    reward: { money: 3500, rep: 2 },
  },
  // ---------------- ACT THREE: THE SUNSET
  {
    id: 'container-nine', title: 'Container Nine', giver: 'race', act: 3,
    summary: "Hale's weapons shipment lands at Dock 9 tonight. Take it before his crews do.",
    intro: [
      ['Teo', "My friends at Neon Lap say a ship came in heavy. Container nine, Dock 9. Hale's new guns."],
      ['Dani', "He's arming every crew he has left. If he gets that shipment, we're done."],
      ['Nico', "Then the shipment gets a new owner."],
    ],
    steps: [
      instant(giveSmg),
      goTo({ at: { lm: 'docks' }, text: 'Go to Dock 9', radius: 18 }),
      waves({ at: { lm: 'docks', dz: -2 }, text: "Clear Hale's dock crews", radius: 14, leash: 70, waves: [
        { count: 5, weapon: 'pistol', health: 65 },
        { count: 6, weapon: 'smg', health: 70, armor: 20 },
        { count: 4, weapon: 'smg', health: 90, armor: 40 },
      ] }),
      getVehicle({ type: 'van', at: { lm: 'docks', dz: 12 }, heading: Math.PI / 2, color: 0x264653, name: 'shipment van', text: 'Take the loaded shipment van', health: 260 }),
      instant((m) => m.G.wanted.setStars(2)),
      goTo({ at: { lm: 'garage' }, text: 'Bring the shipment to Okafor Auto', missionVehicle: true, radius: 7 }),
      say([
        ['Quint', "Nice haul, Mr. Vega. Don't reach for anything. I'm just here to talk."],
        ['Quint', "Detective Rosa Quint. I know you have Pratt's ledger. Half my department is in it."],
        ['Quint', "Give it to me and Hale's protection disappears. Tomorrow, nobody in a uniform helps him run."],
        ['Dani', "Or we sell it to every crew in the bay and retire. Your call, Nico."],
      ]),
      choice({ flag: 'quint', prompt: "Quint wants Pratt's ledger.", options: [
        { id: 'deal', label: 'Hand Quint the ledger. Let her clean house.', lines: [['Quint', "Smart. When you go for Hale, my people will be looking the other way."], ['Nico', "Make sure they're looking at him."]] },
        { id: 'sold', label: 'Keep it. Sell copies to the highest bidders (+$10,000).', effect: (m) => m.G.player.addMoney(10000), lines: [['Quint', "Your funeral, Vega. Hale still owns enough badges to make it a big one."], ['Dani', "Ten grand richer and one more enemy. Classic Nico."]] },
      ] }),
    ],
    reward: { money: 4000, rep: 2 },
  },
  {
    id: 'special-delivery', title: 'Special Delivery', giver: 'garage', act: 3,
    summary: "Hale left a gift in Dani's van. Get it away from people before it goes off.",
    intro: [
      ['Hale', "Nico. You've been busy. I left something for your friend. In her van. It's ticking."],
      ['Hale', "Drive it gently, or don't. I win either way."],
      ['Dani', "Nico, there's a box under the seat with a timer! Get it to the water, the empty beach past Coral Beach!"],
      ['Teo', "Hard bumps set it off early. Drive like there's eggs on the roof."],
    ],
    steps: [
      getVehicle({ type: 'van', at: { lm: 'garage', dz: 12 }, heading: Math.PI / 2, color: 0xffd166, name: "Dani's van", text: "Get in Dani's rigged van", health: 220 }),
      goTo({ at: [588, 150], text: 'Drive the bomb to the empty east beach. Avoid heavy crashes', missionVehicle: true, time: 115, radius: 10, damageLimit: 0.55, damageFail: 'A hard crash set off the bomb.' }),
      fleeBlast({ seconds: 8, radius: 25, text: 'Get out and run!' }),
      say([['Teo', "That was... a big boom. You okay?"], ['Nico', "Hale wants to play with fire. Fine. Tonight we go to his house."]]),
    ],
    reward: { money: 4500, rep: 2 },
  },
  {
    id: 'last-sunset', title: 'Last Sunset', giver: 'garage', act: 3, finale: true,
    summary: "Storm Hale Villa in Verde Hills. End Victor Hale's rule over Palmera Bay.",
    intro: (f) => [
      ['Dani', "Hale's at his villa in Verde Hills with every goon he has left. This is it."],
      f.quint === 'deal' ? ['Quint', "Patrols are rerouted. You have the hills to yourself, Vega. Make it count."] : ['Teo', "Scanner's full of Hale's tame cops. Expect a few on the road."],
      ['Nico', "Two years of sunsets from a cell window. I'm going to enjoy this one."],
    ],
    steps: [
      instant(giveSmg),
      goTo({ at: { lm: 'villa', dz: 6 }, text: 'Drive up to Hale Villa in Verde Hills', radius: 26 }),
      waves({ at: { lm: 'villa', dz: 2 }, text: 'Break through the villa gates', radius: 14, leash: 70, waves: (f) => [
        { count: 5, weapon: 'smg', health: 65, armor: 20 },
        { count: 6, weapon: 'smg', health: 70, armor: 30 },
        ...(f.quint === 'deal' ? [] : [{ count: 4, weapon: 'pistol', health: 90, armor: 60 }]),
      ] }),
      say([['Mako', "Mr. Hale says you don't come inside. I say you don't leave."], ['Nico', "Mako. Still taking orders."]]),
      kill({ at: { lm: 'villa', dz: -8 }, count: 1, weapon: 'smg', text: 'Take down Mako, Hale\'s enforcer', spread: 2, aggro: 60, health: 260, armor: 100, boss: true, damage: 7 }),
      say([['Teo', "Hale's in the garage! He's getting in the black Vesper!"]]),
      chase({ type: 'sports', at: { lm: 'villa', dz: 24 }, heading: 3.14, color: 0x151515, text: "Wreck Hale's black Vesper", escapeDist: 300, boss: true, health: 150,
        speedFactor: (f) => (f.sal === 'spared' ? 0.8 : 0.9) - (f.quint === 'deal' ? 0.05 : 0) }),
      say((f) => [
        f.sal === 'spared' ? ['Sal', "Nico, it's Sal. I cut his brake line last week. Told you I owed you one."] : null,
        ['Hale', "You think this ends with me? This city made me, Vega!"],
      ]),
      kill({ at: (m) => ({ x: m.chaseVehicle.x + 4, z: m.chaseVehicle.z }), count: 1, weapon: 'pistol', text: 'Finish Victor Hale', spread: 1, aggro: 80, health: 240, armor: 60, boss: true, damage: 6 }),
      say((f) => [
        ['Nico', "This city made both of us, Victor. It just liked me better."],
        f.quint === 'deal'
          ? ['Quint', "All units: the Hale organisation is finished. And Vega? I never saw you."]
          : ['Quint', "Hale's dead and the ledger's in the wind. You and I aren't done, Vega."],
        ['Dani', "Come home, Nico. The sun's going down."],
      ]),
    ],
    reward: { money: 20000, rep: 5 },
  },
];
