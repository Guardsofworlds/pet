// Seed data for PawTrail demo. All listings, names, and contact info are fictional.

const PHOTOS = {
  dog: [
    "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=600&h=450&fit=crop",
    "https://images.unsplash.com/photo-1561037404-61cd46aa615b?w=600&h=450&fit=crop",
    "https://images.unsplash.com/photo-1517849845537-4d257902454a?w=600&h=450&fit=crop",
    "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=600&h=450&fit=crop",
    "https://images.unsplash.com/photo-1558788353-f76d92427f16?w=600&h=450&fit=crop",
    "https://images.unsplash.com/photo-1530281700549-e82e7bf110d6?w=600&h=450&fit=crop",
    "https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=600&h=450&fit=crop",
    "https://images.unsplash.com/photo-1546238232-20216dec9f72?w=600&h=450&fit=crop",
  ],
  cat: [
    "https://images.unsplash.com/photo-1574144611937-0df059b5ef3e?w=600&h=450&fit=crop",
    "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600&h=450&fit=crop",
    "https://images.unsplash.com/photo-1592194996308-7b43878e84a6?w=600&h=450&fit=crop",
    "https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=600&h=450&fit=crop",
    "https://images.unsplash.com/photo-1495360010541-f48722b34f7d?w=600&h=450&fit=crop",
    "https://images.unsplash.com/photo-1518791841217-8f162f1e1131?w=600&h=450&fit=crop",
  ],
  other: [
    "https://images.unsplash.com/photo-1535241749838-299277b6305f?w=600&h=450&fit=crop",
    "https://images.unsplash.com/photo-1452857297128-d9c29adba80b?w=600&h=450&fit=crop",
  ],
};

const PROFILES = [
  { name: "Maya Chen", initials: "MC", neighborhood: "Riverbend" },
  { name: "David Okonkwo", initials: "DO", neighborhood: "Maple Heights" },
  { name: "Priya Subramanian", initials: "PS", neighborhood: "Old Town" },
  { name: "Marcus Reilly", initials: "MR", neighborhood: "Westbrook" },
  { name: "Jess Park", initials: "JP", neighborhood: "Sunset Park" },
  { name: "Tomás Velasco", initials: "TV", neighborhood: "Belmont" },
  { name: "Ayo Ade", initials: "AA", neighborhood: "Eastdale" },
  { name: "Hannah Becker", initials: "HB", neighborhood: "Rosewood" },
  { name: "Sam Ortiz", initials: "SO", neighborhood: "Crestline" },
  { name: "Rachel Dunn", initials: "RD", neighborhood: "Linden Park" },
  { name: "Kenji Tanaka", initials: "KT", neighborhood: "Harbor Hill" },
  { name: "Adira Levi", initials: "AL", neighborhood: "Forest Glen" },
  { name: "Emma Brooks", initials: "EB", neighborhood: "South Lake" },
  { name: "Noah Patel", initials: "NP", neighborhood: "Brookfield" },
];

const AVATAR_COLORS = [
  "#e87c2e", "#2d9b6c", "#2561c8", "#7c3aed",
  "#d93a2e", "#c98a00", "#1a7a8c", "#6b4c2e",
];

const COLOR_OPTIONS = ["black","white","brown","tan","gray","orange","tricolor","brindle"];

function hoursAgo(h) {
  const d = new Date();
  d.setTime(d.getTime() - h * 3600 * 1000);
  return d.toISOString();
}
function daysAgo(d) { return hoursAgo(d * 24); }

function L(o) { return { id: o.id, ...o }; }

