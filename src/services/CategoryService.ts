import { ProtocolError, TimeoutError } from "puppeteer"
import { CategoryCollector } from "../automations"
import { SheetClient, DynamoCategoryClient } from "../db"
import { Account, RegionUrl } from "../entities"

export class CategoryService {
  constructor(
    private sheetClient: SheetClient,
    private categoryCollector: CategoryCollector,
    private dynamoCategoryClient: DynamoCategoryClient,
  ) {}
  async collect(account: Account, regionUrl: RegionUrl) {
    try {
      await this.categoryCollector.execute(account.id, account.pw, regionUrl.loginUrl, regionUrl.registerUrl)
    } catch (error) {
      console.error(error)
      if ( error instanceof ProtocolError || error instanceof TimeoutError) {
        return false
      }
      throw error
    }
    return true
  }

  async collectCategoryInfo() {
    const { account, regionUrl } = await this.sheetClient.getTestAccountAndRegionUrl()
    const result = await this.collect(account, regionUrl)
    if (!result) {
      return
    }
    const carManufacturerMap = this.categoryCollector.carManufacturerMap
    const carSegmentMap = this.categoryCollector.carSegmentMap

    const carSegmentResult = await this.dynamoCategoryClient.saveSegments(carSegmentMap)
    const carManufacturerResult = await this.dynamoCategoryClient.saveCompanies(carManufacturerMap)
    const carModelResult = await this.dynamoCategoryClient.saveModels(carManufacturerMap)
    const carDetailResult = await this.dynamoCategoryClient.saveDetailModels(carManufacturerMap)

    carSegmentResult.forEach(r => console.log(r))
    carManufacturerResult.forEach(r => console.log(r))
    carModelResult.forEach(r => console.log(r))
    carDetailResult.forEach(r => console.log(r))

  }
}
