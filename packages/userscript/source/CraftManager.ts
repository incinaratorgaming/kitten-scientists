import { CacheManager } from "./CacheManager";
import { objectEntries } from "./tools/Entries";
import { isNil, mustExist } from "./tools/Maybe";
import { Resource, ResourceCraftable } from "./types";
import { CraftableInfo, ResourceInfo } from "./types/craft";
import { UserScript } from "./UserScript";

export class CraftManager {
  private readonly _host: UserScript;
  private readonly _cacheManager: CacheManager;

  constructor(host: UserScript) {
    this._host = host;
    this._cacheManager = new CacheManager(this._host);
  }

  craft(name: ResourceCraftable, amount: number): void {
    amount = Math.floor(amount);

    if (!name || 1 > amount) return;
    if (!this._canCraft(name, amount)) return;

    const craft = this.getCraft(name);
    const ratio = this._host.gamePage.getResCraftRatio(craft.name);

    this._host.gamePage.craft(craft.name, amount);

    const iname = mustExist(this._host.gamePage.resPool.get(name)).title;

    // determine actual amount after crafting upgrades
    amount = parseFloat((amount * (1 + ratio)).toFixed(2));

    this._host.storeForSummary(iname, amount, "craft");
    this._host.iactivity(
      "act.craft",
      [this._host.gamePage.getDisplayValueExt(amount), iname],
      "ks-craft"
    );
  }

  private _canCraft(name: ResourceCraftable, amount: number): boolean {
    const craft = this.getCraft(name);
    const enabled = mustExist(this._host.options.auto.craft.items[name]).enabled;
    let result = false;

    if (craft.unlocked && enabled) {
      result = true;

      const prices = this._host.gamePage.workshop.getCraftPrice(craft);
      for (const i in prices) {
        const price = prices[i];
        const value = this.getValueAvailable(price.name);

        if (value < price.val * amount) {
          result = false;
        }
      }
    }

    return result;
  }

  /**
   * Retrieve the resource information object from the game.
   * @param name The name of the craftable resource.
   * @returns The information object for the resource.
   */
  getCraft(name: ResourceCraftable): CraftableInfo {
    const craft = this._host.gamePage.workshop.getCraft(name);
    if (!craft) {
      throw new Error(`Unable to find craft '${name}'`);
    }
    return craft;
  }

  /**
   * Check if we have enough resources to craft a single craftable resource.
   * @param name The name of the resource.
   * @returns `true` if the build is possible; `false` otherwise.
   */
  singleCraftPossible(name: ResourceCraftable): boolean {
    const materials = this.getMaterials(name);
    for (const [mat, amount] of objectEntries<Resource, number>(materials)) {
      if (this.getValueAvailable(mat, true) < amount) {
        return false;
      }
    }
    return true;
  }

  /**
   * Determine the limit of how many items to craft of a given resource.
   * @param name The resource to craft.
   * @param limited Is the crafting of the resource currently limited?
   * @param limRat ?
   * @param aboveTrigger Are we currently above the trigger value?
   * @returns ?
   */
  getLowestCraftAmount(
    name: ResourceCraftable,
    limited: boolean,
    limRat: number,
    aboveTrigger: boolean
  ): number {
    let amount = Number.MAX_VALUE;
    let plateMax = Number.MAX_VALUE;
    const materials = this.getMaterials(name);

    const craft = this.getCraft(name);
    const ratio = this._host.gamePage.getResCraftRatio(craft.name);
    const trigger = this._host.options.auto.craft.trigger;

    // Safeguard if materials for craft cannot be determined.
    if (!materials) {
      return 0;
    }

    // Special case handling to balance iron between plates and steel crafting.
    if (name === "steel" && limited) {
      const plateRatio = this._host.gamePage.getResCraftRatio("plate");
      if (
        this.getValueAvailable("plate") / this.getValueAvailable("steel") <
        (plateRatio + 1) / 125 / ((ratio + 1) / 100)
      ) {
        return 0;
      }
    } else if (name === "plate" && limited) {
      const steelRatio = this._host.gamePage.getResCraftRatio("steel");
      if (this._host.gamePage.getResourcePerTick("coal", true) > 0) {
        if (
          this.getValueAvailable("plate") / this.getValueAvailable("steel") >
          (ratio + 1) / 125 / ((steelRatio + 1) / 100)
        ) {
          const ironInTime =
            ((this.getResource("coal").maxValue * trigger - this.getValue("coal")) /
              this._host.gamePage.getResourcePerTick("coal", true)) *
            Math.max(this._host.gamePage.getResourcePerTick("iron", true), 0);
          plateMax =
            (this.getValueAvailable("iron") -
              Math.max(this.getResource("coal").maxValue * trigger - ironInTime, 0)) /
            125;
        }
      }
    }

    const shipOverride =
      this._host.options.auto.options.enabled &&
      this._host.options.auto.options.items.shipOverride.enabled;

    const res = this.getResource(name);

    for (const [resource, materialAmount] of objectEntries(materials)) {
      let delta = undefined;
      if (
        !limited ||
        (this.getResource(resource).maxValue > 0 && aboveTrigger) ||
        (name === "ship" && shipOverride && this.getResource("ship").value < 243)
      ) {
        // If there is a storage limit, we can just use everything returned by getValueAvailable, since the regulation happens there
        delta = this.getValueAvailable(resource) / materialAmount;
      } else {
        // Take the currently present amount of material to craft into account
        // Currently this determines the amount of resources that can be crafted such that base materials are proportionally distributed across limited resources.
        // This base material distribution is governed by limRat "limited ratio" which defaults to 0.5, corresponding to half of the possible components being further crafted.
        // If this were another value, such as 0.75, then if you had 10000 beams and 0 scaffolds, 7500 of the beams would be crafted into scaffolds.
        delta =
          limRat *
            ((this.getValueAvailable(resource, true) +
              (materialAmount / (1 + ratio)) * this.getValueAvailable(res.name, true)) /
              materialAmount) -
          this.getValueAvailable(res.name, true) / (1 + ratio);
      }

      amount = Math.min(delta, amount, plateMax);
    }

    // If we have a maximum value, ensure that we don't produce more than
    // this value. This should currently only impact wood crafting, but is
    // written generically to ensure it works for any craft that produces a
    // good with a maximum value.
    if (res.maxValue > 0 && amount > res.maxValue - res.value) amount = res.maxValue - res.value;

    return Math.floor(amount);
  }

