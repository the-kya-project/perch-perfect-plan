export const PARROT_SPECIES: string[] = [
  "African Grey (Congo)",
  "African Grey (Timneh)",
  "Amazon (Blue-fronted)",
  "Amazon (Double Yellow-headed)",
  "Amazon (Orange-winged)",
  "Amazon (Yellow-naped)",
  "Amazon (Yellow-crowned)",
  "Amazon (Lilac-crowned)",
  "Budgerigar (Budgie)",
  "Caique (Black-headed)",
  "Caique (White-bellied)",
  "Cockatiel",
  "Cockatoo (Bare-eyed)",
  "Cockatoo (Citron-crested)",
  "Cockatoo (Galah / Rose-breasted)",
  "Cockatoo (Goffin's)",
  "Cockatoo (Major Mitchell's)",
  "Cockatoo (Moluccan)",
  "Cockatoo (Sulphur-crested)",
  "Cockatoo (Umbrella)",
  "Conure (Blue-crowned)",
  "Conure (Cherry-headed)",
  "Conure (Green-cheeked)",
  "Conure (Half-moon)",
  "Conure (Jenday)",
  "Conure (Nanday)",
  "Conure (Pineapple Green-cheeked)",
  "Conure (Sun)",
  "Eclectus",
  "Hahn's Macaw",
  "Hyacinth Macaw",
  "Lorikeet (Rainbow)",
  "Lovebird (Fischer's)",
  "Lovebird (Peach-faced)",
  "Macaw (Blue-and-Gold)",
  "Macaw (Catalina)",
  "Macaw (Green-winged)",
  "Macaw (Harlequin)",
  "Macaw (Military)",
  "Macaw (Scarlet)",
  "Meyer's Parrot",
  "Parakeet (Alexandrine)",
  "Parakeet (Indian Ringneck)",
  "Parakeet (Monk / Quaker)",
  "Parakeet (Plum-headed)",
  "Parrotlet (Pacific / Celestial)",
  "Pionus (Blue-headed)",
  "Pionus (Bronze-winged)",
  "Pionus (White-capped)",
  "Poicephalus (Senegal)",
  "Poicephalus (Red-bellied)",
];

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
