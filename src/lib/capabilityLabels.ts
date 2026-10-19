import i18next from "i18next";
import type { Capability, Preset, AssignablePreset } from "@/lib/capabilities";

// Display-time translations of the capability/preset labels in capabilities.ts.
// The English constants there stay the source of truth (and the stored values
// are the ids, never the labels); these switch to literal keys so the
// extractor can see them.

export function presetLabel(p: Preset): string {
  switch (p) {
    case "viewer": return i18next.t("capabilities.presetViewer", "Viewer");
    case "caregiver": return i18next.t("capabilities.presetCaregiver", "Caregiver");
    case "care_manager": return i18next.t("capabilities.presetCareManager", "Care manager");
    case "co_owner": return i18next.t("capabilities.presetCoOwner", "Co-owner");
    case "custom": return i18next.t("capabilities.presetCustom", "Custom");
  }
}

export function presetDescription(p: AssignablePreset): string {
  switch (p) {
    case "viewer": return i18next.t("capabilities.descViewer", "Can see everything; can't make changes.");
    case "caregiver": return i18next.t("capabilities.descCaregiver", "Can log daily care and record health.");
    case "care_manager": return i18next.t("capabilities.descCareManager", "Caregiver, plus edit care plans, emergency info, and sits.");
    case "co_owner": return i18next.t("capabilities.descCoOwner", "Full access, like a second owner.");
  }
}

export function capabilityLabel(c: Capability): string {
  switch (c) {
    case "log_daily_care": return i18next.t("capabilities.logDailyCare", "Log daily care");
    case "record_health": return i18next.t("capabilities.recordHealth", "Record health");
    case "edit_care_plans": return i18next.t("capabilities.editCarePlans", "Edit care plans");
    case "manage_emergency": return i18next.t("capabilities.manageEmergency", "Manage emergency info");
    case "manage_sits": return i18next.t("capabilities.manageSits", "Manage sits");
    case "manage_flock": return i18next.t("capabilities.manageFlock", "Manage the flock");
    case "manage_household": return i18next.t("capabilities.manageHousehold", "Manage the household");
  }
}