  /**
   * Returns a hash of the required source resources and their
   * amount to craft the given resource.
   * @param name The resource to craft.
   * @returns The source resources you need and how many.
   */
  getMaterials(name: ResourceCraftable): Partial<Record<Resource, number>> {
    const materials: Partial<Record<Resource, number>> = {};
    const craft = this.getCraft(name);

    const prices = this._host.gamePage.workshop.getCraftPrice(craft);

    for (const i in prices) {
      const price = prices[i];

      materials[price.name] = price.val;
    }

    return materials;
  }

  getTickVal(res: ResourceInfo, preTrade: boolean | undefined = undefined): number | "ignore" {
    let prod = this._host.gamePage.getResourcePerTick(res.name, true);
    if (res.craftable) {
      let minProd = Number.MAX_VALUE;
      const materials = this.getMaterials(res.name as ResourceCraftable);
      for (const [mat, amount] of objectEntries<Resource, number>(materials)) {
        const rat = (1 + this._host.gamePage.getResCraftRatio(res.name)) / amount;
        //Currently preTrade is only true for the festival stuff, so including furs from hunting is ideal.
        const addProd = this.getTickVal(this.getResource(mat));
        if (addProd === "ignore") continue;
        minProd = Math.min(addProd * rat, minProd);
      }
      prod += minProd !== Number.MAX_VALUE ? minProd : 0;
    }
    if (prod <= 0 && (res.name === "spice" || res.name === "blueprint")) {
      return "ignore";
    }
    if (!preTrade) {
      prod += this._cacheManager.getResValue(res.name);
    }
    return prod;
  }

  getAverageHunt(): Partial<Record<Resource, number>> {
    const output: Partial<Record<Resource, number>> = {};
    const hunterRatio =
      this._host.gamePage.getEffect("hunterRatio") +
      this._host.gamePage.village.getEffectLeader("manager", 0);

    output["furs"] = 40 + 32.5 * hunterRatio;

    output["ivory"] =
      50 * Math.min(0.225 + 0.01 * hunterRatio, 0.5) +
      40 * hunterRatio * Math.min(0.225 + 0.01 * hunterRatio, 0.5);

    output["unicorns"] = 0.05;

    if (this.getValue("zebras") >= 10) {
      output["bloodstone"] = this.getValue("bloodstone") === 0 ? 0.05 : 0.0005;
    }

    if (this._host.gamePage.ironWill && this._host.gamePage.workshop.get("goldOre").researched) {
      output["gold"] = 0.625 + 0.625 * hunterRatio;
    }

    return output;
  }

  getResource(name: Resource): ResourceInfo {
    if (name === "slabs") {
      name = "slab";
    }
    const res = this._host.gamePage.resPool.get(name);
    if (isNil(res)) {
      throw new Error(`Unable to find resource ${name}`);
    }
    return res;
  }

  getValue(name: Resource): number {
    return this.getResource(name).value;
  }

  getStock(name: Resource): number {
    const res = this._host.options.auto.resources[name];
    const stock = res && res.enabled ? res.stock : 0;

    return !stock ? 0 : stock;
  }