const SEED_LISTINGS = [
  L({
    id: "L-101",
    type: "lost",
    species: "dog",
    name: "Biscuit",
    breed: "Beagle mix",
    color: "tricolor",
    size: "small",
    age: "5 yrs",
    photo: PHOTOS.dog[0],
    location: "Riverbend Park, Pinecrest Ave & 4th",
    zip: "97214",
    distance: 0.6,
    when: "2026-05-09T18:30",
    contact: "relay",
    poster: PROFILES[0],
    features: "Slipped collar with blue tag (rabies #4421). Tiny scar above left eye. Very food motivated, will not approach strangers but will take cheese.",
    reward: 200,
    status: "active",
    posted: hoursAgo(14),
  }),
  L({
    id: "L-102",
    type: "found",
    species: "dog",
    name: null,
    breed: "Beagle mix",
    color: "tricolor",
    size: "small",
    age: "adult",
    photo: PHOTOS.dog[1],
    location: "Riverbend Elementary, behind the fence",
    zip: "97214",
    distance: 1.2,
    when: "2026-05-10T07:10",
    contact: "relay",
    poster: PROFILES[1],
    features: "Friendly. No collar. Took peanut butter from my hand. Currently in my fenced yard, has water and a blanket.",
    custody: "with-me",
    condition: "healthy",
    status: "active",
    posted: hoursAgo(2),
  }),
  L({
    id: "L-103",
    type: "lost",
    species: "cat",
    name: "Mochi",
    breed: "Domestic shorthair",
    color: "black",
    size: "medium",
    age: "3 yrs",
    photo: PHOTOS.cat[0],
    location: "Maple Heights, near 27th & Birch",
    zip: "97215",
    distance: 2.4,
    when: "2026-05-08T22:00",
    contact: "relay",
    poster: PROFILES[2],
    features: "Indoor cat, slipped out the front door. Microchipped (HomeAgain). White tuft on chest. Skittish — please don't chase.",
    reward: 150,
    status: "active",
    posted: hoursAgo(38),
  }),
  L({
    id: "L-104",
    type: "lost",
    species: "dog",
    name: "Sergeant",
    breed: "German Shepherd",
    color: "tan",
    size: "large",
    age: "7 yrs",
    photo: PHOTOS.dog[2],
    location: "Westbrook trail head",
    zip: "97216",
    distance: 4.8,
    when: "2026-05-09T06:00",
    contact: "relay",
    poster: PROFILES[3],
    features: "Slightly limps on right hind leg (old injury). Wearing red harness with reflective strips. Responds to whistle.",
    reward: 500,
    status: "active",
    posted: hoursAgo(28),
  }),
  L({
    id: "L-105",
    type: "found",
    species: "cat",
    name: null,
    breed: "Tabby",
    color: "orange",
    size: "small",
    age: "kitten",
    photo: PHOTOS.cat[1],
    location: "Sunset Park apartments, building C parking",
    zip: "97214",
    distance: 1.5,
    when: "2026-05-10T05:45",
    contact: "relay",
    poster: PROFILES[4],
    features: "Looks under-fed but otherwise alert. No collar. I'm calling around to vets for a chip scan today.",
    custody: "with-me",
    condition: "scared",
    status: "active",
    posted: hoursAgo(4),
  }),
  L({
    id: "L-106",
    type: "lost",
    species: "dog",
    name: "Pepper",
    breed: "Mini Schnauzer",
    color: "gray",
    size: "small",
    age: "9 yrs",
    photo: PHOTOS.dog[3],
    location: "Belmont, Cherry & 12th",
    zip: "97217",
    distance: 3.1,
    when: "2026-05-09T16:00",
    contact: "relay",
    poster: PROFILES[5],
    features: "Senior dog, partly deaf — won't respond to her name. Wearing a green collar with a heart-shaped tag.",
    reward: 300,
    status: "active",
    posted: hoursAgo(20),
  }),
  L({
    id: "L-107",
    type: "found",
    species: "dog",
    name: null,
    breed: "Mini Schnauzer-ish",
    color: "gray",
    size: "small",
    age: "senior",
    photo: PHOTOS.dog[4],
    location: "Belmont Veterinary Clinic intake",
    zip: "97217",
    distance: 3.0,
    when: "2026-05-10T09:30",
    contact: "shelter",
    poster: { name: "Belmont Vet Clinic", initials: "BV", neighborhood: "Belmont" },
    features: "Brought in by a delivery driver who found her wandering. Green collar, no tag. Scanning for chip this afternoon.",
    custody: "shelter",
    condition: "healthy",
    status: "active",
    posted: hoursAgo(1),
    verifiedSource: true,
  }),
  L({
    id: "L-108",
    type: "lost",
    species: "cat",
    name: "Olive",
    breed: "Russian Blue mix",
    color: "gray",
    size: "small",
    age: "2 yrs",
    photo: PHOTOS.cat[2],
    location: "Old Town, Wilcox Apartments",
    zip: "97213",
    distance: 5.5,
    when: "2026-05-07T19:00",
    contact: "relay",
    poster: PROFILES[6],
    features: "Tiny notched right ear. Very vocal — meows constantly. Was wearing a breakaway collar that may have come off.",
    status: "active",
    posted: hoursAgo(60),
  }),
  L({
    id: "L-109",
    type: "lost",
    species: "other",
    name: "Captain",
    breed: "Holland Lop rabbit",
    color: "brown",
    size: "small",
    age: "4 yrs",
    photo: PHOTOS.other[0],
    location: "Forest Glen community garden",
    zip: "97215",
    distance: 3.8,
    when: "2026-05-10T11:00",
    contact: "relay",
    poster: PROFILES[11],
    features: "Escaped through the garden gate. Brown with a white blaze. Will come for parsley.",
    reward: 100,
    status: "active",
    posted: hoursAgo(3),
  }),
  L({
    id: "L-110",
    type: "found",
    species: "dog",
    name: null,
    breed: "Lab mix",
    color: "black",
    size: "large",
    age: "young adult",
    photo: PHOTOS.dog[5],
    location: "South Lake fishing pier",
    zip: "97218",
    distance: 6.2,
    when: "2026-05-10T08:00",
    contact: "relay",
    poster: PROFILES[12],
    features: "Friendly, well-fed. Took off after a duck and ended up here. Wearing a worn-out blue collar, tag illegible.",
    custody: "with-me",
    condition: "healthy",
    status: "active",
    posted: hoursAgo(5),
  }),
  L({
    id: "L-111",
    type: "lost",
    species: "dog",
    name: "Daisy",
    breed: "Labrador",
    color: "black",
    size: "large",
    age: "3 yrs",
    photo: PHOTOS.dog[6],
    location: "South Lake neighborhood, near the pier",
    zip: "97218",
    distance: 6.5,
    when: "2026-05-10T07:30",
    contact: "relay",
    poster: PROFILES[13],
    features: "Took off chasing ducks at the lake. Friendly. Blue collar, tag with our cell number.",
    reward: 250,
    status: "active",
    posted: hoursAgo(6),
  }),
  L({
    id: "L-112",
    type: "lost",
    species: "cat",
    name: "Pumpkin",
    breed: "Maine Coon",
    color: "orange",
    size: "large",
    age: "6 yrs",
    photo: PHOTOS.cat[3],
    location: "Linden Park, near the elementary school",
    zip: "97214",
    distance: 1.0,
    when: "2026-05-06T14:00",
    contact: "relay",
    poster: PROFILES[9],
    features: "Big floofy boy, 16 lbs. Microchipped. Has a slight wheeze when he runs.",
    reward: 400,
    status: "reunited",
    reunitedAt: hoursAgo(8),
    posted: hoursAgo(96),
  }),
  L({
    id: "L-113",
    type: "lost",
    species: "dog",
    name: "Coco",
    breed: "Poodle mix",
    color: "white",
    size: "small",
    age: "1 yr",
    photo: PHOTOS.dog[7],
    location: "Crestline, Hawthorn & 8th",
    zip: "97215",
    distance: 2.8,
    when: "2026-05-09T20:30",
    contact: "relay",
    poster: PROFILES[8],
    features: "Puppy, very friendly, will come to anyone. Pink collar with rhinestones. Recently groomed.",
    reward: 200,
    status: "active",
    posted: hoursAgo(16),
  }),
];

const RECENT_REUNIONS = [
  { name: "Pumpkin", time: "8 hours ago", neighborhood: "Linden Park", days: 4, species: "cat", photo: PHOTOS.cat[3] },
  { name: "Rufus", time: "yesterday", neighborhood: "Maple Heights", days: 1, species: "dog", photo: PHOTOS.dog[2] },
  { name: "Whiskers", time: "yesterday", neighborhood: "Eastdale", days: 0, species: "cat", photo: PHOTOS.cat[4] },
  { name: "Maple", time: "2 days ago", neighborhood: "Old Town", days: 2, species: "dog", photo: PHOTOS.dog[5] },
  { name: "Boomer", time: "3 days ago", neighborhood: "Westbrook", days: 1, species: "dog", photo: PHOTOS.dog[1] },
];

