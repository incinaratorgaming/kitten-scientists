import { objectEntries } from "../tools/Entries";
import { ChronoForgeUpgrades, TimeItemVariant, VoidSpaceUpgrades } from "../types";
import { Requirement, SettingMax } from "./Settings";
import { SettingsSectionTrigger } from "./SettingsSection";
import { KittenStorageType } from "./SettingsStorage";

/**
 * The upgrades on the Time tab that we have options for.
 */
export type TimeItem = Exclude<ChronoForgeUpgrades | VoidSpaceUpgrades, "usedCryochambers">;
export class TimeSettingsItem extends SettingMax {
  require: Requirement;

  variant: TimeItemVariant;

  constructor(id: string, variant: TimeItemVariant, require: Requirement = false, enabled = false) {
    super(id, enabled);

    this.require = require;
    this.variant = variant;
  }
}

export type TimeSettingsItems = {
  [item in TimeItem]: TimeSettingsItem;
};

export class TimeSettings extends SettingsSectionTrigger {
  items: TimeSettingsItems;

  constructor(
    enabled = false,
    trigger = 1,
    items: TimeSettingsItems = {
      blastFurnace: new TimeSettingsItem("blastFurnace", TimeItemVariant.Chronoforge),
      chronocontrol: new TimeSettingsItem(
        "chronocontrol",
        TimeItemVariant.VoidSpace,
        "temporalFlux"
      ),
      cryochambers: new TimeSettingsItem("cryochambers", TimeItemVariant.VoidSpace),
      ressourceRetrieval: new TimeSettingsItem("ressourceRetrieval", TimeItemVariant.Chronoforge),
      temporalAccelerator: new TimeSettingsItem("temporalAccelerator", TimeItemVariant.Chronoforge),
      temporalBattery: new TimeSettingsItem("temporalBattery", TimeItemVariant.Chronoforge),
      temporalImpedance: new TimeSettingsItem("temporalImpedance", TimeItemVariant.Chronoforge),
      timeBoiler: new TimeSettingsItem("timeBoiler", TimeItemVariant.Chronoforge),
      voidHoover: new TimeSettingsItem("voidHoover", TimeItemVariant.VoidSpace, "antimatter"),
      voidResonator: new TimeSettingsItem("voidResonator", TimeItemVariant.VoidSpace),
      voidRift: new TimeSettingsItem("voidRift", TimeItemVariant.VoidSpace),
    }
  ) {
    super("time", enabled, trigger);
    this.items = items;
  }

  load(settings: TimeSettings) {
    this.enabled = settings.enabled;
    this.trigger = settings.trigger;

    for (const [name, item] of objectEntries(settings.items)) {
      this.items[name].enabled = item.enabled;
      this.items[name].max = item.max;
    }
  }

  static toLegacyOptions(settings: TimeSettings, subject: KittenStorageType) {
    subject.toggles.time = settings.enabled;
    subject.triggers.time = settings.trigger;

    for (const [name, item] of objectEntries(settings.items)) {
      subject.items[`toggle-${name}` as const] = item.enabled;
      subject.items[`set-${name}-max` as const] = item.max;
    }
  }

  static fromLegacyOptions(subject: KittenStorageType) {
    const options = new TimeSettings();
    options.enabled = subject.toggles.time;
    options.trigger = subject.triggers.time;

    for (const [name, item] of objectEntries(options.items)) {
      item.enabled = subject.items[`toggle-${name}` as const] ?? item.enabled;
      item.max = subject.items[`set-${name}-max` as const] ?? item.max;
    }
    return options;
  }
}
