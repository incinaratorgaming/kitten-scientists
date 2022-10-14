import { SettingTrigger } from "./Settings";
import { LegacyStorage } from "./SettingsStorage";
import { CycleIndices } from "./TimeControlSettings";

export class TimeSkipSettings extends SettingTrigger {
  max = 50;

  spring = true;
  summer = false;
  autumn = false;
  winter = false;

  0 = false;
  1 = false;
  2 = false;
  3 = false;
  4 = false;
  5 = false;
  6 = false;
  7 = false;
  8 = false;
  9 = false;

  constructor() {
    super(false, 5);
  }

  load(settings: TimeSkipSettings) {
    super.load(settings);
    this.max = settings.max;

    this.autumn = settings.autumn;
    this.spring = settings.spring;
    this.summer = settings.summer;
    this.winter = settings.winter;

    for (let cycleIndex = 0; cycleIndex < 10; ++cycleIndex) {
      this[cycleIndex as CycleIndices] = settings[cycleIndex as CycleIndices];
    }
  }

  static toLegacyOptions(settings: TimeSkipSettings, subject: LegacyStorage) {
    subject.items["toggle-timeSkip"] = settings.enabled;
    subject.items["set-timeSkip-trigger"] = settings.trigger;
    subject.items["set-timeSkip-max"] = settings.max;
    subject.items["toggle-timeSkip-autumn"] = settings.autumn;
    subject.items["toggle-timeSkip-spring"] = settings.spring;
    subject.items["toggle-timeSkip-summer"] = settings.summer;
    subject.items["toggle-timeSkip-winter"] = settings.winter;

    for (let cycleIndex = 0; cycleIndex < 10; ++cycleIndex) {
      subject.items[`toggle-timeSkip-${cycleIndex as CycleIndices}` as const] =
        settings[cycleIndex as CycleIndices];
    }
  }

  static fromLegacyOptions(subject: LegacyStorage) {
    const options = new TimeSkipSettings();
    options.enabled = subject.items["toggle-timeSkip"] ?? options.enabled;

    options.trigger = subject.items["set-timeSkip-trigger"] ?? options.trigger;
    options.max = subject.items["set-timeSkip-max"] ?? options.max;
    options.autumn = subject.items["toggle-timeSkip-autumn"] ?? options.autumn;
    options.spring = subject.items["toggle-timeSkip-spring"] ?? options.spring;
    options.summer = subject.items["toggle-timeSkip-summer"] ?? options.summer;
    options.winter = subject.items["toggle-timeSkip-winter"] ?? options.winter;

    for (let cycleIndex = 0; cycleIndex < 10; ++cycleIndex) {
      options[cycleIndex as CycleIndices] =
        subject.items[`toggle-timeSkip-${cycleIndex as CycleIndices}` as const] ??
        options[cycleIndex as CycleIndices];
    }

    return options;
  }
}