const TESTIMONIALS = [
  {
    name: "Sarah M.",
    neighborhood: "Maple Heights",
    initials: "SM",
    petName: "Luna",
    species: "cat",
    photo: PHOTOS.cat[4],
    hours: 6,
    story: "Luna escaped through a screen door at 9pm. I posted on PawTrail and by 3am a neighbor two streets over had spotted her hiding under their deck. The match alert woke me up. We were reunited before sunrise. I don't have words.",
  },
  {
    name: "James & Lily W.",
    neighborhood: "Riverbend",
    initials: "JW",
    petName: "Archie",
    species: "dog",
    photo: PHOTOS.dog[3],
    hours: 11,
    story: "Our beagle bolted during a thunderstorm. We posted a Lost report and a neighbor's Found report matched within 4 minutes. We drove over, and there he was, sitting on their porch eating a treat. PawTrail saved us days of searching.",
  },
  {
    name: "Diane P.",
    neighborhood: "Sunset Park",
    initials: "DP",
    petName: "Ghost",
    species: "cat",
    photo: PHOTOS.cat[5],
    hours: 34,
    story: "I'd all but given up after day two. Then a shelter intake at Belmont Vet Clinic flagged as a high-confidence match. My indoor cat had made it nearly a mile. I'm grateful PawTrail monitors shelter intakes automatically.",
  },
  {
    name: "Marcus T.",
    neighborhood: "Westbrook",
    initials: "MT",
    petName: "Rosie",
    species: "dog",
    photo: PHOTOS.dog[6],
    hours: 18,
    story: "Found a stray in my front yard. No owner info on her collar. Posted a Found report and within 2 hours the owner contacted me through the relay. The tears on both sides were real. This platform is special.",
  },
];

// Community posts — mix of sightings, tips, reunions, questions, support
const SEED_COMMUNITY_POSTS = [
  {
    id: "CP-001",
    type: "sighting",
    author: { name: "Kenji T.", initials: "KT", neighborhood: "Riverbend", avatarColor: AVATAR_COLORS[0] },
    content: "Just saw what looks like Biscuit running along Pinecrest Ave heading east toward the park — tricolor beagle, no collar. Called out but it kept running. Moving pretty fast toward the school. Posted a sighting comment on the listing too.",
    relatedListing: "L-101",
    species: "dog",
    when: hoursAgo(1),
    reactions: { heart: 8, hug: 0, clap: 0, hope: 12 },
    comments: 3,
  },
  {
    id: "CP-002",
    type: "reunion",
    author: { name: "Rachel D.", initials: "RD", neighborhood: "Linden Park", avatarColor: AVATAR_COLORS[1] },
    content: "PUMPKIN IS HOME!! 🎉🎉 After 4 days I had almost given up. Someone spotted him hiding in their shed two blocks over — exactly where PawTrail said to check. The auto-match alert came at 2am and I drove over immediately. He's on my lap purring right now. Thank you everyone who shared and kept an eye out. This community is everything.",
    relatedListing: "L-112",
    species: "cat",
    when: hoursAgo(8),
    reactions: { heart: 47, hug: 18, clap: 31, hope: 5 },
    comments: 22,
  },
  {
    id: "CP-003",
    type: "tip",
    author: { name: "Marcus R.", initials: "MR", neighborhood: "Westbrook", avatarColor: AVATAR_COLORS[2] },
    content: "Tip for everyone searching right now: give your flyer to EVERY delivery driver you see, not just mail carriers. I found Rosie because a DoorDash driver remembered seeing her near the park. They cover way more ground than any of us walking the neighborhood.",
    when: hoursAgo(12),
    reactions: { heart: 22, hug: 0, clap: 14, hope: 0 },
    comments: 7,
  },
  {
    id: "CP-004",
    type: "question",
    author: { name: "Sam O.", initials: "SO", neighborhood: "Crestline", avatarColor: AVATAR_COLORS[3] },
    content: "Question: someone just texted me saying they have my dog and wants me to Venmo them $200 before they'll tell me where to pick her up. This feels wrong. Anyone dealt with this? Should I call the police?",
    when: hoursAgo(18),
    reactions: { heart: 4, hug: 12, clap: 0, hope: 0 },
    comments: 14,
    pinned: true,
  },
  {
    id: "CP-005",
    type: "tip",
    author: { name: "Hannah B.", initials: "HB", neighborhood: "Rosewood", avatarColor: AVATAR_COLORS[4] },
    content: "For those searching for cats: set up a wildlife camera facing your front door overnight. I found my cat on the footage at 4am, visiting the food bowl I'd left out — then I set a humane trap right there. Caught her the next night. Patience + scent lure works.",
    when: hoursAgo(24),
    reactions: { heart: 31, hug: 0, clap: 19, hope: 6 },
    comments: 5,
  },
  {
    id: "CP-006",
    type: "support",
    author: { name: "Adira L.", initials: "AL", neighborhood: "Forest Glen", avatarColor: AVATAR_COLORS[5] },
    content: "Day 6 without Mochi. The nights are the hardest. I keep the porch light on and her favorite blanket by the door. If you've found your pet after a week or more — please share your story. I need to believe it's still possible.",
    relatedListing: "L-103",
    species: "cat",
    when: hoursAgo(36),
    reactions: { heart: 52, hug: 34, clap: 0, hope: 41 },
    comments: 28,
  },
  {
    id: "CP-007",
    type: "sighting",
    author: { name: "Ayo A.", initials: "AA", neighborhood: "Eastdale", avatarColor: AVATAR_COLORS[6] },
    content: "Spotted a small gray schnauzer-type dog near Cherry Park earlier this morning around 7:30. She had no collar but seemed well-cared for. Friendly, let me pet her. I didn't have a leash with me. She headed toward the community center.",
    relatedListing: "L-106",
    species: "dog",
    when: hoursAgo(5),
    reactions: { heart: 14, hug: 0, clap: 8, hope: 11 },
    comments: 6,
  },
  {
    id: "CP-008",
    type: "tip",
    author: { name: "Priya S.", initials: "PS", neighborhood: "Old Town", avatarColor: AVATAR_COLORS[7] },
    content: "PSA: if you find a pet, don't wash them before returning. Their scent on your hands and clothes is how you'll get them to trust you and stay calm. Also — call the owner from a calm, quiet place. The sound of traffic or strangers can make a scared animal bolt again.",
    when: daysAgo(2),
    reactions: { heart: 28, hug: 0, clap: 22, hope: 0 },
    comments: 3,
  },
  {
    id: "CP-009",
    type: "reunion",
    author: { name: "Noah P.", initials: "NP", neighborhood: "Brookfield", avatarColor: AVATAR_COLORS[0] },
    content: "UPDATE on Rufus: FOUND! He'd made it nearly 4 miles and was being cared for by a family near the shopping center. They saw the flyer in the coffee shop window. Never underestimate physical flyers — they still work. Leaving my listing up as Reunited as a reminder to everyone that most pets DO come home. 🐕",
    when: daysAgo(1),
    reactions: { heart: 63, hug: 12, clap: 44, hope: 7 },
    comments: 31,
  },
  {
    id: "CP-010",
    type: "tip",
    author: { name: "Emma B.", initials: "EB", neighborhood: "South Lake", avatarColor: AVATAR_COLORS[1] },
    content: "Reminder for everyone: put your current phone number on your pet's tag AND in your microchip registry. My dog was found and returned in under 2 hours because her chip had my updated number. We'd moved two years ago and I almost didn't update it. Please check yours today.",
    when: daysAgo(3),
    reactions: { heart: 41, hug: 0, clap: 35, hope: 0 },
    comments: 9,
  },
];

