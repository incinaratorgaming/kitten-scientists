import { CraftManager } from "./CraftManager";
import { TabManager } from "./TabManager";
import { BuildButton, Race } from "./types";
import { UserScript } from "./UserScript";

export class TradeManager {
  private readonly _host: UserScript;
  private readonly _manager: TabManager;
  private readonly _craftManager: CraftManager;

  constructor(host: UserScript) {
    this._host = host;
    this._manager = new TabManager(this._host, "Trade");
    this._craftManager = new CraftManager(this._host);
  }

  trade(name: string, amount: number): void {
    if (!name || 1 > amount) {
      this._host.warning(
        "KS trade checks are not functioning properly, please create an issue on the github page."
      );
    }

    const race = this.getRace(name);

    const button = this.getTradeButton(race.name);

    if (!button.model.enabled || !options.auto.trade.items[name].enabled) {
      this._host.warning(
        "KS trade checks are not functioning properly, please create an issue on the github page."
      );
    }

    this._host.gamePage.diplomacy.tradeMultiple(race, amount);
    storeForSummary(race.title, amount, "trade");
    this._host.iactivity("act.trade", [amount, ucfirst(race.title)], "ks-trade");
  }

  getProfitability(name: string): unknown {
    const race = this.getRace(name);

    const materials = this.getMaterials(name);
    let cost = 0;
    for (const mat in materials) {
      const tick = this._craftManager.getTickVal(this._craftManager.getResource(mat));
      if (tick <= 0) {
        return false;
      }
      cost += materials[mat] / tick;
    }

    const output = this.getAverageTrade(race);
    let profit = 0;
    for (const prod in output) {
      const res = this._craftManager.getResource(prod);
      const tick = this._craftManager.getTickVal(res);
      if (tick === "ignore") {
        continue;
      }
      if (tick <= 0) {
        return true;
      }
      profit +=
        res.maxValue > 0
          ? Math.min(output[prod], Math.max(res.maxValue - res.value, 0)) / tick
          : output[prod] / tick;
    }
    return cost <= profit;
  }

  getAverageTrade(race: string): unknown {
    // standingRatio
    // var standRat = this._host.gamePage.getEffect("standingRatio");
    const standRat =
      this._host.gamePage.getEffect("standingRatio") +
      this._host.gamePage.diplomacy.calculateStandingFromPolicies(race.name, game);
    // standRat += (this._host.gamePage.prestige.getPerk("diplomacy").researched) ? 10 : 0;
    // raceRatio
    const rRatio = 1 + race.energy * 0.02;
    // tradeRatio
    // var tRatio = 1 + this._host.gamePage.diplomacy.getTradeRatio();
    const tRatio =
      1 +
      this._host.gamePage.diplomacy.getTradeRatio() +
      this._host.gamePage.diplomacy.calculateTradeBonusFromPolicies(race.name, game);
    // var successRat = (race.attitude === "hostile") ? Math.min(race.standing + standRat/100, 1) : 1;
    // var bonusRat = (race.attitude === "friendly") ? Math.min(race.standing + standRat/200, 1) : 0;
    // ref: var failedTradeAmount = race.standing < 0 ? this.this._host.gamePage.math.binominalRandomInteger(totalTradeAmount, -(race.standing + standingRatio)) : 0;
    // ref: var successfullTradeAmount = totalTradeAmount - failedTradeAmount;
    const failedRat = race.standing < 0 ? race.standing + standRat : 0;
    const successRat = failedRat < 0 ? 1 + failedRat : 1;
    const bonusRat = race.standing > 0 ? Math.min(race.standing + standRat / 2, 1) : 0;

    const output = {};
    for (const s in race.sells) {
      const item = race.sells[s];
      if (!this.isValidTrade(item, race)) {
        continue;
      }
      const resource = this._craftManager.getResource(item.name);
      let mean = 0;
      const tradeChance = race.embassyPrices
        ? item.chance * (1 + this._host.gamePage.getLimitedDR(0.01 * race.embassyLevel, 0.75))
        : item.chance;
      if (race.name == "zebras" && item.name == "titanium") {
        const shipCount = this._host.gamePage.resPool.get("ship").value;
        const titanProb = Math.min(0.15 + shipCount * 0.0035, 1);
        const titanRat = 1 + shipCount / 50;
        mean = 1.5 * titanRat * (successRat * titanProb);
      } else {
        const sRatio = !item.seasons
          ? 1
          : 1 + item.seasons[this._host.gamePage.calendar.getCurSeason().name];
        const normBought = (successRat - bonusRat) * Math.min(tradeChance / 100, 1);
        const normBonus = bonusRat * Math.min(tradeChance / 100, 1);
        mean = (normBought + 1.25 * normBonus) * item.value * rRatio * sRatio * tRatio;
      }
      output[item.name] = mean;
    }

    const spiceChance = race.embassyPrices ? 0.35 * (1 + 0.01 * race.embassyLevel) : 0.35;
    const spiceTradeAmount = successRat * Math.min(spiceChance, 1);
    output["spice"] = 25 * spiceTradeAmount + (50 * spiceTradeAmount * tRatio) / 2;

    output["blueprint"] = 0.1 * successRat;

    return output;
  }

