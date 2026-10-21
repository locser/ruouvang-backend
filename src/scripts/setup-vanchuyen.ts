import {
  createShippingOptionsWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows";
import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

/**
 * Dung cau hinh van chuyen cho mot shop Viet Nam.
 *
 * Chay:
 *   npx medusa exec ./src/scripts/setup-vanchuyen.ts
 *
 * Script idempotent — chay lai nhieu lan khong tao trung. Dung cho cac shop
 * duoc tao bang import-shop (cellphones, farmersmarket) vi luong import chi
 * tao san pham + ton kho, khong tao fulfillment set nen khong dat hang duoc.
 */
export default async function setupVanChuyen({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
  const stockLocationModuleService = container.resolve(Modules.STOCK_LOCATION);
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL);
  const regionModuleService = container.resolve(Modules.REGION);

  const TEN_FULFILLMENT_SET = "Giao hang Viet Nam";
  const TEN_SERVICE_ZONE = "Viet Nam";

  const [stockLocation] = await stockLocationModuleService.listStockLocations(
    {},
    { take: 1 }
  );
  if (!stockLocation) {
    logger.error("Khong tim thay stock location — dung lai.");
    return;
  }

  const [region] = await regionModuleService.listRegions({}, { take: 1 });
  if (!region) {
    logger.error("Khong tim thay region — dung lai.");
    return;
  }

  const [salesChannel] = await salesChannelModuleService.listSalesChannels(
    {},
    { take: 1 }
  );

  const shippingProfiles = await fulfillmentModuleService.listShippingProfiles({
    type: "default",
  });
  const shippingProfile = shippingProfiles[0];
  if (!shippingProfile) {
    logger.error("Khong tim thay shipping profile mac dinh — dung lai.");
    return;
  }

  logger.info(
    `Shop: kho "${stockLocation.name}", region "${region.name}" (${region.currency_code})`
  );

  // 1. Kho phai duoc noi voi nha van chuyen, neu khong shipping option se
  //    khong bao gio hien ra o checkout.
  const providerLinks = await link.list({
    [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
    [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
  });
  if (!providerLinks.length) {
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
    });
    logger.info("Da noi kho voi nha van chuyen manual_manual.");
  } else {
    logger.info("Kho da noi voi nha van chuyen — bo qua.");
  }

  // 2. Fulfillment set + service zone phu quoc gia vn.
  const daCo = await fulfillmentModuleService.listFulfillmentSets(
    { name: TEN_FULFILLMENT_SET },
    { relations: ["service_zones"] }
  );

  let fulfillmentSet = daCo[0];
  if (fulfillmentSet) {
    logger.info(`Fulfillment set "${TEN_FULFILLMENT_SET}" da co — bo qua.`);
  } else {
    fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
      name: TEN_FULFILLMENT_SET,
      type: "shipping",
      service_zones: [
        {
          name: TEN_SERVICE_ZONE,
          geo_zones: [{ country_code: "vn", type: "country" }],
        },
      ],
    });
    logger.info(`Da tao fulfillment set "${TEN_FULFILLMENT_SET}" (vung vn).`);
  }

  const serviceZoneId = fulfillmentSet.service_zones[0].id;

  const setLinks = await link.list({
    [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
    [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
  });
  if (!setLinks.length) {
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
      [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
    });
    logger.info("Da noi kho voi fulfillment set.");
  }

  // 3. Hai phuong thuc giao hang, gia tinh theo region nen ra dung VND.
  const optionsHienCo = await fulfillmentModuleService.listShippingOptions({
    service_zone: { id: serviceZoneId },
  });
  const tenDaCo = new Set(optionsHienCo.map((o) => o.name));

  const muonTao = [
    {
      name: "Giao hang tieu chuan",
      gia: 30000,
      type: {
        label: "Tieu chuan",
        description: "Giao trong 2-3 ngay.",
        code: "standard",
      },
    },
    {
      name: "Giao hang nhanh",
      gia: 60000,
      type: {
        label: "Nhanh",
        description: "Giao trong 24 gio.",
        code: "express",
      },
    },
  ].filter((o) => !tenDaCo.has(o.name));

  if (!muonTao.length) {
    logger.info("Cac phuong thuc giao hang da co du — bo qua.");
  } else {
    await createShippingOptionsWorkflow(container).run({
      input: muonTao.map((o) => ({
        name: o.name,
        price_type: "flat" as const,
        provider_id: "manual_manual",
        service_zone_id: serviceZoneId,
        shipping_profile_id: shippingProfile.id,
        type: o.type,
        prices: [{ region_id: region.id, amount: o.gia }],
        rules: [
          { attribute: "enabled_in_store", value: "true", operator: "eq" as const },
          { attribute: "is_return", value: "false", operator: "eq" as const },
        ],
      })),
    });
    logger.info(
      `Da tao ${muonTao.length} phuong thuc giao hang: ${muonTao
        .map((o) => o.name)
        .join(", ")}`
    );
  }

  // 4. Kenh ban hang phai thay duoc kho thi ton kho moi tinh duoc.
  if (salesChannel) {
    await linkSalesChannelsToStockLocationWorkflow(container).run({
      input: { id: stockLocation.id, add: [salesChannel.id] },
    });
    logger.info(`Da noi kenh ban hang "${salesChannel.name}" voi kho.`);
  }

  logger.info("Xong cau hinh van chuyen.");
}