// Tips — short, actionable, categorized
const TIPS = [
  // First hours
  {
    id: "T-01", category: "first-hours", icon: "🏃",
    title: "Walk the area immediately",
    text: "Do a quiet, calm loop around where you last saw your pet. Don't run or call frantically — that pushes scared animals further away. Walk slowly, crouching low.",
  },
  {
    id: "T-02", category: "first-hours", icon: "🧀",
    title: "Bring smelly food, not just their name",
    text: "A frightened pet may not respond to their name. Rotisserie chicken, hot dogs, or tuna — strong food smells can lure them out when nothing else works.",
  },
  {
    id: "T-03", category: "first-hours", icon: "📱",
    title: "Post immediately, fill details later",
    text: "Submit a listing with just the basics. The matching pipeline starts the moment you hit submit. You can add breed, color, and photos after — don't wait to get it perfect.",
  },
  {
    id: "T-04", category: "first-hours", icon: "🚪",
    title: "Tell neighbors in person",
    text: "In-person knocking beats notes on doors. People who promise to 'keep an eye out' when you look them in the eye actually do it.",
  },
  {
    id: "T-05", category: "first-hours", icon: "📞",
    title: "Call shelters, don't email",
    text: "Shelter staff handle huge volumes of email. A phone call to a specific person gets your pet in their head. Ask: 'May I come in person to look?' Shelters regularly mis-tag breed and color.",
  },
  {
    id: "T-06", category: "first-hours", icon: "📡",
    title: "Update your microchip contact info right now",
    text: "Log in to HomeAgain, AKC Reunite, or 24PetWatch and confirm your phone number is current. An outdated chip helps no one.",
  },
  // Search strategy
  {
    id: "T-07", category: "search", icon: "🔦",
    title: "Search for cats at night",
    text: "Cats hide during the day and move at dawn/dusk. Search low places — under decks, sheds, cars, and in dense bushes — with a flashlight after dark. Look for eye-shine.",
  },
  {
    id: "T-08", category: "search", icon: "🛤️",
    title: "Dogs travel in straight lines",
    text: "A scared dog often runs in one direction until something stops them — a fence, a road, or a kind stranger. Search in a widening arc from the escape point.",
  },
  {
    id: "T-09", category: "search", icon: "🎥",
    title: "Ask about doorbell cameras",
    text: "Ask every neighbor: 'Do you have a Ring or camera facing the street?' Footage from the night of the escape often shows exactly which direction the pet went.",
  },
  {
    id: "T-10", category: "search", icon: "📪",
    title: "Hand flyers to mail carriers personally",
    text: "Your mail carrier walks every block on your street, every day. They notice animals. Hand them a flyer in person and ask them to call if they spot anything.",
  },
  {
    id: "T-11", category: "search", icon: "🚗",
    title: "Drive slowly with windows down",
    text: "Drive a 3–5 mile radius slowly with your windows down, calling in a calm, happy voice. A familiar voice from a car often reaches a hiding dog when foot searches don't.",
  },
  {
    id: "T-12", category: "search", icon: "📷",
    title: "Set a wildlife camera at home base",
    text: "Point a camera at the food and clothing you've left outside. Many owners see their cat visiting at 3am in the footage — then they set a trap, and catch them the next night.",
  },
  // Found pet tips
  {
    id: "T-13", category: "found", icon: "🤲",
    title: "Approach low and sideways",
    text: "Don't run toward a stray. Crouch down, look away, and let them come to you. Tossing treats toward them (not at them) while staying still is the fastest way to gain trust.",
  },
  {
    id: "T-14", category: "found", icon: "💉",
    title: "Get a free chip scan",
    text: "Any vet, shelter, or PetSmart will scan for a microchip for free in under a minute. About 60% of lost dogs and 5–10% of lost cats have a chip.",
  },
  {
    id: "T-15", category: "found", icon: "📸",
    title: "Hold back one detail",
    text: "Don't post every marking publicly. Keep one specific detail — a scar, a unique paw pattern, a chip number — private so you can verify the real owner.",
  },
  {
    id: "T-16", category: "found", icon: "🏠",
    title: "Check nearby houses first",
    text: "Most strays come from within 3–5 houses of where you found them. Knock on doors in a small radius before driving around the whole neighborhood.",
  },
  {
    id: "T-17", category: "found", icon: "🏥",
    title: "You don't have to take them to a shelter",
    text: "In most US jurisdictions you can keep a found animal safely at home while searching for the owner. Shelters are stressful and have stay deadlines. Foster first if you can.",
  },
  // Prevention
  {
    id: "T-18", category: "prevention", icon: "🏷️",
    title: "Keep ID tags current after any move",
    text: "Your phone number on the tag is the fastest path to reunion — faster than a chip scan. Update it every time you move or change numbers.",
  },
  {
    id: "T-19", category: "prevention", icon: "🔒",
    title: "Check your fence before every outing",
    text: "Most dog escapes happen through the same weak spot repeatedly. Do a fence walk at the start of each season. Look for boards that move, gaps at grade, and unlatched gates.",
  },
  {
    id: "T-20", category: "prevention", icon: "📂",
    title: "Keep recent photos of your pet",
    text: "Store a set of current, clear photos of your pet (face, full body, unique markings) in your phone's cloud backup. You'll need them the moment they go missing.",
  },
  {
    id: "T-21", category: "prevention", icon: "🐾",
    title: "Microchip and register, both",
    text: "A chip does nothing without registration. After chipping, register in all three major databases (HomeAgain, AKC Reunite, 24PetWatch) for maximum coverage.",
  },
  {
    id: "T-22", category: "prevention", icon: "🎆",
    title: "Secure pets before fireworks and storms",
    text: "More pets go missing on July 4th than any other day of the year. Confine them indoors, with a white noise machine, hours before any anticipated loud event.",
  },
  // Scam safety
  {
    id: "T-23", category: "scam-safety", icon: "🚨",
    title: "Never pay before reunion",
    text: "Real finders don't ask for shipping fees, deposits, or gift cards. If anyone asks for money before you have your pet in your arms, it's a scam. Full stop.",
  },
  {
    id: "T-24", category: "scam-safety", icon: "📸",
    title: "Ask for a fresh photo",
    text: "If someone claims to have your pet, ask for a fresh photo that includes something specific you didn't post publicly — 'a photo next to today's newspaper' or 'a photo of her belly markings.'",
  },
  {
    id: "T-25", category: "scam-safety", icon: "📍",
    title: "Insist on a public meeting place",
    text: "Never go alone to meet someone from a listing. Meet at a vet office, police station parking lot, or busy coffee shop. Bring a friend.",
  },
  {
    id: "T-26", category: "scam-safety", icon: "☎️",
    title: "Be suspicious of out-of-area numbers",
    text: "If your pet went missing in Portland but the person claiming to have them has a Miami area code — that's a red flag. Scammers target listings and call from spoofed numbers.",
  },
  {
    id: "T-27", category: "scam-safety", icon: "🔐",
    title: "Use PawTrail's relay for all communication",
    text: "Never share your home address, workplace, or personal phone via social media. Use the relay system so your contact info stays private until you verify the finder.",
  },
];