  isValidTrade(item: string, race: string): unknown {
    return (
      !(item.minLevel && race.embassyLevel < item.minLevel) &&
      (this._host.gamePage.resPool.get(item.name).unlocked ||
        item.name === "titanium" ||
        item.name === "uranium" ||
        race.name === "leviathans")
    );
  }

  getLowestTradeAmount(name: string, limited: boolean, trigConditions: unknown): unknown {
    let amount = undefined;
    let highestCapacity = undefined;
    const materials = this.getMaterials(name);
    const race = this.getRace(name);

    let total;
    for (const i in materials) {
      if (i === "manpower") {
        total = this._craftManager.getValueAvailable(i, true) / materials[i];
      } else {
        total =
          this._craftManager.getValueAvailable(i, limited, options.auto.trade.trigger) /
          materials[i];
      }

      amount = amount === undefined || total < amount ? total : amount;
    }

    amount = Math.floor(amount);

    if (amount === 0) {
      return 0;
    }

    if (race === null || this._host.options.auto.trade.items[name].allowcapped) return amount;

    // Loop through the items obtained by the race, and determine
    // which good has the most space left. Once we've determined this,
    // reduce the amount by this capacity. This ensures that we continue to trade
    // as long as at least one resource has capacity, and we never over-trade.

    const tradeOutput = this.getAverageTrade(race);
    for (const s in race.sells) {
      const item = race.sells[s];
      const resource = this._craftManager.getResource(item.name);
      let max = 0;

      // No need to process resources that don't cap
      if (!resource.maxValue) continue;

      max = tradeOutput[item.name];

      const capacity = Math.max((resource.maxValue - resource.value) / max, 0);

      highestCapacity = capacity < highestCapacity ? highestCapacity : capacity;
    }

    // We must take the ceiling of capacity so that we will trade as long
    // as there is any room, even if it doesn't have exact space. Otherwise
    // we seem to starve trading altogether.
    highestCapacity = Math.ceil(highestCapacity);

    if (highestCapacity === 0) {
      return 0;
    }

    // Now that we know the most we *should* trade for, check to ensure that
    // we trade for our max cost, or our max capacity, whichever is lower.
    // This helps us prevent trading for resources we can't store. Note that we
    // essentially ignore blueprints here. In addition, if highestCapacity was never set,
    // then we just

    amount = highestCapacity < amount ? Math.max(highestCapacity - 1, 1) : amount;

    return Math.floor(amount);
  }

  getMaterials(name: string | undefined): { gold: number; manpower: number } {
    const materials = {
      manpower: 50 - this._host.gamePage.getEffect("tradeCatpowerDiscount"),
      gold: 15 - this._host.gamePage.getEffect("tradeGoldDiscount"),
    };

    if (name === undefined) return materials;

    const prices = this.getRace(name).buys;

    for (const i in prices) {
      const price = prices[i];

      materials[price.name] = price.val;
    }

    return materials;
  }

  getRace(name: Race): { buys: unknown } | null {
    if (name === undefined) return null;
    else return this._host.gamePage.diplomacy.get(name);
  }

  getTradeButton(race: string): BuildButton | void {
    for (const i in this._manager.tab.racePanels) {
      const panel = this._manager.tab.racePanels[i];

      if (panel.race.name === race) return panel.tradeBtn;
    }
  }

  singleTradePossible(name: string | undefined): unknown {
    const materials = this.getMaterials(name);
    for (const mat in materials) {
      if (this._craftManager.getValueAvailable(mat, true) < materials[mat]) {
        return false;
      }
    }
    return true;
  }
}
