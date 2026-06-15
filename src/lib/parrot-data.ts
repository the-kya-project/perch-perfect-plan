export type SpeciesGroup = { label: string; options: string[] };

// Grouped by common genus/family, alphabetical within each group.
export const PARROT_SPECIES_GROUPS: SpeciesGroup[] = [
  {
    label: "Amazon",
    options: [
      "Blue-fronted Amazon",
      "Double Yellow-headed Amazon",
      "Lilac-crowned Amazon",
      "Orange-winged Amazon",
      "Yellow-crowned Amazon",
      "Yellow-naped Amazon",
    ],
  },
  {
    label: "Caique",
    options: ["Black-headed Caique", "White-bellied Caique"],
  },
  {
    label: "Cockatoo",
    options: [
      "Bare-eyed Cockatoo",
      "Citron-crested Cockatoo",
      "Galah (Rose-breasted Cockatoo)",
      "Goffin's Cockatoo",
      "Major Mitchell's Cockatoo",
      "Moluccan Cockatoo",
      "Sulphur-crested Cockatoo",
      "Umbrella Cockatoo",
    ],
  },
  {
    label: "Conure",
    options: [
      "Blue-crowned Conure",
      "Cherry-headed Conure",
      "Green-cheeked Conure",
      "Half-moon Conure",
      "Jenday Conure",
      "Nanday Conure",
      "Pineapple Green-cheeked Conure",
      "Sun Conure",
    ],
  },
  {
    label: "Lovebird",
    options: ["Fischer's Lovebird", "Peach-faced Lovebird"],
  },
  {
    label: "Macaw",
    options: [
      "Blue and Gold Macaw",
      "Blue-throated Macaw",
      "Catalina Macaw",
      "Green-winged Macaw",
      "Hahn's Macaw",
      "Harlequin Macaw",
      "Hyacinth Macaw",
      "Military Macaw",
      "Scarlet Macaw",
    ],
  },
  {
    label: "Parakeet",
    options: [
      "Alexandrine Parakeet",
      "Indian Ringneck Parakeet",
      "Monk Parakeet (Quaker)",
      "Plum-headed Parakeet",
    ],
  },
  {
    label: "Pionus",
    options: ["Blue-headed Pionus", "Bronze-winged Pionus", "White-capped Pionus"],
  },
  {
    label: "Poicephalus",
    options: ["Meyer's Parrot", "Red-bellied Parrot", "Senegal Parrot"],
  },
  {
    label: "Other species",
    options: [
      "African Grey (Congo)",
      "African Grey (Timneh)",
      "Budgerigar (Budgie)",
      "Cockatiel",
      "Eclectus",
      "Pacific Parrotlet",
      "Rainbow Lorikeet",
    ],
  },
];

export const PARROT_SPECIES: string[] = PARROT_SPECIES_GROUPS.flatMap((g) => g.options);

export const AGE_OPTIONS: string[] = [
  "<1 year",
  ...Array.from({ length: 75 }, (_, i) => `${i + 1} year${i === 0 ? "" : "s"}`),
];

export function ageFromBirthDate(birthDate: string | null | undefined): string | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) years--;
  if (years < 1) return "<1 year";
  return `${years} year${years === 1 ? "" : "s"}`;
}