const TIP_CATEGORIES = [
  { id: "all", label: "All tips" },
  { id: "first-hours", label: "First hours" },
  { id: "search", label: "Search strategy" },
  { id: "found", label: "I found a pet" },
  { id: "prevention", label: "Prevention" },
  { id: "scam-safety", label: "Scam safety" },
];

const HELPLINE = [
  { name: "ASPCA Animal Poison Control", num: "1-888-426-4435", note: "24/7 · Toxin/poisoning emergencies (fee may apply)" },
  { name: "Pet Poison Helpline", num: "1-855-764-7661", note: "24/7 · Independent poison hotline" },
  { name: "ASPCA Pet Loss Hotline", num: "1-877-474-3310", note: "Grief and emotional support" },
  { name: "Tufts Pet Loss Support", num: "1-508-839-7966", note: "Free, weekday evenings" },
  { name: "HomeAgain Microchip Lost Pet Recovery", num: "1-888-466-3242", note: "If your pet is HomeAgain-chipped" },
  { name: "AKC Reunite", num: "1-800-252-7894", note: "AKC-registered chip recovery" },
  { name: "24PetWatch Lost Pet Recovery", num: "1-866-597-2424", note: "24PetWatch-chipped pets" },
];

const ARTICLES = [
  {
    id: "first-24-hours",
    flagship: true,
    icon: "⏱️",
    title: "First 24 Hours After Losing a Pet",
    summary: "The single most important checklist. Most reunions happen within the first day — what you do in the next hour matters most.",
    body: `<p class="lede">Take a breath. Most lost pets stay within 1–5 miles of where they slipped away, and most reunions happen in the first 24 hours. Here is exactly what to do, in order.</p>

<h2>Right now (first 30 minutes)</h2>
<ul class="checklist">
  <li><label><input type="checkbox"/> Walk a quiet, calm loop around the area where you last saw your pet. Bring smelly food, a familiar toy, and a leash. Don't run or call frantically — that scares them further.</label></li>
  <li><label><input type="checkbox"/> If it's a cat: check inside your own house first (closets, basement, behind the dryer). 70% of "lost" indoor cats are still inside.</label></li>
  <li><label><input type="checkbox"/> Post a Lost listing on PawTrail. The matching pipeline starts within seconds — finder reports get cross-checked automatically.</label></li>
  <li><label><input type="checkbox"/> Tell every neighbor you can find in person. Doorbell cameras, fences, sheds, and porches are where most pets end up.</label></li>
</ul>

<h2>Within 2 hours</h2>
<ul class="checklist">
  <li><label><input type="checkbox"/> Call every shelter, animal control, and vet within 25 miles. Don't email — call. Ask if any animal matching your description has been brought in.</label></li>
  <li><label><input type="checkbox"/> Ask the question "may I come look in person?" Shelters mis-tag breed, color, and sex constantly.</label></li>
  <li><label><input type="checkbox"/> Share your PawTrail listing to local Facebook lost-pet groups, Nextdoor, and your neighborhood text thread. Use the one-tap share buttons.</label></li>
  <li><label><input type="checkbox"/> Call your microchip registry (HomeAgain, AKC Reunite, 24PetWatch) and confirm your contact info is current. Mark the chip as "lost".</label></li>
</ul>

<h2>By the end of the day</h2>
<ul class="checklist">
  <li><label><input type="checkbox"/> Print 30+ flyers on bright paper. Use the auto-generated flyer from your listing — it has the QR code finders need.</label></li>
  <li><label><input type="checkbox"/> Hand them to mail carriers, delivery drivers, and dog walkers in the area. They cover ground you don't.</label></li>
  <li><label><input type="checkbox"/> Leave a worn t-shirt and litter box (for cats) or familiar bedding (for dogs) outside your front door. Scent draws them home.</label></li>
  <li><label><input type="checkbox"/> Stay near a phone. Charge it. Keep PawTrail notifications on.</label></li>
</ul>

<div class="callout"><strong>Don't:</strong> don't pay any caller who claims to have your pet without first asking for proof — a current photo with a specific feature you didn't post publicly. Scammers target lost-pet posts.</div>`,
  },
  {
    id: "search-strategy",
    icon: "🔍",
    title: "How to Search: Cats vs. Dogs",
    summary: "Cats and dogs behave very differently when lost. Searching the wrong way wastes the critical first hours.",
    body: `<p class="lede">Treating a missing cat like a missing dog is the most common mistake — and it's why people search for days in the wrong place.</p>

<h2>If your dog is missing</h2>
<p>Dogs travel. A scared dog can cover 5–10 miles in a day, often in a straight line away from where they got loose, until something stops them (a fence, a road, food, a friendly person).</p>
<ul>
  <li><strong>Search wide.</strong> Drive a 5-mile radius slowly with your windows down, calling in a calm, happy voice.</li>
  <li><strong>Bring smelly food</strong> (rotisserie chicken, hot dogs). Drop small pieces along the route — a hungry dog will follow scent.</li>
  <li><strong>Don't chase.</strong> A scared dog in flight mode will run from anyone, including you. Sit down, look small, toss food, wait.</li>
</ul>

<h2>If your cat is missing</h2>
<p>Cats hide. A scared indoor-only cat will almost always be within 3–5 houses of where they got out, frozen in place under a deck, in a shed, or in dense bushes.</p>
<ul>
  <li><strong>Search at night with a flashlight.</strong> Look for eye-shine in low places — under porches, decks, cars, sheds.</li>
  <li><strong>Knock on every neighbor's door</strong> and ask permission to check their yard, garage, and crawlspace.</li>
  <li><strong>Set out their litter box, scratching post, and a piece of your worn clothing.</strong> Cats navigate by scent.</li>
  <li><strong>Set a humane trap</strong> after 48 hours if you haven't found them. Most rescues will lend one.</li>
</ul>

<div class="callout info"><strong>Key insight:</strong> For cats, "lost" usually means "stuck and silent within 200 feet." For dogs, "lost" usually means "moving fast in one direction." Search accordingly.</div>`,
  },
  {
    id: "flyers",
    icon: "📄",
    title: "Make a Flyer People Will Actually Read",
    summary: "Most lost-pet flyers are useless. Here's the proven format, and how to use the auto-generated PawTrail flyer.",
    body: `<p class="lede">A passing driver has 2 seconds to read your flyer. Treat it like a billboard, not a memo.</p>

<h2>The five-element flyer</h2>
<ol>
  <li><strong>One word at the top, huge:</strong> LOST or REWARD. Visible from across a parking lot.</li>
  <li><strong>One large color photo</strong> showing the pet's face and main markings.</li>
  <li><strong>One short description:</strong> "Small black cat, white chest, no collar."</li>
  <li><strong>One phone number,</strong> in the largest font you can fit.</li>
  <li><strong>QR code</strong> linking to your PawTrail listing. (Auto-generated when you print from the listing page.)</li>
</ol>

<h2>Where to put them</h2>
<ul>
  <li>Every intersection within 1 mile — not just the closest few.</li>
  <li>At eye level for drivers stopped at lights, not pedestrian-height.</li>
  <li>Inside coffee shops, hardware stores, vets, dog parks — places where pet people stop.</li>
  <li>Hand to delivery drivers and mail carriers personally.</li>
</ul>

<div class="callout"><strong>Tip:</strong> Use bright neon paper. White flyers disappear into telephone poles.</div>`,
  },
  {
    id: "scams",
    icon: "🛡️",
    title: "Scam Awareness: 'I Have Your Pet' Extortion",
    summary: "If your contact info is on a listing, scammers will message. Here's what they say and how to spot real finders.",
    body: `<p class="lede">Within hours of posting a lost pet, you may receive messages from people pretending to have your pet. Their goal is money. Here's how to spot them.</p>

<h2>Common scam patterns</h2>
<ul>
  <li><strong>"I'm a long-haul trucker / I'm out of state"</strong> — explains why they can't meet you in person.</li>
  <li><strong>"I need shipping fees / vet fees / a deposit before I can release them."</strong> Any request for money before reunion is a scam. Period.</li>
  <li><strong>Refuses to send a current photo</strong> — or sends one that matches your post too perfectly.</li>
  <li><strong>Uses a phone number from a different area code</strong> than your local listing.</li>
  <li><strong>Pressure tactics:</strong> "I'll let them go if you don't respond in 30 minutes."</li>
</ul>

<h2>How to verify a real finder</h2>
<ol>
  <li><strong>Ask for a fresh photo</strong> showing a specific detail you did NOT post publicly.</li>
  <li><strong>Ask a question only the owner would know.</strong></li>
  <li><strong>Insist on meeting in person</strong> at a vet office, police station parking lot, or busy coffee shop.</li>
  <li><strong>Bring a friend</strong> to the meeting. Always.</li>
</ol>

<div class="callout danger"><strong>Never wire money, send gift cards, or pay any "fees" before being reunited with your pet.</strong> Real finders don't ask for that. PawTrail's relay system flags messages that mention payment.</div>`,
  },
  {
    id: "found-pet",
    icon: "🤝",
    title: "I Found a Stray — What Do I Do?",
    summary: "You don't have to take it to a shelter, and you don't need to keep it forever. A 90-second guide.",
    body: `<p class="lede">First, thank you. Most strays you see have an owner looking for them right now.</p>

<h2>In the first 10 minutes</h2>
<ul class="checklist">
  <li><label><input type="checkbox"/> If the animal is in the road or a dangerous spot, get them to safety first. Approach low, slow, sideways. Never reach over their head.</label></li>
  <li><label><input type="checkbox"/> Check for a collar and tag. Call the number on the tag immediately.</label></li>
  <li><label><input type="checkbox"/> Take 2–3 clear photos: face, full body, and any unique markings.</label></li>
  <li><label><input type="checkbox"/> Note the exact location and time you found them.</label></li>
</ul>

<h2>If there's no tag</h2>
<ul class="checklist">
  <li><label><input type="checkbox"/> Post a Found listing on PawTrail. Takes 90 seconds. The owner may already have a Lost listing waiting to match.</label></li>
  <li><label><input type="checkbox"/> Take the animal to a vet, shelter, or rescue for a free microchip scan.</label></li>
  <li><label><input type="checkbox"/> Knock on doors within a 3–5 house radius.</label></li>
</ul>

<div class="callout"><strong>Tip:</strong> Don't post a public photo with all the markings visible. Hold back one detail so you can verify the real owner.</div>`,
  },
  {
    id: "scent",
    icon: "👕",
    title: "Using Scent to Bring a Pet Home",
    summary: "Scent is the single most underused tool for cats and small dogs hiding nearby. Costs nothing.",
    body: `<p class="lede">Pets navigate the world through their nose. A familiar scent can pull a hiding cat back into your yard from blocks away.</p>

<h2>What to put outside your front door</h2>
<ul>
  <li><strong>Their litter box</strong> — including the used litter. Cats can detect their own scent from over a mile away.</li>
  <li><strong>A worn t-shirt or pillowcase</strong> with your scent on it. Don't wash it.</li>
  <li><strong>Their bed or favorite blanket.</strong></li>
  <li><strong>Their food bowl</strong> with a small amount of normal food.</li>
</ul>

<h2>When to put it out</h2>
<p>Right at dusk. Most lost cats move at dawn and dusk when it's quiet.</p>

<div class="callout info"><strong>Set a wildlife camera</strong> facing the items. Many owners report seeing their cat in footage hours before they actually catch them.</div>`,
  },
  {
    id: "neighbors",
    icon: "🚪",
    title: "Talking to Neighbors, Mail Carriers, and Drivers",
    summary: "These people see your block more than you do. They are your highest-leverage allies.",
    body: `<p class="lede">Three groups will solve your case faster than any algorithm: your immediate neighbors, your mail carrier, and the delivery drivers in your area.</p>

<h2>Neighbors</h2>
<p>Knock on doors within at least a 3-block radius. In person beats notes on doors. Ask:</p>
<ol>
  <li>"Have you seen this dog/cat in the last day?"</li>
  <li>"May I check your backyard, garage, and any sheds?"</li>
  <li>"Do you have a doorbell camera or security camera I could ask you to check?"</li>
</ol>

<h2>Mail carriers</h2>
<p>Your mail carrier walks every block on your route, every day. Hand them a flyer in person.</p>

<h2>Delivery drivers</h2>
<p>UPS, FedEx, Amazon Flex, DoorDash — they cover enormous ground. Tape a flyer to your front door at eye level.</p>

<div class="callout"><strong>Tip:</strong> Offer a small reward specifically for a confirmed sighting that leads to recovery, separate from the reunion reward. It motivates eyes-on-the-ground.</div>`,
  },
  {
    id: "shelters",
    icon: "🏥",
    title: "Working With Shelters, Vets, and Animal Control",
    summary: "What to ask, who to call, and how often. Don't rely on shelter websites — go in person.",
    body: `<p class="lede">Shelters are overwhelmed. Their websites are often a week out of date. The single most effective thing you can do is visit in person every 48 hours.</p>

<h2>Who to call (in this order)</h2>
<ol>
  <li><strong>Your municipal animal control / shelter</strong></li>
  <li><strong>Every other shelter within 25 miles</strong></li>
  <li><strong>All emergency vet clinics</strong></li>
  <li><strong>Local rescues and foster networks</strong></li>
</ol>

<h2>What to ask, exactly</h2>
<ul>
  <li>"Do you have any [species] brought in since [date] that's [size + color]?"</li>
  <li>"May I come look in person?" — always ask this. Shelters routinely mis-tag breed, color, and sex.</li>
  <li>"How long is the stray hold before adoption or transfer?"</li>
</ul>

<div class="callout danger"><strong>Critical:</strong> stray-hold periods are short — sometimes 72 hours. Visit, don't just call.</div>`,
  },
  {
    id: "emotional",
    icon: "💛",
    title: "When the Search Drags On: Caring for Yourself",
    summary: "Day three is harder than day one. Sleep, eat, and don't catastrophize. Most pets are still found.",
    body: `<p class="lede">If you've been searching for more than 48 hours, your body is running on adrenaline and your brain is convinced of the worst. Both of those are lying to you.</p>

<h2>What's actually true</h2>
<ul>
  <li>Pets are recovered weeks and even months after going missing.</li>
  <li>Most pets are found within 5 miles of home, by a neighbor or a passerby.</li>
  <li>The work you've already done keeps working while you sleep.</li>
</ul>

<h2>Take care of yourself</h2>
<ul>
  <li><strong>Sleep.</strong> A foggy brain misses sightings. Sleep is part of the search.</li>
  <li><strong>Eat real food.</strong> Coffee and adrenaline only takes you so far.</li>
  <li><strong>Tell one person each day what's going on.</strong></li>
  <li><strong>Set a daily check-in routine</strong> instead of constant refresh — call shelters once at 9am and once at 4pm.</li>
</ul>

<h2>If you need to talk to someone</h2>
<ul>
  <li><strong>ASPCA Pet Loss Hotline:</strong> 1-877-474-3310</li>
  <li><strong>Tufts Pet Loss Support Hotline:</strong> 1-508-839-7966</li>
</ul>

<div class="callout info">If you'd like a PawTrail volunteer to call you back to talk through next steps, tap <em>Get human help</em> in the assistant.</div>`,
  },
  {
    id: "injured",
    icon: "🚑",
    title: "I Found an Injured Animal",
    summary: "Specific steps for a hurt stray. Stay calm, protect yourself, get them to care.",
    body: `<p class="lede">An injured animal is in pain and scared, which means even a friendly pet may bite. Your first priority is your safety; the second is theirs.</p>

<h2>Before you approach</h2>
<ul>
  <li>Call your local animal control or emergency vet for guidance.</li>
  <li>Wear thick gloves or jacket sleeves over your hands.</li>
  <li>Approach low and slow, sideways. Don't make eye contact.</li>
  <li>If you have a blanket, throw it gently over them.</li>
</ul>

<h2>Transport</h2>
<ul>
  <li><strong>Cats and small dogs:</strong> a sturdy box with air holes, lid taped.</li>
  <li><strong>Larger dogs:</strong> wait for animal control if you can't move them safely.</li>
  <li>Keep them warm — shock drops body temperature.</li>
</ul>

<h2>Emergency numbers</h2>
<ul>
  <li><strong>ASPCA Animal Poison Control:</strong> 1-888-426-4435 (24/7)</li>
  <li><strong>Pet Poison Helpline:</strong> 1-855-764-7661 (24/7)</li>
</ul>

<div class="callout danger"><strong>Do not give human medications.</strong> Tylenol kills cats. Ibuprofen damages dog kidneys.</div>`,
  },
];