  /**
   * Determine how much of a resource is available for a certain operation
   * to use.
   * @param name The resource to check.
   * @param all ?
   * @param typeTrigger The trigger value associated with this check.
   * @returns The available amount of the resource.
   */
  getValueAvailable(
    name: Resource,
    all: boolean | undefined = undefined,
    typeTrigger: number | undefined = undefined
  ): number {
    let stock = this.getStock(name);

    if ("catnip" === name) {
      const pastureMeta = this._host.gamePage.bld.getBuildingExt("pasture").meta;
      const aqueductMeta = this._host.gamePage.bld.getBuildingExt("aqueduct").meta;
      const pastures = pastureMeta.stage === 0 ? pastureMeta.val : 0;
      const aqueducts = aqueductMeta.stage === 0 ? aqueductMeta.val : 0;
      const resPerTick = this.getPotentialCatnip(true, pastures, aqueducts);

      if (resPerTick < 0) {
        stock -= resPerTick * 202 * 5;
      }
    }

    let value = this.getValue(name);
    value = Math.max(value - stock, 0);

    // If we have a maxValue, and user hasn't requested all, check
    // consumption rate
    if (!all && this.getResource(name).maxValue > 0) {
      // Determine our de-facto trigger value to use.
      let trigger: number;
      if (!typeTrigger && typeTrigger !== 0) {
        trigger = this._host.options.auto.craft.trigger;
      } else {
        trigger = typeTrigger;
      }

      const resourceSettings = this._host.options.auto.resources[name];
      const consume =
        resourceSettings && resourceSettings.enabled && resourceSettings.consume != undefined
          ? resourceSettings.consume
          : this._host.options.consume;

      value -= Math.min(this.getResource(name).maxValue * trigger, value) * (1 - consume);
    }

    return value;
  }

  getPotentialCatnip(worstWeather: unknown, pastures: number, aqueducts: number): number {
    let fieldProd = this._host.gamePage.getEffect("catnipPerTickBase");
    if (worstWeather) {
      fieldProd *= 0.1;
    } else {
      fieldProd *=
        this._host.gamePage.calendar.getWeatherMod() +
        this._host.gamePage.calendar.getCurSeason().modifiers["catnip"];
    }
    const vilProd = this._host.gamePage.village.getResProduction().catnip
      ? this._host.gamePage.village.getResProduction().catnip *
        (1 + this._host.gamePage.getEffect("catnipJobRatio"))
      : 0;
    let baseProd = fieldProd + vilProd;

    let hydroponics = this._host.gamePage.space.getBuilding("hydroponics").val;
    if (this._host.gamePage.prestige.meta[0].meta[21].researched) {
      if (this._host.gamePage.calendar.cycle === 2) {
        hydroponics *= 2;
      }
      if (this._host.gamePage.calendar.cycle === 7) {
        hydroponics *= 0.5;
      }
    }
    baseProd *= 1 + 0.03 * aqueducts + 0.025 * hydroponics;

    const paragonBonus =
      this._host.gamePage.challenges.currentChallenge == "winterIsComing"
        ? 0
        : this._host.gamePage.prestige.getParagonProductionRatio();
    baseProd *= 1 + paragonBonus;

    baseProd *= 1 + this._host.gamePage.religion.getSolarRevolutionRatio();

    if (!this._host.gamePage.opts.disableCMBR) {
      baseProd *= 1 + this._host.gamePage.getCMBRBonus();
    }

    baseProd = this._host.gamePage.calendar.cycleEffectsFestival({ catnip: baseProd })["catnip"];

    let baseDemand = this._host.gamePage.village.getResConsumption()["catnip"];
    const uniPastures = this._host.gamePage.bld.getBuildingExt("unicornPasture").meta.val;
    baseDemand *=
      1 + this._host.gamePage.getLimitedDR(pastures * -0.005 + uniPastures * -0.0015, 1.0);
    if (
      this._host.gamePage.village.sim.kittens.length > 0 &&
      this._host.gamePage.village.happiness > 1
    ) {
      const happyCon = this._host.gamePage.village.happiness - 1;
      if (this._host.gamePage.challenges.currentChallenge == "anarchy") {
        baseDemand *=
          1 + happyCon * (1 + this._host.gamePage.getEffect("catnipDemandWorkerRatioGlobal"));
      } else {
        baseDemand *=
          1 +
          happyCon *
            (1 + this._host.gamePage.getEffect("catnipDemandWorkerRatioGlobal")) *
            (1 -
              this._host.gamePage.village.getFreeKittens() /
                this._host.gamePage.village.sim.kittens.length);
      }
    }
    baseProd += baseDemand;

    baseProd += this._host.gamePage.getResourcePerTickConvertion("catnip");

    //Might need to eventually factor in time acceleration using this._host.gamePage.timeAccelerationRatio().
    return baseProd;
  }
}
