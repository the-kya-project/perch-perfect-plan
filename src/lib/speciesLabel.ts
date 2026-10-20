import type { TFunction } from "i18next";

/** Display name for a stored English species value. Species stay stored in
 *  English (they are compared and grouped elsewhere); this translates at display
 *  only. Literal keys so i18n:extract sees each one. Unknown/custom species fall
 *  back to the stored text. */
export function speciesLabel(t: TFunction, species: string): string {
  switch (species) {
    case "Blue-fronted Amazon": return t("species.blueFrontedAmazon", "Blue-fronted Amazon");
    case "Double Yellow-headed Amazon": return t("species.doubleYellowHeadedAmazon", "Double Yellow-headed Amazon");
    case "Lilac-crowned Amazon": return t("species.lilacCrownedAmazon", "Lilac-crowned Amazon");
    case "Orange-winged Amazon": return t("species.orangeWingedAmazon", "Orange-winged Amazon");
    case "Yellow-crowned Amazon": return t("species.yellowCrownedAmazon", "Yellow-crowned Amazon");
    case "Yellow-naped Amazon": return t("species.yellowNapedAmazon", "Yellow-naped Amazon");
    case "Black-headed Caique": return t("species.blackHeadedCaique", "Black-headed Caique");
    case "White-bellied Caique": return t("species.whiteBelliedCaique", "White-bellied Caique");
    case "Bare-eyed Cockatoo": return t("species.bareEyedCockatoo", "Bare-eyed Cockatoo");
    case "Citron-crested Cockatoo": return t("species.citronCrestedCockatoo", "Citron-crested Cockatoo");
    case "Galah (Rose-breasted Cockatoo)": return t("species.galah", "Galah (Rose-breasted Cockatoo)");
    case "Goffin's Cockatoo": return t("species.goffinsCockatoo", "Goffin's Cockatoo");
    case "Major Mitchell's Cockatoo": return t("species.majorMitchellsCockatoo", "Major Mitchell's Cockatoo");
    case "Moluccan Cockatoo": return t("species.moluccanCockatoo", "Moluccan Cockatoo");
    case "Sulphur-crested Cockatoo": return t("species.sulphurCrestedCockatoo", "Sulphur-crested Cockatoo");
    case "Umbrella Cockatoo": return t("species.umbrellaCockatoo", "Umbrella Cockatoo");
    case "Blue-crowned Conure": return t("species.blueCrownedConure", "Blue-crowned Conure");
    case "Cherry-headed Conure": return t("species.cherryHeadedConure", "Cherry-headed Conure");
    case "Green-cheeked Conure": return t("species.greenCheekedConure", "Green-cheeked Conure");
    case "Half-moon Conure": return t("species.halfMoonConure", "Half-moon Conure");
    case "Jenday Conure": return t("species.jendayConure", "Jenday Conure");
    case "Nanday Conure": return t("species.nandayConure", "Nanday Conure");
    case "Pineapple Green-cheeked Conure": return t("species.pineappleGreenCheekedConure", "Pineapple Green-cheeked Conure");
    case "Sun Conure": return t("species.sunConure", "Sun Conure");
    case "Fischer's Lovebird": return t("species.fischersLovebird", "Fischer's Lovebird");
    case "Peach-faced Lovebird": return t("species.peachFacedLovebird", "Peach-faced Lovebird");
    case "Blue and Gold Macaw": return t("species.blueAndGoldMacaw", "Blue and Gold Macaw");
    case "Blue-throated Macaw": return t("species.blueThroatedMacaw", "Blue-throated Macaw");
    case "Catalina Macaw": return t("species.catalinaMacaw", "Catalina Macaw");
    case "Green-winged Macaw": return t("species.greenWingedMacaw", "Green-winged Macaw");
    case "Hahn's Macaw": return t("species.hahnsMacaw", "Hahn's Macaw");
    case "Harlequin Macaw": return t("species.harlequinMacaw", "Harlequin Macaw");
    case "Hyacinth Macaw": return t("species.hyacinthMacaw", "Hyacinth Macaw");
    case "Military Macaw": return t("species.militaryMacaw", "Military Macaw");
    case "Scarlet Macaw": return t("species.scarletMacaw", "Scarlet Macaw");
    case "Alexandrine Parakeet": return t("species.alexandrineParakeet", "Alexandrine Parakeet");
    case "Indian Ringneck Parakeet": return t("species.indianRingneckParakeet", "Indian Ringneck Parakeet");
    case "Monk Parakeet (Quaker)": return t("species.monkParakeet", "Monk Parakeet (Quaker)");
    case "Plum-headed Parakeet": return t("species.plumHeadedParakeet", "Plum-headed Parakeet");
    case "Blue-headed Pionus": return t("species.blueHeadedPionus", "Blue-headed Pionus");
    case "Bronze-winged Pionus": return t("species.bronzeWingedPionus", "Bronze-winged Pionus");
    case "White-capped Pionus": return t("species.whiteCappedPionus", "White-capped Pionus");
    case "Meyer's Parrot": return t("species.meyersParrot", "Meyer's Parrot");
    case "Red-bellied Parrot": return t("species.redBelliedParrot", "Red-bellied Parrot");
    case "Senegal Parrot": return t("species.senegalParrot", "Senegal Parrot");
    case "African Grey (Congo)": return t("species.africanGreyCongo", "African Grey (Congo)");
    case "African Grey (Timneh)": return t("species.africanGreyTimneh", "African Grey (Timneh)");
    case "Budgerigar (Budgie)": return t("species.budgerigar", "Budgerigar (Budgie)");
    case "Cockatiel": return t("species.cockatiel", "Cockatiel");
    case "Eclectus": return t("species.eclectus", "Eclectus");
    case "Pacific Parrotlet": return t("species.pacificParrotlet", "Pacific Parrotlet");
    case "Rainbow Lorikeet": return t("species.rainbowLorikeet", "Rainbow Lorikeet");
    default: return species;
  }
}

/** Display label for a species-picker group heading (stored English label). */
export function speciesGroupLabel(t: TFunction, group: string): string {
  switch (group) {
    case "Amazon": return t("species.groupAmazon", "Amazon");
    case "Caique": return t("species.groupCaique", "Caique");
    case "Cockatoo": return t("species.groupCockatoo", "Cockatoo");
    case "Conure": return t("species.groupConure", "Conure");
    case "Lovebird": return t("species.groupLovebird", "Lovebird");
    case "Macaw": return t("species.groupMacaw", "Macaw");
    case "Parakeet": return t("species.groupParakeet", "Parakeet");
    case "Pionus": return t("species.groupPionus", "Pionus");
    case "Poicephalus": return t("species.groupPoicephalus", "Poicephalus");
    case "Other species": return t("species.groupOther", "Other species");
    default: return group;
  }
}