// ---- Local Facebook Groups (share wizard) ----
const LOCAL_FB_GROUPS = [
  { name: "Lost & Found Pets — Portland Metro", members: "41K", zip: "972", url: "https://www.facebook.com/groups/lostfoundpetsportland", active: true },
  { name: "Riverbend & Maple Heights Pets", members: "8.2K", zip: "97214", url: "https://www.facebook.com/groups/riverbendpets", active: true },
  { name: "Eastside Lost Pets PDX", members: "22K", zip: "972", url: "https://www.facebook.com/groups/eastsidelostpets", active: true },
  { name: "Westbrook Community Watch + Pets", members: "6.1K", zip: "97216", url: "https://www.facebook.com/groups/westbrookcommunity", active: true },
  { name: "Old Town / Belmont Neighborhood Pets", members: "14K", zip: "97217", url: "https://www.facebook.com/groups/oldtownpets", active: false },
  { name: "Crestline & Forest Glen Strays", members: "5.4K", zip: "97215", url: "https://www.facebook.com/groups/crestlineforestglen", active: true },
  { name: "South Lake & Harbor Hill Pets Found", members: "9.8K", zip: "97218", url: "https://www.facebook.com/groups/southlakepets", active: true },
  { name: "Portland Area LOST Cats — Cats Only", members: "31K", zip: "972", url: "https://www.facebook.com/groups/portlandlostcats", active: true },
  { name: "NW Pet Rescue Network (Volunteers)", members: "3.2K", zip: "972", url: "https://www.facebook.com/groups/nwpetrescue", active: false },
];

// ---- Shelter network ----
const SHELTER_NETWORK = [
  { id: "S-01", name: "Belmont Veterinary Clinic", type: "vet", phone: "(503) 555-0142", address: "1820 SE Belmont St", zip: "97214", hours: "Mon–Sat 8am–6pm", chipScan: true, holdDays: null },
  { id: "S-02", name: "Multnomah County Animal Services", type: "shelter", phone: "(503) 988-7387", address: "1700 SE River Rd", zip: "97202", hours: "Daily 10am–5pm", chipScan: true, holdDays: 5 },
  { id: "S-03", name: "Oregon Humane Society", type: "shelter", phone: "(503) 285-7722", address: "1067 NE Columbia Blvd", zip: "97211", hours: "Daily 11am–7pm", chipScan: true, holdDays: 7 },
  { id: "S-04", name: "Cat Adoption Team", type: "rescue", phone: "(503) 925-8903", address: "14175 SW Galbreath Dr, Sherwood", zip: "97140", hours: "Fri–Sun 11am–5pm", chipScan: false, holdDays: null },
  { id: "S-05", name: "Dove Lewis Emergency Animal Hospital", type: "emergency", phone: "(503) 228-7281", address: "1945 NW Pettygrove St", zip: "97209", hours: "24/7", chipScan: true, holdDays: null },
  { id: "S-06", name: "Hillsboro Animal Control", type: "shelter", phone: "(503) 846-7041", address: "101 SE Scott St, Hillsboro", zip: "97123", hours: "Mon–Fri 8am–5pm", chipScan: true, holdDays: 3 },
  { id: "S-07", name: "PetSmart Charities Adoption Center", type: "rescue", phone: "(503) 555-0199", address: "Various locations", zip: "972", hours: "Daily 11am–7pm", chipScan: true, holdDays: null },
];

// ---- Microchip registries ----
const CHIP_REGISTRIES = [
  { name: "HomeAgain", url: "https://www.homeagain.com/lost-found", phone: "1-888-466-3242", note: "Largest US registry" },
  { name: "AKC Reunite", url: "https://www.akcreunite.org/lost-pet/", phone: "1-800-252-7894", note: "Free registration" },
  { name: "24PetWatch", url: "https://www.24petwatch.com/pet-owners/report-a-lost-pet", phone: "1-866-597-2424", note: "Canadian + US" },
  { name: "Found Animals Registry", url: "https://www.foundanimals.org/microchip-registry", phone: null, note: "Free, no subscription" },
  { name: "PetLink", url: "https://www.petlink.net/lost-pet/", phone: "1-877-738-5465", note: "Schering-Plough chips" },
  { name: "Universal Pet Microchip Lookup", url: "https://www.petmicrochiplookup.org", phone: null, note: "Searches all registries at once" },
];

// ---- Additional shelter intake listings ----
const SHELTER_LISTINGS = [
  L({
    id: "SH-001",
    type: "found",
    species: "dog",
    name: null,
    breed: "Border Collie mix",
    color: "black",
    size: "medium",
    age: "young adult",
    photo: PHOTOS.dog[0],
    location: "Multnomah County Animal Services intake",
    zip: "97202",
    distance: 4.2,
    when: hoursAgo(18),
    contact: "shelter",
    poster: { name: "Multnomah County Animal Services", initials: "MC", neighborhood: "SE Portland" },
    features: "Male, unneutered. Black with white blaze on chest. Energetic, knows basic commands. Brought in by a cyclist who found him running along River Rd.",
    custody: "shelter",
    condition: "healthy",
    status: "active",
    posted: hoursAgo(18),
    verifiedSource: true,
    shelterId: "S-02",
    intakeId: "MCAS-2026-4421",
    stayDeadline: new Date(Date.now() + 4 * 86400000).toISOString(),
  }),
  L({
    id: "SH-002",
    type: "found",
    species: "cat",
    name: null,
    breed: "Siamese mix",
    color: "tan",
    size: "small",
    age: "adult",
    photo: PHOTOS.cat[5],
    location: "Oregon Humane Society intake",
    zip: "97211",
    distance: 6.8,
    when: hoursAgo(30),
    contact: "shelter",
    poster: { name: "Oregon Humane Society", initials: "OH", neighborhood: "NE Portland" },
    features: "Spayed female. Seal-point Siamese coloring. Very vocal, appears socialized. Brought in as a stray from NE Columbia Blvd area.",
    custody: "shelter",
    condition: "healthy",
    status: "active",
    posted: hoursAgo(30),
    verifiedSource: true,
    shelterId: "S-03",
    intakeId: "OHS-2026-8840",
    stayDeadline: new Date(Date.now() + 6 * 86400000).toISOString(),
  }),
  L({
    id: "SH-003",
    type: "found",
    species: "dog",
    name: null,
    breed: "Chihuahua mix",
    color: "tan",
    size: "small",
    age: "senior",
    photo: PHOTOS.dog[3],
    location: "Hillsboro Animal Control intake",
    zip: "97123",
    distance: 14.1,
    when: hoursAgo(48),
    contact: "shelter",
    poster: { name: "Hillsboro Animal Control", initials: "HA", neighborhood: "Hillsboro" },
    features: "Male, appears 8–10 years old. Tan with black muzzle. Well-groomed — clearly someone's pet. Stray hold expires in 3 days.",
    custody: "shelter",
    condition: "healthy",
    status: "active",
    posted: hoursAgo(48),
    verifiedSource: true,
    shelterId: "S-06",
    intakeId: "HAC-2026-0301",
    stayDeadline: new Date(Date.now() + 2 * 86400000).toISOString(),
  }),
];

// Merge shelter listings into SEED_LISTINGS
SEED_LISTINGS.push(...SHELTER_LISTINGS);
